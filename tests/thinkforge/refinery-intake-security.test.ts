import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkCredits: vi.fn(),
  createOrGetQueuedThinkForgeRefineryJob: vi.fn(),
  dispatchThinkForgeRefineryJob: vi.fn(),
  getSession: vi.fn(),
  getThinkForgeRefineryJob: vi.fn(),
  isThinkForgeRefineryWorkerConfigured: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
  markThinkForgeRefineryDispatchFailed: vi.fn(),
  resolveContextBillingOwner: vi.fn(),
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
  createOrGetQueuedThinkForgeRefineryJob: mocks.createOrGetQueuedThinkForgeRefineryJob,
  dispatchThinkForgeRefineryJob: mocks.dispatchThinkForgeRefineryJob,
  getThinkForgeRefineryJob: mocks.getThinkForgeRefineryJob,
  isThinkForgeRefineryWorkerConfigured: mocks.isThinkForgeRefineryWorkerConfigured,
  markThinkForgeRefineryDispatchFailed: mocks.markThinkForgeRefineryDispatchFailed,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/services/thinkforge/refinery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ThinkForge refinery intake security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      job: {
        id: 'refinery_123',
        sessionId: 'session_canonical',
        status: 'queued',
        attemptCount: 0,
        maxAttempts: 3,
        result: null,
        error: null,
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
      },
    });
    mocks.dispatchThinkForgeRefineryJob.mockResolvedValue('qstash_123');
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
});
