import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { hashEditronCanonicalJsonV1 } from '@/lib/editron/services/canonical-json-v1';
import { getFFmpegPath } from '@/lib/editron/services/media/analysis-service';
import { uploadMediaFromFile, type UploadResult } from '@/lib/editron/services/upload-service';

import { buildReferenceFrameAssetId } from './reference-frame-asset-id';
import {
  measureStableReferenceMediaFileV1,
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
  registerReferenceMaterializedMediaFileV1,
  type ReferenceMaterializedMediaFileRegistrationInputV1,
  type ReferenceMaterializedMediaRegistrationReceiptV1,
} from './reference-materialized-media-registration-v1';
import {
  buildGateFrameSchedule,
  REQUIRED_GATE_FRAME_COUNT,
} from './saas-reference-video-analyzer';

export { buildReferenceFrameAssetId } from './reference-frame-asset-id';

export interface ReferenceVideoFrameSample {
  index: number;
  timestampSec: number;
  timestampUs: string;
  frameId: string;
  assetId: string;
  url: string;
  mimeType: 'image/jpeg';
  byteLength: number;
  bytesSha256: string;
  storage: Readonly<{ backend: 'R2' | 'GCS'; key: string }>;
  registrationReceiptSha256: string;
}

export interface SampleReferenceVideoFramesParams {
  videoUrl: string;
  userId: string;
  referenceAssetId: string;
  durationSec?: number;
  sampleCount?: number;
  maxDownloadBytes?: number;
  fetchImpl?: typeof fetch;
  orgId?: string;
  abortSignal?: AbortSignal;
}

export interface ReferenceVideoFrameSamplerDeps {
  uploadFile?: typeof uploadMediaFromFile;
  registerFile?: (
    input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
  ) => Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>>;
  extractFrame?: typeof extractFrame;
}

const DEFAULT_MAX_REFERENCE_DOWNLOAD_BYTES = 350 * 1024 * 1024;

export async function sampleReferenceVideoFrames(
  params: SampleReferenceVideoFramesParams,
  deps: Readonly<ReferenceVideoFrameSamplerDeps> = {},
): Promise<ReferenceVideoFrameSample[]> {
  if (!params.videoUrl.trim()) throw new Error('videoUrl is required for reference frame sampling.');
  if (!params.userId.trim()) throw new Error('userId is required for reference frame sampling.');
  if (!params.referenceAssetId.trim()) throw new Error('referenceAssetId is required for reference frame sampling.');

  const sampleCount = params.sampleCount ?? REQUIRED_GATE_FRAME_COUNT;
  const maxDownloadBytes = params.maxDownloadBytes ?? DEFAULT_MAX_REFERENCE_DOWNLOAD_BYTES;
  if (!Number.isSafeInteger(maxDownloadBytes) || maxDownloadBytes < 1) {
    throw new Error('maxDownloadBytes must be a positive safe integer.');
  }
  const uploadFile = deps.uploadFile ?? uploadMediaFromFile;
  const registerFile = deps.registerFile ?? registerReferenceMaterializedMediaFileV1;
  const extract = deps.extractFrame ?? extractFrame;
  const schedule = buildGateFrameSchedule(params.durationSec ?? 120, sampleCount);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-reference-frames-'));

  try {
    const inputPath = await resolveInputPath({
      videoUrl: params.videoUrl,
      tempDir,
      maxDownloadBytes,
      fetchImpl: params.fetchImpl ?? fetch,
      abortSignal: params.abortSignal,
    });
    const samples: ReferenceVideoFrameSample[] = [];
    for (const [index, timestampSec] of schedule.entries()) {
      if (params.abortSignal?.aborted) throw new Error('Reference frame sampling was cancelled.');
      const outputPath = path.join(tempDir, `frame-${index}.jpg`);
      await extract({ inputPath, outputPath, timestampSec });
      const frameIdentity = await measureStableReferenceMediaFileV1(outputPath, {});
      const logicalAssetId = buildReferenceFrameAssetId({
        referenceAssetId: params.referenceAssetId,
        index,
        timestampSec,
      });
      const assetId = buildReferenceFrameVersionAssetId(
        logicalAssetId,
        frameIdentity.bytesSha256,
      );
      const uploaded = await uploadFile(
        outputPath,
        params.userId,
        `${assetId}.jpg`,
        'image/jpeg',
        { customAssetId: assetId },
      );
      assertReferenceFrameUpload(uploaded, assetId, frameIdentity.byteLength);
      const frameId = `frame_${String(index).padStart(6, '0')}`;
      const timestampUs = String(Math.round(timestampSec * 1_000_000));
      // Registration is part of materialization, not best-effort metadata. A
      // frame must never be returned to canonical issuance as an orphaned URL.
      const registration = await registerFile({
        filePath: outputPath,
        upload: uploaded,
        actorUserId: params.userId,
        mediaOwner: params.orgId
          ? { type: 'ORG', orgId: params.orgId }
          : { type: 'USER', userId: params.userId },
        mediaKind: 'image',
        filename: `${assetId}.jpg`,
        role: {
          kind: 'DERIVED_FRAME',
          sourceAssetId: params.referenceAssetId,
          frameId,
          timestampUs,
        },
      });
      assertReferenceFrameRegistration({
        registration,
        uploaded,
        assetId,
        frameIdentity,
        referenceAssetId: params.referenceAssetId,
        frameId,
        timestampUs,
        userId: params.userId,
        orgId: params.orgId,
      });

      samples.push({
        index,
        timestampSec,
        timestampUs,
        frameId,
        assetId: uploaded.assetId,
        url: uploaded.signedUrl,
        mimeType: 'image/jpeg',
        byteLength: registration.byteLength,
        bytesSha256: registration.bytesSha256,
        storage: registration.storage,
        registrationReceiptSha256: registration.receiptSha256,
      });
    }
    return samples;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function buildReferenceFrameVersionAssetId(
  logicalAssetId: string,
  frameBytesSha256: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(frameBytesSha256)) {
    throw new Error('Reference frame byte hash must be a lowercase SHA-256.');
  }
  return `${logicalAssetId}_${frameBytesSha256.slice(0, 16)}`;
}

function assertReferenceFrameUpload(
  upload: Readonly<UploadResult>,
  assetId: string,
  byteLength: number,
): void {
  if (upload.assetId !== assetId || upload.size !== byteLength
    || upload.contentType !== 'image/jpeg' || !upload.signedUrl.trim()
    || (!upload.r2Key && !upload.gcsPath)) {
    throw new Error('Reference frame upload receipt does not match the extracted file.');
  }
}

function assertReferenceFrameRegistration(args: Readonly<{
  registration: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
  uploaded: Readonly<UploadResult>;
  assetId: string;
  frameIdentity: Readonly<{ byteLength: number; bytesSha256: string }>;
  referenceAssetId: string;
  frameId: string;
  timestampUs: string;
  userId: string;
  orgId?: string;
}>): void {
  const { registration } = args;
  const storage = args.uploaded.r2Key
    ? { backend: 'R2' as const, key: args.uploaded.r2Key }
    : { backend: 'GCS' as const, key: args.uploaded.gcsPath! };
  const mediaOwner = args.orgId
    ? { type: 'ORG' as const, orgId: args.orgId }
    : { type: 'USER' as const, userId: args.userId };
  const provenance = {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    role: 'DERIVED_FRAME' as const,
    sourceAssetId: args.referenceAssetId,
    frameId: args.frameId,
    timestampUs: args.timestampUs,
  };
  const material = {
    version: REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
    assetId: args.assetId,
    mediaOwner,
    contentType: 'image/jpeg',
    byteLength: args.frameIdentity.byteLength,
    bytesSha256: args.frameIdentity.bytesSha256,
    storage,
    provenance,
  };
  if (registration.version !== REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1
    || registration.assetId !== material.assetId
    || registration.contentType !== material.contentType
    || registration.byteLength !== material.byteLength
    || registration.bytesSha256 !== material.bytesSha256
    || hashEditronCanonicalJsonV1(registration.mediaOwner) !== hashEditronCanonicalJsonV1(mediaOwner)
    || hashEditronCanonicalJsonV1(registration.storage) !== hashEditronCanonicalJsonV1(storage)
    || hashEditronCanonicalJsonV1(registration.provenance) !== hashEditronCanonicalJsonV1(provenance)
    || registration.receiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('Reference frame registration receipt does not match the extracted file.');
  }
}


async function resolveInputPath(args: {
  videoUrl: string;
  tempDir: string;
  maxDownloadBytes: number;
  fetchImpl: typeof fetch;
  abortSignal?: AbortSignal;
}): Promise<string> {
  if (!/^https?:\/\//i.test(args.videoUrl)) return args.videoUrl;

  const response = await args.fetchImpl(args.videoUrl, { signal: args.abortSignal });
  if (!response.ok) {
    throw new Error(`Failed to download reference video for frame sampling: HTTP ${response.status}.`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      throw new Error(`Reference video returned an invalid content-length (${contentLength}).`);
    }
    if (declaredBytes > args.maxDownloadBytes) {
      throw new Error(`Reference video is too large for frame sampling (${contentLength} bytes).`);
    }
  }
  if (!response.body) {
    throw new Error('Reference video returned no response body for frame sampling.');
  }

  const inputPath = path.join(args.tempDir, 'reference-video.mp4');
  const output = await fs.open(inputPath, 'wx');
  const reader = response.body.getReader();
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      byteLength += value.byteLength;
      if (byteLength > args.maxDownloadBytes) {
        await reader.cancel('Reference frame-sampling byte limit exceeded.').catch(() => undefined);
        throw new Error(`Reference video is too large for frame sampling (${byteLength} bytes).`);
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await output.write(
          value,
          offset,
          value.byteLength - offset,
          null,
        );
        if (bytesWritten < 1) throw new Error('Reference video stream write made no progress.');
        offset += bytesWritten;
      }
    }
    if (byteLength < 1) throw new Error('Reference video response body is empty.');
  } finally {
    reader.releaseLock();
    await output.close();
  }
  return inputPath;
}

async function extractFrame(args: {
  inputPath: string;
  outputPath: string;
  timestampSec: number;
}): Promise<void> {
  const ffmpeg = getFFmpegPath();
  const ffArgs = [
    '-ss',
    args.timestampSec.toFixed(3),
    '-i',
    args.inputPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=1280:-2',
    '-q:v',
    '3',
    '-y',
    args.outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpeg, ffArgs);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg frame extraction failed (code ${code}): ${stderr}`));
    });
  });
}
