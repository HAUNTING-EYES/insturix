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

export const DEMUX_RECEIPT_VERSION = 'editron-r1-demux-receipt-v1' as const;
export const REFERENCE_ENVELOPE_VERSION = 'editron-r1-reference-envelope-v1' as const;

/** AAC 192k — the same codec/bitrate the YouTube reference importer already uses. */
const DEMUX_AUDIO_BITRATE = '192k';

export interface DemuxInput {
  /** Canonical asset id that owns the demuxed artifacts. Downstream stages must use it. */
  referenceAssetId: string;
  /** Scoped owner of the artifact (user). */
  userId: string;
  /** Path to the local video bytes (fetched/uploaded earlier). */
  sourcePath: string;
  /** Provenance: where the source came from ('asset' | 'youtube-url' | 'instagram-url' | 'remote-url'). */
  sourceKind: 'asset' | 'youtube-url' | 'instagram-url' | 'remote-url';
  /** Human label for filename building. */
  sourceLabel?: string;
  /** Product-job cancellation; no universal media-duration timeout is invented here. */
  abortSignal?: AbortSignal;
}

export interface DemuxUploadResult {
  /** Private storage key for the artifact (R2 key or GCS path). */
  storageKey: string;
  /** Size in bytes of the uploaded artifact. */
  size: number;
}

export interface DemuxReceipt {
  version: typeof DEMUX_RECEIPT_VERSION;
  referenceAssetId: string;
  userId: string;
  createdAt: string;
  durationMs: number | null;
  video: {
    key: string;
    size: number;
    contentType: string;
    /** SHA-256 of the demuxed video bytes. */
    sha256: string;
  };
  audio: {
    key: string;
    size: number;
    contentType: string;
    /** SHA-256 of the demuxed audio bytes. */
    sha256: string;
    /** Whether a real audio stream was present and extracted. */
    present: boolean;
  } | null;
  source: {
    path: string;
    kind: DemuxInput['sourceKind'];
    label?: string;
    /** SHA-256 of the ORIGINAL source file (integrity + dedup key). */
    sourceSha256: string;
  };
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
  ) => Promise<DemuxUploadResult>;
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
  ): Promise<DemuxUploadResult> =>
    rawUploadFile
      ? rawUploadFile(filePath, fileName, contentType, input.userId)
      : realUploadFile(filePath, fileName, contentType, input.userId);
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

    const baseName = sanitizeAssetPart(input.sourceLabel ?? path.basename(input.sourcePath));
    const videoUpload = await uploadArtifact(
      uploadFile,
      videoOut,
      `${input.referenceAssetId}-v-${baseName}.mp4`,
      'video/mp4',
      videoIdentity.size,
    );
    const video = {
      key: videoUpload.storageKey,
      size: videoUpload.size,
      contentType: 'video/mp4',
      sha256: videoIdentity.sha256,
    };

    let audio: DemuxReceipt['audio'] = null;
    if (audioIdentity) {
      const audioUpload = await uploadArtifact(
        uploadFile,
        audioOut,
        `${input.referenceAssetId}-a-${baseName}.m4a`,
        'audio/mp4',
        audioIdentity.size,
      );
      audio = {
        key: audioUpload.storageKey,
        size: audioUpload.size,
        contentType: 'audio/mp4',
        sha256: audioIdentity.sha256,
        present: true,
      };
    }

    const receipt: DemuxReceipt = {
      version: DEMUX_RECEIPT_VERSION,
      referenceAssetId: input.referenceAssetId,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      durationMs,
      video,
      audio,
      source: {
        path: input.sourcePath,
        kind: input.sourceKind,
        label: input.sourceLabel,
        sourceSha256: sourceIdentity.sha256,
      },
    };
    return receipt;
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
): Promise<DemuxUploadResult> {
  const { uploadMediaFromFile } = await import('@/lib/editron/services/upload-service');
  const result = await uploadMediaFromFile(filePath, userId, fileName, contentType, {});
  const storageKey = result.r2Key ?? result.gcsPath ?? result.assetId;
  if (!storageKey) {
    throw new ReferenceDemuxError('upload_failed', 'Upload returned no storage key.');
  }
  return { storageKey, size: result.size };
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
  uploadFile: (filePath: string, fileName: string, contentType: string) => Promise<DemuxUploadResult>,
  filePath: string,
  fileName: string,
  contentType: string,
  expectedSize: number,
): Promise<Readonly<DemuxUploadResult>> {
  let result: DemuxUploadResult;
  try {
    result = await uploadFile(filePath, fileName, contentType);
  } catch (error) {
    throw error instanceof ReferenceDemuxError
      ? error
      : new ReferenceDemuxError(
        'upload_failed',
        `Failed to upload ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
  }
  if (!result.storageKey?.trim() || result.size !== expectedSize) {
    throw new ReferenceDemuxError(
      'upload_failed',
      `Upload receipt mismatch for ${fileName}: expected ${expectedSize} bytes.`,
    );
  }
  return result;
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
