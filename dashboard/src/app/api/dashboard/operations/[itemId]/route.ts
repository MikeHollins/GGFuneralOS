import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { sanitizeSourcePayload } from '@/lib/operation-items';

const editableFields = new Set(['label', 'detail', 'owner', 'due', 'date_of_birth', 'date_of_death']);
const selectableColumns = new Set(['label', 'detail', 'owner', 'due_text', 'date_of_birth', 'date_of_death']);

function cleanValue(field: string, value: unknown) {
  const text = String(value ?? '').trim();
  if (field === 'label' && !text) throw new Error('Label is required');
  if (field === 'date_of_birth' || field === 'date_of_death') {
    if (!text) return ''; // clearing is allowed
    const label = field === 'date_of_birth' ? 'Date of birth' : 'Date of death';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must be in YYYY-MM-DD format`);
    const [year, month, day] = text.split('-').map(Number);
    const parsed = new Date(year, month - 1, day, 12);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) throw new Error(`Invalid ${label.toLowerCase()}`);
    if (parsed.getTime() > Date.now()) throw new Error(`${label} cannot be in the future`);
  }
  return text;
}

function columnForField(field: string) {
  if (field === 'due') return 'due_text';
  return field;
}

function displayStaffName(session: { first_name: string; last_name: string; username?: string | null }) {
  const fullName = `${session.first_name} ${session.last_name}`.trim();
  return fullName || session.username || 'Staff';
}

function toDashboardItem(row: any) {
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
    status: row.status_default,
    priority: row.priority,
    options: Array.isArray(row.options) ? row.options : [],
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const { itemId } = await context.params;
    const body = await request.json();
    const field = String(body.field || '').trim();
    if (!editableFields.has(field)) return NextResponse.json({ error: 'Field is not editable' }, { status: 400 });

    const value = cleanValue(field, body.value);
    const sql = getSql();
    const column = columnForField(field);
    if (!selectableColumns.has(column)) return NextResponse.json({ error: 'Field is not editable' }, { status: 400 });

    const currentRows = await sql(
      `SELECT item_id, area, label, detail, owner, due_text, source, source_ref, source_payload, date_of_birth, date_of_death, source_case_number, status_default, priority, options
       FROM operational_items
       WHERE item_id = $1 AND is_archived = false`,
      [itemId],
    );
    const current = currentRows[0] as any;
    if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const oldValue = String(current[column] ?? '');
    if (oldValue === value) {
      return NextResponse.json({
        data: toDashboardItem(current),
        audit: null,
        changed: false,
      });
    }

    const rows = await sql(
      `UPDATE operational_items
       SET ${column} = $1,
           edited_fields = edited_fields || jsonb_build_object($3::text, true),
           updated_at = now()
       WHERE item_id = $2 AND is_archived = false
       RETURNING item_id, area, label, detail, owner, due_text, source, source_ref, source_payload, date_of_birth, date_of_death, source_case_number, status_default, priority, options`,
      [value, itemId, field],
    );

    if (!rows[0]) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const updated = rows[0] as any;
    const auditRows = await sql(
      `INSERT INTO operational_item_audit
         (item_id, item_label, area, source, field_name, old_value, new_value, staff_id, staff_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        updated.item_id,
        updated.label,
        updated.area,
        updated.source,
        field,
        oldValue,
        value,
        session.staff_id,
        displayStaffName(session),
      ],
    );

    return NextResponse.json({
      data: toDashboardItem(updated),
      audit: auditRows[0] ?? null,
      changed: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
