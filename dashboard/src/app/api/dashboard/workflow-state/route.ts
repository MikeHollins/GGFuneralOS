import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';

const ALLOWED_STATES = new Set(['done', 'pending', 'auto']);

export async function GET() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  const sql = getSql();
  const [data, audit] = await Promise.all([
    sql('SELECT case_key, step_id, state, staff_initials, note, updated_at FROM case_workflow_state'),
    sql('SELECT * FROM case_workflow_audit ORDER BY created_at DESC LIMIT 50'),
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
    const stepId = String(body.step_id ?? '').trim();
    const state = String(body.state ?? '').trim();
    const initials = String(body.staff_initials ?? '').trim().slice(0, 5);
    const note = String(body.note ?? '').trim().slice(0, 500);

    if (!caseKey || !stepId) return NextResponse.json({ error: 'case_key and step_id are required' }, { status: 400 });
    if (!ALLOWED_STATES.has(state)) return NextResponse.json({ error: 'state must be done, pending, or auto' }, { status: 400 });

    const sql = getSql();
    const existing = await sql('SELECT state FROM case_workflow_state WHERE case_key = $1 AND step_id = $2', [caseKey, stepId]);
    const oldState: string = existing[0]?.state ?? 'auto';
    if (oldState === state) {
      return NextResponse.json({ data: state === 'auto' ? null : existing[0], audit: null, changed: false });
    }

    let row: any = null;
    if (state === 'auto') {
      // Revert to auto-derived: remove the manual override.
      await sql('DELETE FROM case_workflow_state WHERE case_key = $1 AND step_id = $2', [caseKey, stepId]);
    } else {
      const upserted = await sql(
        `INSERT INTO case_workflow_state (case_key, step_id, state, staff_initials, note, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (case_key, step_id) DO UPDATE SET
           state = EXCLUDED.state,
           staff_initials = EXCLUDED.staff_initials,
           note = EXCLUDED.note,
           updated_at = now()
         RETURNING case_key, step_id, state, staff_initials, note, updated_at`,
        [caseKey, stepId, state, initials, note],
      );
      row = upserted[0];
    }

    const auditRows = await sql(
      `INSERT INTO case_workflow_audit (case_key, case_name, step_id, old_state, new_state, staff_initials)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [caseKey, caseName, stepId, oldState, state, initials],
    );

    return NextResponse.json({ data: row, audit: auditRows[0] ?? null, changed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save workflow state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
