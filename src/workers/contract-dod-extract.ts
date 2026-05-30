/**
 * READ-ONLY ingester: pull DATE OF DEATH (and deceased name) from Golden Gate's Contract PDFs in
 * `_Dawn's Active Docs`, match each to an existing case by name + death-year, and (only with
 * --apply) backfill operational_items.date_of_death in OUR Neon — audited, edited_fields-protected,
 * never written back to their files. Dry-run by default (reports matches, writes nothing).
 *
 * Usage:
 *   npx tsx src/workers/contract-dod-extract.ts [--limit N] [--apply]
 *
 * Reads their files read-only (pdftotext to stdout); writes only our Neon. The deceased-name
 * normalization MUST stay identical to dashboard/src/lib/case-identity.ts:caseMatchKey.
 */
import { execFile } from 'child_process';
import { readdir } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { neon } from '@neondatabase/serverless';

const execFileAsync = promisify(execFile);
const DOCS_DIR = process.env.GGFC_DOCS_DIR || "/Volumes/Common/_Dawn's Active Docs";
const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity;

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Mirror of dashboard caseMatchKey normalization (lowercase, non-alphanumeric -> space, collapse).
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Contract prints "First [Middle] Last [Suffix]"; sheet keys are "last first [middle] [suffix]".
// Reorder to the sheet form so the keys line up.
function caseKeyFromContractName(fullName: string): string {
  const toks = normalizeName(fullName).split(' ').filter(Boolean);
  if (!toks.length) return '';
  let suffix = '';
  if (SUFFIXES.has(toks[toks.length - 1])) suffix = toks.pop() as string;
  if (!toks.length) return '';
  const surname = toks.pop() as string;
  return [surname, ...toks, suffix].filter(Boolean).join(' ');
}
function mmddyyyyToIso(d: string): string | null {
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, da, yr] = m;
  return `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
}

async function extractContract(file: string): Promise<{ name: string | null; dodIso: string | null }> {
  try {
    const { stdout } = await execFileAsync('pdftotext', [file, '-'], { maxBuffer: 16 * 1024 * 1024 });
    const nameM = stdout.match(/DECEASED\s+([A-Za-z][^\n]*)/);
    const dodM = stdout.match(/DATE OF DEATH\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const name = nameM ? nameM[1].trim() : null;
    const dodIso = dodM ? mmddyyyyToIso(dodM[1]) : null;
    return { name, dodIso };
  } catch {
    return { name: null, dodIso: null };
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  // Existing cases keyed by name + year (only non-first-call sheet rows are candidates to enrich).
  const rows = (await sql(
    `SELECT item_id,
            source_payload->>'case_match_key' AS k,
            source_payload->>'case_year' AS y,
            coalesce(date_of_death,'') AS dod,
            (edited_fields ? 'date_of_death') AS dod_edited
     FROM operational_items
     WHERE is_archived = false AND coalesce(source_payload->>'case_match_key','') <> ''`,
  )) as any[];
  const byKey = new Map<string, any[]>();
  for (const r of rows) {
    if (!byKey.has(r.k)) byKey.set(r.k, []);
    byKey.get(r.k)!.push(r);
  }

  let files = (await readdir(DOCS_DIR)).filter((f) => /Contract\.pdf$/i.test(f));
  files = files.slice(0, LIMIT === Infinity ? files.length : LIMIT);

  const stats = { processed: 0, withName: 0, withDod: 0, matchedCases: 0, alreadyHadDod: 0, wouldFill: 0, applied: 0, ambiguous: 0, unmatched: 0 };
  const samples: string[] = [];
  const updates: Array<{ item_id: string; iso: string; name: string }> = [];

  for (const f of files) {
    stats.processed++;
    const { name, dodIso } = await extractContract(path.join(DOCS_DIR, f));
    if (name) stats.withName++;
    if (dodIso) stats.withDod++;
    if (!name || !dodIso) continue;

    const key = caseKeyFromContractName(name);
    const year = dodIso.slice(0, 4);
    const candidates = (byKey.get(key) || []).filter((r) => !r.y || r.y === year);

    if (candidates.length === 0) { stats.unmatched++; continue; }
    if (new Set(candidates.map((c) => c.item_id)).size > 1 && new Set(candidates.map((c) => c.y)).size > 1) {
      // matches across multiple distinct years -> ambiguous, skip to stay fail-closed
      stats.ambiguous++;
      continue;
    }
    stats.matchedCases++;
    for (const c of candidates) {
      if (c.dod) { stats.alreadyHadDod++; continue; }
      stats.wouldFill++;
      updates.push({ item_id: c.item_id, iso: dodIso, name });
      if (samples.length < 15) samples.push(`  ${name}  ->  ${key}|${year}  DOD ${dodIso}  (item ${c.item_id.slice(0, 22)})`);
    }
  }

  if (APPLY && updates.length) {
    for (const u of updates) {
      await sql(
        `UPDATE operational_items
         SET date_of_death = $2,
             edited_fields = edited_fields || '{"date_of_death": true}'::jsonb,
             updated_at = now()
         WHERE item_id = $1 AND coalesce(date_of_death,'') = ''`,
        [u.item_id, u.iso],
      );
      stats.applied++;
    }
  }

  console.log(`\n=== Contract DOD extract (${APPLY ? 'APPLY' : 'DRY RUN'}) — dir: ${DOCS_DIR} ===`);
  console.log(`contracts processed:        ${stats.processed}`);
  console.log(`  with deceased name:       ${stats.withName}`);
  console.log(`  with DATE OF DEATH:       ${stats.withDod}`);
  console.log(`matched to an existing case:${stats.matchedCases}`);
  console.log(`  already had a DOD:        ${stats.alreadyHadDod}`);
  console.log(`  WOULD fill DOD:           ${stats.wouldFill}${APPLY ? ` (applied: ${stats.applied})` : ''}`);
  console.log(`ambiguous (multi-year):     ${stats.ambiguous}`);
  console.log(`unmatched (no case+year):   ${stats.unmatched}`);
  console.log(`\nsample of fills:\n${samples.join('\n') || '  (none)'}`);
}

main().catch((e) => { console.error('ERROR', e instanceof Error ? e.message : e); process.exit(1); });
