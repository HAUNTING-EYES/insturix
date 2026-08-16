import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processPostMortemJob: vi.fn(),
  verifySignatureAppRouter: vi.fn((handler: unknown) => handler),
}));

vi.mock('@upstash/qstash/nextjs', () => ({ verifySignatureAppRouter: mocks.verifySignatureAppRouter }));
vi.mock('@/lib/thinkforge/post-mortem/post-mortem-job', () => ({
  processPostMortemJob: mocks.processPostMortemJob,
}));

function request(body: unknown): Request {
  return new Request('http://localhost/api/internal/workers/thinkforge/post-mortem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ThinkForge post-mortem worker boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processPostMortemJob.mockResolvedValue({ status: 'completed' });
  });

  it('rejects malformed job identifiers before touching durable state', async () => {
    const { postMortemWorkerHandler } = await import('@/lib/thinkforge/post-mortem/post-mortem-worker-handler');

    const response = await postMortemWorkerHandler(request({ jobId: '../session_1' }) as never);

    expect(response.status).toBe(400);
    expect(mocks.processPostMortemJob).not.toHaveBeenCalled();
  });

  it('returns a retryable HTTP failure only while the job is durably queued', async () => {
    mocks.processPostMortemJob.mockResolvedValue({ status: 'queued', error: 'provider unavailable' });
    const { postMortemWorkerHandler } = await import('@/lib/thinkforge/post-mortem/post-mortem-worker-handler');

    const response = await postMortemWorkerHandler(request({ jobId: 'postmortem_a1b2' }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: 'queued' });
  });

  it.each([
    [{ status: 'completed' }, 200],
    [{ status: 'dead_letter', error: 'attempts exhausted' }, 200],
    [{ status: 'deferred', reason: 'lease_held' }, 200],
    [{ status: 'skipped', reason: 'terminal' }, 200],
  ])('acknowledges non-retry state %#', async (result, expectedStatus) => {
    mocks.processPostMortemJob.mockResolvedValue(result);
    const { postMortemWorkerHandler } = await import('@/lib/thinkforge/post-mortem/post-mortem-worker-handler');

    const response = await postMortemWorkerHandler(request({ jobId: 'postmortem_a1b2' }) as never);

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual(result);
  });

  it('does not expose internal error details from an unrecoverable boundary failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.processPostMortemJob.mockRejectedValue(new Error('mongodb://private-host/secret'));
    const { postMortemWorkerHandler } = await import('@/lib/thinkforge/post-mortem/post-mortem-worker-handler');

    const response = await postMortemWorkerHandler(request({ jobId: 'postmortem_a1b2' }) as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ status: 'worker_failure' });
    expect(JSON.stringify(body)).not.toContain('private-host');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-host');
    expect(JSON.stringify(log.mock.calls)).toContain('[redacted-url]');
    log.mockRestore();
  });
});
