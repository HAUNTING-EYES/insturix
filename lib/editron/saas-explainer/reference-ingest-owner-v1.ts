import { createHash } from 'node:crypto';

import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import type { UploadResult } from '@/lib/editron/services/upload-service';
import {
  canonicalizeReferenceVideo,
  CanonicalizeReferenceError,
  type CanonicalizeReferenceOutput,
} from '@/lib/editron/reference-video/canonicalize-reference';
import type {
  ReferenceVideoFrameSample,
  SampleReferenceVideoFramesParams,
} from '@/lib/editron/reference-video/reference-frame-sampler';
import {
  resolveReferenceVideoSource,
  type ReferenceVideoAssetResolver,
  type ReferenceVideoSource,
} from '@/lib/editron/reference-video/reference-video-source';

export type SaasReferenceIngestInputV1 =
  | Readonly<{ kind: 'upload'; bytes: Buffer; filename: string }>
  | Readonly<{ kind: 'url'; videoUrl: string }>;

export interface SaasCanonicalReferenceV1 {
  referenceAssetId: string;
  videoUrl: string;
  durationSec?: number;
  sourceKind: string;
  sourceLabel?: string;
  sourceFingerprint?: string;
  sourceRegistrationReceiptSha256?: string;
}

export interface SaasReferenceIngestResultV1 {
  canonical: Readonly<SaasCanonicalReferenceV1>;
  referenceImageUrls: string[];
  frameAssetIds: string[];
  frameRegistrationReceiptSha256s: string[];
}

export interface SaasReferenceIngestDepsV1 {
  assetResolver?: ReferenceVideoAssetResolver;
  resolveSource?: typeof resolveReferenceVideoSource;
  canonicalize?: typeof canonicalizeReferenceVideo;
  sampleFrames?: (
    input: Readonly<SampleReferenceVideoFramesParams>,
  ) => Promise<ReferenceVideoFrameSample[]>;
  upload?: (
    bytes: Buffer,
    userId: string,
    filename: string,
    contentType: string,
    options: Readonly<{ customAssetId: string }>,
  ) => Promise<UploadResult>;
}

export class SaasReferenceIngestErrorV1 extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'SaasReferenceIngestErrorV1';
  }
}

export function assertSupportedSaasReferenceUploadV1(filename: string): void {
  resolveUploadFormat(filename);
}

/**
 * SaaS-specific adapter only. Resolution, byte identity, persistence and frame
 * registration remain owned by the existing reference-video services.
 */
export async function ingestSaasExplainerReferenceV1(
  input: Readonly<{ userId: string; source: SaasReferenceIngestInputV1 }>,
  deps: Readonly<SaasReferenceIngestDepsV1> = {},
): Promise<Readonly<SaasReferenceIngestResultV1>> {
  const canonical = input.source.kind === 'upload'
    ? await canonicalizeUploadedReferenceV1(input.userId, input.source, deps)
    : await resolveCanonicalSaasReferenceSourceV1(
      { userId: input.userId, referenceVideoUrl: input.source.videoUrl }, deps,
    );
  const sampleFrames = deps.sampleFrames
    ?? (await import('@/lib/editron/reference-video/reference-frame-sampler')).sampleReferenceVideoFrames;

  let frames: ReferenceVideoFrameSample[];
  try {
    frames = await sampleFrames({
      videoUrl: canonical.videoUrl,
      userId: input.userId,
      referenceAssetId: canonical.referenceAssetId,
      durationSec: canonical.durationSec,
    });
  } catch (error) {
    throw new SaasReferenceIngestErrorV1(
      'frame_sampling_failed',
      502,
      `Canonical reference frame sampling failed: ${message(error)}`,
    );
  }
  if (frames.length === 0) {
    throw new SaasReferenceIngestErrorV1(
      'reference_frames_empty', 422, 'Canonical reference produced no review frames.',
    );
  }
  return {
    canonical,
    referenceImageUrls: frames.map((frame) => frame.url),
    frameAssetIds: frames.map((frame) => frame.assetId),
    frameRegistrationReceiptSha256s: frames.map((frame) => frame.registrationReceiptSha256),
  };
}

export async function resolveCanonicalSaasReferenceSourceV1(
  input: Readonly<{ userId: string; referenceVideoUrl: string }>,
  deps: Readonly<SaasReferenceIngestDepsV1> = {},
): Promise<Readonly<SaasCanonicalReferenceV1>> {
  const resolveSource = deps.resolveSource ?? resolveReferenceVideoSource;
  const assetResolver = deps.assetResolver
    ?? (await import('@/lib/editron/services/asset-resolver')).assetResolver;
  const resolved = await resolveSource({
    userId: input.userId,
    referenceVideoUrl: input.referenceVideoUrl,
    assetResolver,
  });
  if (!resolved.ok) {
    throw new SaasReferenceIngestErrorV1(
      resolved.reason,
      422,
      resolved.diagnostics[0] || 'Reference video source was rejected.',
      resolved.diagnostics,
    );
  }
  return canonicalizeResolvedSource(input.userId, resolved.source, deps);
}

async function canonicalizeUploadedReferenceV1(
  userId: string,
  input: Extract<SaasReferenceIngestInputV1, { kind: 'upload' }>,
  deps: Readonly<SaasReferenceIngestDepsV1>,
): Promise<Readonly<SaasCanonicalReferenceV1>> {
  if (!userId.trim()) fail('user_required', 401, 'Authenticated user is required.');
  if (!Buffer.isBuffer(input.bytes) || input.bytes.byteLength === 0) {
    fail('upload_empty', 400, 'Reference video upload is empty.');
  }
  const format = resolveUploadFormat(input.filename);
  const contentSha256 = createHash('sha256').update(input.bytes).digest('hex');
  const logicalAssetId = `saasref_upload_${contentSha256.slice(0, 24)}`;
  const upload = deps.upload
    ?? (await import('@/lib/editron/services/upload-service')).uploadMedia;

  let uploaded: UploadResult;
  try {
    uploaded = await upload(
      input.bytes,
      userId,
      `${logicalAssetId}.${format.extension}`,
      format.contentType,
      { customAssetId: logicalAssetId },
    );
  } catch (error) {
    throw new SaasReferenceIngestErrorV1(
      'upload_storage_failed', 500, `Reference video upload failed: ${message(error)}`,
    );
  }
  if (!uploaded.r2Key && !uploaded.gcsPath) {
    fail('upload_storage_missing', 500, 'Reference upload returned no managed storage identity.');
  }

  const source: ReferenceVideoSource = {
    kind: 'asset',
    referenceId: logicalAssetId,
    videoUrl: uploaded.signedUrl,
    sourceLabel: input.filename,
    sourceFingerprint: `upload|sha256:${contentSha256}`,
    asset: buildEphemeralUploadedAsset(userId, logicalAssetId, input.filename, uploaded),
  };
  return canonicalizeResolvedSource(userId, source, deps, input.bytes);
}

async function canonicalizeResolvedSource(
  userId: string,
  source: Readonly<ReferenceVideoSource>,
  deps: Readonly<SaasReferenceIngestDepsV1>,
  exactBytes?: Buffer,
): Promise<Readonly<SaasCanonicalReferenceV1>> {
  const canonicalize = deps.canonicalize ?? canonicalizeReferenceVideo;
  try {
    const canonical = await canonicalize(
      { userId, source, audioUsageMode: 'preview-waveform-only' },
      exactBytes ? { downloadSourceBytes: async () => exactBytes } : {},
    );
    return projectCanonicalSource(canonical);
  } catch (error) {
    if (error instanceof SaasReferenceIngestErrorV1) throw error;
    const status = error instanceof CanonicalizeReferenceError
      && ['source_too_small', 'source_demux_failed'].includes(error.code)
      ? 422
      : 502;
    throw new SaasReferenceIngestErrorV1(
      error instanceof CanonicalizeReferenceError ? error.code : 'source_canonicalization_failed',
      status,
      `Reference canonicalization failed: ${message(error)}`,
    );
  }
}

function projectCanonicalSource(
  canonical: Readonly<CanonicalizeReferenceOutput>,
): Readonly<SaasCanonicalReferenceV1> {
  return {
    referenceAssetId: canonical.referenceAssetId,
    videoUrl: canonical.videoUrl,
    durationSec: canonical.durationSec,
    sourceKind: canonical.canonicalKind,
    sourceLabel: canonical.sourceLabel,
    sourceFingerprint: canonical.sourceFingerprint,
    sourceRegistrationReceiptSha256: canonical.sourceRegistration?.receiptSha256,
  };
}

function buildEphemeralUploadedAsset(
  userId: string,
  logicalAssetId: string,
  filename: string,
  upload: Readonly<UploadResult>,
): MediaAsset {
  return {
    assetId: logicalAssetId,
    userId,
    type: 'video',
    filename,
    source: 'user-upload',
    gcsPath: upload.gcsPath,
    r2Key: upload.r2Key ?? undefined,
    cachedUrl: upload.signedUrl,
    urlExpiresAt: upload.urlExpiresAt ?? new Date('9999-12-31T23:59:59.999Z'),
    size: upload.size,
    uploadedAt: new Date(),
  };
}

function resolveUploadFormat(filename: string): Readonly<{ extension: string; contentType: string }> {
  const extension = filename.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const contentTypes: Readonly<Record<string, string>> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
  };
  const contentType = contentTypes[extension];
  if (!contentType) fail('upload_type_unsupported', 415, 'Use an mp4, mov, webm, or m4v reference video.');
  return { extension, contentType };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(code: string, status: number, error: string): never {
  throw new SaasReferenceIngestErrorV1(code, status, error);
}
