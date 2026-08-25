import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A deliberately narrow server-to-server credential for the one chat tool
 * that invokes the public storyboard-video enqueue route without browser
 * cookies. It is not a generic internal API authorization mechanism.
 */
export const PIPELINE_VIDEO_ENQUEUE_INTERNAL_AUTH_ACTION_V1 =
  'pipeline-video-enqueue-v1' as const;
export const PIPELINE_VIDEO_ENQUEUE_INTERNAL_ISSUED_AT_HEADER_V1 =
  'x-editron-internal-issued-at' as const;
export const PIPELINE_VIDEO_ENQUEUE_INTERNAL_SIGNATURE_HEADER_V1 =
  'x-editron-internal-signature' as const;
export const PIPELINE_VIDEO_ENQUEUE_INTERNAL_MAX_AGE_MS_V1 = 120_000;

type InternalAuthEnvironment = Readonly<Record<string, string | undefined>>;
type HeaderSource = Headers | Readonly<Record<string, string | null | undefined>>;

export type PipelineVideoEnqueueInternalAuthDispositionV1 =
  | 'ACCEPTED'
  | 'NOT_CONFIGURED'
  | 'MISSING_HEADERS'
  | 'INVALID_ISSUED_AT'
  | 'EXPIRED'
  | 'INVALID_SIGNATURE';

export interface PipelineVideoEnqueueInternalAuthResultV1 {
  disposition: PipelineVideoEnqueueInternalAuthDispositionV1;
}

export function createPipelineVideoEnqueueInternalHeadersV1(
  rawBody: string,
  options: {
    nowMs?: number;
    env?: InternalAuthEnvironment;
  } = {},
): Record<string, string> {
  const env = options.env ?? process.env;
  const secret = configuredSecret(env);
  if (!secret) {
    throw new Error('PIPELINE_VIDEO_ENQUEUE_INTERNAL_AUTH_NOT_CONFIGURED');
  }
  const issuedAt = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    throw new Error('PIPELINE_VIDEO_ENQUEUE_INTERNAL_AUTH_ISSUED_AT_INVALID');
  }
  const issuedAtHeader = String(issuedAt);
  return {
    [PIPELINE_VIDEO_ENQUEUE_INTERNAL_ISSUED_AT_HEADER_V1]: issuedAtHeader,
    [PIPELINE_VIDEO_ENQUEUE_INTERNAL_SIGNATURE_HEADER_V1]: sign(
      secret,
      signingMaterial(issuedAtHeader, rawBody),
    ),
  };
}

export function verifyPipelineVideoEnqueueInternalRequestV1(
  headers: HeaderSource,
  rawBody: string,
  options: {
    nowMs?: number;
    env?: InternalAuthEnvironment;
  } = {},
): PipelineVideoEnqueueInternalAuthResultV1 {
  const env = options.env ?? process.env;
  const secret = configuredSecret(env);
  if (!secret) return { disposition: 'NOT_CONFIGURED' };

  const issuedAtHeader = readHeader(headers, PIPELINE_VIDEO_ENQUEUE_INTERNAL_ISSUED_AT_HEADER_V1);
  const suppliedSignature = readHeader(headers, PIPELINE_VIDEO_ENQUEUE_INTERNAL_SIGNATURE_HEADER_V1);
  if (!issuedAtHeader || !suppliedSignature) return { disposition: 'MISSING_HEADERS' };
  if (!/^\d{1,16}$/.test(issuedAtHeader)) return { disposition: 'INVALID_ISSUED_AT' };

  const issuedAt = Number(issuedAtHeader);
  if (!Number.isSafeInteger(issuedAt)) return { disposition: 'INVALID_ISSUED_AT' };
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || Math.abs(nowMs - issuedAt) > PIPELINE_VIDEO_ENQUEUE_INTERNAL_MAX_AGE_MS_V1) {
    return { disposition: 'EXPIRED' };
  }

  const expectedSignature = sign(secret, signingMaterial(issuedAtHeader, rawBody));
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
    return { disposition: 'INVALID_SIGNATURE' };
  }
  return { disposition: 'ACCEPTED' };
}

function configuredSecret(env: InternalAuthEnvironment): string | null {
  const secret = env.MONOLITHIC_BACKEND_SECRET?.trim();
  return secret ? secret : null;
}

function signingMaterial(issuedAtHeader: string, rawBody: string): string {
  return [
    'EDITRON_INTERNAL_ACTION_V1',
    PIPELINE_VIDEO_ENQUEUE_INTERNAL_AUTH_ACTION_V1,
    issuedAtHeader,
    rawBody,
  ].join('\n');
}

function sign(secret: string, material: string): string {
  return `sha256=${createHmac('sha256', secret).update(material).digest('hex')}`;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function readHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const record = headers as Readonly<Record<string, string | null | undefined>>;
  return record[name] ?? record[name.toLowerCase()] ?? null;
}
