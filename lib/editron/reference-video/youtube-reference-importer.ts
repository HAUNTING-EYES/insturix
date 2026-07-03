import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import type { UploadOptions, UploadResult } from '@/lib/editron/services/upload-service';

export type YoutubeReferenceImportFailureReason =
  | 'youtube_reference_too_long'
  | 'youtube_reference_download_timeout'
  | 'youtube_reference_clip_timeout'
  | 'youtube_reference_ingestion_failed';

export interface ImportYoutubeReferenceVideoInput {
  userId: string;
  youtubeUrl: string;
  sourceFingerprint: string;
  maxDurationSec?: number;
  maxBytes?: number;
  downloadTimeoutMs?: number;
  clipTimeoutMs?: number;
}

export interface ImportedYoutubeReferenceVideo {
  asset: MediaAsset;
  videoUrl: string;
  durationSec?: number;
  sourceLabel: string;
  sourceFingerprint: string;
}

export interface YoutubeReferenceImporterDeps {
  findExistingAsset?: (assetId: string, userId: string) => Promise<MediaAsset | null>;
  getInfo?: (youtubeUrl: string) => Promise<YoutubeReferenceInfo>;
  downloadFromInfo?: (
    info: YoutubeReferenceInfo,
    format: YoutubeReferenceFormat,
  ) => Promise<NodeJS.ReadableStream> | NodeJS.ReadableStream;
  clipStreamToMp4Buffer?: (
    stream: NodeJS.ReadableStream,
    maxDurationSec: number,
    maxBytes: number,
    options: YoutubeReferenceClipOptions,
  ) => Promise<Buffer>;
  uploadMedia?: (
    file: Buffer,
    userId: string,
    filename: string,
    contentType: string,
    options?: UploadOptions,
  ) => Promise<UploadResult>;
  registerAsset?: (
    asset: MediaAsset,
    metadata: YoutubeReferenceImportMetadata,
  ) => Promise<MediaAsset>;
  now?: () => Date;
}

export interface YoutubeReferenceInfo {
  videoDetails?: {
    videoId?: string;
    title?: string;
    lengthSeconds?: string | number;
  };
  formats?: YoutubeReferenceFormat[];
}

export interface YoutubeReferenceFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  container?: string;
  hasVideo?: boolean;
  hasAudio?: boolean;
  height?: number;
  audioBitrate?: number;
  bitrate?: number;
  contentLength?: string;
}

export interface YoutubeReferenceClipOptions {
  timeoutMs: number;
}

export interface YoutubeReferenceImportMetadata {
  videoId: string;
  canonicalUrl: string;
  sourceFingerprint: string;
  importedAt: Date;
  originalDurationSec?: number;
  evaluationWindowSec: number;
}

const DEFAULT_MAX_DURATION_SEC = 120;
const DEFAULT_MAX_BYTES = 160 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000;
const DEFAULT_CLIP_TIMEOUT_MS = 180_000;
const NON_EXPIRING_URL_DATE = new Date('2099-12-31T00:00:00.000Z');

export class YoutubeReferenceImportError extends Error {
  constructor(
    public readonly reason: YoutubeReferenceImportFailureReason,
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'YoutubeReferenceImportError';
  }
}

export async function importYoutubeReferenceVideo(
  input: ImportYoutubeReferenceVideoInput,
  deps: YoutubeReferenceImporterDeps = {},
): Promise<ImportedYoutubeReferenceVideo> {
  const videoId = parseYouTubeVideoId(input.youtubeUrl);
  if (!videoId) {
    throw new YoutubeReferenceImportError(
      'youtube_reference_ingestion_failed',
      'YouTube reference URL must include a valid video id.',
    );
  }

  const canonicalUrl = buildCanonicalYoutubeReferenceUrl(videoId);
  const assetId = buildYoutubeReferenceAssetId(input.userId, videoId);
  const sourceFingerprint = input.sourceFingerprint || buildYoutubeReferenceFingerprint(videoId);
  const existingAsset = await (deps.findExistingAsset ?? findExistingYoutubeReferenceAsset)(assetId, input.userId);
  if (existingAsset?.cachedUrl && existingAsset.type === 'video') {
    return {
      asset: existingAsset,
      videoUrl: existingAsset.cachedUrl,
      durationSec: existingAsset.duration,
      sourceLabel: existingAsset.filename || `YouTube reference ${videoId}`,
      sourceFingerprint: `${sourceFingerprint}|asset:${existingAsset.assetId}`,
    };
  }

  const info = await (deps.getInfo ?? getYoutubeInfo)(canonicalUrl);
  const durationSec = parseDurationSeconds(info.videoDetails?.lengthSeconds);
  const maxDurationSec = input.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const evaluationWindowSec = getEvaluationWindowSeconds(durationSec, maxDurationSec);
  const shouldClipToEvaluationWindow = Boolean(durationSec && durationSec > maxDurationSec);

  const format = selectYoutubeReferenceFormat(info.formats ?? []);
  if (!format) {
    throw new YoutubeReferenceImportError(
      'youtube_reference_ingestion_failed',
      'No downloadable MP4 format with audio and video was found for this YouTube reference.',
    );
  }

  const stream = await (deps.downloadFromInfo ?? downloadYoutubeFormat)(info, format);
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const downloadTimeoutMs = resolveTimeoutMs(input.downloadTimeoutMs, DEFAULT_DOWNLOAD_TIMEOUT_MS);
  const clipTimeoutMs = resolveTimeoutMs(input.clipTimeoutMs, DEFAULT_CLIP_TIMEOUT_MS);
  const buffer = shouldClipToEvaluationWindow
    ? await withYoutubeReferenceTimeout(
      (deps.clipStreamToMp4Buffer ?? clipYoutubeReferenceStream)(
        stream,
        maxDurationSec,
        maxBytes,
        { timeoutMs: clipTimeoutMs },
      ),
      clipTimeoutMs,
      'youtube_reference_clip_timeout',
      `YouTube reference clipping exceeded ${Math.round(clipTimeoutMs / 1000)}s.`,
      () => destroyStream(stream),
    )
    : await readStreamWithByteLimit(stream, maxBytes, { timeoutMs: downloadTimeoutMs });
  if (buffer.length === 0) {
    throw new YoutubeReferenceImportError(
      'youtube_reference_ingestion_failed',
      'YouTube reference download or clip returned an empty video file.',
    );
  }

  const title = info.videoDetails?.title?.trim() || `YouTube reference ${videoId}`;
  const windowSuffix = shouldClipToEvaluationWindow ? `-first-${maxDurationSec}s` : '';
  const filename = `${sanitizeFilename(title).slice(0, 80) || 'youtube-reference'}-${videoId}${windowSuffix}.mp4`;
  const upload = await (deps.uploadMedia ?? uploadReferenceMedia)(
    buffer,
    input.userId,
    filename,
    'video/mp4',
    { customAssetId: assetId },
  );
  const importedAt = deps.now?.() ?? new Date();
  const asset: MediaAsset = {
    assetId: upload.assetId,
    userId: input.userId,
    type: 'video',
    filename,
    source: 'user-upload',
    gcsPath: upload.gcsPath,
    cachedUrl: upload.signedUrl,
    urlExpiresAt: upload.urlExpiresAt ?? NON_EXPIRING_URL_DATE,
    size: upload.size,
    duration: evaluationWindowSec,
    uploadedAt: importedAt,
    ...(upload.r2Key && { r2Key: upload.r2Key }),
  };

  const metadata: YoutubeReferenceImportMetadata = {
    videoId,
    canonicalUrl,
    sourceFingerprint,
    importedAt,
    originalDurationSec: durationSec,
    evaluationWindowSec,
  };
  const registeredAsset = await (deps.registerAsset ?? registerYoutubeReferenceAsset)(asset, metadata);

  return {
    asset: registeredAsset,
    videoUrl: registeredAsset.cachedUrl || upload.signedUrl,
    durationSec: registeredAsset.duration ?? evaluationWindowSec,
    sourceLabel: title,
    sourceFingerprint: `${sourceFingerprint}|asset:${registeredAsset.assetId}`,
  };
}

export function parseYouTubeVideoId(rawUrl: string | URL): string | null {
  let url: URL;
  try {
    url = typeof rawUrl === 'string' ? new URL(rawUrl.trim()) : rawUrl;
  } catch (_error) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    return sanitizeVideoId(parts[0]);
  }
  if (url.searchParams.has('v')) {
    return sanitizeVideoId(url.searchParams.get('v'));
  }
  if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) {
    return sanitizeVideoId(parts[1]);
  }
  return null;
}

export function buildCanonicalYoutubeReferenceUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function buildYoutubeReferenceFingerprint(videoId: string): string {
  return `youtube|${videoId}`;
}

export function buildYoutubeReferenceAssetId(userId: string, videoId: string): string {
  return `ref_yt_${shortHash(`${userId}|${videoId}`)}`;
}

export function selectYoutubeReferenceFormat(
  formats: readonly YoutubeReferenceFormat[],
): YoutubeReferenceFormat | null {
  const candidates = formats.filter((format) => {
    const mime = format.mimeType?.toLowerCase() ?? '';
    const isMp4 = format.container === 'mp4' || mime.includes('video/mp4');
    const hasVideo = format.hasVideo === true || typeof format.height === 'number' || mime.startsWith('video/');
    const hasAudio = format.hasAudio === true || typeof format.audioBitrate === 'number';
    return Boolean(format.url || format.itag) && isMp4 && hasVideo && hasAudio;
  });

  candidates.sort((a, b) => scoreYoutubeFormat(b) - scoreYoutubeFormat(a));
  return candidates[0] ?? null;
}

async function findExistingYoutubeReferenceAsset(assetId: string, userId: string): Promise<MediaAsset | null> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .findOne({ assetId, userId }) as Promise<MediaAsset | null>;
}

async function getYoutubeInfo(youtubeUrl: string): Promise<YoutubeReferenceInfo> {
  process.env.YTDL_NO_UPDATE = process.env.YTDL_NO_UPDATE || '1';
  const ytdl = await import('@distube/ytdl-core');
  const client = (ytdl.default ?? ytdl) as {
    getInfo: (url: string, options?: Record<string, unknown>) => Promise<YoutubeReferenceInfo>;
  };
  return client.getInfo(youtubeUrl, {
    playerClients: ['WEB_EMBEDDED', 'IOS', 'ANDROID', 'TV'],
  });
}

async function downloadYoutubeFormat(
  info: YoutubeReferenceInfo,
  format: YoutubeReferenceFormat,
): Promise<NodeJS.ReadableStream> {
  process.env.YTDL_NO_UPDATE = process.env.YTDL_NO_UPDATE || '1';
  const ytdl = await import('@distube/ytdl-core');
  const client = (ytdl.default ?? ytdl) as unknown as {
    downloadFromInfo: (
      info: YoutubeReferenceInfo,
      options?: Record<string, unknown>,
    ) => NodeJS.ReadableStream;
  };
  return client.downloadFromInfo(info, {
    format,
    highWaterMark: 1 << 25,
    dlChunkSize: 0,
  });
}

async function clipYoutubeReferenceStream(
  stream: NodeJS.ReadableStream,
  maxDurationSec: number,
  maxBytes: number,
  options: YoutubeReferenceClipOptions,
): Promise<Buffer> {
  const { getFFmpegPath } = await import('@/lib/editron/services/media/analysis-service');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-youtube-reference-'));
  const outputPath = path.join(tempDir, 'reference-window.mp4');

  try {
    const ffmpeg = getFFmpegPath();
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-t',
        String(maxDurationSec),
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]);
      let stderr = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      const destroyInput = () => {
        destroyStream(stream);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        destroyInput();
        ff.kill('SIGKILL');
        reject(error);
      };
      timeout = setTimeout(() => {
        fail(new YoutubeReferenceImportError(
          'youtube_reference_clip_timeout',
          `YouTube reference clipping exceeded ${Math.round(options.timeoutMs / 1000)}s.`,
        ));
      }, options.timeoutMs);

      ff.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      ff.on('error', fail);
      stream.on('error', (error: Error) => fail(error));
      ff.stdin.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPIPE') fail(error);
      });
      ff.on('exit', (code) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        destroyInput();
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg YouTube reference clipping failed (code ${code}): ${stderr}`));
      });

      stream.pipe(ff.stdin);
    });

    const buffer = await fs.readFile(outputPath);
    if (buffer.byteLength > maxBytes) {
      throw new YoutubeReferenceImportError(
        'youtube_reference_ingestion_failed',
        `Clipped YouTube reference exceeded ${Math.round(maxBytes / 1024 / 1024)}MB.`,
      );
    }
    return buffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uploadReferenceMedia(
  file: Buffer,
  userId: string,
  filename: string,
  contentType: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  return uploadMedia(file, userId, filename, contentType, options);
}

async function registerYoutubeReferenceAsset(
  asset: MediaAsset,
  metadata: YoutubeReferenceImportMetadata,
): Promise<MediaAsset> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const document = {
    ...asset,
    contentType: 'video/mp4',
    referenceSource: {
      provider: 'youtube',
      videoId: metadata.videoId,
      canonicalUrl: metadata.canonicalUrl,
      sourceFingerprint: metadata.sourceFingerprint,
      importedAt: metadata.importedAt,
      originalDurationSec: metadata.originalDurationSec,
      evaluationWindowSec: metadata.evaluationWindowSec,
      lastUsedAt: metadata.importedAt,
    },
  };

  await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
    { assetId: asset.assetId, userId: asset.userId },
    {
      $setOnInsert: document,
      $set: {
        'referenceSource.lastUsedAt': metadata.importedAt,
      },
    },
    { upsert: true },
  );

  const registered = await db
    .collection(COLLECTIONS.MEDIA_ASSETS)
    .findOne({ assetId: asset.assetId, userId: asset.userId }) as MediaAsset | null;
  return registered ?? asset;
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function getEvaluationWindowSeconds(durationSec: number | undefined, maxDurationSec: number): number {
  if (!Number.isFinite(durationSec) || !durationSec || durationSec <= 0) return maxDurationSec;
  return Math.min(Math.ceil(durationSec), maxDurationSec);
}

function scoreYoutubeFormat(format: YoutubeReferenceFormat): number {
  const height = format.height ?? 0;
  const heightScore = height <= 720 ? height + 10_000 : 10_000 - (height - 720);
  const audioScore = Math.min(format.audioBitrate ?? 0, 192);
  const bitratePenalty = Math.max(0, (format.bitrate ?? 0) / 1_000_000);
  return heightScore + audioScore - bitratePenalty;
}

function sanitizeVideoId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{6,32}$/.test(trimmed) ? trimmed : null;
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readStreamWithByteLimit(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
  options: { timeoutMs: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      destroyStream(stream);
      reject(error);
    };
    timeout = setTimeout(() => {
      fail(new YoutubeReferenceImportError(
        'youtube_reference_download_timeout',
        `YouTube reference download exceeded ${Math.round(options.timeoutMs / 1000)}s.`,
      ));
    }, options.timeoutMs);

    stream.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        fail(new YoutubeReferenceImportError(
          'youtube_reference_ingestion_failed',
          `YouTube reference download exceeded ${Math.round(maxBytes / 1024 / 1024)}MB.`,
        ));
        return;
      }
      chunks.push(buffer);
    });

    stream.once('error', (error: Error) => fail(error));
    stream.once('end', () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(Buffer.concat(chunks, total));
    });
  });
}


function withYoutubeReferenceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  reason: YoutubeReferenceImportFailureReason,
  message: string,
  onTimeout?: (error: YoutubeReferenceImportError) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new YoutubeReferenceImportError(reason, message);
      onTimeout?.(error);
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function resolveTimeoutMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function destroyStream(stream: NodeJS.ReadableStream, error?: Error): void {
  const destroy = (stream as { destroy?: (error?: Error) => void }).destroy;
  destroy?.call(stream, error);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
