/**
 * Audio worker dispatch - the single way to enqueue the async BGM/SFX worker
 * (POST /api/internal/workers/pipeline/audio).
 *
 * Extracted from the storyboard finalize route (the original, only dispatcher) so the
 * director auto-edit path can enqueue BGM the same way instead of duplicating the logic.
 * Fire-and-forget: dispatch failures are logged, never thrown - audio is enhancement and
 * must not block project creation or the edit.
 */

import { Client } from '@upstash/qstash';

export interface AudioDispatchResult {
  version: 'audio-dispatch-result-v1';
  label: string;
  url: string;
  dispatched: boolean;
  method: 'qstash' | 'fetch' | 'none';
  messageId?: string;
  error?: string;
}

export function getAudioWorkerUrl(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  return `${base}/api/internal/workers/pipeline/audio`;
}

/**
 * Enqueue an audio-worker job. Uses QStash when QSTASH_TOKEN is set (durable, retried);
 * otherwise falls back to a fire-and-forget fetch (local/dev). Never throws.
 */
export async function dispatchAudioJob(body: unknown, label: string): Promise<AudioDispatchResult> {
  const url = getAudioWorkerUrl();
  try {
    if (process.env.QSTASH_TOKEN) {
      const qstash = new Client({ token: process.env.QSTASH_TOKEN, baseUrl: process.env.QSTASH_URL || undefined });
      const result = await qstash.publishJSON({ url, body, retries: 2 });
      const messageId = (result as any)?.messageId;
      console.log(`[AudioDispatch] ${label} dispatched via QStash: ${messageId || 'ok'}`);
      return {
        version: 'audio-dispatch-result-v1',
        label,
        url,
        dispatched: true,
        method: 'qstash',
        ...(messageId ? { messageId } : {}),
      };
    }

    // Fallback: fire-and-forget fetch (no QStash configured)
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    console.log(`[AudioDispatch] ${label} dispatched via fetch (no QStash)`);
    return {
      version: 'audio-dispatch-result-v1',
      label,
      url,
      dispatched: true,
      method: 'fetch',
    };
  } catch (err: any) {
    const error = err?.message ?? String(err);
    console.error(`[AudioDispatch] ${label} dispatch failed:`, error);
    return {
      version: 'audio-dispatch-result-v1',
      label,
      url,
      dispatched: false,
      method: 'none',
      error,
    };
  }
}