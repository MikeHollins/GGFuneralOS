import { NextResponse } from 'next/server';
import { getSession, type StaffSession } from './session';

export async function requireStaff(): Promise<StaffSession | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}

export async function requireOwner(): Promise<StaffSession | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'owner') return NextResponse.json({ error: 'Owner permission required' }, { status: 403 });
  return session;
}

export function isAuthError(value: StaffSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
