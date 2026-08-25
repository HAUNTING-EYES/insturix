/**
 * Audio worker dispatch - the single way to enqueue the async BGM/SFX worker
 * (POST /api/internal/workers/pipeline/audio).
 *
 * Extracted from the storyboard finalize route (the original, only dispatcher) so the
 * director auto-edit path can enqueue BGM the same way instead of duplicating the logic.
 * Fire-and-forget: dispatch failures are logged, never thrown - audio is enhancement and
 * must not block project creation or the edit.
 */

import { randomBytes } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { isInternalQStashWorkerAuthConfigured } from '@/lib/editron/security/internal-worker-auth';

const AUDIO_DELIVERY_ID_PATTERN = /^audio-delivery_[A-Za-z0-9_-]{18}$/;

export interface AudioDispatchResult {
  version: 'audio-dispatch-result-v1';
  label: string;
  url: string;
  dispatched: boolean;
  method: 'qstash' | 'fetch' | 'none';
  /** Stable identity carried unchanged by QStash retries. */
  deliveryId?: string;
  messageId?: string;
  error?: string;
}

export function getAudioWorkerUrl(): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  return `${base}/api/internal/workers/pipeline/audio`;
}

function isDevelopmentRuntime(): boolean {
  return process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
}

function notDispatched(label: string, url: string, error: string): AudioDispatchResult {
  console.error(`[AudioDispatch] ${label} was not dispatched: ${error}`);
  return {
    version: 'audio-dispatch-result-v1',
    label,
    url,
    dispatched: false,
    method: 'none',
    error,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createAudioDeliveryId(): string {
  return `audio-delivery_${randomBytes(14).toString('base64url').slice(0, 18)}`;
}

function withAudioDeliveryIdentity(body: unknown): {
  body: Record<string, unknown>;
  deliveryId: string;
} {
  if (!isPlainRecord(body)) {
    throw new Error('Audio worker payload must be a JSON object.');
  }
  const suppliedDeliveryId = body.audioDeliveryId;
  if (
    suppliedDeliveryId !== undefined
    && (typeof suppliedDeliveryId !== 'string' || !AUDIO_DELIVERY_ID_PATTERN.test(suppliedDeliveryId))
  ) {
    throw new Error('Audio worker payload has an invalid audioDeliveryId.');
  }
  const deliveryId = typeof suppliedDeliveryId === 'string'
    ? suppliedDeliveryId
    : createAudioDeliveryId();
  return {
    body: { ...body, audioDeliveryId: deliveryId },
    deliveryId,
  };
}

/**
 * Enqueue an audio-worker job. Production requires the QStash publisher token and the
 * signing-key pair that the worker verifies. Local development may use a direct fetch.
 * Never throws: callers receive an explicit non-dispatch result and can compensate.
 */
export async function dispatchAudioJob(body: unknown, label: string): Promise<AudioDispatchResult> {
  const url = getAudioWorkerUrl();
  const isDevelopment = isDevelopmentRuntime();
  const qstashToken = process.env.QSTASH_TOKEN?.trim();

  if (!isDevelopment && !qstashToken) {
    return notDispatched(label, url, 'QSTASH_TOKEN is required to dispatch audio workers outside development');
  }
  if (!isDevelopment && !isInternalQStashWorkerAuthConfigured()) {
    return notDispatched(label, url, 'QStash signing keys are required to dispatch audio workers outside development');
  }

  try {
    const delivery = withAudioDeliveryIdentity(body);
    if (qstashToken) {
      const qstash = new Client({ token: qstashToken, baseUrl: process.env.QSTASH_URL || undefined });
      const result = await qstash.publishJSON({ url, body: delivery.body, retries: 2 });
      const messageId = (result as any)?.messageId;
      console.log(`[AudioDispatch] ${label} dispatched via QStash: ${messageId || 'ok'}`);
      return {
        version: 'audio-dispatch-result-v1',
        label,
        url,
        dispatched: true,
        method: 'qstash',
        deliveryId: delivery.deliveryId,
        ...(messageId ? { messageId } : {}),
      };
    }

    // Development-only fallback: production must not claim an unsigned enqueue succeeded.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delivery.body),
    }).catch(() => {});
    console.log(`[AudioDispatch] ${label} dispatched via fetch (no QStash)`);
    return {
      version: 'audio-dispatch-result-v1',
      label,
      url,
      dispatched: true,
      method: 'fetch',
      deliveryId: delivery.deliveryId,
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
