import { Client } from '@upstash/qstash';
import { z } from 'zod';

import { RenderExpectedDurationMsSchema } from '@/lib/editron/schemas/render-job';
import { isRenderFinalizerConfigured } from '@/lib/editron/services/render-finalizer-client';
import type { ClaimedRenderFinalization } from '@/lib/editron/services/render-job-service';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;

export const RenderFinalizationJobMessageSchema = z.object({
  version: z.literal('editron-render-finalization-job-v1'),
  jobId: z.string().min(1).max(128).regex(SAFE_IDENTIFIER),
  claimToken: z.string().min(1).max(128).regex(SAFE_IDENTIFIER),
  sourceOutputUrl: z.string().url().refine((value) => value.startsWith('https://')),
  sourceOutputSize: z.number().int().nonnegative(),
  expectedDurationMs: RenderExpectedDurationMsSchema,
}).strict();

export type RenderFinalizationJobMessage = z.infer<typeof RenderFinalizationJobMessageSchema>;

export interface RenderFinalizationPipelineEnvironment {
  EDITRON_RENDER_FINALIZER_ENDPOINT?: string;
  EDITRON_RENDER_FINALIZER_TOKEN?: string;
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export interface RenderFinalizationPipelineConfig {
  configured: boolean;
  reason: string | null;
  workerUrl: string | null;
  failureCallbackUrl: string | null;
}

function processEnvironment(): RenderFinalizationPipelineEnvironment {
  return {
    EDITRON_RENDER_FINALIZER_ENDPOINT: process.env.EDITRON_RENDER_FINALIZER_ENDPOINT,
    EDITRON_RENDER_FINALIZER_TOKEN: process.env.EDITRON_RENDER_FINALIZER_TOKEN,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

function resolvePublicBaseUrl(env: RenderFinalizationPipelineEnvironment): string | null {
  const candidate = env.VERCEL_URL
    ? `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}`
    : env.NEXT_PUBLIC_APP_URL;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function resolveRenderFinalizationPipelineConfig(
  env: RenderFinalizationPipelineEnvironment = processEnvironment(),
): RenderFinalizationPipelineConfig {
  const publicBaseUrl = resolvePublicBaseUrl(env);
  const reason = !isRenderFinalizerConfigured(env)
    ? 'missing_render_finalizer_endpoint_or_token'
    : !env.QSTASH_TOKEN?.trim()
      ? 'missing_qstash_token'
      : !env.QSTASH_CURRENT_SIGNING_KEY?.trim() || !env.QSTASH_NEXT_SIGNING_KEY?.trim()
        ? 'missing_qstash_signing_keys'
        : !publicBaseUrl
          ? 'missing_public_app_url'
          : null;
  return {
    configured: reason === null,
    reason,
    workerUrl: publicBaseUrl ? `${publicBaseUrl}/api/internal/workers/render-finalizer` : null,
    failureCallbackUrl: publicBaseUrl
      ? `${publicBaseUrl}/api/internal/workers/render-finalizer/failure`
      : null,
  };
}

export function isRenderFinalizationPipelineConfigured(
  env: RenderFinalizationPipelineEnvironment = processEnvironment(),
): boolean {
  return resolveRenderFinalizationPipelineConfig(env).configured;
}

export async function enqueueRenderFinalization(
  claim: ClaimedRenderFinalization,
  options: { env?: RenderFinalizationPipelineEnvironment } = {},
): Promise<{ messageId: string | null }> {
  const env = options.env ?? processEnvironment();
  const config = resolveRenderFinalizationPipelineConfig(env);
  if (!config.configured || !config.workerUrl || !config.failureCallbackUrl) {
    throw new Error(`Render finalization pipeline is not configured: ${config.reason ?? 'unknown'}.`);
  }

  const message = RenderFinalizationJobMessageSchema.parse({
    version: 'editron-render-finalization-job-v1',
    jobId: claim.jobId,
    claimToken: claim.claimToken,
    sourceOutputUrl: claim.sourceOutputUrl,
    sourceOutputSize: claim.sourceOutputSize,
    expectedDurationMs: claim.expectedDurationMs,
  });
  const qstash = new Client({
    token: env.QSTASH_TOKEN as string,
    baseUrl: env.QSTASH_URL || undefined,
  });
  const result = await qstash.publishJSON({
    url: config.workerUrl,
    failureCallback: config.failureCallbackUrl,
    body: message,
    retries: 3,
    deduplicationId: claim.claimToken,
    headers: {
      'Upstash-Timeout': '300s',
    },
  });
  return {
    messageId: typeof result?.messageId === 'string' ? result.messageId : null,
  };
}

export function parseRenderFinalizationFailureEnvelope(raw: unknown): {
  message: RenderFinalizationJobMessage;
  error: string;
} {
  const envelope = asRecord(raw);
  if (!envelope) throw new Error('Render finalization failure callback body must be an object.');
  const sourceBody = parseEmbeddedJson(envelope.sourceBody)
    ?? parseEmbeddedJson(envelope.requestBody)
    ?? parseEmbeddedJson(envelope.payload);
  const message = RenderFinalizationJobMessageSchema.parse(sourceBody);
  const retried = boundedInteger(envelope.retried, 100);
  const maxRetries = boundedInteger(envelope.maxRetries, 100);
  const status = boundedInteger(envelope.status, 599);
  const responseDetail = decodeBase64Text(envelope.body, 320);
  const attemptCount = Math.max(retried + 1, maxRetries + 1, 1);
  const statusDetail = status > 0 ? `; last HTTP status ${status}` : '';
  const responseSuffix = responseDetail ? `; response: ${responseDetail}` : '';
  return {
    message,
    error: `Render finalization delivery failed after ${attemptCount} attempt(s)${statusDetail}${responseSuffix}`
      .slice(0, 1000),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseEmbeddedJson(value: unknown): unknown | null {
  if (asRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function decodeBase64Text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const text = Buffer.from(value, 'base64').toString('utf8').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, maxLength) : null;
  } catch {
    return null;
  }
}

function boundedInteger(value: unknown, maximum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : 0;
}
