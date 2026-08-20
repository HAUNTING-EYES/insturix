import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  assertDataBankSessionPrincipal: vi.fn(),
  auth: vi.fn(),
  checkDuplicateBeforeSave: vi.fn(),
  createOrGetQueuedThinkForgeObserverJob: vi.fn(),
  createThinkForgeModelForRoute: vi.fn(),
  dispatchThinkForgeObserverJob: vi.fn(),
  generateObject: vi.fn(),
  getSession: vi.fn(),
  getThinkForgeObserverJob: vi.fn(),
  isThinkForgeObserverWorkerConfigured: vi.fn(),
  markThinkForgeObserverDispatchFailed: vi.fn(),
  processObserverJob: vi.fn(),
  putGovernedDataBankReviewCandidate: vi.fn(),
  readAiSdkUsage: vi.fn(),
  recordThinkForgeDirectCost: vi.fn(),
  recoverStalledThinkForgeObserverJobs: vi.fn(),
  recoverStalledThinkForgeRefineryJobs: vi.fn(),
  resolveThinkForgeProviderRoute: vi.fn(),
  safeJsonLength: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createThinkForgeModelForRoute: mocks.createThinkForgeModelForRoute,
  resolveThinkForgeProviderRoute: mocks.resolveThinkForgeProviderRoute,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  assertDataBankSessionPrincipal: mocks.assertDataBankSessionPrincipal,
  getSession: mocks.getSession,
  putGovernedDataBankReviewCandidate: mocks.putGovernedDataBankReviewCandidate,
}));
vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  checkDuplicateBeforeSave: mocks.checkDuplicateBeforeSave,
}));
vi.mock('@/lib/thinkforge/services/provider-cost-telemetry', () => ({
  readAiSdkUsage: mocks.readAiSdkUsage,
  recordThinkForgeDirectCost: mocks.recordThinkForgeDirectCost,
  safeJsonLength: mocks.safeJsonLength,
}));
vi.mock('@/lib/thinkforge/events/observer-job', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/thinkforge/events/observer-job')>(),
  createOrGetQueuedThinkForgeObserverJob: mocks.createOrGetQueuedThinkForgeObserverJob,
  dispatchThinkForgeObserverJob: mocks.dispatchThinkForgeObserverJob,
  getThinkForgeObserverJob: mocks.getThinkForgeObserverJob,
  isThinkForgeObserverWorkerConfigured: mocks.isThinkForgeObserverWorkerConfigured,
  markThinkForgeObserverDispatchFailed: mocks.markThinkForgeObserverDispatchFailed,
  processObserverJob: mocks.processObserverJob,
  recoverStalledThinkForgeObserverJobs: mocks.recoverStalledThinkForgeObserverJobs,
}));
vi.mock('@/lib/thinkforge/refinery/refinery-job', () => ({
  recoverStalledThinkForgeRefineryJobs: mocks.recoverStalledThinkForgeRefineryJobs,
}));

import { GET, POST } from '@/app/api/services/thinkforge/events/observe/route';
import { GET as recoverLearningJobs } from '@/app/api/cron/process-thinkforge-refinery/route';
import type { ObserverJobSnapshot, ObserverJobStoreLike } from '@/lib/thinkforge/events/observer-job';
import { observerWorkerHandler } from '@/lib/thinkforge/events/observer-worker-handler';

const LONG_TEXT = 'This is a long enough editor buffer where I explain that I prefer warm direct response openings and crisp captions.';
const PERSONAL_TEXT = 'Please remember that Alex can be reached at alex@example.com for every future campaign review.';

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/events/observe', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function job(overrides: Partial<ObserverJobSnapshot> = {}): ObserverJobSnapshot {
  return {
    id: 'observer_123',
    version: 1,
    dedupeKey: 'dedupe_1',
    input: {
      userId: 'user_1',
      orgId: null,
      sessionId: 'tf_session_1',
      source: 'editor',
      text: LONG_TEXT,
    },
    userId: 'user_1',
    orgId: null,
    status: 'queued',
    attemptCount: 1,
    maxAttempts: 3,
    leaseExpiresAt: '2026-08-17T12:04:00.000Z',
    queueMessageId: null,
    checkpoint: null,
    checkpointHash: null,
    result: null,
    resultHash: null,
    error: null,
    createdAt: '2026-08-17T12:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
    expiresAt: '2026-08-24T12:00:00.000Z',
    ...overrides,
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('ThinkForge observer durable ingress', () => {
  beforeEach(() => {
    process.env.OBSERVER_ENABLED = 'true';
    process.env.CRON_SECRET = 'cron-secret';
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null });
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_1', userId: 'user_1', projectMeta: {} });
    mocks.isThinkForgeObserverWorkerConfigured.mockReturnValue(true);
    mocks.createOrGetQueuedThinkForgeObserverJob.mockResolvedValue({ job: job(), created: true });
    mocks.dispatchThinkForgeObserverJob.mockResolvedValue('qstash_1');
    mocks.markThinkForgeObserverDispatchFailed.mockResolvedValue(undefined);
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
    mocks.putGovernedDataBankReviewCandidate.mockResolvedValue({ _id: 'candidate_1' });
    mocks.resolveThinkForgeProviderRoute.mockReturnValue({ provider: 'gemini', model: 'gemini-2.5-flash' });
    mocks.createThinkForgeModelForRoute.mockReturnValue('model');
    mocks.readAiSdkUsage.mockResolvedValue(undefined);
    mocks.recordThinkForgeDirectCost.mockResolvedValue(undefined);
    mocks.safeJsonLength.mockReturnValue(100);
    mocks.recoverStalledThinkForgeObserverJobs.mockResolvedValue({ candidates: 0, dispatched: 0, failed: 0 });
    mocks.recoverStalledThinkForgeRefineryJobs.mockResolvedValue({ candidates: 0, dispatched: 0, failed: 0 });
  });

  it('requires a bounded, session-bound request before queueing', async () => {
    const missingSession = await POST(request({ text: LONG_TEXT, source: 'editor' }));
    const oversized = await POST(request({ text: 'x'.repeat(25_000), sessionId: 'tf_session_1' }));

    expect(missingSession.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(mocks.createOrGetQueuedThinkForgeObserverJob).not.toHaveBeenCalled();
  });

  it('rejects a session unavailable to the exact principal', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ text: LONG_TEXT, sessionId: 'tf_session_other', source: 'editor' }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('tf_session_other', 'user_1', undefined);
    expect(mocks.createOrGetQueuedThinkForgeObserverJob).not.toHaveBeenCalled();
  });

  it('fails closed on an organization-principal mismatch', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.auth.mockResolvedValue({ userId: 'member_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_1', userId: 'owner_1', orgId: 'org_other' });
    mocks.assertDataBankSessionPrincipal.mockImplementation(() => { throw new Error('principal mismatch'); });

    const response = await POST(request({ text: LONG_TEXT, sessionId: 'tf_session_1', source: 'chat' }));

    expect(response.status).toBe(403);
    expect(mocks.createOrGetQueuedThinkForgeObserverJob).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('durably queues exact principal data without invoking the model at ingress', async () => {
    const response = await POST(request({ text: LONG_TEXT, sessionId: 'tf_session_1', source: 'editor' }));

    expect(response.status).toBe(202);
    await expect(json(response)).resolves.toMatchObject({
      accepted: true,
      queued: true,
      jobId: 'observer_123',
      dispatchDeferred: false,
    });
    expect(mocks.createOrGetQueuedThinkForgeObserverJob).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: null,
      sessionId: 'tf_session_1',
      source: 'editor',
      text: LONG_TEXT,
    });
    expect(mocks.dispatchThinkForgeObserverJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'observer_123' }));
    expect(mocks.generateObject).not.toHaveBeenCalled();
    const routeSource = readFileSync('app/api/services/thinkforge/events/observe/route.ts', 'utf8');
    expect(routeSource).not.toContain('generateObject');
    expect(routeSource).not.toContain('putGovernedDataBankReviewCandidate');
  });

  it('keeps a failed initial dispatch durable for cron recovery', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.dispatchThinkForgeObserverJob.mockRejectedValue(new Error('qstash unavailable'));

    const response = await POST(request({ text: LONG_TEXT, sessionId: 'tf_session_1', source: 'editor' }));

    expect(response.status).toBe(202);
    await expect(json(response)).resolves.toMatchObject({ dispatchDeferred: true, jobId: 'observer_123' });
    expect(mocks.markThinkForgeObserverDispatchFailed).toHaveBeenCalledWith('observer_123', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('rejects personal and child data before durable storage and fails loudly without a worker', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const child = await POST(request({
      text: 'My daughter is 12 years old and her school record should be remembered for future scripts.',
      sessionId: 'tf_session_1',
      source: 'chat',
    }));
    expect(child.status).toBe(202);
    await expect(json(child)).resolves.toMatchObject({ accepted: false, reason: 'child_data_not_observed' });
    const personal = await POST(request({
      text: PERSONAL_TEXT,
      sessionId: 'tf_session_1',
      source: 'chat',
    }));
    expect(personal.status).toBe(202);
    await expect(json(personal)).resolves.toMatchObject({
      accepted: false,
      reason: 'personal_data_requires_consent',
    });
    expect(mocks.createOrGetQueuedThinkForgeObserverJob).not.toHaveBeenCalled();

    mocks.isThinkForgeObserverWorkerConfigured.mockReturnValue(false);
    const unconfigured = await POST(request({ text: LONG_TEXT, sessionId: 'tf_session_1', source: 'editor' }));
    expect(unconfigured.status).toBe(503);
    await expect(json(unconfigured)).resolves.toMatchObject({ error: 'observer_worker_not_configured' });
    warnSpy.mockRestore();
  });

  it('returns an authorized status without exposing raw observed text', async () => {
    mocks.getThinkForgeObserverJob.mockResolvedValue(job({ status: 'dead_letter', error: {
      code: 'ProviderError', message: 'provider unavailable', retryable: false,
    } }));
    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/events/observe?jobId=observer_123',
    ));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ jobId: 'observer_123', status: 'dead_letter' });
    expect(payload).not.toHaveProperty('input');
    expect(JSON.stringify(payload)).not.toContain(LONG_TEXT);
    expect(mocks.getThinkForgeObserverJob).toHaveBeenCalledWith('observer_123', 'user_1', null);
  });
});

describe('ThinkForge observer durable processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ _id: 'tf_session_1', userId: 'user_1', projectMeta: {} });
    mocks.resolveThinkForgeProviderRoute.mockReturnValue({ provider: 'gemini', model: 'gemini-2.5-flash' });
    mocks.createThinkForgeModelForRoute.mockReturnValue('model');
    mocks.readAiSdkUsage.mockResolvedValue(undefined);
    mocks.recordThinkForgeDirectCost.mockResolvedValue(undefined);
    mocks.safeJsonLength.mockReturnValue(100);
    mocks.checkDuplicateBeforeSave.mockResolvedValue(false);
    mocks.putGovernedDataBankReviewCandidate.mockResolvedValue({ _id: 'candidate_1' });
    mocks.generateObject.mockResolvedValue({
      object: { facts: [{
        type: 'preference',
        content: 'The user prefers warm direct response openings.',
        confidence: 0.91,
        scope: 'global',
        sensitivity: 'non_personal',
      }] },
    });
  });

  it('checkpoints extraction before idempotent quarantined candidate writes', async () => {
    const actual = await vi.importActual<typeof import('@/lib/thinkforge/events/observer-job')>(
      '@/lib/thinkforge/events/observer-job',
    );
    const store: ObserverJobStoreLike = {
      claim: vi.fn().mockResolvedValue({ kind: 'claimed', job: job({ status: 'running' }), leaseToken: 'lease_1' }),
      saveCheckpoint: vi.fn().mockResolvedValue(undefined),
      saveResult: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      retryOrDeadLetter: vi.fn(),
    };

    const result = await actual.processObserverJob('observer_123', store);

    expect(result).toMatchObject({ status: 'completed', result: { reviewPendingCount: 1 } });
    expect(store.saveCheckpoint).toHaveBeenCalledWith(
      'observer_123',
      'lease_1',
      expect.objectContaining({ facts: expect.any(Array) }),
    );
    expect(mocks.putGovernedDataBankReviewCandidate).toHaveBeenCalledWith(
      { userId: 'user_1' },
      'tf_session_1',
      'thinkforge:observer:observer_123:candidate:0',
      expect.objectContaining({
        scope: 'project',
        memoryScope: 'project',
        content: expect.objectContaining({ observerJobId: 'observer_123' }),
      }),
    );
    expect((store.saveCheckpoint as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan(mocks.putGovernedDataBankReviewCandidate.mock.invocationCallOrder[0]!);
    expect((store.saveResult as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((store.complete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
  });

  it('reuses a durable checkpoint and dead-letters a terminal persistence failure', async () => {
    const actual = await vi.importActual<typeof import('@/lib/thinkforge/events/observer-job')>(
      '@/lib/thinkforge/events/observer-job',
    );
    const checkpoint = {
      facts: [{
        type: 'rule' as const,
        content: 'Lead with the useful fact.',
        confidence: 0.9,
        scope: 'project' as const,
        sensitivity: 'non_personal' as const,
      }],
    };
    mocks.putGovernedDataBankReviewCandidate.mockRejectedValue(new Error('databank unavailable'));
    const store: ObserverJobStoreLike = {
      claim: vi.fn().mockResolvedValue({
        kind: 'claimed',
        job: job({ status: 'running', checkpoint, checkpointHash: 'checkpoint_hash' }),
        leaseToken: 'lease_3',
      }),
      saveCheckpoint: vi.fn(),
      saveResult: vi.fn(),
      complete: vi.fn(),
      retryOrDeadLetter: vi.fn().mockResolvedValue('dead_letter'),
    };

    const result = await actual.processObserverJob('observer_123', store);

    expect(result).toMatchObject({ status: 'dead_letter', error: 'databank unavailable' });
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(store.saveCheckpoint).not.toHaveBeenCalled();
    expect(store.retryOrDeadLetter).toHaveBeenCalledWith('observer_123', 'lease_3', expect.any(Error));
  });

  it('rejects direct and legacy personal-data jobs before storage or model egress', async () => {
    const actual = await vi.importActual<typeof import('@/lib/thinkforge/events/observer-job')>(
      '@/lib/thinkforge/events/observer-job',
    );
    const personalInput = {
      userId: 'user_1',
      orgId: null,
      sessionId: 'tf_session_1',
      source: 'editor' as const,
      text: PERSONAL_TEXT,
    };
    expect(() => actual.createObserverJobDedupeKey(personalInput))
      .toThrow('requires explicit consent');

    const store: ObserverJobStoreLike = {
      claim: vi.fn().mockResolvedValue({
        kind: 'claimed',
        job: job({ status: 'running', input: personalInput }),
        leaseToken: 'lease_privacy',
      }),
      saveCheckpoint: vi.fn(),
      saveResult: vi.fn(),
      complete: vi.fn(),
      retryOrDeadLetter: vi.fn().mockResolvedValue('dead_letter'),
    };

    const result = await actual.processObserverJob('observer_123', store);

    expect(result).toMatchObject({ status: 'dead_letter', error: expect.stringContaining('explicit consent') });
    expect(store.retryOrDeadLetter).toHaveBeenCalledWith(
      'observer_123',
      'lease_privacy',
      expect.objectContaining({ name: 'ObserverTextPrivacyError' }),
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.resolveThinkForgeProviderRoute).not.toHaveBeenCalled();
    expect(mocks.generateObject).not.toHaveBeenCalled();
    expect(mocks.putGovernedDataBankReviewCandidate).not.toHaveBeenCalled();
  });

  it('dead-letters privacy violations on the first durable attempt', async () => {
    const actual = await vi.importActual<typeof import('@/lib/thinkforge/events/observer-job')>(
      '@/lib/thinkforge/events/observer-job',
    );
    const { ObserverTextPrivacyError } = await import('@/lib/thinkforge/events/observer-memory-policy');
    const now = new Date('2026-08-19T00:00:00.000Z');
    const collection = {
      findOne: vi.fn().mockResolvedValue({
        _id: 'observer_123',
        status: 'running',
        leaseToken: 'lease_privacy',
        attemptCount: 1,
        maxAttempts: 3,
      }),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const store = new actual.ObserverJobStore(async () => collection as never);

    const status = await store.retryOrDeadLetter(
      'observer_123',
      'lease_privacy',
      new ObserverTextPrivacyError('personal', 'personal_data_requires_consent'),
      now,
    );

    expect(status).toBe('dead_letter');
    expect(collection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ attemptCount: 1 }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'dead_letter',
          error: expect.objectContaining({ retryable: false }),
        }),
        $unset: { activeDedupeKey: '', leaseToken: '' },
      }),
    );
  });

  it('maps retry and dead-letter states to finite worker responses', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.processObserverJob.mockResolvedValueOnce({ status: 'queued', error: 'transient' });
    const retry = await observerWorkerHandler(new Request(
      'http://localhost/api/internal/workers/thinkforge/observer',
      { method: 'POST', body: JSON.stringify({ jobId: 'observer_123' }) },
    ));
    mocks.processObserverJob.mockResolvedValueOnce({ status: 'dead_letter', error: 'terminal' });
    const terminal = await observerWorkerHandler(new Request(
      'http://localhost/api/internal/workers/thinkforge/observer',
      { method: 'POST', body: JSON.stringify({ jobId: 'observer_123' }) },
    ));

    expect(retry.status).toBe(500);
    expect(terminal.status).toBe(200);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('runs observer and refinery recovery independently and surfaces partial failure', async () => {
    mocks.recoverStalledThinkForgeRefineryJobs.mockResolvedValue({ candidates: 1, dispatched: 1, failed: 0 });
    mocks.recoverStalledThinkForgeObserverJobs.mockRejectedValue(new Error('observer recovery unavailable'));

    const response = await recoverLearningJobs(new Request(
      'http://localhost/api/cron/process-thinkforge-refinery',
      { headers: { authorization: 'Bearer cron-secret' } },
    ) as never);
    const payload = await json(response);

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      ok: false,
      recovery: {
        refinery: { candidates: 1, dispatched: 1, failed: 0 },
        observer: { error: 'observer recovery unavailable' },
      },
    });
  });
});
