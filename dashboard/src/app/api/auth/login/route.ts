import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { hashPin } from '@/lib/passwords';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const sql = getSql();
    const body = await request.json();
    const username = String(body.username || '').trim().toLowerCase();
    const pin = String(body.pin || '').trim();

    if (!username) return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 6 digits' }, { status: 400 });

    const rows = await sql(
      'SELECT * FROM staff WHERE lower(username) = $1 AND pin_hash = $2 AND is_active = true',
      [username, hashPin(pin)],
    );
    if (!rows[0]) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const staff = rows[0];
    const role = staff.role === 'owner' ? 'owner' : 'staff';
    await sql('UPDATE staff SET last_login = now() WHERE id = $1', [staff.id]);

    const token = await signSession({
      staff_id: staff.id,
      role,
      first_name: staff.first_name,
      last_name: staff.last_name,
      username: staff.username,
      email: staff.email,
    });

    const response = NextResponse.json({
      staff: {
        id: staff.id,
        first_name: staff.first_name,
        last_name: staff.last_name,
        role,
        username: staff.username,
        email: staff.email,
      },
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
