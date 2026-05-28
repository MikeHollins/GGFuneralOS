import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { dashboardItems, type DashboardItem } from '@/lib/operation-items';
import { probeGoogleSheetsConnection } from '@/lib/weekly-service-sync';

type SourceStatus = {
  id: string;
  label: string;
  status: 'connected' | 'not_configured' | 'unavailable';
  mode: 'read_only';
  detail: string;
  checked_at: string;
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
    sourcePayload: row.source_payload ?? {},
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

async function getItems() {
  const sql = getSql();
  await seedItemsIfEmpty();
  const rows = await sql(
    `SELECT item_id, area, label, detail, owner, due_text, source, source_ref, source_payload, status_default, priority, options
     FROM operational_items
     WHERE is_archived = false
     ORDER BY
       CASE area
         WHEN 'service' THEN 1
         WHEN 'arrangement' THEN 2
         WHEN 'death-cert' THEN 3
         WHEN 'cremains' THEN 4
         WHEN 'crematory' THEN 5
         WHEN 'belongings' THEN 6
         WHEN 'production' THEN 7
         WHEN 'paperwork' THEN 8
         ELSE 99
       END,
       created_at`,
  );
  return rows.map(toDashboardItem);
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

    return {
      id: 'google-sheet',
      label: 'Master Google Sheet',
      status: 'connected',
      mode: 'read_only',
      detail: `Private Sheets API reachable. Weekly Service Schedule has ${result.row_count} visible rows.`,
      checked_at: checkedAt,
    };
  } catch {
    return {
      id: 'google-sheet',
      label: 'Master Google Sheet',
      status: 'unavailable',
      mode: 'read_only',
      detail: 'Configured read-only CSV export could not be reached.',
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

export async function GET() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  const checkedAt = new Date().toISOString();
  const [items, itemAudit, ...sources] = await Promise.all([
    getItems(),
    getRecentItemAudit(),
    checkGoogleSheet(checkedAt),
    checkSmbShare(checkedAt),
    Promise.resolve({
      id: 'remotepc',
      label: 'RemotePC Observation',
      status: 'not_configured' as const,
      mode: 'read_only' as const,
      detail: 'Observation-only source. No dashboard automation writes through RemotePC.',
      checked_at: checkedAt,
    }),
  ]);

  return NextResponse.json({
    items,
    item_audit: itemAudit,
    sources,
  });
}
