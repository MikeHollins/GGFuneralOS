import { createHash } from 'crypto';
import { getSql } from './db';
import { normalizeHeader } from './csv';
import { caseMatchKey, caseNumberYear } from './case-identity';
import { dashboardItems, maskSensitiveValue, statusOptions, type DashboardItem, type OperationArea } from './operation-items';
import { getGoogleAccessToken, googleFetch } from './google-service-account';

type SheetConfig = {
  sheet: string;
  area: OperationArea;
  labelKeys: string[];
  dueKeys: string[];
  ownerKeys: string[];
  defaultOwner: string;
  defaultStatus: string;
};

type SheetValuesResponse = {
  valueRanges?: Array<{
    range: string;
    values?: string[][];
  }>;
};

type SpreadsheetMetadataResponse = {
  sheets?: Array<{
    properties?: {
      title?: string;
    };
  }>;
};

type SyncOptions = {
  force?: boolean;
};

type SourceSheetRow = {
  spreadsheet_id: string;
  sheet_name: string;
  source_ref: string;
  row_number: number;
  row_values: string[];
  content_hash: string;
  last_sync_run_id: string;
};

type ParsedItemEntry = {
  record: Record<string, string>;
  item: DashboardItem;
  sourceRef: string;
  rawSourceRef: string;
};

const DEFAULT_SPREADSHEET_ID = '1HGu7BVGIgeZ35_zSZyG5vQywG1RGfC58LoaYWDKoQ4M';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const sheetConfigs: SheetConfig[] = [
  {
    sheet: 'Weekly Service Schedule',
    area: 'service',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date', 'service_date', 'time', 'service_time'],
    ownerKeys: ['lead', 'lady', 'lead_lady', 'call', 'director'],
    defaultOwner: 'Service team',
    defaultStatus: 'Needs info',
  },
  {
    sheet: 'Arrangements',
    area: 'arrangement',
    labelKeys: ['deceased', 'name_of_deceased', 'name', 'client', 'family'],
    dueKeys: ['date', 'arrangement_date', 'time', 'appointment_time'],
    ownerKeys: ['arranger', 'director', 'staff'],
    defaultOwner: 'Arranger',
    defaultStatus: 'Unconfirmed',
  },
  {
    sheet: 'Death Certificate 2026',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: 'Cremains Log',
    area: 'cremains',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['pick_up_date', 'pickup_date', 'date_of_return', 'return_date'],
    ownerKeys: ['signature_of_receiver', 'receiver', 'staff'],
    defaultOwner: 'Front desk',
    defaultStatus: 'Ready pickup',
  },
  {
    sheet: '2026 Crematory Log',
    area: 'crematory',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['cremation_date', 'date', 'date_of_cremation', 'return_date'],
    ownerKeys: ['operator', 'staff', 'director'],
    defaultOwner: 'Crematory',
    defaultStatus: 'Scheduled',
  },
  {
    sheet: 'Belongings',
    area: 'belongings',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['pick_up_date', 'pickup_date', 'date', 'release_date'],
    ownerKeys: ['receiver', 'released_to', 'staff'],
    defaultOwner: 'Front desk',
    defaultStatus: 'Logged',
  },
  {
    sheet: 'Picked UP Cremains Log',
    area: 'cremains',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['pick_up_date', 'pickup_date', 'date'],
    ownerKeys: ['signature_of_receiver', 'receiver', 'staff'],
    defaultOwner: 'Front desk',
    defaultStatus: 'Picked up',
  },
  {
    sheet: 'Death Certificate 2025',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: '2025 Crematory Log',
    area: 'crematory',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['cremation_date', 'date', 'date_of_cremation', 'return_date'],
    ownerKeys: ['operator', 'staff', 'director'],
    defaultOwner: 'Crematory',
    defaultStatus: 'Scheduled',
  },
  {
    sheet: 'Death Certificate 2024',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: '2024 Running Crematory Log',
    area: 'crematory',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['cremation_date', 'date', 'date_of_cremation', 'return_date'],
    ownerKeys: ['operator', 'staff', 'director'],
    defaultOwner: 'Crematory',
    defaultStatus: 'Scheduled',
  },
  {
    sheet: 'Death Certificate Status 2023',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: '2023 Running Crematory Log',
    area: 'crematory',
    labelKeys: ['name_of_deceased', 'deceased', 'name'],
    dueKeys: ['cremation_date', 'date', 'date_of_cremation', 'return_date'],
    ownerKeys: ['operator', 'staff', 'director'],
    defaultOwner: 'Crematory',
    defaultStatus: 'Scheduled',
  },
  {
    sheet: 'Death Certificate Status 2022',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: 'Death Certificate Status 2021',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: 'Death Certificate Status 2020',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: 'Death Certificate Status 2019',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
  {
    sheet: 'Death Certificate Status 2018',
    area: 'death-cert',
    labelKeys: ['deceased', 'name_of_deceased', 'name'],
    dueKeys: ['date_of_death', 'death_date', 'date', 'filed', 'sent'],
    ownerKeys: ['doctor', 'physician', 'certifier', 'staff'],
    defaultOwner: 'Death Certificate',
    defaultStatus: 'Not started',
  },
];

const headerSignals = new Set([
  'deceased',
  'name',
  'name_of_deceased',
  'location',
  'date',
  'time',
  'casket',
  'flowers',
  'programs',
  'cemetery',
  'urn',
  'property',
  'date_of_return',
  'pick_up_date',
  'signature_of_receiver',
  'paid',
]);

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' | ');
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashRecord(record: Record<string, string>) {
  return hashJson(record);
}

function spreadsheetId() {
  return process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

function quotedRange(sheet: string) {
  return `'${sheet.replace(/'/g, "''")}'`;
}

async function resolveSheetConfigs(configs: SheetConfig[], token: string) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}`);
  url.searchParams.set('fields', 'sheets.properties.title');

  const response = await googleFetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }, 'Google Sheets metadata read');
  if (!response.ok) throw new Error(`Google Sheets metadata read failed with HTTP ${response.status}`);

  const metadata = (await response.json()) as SpreadsheetMetadataResponse;
  const actualTitles = metadata.sheets?.map((sheet) => sheet.properties?.title).filter((title): title is string => Boolean(title)) ?? [];
  const titleByNormalized = new Map(actualTitles.map((title) => [normalizeHeader(title), title]));

  return configs
    .map((config) => {
      const actualTitle = titleByNormalized.get(normalizeHeader(config.sheet));
      return actualTitle ? { ...config, sheet: actualTitle } : null;
    })
    .filter((config): config is SheetConfig => Boolean(config));
}

async function readResolvedSheetValues(resolvedConfigs: SheetConfig[], token: string) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}/values:batchGet`);
  for (const config of resolvedConfigs) url.searchParams.append('ranges', quotedRange(config.sheet));
  url.searchParams.set('majorDimension', 'ROWS');

  const response = await googleFetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }, 'Google Sheets values read');
  if (!response.ok) throw new Error(`Google Sheets read failed with HTTP ${response.status}`);

  return {
    configs: resolvedConfigs,
    response: (await response.json()) as SheetValuesResponse,
  };
}

async function ensureSourceSheetStagingTables() {
  const sql = getSql();
  await sql(`CREATE TABLE IF NOT EXISTS source_sheet_sync_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spreadsheet_id    TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'running',
    read_sheets       JSONB NOT NULL DEFAULT '[]',
    raw_row_count     INTEGER NOT NULL DEFAULT 0,
    parsed_item_count INTEGER NOT NULL DEFAULT 0,
    archived_row_count INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ
  )`);

  await sql(`CREATE TABLE IF NOT EXISTS source_sheet_rows (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spreadsheet_id    TEXT NOT NULL,
    sheet_name        TEXT NOT NULL,
    source_ref        TEXT NOT NULL,
    row_number        INTEGER,
    row_values        JSONB NOT NULL DEFAULT '[]',
    content_hash      TEXT NOT NULL,
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sync_run_id  UUID REFERENCES source_sheet_sync_runs(id) ON DELETE SET NULL,
    parse_status      TEXT NOT NULL DEFAULT 'raw',
    parse_message     TEXT,
    is_archived       BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (spreadsheet_id, source_ref)
  )`);

  await sql(`CREATE INDEX IF NOT EXISTS idx_source_sheet_rows_sheet
    ON source_sheet_rows(spreadsheet_id, sheet_name, is_archived)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_source_sheet_rows_sync
    ON source_sheet_rows(last_sync_run_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_source_sheet_runs_started
    ON source_sheet_sync_runs(started_at DESC)`);

  await sql(`CREATE TABLE IF NOT EXISTS source_sync_locks (
    source_id   TEXT PRIMARY KEY,
    lock_token  TEXT NOT NULL,
    locked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function sourceSheetStagingExists() {
  const sql = getSql();
  const rows = await sql(`SELECT to_regclass('public.source_sheet_sync_runs') AS table_name`);
  return Boolean(rows[0]?.table_name);
}

async function latestSheetSyncRun() {
  if (!(await sourceSheetStagingExists())) return null;
  const sql = getSql();
  const rows = await sql(
    `SELECT id, status, read_sheets, raw_row_count, parsed_item_count, archived_row_count, error_message, started_at, finished_at
     FROM source_sheet_sync_runs
     WHERE spreadsheet_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [spreadsheetId()],
  );
  return rows[0] ?? null;
}

function syncCooldownMs() {
  const seconds = Number.parseInt(process.env.GOOGLE_SHEET_SYNC_MIN_INTERVAL_SECONDS ?? '60', 10);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1000;
}

async function recentCompletedSheetSync() {
  const latest = await latestSheetSyncRun();
  if (!latest || latest.status !== 'completed' || !latest.finished_at) return null;
  const finishedAt = new Date(latest.finished_at).getTime();
  if (!Number.isFinite(finishedAt)) return null;
  return Date.now() - finishedAt < syncCooldownMs() ? latest : null;
}

async function acquireSourceSyncLock(sourceId: string) {
  await ensureSourceSheetStagingTables();
  const sql = getSql();
  const token = hashJson({ sourceId, pid: process.pid, at: Date.now(), random: Math.random() });
  const staleMinutes = Math.max(1, Number.parseInt(process.env.SOURCE_SYNC_LOCK_STALE_MINUTES ?? '10', 10) || 10);
  const rows = await sql(
    `INSERT INTO source_sync_locks (source_id, lock_token, locked_at)
     VALUES ($1, $2, now())
     ON CONFLICT (source_id) DO UPDATE SET
       lock_token = EXCLUDED.lock_token,
       locked_at = now()
     WHERE source_sync_locks.locked_at < now() - ($3::text || ' minutes')::interval
     RETURNING lock_token`,
    [sourceId, token, String(staleMinutes)],
  );
  return rows[0]?.lock_token === token ? token : null;
}

async function releaseSourceSyncLock(sourceId: string, token: string | null) {
  if (!token) return;
  const sql = getSql();
  await sql('DELETE FROM source_sync_locks WHERE source_id = $1 AND lock_token = $2', [sourceId, token]);
}

function sourceRowRef(sheet: string, rowNumber: number) {
  return `${sheet}!${rowNumber}`;
}

function rawSourceRefForRecord(sheet: string, record: Record<string, string>) {
  const rowNumber = Number.parseInt(record._row_number ?? '', 10);
  return sourceRowRef(sheet, Number.isFinite(rowNumber) ? rowNumber : 0);
}

function rawRowsForSync(syncRunId: string, configs: SheetConfig[], response: SheetValuesResponse): SourceSheetRow[] {
  const id = spreadsheetId();
  return configs.flatMap((config, index) => {
    const rows = response.valueRanges?.[index]?.values ?? [];
    return rows
      .map((rowValues, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const normalizedValues = rowValues.map((value) => String(value ?? '').trim());
        return {
          spreadsheet_id: id,
          sheet_name: config.sheet,
          source_ref: sourceRowRef(config.sheet, rowNumber),
          row_number: rowNumber,
          row_values: normalizedValues,
          content_hash: hashJson({ sheet: config.sheet, row_number: rowNumber, row_values: normalizedValues }),
          last_sync_run_id: syncRunId,
        };
      })
      .filter((row) => row.row_values.some(Boolean));
  });
}

async function startSheetSyncRun(configs: SheetConfig[]) {
  await ensureSourceSheetStagingTables();
  const sql = getSql();
  const rows = await sql(
    `INSERT INTO source_sheet_sync_runs (spreadsheet_id, status, read_sheets)
     VALUES ($1, 'running', $2::jsonb)
     RETURNING id`,
    [spreadsheetId(), JSON.stringify(configs.map((config) => config.sheet))],
  );
  return String(rows[0]?.id ?? '');
}

async function recordSourceSheetRows(syncRunId: string, configs: SheetConfig[], response: SheetValuesResponse) {
  if (!syncRunId) return { rawRows: 0, archivedRows: 0 };
  const sql = getSql();
  const sourceRows = rawRowsForSync(syncRunId, configs, response);
  const chunkSize = 500;

  for (let index = 0; index < sourceRows.length; index += chunkSize) {
    const chunk = sourceRows.slice(index, index + chunkSize);
    await sql(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           spreadsheet_id text,
           sheet_name text,
           source_ref text,
           row_number integer,
           row_values jsonb,
           content_hash text,
           last_sync_run_id uuid
         )
       )
       INSERT INTO source_sheet_rows
         (spreadsheet_id, sheet_name, source_ref, row_number, row_values, content_hash,
          last_sync_run_id, seen_at, parse_status, is_archived)
       SELECT
         spreadsheet_id, sheet_name, source_ref, row_number, row_values, content_hash,
         last_sync_run_id, now(), 'raw', false
       FROM incoming
       ON CONFLICT (spreadsheet_id, source_ref) DO UPDATE SET
         sheet_name = EXCLUDED.sheet_name,
         row_number = EXCLUDED.row_number,
         row_values = EXCLUDED.row_values,
         content_hash = EXCLUDED.content_hash,
         last_sync_run_id = EXCLUDED.last_sync_run_id,
         seen_at = now(),
         parse_status = 'raw',
         parse_message = null,
         is_archived = false`,
      [JSON.stringify(chunk)],
    );
  }

  const readSheets = configs.map((config) => config.sheet);
  const activeRefs = sourceRows.map((row) => row.source_ref);
  const archived = await sql(
    `UPDATE source_sheet_rows
     SET is_archived = true, seen_at = now()
     WHERE spreadsheet_id = $1
       AND sheet_name = ANY($2::text[])
       AND NOT (source_ref = ANY($3::text[]))
       AND is_archived = false
     RETURNING id`,
    [spreadsheetId(), readSheets, activeRefs],
  );

  return { rawRows: sourceRows.length, archivedRows: archived.length };
}

async function markParsedSourceRows(sourceRefs: string[]) {
  if (!sourceRefs.length) return;
  const sql = getSql();
  await sql(
    `UPDATE source_sheet_rows
     SET parse_status = 'parsed', parse_message = null
     WHERE spreadsheet_id = $1
       AND source_ref = ANY($2::text[])
       AND is_archived = false`,
    [spreadsheetId(), sourceRefs],
  );
}

async function finishSheetSyncRun(
  syncRunId: string,
  result: { rawRows: number; imported: number; archivedRows: number; status: 'completed' | 'failed'; error?: string },
) {
  if (!syncRunId) return;
  const sql = getSql();
  await sql(
    `UPDATE source_sheet_sync_runs
     SET status = $2,
         raw_row_count = $3,
         parsed_item_count = $4,
         archived_row_count = $5,
         error_message = $6,
         finished_at = now()
     WHERE id = $1`,
    [syncRunId, result.status, result.rawRows, result.imported, result.archivedRows, result.error ?? null],
  );
}

function findHeaderRow(rows: string[][]) {
  const signalRow = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell));
    const signalCount = normalized.filter((cell) => headerSignals.has(cell)).length;
    return signalCount >= 2 || normalized.includes('deceased') || normalized.includes('name_of_deceased');
  });
  if (signalRow >= 0) return signalRow;

  let bestRow = -1;
  let bestCount = 0;
  rows.slice(0, 25).forEach((row, index) => {
    const nonEmpty = row.filter((cell) => cell.trim()).length;
    if (nonEmpty >= 3 && nonEmpty > bestCount) {
      bestRow = index;
      bestCount = nonEmpty;
    }
  });
  return bestRow;
}

function rowsToRecords(rows: string[][]) {
  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex].map((cell, index) => normalizeHeader(cell) || `column_${index + 1}`);
  return rows.slice(headerRowIndex + 1).map((row, rowIndex) => {
    const record: Record<string, string> = { _row_number: String(headerRowIndex + rowIndex + 2) };
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? '').trim();
    });
    return record;
  });
}

function first(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return '';
}

function isTimeLike(value: string) {
  return /^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*$/i.test(value);
}

function cleanArrangementCell(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const withoutBlockPrefix = trimmed.replace(/^block\s*:?\s*/i, '').trim();
  const normalized = withoutBlockPrefix.toLowerCase();
  if (!withoutBlockPrefix || ['block', 'lunch', 'time', 'date', 'day'].includes(normalized)) return '';
  if (isTimeLike(withoutBlockPrefix)) return '';
  // Reject day-header / date cells that leak in from stacked week-blocks
  // ("Friday June 5", "Monday 6/1/2026", "Thursday Jun 4") and bare dates — they are
  // sub-headers, not appointments.
  if (/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(withoutBlockPrefix) && /\d/.test(withoutBlockPrefix)) return '';
  if (looksLikeDateOrTime(withoutBlockPrefix)) return '';
  return withoutBlockPrefix;
}

function looksLikeDateOrTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isTimeLike(trimmed)) return true;
  // Pure date: 5/28, 05-28-2026, 2026-05-28
  if (/^\d{1,4}([\/-]\d{1,4}){1,2}$/.test(trimmed)) return true;
  // No alphabetic characters at all (bare numbers, times, date+time fragments) — never a person's name
  if (!/[a-z]/i.test(trimmed)) return true;
  return false;
}

function ownerValue(record: Record<string, string>, config: SheetConfig) {
  const value = first(record, config.ownerKeys);
  const normalized = value.toLowerCase();
  if (['hearse', 'limo', 'programs', 'flowers', 'casket', 'no', 'yes', 'n/a', 'na'].includes(normalized)) return '';
  // A Family Contact must be a person — reject timestamps/dates that leak in from time columns.
  if (looksLikeDateOrTime(value)) return '';
  return value;
}

function labelFor(record: Record<string, string>, config: SheetConfig) {
  const configured = first(record, config.labelKeys);
  if (configured) return configured;
  if (config.area === 'service') return '';
  if (config.sheet.toLowerCase() === 'arrangements') return '';

  const nameKey = Object.keys(record).find((key) => key.includes('name') || key.includes('deceased'));
  if (nameKey && record[nameKey]?.trim()) return record[nameKey].trim();

  const skipped = new Set(['_row_number', 'paid', 'status', 'date', 'time', 'notes', 'note', 'phone', 'cell']);
  return (
    Object.entries(record).find(([key, value]) => value.trim() && !skipped.has(key) && !key.startsWith('column_'))?.[1].trim() || ''
  );
}

function optionsFor(area: OperationArea) {
  if (area === 'death-cert') return statusOptions.deathCert;
  return statusOptions[area];
}

function derivePriority(record: Record<string, string>, config: SheetConfig): DashboardItem['priority'] {
  const joined = Object.values(record).join(' ').toLowerCase();
  if (joined.includes('picked up') || joined.includes('released') || joined.includes('filed')) return 'done';
  if (joined.includes('missing') || joined.includes('hold') || joined.includes('needed') || joined.includes('tbd')) return 'critical';
  if (config.dueKeys.some((key) => record[key]?.trim())) return 'high';
  return 'normal';
}

function parseSheetDate(value: string | undefined): Date | null {
  const text = value?.trim();
  if (!text) return null;
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return exactLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  // Sheets use M/D/Y, M.D.Y, and M-D-Y (e.g. "8/1/2024", "5.21.2026", "1-23-26").
  const md = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
  if (md) {
    const year = Number(md[3].length === 2 ? `20${md[3]}` : md[3]);
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return exactLocalDate(year, month, day);
  }
  return null;
}

function exactLocalDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) return null;
  return d;
}

function hasValue(record: Record<string, string>, ...keys: string[]) {
  return keys.some((key) => record[key]?.trim());
}

// Derive a per-row status from the sheet's OWN state cells, mapped onto the area's
// statusOptions. Conservative by design: when the sheet gives no reliable signal we keep
// config.defaultStatus rather than guessing. This matters most for death certs, where a
// wrong "Filed" could mask a blown Missouri filing window — so we err toward NOT-filed
// (fail-closed), and only mark Filed on explicit completion language.
function deriveStatus(record: Record<string, string>, config: SheetConfig): string {
  if (config.area === 'death-cert') {
    // No status enum exists; the state lives as free text in column_3 / c_j_email_dc / other_info.
    const narrative = [record.column_3, record.c_j_email_dc, record.other_info, record.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!narrative) return config.defaultStatus; // 'Not started'
    if (/\b(picked up|mailed|delivered|faxed|filed)\b/.test(narrative)) return 'Filed';
    if (/ready for (pick ?up|p\/u|pickup)/.test(narrative)) return 'Filed'; // issued, awaiting family pickup
    if (/\bsent\b/.test(narrative)) return 'Filed';
    if (/\bready to (file|submit)\b/.test(narrative)) return 'Ready to file';
    if (/\b(coroner|medical examiner|\bme\b|pending)\b/.test(narrative)) return 'ME pending';
    return config.defaultStatus;
  }

  if (config.area === 'cremains') {
    if (hasValue(record, 'pick_up_date', 'pickup_date', 'signature_of_receiver', 'receiver', 'released_to')) return 'Picked up';
    if (hasValue(record, 'date_of_return', 'return_date', 'release_date')) return 'Ready pickup';
    return config.defaultStatus; // respects the per-sheet default ('Ready pickup' / 'Picked up')
  }

  if (config.area === 'crematory') {
    const cremation = parseSheetDate(record.date_of_cremation || record.cremation_date || record.date);
    if (cremation) return cremation.getTime() <= Date.now() ? 'Completed' : 'Scheduled';
    return config.defaultStatus; // 'Scheduled'
  }

  if (config.area === 'service') {
    const serviceDate = parseSheetDate(record.service_date || record.date);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (serviceDate && serviceDate.getTime() < startOfToday.getTime()) return 'Complete';
    const logisticsFilled = ['casket', 'programs', 'hearse', 'lead', 'cemetery', 'flowers'].filter((key) => record[key]?.trim()).length;
    if (logisticsFilled >= 3) return 'Ready';
    return config.defaultStatus; // 'Needs info'
  }

  // belongings / arrangement: the sheet carries no status signal — keep the default
  // rather than inventing one.
  return config.defaultStatus;
}

function displayKey(key: string) {
  return key
    .replace(/^_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeDetailValue(key: string, value: string) {
  // Delegate to the single canonical masker so the sync detail string and the API
  // source_payload can never diverge on what counts as sensitive.
  return maskSensitiveValue(key, value);
}

function detailFor(record: Record<string, string>, config: SheetConfig) {
  const skip = new Set(['_row_number', ...config.labelKeys]);
  const details = Object.entries(record)
    .filter(([key, value]) => value && !skip.has(key))
    .slice(0, 12)
    .map(([key, value]) => `${displayKey(key)}: ${safeDetailValue(key, value)}`);
  return details.join(' | ') || `${config.sheet} row ${record._row_number}`;
}

function slug(value: string) {
  return normalizeHeader(value).replace(/_/g, '-');
}

// caseMatchKey / caseNumberYear are the canonical identity helpers (see ./case-identity), imported
// below and reused by first-call intake so originated cases thread with synced rows by the same key.

function recordToItem(record: Record<string, string>, config: SheetConfig): DashboardItem | null {
  const label = labelFor(record, config);
  if (!label) return null;
  const due = compact(config.dueKeys.map((key) => record[key]));
  if (config.area === 'service' && !due) return null;

  const rowNumber = record._row_number;
  return {
    id: `sheet-${slug(config.sheet)}-${rowNumber}`,
    area: config.area,
    label,
    detail: detailFor(record, config),
    owner: ownerValue(record, config) || config.defaultOwner,
    due,
    source: config.sheet,
    status: deriveStatus(record, config),
    priority: derivePriority(record, config),
    options: optionsFor(config.area),
  };
}

function cleanDayLabel(value: string) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// The Arrangements tab is a weekly CALENDAR GRID, not a flat table:
//   row 0  = day headers ("Monday 5-25-26 CLOSED HOLIDAY", "Tuesday May 26", ...)
//   col 0  = time slots ("9:00 AM")
//   cells  = "BLOCK" / "LUNCH" / "" or real arrangements ("Bowens-Direct",
//            "Preneed-Tilley;Isley-Direct" — multiple per cell, ';'-separated)
// The generic findHeaderRow() mis-picked the first BLOCK row as the header, so every
// real arrangement was discarded (0 imported). This parser reads the grid directly.
function arrangementCalendarEntries(rows: string[][], config: SheetConfig) {
  const entries: ParsedItemEntry[] = [];
  if (!rows.length) return entries;

  const weekday = /\b(mon|tue|wed|thu|fri|sat|sun)/i;
  const isHeaderRow = (row: string[]) => row.filter((cell) => weekday.test(String(cell ?? ''))).length >= 2;
  const headerColumns = (row: string[]) =>
    row
      .map((cell, index) => ({ index, label: cleanDayLabel(String(cell ?? '')) }))
      .filter((column) => column.index > 0 && column.label);

  const headerIdx = rows.findIndex(isHeaderRow);
  if (headerIdx < 0) return entries;

  // The sheet stacks multiple week-blocks vertically. Re-anchor the day columns at each
  // new header row, and NEVER emit a header row's own cells as appointments — otherwise
  // a lower week's day labels ("Monday 6/1/2026") leak in as fake arrangements.
  let dayColumns = headerColumns(rows[headerIdx]);

  for (let rowIdx = headerIdx + 1; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] || [];
    if (isHeaderRow(row)) {
      dayColumns = headerColumns(row);
      continue;
    }
    const timeCell = cleanDayLabel(String(row[0] ?? ''));
    const time = isTimeLike(timeCell) ? timeCell : '';

    for (const column of dayColumns) {
      const cell = String(row[column.index] ?? '').trim();
      if (!cell) continue;

      cell.split(/[;\n]+/).forEach((part) => {
        const label = cleanArrangementCell(part);
        if (!label) return;

        const due = compact([column.label, time]);
        // Keyed by day-date + time + the arrangement name, so each arrangement is a
        // distinct stable row, and a new week's schedule produces new items while last
        // week's arrangements archive out (they leave activeSourceRefs). Keying by cell
        // position instead would collide across stacked week-blocks that reuse times.
        const key = `${slug(column.label)}-${slug(timeCell)}-${slug(label)}`;
        const record: Record<string, string> = {
          _row_number: String(rowIdx + 1),
          day: column.label,
          time: timeCell,
          appointment_label: label,
          raw_cell: cell,
        };

        entries.push({
          record,
          sourceRef: `${config.sheet}!${key}`,
          rawSourceRef: sourceRowRef(config.sheet, rowIdx + 1),
          item: {
            id: `sheet-${slug(config.sheet)}-${key}`,
            area: config.area,
            label,
            detail: compact([column.label, time ? `at ${time}` : '']) || config.sheet,
            owner: config.defaultOwner,
            due,
            source: config.sheet,
            status: config.defaultStatus,
            priority: due ? 'high' : 'normal',
            options: optionsFor(config.area),
          },
        });
      });
    }
  }

  return entries;
}

function recordToItemEntries(record: Record<string, string>, config: SheetConfig) {
  const item = recordToItem(record, config);
  return item
    ? [{
        record,
        item,
        sourceRef: `${item.source}!${record._row_number}`,
        rawSourceRef: rawSourceRefForRecord(config.sheet, record),
      }]
    : [];
}

type ImportRow = {
  item_id: string;
  area: OperationArea;
  label: string;
  detail: string;
  owner: string;
  due_text: string;
  source: string;
  status_default: string;
  priority: DashboardItem['priority'];
  options: string[];
  source_ref: string;
  source_payload: Record<string, string>;
  source_content_hash: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  source_case_number: string | null;
  business_date: string | null;
};

const BUSINESS_DATE_KEYS = [
  'date', 'service_date', 'arrangement_date', 'appointment_date', 'date_of_death', 'death_date',
  'date_of_cremation', 'cremation_date', 'date_of_return', 'return_date', 'pick_up_date', 'pickup_date',
  'release_date', 'date_filed', 'filed', 'date_sent', 'sent', 'at_mokan_since', 'drop_off_date',
  'modified_at', 'day',
];

const DATE_OF_BIRTH_KEYS = [
  'date_of_birth',
  'dob',
  'd_o_b',
  'birth_date',
  'birthdate',
  'sunrise',
  'date_of_birth_dob',
];

const DATE_OF_DEATH_KEYS = [
  'date_of_death',
  'death_date',
  'date_of_transition',
  'date_of_trnasiiton',
  'date_of_transiiton',
  'transition',
  'transition_date',
  'trnasiiton',
  'transiiton',
  'dod',
  'd_o_d',
  'sunset',
];

const SOURCE_CASE_NUMBER_KEYS = [
  'source_case_number',
  'case_number',
  'case_no',
  'case_num',
  'case',
  'case_id',
  'mokan_number',
  'mokan',
];

const CASE_NUMBER_PATTERN = /\b(\d{2})\s*[-–—]\s*(\d{3,4})\b/;

// The row's most recent real date, used to order the feed by recency so active cases across
// every area load within the row cap. Parses only known date columns (never free text like
// phone numbers). Returns canonical YYYY-MM-DD or null.
function computeBusinessDate(record: Record<string, string>, dueText: string): string | null {
  let best: Date | null = null;
  const candidates = [dueText, ...BUSINESS_DATE_KEYS.map((key) => record[key])];
  for (const candidate of candidates) {
    const parsed = parseSheetDate(candidate);
    if (parsed && (!best || parsed.getTime() > best.getTime())) best = parsed;
  }
  if (!best) return null;
  const year = best.getFullYear();
  const month = String(best.getMonth() + 1).padStart(2, '0');
  const day = String(best.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function canonicalSourceDate(value: string | undefined, kind: 'birth' | 'death'): string | null {
  const parsed = parseSheetDate(value) ?? parseNamedMonthDate(value);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsed.getTime() > today.getTime()) return null;
  if (kind === 'birth' && parsed.getFullYear() > today.getFullYear()) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function parseNamedMonthDate(value: string | undefined): Date | null {
  const text = value?.trim();
  if (!text) return null;
  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const match = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`, 'i'));
  if (!match) return null;
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .findIndex((prefix) => match[1].toLowerCase().startsWith(prefix));
  if (monthIndex < 0) return null;
  return exactLocalDate(Number(match[3]), monthIndex + 1, Number(match[2]));
}

function labeledDatePattern(labels: string[]) {
  const label = labels.map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const numeric = '\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}';
  const named = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+\\d{4}';
  return new RegExp(`\\b(?:${label})\\b\\s*(?:[:=\\-–—]|is|was)?\\s*(${numeric}|${named})\\b`, 'i');
}

function extractLabeledDate(record: Record<string, string>, kind: 'birth' | 'death'): string | null {
  const pattern = kind === 'birth'
    ? labeledDatePattern(['dob', 'd.o.b', 'date of birth', 'birth date', 'born', 'sunrise'])
    : labeledDatePattern([
        'dod',
        'd.o.d',
        'date of death',
        'death date',
        'date of transition',
        'date of trnasiiton',
        'date of transiiton',
        'transition date',
        'transition',
        'trnasiiton',
        'transiiton',
        'died',
        'passed away',
        'sunset',
      ]);
  for (const value of Object.values(record)) {
    const match = value.match(pattern);
    const parsed = canonicalSourceDate(match?.[1], kind);
    if (parsed) return parsed;
  }
  return null;
}

function computeDateOfBirth(record: Record<string, string>): string | null {
  for (const key of DATE_OF_BIRTH_KEYS) {
    const parsed = canonicalSourceDate(record[key], 'birth');
    if (parsed) return parsed;
  }
  return extractLabeledDate(record, 'birth');
}

function computeDateOfDeath(record: Record<string, string>): string | null {
  for (const key of DATE_OF_DEATH_KEYS) {
    const parsed = canonicalSourceDate(record[key], 'death');
    if (parsed) return parsed;
  }
  return extractLabeledDate(record, 'death');
}

function normalizeCaseNumber(value: string | undefined): string | null {
  const match = value?.match(CASE_NUMBER_PATTERN);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function computeSourceCaseNumber(record: Record<string, string>): string | null {
  for (const key of SOURCE_CASE_NUMBER_KEYS) {
    const normalized = normalizeCaseNumber(record[key]);
    if (normalized) return normalized;
  }
  const rowValues = Object.entries(record)
    .filter(([key]) => key !== '_row_number')
    .map(([, value]) => value?.trim())
    .filter(Boolean);
  const firstCell = rowValues[0];
  return normalizeCaseNumber(firstCell);
}

function importRowFor(item: DashboardItem, record: Record<string, string>, sourceRef = `${item.source}!${record._row_number}`): ImportRow {
  const dateOfBirth = computeDateOfBirth(record);
  const dateOfDeath = computeDateOfDeath(record);
  const sourceCaseNumber = computeSourceCaseNumber(record);
  return {
    item_id: item.id,
    area: item.area,
    label: item.label,
    detail: item.detail,
    owner: item.owner,
    due_text: item.due,
    source: item.source,
    status_default: item.status,
    priority: item.priority,
    options: item.options,
    source_ref: sourceRef,
    source_payload: {
      ...record,
      case_match_key: caseMatchKey(item.label),
      case_match_basis: item.source === 'Arrangements' ? 'arrangement calendar cell' : 'source name field',
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      ...(dateOfDeath ? { date_of_death: dateOfDeath } : {}),
      ...(sourceCaseNumber ? { source_case_number: sourceCaseNumber } : {}),
    },
    source_content_hash: hashRecord(record),
    date_of_birth: dateOfBirth,
    date_of_death: dateOfDeath,
    source_case_number: sourceCaseNumber,
    business_date: computeBusinessDate(record, item.due),
  };
}

// Golden Gate's NN-NNN is a per-register, per-year sequence number — NOT a global case id
// (verified: 23-001 is a different person in the death-cert log vs the crematory log, and a
// single death-cert log can even repeat a number). So a deceased threads across logs by NAME,
// and the only trustworthy year anchor is the death-cert/crematory case-number prefix. We turn a
// 2-digit prefix into a full year and reject implausible values so data-entry noise (e.g. "32-",
// "34-") can't mint a fake year bucket.
// Canonical case-identity resolver (single source of truth, §13). Runs over the full import set
// so name-only logs (cremains/belongings) can borrow the death-year from the same person's
// numbered death-cert/crematory row. Fail-closed: when a name carries more than one death-year we
// cannot tell which case a yearless row belongs to, so we mark it `unverified` for director review
// rather than guessing or silently merging two different people. Each row records the basis for
// its identity for observability/audit.
function applyCaseIdentity(rows: ImportRow[]): void {
  // Phase 1 — map each normalized name to the set of death-years it carries via real case numbers.
  const yearsByName = new Map<string, Set<string>>();
  for (const row of rows) {
    const name = row.source_payload.case_match_key;
    const year = caseNumberYear(row.source_case_number);
    if (!name || !year) continue;
    if (!yearsByName.has(name)) yearsByName.set(name, new Set());
    yearsByName.get(name)!.add(year);
  }

  // Phase 2 — assign every row a canonical group key + the basis for it.
  for (const row of rows) {
    const name = row.source_payload.case_match_key || '';
    const ownYear = caseNumberYear(row.source_case_number);
    const nameYears = name ? yearsByName.get(name) : undefined;

    let year: string | null = null;
    let status = 'name-only';
    let basis = 'name only — no year signal';

    if (ownYear) {
      year = ownYear;
      status = 'resolved';
      basis = 'own case number';
    } else if (nameYears && nameYears.size === 1) {
      year = [...nameYears][0];
      status = 'bridged';
      basis = 'name-matched case number';
    } else if (nameYears && nameYears.size > 1) {
      // Name spans multiple death-years (likely different people sharing a name). If this row's
      // own business_date lands on exactly one of those known years, place it there as a distinct,
      // lower-confidence `date-bridged` tier so it groups usefully but stays visibly less certain.
      // This date is an activity date, NOT a death date — it must never feed DOD/compliance.
      const bridgeYear = row.business_date ? row.business_date.slice(0, 4) : null;
      if (bridgeYear && nameYears.has(bridgeYear)) {
        year = bridgeYear;
        status = 'date-bridged';
        basis = "business-date year matches one of the name's case-number years";
      } else {
        year = null;
        status = 'unverified';
        basis = `name spans ${nameYears.size} case-number years`;
      }
    } else if (row.business_date) {
      year = row.business_date.slice(0, 4);
      status = 'date-year';
      basis = 'business date year';
    }

    row.source_payload.case_group_key = year && name ? `${name}|${year}` : name;
    row.source_payload.case_year = year ?? '';
    row.source_payload.identity_status = status;
    row.source_payload.identity_basis = basis;
  }
}

async function bulkUpsertItems(rows: ImportRow[]) {
  if (!rows.length) return;
  const sql = getSql();
  const chunkSize = 500;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
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
           source_content_hash text,
           date_of_birth text,
           date_of_death text,
           source_case_number text,
           business_date date
         )
       )
       INSERT INTO operational_items
         (item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
          source_origin, source_ref, source_payload, source_seen_at, source_content_hash,
          date_of_birth, date_of_death, source_case_number, business_date, updated_at)
       SELECT
         item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
         'google-sheet', source_ref, source_payload, now(), source_content_hash,
         date_of_birth, date_of_death, source_case_number, business_date, now()
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
         source_origin = 'google-sheet',
         source_ref = EXCLUDED.source_ref,
         source_payload = EXCLUDED.source_payload,
         source_seen_at = now(),
         source_content_hash = EXCLUDED.source_content_hash,
         -- Provenance order for DOB/DOD: (1) a staff edit is authoritative and never overwritten;
         -- (2) a real value from the sheet wins next (so if Golden Gate ever adds a DOB/DOD column it
         -- supersedes our enrichment); (3) otherwise KEEP what we already have — never wipe on an empty
         -- incoming value, which is what preserves obituary/contract enrichment across re-syncs without
         -- it having to pose as a staff edit.
         date_of_birth = CASE
           WHEN operational_items.edited_fields ? 'date_of_birth' THEN operational_items.date_of_birth
           WHEN NULLIF(EXCLUDED.date_of_birth, '') IS NOT NULL THEN EXCLUDED.date_of_birth
           ELSE operational_items.date_of_birth END,
         date_of_death = CASE
           WHEN operational_items.edited_fields ? 'date_of_death' THEN operational_items.date_of_death
           WHEN NULLIF(EXCLUDED.date_of_death, '') IS NOT NULL THEN EXCLUDED.date_of_death
           ELSE operational_items.date_of_death END,
         source_case_number = EXCLUDED.source_case_number,
         business_date = EXCLUDED.business_date,
         is_archived = false,
         updated_at = now()`,
      [JSON.stringify(chunk)],
    );
  }
}

// Archive only within tabs that were successfully read THIS run (readSources). If a tab's
// parser under-imports, errors, or temporarily returns nothing, its rows are left intact
// rather than wrongly archived — a global "anything not seen" sweep could wipe a whole
// tab's valid internal copies on a single bad parse.
async function archiveMissingSourceRows(activeSourceRefs: string[], readSources: string[]) {
  if (!readSources.length) return 0;
  const sql = getSql();
  const rows = await sql(
    `UPDATE operational_items
     SET is_archived = true, updated_at = now()
     WHERE source_origin = 'google-sheet'
       AND is_archived = false
       AND source = ANY($2::text[])
       AND NOT (source_ref = ANY($1::text[]))
     RETURNING item_id`,
    [activeSourceRefs, readSources],
  );
  return rows.length;
}

async function archivePrototypeItems() {
  const sql = getSql();
  const seedIds = dashboardItems.map((item) => item.id);
  const rows = await sql(
    `UPDATE operational_items
     SET is_archived = true, updated_at = now()
     WHERE source_origin = 'ggfuneralos'
       AND item_id = ANY($1)
       AND is_archived = false
     RETURNING item_id`,
    [seedIds],
  );
  return rows.length;
}

export async function probeGoogleSheetsConnection() {
  const latest = await latestSheetSyncRun();
  if (latest) {
    return {
      row_count: Number(latest.raw_row_count ?? 0),
      sheet_count: Array.isArray(latest.read_sheets) ? latest.read_sheets.length : sheetConfigs.length,
      source: 'last_sync',
      status: latest.status,
      checked_at: latest.finished_at ?? latest.started_at,
    };
  }

  const sql = getSql();
  const rows = await sql(
    `SELECT COUNT(*)::int AS row_count, COUNT(DISTINCT source)::int AS sheet_count
     FROM operational_items
     WHERE source_origin = 'google-sheet'
       AND is_archived = false`,
  );
  return {
    row_count: rows[0]?.row_count ?? 0,
    sheet_count: rows[0]?.sheet_count ?? 0,
    source: 'local_cache',
    status: rows[0]?.row_count > 0 ? 'completed' : 'not_synced',
    checked_at: null,
  };
}

export async function syncMasterSheet(options: SyncOptions = {}) {
  const sourceId = `google-sheet:${spreadsheetId()}`;
  let lockToken: string | null = null;
  let syncRunId = '';
  let staged = { rawRows: 0, archivedRows: 0 };
  const importRows: ImportRow[] = [];

  if (!options.force) {
    const recent = await recentCompletedSheetSync();
    if (recent) {
      return {
        imported: Number(recent.parsed_item_count ?? 0),
        archived: 0,
        archived_prototype: 0,
        raw_rows: Number(recent.raw_row_count ?? 0),
        archived_raw_rows: Number(recent.archived_row_count ?? 0),
        sync_run_id: String(recent.id ?? ''),
        source: 'Google Sheets API',
        skipped: true,
        reason: 'recent_sync',
        sheets: {},
      };
    }
  }

  const parsedRawSourceRefs = new Set<string>();
  const importedBySheet: Record<string, number> = {};

  try {
    lockToken = await acquireSourceSyncLock(sourceId);
    if (!lockToken) {
      const latest = await latestSheetSyncRun();
      return {
        imported: Number(latest?.parsed_item_count ?? 0),
        archived: 0,
        archived_prototype: 0,
        raw_rows: Number(latest?.raw_row_count ?? 0),
        archived_raw_rows: Number(latest?.archived_row_count ?? 0),
        sync_run_id: String(latest?.id ?? ''),
        source: 'Google Sheets API',
        skipped: true,
        reason: 'sync_already_running',
        sheets: {},
      };
    }

    const token = await getGoogleAccessToken(SHEETS_SCOPE);
    const configs = await resolveSheetConfigs(sheetConfigs, token);
    if (!configs.length) throw new Error('No configured Google Sheet tabs were found in the spreadsheet');
    syncRunId = await startSheetSyncRun(configs);

    const { response } = await readResolvedSheetValues(configs, token);
    staged = await recordSourceSheetRows(syncRunId, configs, response);

    for (let index = 0; index < configs.length; index += 1) {
      const config = configs[index];
      const rows = response.valueRanges?.[index]?.values ?? [];
      const items =
        normalizeHeader(config.sheet) === 'arrangements'
          ? arrangementCalendarEntries(rows, config)
          : rowsToRecords(rows).flatMap((record) => recordToItemEntries(record, config));

      importedBySheet[config.sheet] = items.length;
      for (const entry of items) {
        importRows.push(importRowFor(entry.item, entry.record, entry.sourceRef));
        parsedRawSourceRefs.add(entry.rawSourceRef);
      }
    }

    applyCaseIdentity(importRows);
    await bulkUpsertItems(importRows);
    const activeSourceRefs = importRows.map((row) => row.source_ref);
    // Only tabs that actually imported rows this run are eligible for archiving.
    const readSources = Object.entries(importedBySheet)
      .filter(([, count]) => count > 0)
      .map(([sheet]) => sheet);
    const archived = await archiveMissingSourceRows(activeSourceRefs, readSources);
    const archivedPrototype = activeSourceRefs.length ? await archivePrototypeItems() : 0;
    await markParsedSourceRows(Array.from(parsedRawSourceRefs));
    await finishSheetSyncRun(syncRunId, {
      rawRows: staged.rawRows,
      imported: activeSourceRefs.length,
      archivedRows: staged.archivedRows,
      status: 'completed',
    });

    return {
      imported: activeSourceRefs.length,
      archived,
      archived_prototype: archivedPrototype,
      raw_rows: staged.rawRows,
      archived_raw_rows: staged.archivedRows,
      sync_run_id: syncRunId,
      source: 'Google Sheets API',
      sheets: importedBySheet,
    };
  } catch (error) {
    await finishSheetSyncRun(syncRunId, {
      rawRows: staged.rawRows,
      imported: importRows.length,
      archivedRows: staged.archivedRows,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Master sheet sync failed',
    });
    throw error;
  } finally {
    await releaseSourceSyncLock(sourceId, lockToken);
  }
}

export const syncWeeklyServiceSchedule = syncMasterSheet;
