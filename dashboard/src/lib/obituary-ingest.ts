import { getSql } from './db';

// Golden Gate's public obituary data (Tukios) carries BOTH date_of_birth and date_of_death for every
// published case, including current ones — the cleanest source to fill the grid's DOB/Transition
// boxes. Public HTTP API (the same one their own website's widget calls), so this runs cloud-side
// (Vercel cron) with no SMB mount. We only READ it and write our own Neon (fill-only-empty, audited
// via edited_fields). The token + site alias are the public widget values baked into their site JS.
const TUKIOS_BASE = 'https://websites.tukios.com/api/v1';
const TUKIOS_TOKEN = process.env.TUKIOS_TOKEN || 'k9PMgGzdKda2PGocioyUBzAtVwFj7FsKZlpxORi6';
const SITE_ALIAS = process.env.TUKIOS_SITE_ALIAS || '398cdf00';

type Obit = { first_name?: string; middle_name?: string; last_name?: string; date_of_birth?: string | null; date_of_death?: string | null };

// Normalize a name token to match dashboard/case-identity caseMatchKey output. Strips parenthesized
// maiden names ("Turner(Mathis)" -> "turner") and treats hyphens/punctuation as spaces.
function norm(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// "last first", "last first middle", and "last first <middle-initial>" candidate keys (sheet keys are
// last-first ordered; the sheet often records only a middle initial where the obit has the full name).
function candidateKeys(o: Obit): string[] {
  const last = norm(o.last_name);
  const first = norm(o.first_name);
  const mid = norm(o.middle_name);
  if (!last || !first) return [];
  if (!mid) return [`${last} ${first}`];
  return [`${last} ${first} ${mid}`, `${last} ${first} ${mid[0]}`, `${last} ${first}`];
}
// Generational suffixes are match noise: the obit may carry "Smith Jr" where the sheet has plain
// "Smith" (or vice versa). Stripping them lets the two reconcile — but only when UNAMBIGUOUS (see below),
// so a father (Sr) and son (Jr) who died the same year never cross-fill.
const SUFFIX_RE = /\b(jr|sr|ii|iii|iv|v)\b/g;
const stripSuffix = (k: string): string => k.replace(SUFFIX_RE, ' ').replace(/\s+/g, ' ').trim();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function fetchAllObits(): Promise<Obit[]> {
  const out: Obit[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await fetch(`${TUKIOS_BASE}/obituaries?siteAlias=${SITE_ALIAS}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${TUKIOS_TOKEN}` },
    });
    if (!res.ok) break;
    const json: any = await res.json();
    lastPage = Number(json.last_page) || 1;
    for (const o of json.data ?? []) out.push(o);
    page += 1;
  } while (page <= lastPage && page <= 2000);
  return out;
}

export async function syncObituaries({ apply = false }: { apply?: boolean } = {}) {
  const sql = getSql();
  const rows = (await sql(
    `SELECT item_id, source_payload->>'case_match_key' AS k, source_payload->>'case_year' AS y,
            coalesce(date_of_birth,'') AS dob, coalesce(date_of_death,'') AS dod
     FROM operational_items
     WHERE is_archived = false AND coalesce(source_payload->>'case_match_key','') <> ''`,
  )) as any[];
  const byKey = new Map<string, any[]>();
  const suffixBuckets = new Map<string, Set<string>>(); // suffix-stripped key -> set of raw case_match_keys
  for (const r of rows) {
    if (!byKey.has(r.k)) byKey.set(r.k, []);
    byKey.get(r.k)!.push(r);
    const sk = stripSuffix(r.k);
    if (!suffixBuckets.has(sk)) suffixBuckets.set(sk, new Set());
    suffixBuckets.get(sk)!.add(r.k);
  }

  const obits = await fetchAllObits();
  const stats = { obits: obits.length, matchedCases: 0, recoveredSuffix: 0, filledDod: 0, filledDob: 0, unmatched: 0, applied: 0 };
  const updates: Array<{ item_id: string; dod: string | null; dob: string | null; ef: Record<string, boolean> }> = [];

  for (const o of obits) {
    const dod = (o.date_of_death ?? '').trim();
    if (!ISO.test(dod)) continue; // need a death-year to match a case
    const year = dod.slice(0, 4);
    const dob = ISO.test((o.date_of_birth ?? '').trim()) ? (o.date_of_birth as string).trim() : null;

    let cands: any[] = [];
    for (const key of candidateKeys(o)) {
      const c = (byKey.get(key) || []).filter((r) => !r.y || r.y === year);
      if (c.length) { cands = c; break; }
    }
    if (!cands.length) {
      // Suffix-normalized fallback: reconcile "Smith Jr" <-> "Smith" — but only when the stripped name
      // resolves to exactly ONE case in that death-year (fail-closed; never cross-fill Jr vs Sr).
      const last = norm(o.last_name); const first = norm(o.first_name);
      const stripped = stripSuffix(`${last} ${first}`);
      const rawKeys = [...(suffixBuckets.get(stripped) || [])].filter((rk) =>
        (byKey.get(rk) || []).some((r) => !r.y || r.y === year),
      );
      if (rawKeys.length === 1) {
        cands = (byKey.get(rawKeys[0]) || []).filter((r) => !r.y || r.y === year);
        if (cands.length) stats.recoveredSuffix++;
      }
    }
    if (!cands.length) { stats.unmatched++; continue; }
    stats.matchedCases++;

    for (const c of cands) {
      const newDod = !c.dod ? dod : null;
      const newDob = !c.dob && dob ? dob : null;
      if (!newDod && !newDob) continue;
      const ef: Record<string, boolean> = {};
      if (newDod) { ef.date_of_death = true; stats.filledDod++; }
      if (newDob) { ef.date_of_birth = true; stats.filledDob++; }
      updates.push({ item_id: c.item_id, dod: newDod, dob: newDob, ef });
    }
  }

  // Bulk-apply in chunks so thousands of fills run in ~tens of statements (not one per row, which
  // timed out the serverless function). coalesce() keeps any existing value (fill-only-empty).
  if (apply) {
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500);
      await sql(
        `UPDATE operational_items o
         SET date_of_death = coalesce(u.dod, o.date_of_death),
             date_of_birth = coalesce(u.dob, o.date_of_birth),
             edited_fields = o.edited_fields || u.ef,
             updated_at = now()
         FROM jsonb_to_recordset($1::jsonb) AS u(item_id text, dod text, dob text, ef jsonb)
         WHERE o.item_id = u.item_id`,
        [JSON.stringify(chunk)],
      );
      stats.applied += chunk.length;
    }
  }
  return stats;
}
