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
 *   user_override      -> stage weighted Brand Vault evidence candidates
 *   *                  → log + acknowledge (scaffolding for Phase 2 wiring)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import {
  claimEventForConsumer,
  markEventConsumed,
  releaseEventClaim,
  type BrandEvent,
} from '@/lib/shared/brand-events';
import { resolveEditronLearningOutcome } from '@/lib/editron/services/editron-learning-gate';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CONSUMER_ID = 'brand-learning-worker';

interface WorkerPayload {
  eventId: string;
  event?: BrandEvent;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  let claimedEventId: string | null = null;

  try {
    const payload = (await request.json()) as Partial<WorkerPayload>;
    const eventId = nonEmptyString(payload.eventId);

    if (!eventId) {
      return NextResponse.json(
        { error: 'Missing eventId' },
        { status: 400 },
      );
    }

    const claim = await claimEventForConsumer(eventId, CONSUMER_ID);
    if (claim.status === 'already_consumed') {
      return NextResponse.json({ success: true, eventId, action: 'already_consumed' });
    }
    if (claim.status === 'in_progress') {
      return NextResponse.json({ success: true, eventId, action: 'in_progress' });
    }
    if (claim.status === 'missing') {
      return NextResponse.json(
        { success: false, eventId, error: 'Persisted brand event not found' },
        { status: 404 },
      );
    }

    claimedEventId = eventId;
    const event = claim.event;
    const validationError = validatePersistedEvent(event, eventId);
    if (validationError) {
      await releaseEventClaim(eventId, CONSUMER_ID);
      claimedEventId = null;
      return NextResponse.json(
        { success: false, eventId, error: validationError },
        { status: 400 },
      );
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

      case 'thumbnail_created':
        result = await handleThumbnailCreated(event);
        break;

      case 'user_override':
        result = await handleUserOverride(event);
        break;

      default:
        result = { action: 'acknowledged', detail: `No handler for ${event.type} yet` };
        break;
    }

    // Only mark consumed if handler succeeded — failed events should be retried by QStash
    if (shouldRetryResult(result)) {
      await releaseEventClaim(eventId, CONSUMER_ID);
      claimedEventId = null;
      const durationMs = Date.now() - startMs;
      return NextResponse.json(
        {
          success: false,
          eventId,
          type: event.type,
          ...result,
          durationMs,
        },
        { status: 500 },
      );
    }

    await markEventConsumed(eventId, CONSUMER_ID);
    claimedEventId = null;

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
    if (claimedEventId) {
      await releaseEventClaim(claimedEventId, CONSUMER_ID).catch((releaseErr) =>
        console.error('[BrandLearning] Failed to release event claim:', releaseErr),
      );
    }
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

  const learningDecision = resolveEditronLearningOutcome({
    qualityScore,
    criticalCount: payload.criticalCount,
    hasQualityReview: payload.hasQualityReview,
    autoEditHealth: payload.autoEditHealth,
    projectStatus: payload.projectStatus,
    diagnostic: payload.diagnostic,
    dryRun: payload.dryRun,
  });

  if (!learningDecision.shouldRecord || learningDecision.qualityScore === null) {
    return {
      action: 'bandit_skipped',
      detail: `learning_gate=${learningDecision.reason ?? 'unsafe_outcome'}`,
    };
  }

  try {
    const { recordProjectOutcome } = await import(
      '@/lib/editron/services/genre-parameter-bandit'
    );
    const outcome = await recordProjectOutcome(
      userId,
      projectId,
      learningDecision.qualityScore,
      false,
      false,
      banditEvidenceOptions(payload),
    );
    if (!outcome.recorded) {
      return {
        action: 'bandit_skipped',
        detail: `learning_gate=${outcome.reason ?? 'not_recorded'}`,
      };
    }
    return {
      action: 'bandit_updated',
      detail: `qualityScore=${learningDecision.qualityScore}`,
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
      const outcome = await recordProjectOutcome(
        userId,
        projectId,
        qualityScore,
        true,
        false,
        banditEvidenceOptions(payload),
      );
      actions.push(outcome.recorded
        ? 'bandit_updated(rendered)'
        : `bandit_skipped(${outcome.reason ?? 'not_recorded'})`);
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
        projectId,
        brandId: nonEmptyString(event.brandId),
        qualityScore: qualityScore ?? undefined,
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
  let qualityScore = typeof payload.qualityScore === 'number'
    ? payload.qualityScore
    : null;

  if (qualityScore === null && typeof payload.score === 'number') {
    qualityScore = payload.score;
  }

  if (!projectId || qualityScore === null) {
    return {
      action: 'skipped',
      detail: 'Missing projectId or qualityScore',
    };
  }

  const learningDecision = resolveEditronLearningOutcome({
    qualityScore,
    criticalCount: payload.criticalCount,
    hasQualityReview: payload.hasQualityReview,
    autoEditHealth: payload.autoEditHealth,
    projectStatus: payload.projectStatus,
    diagnostic: payload.diagnostic,
    dryRun: payload.dryRun,
  });

  if (!learningDecision.shouldRecord || learningDecision.qualityScore === null) {
    return {
      action: 'bandit_skipped',
      detail: `learning_gate=${learningDecision.reason ?? 'unsafe_outcome'}`,
    };
  }

  try {
    const { recordProjectOutcome } = await import(
      '@/lib/editron/services/genre-parameter-bandit'
    );
    const outcome = await recordProjectOutcome(
      userId,
      projectId,
      learningDecision.qualityScore,
      false,
      false,
      banditEvidenceOptions(payload),
    );
    if (!outcome.recorded) {
      return {
        action: 'bandit_skipped',
        detail: `learning_gate=${outcome.reason ?? 'not_recorded'}`,
      };
    }
    return {
      action: 'bandit_updated',
      detail: `qualityScore=${learningDecision.qualityScore}`,
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
  } catch (err: unknown) {
    // brand-registry may not be loadable in all contexts
    console.warn('[BrandLearning] brand-registry cache invalidation failed:', err instanceof Error ? err.message : err);
  }
  return {
    action: 'cache_invalidated',
    detail: `userId=${event.userId}`,
  };
}

/**
 * User made a manual correction in a service UI.
 * Stage weighted Brand Vault candidates for review; do not accept as truth here.
 */
async function handleUserOverride(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const learningEvents = event.payload.learningEvents;
  if (!Array.isArray(learningEvents) || learningEvents.length === 0) {
    return { action: 'skipped', detail: 'No learningEvents in user_override payload' };
  }

  try {
    const { writeBrandSignalLearningEventsToBrandVault } = await import(
      '@/lib/shared/brand-vault-learning-events'
    );
    const result = await writeBrandSignalLearningEventsToBrandVault({
      userId: event.userId,
      brandId: nonEmptyString(event.brandId),
      projectId: nonEmptyString(event.projectId),
      sourceEventId: event.eventId,
      actorId: event.userId,
      learningEvents,
    });

    if (!result.ok) {
      return { action: 'brand_vault_failed', detail: result.error };
    }
    if (result.skipped) {
      return { action: 'brand_vault_learning_skipped', detail: result.reason };
    }
    return {
      action: 'brand_vault_learning_staged',
      detail: `jobId=${result.jobId}; recordId=${result.recordId}; candidateCount=${result.candidateCount}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandLearning] Brand Vault learning event write failed: ${msg}`);
    return { action: 'brand_vault_failed', detail: msg };
  }
}

/**
 * Video published - update bandit with userPublished=true.
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
    const outcome = await recordProjectOutcome(
      userId,
      projectId,
      qualityScore,
      true,
      true,
      banditEvidenceOptions(payload),
    );
    if (!outcome.recorded) {
      return {
        action: 'bandit_skipped',
        detail: `learning_gate=${outcome.reason ?? 'not_recorded'}`,
      };
    }
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

/**
 * Thumbnail committed in Clickatron.
 * Store the selected thumbnail as a brand-scoped Graphiti episode so future
 * thumbnail and creative decisions can learn from chosen outcomes.
 */
async function handleThumbnailCreated(
  event: BrandEvent,
): Promise<{ action: string; detail?: string }> {
  const brandId = nonEmptyString(event.brandId);

  if (!brandId) {
    return { action: 'skipped', detail: 'No brandId on thumbnail_created event' };
  }

  const { payload } = event;
  const sourceContext = asRecord(payload.sourceContext);
  const thumbnailId = nonEmptyString(payload.thumbnailId) || event.eventId;
  const projectId =
    nonEmptyString(event.projectId) ||
    nonEmptyString(payload.projectId) ||
    nonEmptyString(sourceContext?.projectId);
  const universalId =
    nonEmptyString(payload.universalId) ||
    nonEmptyString(sourceContext?.universalId);
  const prompt = truncateText(nonEmptyString(payload.prompt), 320);
  const sourceService =
    nonEmptyString(payload.sourceService) ||
    nonEmptyString(sourceContext?.sourceService);
  const sourceSessionId =
    nonEmptyString(payload.sourceSessionId) ||
    nonEmptyString(sourceContext?.sourceSessionId);
  const sourceScriptId =
    nonEmptyString(payload.sourceScriptId) ||
    nonEmptyString(sourceContext?.sourceScriptId);

  const lines = [
    `A Clickatron thumbnail was committed for brand ${brandId}.`,
    `Thumbnail id: ${thumbnailId}.`,
    optionalLine('Clickatron session', nonEmptyString(payload.sessionId)),
    optionalLine('Clickatron variation', nonEmptyString(payload.variationId)),
    optionalLine('Linked project', projectId),
    optionalLine('Universal project link', universalId),
    optionalLine('Aspect ratio', nonEmptyString(payload.aspectRatio)),
    optionalLine('Dimensions', nonEmptyString(payload.dimensions)),
    optionalLine('Model', nonEmptyString(payload.modelId)),
    optionalLine('Source service', sourceService),
    optionalLine('Source session', sourceSessionId),
    optionalLine('Source script', sourceScriptId),
    prompt ? `Selected prompt summary: ${prompt}` : undefined,
    'This selected thumbnail is a positive creative signal for future thumbnail composition, typography, color, tone, and platform fit for this brand.',
  ].filter((line): line is string => Boolean(line));

  try {
    const { addGraphitiEpisode } = await import(
      '@/lib/editron/services/graph-service'
    );
    const result = await addGraphitiEpisode({
      type: 'thumbnail_created',
      name: `thumbnail_created_${safeEpisodeNamePart(brandId)}_${safeEpisodeNamePart(thumbnailId)}`,
      body: lines.join('\n'),
      sourceDescription: 'clickatron_thumbnail_commit',
      groupId: brandId,
    });

    if (!result.ok) {
      return {
        action: 'graphiti_failed',
        detail: result.error || 'Graphiti episode dispatch failed',
      };
    }

    return {
      action: 'graphiti_episode_dispatched',
      detail: `thumbnailId=${thumbnailId}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrandLearning] Thumbnail Graphiti episode failed: ${msg}`);
    return { action: 'graphiti_failed', detail: msg };
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function banditEvidenceOptions(payload: Record<string, unknown>) {
  return {
    evidenceSource:
      nonEmptyString(payload.qualityEvidenceSource) ||
      nonEmptyString(payload.renderedQualitySource) ||
      nonEmptyString(payload.renderedAestheticSource) ||
      nonEmptyString(payload.evidenceSource),
    renderedAestheticStatus:
      nonEmptyString(payload.renderedAestheticStatus) ||
      nonEmptyString(payload.renderedQualityStatus) ||
      nonEmptyString(payload.artifactStatus),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function optionalLine(label: string, value: string | undefined): string | undefined {
  return value ? `${label}: ${value}.` : undefined;
}

function safeEpisodeNamePart(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe.slice(0, 80) || 'unknown';
}

function validatePersistedEvent(event: BrandEvent, expectedEventId: string): string | null {
  if (event.eventId !== expectedEventId) {
    return 'Persisted eventId does not match payload eventId';
  }
  if (!nonEmptyString(event.userId)) {
    return 'Persisted event is missing userId';
  }
  if (!nonEmptyString(event.service)) {
    return 'Persisted event is missing service';
  }
  if (!nonEmptyString(event.type)) {
    return 'Persisted event is missing type';
  }
  if (!asRecord(event.payload)) {
    return 'Persisted event payload must be an object';
  }
  return null;
}

function shouldRetryResult(result: { action: string }): boolean {
  return result.action === 'bandit_failed' ||
    result.action === 'graphiti_failed' ||
    result.action === 'brand_vault_failed';
}

// ==================== Export ====================

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
