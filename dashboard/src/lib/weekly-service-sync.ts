import { createHash, createSign } from 'crypto';
import { readFile } from 'fs/promises';
import { getSql } from './db';
import { normalizeHeader } from './csv';
import { dashboardItems, statusOptions, type DashboardItem, type OperationArea } from './operation-items';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

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

const DEFAULT_SPREADSHEET_ID = '1HGu7BVGIgeZ35_zSZyG5vQywG1RGfC58LoaYWDKoQ4M';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
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

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' | ');
}

function hashRecord(record: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function spreadsheetId() {
  return process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

async function loadCredentials(): Promise<ServiceAccountCredentials> {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  let raw = rawJson;
  if (!raw && rawBase64) raw = Buffer.from(rawBase64, 'base64').toString('utf8');
  if (!raw && keyFile) raw = await readFile(keyFile, 'utf8');
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, or GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required');
  }

  const credentials = JSON.parse(raw) as ServiceAccountCredentials;
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials are missing client_email or private_key');
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return credentials;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) return cachedAccessToken.token;

  const credentials = await loadCredentials();
  const tokenUri = credentials.token_uri || TOKEN_URI;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: SHEETS_SCOPE,
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedJwt = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(unsignedJwt).sign(credentials.private_key, 'base64url');
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google OAuth token response did not include an access token');
  cachedAccessToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
  return data.access_token;
}

function quotedRange(sheet: string) {
  return `'${sheet.replace(/'/g, "''")}'`;
}

async function resolveSheetConfigs(configs: SheetConfig[], token: string) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}`);
  url.searchParams.set('fields', 'sheets.properties.title');

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
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

async function readSheetValues(configs: SheetConfig[]) {
  const token = await getAccessToken();
  const resolvedConfigs = await resolveSheetConfigs(configs, token);
  if (!resolvedConfigs.length) throw new Error('No configured Google Sheet tabs were found in the spreadsheet');

  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}/values:batchGet`);
  for (const config of resolvedConfigs) url.searchParams.append('ranges', quotedRange(config.sheet));
  url.searchParams.set('majorDimension', 'ROWS');

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Sheets read failed with HTTP ${response.status}`);

  return {
    configs: resolvedConfigs,
    response: (await response.json()) as SheetValuesResponse,
  };
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

function labelFor(record: Record<string, string>, config: SheetConfig) {
  const configured = first(record, config.labelKeys);
  if (configured) return configured;
  if (config.area === 'service') return '';

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

function displayKey(key: string) {
  return key
    .replace(/^_/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeDetailValue(key: string, value: string) {
  const lowerKey = key.toLowerCase();
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (lowerKey.includes('ssn') || lowerKey.includes('social_security')) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }

  if (lowerKey.includes('phone') || lowerKey.includes('cell') || lowerKey.includes('telephone')) {
    return digits.length >= 4 ? `ending ${digits.slice(-4)}` : 'masked';
  }

  if (/^\D*\d{3}\D*\d{2}\D*\d{4}\D*$/.test(trimmed)) {
    return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : 'masked';
  }

  if (digits.length === 10 && /phone|cell|contact|number/.test(lowerKey)) {
    return `ending ${digits.slice(-4)}`;
  }

  return trimmed;
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

function caseMatchKey(value: string) {
  return normalizeHeader(value)
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    owner: first(record, config.ownerKeys) || config.defaultOwner,
    due,
    source: config.sheet,
    status: config.defaultStatus,
    priority: derivePriority(record, config),
    options: optionsFor(config.area),
  };
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
};

function importRowFor(item: DashboardItem, record: Record<string, string>): ImportRow {
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
    source_ref: `${item.source}!${record._row_number}`,
    source_payload: {
      ...record,
      case_match_key: caseMatchKey(item.label),
      case_match_basis: 'source name field',
    },
    source_content_hash: hashRecord(record),
  };
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
           source_content_hash text
         )
       )
       INSERT INTO operational_items
         (item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
          source_origin, source_ref, source_payload, source_seen_at, source_content_hash, updated_at)
       SELECT
         item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
         'google-sheet', source_ref, source_payload, now(), source_content_hash, now()
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
         is_archived = false,
         updated_at = now()`,
      [JSON.stringify(chunk)],
    );
  }
}

async function archiveMissingSourceRows(activeSourceRefs: string[]) {
  if (!activeSourceRefs.length) return 0;
  const sql = getSql();
  const rows = await sql(
    `UPDATE operational_items
     SET is_archived = true, updated_at = now()
     WHERE source_origin = 'google-sheet'
       AND is_archived = false
       AND NOT (source_ref = ANY($1))
     RETURNING item_id`,
    [activeSourceRefs],
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
  const { response } = await readSheetValues([sheetConfigs[0]]);
  const rows = response.valueRanges?.[0]?.values ?? [];
  return {
    row_count: Math.max(0, rows.length - 1),
    sheet_count: 1,
  };
}

export async function syncWeeklyServiceSchedule() {
  const { configs, response } = await readSheetValues(sheetConfigs);
  const importRows: ImportRow[] = [];
  const importedBySheet: Record<string, number> = {};

  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index];
    const rows = response.valueRanges?.[index]?.values ?? [];
    const records = rowsToRecords(rows);
    const items = records.map((record) => ({ record, item: recordToItem(record, config) })).filter((entry) => entry.item);

    importedBySheet[config.sheet] = items.length;
    for (const entry of items) {
      importRows.push(importRowFor(entry.item as DashboardItem, entry.record));
    }
  }

  await bulkUpsertItems(importRows);
  const activeSourceRefs = importRows.map((row) => row.source_ref);
  const archived = await archiveMissingSourceRows(activeSourceRefs);
  const archivedPrototype = activeSourceRefs.length ? await archivePrototypeItems() : 0;

  return {
    imported: activeSourceRefs.length,
    archived,
    archived_prototype: archivedPrototype,
    source: 'Google Sheets API',
    sheets: importedBySheet,
  };
}
