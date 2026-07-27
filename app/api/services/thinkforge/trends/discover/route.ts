import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  discoverPublicTrendCandidates,
  TrendDiscoveryInputError,
  TrendDiscoveryUnavailableError,
} from '@/lib/thinkforge/trends/trend-discovery-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Discovers public, untrusted trend evidence. This route intentionally accepts only
 * a public niche and never forwards raw Brand Vault or user-session content.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const result = await discoverPublicTrendCandidates(body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof TrendDiscoveryInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof TrendDiscoveryUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error('[ThinkForge:TrendDiscovery] Public trend discovery failed:', error);
    return NextResponse.json(
      { error: 'Trend discovery could not be completed. Please try again.' },
      { status: 502 },
    );
  }
}
