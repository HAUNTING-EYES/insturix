const DEFAULT_CHAT_SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_FRAME = new TextEncoder().encode(': heartbeat\n\n');

export interface ChatSseHeartbeat {
  stop(): Promise<void>;
}

export function startChatSseHeartbeat(
  writer: Pick<WritableStreamDefaultWriter<Uint8Array>, 'write'>,
  options: {
    intervalMs?: number;
    onWriteError?: (error: unknown) => void;
  } = {},
): ChatSseHeartbeat {
  const intervalMs = options.intervalMs ?? DEFAULT_CHAT_SSE_HEARTBEAT_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('Chat SSE heartbeat interval must be a positive finite number.');
  }

  let stopped = false;
  let pendingWrite = Promise.resolve();
  const timer = setInterval(() => {
    pendingWrite = pendingWrite
      .then(async () => {
        if (!stopped) await writer.write(HEARTBEAT_FRAME);
      })
      .catch((error: unknown) => {
        stopped = true;
        clearInterval(timer);
        options.onWriteError?.(error);
      });
  }, intervalMs);
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pendingWrite;
    },
  };
}
