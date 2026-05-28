import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { hashInviteToken, hashPin } from '@/lib/passwords';

export const runtime = 'nodejs';

function tokenFromRequest(request: Request, body?: any) {
  const url = new URL(request.url);
  return String(body?.token || url.searchParams.get('token') || '').trim();
}

export async function GET(request: Request) {
  try {
    const token = tokenFromRequest(request);
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

    const sql = getSql();
    const rows = await sql(
      `SELECT first_name, last_name, contact_email, contact_phone, status, expires_at
       FROM staff_invites
       WHERE token_hash = $1`,
      [hashInviteToken(token)],
    );
    const invite = rows[0] as any;
    if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite is invalid or expired' }, { status: 404 });
    }

    return NextResponse.json({ invite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = tokenFromRequest(request, body);
    const username = String(body.username || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim() || null;
    const pin = String(body.pin || '').trim();

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-32 letters, numbers, dots, dashes, or underscores' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 });

    const sql = getSql();
    const inviteRows = await sql(
      `SELECT *
       FROM staff_invites
       WHERE token_hash = $1`,
      [hashInviteToken(token)],
    );
    const invite = inviteRows[0] as any;
    if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite is invalid or expired' }, { status: 404 });
    }

    const existing = await sql('SELECT id FROM staff WHERE lower(username) = $1', [username]);
    if (existing[0]) return NextResponse.json({ error: 'A staff account already uses this username' }, { status: 409 });

    const pinHash = hashPin(pin);
    const role = invite.role === 'owner' ? 'owner' : 'staff';
    const staffRows = await sql(
      `INSERT INTO staff (first_name, last_name, username, email, phone, pin_hash, role, is_active)
       VALUES ($1, $2, $3, null, $4, $5, $6, true)
       RETURNING id, first_name, last_name, username, email, role`,
      [invite.first_name, invite.last_name, username, phone || invite.contact_phone || null, pinHash, role],
    );

    await sql(
      `UPDATE staff_invites
       SET status = 'claimed', claimed_by = $1, claimed_at = now()
       WHERE id = $2`,
      [staffRows[0].id, invite.id],
    );

    return NextResponse.json({ staff: staffRows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not claim invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
