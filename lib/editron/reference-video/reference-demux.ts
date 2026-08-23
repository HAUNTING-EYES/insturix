/**
 * R1-A: Canonical reference demux.
 *
 * Materializes a reference video's streams ONCE into private scoped artifacts
 * that every downstream stage (R2 measured evidence, R3 soundtrack identity)
 * must consume via the canonical asset ID. No downstream stage re-fetches the
 * source URL.
 *
 * Contract (from docs/REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN_2026-07-27.md R1):
 *   - demux once (never on every analysis)
 *   - record source, owner, duration, hashes, retrieval receipt, audio usage mode
 *   - canonical asset ID mandatory for every downstream stage
 *
 * This service owns the demux + hash + upload step. It does NOT decide audio
 * usage mode (that is a user/product decision owned upstream) and does NOT own
 * the cut detector (R0/R2). It only guarantees that video and audio bytes exist
 * privately and are identified by the canonical reference asset id.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ReferenceAudioUsageMode,
  ReferenceCanonicalEnvelope,
} from '@/lib/editron/services/asset-resolver';
import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import type { UploadResult } from '@/lib/editron/services/upload-service';
import {
  REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1,
  registerReferenceMaterializedMediaFileV1,
  type ReferenceMaterializedMediaFileRegistrationInputV1,
  type ReferenceMaterializedMediaRegistrationReceiptV1,
} from './reference-materialized-media-registration-v1';

export const DEMUX_RECEIPT_VERSION = 'editron-r1-demux-receipt-v2' as const;
export const DEMUX_CORE_RECEIPT_VERSION = 'editron-r1-demux-core-receipt-v1' as const;
export const REFERENCE_ENVELOPE_VERSION = 'editron-r1-reference-envelope-v1' as const;
const DERIVED_STREAM_ASSET_ID_VERSION = 'editron-r1-derived-stream-asset-id-v1' as const;

/** AAC 192k — the same codec/bitrate the YouTube reference importer already uses. */
const DEMUX_AUDIO_BITRATE = '192k';

export interface DemuxInput {
  /** Canonical asset id that owns the demuxed artifacts. Downstream stages must use it. */
  referenceAssetId: string;
  /** Scoped owner of the artifact (user). */
  userId: string;
  /** Optional organization owner; the user remains the authenticated actor. */
  orgId?: string;
  /** Path to the local video bytes (fetched/uploaded earlier). */
  sourcePath: string;
  /** Provenance: where the source came from ('asset' | 'youtube-url' | 'instagram-url' | 'remote-url'). */
  sourceKind: 'asset' | 'youtube-url' | 'instagram-url' | 'remote-url';
  /** Human label for filename building. */
  sourceLabel?: string;
  /** Product-job cancellation; no universal media-duration timeout is invented here. */
  abortSignal?: AbortSignal;
}

export interface DemuxCoreReceiptV1 {
  version: typeof DEMUX_CORE_RECEIPT_VERSION;
  referenceAssetId: string;
  userId: string;
  source: {
    kind: DemuxInput['sourceKind'];
    sha256: string;
  };
  recipe: {
    videoCodec: 'copy';
    audioCodec: 'aac';
    audioBitrate: typeof DEMUX_AUDIO_BITRATE;
  };
  video: FileIdentity & { contentType: 'video/mp4' };
  audio: (FileIdentity & { contentType: 'audio/mp4' }) | null;
}

export interface DemuxReceipt {
  version: typeof DEMUX_RECEIPT_VERSION;
  referenceAssetId: string;
  userId: string;
  createdAt: string;
  durationMs: number | null;
  coreReceipt: Readonly<DemuxCoreReceiptV1>;
  coreReceiptSha256: string;
  video: {
    assetId: string;
    key: string;
    size: number;
    contentType: string;
    /** SHA-256 of the demuxed video bytes. */
    sha256: string;
    registrationReceiptSha256: string;
  };
  audio: {
    assetId: string;
    key: string;
    size: number;
    contentType: string;
    /** SHA-256 of the demuxed audio bytes. */
    sha256: string;
    /** Whether a real audio stream was present and extracted. */
    present: boolean;
    registrationReceiptSha256: string;
  } | null;
  source: {
    path: string;
    kind: DemuxInput['sourceKind'];
    label?: string;
    /** SHA-256 of the ORIGINAL source file (integrity + dedup key). */
    sourceSha256: string;
  };
  receiptSha256: string;
}

export interface ReferenceDemuxDeps {
  /** Run an ffmpeg process; returns child process. Injected for tests. */
  spawnProcess?: (args: string[]) => ReturnType<typeof spawn>;
  /** Stream a local artifact through the existing upload owner. Injected for tests. */
  uploadFile?: (
    filePath: string,
    fileName: string,
    contentType: string,
    userId: string,
    assetId: string,
  ) => Promise<UploadResult>;
  /** Persist through the existing mediaAssets create-or-compare owner. */
  registerFile?: (
    input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
  ) => Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>>;
  /** Resolve the duration of the source (ms). Injected for tests. */
  readDurationMs?: (sourcePath: string, abortSignal?: AbortSignal) => Promise<number | null>;
  /** Optional caller policy; absence means cancellation is owned by AbortSignal. */
  timeoutMs?: number;
}

export class ReferenceDemuxError extends Error {
  constructor(
    public readonly code:
      | 'no_video_stream'
      | 'ffmpeg_failed'
      | 'upload_failed'
      | 'registration_failed'
      | 'source_unreadable'
      | 'cancelled',
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'ReferenceDemuxError';
  }
}

function realSpawn(args: string[]): ReturnType<typeof spawn> {
  return spawn(args[0], args.slice(1));
}

/**
 * Demux the source video once: re-mux the video stream and extract the audio
 * stream, upload both as private scoped artifacts keyed by the canonical
 * reference asset id, and return a receipt with SHA-256 hashes for every byte.
 *
 * Deterministic + fail-loud. Throws ReferenceDemuxError on no video stream,
 * ffmpeg failure, or upload failure.
 */
export async function demuxReferenceVideo(
  input: DemuxInput,
  deps: ReferenceDemuxDeps = {},
): Promise<DemuxReceipt> {
  const { getFFmpegPath } = await import('@/lib/editron/services/media/ffmpeg-runtime');
  const ffmpegPath = getFFmpegPath();
  const rawUploadFile = deps.uploadFile;
  const uploadFile = (
    filePath: string,
    fileName: string,
    contentType: string,
    assetId: string,
  ): Promise<UploadResult> =>
    rawUploadFile
      ? rawUploadFile(filePath, fileName, contentType, input.userId, assetId)
      : realUploadFile(filePath, fileName, contentType, input.userId, assetId);
  const registerFile = deps.registerFile ?? registerReferenceMaterializedMediaFileV1;
  const readDurationMs = deps.readDurationMs ?? probeDurationMs;

  let sourceIdentity: Readonly<FileIdentity>;
  try {
    sourceIdentity = await measureStableFile(input.sourcePath);
  } catch (error) {
    throw new ReferenceDemuxError(
      'source_unreadable',
      `Cannot read source video at ${input.sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const durationMs = await readDurationMs(input.sourcePath, input.abortSignal);

  const tempDir = await mkdtemp(path.join(tmpdir(), 'editron-demux-'));
  try {
    const videoOut = path.join(tempDir, 'video.mp4');
    const audioOut = path.join(tempDir, 'audio.m4a');

    // Re-mux video stream only (avoids re-encoding; fast + lossless).
    // Audio: extract to AAC only if a track exists (-map 0:a? means "if present").
    const ffmpegArgs = [
      ffmpegPath,
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input.sourcePath,
      '-map',
      '0:v:0',
      '-c:v',
      'copy',
      '-an',
      '-y',
      videoOut,
      '-map',
      '0:a?',
      '-c:a',
      'aac',
      '-b:a',
      DEMUX_AUDIO_BITRATE,
      '-y',
      audioOut,
    ];

    await runFFmpeg(ffmpegArgs, deps, deps.timeoutMs, input.abortSignal);

    let videoIdentity: Readonly<FileIdentity>;
    try {
      videoIdentity = await measureStableFile(videoOut);
    } catch (error) {
      throw new ReferenceDemuxError(
        'no_video_stream',
        `No readable video stream was extracted from ${input.sourcePath}: ${
          error instanceof Error ? error.message : String(error)}`,
      );
    }

    const audioIdentity = await measureOptionalStableFile(audioOut);

    const coreReceipt = deepFreezeEditronJsonV1({
      version: DEMUX_CORE_RECEIPT_VERSION,
      referenceAssetId: input.referenceAssetId,
      userId: input.userId,
      source: { kind: input.sourceKind, sha256: sourceIdentity.sha256 },
      recipe: {
        videoCodec: 'copy' as const,
        audioCodec: 'aac' as const,
        audioBitrate: DEMUX_AUDIO_BITRATE,
      },
      video: { ...videoIdentity, contentType: 'video/mp4' as const },
      audio: audioIdentity
        ? { ...audioIdentity, contentType: 'audio/mp4' as const }
        : null,
    }) as Readonly<DemuxCoreReceiptV1>;
    const coreReceiptSha256 = hashEditronCanonicalJsonV1(coreReceipt);

    const baseName = sanitizeAssetPart(input.sourceLabel ?? path.basename(input.sourcePath));
    const videoAssetId = buildReferenceDerivedStreamAssetIdV1({
      referenceAssetId: input.referenceAssetId,
      streamKind: 'VIDEO',
      bytesSha256: videoIdentity.sha256,
    });
    const videoUpload = await uploadArtifact(
      uploadFile,
      videoOut,
      `${input.referenceAssetId}-v-${baseName}.mp4`,
      'video/mp4',
      videoIdentity.size,
      videoAssetId,
    );
    const videoRegistration = await registerArtifact(
      registerFile,
      {
        filePath: videoOut,
        upload: videoUpload,
        actorUserId: input.userId,
        mediaOwner: input.orgId
          ? { type: 'ORG', orgId: input.orgId }
          : { type: 'USER', userId: input.userId },
        mediaKind: 'video',
        filename: `${input.referenceAssetId}-v-${baseName}.mp4`,
        role: {
          kind: 'DERIVED_STREAM', sourceAssetId: input.referenceAssetId,
          streamKind: 'VIDEO', demuxReceiptSha256: coreReceiptSha256,
        },
      },
      videoIdentity,
      'VIDEO',
      coreReceiptSha256,
    );
    const video = {
      assetId: videoUpload.assetId,
      key: storageKey(videoUpload),
      size: videoUpload.size,
      contentType: 'video/mp4',
      sha256: videoIdentity.sha256,
      registrationReceiptSha256: videoRegistration.receiptSha256,
    };

    let audio: DemuxReceipt['audio'] = null;
    if (audioIdentity) {
      const audioAssetId = buildReferenceDerivedStreamAssetIdV1({
        referenceAssetId: input.referenceAssetId,
        streamKind: 'AUDIO',
        bytesSha256: audioIdentity.sha256,
      });
      const audioUpload = await uploadArtifact(
        uploadFile,
        audioOut,
        `${input.referenceAssetId}-a-${baseName}.m4a`,
        'audio/mp4',
        audioIdentity.size,
        audioAssetId,
      );
      const audioRegistration = await registerArtifact(
        registerFile,
        {
          filePath: audioOut,
          upload: audioUpload,
          actorUserId: input.userId,
          mediaOwner: input.orgId
            ? { type: 'ORG', orgId: input.orgId }
            : { type: 'USER', userId: input.userId },
          mediaKind: 'audio',
          filename: `${input.referenceAssetId}-a-${baseName}.m4a`,
          role: {
            kind: 'DERIVED_STREAM', sourceAssetId: input.referenceAssetId,
            streamKind: 'AUDIO', demuxReceiptSha256: coreReceiptSha256,
          },
        },
        audioIdentity,
        'AUDIO',
        coreReceiptSha256,
      );
      audio = {
        assetId: audioUpload.assetId,
        key: storageKey(audioUpload),
        size: audioUpload.size,
        contentType: 'audio/mp4',
        sha256: audioIdentity.sha256,
        present: true,
        registrationReceiptSha256: audioRegistration.receiptSha256,
      };
    }

    const receiptMaterial = {
      version: DEMUX_RECEIPT_VERSION,
      referenceAssetId: input.referenceAssetId,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      durationMs,
      coreReceipt,
      coreReceiptSha256,
      video,
      audio,
      source: {
        path: input.sourcePath,
        kind: input.sourceKind,
        label: input.sourceLabel,
        sourceSha256: sourceIdentity.sha256,
      },
    };
    return deepFreezeEditronJsonV1({
      ...receiptMaterial,
      receiptSha256: hashEditronCanonicalJsonV1(receiptMaterial),
    }) as Readonly<DemuxReceipt>;
  } catch (error) {
    if (error instanceof ReferenceDemuxError) throw error;
    throw new ReferenceDemuxError(
      'ffmpeg_failed',
      'Demux failed: ' + (error instanceof Error ? error.message : String(error)),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runFFmpeg(
  args: string[],
  deps: ReferenceDemuxDeps,
  timeoutMs: number | undefined,
  abortSignal: AbortSignal | undefined,
): Promise<number> {
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) {
    throw new ReferenceDemuxError('ffmpeg_failed', 'Invalid caller-supplied ffmpeg timeout.');
  }
  if (abortSignal?.aborted) {
    throw new ReferenceDemuxError('cancelled', 'Reference demux was cancelled before ffmpeg started.');
  }
  const spawnFns = deps.spawnProcess ?? realSpawn;
  return new Promise((resolveResult, rejectResult) => {
    const proc = spawnFns(args);
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      abortSignal?.removeEventListener('abort', onAbort);
    };
    const rejectOnce = (error: ReferenceDemuxError) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectResult(error);
    };
    const onAbort = () => {
      rejectOnce(new ReferenceDemuxError('cancelled', 'Reference demux was cancelled.'));
      proc.kill('SIGKILL');
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        rejectOnce(new ReferenceDemuxError(
          'ffmpeg_failed', `ffmpeg timed out after caller-supplied ${timeoutMs}ms.`,
        ));
        proc.kill('SIGKILL');
      }, timeoutMs);
    }

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', (error) => {
      rejectOnce(
        new ReferenceDemuxError('ffmpeg_failed', `ffmpeg process error: ${error.message}`, [stderr]),
      );
    });
    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (code === 0) {
        resolveResult(code);
      } else {
        rejectResult(
          new ReferenceDemuxError('ffmpeg_failed', `ffmpeg exited ${code}: ${stderr.slice(-400)}`, [stderr]),
        );
      }
    });
  });
}

async function probeDurationMs(
  sourcePath: string,
  abortSignal?: AbortSignal,
): Promise<number | null> {
  const { getFFmpegPath } = await import('@/lib/editron/services/media/ffmpeg-runtime');
  const ffmpegPath = getFFmpegPath();
  if (abortSignal?.aborted) {
    throw new ReferenceDemuxError('cancelled', 'Reference demux was cancelled before probing.');
  }
  return new Promise<number | null>((resolveDone, rejectDone) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', sourcePath]);
    let stderr = '';
    let settled = false;
    const cleanup = () => abortSignal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      proc.kill('SIGKILL');
      rejectDone(new ReferenceDemuxError('cancelled', 'Reference demux was cancelled.'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('exit', () => {
      if (settled) return;
      settled = true;
      cleanup();
      const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (!match) {
        resolveDone(null);
        return;
      }
      const [, h, m, s] = match;
      const ms = (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000;
      resolveDone(Number.isFinite(ms) ? Math.round(ms) : null);
    });
    proc.on('error', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveDone(null);
    });
  });
}

async function realUploadFile(
  filePath: string,
  fileName: string,
  contentType: string,
  userId: string,
  assetId: string,
): Promise<UploadResult> {
  const { uploadMediaFromFile } = await import('@/lib/editron/services/upload-service');
  return uploadMediaFromFile(filePath, userId, fileName, contentType, { customAssetId: assetId });
}

interface FileIdentity {
  size: number;
  sha256: string;
}

async function measureStableFile(filePath: string): Promise<Readonly<FileIdentity>> {
  const before = await stat(filePath);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < 1
    || !Number.isFinite(before.mtimeMs)) {
    throw new Error('file is absent, empty, or not a stable regular file');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const after = await stat(filePath);
  if (!after.isFile() || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    throw new Error('file changed while it was being hashed');
  }
  return { size: before.size, sha256: hash.digest('hex') };
}

async function measureOptionalStableFile(
  filePath: string,
): Promise<Readonly<FileIdentity> | null> {
  try {
    const candidate = await stat(filePath);
    if (!candidate.isFile() || candidate.size < 1) return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return measureStableFile(filePath);
}

async function uploadArtifact(
  uploadFile: (
    filePath: string, fileName: string, contentType: string, assetId: string,
  ) => Promise<UploadResult>,
  filePath: string,
  fileName: string,
  contentType: string,
  expectedSize: number,
  expectedAssetId: string,
): Promise<Readonly<UploadResult>> {
  let result: UploadResult;
  try {
    result = await uploadFile(filePath, fileName, contentType, expectedAssetId);
  } catch (error) {
    throw error instanceof ReferenceDemuxError
      ? error
      : new ReferenceDemuxError(
        'upload_failed',
        `Failed to upload ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
  }
  if (result.assetId !== expectedAssetId || result.size !== expectedSize
    || result.contentType !== contentType || !storageKey(result)) {
    throw new ReferenceDemuxError(
      'upload_failed',
      `Upload receipt mismatch for ${fileName}: expected ${expectedSize} bytes.`,
    );
  }
  return result;
}

async function registerArtifact(
  registerFile: (
    input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
  ) => Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>>,
  input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
  identity: Readonly<FileIdentity>,
  streamKind: 'VIDEO' | 'AUDIO',
  coreReceiptSha256: string,
): Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>> {
  let receipt: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
  try {
    receipt = await registerFile(input);
  } catch (error) {
    throw new ReferenceDemuxError(
      'registration_failed',
      `Failed to register ${streamKind} demux artifact: ${
        error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (input.role.kind !== 'DERIVED_STREAM') {
    throw new ReferenceDemuxError(
      'registration_failed', `Registration input role mismatch for ${streamKind}.`,
    );
  }
  const material = {
    version: receipt.version,
    assetId: receipt.assetId,
    mediaOwner: receipt.mediaOwner,
    contentType: receipt.contentType,
    byteLength: receipt.byteLength,
    bytesSha256: receipt.bytesSha256,
    storage: receipt.storage,
    provenance: receipt.provenance,
  };
  const expectedStorage = input.upload.r2Key
    ? { backend: 'R2' as const, key: input.upload.r2Key }
    : { backend: 'GCS' as const, key: input.upload.gcsPath };
  if (receipt.version !== REFERENCE_MATERIALIZED_MEDIA_REGISTRATION_VERSION_V1
    || receipt.assetId !== input.upload.assetId || receipt.byteLength !== identity.size
    || receipt.bytesSha256 !== identity.sha256 || receipt.contentType !== input.upload.contentType
    || hashEditronCanonicalJsonV1(receipt.mediaOwner)
      !== hashEditronCanonicalJsonV1(input.mediaOwner)
    || receipt.storage.backend !== expectedStorage.backend
    || receipt.storage.key !== expectedStorage.key
    || receipt.provenance.role !== 'DERIVED_STREAM'
    || receipt.provenance.sourceAssetId !== input.role.sourceAssetId
    || receipt.provenance.streamKind !== streamKind
    || receipt.provenance.demuxReceiptSha256 !== coreReceiptSha256
    || receipt.receiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new ReferenceDemuxError(
      'registration_failed', `Registration receipt mismatch for ${streamKind} demux artifact.`,
    );
  }
  return receipt;
}

function storageKey(upload: Readonly<UploadResult>): string {
  const key = upload.r2Key ?? upload.gcsPath;
  if (!key?.trim()) throw new ReferenceDemuxError('upload_failed', 'Upload returned no storage key.');
  return key;
}

export function buildReferenceDerivedStreamAssetIdV1(input: Readonly<{
  referenceAssetId: string;
  streamKind: 'VIDEO' | 'AUDIO';
  bytesSha256: string;
}>): string {
  if (!input.referenceAssetId.trim() || !/^[a-f0-9]{64}$/.test(input.bytesSha256)) {
    throw new ReferenceDemuxError('registration_failed', 'Invalid derived-stream identity material.');
  }
  const digest = hashEditronCanonicalJsonV1({
    version: DERIVED_STREAM_ASSET_ID_VERSION,
    referenceAssetId: input.referenceAssetId,
    streamKind: input.streamKind,
    bytesSha256: input.bytesSha256,
  });
  return `ref_stream_${digest.slice(0, 24)}`;
}

function sanitizeAssetPart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Build the R1 canonical envelope for a MediaAsset from a DemuxReceipt.
 * The audio usage mode is a USER/PRODUCT decision (Constraint #7) and is the
 * caller's input — this function never invents it.
 */
export function buildReferenceCanonicalEnvelope(
  receipt: DemuxReceipt,
  audioUsageMode: ReferenceAudioUsageMode,
): ReferenceCanonicalEnvelope {
  return {
    version: REFERENCE_ENVELOPE_VERSION,
    contentHash: receipt.source.sourceSha256,
    audioUsageMode,
    demux: {
      version: receipt.version,
      demuxedAt: receipt.createdAt,
      durationMs: receipt.durationMs,
      videoSha256: receipt.video.sha256,
      audioSha256: receipt.audio?.sha256 ?? null,
      audioPresent: receipt.audio?.present ?? false,
    },
  };
}
