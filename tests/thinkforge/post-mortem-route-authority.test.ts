import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class PostMortemScopeError extends Error {
    constructor(
      message: string,
      readonly code: string,
      readonly status: 403 | 409,
    ) {
      super(message);
    }
  }
  return {
    PostMortemScopeError,
    auth: vi.fn(),
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    resolvePostMortemScope: vi.fn(),
    runPostMortemAgent: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));
vi.mock('@/lib/thinkforge/agents/post-mortem-agent', () => ({
  runPostMortemAgent: mocks.runPostMortemAgent,
}));
vi.mock('@/lib/thinkforge/agents/post-mortem-scope', () => ({
  PostMortemScopeError: mocks.PostMortemScopeError,
  resolvePostMortemScope: mocks.resolvePostMortemScope,
}));

const scopedInput = {
  userId: 'user_1',
  orgId: 'org_1',
  sessionId: 'session_1',
  brandId: 'brand_1',
};

describe('post-mortem route authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTMORTEM_ENABLED = 'true';
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.resolvePostMortemScope.mockResolvedValue({
      input: scopedInput,
      projectLink: null,
      session: { _id: 'session_1' },
    });
    mocks.runPostMortemAgent.mockResolvedValue({
      summaryEntryId: 'summary_1',
      lessonsExtracted: 1,
      eventsDeleted: 1,
      entriesDeleted: 1,
    });
    mocks.deleteSession.mockResolvedValue(true);
  });

  it('passes Clerk organization authority through the direct post-mortem route', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/events/post-mortem/route');
    const response = await POST(new Request('http://localhost/post-mortem', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session_1' }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.resolvePostMortemScope).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      projectTitle: undefined,
    });
    expect(mocks.runPostMortemAgent).toHaveBeenCalledWith(scopedInput);
  });

  it('denies a collaborator from deleting another member session', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'session_1',
      userId: 'session_owner',
      orgId: 'org_1',
      projectMeta: {},
    });
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/sessions/session_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.runPostMortemAgent).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('preserves the session when learning is not durable', async () => {
    mocks.runPostMortemAgent.mockRejectedValue(new Error('vector unavailable'));
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/sessions/session_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'post_mortem_not_durable',
      retryable: true,
    });
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('deletes an owner session only after post-mortem succeeds', async () => {
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/sessions/session_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'session_1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getSession).toHaveBeenCalledWith('session_1', 'user_1', 'org_1');
    expect(mocks.resolvePostMortemScope).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
    }));
    expect(mocks.runPostMortemAgent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteSession.mock.invocationCallOrder[0],
    );
  });
});
