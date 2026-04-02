/**
 * POST /api/services/editron/director/execute
 *
 * Execute a Director Agent plan on an Editron project.
 * Applies an edit profile's action sequence deterministically.
 *
 * Body: { projectId, editProfileId, brief? }
 * Returns: DirectorResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { executeDirectorPlan } from '@/lib/editron/agent/director-agent';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 120; // Director Agent should complete within 2 minutes

export async function POST(request: NextRequest) {
  try {
    // Auth: Clerk (user-initiated) OR QStash internal (auto-run after finalize)
    let userId: string | null = null;

    const { userId: clerkUserId } = await auth();
    if (clerkUserId) {
      userId = clerkUserId;
    }

    // If Clerk auth failed, check for internal QStash dispatch (from finalize route)
    const body = await request.json();
    if (!userId && body._internal && body.userId) {
      // Verify this is a legitimate internal call (QStash signature verified by middleware,
      // or in dev mode trust the _internal flag)
      const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
      const hasQStashHeaders = request.headers.get('upstash-signature') || request.headers.get('upstash-message-id');
      if (isDev || hasQStashHeaders) {
        userId = body.userId;
        console.log(`[Director] Internal dispatch for user ${userId} (auto-run after finalize)`);
      }
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: skip for internal auto-run (already rate-limited at finalize)
    if (!body._internal) {
      const rl = await checkExpensiveRateLimit(userId);
      if (!rl.success) {
        return NextResponse.json(
          { success: false, error: 'Rate limit exceeded. Please wait before running another director execution.' },
          { status: 429, headers: { 'X-RateLimit-Reset': String(rl.reset) } },
        );
      }
    }

    const { projectId, editProfileId, brief } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }
    if (!editProfileId) {
      return NextResponse.json({ success: false, error: 'editProfileId is required' }, { status: 400 });
    }

    console.log(`[Director] Executing profile ${editProfileId} on project ${projectId}`);

    const result = await executeDirectorPlan(
      projectId,
      userId,
      editProfileId,
      brief,
    );

    return NextResponse.json({
      ...result,
      success: result.success,
    });
  } catch (error: any) {
    console.error('[Director] Route error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Director Agent execution failed' },
      { status: 500 },
    );
  }
}
