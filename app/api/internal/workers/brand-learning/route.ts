/**
 * POST /api/internal/workers/brand-learning
 *
 * QStash worker that processes brand events from the cross-service event bus.
 * Dispatched by emitBrandEvent() in lib/shared/brand-events.ts.
 *
 * Handlers:
 *   director_completed → recordProjectOutcome (bandit learning)
 *   video_rendered     → recordProjectOutcome + Post-Mortem
 *   quality_reviewed   → recordProjectOutcome (quality score update)
 *   brand_updated      → placeholder for Phase 2 registry cache invalidation
 *   *                  → log + acknowledge (scaffolding for Phase 2 wiring)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { markEventConsumed, type BrandEvent } from '@/lib/shared/brand-events';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CONSUMER_ID = 'brand-learning-worker';

interface WorkerPayload {
  eventId: string;
  event: BrandEvent;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();

  try {
    const payload: WorkerPayload = await request.json();
    const { eventId, event } = payload;

    if (!eventId || !event?.type) {
      return NextResponse.json(
        { error: 'Missing eventId or event.type' },
        { status: 400 },
      );
    }

    // Idempotency: skip if already consumed (QStash has at-least-once delivery)
    if (event.consumedBy?.includes(CONSUMER_ID)) {
      return NextResponse.json({ success: true, eventId, action: 'already_consumed' });
    }

    console.log(`[BrandLearning] Processing ${event.type} (${eventId}) for user ${event.userId}`);

    let result: { action: string; detail?: string };

    switch (event.type) {
      case 'director_completed':
        result = await handleDirectorCompleted(event);
        break;

      case 'video_rendered':
        result = await handleVideoRendered(event);
        break;

      case 'quality_reviewed':
        result = await handleQualityReviewed(event);
        break;

      case 'brand_updated':
        result = await handleBrandUpdated(event);
        break;

      case 'video_published':
        result = await handleVideoPublished(event);
        break;

      default:
        result = { action: 'acknowledged', detail: `No handler for ${event.type} yet` };
        break;
    }

    // Only mark consumed if handler succeeded — failed events should be retried by QStash
    if (!result.action.includes('_failed')) {
      await markEventConsumed(eventId, CONSUMER_ID);
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `[BrandLearning] ${event.type} → ${result.action} (${durationMs}ms)`,
    );

    return NextResponse.json({
      success: true,
      eventId,
      type: event.type,
      ...result,
      durationMs,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[BrandLearning] Worker error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}

// ==================== Event Handlers ====================

/**
 * Director completed editing a project.
 * Feed quality score into bandit for learning.
 */
async function handleDirectorCompleted(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const { userId, projectId, payload } = event;
  const qualityScore = typeof payload.qualityScore === 'number'
    ? payload.qualityScore
    : null;

  if (!projectId) {
    return { action: 'skipped', detail: 'No projectId on event' };
  }

  if (qualityScore === null) {
    return { action: 'skipped', detail: 'No qualityScore in payload' };
  }

  try {
    const { recordProjectOutcome } = await import(
      '@/lib/editron/services/genre-parameter-bandit'
    );
    await recordProjectOutcome(userId, projectId, qualityScore);
    return {
      action: 'bandit_updated',
      detail: `qualityScore=${qualityScore}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandLearning] Bandit update failed: ${msg}`);
    return { action: 'bandit_failed', detail: msg };
  }
}

/**
 * Video rendered successfully.
 * Record outcome with userRendered=true + fire Post-Mortem if session context exists.
 */
async function handleVideoRendered(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const { userId, projectId, payload } = event;
  const qualityScore = typeof payload.qualityScore === 'number'
    ? payload.qualityScore
    : null;

  if (!projectId) {
    return { action: 'skipped', detail: 'No projectId on event' };
  }

  const actions: string[] = [];

  // 1. Feed bandit with userRendered=true (only if quality score is available)
  if (qualityScore !== null) {
    try {
      const { recordProjectOutcome } = await import(
        '@/lib/editron/services/genre-parameter-bandit'
      );
      await recordProjectOutcome(userId, projectId, qualityScore, true);
      actions.push('bandit_updated(rendered)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BrandLearning] Bandit update on render failed: ${msg}`);
      actions.push(`bandit_failed: ${msg}`);
    }
  } else {
    actions.push('bandit_skipped(no_quality_score)');
  }

  // 2. Fire Post-Mortem if sessionId is available
  const sessionId = typeof payload.sessionId === 'string'
    ? payload.sessionId
    : null;

  if (sessionId) {
    try {
      const { runPostMortemAgent } = await import(
        '@/lib/thinkforge/agents/post-mortem-agent'
      );
      const pmResult = await runPostMortemAgent({
        userId,
        sessionId,
        projectTitle: typeof payload.projectName === 'string'
          ? payload.projectName
          : undefined,
      });
      actions.push(
        `post_mortem(lessons=${pmResult.lessonsExtracted})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[BrandLearning] Post-Mortem failed: ${msg}`);
      actions.push(`post_mortem_failed: ${msg}`);
    }
  }

  return { action: actions.join(', ') };
}

/**
 * Quality review completed — update bandit with the score.
 */
async function handleQualityReviewed(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const { userId, projectId, payload } = event;
  const qualityScore = typeof payload.qualityScore === 'number'
    ? payload.qualityScore
    : null;

  if (!projectId || qualityScore === null) {
    return {
      action: 'skipped',
      detail: 'Missing projectId or qualityScore',
    };
  }

  try {
    const { recordProjectOutcome } = await import(
      '@/lib/editron/services/genre-parameter-bandit'
    );
    await recordProjectOutcome(userId, projectId, qualityScore);
    return {
      action: 'bandit_updated',
      detail: `qualityScore=${qualityScore}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandLearning] Quality review bandit failed: ${msg}`);
    return { action: 'bandit_failed', detail: msg };
  }
}

/**
 * Brand updated — invalidate registry cache for this user.
 * NOTE: invalidateCache is per-process in serverless. API server cache
 * has a 5-min TTL that self-heals. This clears the worker's local cache.
 */
async function handleBrandUpdated(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  try {
    const { invalidateCache } = await import('@/lib/shared/brand-registry');
    invalidateCache(event.userId);
  } catch {
    // brand-registry may not be loadable in all contexts
  }
  return {
    action: 'cache_invalidated',
    detail: `userId=${event.userId}`,
  };
}

/**
 * Video published — update bandit with userPublished=true.
 */
async function handleVideoPublished(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const { userId, projectId, payload } = event;

  if (!projectId) {
    return { action: 'skipped', detail: 'No projectId on event' };
  }

  const qualityScore = typeof payload.qualityScore === 'number'
    ? payload.qualityScore
    : null;

  if (qualityScore === null) {
    return { action: 'skipped', detail: 'No qualityScore for publish event' };
  }

  try {
    const { recordProjectOutcome } = await import(
      '@/lib/editron/services/genre-parameter-bandit'
    );
    await recordProjectOutcome(userId, projectId, qualityScore, true, true);
    return {
      action: 'bandit_updated',
      detail: 'userRendered=true, userPublished=true',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandLearning] Publish bandit failed: ${msg}`);
    return { action: 'bandit_failed', detail: msg };
  }
}

// ==================== Export ====================

export const POST = (process.env.QSTASH_CURRENT_SIGNING_KEY || process.env.NODE_ENV === 'production')
  ? verifySignatureAppRouter(handler)
  : handler;
