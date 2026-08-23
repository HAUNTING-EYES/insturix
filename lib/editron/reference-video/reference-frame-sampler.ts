import { spawn } from 'child_process';
import { createHash } from 'node:crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { getFFmpegPath } from '@/lib/editron/services/media/analysis-service';
import { uploadMedia } from '@/lib/editron/services/upload-service';

import { buildReferenceFrameAssetId } from './reference-frame-asset-id';
import {
  registerReferenceMaterializedMediaAssetV1,
  type ReferenceMaterializedMediaRegistrationInputV1,
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
}

export interface ReferenceVideoFrameSamplerDeps {
  upload?: typeof uploadMedia;
  register?: (
    input: Readonly<ReferenceMaterializedMediaRegistrationInputV1>,
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
  const upload = deps.upload ?? uploadMedia;
  const register = deps.register ?? registerReferenceMaterializedMediaAssetV1;
  const extract = deps.extractFrame ?? extractFrame;
  const schedule = buildGateFrameSchedule(params.durationSec ?? 120, sampleCount);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-reference-frames-'));
  const inputPath = await resolveInputPath({
    videoUrl: params.videoUrl,
    tempDir,
    maxDownloadBytes: params.maxDownloadBytes ?? DEFAULT_MAX_REFERENCE_DOWNLOAD_BYTES,
    fetchImpl: params.fetchImpl ?? fetch,
  });

  try {
    const samples: ReferenceVideoFrameSample[] = [];
    for (const [index, timestampSec] of schedule.entries()) {
      const outputPath = path.join(tempDir, `frame-${index}.jpg`);
      await extract({ inputPath, outputPath, timestampSec });
      const frameBuffer = await fs.readFile(outputPath);
      const logicalAssetId = buildReferenceFrameAssetId({
        referenceAssetId: params.referenceAssetId,
        index,
        timestampSec,
      });
      const frameBytesSha256 = createHash('sha256').update(frameBuffer).digest('hex');
      const assetId = buildReferenceFrameVersionAssetId(logicalAssetId, frameBytesSha256);
      const uploaded = await upload(
        frameBuffer,
        params.userId,
        `${assetId}.jpg`,
        'image/jpeg',
        { customAssetId: assetId },
      );
      const frameId = `frame_${String(index).padStart(6, '0')}`;
      const timestampUs = String(Math.round(timestampSec * 1_000_000));
      // Registration is part of materialization, not best-effort metadata. A
      // frame must never be returned to canonical issuance as an orphaned URL.
      const registration = await register({
        bytes: frameBuffer,
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


async function resolveInputPath(args: {
  videoUrl: string;
  tempDir: string;
  maxDownloadBytes: number;
  fetchImpl: typeof fetch;
}): Promise<string> {
  if (!/^https?:\/\//i.test(args.videoUrl)) return args.videoUrl;

  const response = await args.fetchImpl(args.videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download reference video for frame sampling: HTTP ${response.status}.`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > args.maxDownloadBytes) {
    throw new Error(`Reference video is too large for frame sampling (${contentLength} bytes).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > args.maxDownloadBytes) {
    throw new Error(`Reference video is too large for frame sampling (${buffer.byteLength} bytes).`);
  }

  const inputPath = path.join(args.tempDir, 'reference-video.mp4');
  await fs.writeFile(inputPath, buffer);
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
