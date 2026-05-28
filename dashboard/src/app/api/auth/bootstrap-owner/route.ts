import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { hashPin } from '@/lib/passwords';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const bootstrapSecret = process.env.OWNER_BOOTSTRAP_SECRET;
    if (!bootstrapSecret) {
      return NextResponse.json({ error: 'Owner bootstrap is not enabled' }, { status: 404 });
    }

    const body = await request.json();
    if (String(body.bootstrap_secret || '') !== bootstrapSecret) {
      return NextResponse.json({ error: 'Invalid bootstrap secret' }, { status: 401 });
    }

    const sql = getSql();
    const existingOwner = await sql("SELECT id FROM staff WHERE role = 'owner' AND is_active = true LIMIT 1");
    if (existingOwner[0]) return NextResponse.json({ error: 'Owner already exists' }, { status: 409 });

    const firstName = String(body.first_name || 'DiMond').trim();
    const lastName = String(body.last_name || 'Piggie').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim() || null;
    const pin = String(body.pin || '').trim();

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return NextResponse.json({ error: 'Username must be 3-32 letters, numbers, dots, dashes, or underscores' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be exactly 6 digits' }, { status: 400 });

    const rows = await sql(
      `INSERT INTO staff (first_name, last_name, username, phone, pin_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'owner', true)
       RETURNING id, first_name, last_name, username, role`,
      [firstName, lastName, username, phone, hashPin(pin)],
    );

    return NextResponse.json({ staff: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not bootstrap owner';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
