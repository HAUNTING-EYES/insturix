/**
 * POST /api/trends/request — record a user's request for a trend (feeds the demand signal, §7.4).
 * The ≥100-distinct-user gate is applied downstream by the ranker; this route just records one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { recordTrendRequest } from '@/lib/trends/demand';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { trendKey?: unknown };
  const trendKey = typeof body.trendKey === 'string' ? body.trendKey.trim() : '';
  if (!trendKey) {
    return NextResponse.json({ error: 'trendKey is required' }, { status: 400 });
  }

  await recordTrendRequest(trendKey, userId);
  return NextResponse.json({ success: true }, { status: 200 });
}
