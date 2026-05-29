import { createHash, createSign } from 'crypto';
import { readFile } from 'fs/promises';
import { getSql } from './db';
import { normalizeHeader } from './csv';
import { dashboardItems, maskSensitiveValue, statusOptions, type DashboardItem, type OperationArea } from './operation-items';

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
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Sheets use both M/D/Y and M.D.Y (e.g. "8/1/2024", "5.21.2026").
  const md = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
  if (md) {
    const year = Number(md[3].length === 2 ? `20${md[3]}` : md[3]);
    const d = new Date(year, Number(md[1]) - 1, Number(md[2]), 12);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
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
  const entries: Array<{ record: Record<string, string>; item: DashboardItem; sourceRef: string }> = [];
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
          _row_number: String(headerIdx + rowIdx + 1),
          day: column.label,
          time: timeCell,
          appointment_label: label,
          raw_cell: cell,
        };

        entries.push({
          record,
          sourceRef: `${config.sheet}!${key}`,
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
  return item ? [{ record, item, sourceRef: `${item.source}!${record._row_number}` }] : [];
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

function importRowFor(item: DashboardItem, record: Record<string, string>, sourceRef = `${item.source}!${record._row_number}`): ImportRow {
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
       AND source = ANY($2)
       AND NOT (source_ref = ANY($1))
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
    const items =
      normalizeHeader(config.sheet) === 'arrangements'
        ? arrangementCalendarEntries(rows, config)
        : rowsToRecords(rows).flatMap((record) => recordToItemEntries(record, config));

    importedBySheet[config.sheet] = items.length;
    for (const entry of items) {
      importRows.push(importRowFor(entry.item, entry.record, entry.sourceRef));
    }
  }

  await bulkUpsertItems(importRows);
  const activeSourceRefs = importRows.map((row) => row.source_ref);
  // Only tabs that actually imported rows this run are eligible for archiving.
  const readSources = Object.entries(importedBySheet)
    .filter(([, count]) => count > 0)
    .map(([sheet]) => sheet);
  const archived = await archiveMissingSourceRows(activeSourceRefs, readSources);
  const archivedPrototype = activeSourceRefs.length ? await archivePrototypeItems() : 0;

  return {
    imported: activeSourceRefs.length,
    archived,
    archived_prototype: archivedPrototype,
    source: 'Google Sheets API',
    sheets: importedBySheet,
  };
}
