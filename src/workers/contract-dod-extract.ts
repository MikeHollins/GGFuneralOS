/**
 * READ-ONLY ingester: pull DATE OF DEATH (+ deceased name) from Golden Gate's Contract PDFs in
 * `_Dawn's Active Docs`, match each to an existing case by name + death-year, and (with --apply)
 * backfill operational_items.date_of_death in OUR Neon — audited via edited_fields, fills only
 * EMPTY DODs, never written back to their files.
 *
 * CHANGE DETECTION: by default only processes files that are NEW or whose mtime changed since the
 * last run (tracked in source_doc_ingest), so the scheduled poller is cheap. Pass --all to force a
 * full pass. Dry-run unless --apply. Reads their files read-only; writes only our Neon.
 *
 *   npx tsx src/workers/contract-dod-extract.ts [--apply] [--all] [--limit=N]
 *
 * Name normalization MUST stay identical to dashboard/src/lib/case-identity.ts:caseMatchKey.
 */
import { execFile } from 'child_process';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { neon } from '@neondatabase/serverless';

const execFileAsync = promisify(execFile);
const DOCS_DIR = process.env.GGFC_DOCS_DIR || "/Volumes/Common/_Dawn's Active Docs";
const APPLY = process.argv.includes('--apply');
const FORCE_ALL = process.argv.includes('--all');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity;

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
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
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
async function extractContract(file: string): Promise<{ name: string | null; dodIso: string | null }> {
  try {
    const { stdout } = await execFileAsync('pdftotext', [file, '-'], { maxBuffer: 16 * 1024 * 1024 });
    const nameM = stdout.match(/DECEASED\s+([A-Za-z][^\n]*)/);
    const dodM = stdout.match(/DATE OF DEATH\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    return { name: nameM ? nameM[1].trim() : null, dodIso: dodM ? mmddyyyyToIso(dodM[1]) : null };
  } catch {
    return { name: null, dodIso: null };
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = neon(url);

  const rows = (await sql(
    `SELECT item_id, source_payload->>'case_match_key' AS k, source_payload->>'case_year' AS y,
            coalesce(date_of_death,'') AS dod
     FROM operational_items
     WHERE is_archived = false AND coalesce(source_payload->>'case_match_key','') <> ''`,
  )) as any[];
  const byKey = new Map<string, any[]>();
  for (const r of rows) { (byKey.get(r.k) ?? byKey.set(r.k, []).get(r.k))!.push(r); }

  // Last-seen mtime per file (change detection).
  const seenRows = (await sql(
    `SELECT relative_path, extract(epoch from mtime)::bigint AS mtime FROM source_doc_ingest WHERE source_root = $1`,
    [DOCS_DIR],
  )) as any[];
  const seen = new Map<string, number>(seenRows.map((r) => [r.relative_path, Number(r.mtime)]));

  let files = (await readdir(DOCS_DIR)).filter((f) => /Contract\.pdf$/i.test(f));
  if (LIMIT !== Infinity) files = files.slice(0, LIMIT);

  const stats = { listed: files.length, skippedUnchanged: 0, processed: 0, withDod: 0, matchedCases: 0, wouldFill: 0, applied: 0, unmatched: 0, ambiguous: 0 };

  for (const f of files) {
    const full = path.join(DOCS_DIR, f);
    let mtime = 0;
    try { mtime = Math.floor((await stat(full)).mtimeMs / 1000); } catch { continue; }
    if (!FORCE_ALL && seen.get(f) === mtime) { stats.skippedUnchanged++; continue; }

    stats.processed++;
    const { name, dodIso } = await extractContract(full);
    let matchedKey: string | null = null;
    let applied = false;
    if (name && dodIso) {
      stats.withDod++;
      const key = caseKeyFromContractName(name);
      const year = dodIso.slice(0, 4);
      const cands = (byKey.get(key) || []).filter((r) => !r.y || r.y === year);
      if (cands.length === 0) stats.unmatched++;
      else if (new Set(cands.map((c) => c.y)).size > 1) stats.ambiguous++;
      else {
        matchedKey = `${key}|${year}`;
        stats.matchedCases++;
        for (const c of cands) {
          if (c.dod) continue;
          stats.wouldFill++;
          if (APPLY) {
            // Enrichment, not a staff edit: do NOT flag edited_fields, so a real upstream DOD (if
            // Golden Gate ever adds one) can supersede this. fill-only-empty (the WHERE guard) + the
            // sync's keep-existing-when-incoming-empty rule preserve it across re-syncs.
            await sql(
              `UPDATE operational_items SET date_of_death = $2, updated_at = now()
               WHERE item_id = $1 AND coalesce(date_of_death,'') = ''`,
              [c.item_id, dodIso],
            );
            stats.applied++; applied = true;
          }
        }
      }
    }
    // Record what we saw so the next run skips it unless it changes again.
    await sql(
      `INSERT INTO source_doc_ingest (source_root, relative_path, doc_type, mtime, deceased_name, parsed, matched_case_key, applied, last_run_at)
       VALUES ($1,$2,'contract', to_timestamp($3), $4, $5::jsonb, $6, $7, now())
       ON CONFLICT (source_root, relative_path) DO UPDATE SET
         mtime = EXCLUDED.mtime, deceased_name = EXCLUDED.deceased_name, parsed = EXCLUDED.parsed,
         matched_case_key = EXCLUDED.matched_case_key, applied = source_doc_ingest.applied OR EXCLUDED.applied,
         last_run_at = now()`,
      [DOCS_DIR, f, mtime, name, JSON.stringify({ dod: dodIso }), matchedKey, applied],
    );
  }

  console.log(`[ggfc-doc-ingest ${APPLY ? 'APPLY' : 'DRY'}${FORCE_ALL ? ' ALL' : ''}] listed=${stats.listed} skipped_unchanged=${stats.skippedUnchanged} processed=${stats.processed} with_dod=${stats.withDod} matched=${stats.matchedCases} filled=${stats.applied}/${stats.wouldFill} unmatched=${stats.unmatched} ambiguous=${stats.ambiguous}`);
}

main().catch((e) => { console.error('ERROR', e instanceof Error ? e.message : e); process.exit(1); });
