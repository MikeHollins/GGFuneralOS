import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { listGoogleCalendarEvents } from '@/lib/google-calendar-sync';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const url = new URL(request.url);
    const result = await listGoogleCalendarEvents(url.searchParams.get('start'), url.searchParams.get('end'));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Calendar events could not be loaded';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
