import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const writeBrandSignalLearningEventsToBrandVault = vi.fn();
  return {
    addGraphitiEpisode,
    claimEventForConsumer,
    invalidateCache,
    markEventConsumed,
    recordProjectOutcome,
    releaseEventClaim,
    runPostMortemAgent,
    writeBrandSignalLearningEventsToBrandVault,
  };
});

vi.mock('@/lib/shared/brand-events', () => ({
  claimEventForConsumer: mocks.claimEventForConsumer,
  markEventConsumed: mocks.markEventConsumed,
  releaseEventClaim: mocks.releaseEventClaim,
}));

vi.mock('@upstash/qstash/nextjs', () => ({
  verifySignatureAppRouter: (handler: unknown) => handler,
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

vi.mock('@/lib/shared/brand-vault-learning-events', () => ({
  writeBrandSignalLearningEventsToBrandVault: mocks.writeBrandSignalLearningEventsToBrandVault,
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
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
    mocks.addGraphitiEpisode.mockReset();
    mocks.claimEventForConsumer.mockReset();
    mocks.invalidateCache.mockReset();
    mocks.markEventConsumed.mockReset();
    mocks.recordProjectOutcome.mockReset();
    mocks.recordProjectOutcome.mockResolvedValue({ recorded: true, reward: 0.82 });
    mocks.releaseEventClaim.mockReset();
    mocks.runPostMortemAgent.mockReset();
    mocks.writeBrandSignalLearningEventsToBrandVault.mockReset();
    mocks.writeBrandSignalLearningEventsToBrandVault.mockResolvedValue({
      ok: true,
      jobId: 'learning_job_1',
      recordId: 'learning_record_1',
      candidateCount: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('stages committed Clickatron thumbnails into Brand Vault drafts', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        eventId: 'event_1',
        service: 'clickatron',
        type: 'thumbnail_created',
        brandId: 'brand_1',
        projectId: 'project_1',
        payload: {
          thumbnailId: 'thumb_1',
          thumbnailUrl: 'https://cdn.example/thumb_1.png',
          sessionId: 'session_1',
          variationId: 'variation_1',
          prompt: 'Bold launch thumbnail',
        },
      }),
    });
    mocks.addGraphitiEpisode.mockResolvedValue({ ok: true });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'thumbnail_created',
      action: 'graphiti_episode_dispatched, brand_vault_learning_staged',
      detail: 'thumbnailId=thumb_1; jobId=learning_job_1; recordId=learning_record_1; candidateCount=1',
    });
    expect(mocks.writeBrandSignalLearningEventsToBrandVault).toHaveBeenCalledTimes(1);
    const writeCall = mocks.writeBrandSignalLearningEventsToBrandVault.mock.calls[0]?.[0];
    expect(writeCall).toMatchObject({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'event_1',
      actorId: 'user_1',
    });
    expect(writeCall.learningEvents).toHaveLength(1);
    expect(writeCall.learningEvents[0]).toMatchObject({
      service: 'clickatron',
      signalPath: 'assets.socialPreviewImages',
      editType: 'accepted_output_confirmation',
      scope: 'project',
      polarity: 'affirm',
      observedAt: '2026-06-09T00:00:00.000Z',
      actorId: 'user_1',
      observedValue: ['https://cdn.example/thumb_1.png'],
      context: {
        userId: 'user_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        contentId: 'thumb_1',
        sourceId: 'session_1',
        sourceUrl: 'https://cdn.example/thumb_1.png',
      },
      learningWeight: {
        category: 'invented',
        service: 'clickatron',
        editType: 'accepted_output_confirmation',
        signalClass: 'visual_identity',
      },
    });
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('retries Clickatron thumbnail events when Brand Vault staging fails', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        eventId: 'event_1',
        service: 'clickatron',
        type: 'thumbnail_created',
        brandId: 'brand_1',
        projectId: 'project_1',
        payload: {
          thumbnailId: 'thumb_1',
          thumbnailUrl: 'https://cdn.example/thumb_1.png',
        },
      }),
    });
    mocks.addGraphitiEpisode.mockResolvedValue({ ok: true });
    mocks.writeBrandSignalLearningEventsToBrandVault.mockResolvedValue({
      ok: false,
      error: 'mongo offline',
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toMatchObject({
      success: false,
      eventId: 'event_1',
      type: 'thumbnail_created',
      action: 'brand_vault_failed',
      detail: 'mongo offline',
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
          qualityEvidenceSource: 'rendered-aesthetic',
          renderedAestheticStatus: 'pass',
        },
      }),
    });
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
      false,
      {
        evidenceSource: 'rendered-aesthetic',
        renderedAestheticStatus: 'pass',
      },
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

  it('reports skipped learning when a rendered event has only metadata quality', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        projectId: 'project_1',
        type: 'video_rendered',
        payload: {
          qualityScore: 88,
        },
      }),
    });
    mocks.recordProjectOutcome.mockResolvedValue({
      recorded: false,
      reason: 'missing_rendered_quality_evidence',
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'video_rendered',
      action: 'bandit_skipped(missing_rendered_quality_evidence)',
    });
    expect(mocks.recordProjectOutcome).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      88,
      true,
      false,
      {
        evidenceSource: undefined,
        renderedAestheticStatus: undefined,
      },
    );
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

  it('stages user override learning events into Brand Vault drafts', async () => {
    const learningEvents = [
      {
        version: 1,
        id: 'learning_1',
        service: 'editron',
        signalPath: 'motion.transitionSharpness',
        editType: 'generated_output_correction',
        scope: 'project',
        polarity: 'replace',
        observedAt: '2026-06-22T12:00:00.000Z',
        context: { userId: 'user_1', brandId: 'brand_1', projectId: 'project_1' },
        beforeValue: 'fade',
        afterValue: 'hard-cut',
        learningWeight: {
          version: 1,
          value: 0.166,
          category: 'invented',
          service: 'editron',
          editType: 'generated_output_correction',
          scope: 'project',
          polarity: 'replace',
          signalClass: 'motion_dial',
          rationale: 'test',
        },
      },
    ];
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        eventId: 'event_1',
        brandId: 'brand_1',
        projectId: 'project_1',
        type: 'user_override',
        payload: { learningEvents },
      }),
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      success: true,
      eventId: 'event_1',
      type: 'user_override',
      action: 'brand_vault_learning_staged',
      detail: 'jobId=learning_job_1; recordId=learning_record_1; candidateCount=1',
    });
    expect(mocks.writeBrandSignalLearningEventsToBrandVault).toHaveBeenCalledWith({
      userId: 'user_1',
      brandId: 'brand_1',
      projectId: 'project_1',
      sourceEventId: 'event_1',
      actorId: 'user_1',
      learningEvents,
    });
    expect(mocks.markEventConsumed).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
  });

  it('retries user override events when Brand Vault staging fails', async () => {
    mocks.claimEventForConsumer.mockResolvedValue({
      status: 'claimed',
      event: brandEvent({
        eventId: 'event_1',
        type: 'user_override',
        payload: { learningEvents: [{ version: 1 }] },
      }),
    });
    mocks.writeBrandSignalLearningEventsToBrandVault.mockResolvedValue({
      ok: false,
      error: 'mongo offline',
    });

    const response = await POST(request({ eventId: 'event_1' }) as any);

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toMatchObject({
      success: false,
      eventId: 'event_1',
      type: 'user_override',
      action: 'brand_vault_failed',
      detail: 'mongo offline',
    });
    expect(mocks.releaseEventClaim).toHaveBeenCalledWith('event_1', 'brand-learning-worker');
    expect(mocks.markEventConsumed).not.toHaveBeenCalled();
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
