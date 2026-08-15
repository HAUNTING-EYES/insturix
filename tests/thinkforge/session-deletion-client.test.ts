import { describe, expect, it, vi } from 'vitest';
import { deleteThinkForgeSessionWhenDurable } from '@/components/dashboard/ThinkForge/session-deletion';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ThinkForge durable session deletion client', () => {
  it('supports the previous synchronous route during a rolling deployment', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, { success: true }));

    await expect(deleteThinkForgeSessionWhenDurable('session 1', { fetcher })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toContain('session%201');
  });

  it('waits for durable completion before resolving', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(202, {
        success: true,
        status: 'queued',
        statusUrl: '/api/services/thinkforge/events/post-mortem/postmortem_abc',
      }))
      .mockResolvedValueOnce(response(200, { status: 'running' }))
      .mockResolvedValueOnce(response(200, { status: 'completed' }));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(deleteThinkForgeSessionWhenDurable('session_1', { fetcher, wait })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledOnce();
  });

  it('keeps the session visible when learning enters dead letter', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(202, {
        status: 'queued',
        statusUrl: '/api/services/thinkforge/events/post-mortem/postmortem_abc',
      }))
      .mockResolvedValueOnce(response(200, {
        status: 'dead_letter',
        error: { message: 'Vector storage unavailable.' },
      }));

    await expect(deleteThinkForgeSessionWhenDurable('session_1', { fetcher }))
      .rejects.toThrow('Vector storage unavailable.');
  });

  it('stops a never-ending spinner at the bounded poll limit', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(202, {
        status: 'queued',
        statusUrl: '/api/services/thinkforge/events/post-mortem/postmortem_abc',
      }))
      .mockResolvedValue(response(200, { status: 'running' }));

    await expect(deleteThinkForgeSessionWhenDurable('session_1', {
      fetcher,
      maxPolls: 2,
      wait: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow('still processing');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
