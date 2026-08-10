import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSafeAssetUrl: vi.fn(),
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
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/editron/services/project-ownership', () => ({ resolveContextBillingOwner: mocks.resolveContextBillingOwner }));
vi.mock('@/lib/services/org-wallet-flag', () => ({ isOrgWalletBillingEnabled: mocks.isOrgWalletBillingEnabled }));
vi.mock('@/lib/thinkforge/services/db', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/thinkforge/agents/refinery-agent', () => ({ runRefineryAgent: mocks.runRefineryAgent }));
vi.mock('@/lib/shared/safe-asset-url', () => ({ assertSafeAssetUrl: mocks.assertSafeAssetUrl }));
vi.mock('@/lib/thinkforge/refinery/refinery-job', () => ({
  createOrGetQueuedThinkForgeRefineryJob: mocks.createOrGetQueuedThinkForgeRefineryJob,
  dispatchThinkForgeRefineryJob: mocks.dispatchThinkForgeRefineryJob,
  getThinkForgeRefineryJob: mocks.getThinkForgeRefineryJob,
  isThinkForgeRefineryWorkerConfigured: mocks.isThinkForgeRefineryWorkerConfigured,
  markThinkForgeRefineryDispatchFailed: mocks.markThinkForgeRefineryDispatchFailed,
}));

const originalFetch = globalThis.fetch;

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
    mocks.assertSafeAssetUrl.mockResolvedValue(undefined);
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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects a foreign session before credits or refinery work', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({ sessionId: 'session_other', urls: ['https://example.com/reference'] }));

    expect(response.status).toBe(404);
    expect(mocks.getSession).toHaveBeenCalledWith('session_other', 'user_1', 'org_1');
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
  });

  it('does not fetch an unsafe URL after the extraction boundary rejects it', async () => {
    mocks.assertSafeAssetUrl.mockRejectedValueOnce(new Error('asset url: private IPv4 literal 169.254.169.254'));
    globalThis.fetch = vi.fn();
    const { extractUrlContent } = await import('@/lib/thinkforge/agents/url-brief-agent');

    await expect(extractUrlContent('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private IPv4');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
