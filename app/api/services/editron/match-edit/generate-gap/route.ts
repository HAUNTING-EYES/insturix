/**
 * Match Edit gap generation is deliberately unavailable.
 *
 * Do not reconnect a media provider in this route. Product activation must
 * first compose the accepted MatchPlan, CreditsService, ProjectService, and
 * generated-media proof owners so one authorized operation has one receipt.
 */

import { auth } from '@clerk/nextjs/server';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: false,
    code: 'MATCH_EDIT_GAP_GENERATION_UNAVAILABLE',
    disposition: 'CAPABILITY_GAP',
    retryable: false,
    error: 'Match Edit gap generation is unavailable until its accepted plan, credits, project mutation, and proof owners are connected.',
  }, { status: 501 });
}
