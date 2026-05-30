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
// "last first" and "last first middle" candidate keys (sheet keys are last-first ordered).
function candidateKeys(o: Obit): string[] {
  const last = norm(o.last_name);
  const first = norm(o.first_name);
  const mid = norm(o.middle_name);
  if (!last || !first) return [];
  return mid ? [`${last} ${first} ${mid}`, `${last} ${first}`] : [`${last} ${first}`];
}
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
  for (const r of rows) { if (!byKey.has(r.k)) byKey.set(r.k, []); byKey.get(r.k)!.push(r); }

  const obits = await fetchAllObits();
  const stats = { obits: obits.length, matchedCases: 0, filledDod: 0, filledDob: 0, unmatched: 0, applied: 0 };

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
    if (!cands.length) { stats.unmatched++; continue; }
    stats.matchedCases++;

    for (const c of cands) {
      const newDod = !c.dod ? dod : null;
      const newDob = !c.dob && dob ? dob : null;
      if (!newDod && !newDob) continue;
      const ef: Record<string, boolean> = {};
      if (newDod) ef.date_of_death = true;
      if (newDob) ef.date_of_birth = true;
      if (apply) {
        await sql(
          `UPDATE operational_items
           SET date_of_death = coalesce($2, date_of_death),
               date_of_birth = coalesce($3, date_of_birth),
               edited_fields = edited_fields || $4::jsonb,
               updated_at = now()
           WHERE item_id = $1`,
          [c.item_id, newDod, newDob, JSON.stringify(ef)],
        );
        stats.applied++;
      }
      if (newDod) stats.filledDod++;
      if (newDob) stats.filledDob++;
    }
  }
  return stats;
}
