import { NextResponse } from 'next/server';
import { syncMasterSheet } from '@/lib/master-sheet-sync';

export const runtime = 'nodejs';
// The full sheet read + upsert can take ~40-60s; give it headroom (Pro allows up to 300s).
export const maxDuration = 120;

// Scheduled auto-ingestion. Vercel Cron invokes this with `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set, so the endpoint is secret-gated and not publicly callable. It only
// READS Golden Gate's sheet and writes our own Neon — never their sheet/server/SMB. syncMasterSheet
// is idempotent and guarded by an advisory lock + cooldown, so overlapping or rapid invocations are
// safe. force is intentionally omitted so the cooldown can short-circuit redundant back-to-back runs.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncMasterSheet({});
    return NextResponse.json({ data: result, ran_at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduled sync failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
