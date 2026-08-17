import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  chargeThinkForgeRefineryJob: vi.fn(),
  checkCredits: vi.fn(),
  claimThinkForgeRefineryJob: vi.fn(),
  createOrGetQueuedThinkForgeRefineryJob: vi.fn(),
  dispatchThinkForgeRefineryJob: vi.fn(),
  failThinkForgeRefineryJob: vi.fn(),
  getSession: vi.fn(),
  getThinkForgeRefineryJob: vi.fn(),
  isThinkForgeRefineryWorkerConfigured: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
  recordThinkForgeRefineryDispatchFailure: vi.fn(),
  refundThinkForgeRefineryJob: vi.fn(),
  resolveContextBillingOwner: vi.fn(),
  retryOrDeadLetterThinkForgeRefineryJob: vi.fn(),
  runClaimedThinkForgeRefineryJob: vi.fn(),
  runRefineryAgent: vi.fn(),
  toSafeUrlIngestionProblem: vi.fn(),
  validateThinkForgeIngestionUrl: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/editron/services/project-ownership', () => ({ resolveContextBillingOwner: mocks.resolveContextBillingOwner }));
vi.mock('@/lib/services/org-wallet-flag', () => ({ isOrgWalletBillingEnabled: mocks.isOrgWalletBillingEnabled }));
vi.mock('@/lib/thinkforge/services/db', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/thinkforge/agents/refinery-agent', () => ({ runRefineryAgent: mocks.runRefineryAgent }));
vi.mock('@/lib/thinkforge/security/url-ingestion-gateway', () => ({
  toSafeUrlIngestionProblem: mocks.toSafeUrlIngestionProblem,
  validateThinkForgeIngestionUrl: mocks.validateThinkForgeIngestionUrl,
}));
vi.mock('@/lib/thinkforge/refinery/refinery-job', () => ({
  chargeThinkForgeRefineryJob: mocks.chargeThinkForgeRefineryJob,
  claimThinkForgeRefineryJob: mocks.claimThinkForgeRefineryJob,
  createOrGetQueuedThinkForgeRefineryJob: mocks.createOrGetQueuedThinkForgeRefineryJob,
  dispatchThinkForgeRefineryJob: mocks.dispatchThinkForgeRefineryJob,
  failThinkForgeRefineryJob: mocks.failThinkForgeRefineryJob,
  getThinkForgeRefineryJob: mocks.getThinkForgeRefineryJob,
  isThinkForgeRefineryWorkerConfigured: mocks.isThinkForgeRefineryWorkerConfigured,
  recordThinkForgeRefineryDispatchFailure: mocks.recordThinkForgeRefineryDispatchFailure,
  refundThinkForgeRefineryJob: mocks.refundThinkForgeRefineryJob,
  retryOrDeadLetterThinkForgeRefineryJob: mocks.retryOrDeadLetterThinkForgeRefineryJob,
  runClaimedThinkForgeRefineryJob: mocks.runClaimedThinkForgeRefineryJob,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/refinery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function refineryJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'refinery_123',
    version: 1,
    dedupeKey: 'dedupe_123',
    idempotencyKey: 'charge_123',
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_canonical',
    urls: ['https://example.com/reference'],
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    leaseToken: null,
    leaseExpiresAt: null,
    queueMessageId: null,
    charge: {
      amount: 0.2,
      wallet: { type: 'personal', clerkUserId: 'user_1' },
      transactionId: null,
      status: 'pending',
    },
    result: null,
    error: null,
    deadLetteredAt: null,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('ThinkForge refinery intake security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ENV = 'development';
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.validateThinkForgeIngestionUrl.mockImplementation(async (url: string) => new URL(url).toString());
    mocks.toSafeUrlIngestionProblem.mockReturnValue({
      code: 'blocked_target',
      message: 'This URL does not resolve to a permitted public destination.',
      status: 400,
    });
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', userId: 'user_1', orgId: 'org_1' });
    mocks.resolveContextBillingOwner.mockReturnValue({ type: 'personal', userId: 'user_1' });
    mocks.isOrgWalletBillingEnabled.mockReturnValue(false);
    mocks.isThinkForgeRefineryWorkerConfigured.mockReturnValue(true);
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: vi.fn().mockResolvedValue(undefined),
      refund: vi.fn().mockResolvedValue(undefined),
    });
    mocks.createOrGetQueuedThinkForgeRefineryJob.mockResolvedValue({
      created: true,
      job: refineryJob(),
    });
    mocks.dispatchThinkForgeRefineryJob.mockResolvedValue('qstash_123');
    const claimed = refineryJob({ status: 'running', attemptCount: 1, leaseToken: 'lease_1' });
    mocks.claimThinkForgeRefineryJob.mockResolvedValue({ kind: 'claimed', job: claimed });
    mocks.chargeThinkForgeRefineryJob.mockResolvedValue({ ok: true, job: claimed });
    mocks.runClaimedThinkForgeRefineryJob.mockResolvedValue(undefined);
    mocks.retryOrDeadLetterThinkForgeRefineryJob.mockResolvedValue('queued');
    mocks.refundThinkForgeRefineryJob.mockResolvedValue('refunded');
    mocks.failThinkForgeRefineryJob.mockResolvedValue(undefined);
    mocks.runRefineryAgent.mockResolvedValue({ processed: 1, failed: 0, entries: [], errors: [] });
  });

  it('rejects a foreign session before credits or refinery work', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({ sessionId: 'session_other', urls: ['https://example.com/reference'] }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('session_other', 'user_1', 'org_1');
    expect(mocks.validateThinkForgeIngestionUrl).not.toHaveBeenCalled();
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.createOrGetQueuedThinkForgeRefineryJob).not.toHaveBeenCalled();
    expect(mocks.runRefineryAgent).not.toHaveBeenCalled();
  });

  it('canonicalizes the owned session and never accepts a caller supplied project id', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({
      sessionId: 'session_requested',
      projectId: 'project_other_user',
      urls: ['https://example.com/reference', 'https://example.com/reference'],
    }));

    expect(response.status).toBe(202);
    expect(mocks.createOrGetQueuedThinkForgeRefineryJob).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_canonical',
      urls: ['https://example.com/reference'],
      wallet: { type: 'personal', userId: 'user_1' },
    });
    expect(mocks.dispatchThinkForgeRefineryJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'refinery_123' }));
    expect(mocks.runRefineryAgent).not.toHaveBeenCalled();
    expect(mocks.getSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.validateThinkForgeIngestionUrl.mock.invocationCallOrder[0],
    );
    expect(mocks.validateThinkForgeIngestionUrl.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkCredits.mock.invocationCallOrder[0],
    );
  });

  it('returns a typed safe error without billing, persistence, or network details', async () => {
    mocks.validateThinkForgeIngestionUrl.mockRejectedValueOnce(
      new Error('getaddrinfo returned 10.0.0.7 from internal-dns.local'),
    );
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({
      sessionId: 'session_owned',
      urls: ['https://public-looking.example/source'],
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'This URL does not resolve to a permitted public destination.',
      code: 'blocked_target',
    });
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.7|internal-dns/i);
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.createOrGetQueuedThinkForgeRefineryJob).not.toHaveBeenCalled();
    expect(mocks.dispatchThinkForgeRefineryJob).not.toHaveBeenCalled();
  });

  it('keeps a persisted job queued when the first QStash dispatch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.dispatchThinkForgeRefineryJob.mockRejectedValue(new Error('qstash bearer secret leaked here'));
    mocks.recordThinkForgeRefineryDispatchFailure.mockResolvedValue(refineryJob({
      error: {
        code: 'dispatch_failed',
        message: 'qstash bearer secret leaked here',
        retryable: true,
      },
    }));
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({
      sessionId: 'session_owned',
      urls: ['https://example.com/reference'],
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      queueState: 'recovery_pending',
      job: {
        id: 'refinery_123',
        status: 'queued',
        error: {
          code: 'dispatch_failed',
          retryable: true,
          message: 'Research is queued and automatic dispatch recovery is in progress.',
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain('qstash bearer secret');
    expect(mocks.recordThinkForgeRefineryDispatchFailure).toHaveBeenCalledWith(
      'refinery_123',
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('projects dead-letter status without exposing the stored provider failure', async () => {
    mocks.getThinkForgeRefineryJob.mockResolvedValue(refineryJob({
      status: 'dead_letter',
      deadLetteredAt: '2026-08-11T00:05:00.000Z',
      error: {
        code: 'processing_failed',
        message: 'provider request contained sk-secret and private source text',
        retryable: false,
      },
      charge: {
        amount: 0.2,
        wallet: { type: 'personal', clerkUserId: 'user_1' },
        transactionId: 'txn_1',
        status: 'refund_pending',
      },
    }));
    const { GET } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await GET(new Request(
      'http://localhost/api/services/thinkforge/refinery?jobId=refinery_123',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      job: {
        status: 'dead_letter',
        chargeStatus: 'refund_pending',
        error: {
          code: 'processing_failed',
          retryable: false,
          message: 'Research processing could not complete after repeated attempts.',
        },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-secret|private source text/i);
  });

  it('requests redelivery for transient work and refunds only after dead letter', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.runClaimedThinkForgeRefineryJob.mockRejectedValue(new Error('provider unavailable'));
    mocks.retryOrDeadLetterThinkForgeRefineryJob
      .mockResolvedValueOnce('queued')
      .mockResolvedValueOnce('dead_letter');
    const { POST: refineryWorkerHandler } = await import('@/app/api/internal/workers/thinkforge/refinery/route');
    const workerRequest = () => new Request(
      'http://localhost/api/internal/workers/thinkforge/refinery',
      { method: 'POST', body: JSON.stringify({ jobId: 'refinery_123' }) },
    ) as never;

    const retry = await refineryWorkerHandler(workerRequest());
    const terminal = await refineryWorkerHandler(workerRequest());

    expect(retry.status).toBe(500);
    await expect(retry.json()).resolves.toMatchObject({ status: 'queued' });
    expect(terminal.status).toBe(200);
    await expect(terminal.json()).resolves.toMatchObject({ status: 'dead_letter' });
    expect(mocks.refundThinkForgeRefineryJob).toHaveBeenCalledTimes(1);
    expect(mocks.refundThinkForgeRefineryJob).toHaveBeenCalledWith(
      'refinery_123',
      'ThinkForge research processing failed after all retry attempts.',
    );
    errorLog.mockRestore();
  });

  it('reconciles an exhausted delivery without running the refinery again', async () => {
    mocks.claimThinkForgeRefineryJob.mockResolvedValue({ kind: 'skipped', reason: 'attempts_exhausted' });
    const { POST: refineryWorkerHandler } = await import('@/app/api/internal/workers/thinkforge/refinery/route');

    const response = await refineryWorkerHandler(new Request(
      'http://localhost/api/internal/workers/thinkforge/refinery',
      { method: 'POST', body: JSON.stringify({ jobId: 'refinery_123' }) },
    ) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'dead_letter',
      reason: 'attempts_exhausted',
    });
    expect(mocks.runClaimedThinkForgeRefineryJob).not.toHaveBeenCalled();
    expect(mocks.refundThinkForgeRefineryJob).toHaveBeenCalledWith(
      'refinery_123',
      'ThinkForge research processing exhausted all attempts.',
    );
  });

  it('records insufficient credits as a non-retryable business failure', async () => {
    mocks.chargeThinkForgeRefineryJob.mockResolvedValue({
      ok: false,
      code: 'insufficient_credits',
      message: 'Insufficient credits.',
    });
    const { POST: refineryWorkerHandler } = await import('@/app/api/internal/workers/thinkforge/refinery/route');

    const response = await refineryWorkerHandler(new Request(
      'http://localhost/api/internal/workers/thinkforge/refinery',
      { method: 'POST', body: JSON.stringify({ jobId: 'refinery_123' }) },
    ) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'failed',
      code: 'insufficient_credits',
    });
    expect(mocks.failThinkForgeRefineryJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'refinery_123', leaseToken: 'lease_1' }),
      'insufficient_credits',
      'Insufficient credits.',
    );
    expect(mocks.refundThinkForgeRefineryJob).not.toHaveBeenCalled();
  });

  it('uses the attempt limit as the exact retry-to-dead-letter boundary', async () => {
    const actual = await vi.importActual<typeof import('@/lib/thinkforge/refinery/refinery-job')>(
      '@/lib/thinkforge/refinery/refinery-job',
    );

    expect(actual.decideThinkForgeRefineryFailureTransition({ attemptCount: 2, maxAttempts: 3 })).toBe('queued');
    expect(actual.decideThinkForgeRefineryFailureTransition({ attemptCount: 3, maxAttempts: 3 })).toBe('dead_letter');
    expect(actual.decideThinkForgeRefineryFailureTransition({ attemptCount: 4, maxAttempts: 3 })).toBe('dead_letter');
  });
});
