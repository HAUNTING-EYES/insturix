/**
 * POST /api/services/editron/director/execute
 *
 * Execute a Director Agent plan on an Editron project.
 * Authenticated callers use Clerk; internal callers require a verified QStash payload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Receiver } from '@upstash/qstash';
import { z } from 'zod';
import { executeDirectorPlan } from '@/lib/editron/agent/director-agent';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import { checkExpensiveRateLimit } from '@/lib/editron/utils/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 300;

const directorRequestSchema = z.object({
  projectId: z.string().min(1).max(128),
  editProfileId: z.string().min(1).max(128),
  brief: z.unknown().optional(),
  _internal: z.boolean().optional(),
  userId: z.string().min(1).max(256).optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let decodedBody: unknown;
    try {
      decodedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = directorRequestSchema.safeParse(decodedBody);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid Director request' }, { status: 400 });
    }
    const body = parsed.data;
    const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
    let userId: string | null = null;

    if (body._internal) {
      if (!body.userId) {
        return NextResponse.json({ success: false, error: 'Internal userId is required' }, { status: 400 });
      }

      if (!isDev) {
        const signature = request.headers.get('upstash-signature');
        const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
        const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
        if (!currentSigningKey || !nextSigningKey) {
          console.error('[Director] QStash signing keys are not configured');
          return NextResponse.json({ success: false, error: 'Internal dispatch unavailable' }, { status: 503 });
        }
        if (!signature) {
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        try {
          const receiver = new Receiver({ currentSigningKey, nextSigningKey });
          const verified = await receiver.verify({ signature, body: rawBody });
          if (!verified) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
          }
        } catch (error) {
          console.warn('[Director] QStash signature verification failed:', error);
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
      }

      userId = body.userId;
      console.log(`[Director] Verified internal dispatch for user ${userId}`);
    } else {
      const authResult = await auth();
      userId = authResult.userId;
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!body._internal) {
      const rateLimit = await checkExpensiveRateLimit(userId);
      if (!rateLimit.success) {
        return NextResponse.json(
          { success: false, error: 'Rate limit exceeded. Please wait before running another director execution.' },
          { status: 429, headers: { 'X-RateLimit-Reset': String(rateLimit.reset) } },
        );
      }
    }

    const { projectId, editProfileId } = body;
    const brief = body.brief as ProjectBrief | undefined;
    console.log(`[Director] Executing profile ${editProfileId} on project ${projectId}`);

    const result = await executeDirectorPlan(projectId, userId, editProfileId, brief);

    return NextResponse.json({ ...result, success: result.success });
  } catch (error: unknown) {
    console.error('[Director] Route error:', error);
    const message = error instanceof Error ? error.message : 'Director Agent execution failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
