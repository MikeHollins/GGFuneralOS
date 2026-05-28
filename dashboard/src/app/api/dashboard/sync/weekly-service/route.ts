import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { syncWeeklyServiceSchedule } from '@/lib/weekly-service-sync';

export const runtime = 'nodejs';

export async function POST() {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const result = await syncWeeklyServiceSchedule();
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Weekly Service Schedule sync failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
