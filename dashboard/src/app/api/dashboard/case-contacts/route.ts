import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function auditSafe(value: string, kind: 'phone' | 'email' | 'text') {
  if (!value) return '';
  if (kind === 'phone') {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 4 ? `phone ending ${digits.slice(-4)}` : 'phone on file';
  }
  if (kind === 'email') {
    const [user, domain] = value.split('@');
    if (!user || !domain) return 'email on file';
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return value;
}

function contactLabel(contact: { contact_name?: string; relationship?: string; phone?: string; email?: string; notes?: string } | null) {
  if (!contact) return 'source';
  const parts = [
    auditSafe(clean(contact.contact_name, 120), 'text'),
    auditSafe(clean(contact.relationship, 80), 'text'),
    auditSafe(clean(contact.phone, 40), 'phone'),
    auditSafe(clean(contact.email, 160), 'email'),
    clean(contact.notes, 500) ? 'notes' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : 'source';
}

export async function GET() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  const sql = getSql();
  const [data, audit] = await Promise.all([
    sql('SELECT case_key, contact_name, relationship, phone, email, notes, staff_initials, updated_at FROM case_contact_state'),
    sql('SELECT * FROM case_contact_audit ORDER BY created_at DESC LIMIT 50'),
  ]);
  return NextResponse.json({ data, audit });
}

export async function POST(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const caseKey = clean(body.case_key, 180);
    const caseName = clean(body.case_name, 180);
    const contactName = clean(body.contact_name, 120);
    const relationship = clean(body.relationship, 80);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 160);
    const notes = clean(body.notes, 500);
    const initials = clean(body.staff_initials, 5).toUpperCase();

    if (!caseKey) return NextResponse.json({ error: 'case_key is required' }, { status: 400 });
    if (!initials) return NextResponse.json({ error: 'Staff initials are required to update family contact' }, { status: 400 });

    const clearing = !contactName && !relationship && !phone && !email && !notes;
    const sql = getSql();
    const existing = await sql('SELECT contact_name, relationship, phone, email, notes FROM case_contact_state WHERE case_key = $1', [caseKey]);
    const oldLabel = contactLabel(existing[0] ?? null);
    const newLabel = clearing ? 'source' : contactLabel({
      contact_name: contactName,
      relationship,
      phone,
      email,
      notes,
    });

    if (oldLabel === newLabel) {
      return NextResponse.json({ data: clearing ? null : existing[0] ?? null, audit: null, changed: false });
    }

    let row: any = null;
    if (clearing) {
      await sql('DELETE FROM case_contact_state WHERE case_key = $1', [caseKey]);
    } else {
      const rows = await sql(
        `INSERT INTO case_contact_state (case_key, contact_name, relationship, phone, email, notes, staff_initials, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (case_key) DO UPDATE SET
           contact_name = EXCLUDED.contact_name,
           relationship = EXCLUDED.relationship,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           notes = EXCLUDED.notes,
           staff_initials = EXCLUDED.staff_initials,
           updated_at = now()
         RETURNING case_key, contact_name, relationship, phone, email, notes, staff_initials, updated_at`,
        [caseKey, contactName, relationship, phone, email, notes, initials],
      );
      row = rows[0] ?? null;
    }

    const auditRows = await sql(
      `INSERT INTO case_contact_audit (case_key, case_name, old_value, new_value, staff_initials)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [caseKey, caseName, oldLabel, newLabel, initials],
    );

    return NextResponse.json({ data: row, audit: auditRows[0] ?? null, changed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save family contact';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
