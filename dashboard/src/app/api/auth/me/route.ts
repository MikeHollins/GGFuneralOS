import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    staff: {
      id: session.staff_id,
      first_name: session.first_name,
      last_name: session.last_name,
      role: session.role,
      username: session.username,
      email: session.email,
    },
  });
}
