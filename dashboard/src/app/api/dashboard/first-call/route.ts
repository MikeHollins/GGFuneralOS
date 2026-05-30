import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { caseGroupKey, caseMatchKey, yearFromDate } from '@/lib/case-identity';
import { statusOptions } from '@/lib/operation-items';

export const runtime = 'nodejs';

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function bool(value: unknown) {
  return value === true || value === 'true' || value === 'yes' || value === 1 || value === '1';
}
function oneOf(value: unknown, allowed: string[], fallback: string) {
  const v = clean(value, 40).toLowerCase();
  return allowed.includes(v) ? v : fallback;
}
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Suggested next case number for the current year: highest Death-Certificate YY-NNN + 1. The
// death-cert log is Golden Gate's authoritative case register (every case — cremation or burial —
// gets a death cert), so a new first call takes the next number in THAT sequence, not the crematory
// counter (which runs far ahead and includes cremations for other homes). Director can override.
export async function GET() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;
  const sql = getSql();
  const yy = String(new Date().getFullYear()).slice(2);
  const rows = await sql(
    `SELECT max(split_part(source_case_number, '-', 2)::int) AS max_seq
     FROM operational_items
     WHERE is_archived = false AND source ILIKE '%death cert%' AND source_case_number ~ $1`,
    [`^${yy}-[0-9]{3,4}$`],
  );
  const next = Number(rows[0]?.max_seq ?? 0) + 1;
  return NextResponse.json({ data: { suggested_case_number: `${yy}-${String(next).padStart(3, '0')}` } });
}

export async function POST(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();

    // --- Fail-closed validation: a case cannot open without the legal-clock date, a legal next of
    // kin, the deceased's last name, or staff initials. (Mirrors §9 fail-closed for the MoEVR clock.)
    const first = clean(body.deceased_first, 80);
    const middle = clean(body.deceased_middle, 80);
    const last = clean(body.deceased_last, 80);
    const suffix = clean(body.deceased_suffix, 16);
    const dod = clean(body.date_of_death, 10);
    const nokName = clean(body.nok_name, 120);
    const caseNumber = clean(body.case_number, 20);
    const initials = clean(body.created_by_initials, 5).toUpperCase();

    if (!last) return NextResponse.json({ error: "Deceased's last name is required" }, { status: 400 });
    if (!ISO_DATE.test(dod)) return NextResponse.json({ error: 'Date of death (YYYY-MM-DD) is required — it starts the Missouri filing clock' }, { status: 400 });
    if (!nokName) return NextResponse.json({ error: 'Legal next of kin name is required' }, { status: 400 });
    if (!initials) return NextResponse.json({ error: 'Staff initials are required' }, { status: 400 });

    // Name in "Last, First Middle Suffix" form so the canonical key threads with Golden Gate's
    // death-cert/crematory rows (which store last-first), via the shared identity helpers (§13).
    const displayName = `${last}, ${[first, middle, suffix].filter(Boolean).join(' ')}`.replace(/,\s*$/, '');
    const deathYear = yearFromDate(dod);
    const caseKey = caseGroupKey(displayName, deathYear);
    const matchKey = caseMatchKey(displayName);
    const itemId = `firstcall-${randomUUID()}`;

    const dob = clean(body.date_of_birth, 10);
    const dispositionIntent = oneOf(body.disposition_intent, ['burial', 'cremation', 'undecided'], 'undecided');
    const pacemaker = oneOf(body.pacemaker_present, ['yes', 'no', 'unknown'], 'unknown');
    const embalm = oneOf(body.embalm_permission, ['yes', 'no', 'pending'], 'pending');

    const sql = getSql();

    // 1) Board projection — an operational_items row tagged source_origin='ggfuneralos' so the sheet
    //    sync never archives/overwrites it; keyed by the canonical name+death-year so it merges with
    //    Golden Gate's later sheet rows for the same person.
    const payload = {
      case_group_key: caseKey,
      case_match_key: matchKey,
      case_year: deathYear ?? '',
      identity_status: 'resolved',
      identity_basis: 'first-call intake',
      first_call: 'true',
      name: displayName,
      ...(caseNumber ? { source_case_number: caseNumber } : {}),
    };
    // All four writes run as ONE atomic transaction: a first call either fully opens a case (board
    // row + intake snapshot + NOK contact + workflow step) or nothing is written — never a half-made
    // case if one statement fails. The neon HTTP driver runs the array under a single BEGIN/COMMIT.
    await sql.transaction([
    sql(
      `INSERT INTO operational_items
         (item_id, area, label, detail, owner, due_text, source, status_default, priority, options,
          source_origin, source_ref, source_payload, source_seen_at, date_of_birth, date_of_death,
          source_case_number, business_date, updated_at, created_at)
       VALUES ($1,'arrangement',$2,'',$3,'','First Call','Unconfirmed','normal',$4::jsonb,
          'ggfuneralos',$1,$5::jsonb, now(), $6, $7, $9, $8::date, now(), now())`,
      [itemId, displayName, nokName, JSON.stringify(statusOptions.arrangement), JSON.stringify(payload), dob || null, dod, dod, caseNumber || null],
    ),

    // 2) System-of-record — the immutable first-call intake snapshot.
    sql(
      `INSERT INTO first_call_intake
         (case_key, operational_item_id, deceased_first, deceased_middle, deceased_last, deceased_suffix,
          date_of_birth, date_of_death, time_of_death, sex,
          death_place_type, death_facility_name, death_address, pronounced, pronounced_by, me_involved,
          caller_name, caller_phone, caller_relationship, nok_name, nok_phone, nok_email, nok_relationship,
          pickup_location, ready_for_pickup, release_authorized, embalm_permission, removal_team,
          disposition_intent, pacemaker_present, prearrangement,
          arrangement_conference_at, director_assigned, notes, created_by_initials, case_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
          $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)`,
      [
        caseKey, itemId, first, middle, last, suffix,
        dob || null, dod, clean(body.time_of_death, 20) || null, clean(body.sex, 20) || null,
        clean(body.death_place_type, 40) || null, clean(body.death_facility_name, 160) || null, clean(body.death_address, 300) || null,
        bool(body.pronounced), clean(body.pronounced_by, 120) || null, bool(body.me_involved),
        clean(body.caller_name, 120) || null, clean(body.caller_phone, 40) || null, clean(body.caller_relationship, 80) || null,
        nokName, clean(body.nok_phone, 40) || null, clean(body.nok_email, 160) || null, clean(body.nok_relationship, 80) || null,
        clean(body.pickup_location, 300) || null, bool(body.ready_for_pickup), bool(body.release_authorized), embalm, clean(body.removal_team, 120) || null,
        dispositionIntent, pacemaker, bool(body.prearrangement),
        clean(body.arrangement_conference_at, 40) || null, clean(body.director_assigned, 120) || null, clean(body.notes, 1000), initials, caseNumber || null,
      ],
    ),

    // 3) Canonical family contact (NOK) — the editable current contact the board/drawer reads.
    sql(
      `INSERT INTO case_contact_state (case_key, contact_name, relationship, phone, email, notes, staff_initials, updated_at)
       VALUES ($1,$2,$3,$4,$5,'',$6, now())
       ON CONFLICT (case_key) DO UPDATE SET
         contact_name = EXCLUDED.contact_name, relationship = EXCLUDED.relationship,
         phone = EXCLUDED.phone, email = EXCLUDED.email, staff_initials = EXCLUDED.staff_initials, updated_at = now()`,
      [caseKey, nokName, clean(body.nok_relationship, 80), clean(body.nok_phone, 40), clean(body.nok_email, 160), initials],
    ),

    // 4) Workflow — first-call step is done by definition once the intake is captured.
    sql(
      `INSERT INTO case_workflow_state (case_key, step_id, state, staff_initials, note, updated_at)
       VALUES ($1,'first-call','done',$2,'First call intake recorded', now())
       ON CONFLICT (case_key, step_id) DO UPDATE SET state = 'done', staff_initials = EXCLUDED.staff_initials, updated_at = now()`,
      [caseKey, initials],
    ),
    ]);

    return NextResponse.json({ data: { case_key: caseKey, item_id: itemId, name: displayName, date_of_death: dod } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record first call';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
