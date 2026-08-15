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
    enqueuePostMortemJob: vi.fn(),
    getAuthorized: vi.fn(),
    getSession: vi.fn(),
    isPostMortemWorkerConfigured: vi.fn(),
    resolvePostMortemScope: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/services/db', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/thinkforge/post-mortem/post-mortem-job', () => ({
  enqueuePostMortemJob: mocks.enqueuePostMortemJob,
  isPostMortemWorkerConfigured: mocks.isPostMortemWorkerConfigured,
}));
vi.mock('@/lib/thinkforge/post-mortem/post-mortem-job-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/thinkforge/post-mortem/post-mortem-job-store')>();
  return { ...original, postMortemJobStore: { getAuthorized: mocks.getAuthorized } };
});
vi.mock('@/lib/thinkforge/agents/post-mortem-scope', () => ({
  PostMortemScopeError: mocks.PostMortemScopeError,
  resolvePostMortemScope: mocks.resolvePostMortemScope,
}));

const scopedInput = { userId: 'user_1', orgId: 'org_1', sessionId: 'session_1', brandId: 'brand_1' };
const queuedJob = {
  id: 'postmortem_a1b2',
  status: 'queued',
  attemptCount: 0,
  maxAttempts: 3,
  input: { ...scopedInput, deleteSessionOnCompletion: false },
  error: null,
  result: null,
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
};

describe('post-mortem route authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POSTMORTEM_ENABLED = 'true';
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.getSession.mockResolvedValue({
      _id: 'session_1', userId: 'user_1', orgId: 'org_1', projectMeta: { brandId: 'brand_1' },
    });
    mocks.resolvePostMortemScope.mockResolvedValue({
      input: scopedInput,
      projectLink: null,
      session: { _id: 'session_1' },
    });
    mocks.isPostMortemWorkerConfigured.mockReturnValue(true);
    mocks.enqueuePostMortemJob.mockResolvedValue({ job: queuedJob, created: true, queueMessageId: 'qstash_1' });
    mocks.getAuthorized.mockResolvedValue(queuedJob);
  });

  it('queues an organization-scoped post-mortem and returns a status resource', async () => {
    const { POST } = await import('@/app/api/services/thinkforge/events/post-mortem/route');
    const response = await POST(new Request('http://localhost/post-mortem', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session_1' }),
    }));

    expect(response.status).toBe(202);
    expect(mocks.resolvePostMortemScope).toHaveBeenCalledWith({
      userId: 'user_1', orgId: 'org_1', sessionId: 'session_1', projectTitle: undefined,
    });
    expect(mocks.enqueuePostMortemJob).toHaveBeenCalledWith(scopedInput);
    await expect(response.json()).resolves.toMatchObject({
      jobId: 'postmortem_a1b2',
      statusUrl: '/api/services/thinkforge/events/post-mortem/postmortem_a1b2',
    });
  });

  it('denies a collaborator from deleting another member session', async () => {
    mocks.getSession.mockResolvedValue({ _id: 'session_1', userId: 'session_owner', orgId: 'org_1', projectMeta: {} });
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(new Request('http://localhost/sessions/session_1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.enqueuePostMortemJob).not.toHaveBeenCalled();
  });

  it('preserves the session when the durable worker is not configured', async () => {
    mocks.isPostMortemWorkerConfigured.mockReturnValue(false);
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(new Request('http://localhost/sessions/session_1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'post_mortem_worker_unavailable', retryable: true,
    });
    expect(mocks.enqueuePostMortemJob).not.toHaveBeenCalled();
  });

  it('returns deletion pending and never deletes inside the request', async () => {
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(new Request('http://localhost/sessions/session_1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(202);
    expect(mocks.enqueuePostMortemJob).toHaveBeenCalledWith(scopedInput, { deleteSessionOnCompletion: true });
    await expect(response.json()).resolves.toMatchObject({ deletionPending: true, jobId: 'postmortem_a1b2' });
  });

  it('keeps the session when queue dispatch fails', async () => {
    mocks.enqueuePostMortemJob.mockRejectedValue(new Error('qstash unavailable'));
    const { DELETE } = await import('@/app/api/services/thinkforge/sessions/[id]/route');
    const response = await DELETE(new Request('http://localhost/sessions/session_1', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'session_1' }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'post_mortem_queue_unavailable', retryable: true,
    });
  });

  it('returns only the authorized safe status projection', async () => {
    const { GET } = await import('@/app/api/services/thinkforge/events/post-mortem/[jobId]/route');
    const response = await GET(new Request('http://localhost/status'), {
      params: Promise.resolve({ jobId: 'postmortem_a1b2' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getAuthorized).toHaveBeenCalledWith('postmortem_a1b2', 'user_1', 'org_1');
    expect(body).toMatchObject({ status: 'queued', deletionPending: false });
    expect(body).not.toHaveProperty('input');
    expect(body).not.toHaveProperty('checkpoint');
  });

  it('does not reveal a foreign job', async () => {
    mocks.getAuthorized.mockResolvedValue(null);
    const { GET } = await import('@/app/api/services/thinkforge/events/post-mortem/[jobId]/route');
    const response = await GET(new Request('http://localhost/status'), {
      params: Promise.resolve({ jobId: 'postmortem_a1b2' }),
    });

    expect(response.status).toBe(404);
  });
});
