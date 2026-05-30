import { NextResponse } from 'next/server';
import { syncObituaries } from '@/lib/obituary-ingest';

export const runtime = 'nodejs';
export const maxDuration = 300; // paginating ~44 pages + matching ~4.4k records

// Scheduled DOB/DOD enrichment from Golden Gate's public obituary API (Tukios). Secret-gated like
// the sheet cron (Vercel sends Authorization: Bearer $CRON_SECRET). Reads the public API + writes
// our Neon only (fill-only-empty, audited). Pass ?dry=1 to report matches without writing.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const dry = ['1', 'true', 'yes'].includes((new URL(request.url).searchParams.get('dry') ?? '').toLowerCase());
    const result = await syncObituaries({ apply: !dry });
    return NextResponse.json({ data: { ...result, mode: dry ? 'dry' : 'apply' }, ran_at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Obituary sync failed' }, { status: 502 });
  }
}
