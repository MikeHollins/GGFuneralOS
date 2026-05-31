#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const registry = JSON.parse(readFileSync(join(root, 'dashboard/src/lib/source-field-registry.json'), 'utf8'));
const registryByKey = new Map(registry.map((entry) => [entry.key, entry]));
const systemKeys = new Set([
  '_row_number',
  'case_group_key',
  'case_match_key',
  'case_match_basis',
  'case_year',
  'identity_status',
  'identity_basis',
  'cremation_number',
  'dc_number',
  'mokan_number',
]);

function loadEnv() {
  const path = join(root, '.env');
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function destinationFor(key) {
  const def = registryByKey.get(key);
  if (def) return def.destination;
  if (/^column_\d+$/.test(key) || key === 'harvea2') return 'source_evidence';
  if (key.startsWith('to_search_')) return 'ignored';
  if (systemKeys.has(key)) return 'source_evidence';
  return 'unclassified';
}

function categoryFor(key) {
  const def = registryByKey.get(key);
  if (def) return def.category;
  if (key.startsWith('to_search_')) return 'system';
  if (/^column_\d+$/.test(key) || key === 'harvea2') return 'unknown';
  if (systemKeys.has(key)) return 'system';
  return 'unknown';
}

function labelFor(key) {
  return registryByKey.get(key)?.label || key.replace(/^_/, '').replace(/_/g, ' ');
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function topFields(fields, destination, limit = 10) {
  return fields
    .filter((field) => field.destination === destination)
    .slice(0, limit)
    .map((field) => `${field.key} (${field.filled})`)
    .join(', ') || 'none';
}

loadEnv();
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured; set it or run from a checkout with .env.');
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);

const latest = await sql`
  SELECT status, raw_row_count::int, parsed_item_count::int, archived_row_count::int, read_sheets,
         started_at::text, finished_at::text, error_message
  FROM source_sheet_sync_runs
  ORDER BY started_at DESC
  LIMIT 1
`;

const sources = await sql`
  SELECT source, area, count(*)::int AS items,
         count(distinct coalesce(source_payload->>'case_group_key', source_payload->>'case_match_key'))::int AS cases,
         count(date_of_birth)::int AS dob_items,
         count(date_of_death)::int AS dod_items,
         count(source_case_number)::int AS case_number_items
  FROM operational_items
  WHERE source_origin = 'google-sheet'
    AND is_archived = false
  GROUP BY source, area
  ORDER BY source
`;

const fieldRows = await sql`
  SELECT source, key, count(*)::int AS filled
  FROM operational_items
  CROSS JOIN LATERAL jsonb_each_text(source_payload) AS e(key, value)
  WHERE source_origin = 'google-sheet'
    AND is_archived = false
    AND nullif(trim(value), '') IS NOT NULL
  GROUP BY source, key
  ORDER BY source, filled DESC, key
`;

const rawRows = await sql`
  SELECT sheet_name, count(*)::int AS raw_rows,
         count(*) FILTER (WHERE parse_status = 'parsed')::int AS parsed_rows,
         count(*) FILTER (WHERE is_archived)::int AS archived_rows
  FROM source_sheet_rows
  GROUP BY sheet_name
  ORDER BY sheet_name
`;

const bySource = new Map();
for (const source of sources) {
  bySource.set(source.source, { ...source, fields: [] });
}
for (const row of fieldRows) {
  if (!bySource.has(row.source)) bySource.set(row.source, { source: row.source, area: '', items: 0, cases: 0, fields: [] });
  bySource.get(row.source).fields.push({
    key: row.key,
    label: labelFor(row.key),
    category: categoryFor(row.key),
    destination: destinationFor(row.key),
    filled: row.filled,
    editable: Boolean(registryByKey.get(row.key)?.editable),
  });
}

const unclassified = fieldRows
  .filter((row) => destinationFor(row.key) === 'unclassified')
  .map((row) => ({ source: row.source, key: row.key, filled: row.filled }));

const report = {
  generated_at: new Date().toISOString(),
  latest_sync: latest[0] ?? null,
  source_rows: rawRows,
  sources: Array.from(bySource.values()),
  unclassified,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const lines = [];
  lines.push('# Master Sheet Parity Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  if (report.latest_sync) {
    lines.push(`Latest sync: ${report.latest_sync.status}, raw ${report.latest_sync.raw_row_count}, parsed ${report.latest_sync.parsed_item_count}, finished ${report.latest_sync.finished_at}`);
  }
  lines.push('');
  lines.push('## Source Coverage');
  lines.push('');
  lines.push('| Source | Area | Items | Cases | DOB items | DOD items | Case # items | Drawer fields | Evidence-only fields | Unclassified |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const source of report.sources) {
    const fields = source.fields ?? [];
    lines.push([
      escapeMd(source.source),
      escapeMd(source.area),
      source.items,
      source.cases,
      source.dob_items,
      source.dod_items,
      source.case_number_items,
      escapeMd(topFields(fields, 'drawer')),
      escapeMd(topFields(fields, 'source_evidence')),
      fields.filter((field) => field.destination === 'unclassified').length,
    ].join(' | '));
  }
  lines.push('');
  lines.push('## Unclassified Filled Fields');
  lines.push('');
  if (report.unclassified.length) {
    for (const row of report.unclassified) lines.push(`- ${row.source}: ${row.key} (${row.filled})`);
  } else {
    lines.push('None. Every filled source field is classified as grid, drawer, source evidence, ignored, or system.');
  }
  console.log(lines.join('\n'));
}

const outArg = process.argv.find((arg) => arg.startsWith('--out='));
if (outArg) {
  writeFileSync(resolve(root, outArg.slice('--out='.length)), JSON.stringify(report, null, 2));
}

if (process.argv.includes('--fail-on-unclassified') && report.unclassified.length) {
  console.error(`Found ${report.unclassified.length} unclassified filled source fields.`);
  process.exit(1);
}
