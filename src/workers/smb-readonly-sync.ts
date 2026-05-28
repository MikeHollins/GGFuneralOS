import path from 'path';
import type { Dirent } from 'fs';
import { lstat, readdir } from 'fs/promises';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { sql } from '../db/client';

type SourceFileRow = {
  source_origin: 'smb';
  source_root: string;
  relative_path: string;
  parent_path: string;
  name: string;
  item_type: 'directory' | 'file' | 'other';
  extension: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  metadata: Record<string, string | number | boolean>;
};

const ignoredNames = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '$RECYCLE.BIN', 'System Volume Information']);
const defaultIncludedTopLevels = [
  '_PDF Programs',
  '_Publisher Programs',
  '_Pictures',
  '_Register Books',
  '_Lobby Docs',
  '_Lobby TV Videos',
  '_Videos',
  'Amendment Forms',
  'Atneed Folders',
  'Cremation Authorization',
  'Funeral Packages',
  'MOKAN CREMATIONS',
  'Tracker',
];

const execFileAsync = promisify(execFile);

function envInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredRoot() {
  return process.env.GGFC_COMMON_ROOT || process.env.GGFC_SMB_ROOT || '';
}

function requireReadOnlyMount() {
  return process.env.GGFC_SMB_REQUIRE_READONLY !== 'false';
}

function includedTopLevels() {
  const configured = process.env.GGFC_SMB_INCLUDE_DIRS;
  if (!configured) return defaultIncludedTopLevels;
  return configured
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function topLevelPath(relativePath: string) {
  return relativePath.split('/').filter(Boolean)[0] ?? '';
}

function hashId(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function caseMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\b(panel|program|booklet|register|copy|final|draft|new)\b/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapToOperations() {
  return process.env.GGFC_SMB_MAP_TO_OPERATIONS !== 'false';
}

function areaForTopLevel(topLevel: string) {
  if (topLevel === 'MOKAN CREMATIONS') return 'crematory';
  if (topLevel.includes('Program') || topLevel.includes('Picture') || topLevel.includes('Lobby') || topLevel.includes('Register') || topLevel === '_Videos') return 'production';
  return 'paperwork';
}

function ownerForArea(area: string) {
  if (area === 'production') return 'Design';
  if (area === 'crematory') return 'Crematory';
  return 'Staff';
}

function statusForArea(area: string) {
  if (area === 'production') return 'Proof ready';
  if (area === 'crematory') return 'Scheduled';
  return 'Received';
}

function optionsForArea(area: string) {
  if (area === 'production') return ['Needed', 'In design', 'Proof ready', 'Approved', 'Printed', 'Published'];
  if (area === 'crematory') return ['Permit needed', 'Scheduled', 'In process', 'Completed', 'Returned'];
  return ['Missing', 'Requested', 'Received', 'Verified'];
}

function modifiedLabel(value: string | null) {
  if (!value) return 'Modified date unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Modified date unknown';
  return `Modified ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

async function assertReadOnlyMount(root: string) {
  if (!requireReadOnlyMount()) return;

  const { stdout } = await execFileAsync('/sbin/mount');
  const resolvedRoot = path.resolve(root);
  const lines = stdout.split('\n').filter((line) => line.includes('smbfs'));
  const mountLine = lines.find((line) => {
    const match = line.match(/ on (.+?) \((.+)\)$/);
    if (!match) return false;
    const mountPoint = match[1];
    return resolvedRoot === mountPoint || resolvedRoot.startsWith(`${mountPoint}${path.sep}`);
  });

  if (!mountLine) {
    throw new Error('Configured SMB root is not an smbfs mount. Refusing to scan without a read-only SMB mount.');
  }
  if (!mountLine.includes('read-only')) {
    throw new Error('Configured SMB mount is not read-only. Refusing to scan.');
  }
}

async function scanDirectory(root: string, relativeDir: string, depth: number, maxDepth: number, rows: SourceFileRow[], maxItems: number) {
  if (rows.length >= maxItems || depth > maxDepth) return;

  const absoluteDir = path.join(root, relativeDir);
  let entries: Dirent[];
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (rows.length >= maxItems) return;
    if (ignoredNames.has(entry.name)) continue;

    const relativePath = toPosixPath(path.join(relativeDir, entry.name));
    const absolutePath = path.join(root, relativePath);
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch {
      continue;
    }
    const itemType = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';

    rows.push({
      source_origin: 'smb',
      source_root: root,
      relative_path: relativePath,
      parent_path: toPosixPath(relativeDir),
      name: entry.name,
      item_type: itemType,
      extension: itemType === 'file' ? path.extname(entry.name).toLowerCase() || null : null,
      size_bytes: itemType === 'file' ? stats.size : null,
      modified_at: stats.mtime ? stats.mtime.toISOString() : null,
      metadata: {
        depth,
        symlink: stats.isSymbolicLink(),
      },
    });

    if (itemType === 'directory') {
      await scanDirectory(root, relativePath, depth + 1, maxDepth, rows, maxItems);
    }
  }
}

async function upsertRows(rows: SourceFileRow[]) {
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await sql(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           source_origin text,
           source_root text,
           relative_path text,
           parent_path text,
           name text,
           item_type text,
           extension text,
           size_bytes bigint,
           modified_at timestamptz,
           metadata jsonb
         )
       )
       INSERT INTO source_file_items
         (source_origin, source_root, relative_path, parent_path, name, item_type, extension, size_bytes, modified_at, metadata, seen_at, is_archived, updated_at)
       SELECT
         source_origin, source_root, relative_path, parent_path, name, item_type, extension, size_bytes, modified_at, metadata, now(), false, now()
       FROM incoming
       ON CONFLICT (source_origin, source_root, relative_path) DO UPDATE SET
         parent_path = EXCLUDED.parent_path,
         name = EXCLUDED.name,
         item_type = EXCLUDED.item_type,
         extension = EXCLUDED.extension,
         size_bytes = EXCLUDED.size_bytes,
         modified_at = EXCLUDED.modified_at,
         metadata = EXCLUDED.metadata,
         seen_at = now(),
         is_archived = false,
         updated_at = now()`,
      [JSON.stringify(chunk)],
    );
  }
}

async function archiveMissing(root: string, activePaths: string[], includedRoots: string[]) {
  if (!activePaths.length) return 0;
  if (!includedRoots.length) {
    const rows = await sql(
      `UPDATE source_file_items
       SET is_archived = true, updated_at = now()
       WHERE source_origin = 'smb'
         AND source_root = $1
         AND is_archived = false
         AND NOT (relative_path = ANY($2::text[]))
       RETURNING id`,
      [root, activePaths],
    );
    return rows.length;
  }

  const rows = await sql(
    `UPDATE source_file_items
     SET is_archived = true, updated_at = now()
     WHERE source_origin = 'smb'
       AND source_root = $1
       AND is_archived = false
       AND split_part(relative_path, '/', 1) = ANY($3::text[])
       AND NOT (relative_path = ANY($2::text[]))
     RETURNING id`,
    [root, activePaths, includedRoots],
  );
  return rows.length;
}

async function upsertOperationalItems(rows: SourceFileRow[], root: string, includedRoots: string[]) {
  if (!mapToOperations()) return { mapped: 0, archived: 0 };

  const eligibleRows = rows.filter((row) => row.item_type === 'file' || row.metadata.scan_root);
  if (!eligibleRows.length) return { mapped: 0, archived: 0 };

  const items = eligibleRows.map((row) => {
    const topLevel = topLevelPath(row.relative_path);
    const area = areaForTopLevel(topLevel);
    const extension = row.extension ? row.extension.replace('.', '').toUpperCase() : 'Folder';
    return {
      item_id: `smb-${hashId(`${root}:${row.relative_path}`)}`,
      area,
      label: row.item_type === 'file' ? path.basename(row.name, row.extension ?? '') : row.name,
      detail: [
        'Read-only server metadata.',
        `Folder: ${row.parent_path || topLevel || 'Common'}.`,
        row.item_type === 'file' ? `Type: ${extension}.` : 'Type: Folder.',
        row.size_bytes ? `Size: ${row.size_bytes} bytes.` : '',
      ].filter(Boolean).join(' '),
      owner: ownerForArea(area),
      due_text: modifiedLabel(row.modified_at),
      source: `SMB: ${topLevel || 'Common'}`,
      status_default: statusForArea(area),
      priority: 'normal',
      options: optionsForArea(area),
      source_ref: row.relative_path,
      source_payload: {
        relative_path: row.relative_path,
        parent_path: row.parent_path,
        name: row.name,
        item_type: row.item_type,
        extension: row.extension ?? '',
        size_bytes: row.size_bytes?.toString() ?? '',
        modified_at: row.modified_at ?? '',
        top_level: topLevel,
        case_match_key: caseMatchKey(row.name),
        case_match_basis: 'server filename',
      },
      source_content_hash: hashId(JSON.stringify(row)),
    };
  });

  const chunkSize = 500;
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await sql(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           item_id text,
           area text,
           label text,
           detail text,
           owner text,
           due_text text,
           source text,
           status_default text,
           priority text,
           options jsonb,
           source_ref text,
           source_payload jsonb,
           source_content_hash text
         )
       )
       INSERT INTO operational_items
         (item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
          source_origin, source_ref, source_payload, source_seen_at, source_content_hash, updated_at)
       SELECT
         item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
         'smb', source_ref, source_payload, now(), source_content_hash, now()
       FROM incoming
       ON CONFLICT (item_id) DO UPDATE SET
         area = EXCLUDED.area,
         label = CASE WHEN operational_items.edited_fields ? 'label' THEN operational_items.label ELSE EXCLUDED.label END,
         detail = CASE WHEN operational_items.edited_fields ? 'detail' THEN operational_items.detail ELSE EXCLUDED.detail END,
         owner = CASE WHEN operational_items.edited_fields ? 'owner' THEN operational_items.owner ELSE EXCLUDED.owner END,
         due_text = CASE WHEN operational_items.edited_fields ? 'due' THEN operational_items.due_text ELSE EXCLUDED.due_text END,
         source = EXCLUDED.source,
         status_default = EXCLUDED.status_default,
         priority = CASE WHEN operational_items.edited_fields ? 'priority' THEN operational_items.priority ELSE EXCLUDED.priority END,
         options = EXCLUDED.options,
         source_origin = 'smb',
         source_ref = EXCLUDED.source_ref,
         source_payload = EXCLUDED.source_payload,
         source_seen_at = now(),
         source_content_hash = EXCLUDED.source_content_hash,
         is_archived = false,
         updated_at = now()`,
      [JSON.stringify(chunk)],
    );
  }

  const activeRefs = items.map((item) => item.source_ref);
  const archivedRows = await sql(
    `UPDATE operational_items
     SET is_archived = true, updated_at = now()
     WHERE source_origin = 'smb'
       AND is_archived = false
       AND split_part(source_ref, '/', 1) = ANY($2::text[])
       AND NOT (source_ref = ANY($1::text[]))
     RETURNING item_id`,
    [activeRefs, includedRoots],
  );

  return { mapped: items.length, archived: archivedRows.length };
}

async function main() {
  const root = configuredRoot();
  if (!root) throw new Error('Set GGFC_COMMON_ROOT or GGFC_SMB_ROOT to a mounted SMB folder before running this read-only sync.');

  const resolvedRoot = path.resolve(root);
  const rootStats = await lstat(resolvedRoot);
  if (!rootStats.isDirectory()) throw new Error('Configured SMB root is not a directory.');
  await assertReadOnlyMount(resolvedRoot);

  const maxDepth = envInt('GGFC_SMB_MAX_DEPTH', 2);
  const maxItems = envInt('GGFC_SMB_MAX_ITEMS', 2500);
  const rootsToScan = includedTopLevels();
  const rows: SourceFileRow[] = [];
  const scannedRoots: string[] = [];

  for (const entry of rootsToScan) {
    if (rows.length >= maxItems) break;
    try {
      const stats = await lstat(path.join(resolvedRoot, entry));
      if (!stats.isDirectory()) continue;
      scannedRoots.push(entry);
      rows.push({
        source_origin: 'smb',
        source_root: resolvedRoot,
        relative_path: toPosixPath(entry),
        parent_path: '',
        name: entry,
        item_type: 'directory',
        extension: null,
        size_bytes: null,
        modified_at: stats.mtime ? stats.mtime.toISOString() : null,
        metadata: {
          depth: 0,
          scan_root: true,
          symlink: stats.isSymbolicLink(),
        },
      });
      await scanDirectory(resolvedRoot, entry, 1, maxDepth, rows, maxItems);
    } catch {
      continue;
    }
  }

  await upsertRows(rows);
  const archived = await archiveMissing(resolvedRoot, rows.map((row) => row.relative_path), scannedRoots);
  const operational = await upsertOperationalItems(rows, resolvedRoot, scannedRoots);

  const fileCount = rows.filter((row) => row.item_type === 'file').length;
  const directoryCount = rows.filter((row) => row.item_type === 'directory').length;
  const rootCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const topLevel = topLevelPath(row.relative_path);
    if (topLevel) counts[topLevel] = (counts[topLevel] ?? 0) + 1;
    return counts;
  }, {});
  const extensionCounts = rows.reduce<Record<string, number>>((counts, row) => {
    if (row.extension) counts[row.extension] = (counts[row.extension] ?? 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    source: 'smb',
    mode: 'read_only_metadata',
    root_configured: true,
    scanned: rows.length,
    files: fileCount,
    directories: directoryCount,
    archived,
    operational_mapped: operational.mapped,
    operational_archived: operational.archived,
    max_depth: maxDepth,
    max_items: maxItems,
    included_roots: rootsToScan,
    scanned_roots: scannedRoots,
    roots: Object.fromEntries(Object.entries(rootCounts).sort((a, b) => b[1] - a[1])),
    extensions: Object.fromEntries(Object.entries(extensionCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)),
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SMB read-only sync failed');
  process.exit(1);
});
