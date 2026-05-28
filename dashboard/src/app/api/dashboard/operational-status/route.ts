import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  return neon(databaseUrl);
}

function normalizeItemIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const sql = getSql();
    const url = new URL(request.url);
    const itemIds = normalizeItemIds(url.searchParams.get('item_ids'));

    const statuses = itemIds.length
      ? await sql('SELECT * FROM operational_statuses WHERE item_id = ANY($1) ORDER BY updated_at DESC', [itemIds])
      : await sql('SELECT * FROM operational_statuses ORDER BY updated_at DESC');

    const audit = itemIds.length
      ? await sql(
          `SELECT *
           FROM operational_status_audit
           WHERE item_id = ANY($1)
           ORDER BY created_at DESC
           LIMIT 50`,
          [itemIds],
        )
      : await sql(
          `SELECT *
           FROM operational_status_audit
           ORDER BY created_at DESC
           LIMIT 50`,
        );

    return NextResponse.json({ data: statuses, audit });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const sql = getSql();
    const body = await request.json();
    const itemId = String(body.item_id || '').trim();
    const itemLabel = String(body.item_label || '').trim();
    const status = String(body.status || '').trim();
    const staffInitials = String(body.staff_initials || '').trim().toUpperCase();
    const area = body.area ? String(body.area).trim() : null;
    const source = body.source ? String(body.source).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    if (!itemId) return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    if (!itemLabel) return NextResponse.json({ error: 'item_label is required' }, { status: 400 });
    if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
    if (!staffInitials) return NextResponse.json({ error: 'staff_initials is required' }, { status: 400 });
    if (staffInitials.length > 5) {
      return NextResponse.json({ error: 'staff_initials must be 5 characters or fewer' }, { status: 400 });
    }

    const previousRows = await sql('SELECT status FROM operational_statuses WHERE item_id = $1', [itemId]);
    const previous = previousRows[0] as { status?: string } | undefined;

    if (previous?.status === status) {
      const currentRows = await sql('SELECT * FROM operational_statuses WHERE item_id = $1', [itemId]);
      return NextResponse.json({ data: currentRows[0] ?? null, audit: null, changed: false });
    }

    const currentRows = await sql(
      `INSERT INTO operational_statuses
         (item_id, item_label, area, source, status, staff_initials, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (item_id) DO UPDATE SET
         item_label = EXCLUDED.item_label,
         area = EXCLUDED.area,
         source = EXCLUDED.source,
         status = EXCLUDED.status,
         staff_initials = EXCLUDED.staff_initials,
         updated_at = now()
       RETURNING *`,
      [itemId, itemLabel, area, source, status, staffInitials],
    );

    const auditRows = await sql(
      `INSERT INTO operational_status_audit
         (item_id, item_label, area, source, old_status, new_status, staff_initials, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [itemId, itemLabel, area, source, previous?.status ?? null, status, staffInitials, note],
    );

    return NextResponse.json({ data: currentRows[0], audit: auditRows[0], changed: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
