import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { MILESTONE_KEY_ALLOWLIST } from '@/lib/milestone-definitions';

export const runtime = 'nodejs';

const MILESTONE_KEYS = new Set(MILESTONE_KEY_ALLOWLIST);

export async function GET() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  const sql = getSql();
  const [data, audit] = await Promise.all([
    sql('SELECT case_key, milestone_key, value, is_na, staff_initials, updated_at FROM case_milestones'),
    sql('SELECT * FROM case_milestone_audit ORDER BY created_at DESC LIMIT 50'),
  ]);
  return NextResponse.json({ data, audit });
}

export async function POST(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const caseKey = String(body.case_key ?? '').trim();
    const caseName = String(body.case_name ?? '').trim();
    const milestoneKey = String(body.milestone_key ?? '').trim();
    const value = String(body.value ?? '').trim().slice(0, 200);
    const isNa = Boolean(body.is_na);
    const initials = String(body.staff_initials ?? '').trim().slice(0, 5);

    if (!caseKey || !milestoneKey) return NextResponse.json({ error: 'case_key and milestone_key are required' }, { status: 400 });
    if (!MILESTONE_KEYS.has(milestoneKey)) return NextResponse.json({ error: 'Unknown milestone' }, { status: 400 });

    // Clearing the override (revert to the source-derived value) = empty value + not N/A.
    const clearing = !isNa && !value;
    // Audit-tracked change: setting a value or N/A requires staff initials.
    if (!clearing && !initials) return NextResponse.json({ error: 'Staff initials are required to set a milestone' }, { status: 400 });

    const sql = getSql();
    const existing = await sql('SELECT value, is_na FROM case_milestones WHERE case_key = $1 AND milestone_key = $2', [caseKey, milestoneKey]);
    const oldLabel = existing[0] ? (existing[0].is_na ? 'N/A' : existing[0].value) : 'source';
    const newLabel = clearing ? 'source' : isNa ? 'N/A' : value;
    if (oldLabel === newLabel) {
      return NextResponse.json({ data: clearing ? null : existing[0], audit: null, changed: false });
    }

    let row: any = null;
    if (clearing) {
      await sql('DELETE FROM case_milestones WHERE case_key = $1 AND milestone_key = $2', [caseKey, milestoneKey]);
    } else {
      const upserted = await sql(
        `INSERT INTO case_milestones (case_key, milestone_key, value, is_na, staff_initials, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (case_key, milestone_key) DO UPDATE SET
           value = EXCLUDED.value,
           is_na = EXCLUDED.is_na,
           staff_initials = EXCLUDED.staff_initials,
           updated_at = now()
         RETURNING case_key, milestone_key, value, is_na, staff_initials, updated_at`,
        [caseKey, milestoneKey, isNa ? '' : value, isNa, initials],
      );
      row = upserted[0];
    }

    const auditRows = await sql(
      `INSERT INTO case_milestone_audit (case_key, case_name, milestone_key, old_value, new_value, staff_initials)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [caseKey, caseName, milestoneKey, oldLabel, newLabel, initials],
    );

    return NextResponse.json({ data: row, audit: auditRows[0] ?? null, changed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save milestone';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
