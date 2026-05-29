import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { dashboardItems, sanitizeSourcePayload, type DashboardItem } from '@/lib/operation-items';
import { probeGoogleSheetsConnection } from '@/lib/master-sheet-sync';
import { hasGoogleCalendarConfig } from '@/lib/google-calendar-sync';
import { hasGoogleServiceAccountConfig } from '@/lib/google-service-account';

type SourceStatus = {
  id: string;
  label: string;
  status: 'connected' | 'not_configured' | 'unavailable';
  mode: 'read_only';
  detail: string;
  checked_at: string;
};

type ItemQuery = {
  limit?: number;
  query?: string;
  caseKey?: string;
};

function toDashboardItem(row: any): DashboardItem {
  return {
    id: row.item_id,
    area: row.area,
    label: row.label,
    detail: row.detail,
    owner: row.owner,
    due: row.due_text,
    source: row.source,
    sourceRef: row.source_ref,
    sourcePayload: sanitizeSourcePayload(row.source_payload),
    dateOfBirth: row.date_of_birth ?? null,
    dateOfDeath: row.date_of_death ?? null,
    sourceCaseNumber: row.source_case_number ?? null,
    createdAt: row.created_at,
    status: row.status_default,
    priority: row.priority,
    options: Array.isArray(row.options) ? row.options : [],
  };
}

async function seedItemsIfEmpty() {
  const sql = getSql();
  const rows = await sql('SELECT COUNT(*)::int AS count FROM operational_items');
  if (rows[0]?.count > 0) return;

  for (const item of dashboardItems) {
    await sql(
      `INSERT INTO operational_items
         (item_id, area, label, detail, owner, due_text, source, status_default, priority, options, source_origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'ggfuneralos')`,
      [
        item.id,
        item.area,
        item.label,
        item.detail,
        item.owner,
        item.due,
        item.source,
        item.status,
        item.priority,
        JSON.stringify(item.options),
      ],
    );
  }
}

function cleanLimit(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 2000);
}

function caseKeyPattern(caseKey: string) {
  const parts = caseKey
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return `%${parts.join('%')}%`;
}

function itemFilters({ query = '', caseKey = '' }: ItemQuery) {
  const filters = ['is_archived = false'];
  const params: any[] = [];

  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery) {
    params.push(`%${cleanQuery}%`);
    const index = params.length;
    filters.push(`(
      lower(label) LIKE $${index}
      OR lower(detail) LIKE $${index}
      OR lower(owner) LIKE $${index}
      OR lower(source) LIKE $${index}
      OR lower(coalesce(source_ref, '')) LIKE $${index}
      OR lower(coalesce(source_case_number, '')) LIKE $${index}
      OR lower(source_payload::text) LIKE $${index}
      OR lower(coalesce(date_of_birth, '')) LIKE $${index}
      OR lower(coalesce(to_char(NULLIF(date_of_birth, '')::date, 'FMMonth FMDD, YYYY'), '')) LIKE $${index}
      OR lower(coalesce(date_of_death, '')) LIKE $${index}
      OR lower(coalesce(to_char(NULLIF(date_of_death, '')::date, 'FMMonth FMDD, YYYY'), '')) LIKE $${index}
      OR EXISTS (
        SELECT 1 FROM case_contact_state c
        WHERE c.case_key = lower(coalesce(source_payload->>'case_match_key', ''))
          AND (
            lower(c.contact_name) LIKE $${index}
            OR lower(c.relationship) LIKE $${index}
            OR lower(c.phone) LIKE $${index}
            OR lower(c.email) LIKE $${index}
            OR lower(c.notes) LIKE $${index}
          )
      )
      OR EXISTS (
        SELECT 1 FROM case_milestones m
        WHERE m.case_key = lower(coalesce(source_payload->>'case_match_key', ''))
          AND (
            lower(m.milestone_key) LIKE $${index}
            OR lower(m.value) LIKE $${index}
            OR CASE WHEN m.is_na THEN 'n/a' ELSE '' END LIKE $${index}
          )
      )
    )`);
  }

  const cleanCaseKey = caseKey.trim().toLowerCase();
  if (cleanCaseKey) {
    params.push(cleanCaseKey, caseKeyPattern(cleanCaseKey));
    const exactIndex = params.length - 1;
    const patternIndex = params.length;
    filters.push(`(
      lower(coalesce(source_payload->>'case_match_key', '')) = $${exactIndex}
      OR regexp_replace(lower(coalesce(label, '')), '[^a-z0-9]+', ' ', 'g') LIKE $${patternIndex}
      OR regexp_replace(lower(coalesce(source_payload->>'name', '')), '[^a-z0-9]+', ' ', 'g') LIKE $${patternIndex}
      OR regexp_replace(lower(coalesce(source_payload->>'name_of_deceased', '')), '[^a-z0-9]+', ' ', 'g') LIKE $${patternIndex}
      OR regexp_replace(lower(coalesce(source_payload->>'deceased_name_last_first', '')), '[^a-z0-9]+', ' ', 'g') LIKE $${patternIndex}
      OR lower(coalesce(source_ref, '')) LIKE $${patternIndex}
      OR lower(coalesce(source_case_number, '')) LIKE $${patternIndex}
    )`);
  }

  return { filters, params };
}

const ITEM_COLUMNS =
  'item_id, area, label, detail, owner, due_text, source, source_ref, source_payload, date_of_birth, date_of_death, source_case_number, created_at, status_default, priority, options';
// Most-recent rows kept PER AREA so no area is ever dropped by a global cap — death-cert,
// belongings, and service have no parseable business_date, so a flat recency sort would
// bury them last and truncate them. Per-area top-N guarantees every area is represented.
const PER_AREA_LIMIT = 250;

async function getItems({
  limit = 750,
  query = '',
  caseKey = '',
}: ItemQuery) {
  const sql = getSql();
  await seedItemsIfEmpty();
  const { filters, params } = itemFilters({ query, caseKey });
  const whereSql = filters.join(' AND ');
  const filterParams = [...params]; // WHERE params only, before list-specific limits are appended

  // The drawer fetches a single case and wants ALL of its rows (no per-area cap). The board
  // (no caseKey) uses a per-area window so every area surfaces its most-recent rows.
  let listSql: string;
  if (caseKey) {
    params.push(limit);
    listSql = `SELECT ${ITEM_COLUMNS}
       FROM operational_items
       WHERE ${whereSql}
       ORDER BY business_date DESC NULLS LAST, created_at DESC
       LIMIT $${params.length}`;
  } else {
    params.push(PER_AREA_LIMIT);
    const perAreaIndex = params.length;
    params.push(Math.max(limit, PER_AREA_LIMIT * 8));
    const limitIndex = params.length;
    listSql = `SELECT ${ITEM_COLUMNS} FROM (
         SELECT ${ITEM_COLUMNS}, business_date,
                row_number() OVER (PARTITION BY area ORDER BY business_date DESC NULLS LAST, created_at DESC) AS rn
         FROM operational_items
         WHERE ${whereSql}
       ) ranked
       WHERE rn <= $${perAreaIndex}
       ORDER BY business_date DESC NULLS LAST, created_at DESC
       LIMIT $${limitIndex}`;
  }

  const [rows, totalRows] = await Promise.all([
    sql(listSql, params),
    sql(
      `SELECT COUNT(*)::int AS count
       FROM operational_items
       WHERE ${whereSql}`,
      filterParams,
    ),
  ]);

  const items = rows.map(toDashboardItem);
  const total = totalRows[0]?.count ?? items.length;
  return {
    items,
    meta: {
      total,
      returned: items.length,
      limit,
      limited: total > items.length,
      query: query.trim(),
      case_key: caseKey.trim(),
    },
  };
}

async function getRecentItemAudit() {
  const sql = getSql();
  return sql(
    `SELECT *
     FROM operational_item_audit
     ORDER BY created_at DESC
     LIMIT 50`,
  );
}

async function checkGoogleSheet(checkedAt: string): Promise<SourceStatus> {
  const hasCredentials =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;

  if (!hasCredentials) {
    return {
      id: 'google-sheet',
      label: 'Master Google Sheet',
      status: 'not_configured',
      mode: 'read_only',
      detail: 'Set Google service account credentials to enable private read-only Sheets API sync.',
      checked_at: checkedAt,
    };
  }

  try {
    const result = await probeGoogleSheetsConnection();
    const checkedAtText = result.checked_at ? new Date(result.checked_at).toLocaleString('en-US') : 'not yet synced';
    const detail =
      result.source === 'last_sync'
        ? `Using cached master sheet sync from ${checkedAtText}: ${result.row_count} source rows across ${result.sheet_count} tabs.`
        : `Using local imported master sheet cache: ${result.row_count} active rows across ${result.sheet_count} tabs.`;

    return {
      id: 'google-sheet',
      label: 'Master Google Sheet',
      status: result.status === 'failed' || result.status === 'not_synced' ? 'unavailable' : 'connected',
      mode: 'read_only',
      detail,
      checked_at: checkedAt,
    };
  } catch {
    return {
      id: 'google-sheet',
      label: 'Master Google Sheet',
      status: 'unavailable',
      mode: 'read_only',
      detail: 'No local master sheet sync cache is available.',
      checked_at: checkedAt,
    };
  }
}

async function checkSmbShare(checkedAt: string): Promise<SourceStatus> {
  const root = process.env.GGFC_COMMON_ROOT;
  const sql = getSql();
  const indexedRows = await sql(
    `SELECT COUNT(*)::int AS count, MAX(seen_at) AS last_seen
     FROM source_file_items
     WHERE source_origin = 'smb'
       AND is_archived = false`,
  );
  const indexedCount = indexedRows[0]?.count ?? 0;
  const lastSeen = indexedRows[0]?.last_seen ? new Date(indexedRows[0].last_seen).toLocaleString('en-US') : null;

  if (!root) {
    if (indexedCount > 0) {
      return {
        id: 'smb-share',
        label: 'GGFC Common SMB Share',
        status: 'connected',
        mode: 'read_only',
        detail: `Read-only worker index available. ${indexedCount} file/folder records last seen${lastSeen ? ` ${lastSeen}` : ''}.`,
        checked_at: checkedAt,
      };
    }

    return {
      id: 'smb-share',
      label: 'GGFC Common SMB Share',
      status: 'not_configured',
      mode: 'read_only',
      detail: 'Set GGFC_COMMON_ROOT on a local worker to scan the mounted share read-only.',
      checked_at: checkedAt,
    };
  }

  try {
    const fs = await import('fs/promises');
    const entries = await fs.readdir(root, { withFileTypes: true });
    const folderCount = entries.filter((entry) => entry.isDirectory()).length;
    const fileCount = entries.filter((entry) => entry.isFile()).length;

    return {
      id: 'smb-share',
      label: 'GGFC Common SMB Share',
      status: 'connected',
      mode: 'read_only',
      detail: `Mounted path reachable. ${folderCount} top-level folders, ${fileCount} top-level files, ${indexedCount} indexed records.`,
      checked_at: checkedAt,
    };
  } catch {
    if (indexedCount > 0) {
      return {
        id: 'smb-share',
        label: 'GGFC Common SMB Share',
        status: 'connected',
        mode: 'read_only',
        detail: `Mounted path unavailable to this runtime, but ${indexedCount} read-only worker records are indexed.`,
        checked_at: checkedAt,
      };
    }

    return {
      id: 'smb-share',
      label: 'GGFC Common SMB Share',
      status: 'unavailable',
      mode: 'read_only',
      detail: 'Configured mounted path could not be read.',
      checked_at: checkedAt,
    };
  }
}

async function checkGoogleCalendar(checkedAt: string): Promise<SourceStatus> {
  if (!hasGoogleServiceAccountConfig()) {
    return {
      id: 'google-calendar',
      label: 'Golden Gate Google Calendar',
      status: 'not_configured',
      mode: 'read_only',
      detail: 'Set Google service account credentials and share the funeral home calendar with that service account.',
      checked_at: checkedAt,
    };
  }

  if (!hasGoogleCalendarConfig()) {
    return {
      id: 'google-calendar',
      label: 'Golden Gate Google Calendar',
      status: 'not_configured',
      mode: 'read_only',
      detail: 'Set GGFC_GOOGLE_CALENDAR_IDS to show the funeral home Google Calendar in the dashboard.',
      checked_at: checkedAt,
    };
  }

  return {
    id: 'google-calendar',
    label: 'Golden Gate Google Calendar',
    status: 'connected',
    mode: 'read_only',
    detail: 'Calendar source configured read-only. Events load directly in the Calendar view.',
    checked_at: checkedAt,
  };
}

export async function GET(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  const checkedAt = new Date().toISOString();
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const caseKey = url.searchParams.get('case_key') ?? '';
  const initialLimit = cleanLimit(url.searchParams.get('limit'), caseKey ? 2000 : 750);
  const sourceChecks = caseKey
    ? []
    : [
        checkGoogleSheet(checkedAt),
        checkGoogleCalendar(checkedAt),
        checkSmbShare(checkedAt),
        Promise.resolve({
          id: 'remotepc',
          label: 'RemotePC Observation',
          status: 'not_configured' as const,
          mode: 'read_only' as const,
          detail: 'Observation-only source. No dashboard automation writes through RemotePC.',
          checked_at: checkedAt,
        }),
      ];
  const [feed, itemAudit, ...sources] = await Promise.all([
    getItems({ limit: initialLimit, query, caseKey }),
    getRecentItemAudit(),
    ...sourceChecks,
  ]);

  return NextResponse.json({
    items: feed.items,
    meta: feed.meta,
    item_audit: itemAudit,
    sources,
  });
}
