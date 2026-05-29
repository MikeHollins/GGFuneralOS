import { NextResponse } from 'next/server';
import { isAuthError, requireStaff } from '@/lib/authz';
import { syncMasterSheet } from '@/lib/master-sheet-sync';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await requireStaff();
  if (isAuthError(session)) return session;

  try {
    const url = new URL(request.url);
    const force = ['1', 'true', 'yes'].includes((url.searchParams.get('force') ?? '').toLowerCase());
    const result = await syncMasterSheet({ force });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master sheet sync failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
