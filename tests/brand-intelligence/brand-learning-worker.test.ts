import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandEvent } from '@/lib/shared/brand-events';
import { POST } from '@/app/api/internal/workers/brand-learning/route';

const mocks = vi.hoisted(() => {
  const addGraphitiEpisode = vi.fn();
  const claimEventForConsumer = vi.fn();
  const invalidateCache = vi.fn();
  const markEventConsumed = vi.fn();
  const recordProjectOutcome = vi.fn();
  const releaseEventClaim = vi.fn();
  const runPostMortemAgent = vi.fn();
  return {
    addGraphitiEpisode,
    claimEventForConsumer,
    invalidateCache,
    markEventConsumed,
    recordProjectOutcome,
    releaseEventClaim,
    runPostMortemAgent,
  };
});

vi.mock('@/lib/shared/brand-events', () => ({
  claimEventForConsumer: mocks.claimEventForConsumer,
  markEventConsumed: mocks.markEventConsumed,
  releaseEventClaim: mocks.releaseEventClaim,
}));

vi.mock('@/lib/shared/brand-registry', () => ({
  invalidateCache: mocks.invalidateCache,
}));

vi.mock('@/lib/editron/services/graph-service', () => ({
  addGraphitiEpisode: mocks.addGraphitiEpisode,
}));

vi.mock('@/lib/editron/services/genre-parameter-bandit', () => ({
  recordProjectOutcome: mocks.recordProjectOutcome,
}));

vi.mock('@/lib/thinkforge/agents/post-mortem-agent', () => ({
  runPostMortemAgent: mocks.runPostMortemAgent,
}));

function brandEvent(overrides: Partial<BrandEvent> = {}): BrandEvent {
  return {
    eventId: 'event_1',
    userId: 'user_1',
    service: 'editron',
    type: 'brand_updated',
    payload: {},
    consumedBy: [],
    createdAt: new Date('2026-06-09T00:00:00.000Z'),
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/internal/workers/brand-learning', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('brand-learning worker', () => {
  beforeEach(() => {
    mocks.addGraphitiEpisode.mockReset();
    mocks.claimEventForConsumer.mockReset();
    mocks.invalidateCache.mockReset();
    mocks.markEventConsumed.mockReset();
    mocks.recordProjectOutcome.mockReset();
    mocks.releaseEventClaim.mockReset();
    mocks.runPostMortemAgent.mockReset();
  });

  it('skips a stale QStash replay when Mongo already marks the event consumed', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'already_consumed',
      event: brandEvent({ consumedBy: ['brand-learning-worker'] }),
    });

    const response = await POST(
      request({
        eventId: 'event_1',
        event: brandEvent({ consumedBy: [] }),
      }) as any,
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      action: 'already_consumed',
    });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
    expect(mocks.markEventConsumed).not.toHaveBeenCalled();
  });

  it('uses the persisted event as source of truth instead of the payload event', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({ type: 'brand_updated', userId: 'user_from_db' }),
    });

    const response = await POST(
      request({
        eventId: 'event_1',
        event: brandEvent({ type: 'script_generated', userId: 'user_from_payload' }),
      }) as any,
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'brand_updated',
      action: 'cache_invalidated',
    });
    expect(mocks.invalidateCache).toHaveBeenCalledWith('user_from_db');
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('releases the claim and returns 500 when a critical handler fails', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        service: 'clickatron',
        type: 'thumbnail_created',
        brandId: 'brand_1',
        payload: { thumbnailId: 'thumb_1' },
      }),
    });
    mocks.addGraphitiEpisode.mockResolvedValue({
      ok: false,
      error: 'Graphiti unavailable',
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toMatchObject({
      success: false,
      eventId: 'event_1',
      type: 'thumbnail_created',
      action: 'graphiti_failed',
      detail: 'Graphiti unavailable',
    });
    expect(mocks.releaseEventClaim).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
    expect(mocks.markEventConsumed).not.toHaveBeenCalled();
  });

  it('passes persisted project and brand scope into rendered-video post-mortems', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        projectId: 'project_1',
        brandId: 'brand_1',
        type: 'video_rendered',
        payload: {
          sessionId: 'tf_session_1',
          projectName: 'Launch Cut',
          qualityScore: 88,
        },
      }),
    });
    mocks.recordProjectOutcome.mockResolvedValue(undefined);
    mocks.runPostMortemAgent.mockResolvedValue({
      summaryEntryId: 'summary_1',
      lessonsExtracted: 2,
      eventsDeleted: 0,
      entriesDeleted: 0,
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'video_rendered',
      action: 'bandit_updated(rendered), post_mortem(lessons=2)',
    });
    expect(mocks.recordProjectOutcome).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      88,
      true,
    );
    expect(mocks.runPostMortemAgent).toHaveBeenCalledWith({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'project_1',
      brandId: 'brand_1',
      qualityScore: 88,
      projectTitle: 'Launch Cut',
    });
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('does not update learning from failed director outcomes', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        projectId: 'project_1',
        type: 'director_completed',
        payload: {
          qualityScore: 0,
          criticalCount: 8,
          hasQualityReview: true,
        },
      }),
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'director_completed',
      action: 'bandit_skipped',
      detail: 'learning_gate=non_positive_quality_score',
    });
    expect(mocks.recordProjectOutcome).not.toHaveBeenCalled();
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('does not update learning from quality reviews with too many critical issues', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        projectId: 'project_1',
        type: 'quality_reviewed',
        payload: {
          qualityScore: 72,
          criticalCount: 6,
          hasQualityReview: true,
        },
      }),
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'quality_reviewed',
      action: 'bandit_skipped',
      detail: 'learning_gate=too_many_critical_issues',
    });
    expect(mocks.recordProjectOutcome).not.toHaveBeenCalled();
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('returns 404 when the persisted event is missing', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({ status: 'missing' });

    const response = await POST(request({ eventId: 'missing_event' }) as any);

    expect(response.status).toBe(404);
    await expect(json(response)).resolves.toMatchObject({
      success: false,
      eventId: 'missing_event',
      error: 'Persisted brand event not found',
    });
    expect(mocks.markEventConsumed).not.toHaveBeenCalled();
  });
});
