import { afterEach, describe, expect, it, vi } from 'vitest';

import { startChatSseHeartbeat } from '@/lib/editron/services/chat-sse-heartbeat';

afterEach(() => {
  vi.useRealTimers();
});

describe('chat SSE heartbeat', () => {
  it('keeps an otherwise idle stream active and stops cleanly', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_frame: Uint8Array) => undefined);
    const heartbeat = startChatSseHeartbeat({ write }, { intervalMs: 10_000 });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(write).toHaveBeenCalledTimes(3);
    expect(new TextDecoder().decode(write.mock.calls[0][0])).toBe(': heartbeat\n\n');

    await heartbeat.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('reports a broken stream once and stops scheduling writes', async () => {
    vi.useFakeTimers();
    const streamError = new Error('stream closed');
    const write = vi.fn(async (_frame: Uint8Array) => {
      throw streamError;
    });
    const onWriteError = vi.fn();
    const heartbeat = startChatSseHeartbeat(
      { write },
      { intervalMs: 10_000, onWriteError },
    );

    await vi.advanceTimersByTimeAsync(30_000);

    expect(write).toHaveBeenCalledTimes(1);
    expect(onWriteError).toHaveBeenCalledOnce();
    expect(onWriteError).toHaveBeenCalledWith(streamError);
    await heartbeat.stop();
  });

  it('rejects invalid heartbeat intervals', () => {
    const write = vi.fn(async (_frame: Uint8Array) => undefined);

    expect(() => startChatSseHeartbeat({ write }, { intervalMs: 0 })).toThrow(
      'Chat SSE heartbeat interval must be a positive finite number.',
    );
  });
});
