import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { isAuthError, requireOwner } from '@/lib/authz';
import { getSql } from '@/lib/db';
import { hashInviteToken } from '@/lib/passwords';

export const runtime = 'nodejs';

export async function GET() {
  const session = await requireOwner();
  if (isAuthError(session)) return session;

  const sql = getSql();
  const rows = await sql(
    `SELECT id, first_name, last_name, contact_email, contact_phone, role, status, expires_at, claimed_at, created_at
     FROM staff_invites
     ORDER BY created_at DESC
     LIMIT 25`,
  );

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await requireOwner();
  if (isAuthError(session)) return session;

  try {
    const body = await request.json();
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const phone = String(body.phone || '').trim() || null;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First and last name are required' }, { status: 400 });
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInviteToken(token);
    const sql = getSql();
    const rows = await sql(
      `INSERT INTO staff_invites
         (token_hash, first_name, last_name, contact_email, contact_phone, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'staff', $6, now() + interval '14 days')
       RETURNING id, first_name, last_name, contact_email, contact_phone, role, status, expires_at, created_at`,
      [tokenHash, firstName, lastName, null, phone, session.staff_id],
    );

    const claimUrl = new URL(`/claim/${token}`, request.url).toString();
    return NextResponse.json({ data: rows[0], claim_url: claimUrl }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
