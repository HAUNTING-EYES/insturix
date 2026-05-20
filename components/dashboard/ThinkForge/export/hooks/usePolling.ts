import { useEffect, useRef, useCallback } from "react";

interface UsePollingOptions<T> {
  enabled: boolean;
  url: string | (() => string);
  intervalMs: number;
  maxAttempts: number;
  isComplete: (data: T) => boolean;
  onProgress?: (data: T) => void;
  onComplete: (data: T) => void;
  onTimeout?: () => void;
  onError?: (error: Error) => void;
}

export function usePolling<T>({
  enabled,
  url,
  intervalMs,
  maxAttempts,
  isComplete,
  onProgress,
  onComplete,
  onTimeout,
  onError,
}: UsePollingOptions<T>) {
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    timerRef.current = null;
    abortRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    stoppedRef.current = false;
    attemptRef.current = 0;

    async function poll() {
      if (stoppedRef.current) return;
      if (attemptRef.current >= maxAttempts) {
        onTimeout?.();
        return;
      }

      attemptRef.current += 1;
      abortRef.current = new AbortController();

      try {
        const resolvedUrl = typeof url === "function" ? url() : url;
        const res = await fetch(resolvedUrl, { signal: abortRef.current.signal });
        if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
        const data = (await res.json()) as T;

        if (stoppedRef.current) return;

        onProgress?.(data);

        if (isComplete(data)) {
          onComplete(data);
          return;
        }
      } catch (err) {
        if (stoppedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }

      if (!stoppedRef.current) {
        timerRef.current = setTimeout(poll, intervalMs);
      }
    }

    poll();

    return () => { stop(); };
  }, [enabled, url, intervalMs, maxAttempts, isComplete, onProgress, onComplete, onTimeout, onError, stop]);

  return { stop };
}
