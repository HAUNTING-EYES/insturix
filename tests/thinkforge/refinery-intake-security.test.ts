import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSafeAssetUrl: vi.fn(),
  auth: vi.fn(),
  checkCredits: vi.fn(),
  getSession: vi.fn(),
  isOrgWalletBillingEnabled: vi.fn(),
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
    mocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: vi.fn().mockResolvedValue(undefined),
      refund: vi.fn().mockResolvedValue(undefined),
    });
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
    expect(mocks.runRefineryAgent).not.toHaveBeenCalled();
  });

  it('canonicalizes the owned session and never accepts a caller supplied project id', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/refinery/route');

    const response = await POST(request({
      sessionId: 'session_requested',
      projectId: 'project_other_user',
      urls: ['https://example.com/reference', 'https://example.com/reference'],
    }));

    expect(response.status).toBe(200);
    expect(mocks.runRefineryAgent).toHaveBeenCalledWith({
      userId: 'user_1',
      sessionId: 'session_canonical',
      projectId: 'session_canonical',
      urls: ['https://example.com/reference'],
    });
  });

  it('does not fetch an unsafe URL after the extraction boundary rejects it', async () => {
    mocks.assertSafeAssetUrl.mockRejectedValueOnce(new Error('asset url: private IPv4 literal 169.254.169.254'));
    globalThis.fetch = vi.fn();
    const { extractUrlContent } = await import('@/lib/thinkforge/agents/url-brief-agent');

    await expect(extractUrlContent('http://169.254.169.254/latest/meta-data')).rejects.toThrow('private IPv4');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
