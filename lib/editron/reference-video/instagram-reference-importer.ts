import { createHash } from 'node:crypto';

import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import type { UploadOptions, UploadResult } from '@/lib/editron/services/upload-service';
import {
  assertPublicReferenceDnsResolution,
  isUnsafeReferenceHostname,
  type ReferenceVideoDnsLookup,
} from './reference-video-network-safety';

export type InstagramReferenceImportFailureReason =
  | 'instagram_reference_configuration_missing'
  | 'instagram_reference_not_found'
  | 'instagram_reference_download_timeout'
  | 'instagram_reference_ingestion_failed';

export interface ImportInstagramReferenceVideoInput {
  userId: string;
  instagramUrl: string;
  sourceFingerprint: string;
  maxBytes?: number;
  actorTimeoutMs?: number;
  downloadTimeoutMs?: number;
}

export interface ImportedInstagramReferenceVideo {
  asset: MediaAsset;
  videoUrl: string;
  durationSec?: number;
  sourceLabel: string;
  sourceFingerprint: string;
}

interface InstagramActorResult {
  videoUrl: string;
  sourceLabel: string;
  durationSec?: number;
  providerRunId?: string;
}

interface InstagramReferenceImporterDeps {
  findExistingAsset?: (assetId: string, userId: string) => Promise<MediaAsset | null>;
  resolveActor?: (canonicalUrl: string, shortcode: string, timeoutMs: number) => Promise<InstagramActorResult>;
  downloadVideo?: (
    url: string,
    maxBytes: number,
    timeoutMs: number,
    dnsLookup?: ReferenceVideoDnsLookup,
  ) => Promise<Buffer>;
  uploadMedia?: (
    file: Buffer,
    userId: string,
    filename: string,
    contentType: string,
    options?: UploadOptions,
  ) => Promise<UploadResult>;
  registerAsset?: (asset: MediaAsset, metadata: InstagramReferenceMetadata) => Promise<MediaAsset>;
  dnsLookup?: ReferenceVideoDnsLookup;
  now?: () => Date;
}

interface InstagramReferenceMetadata {
  shortcode: string;
  canonicalUrl: string;
  sourceFingerprint: string;
  providerRunId?: string;
  importedAt: Date;
}

const DEFAULT_MAX_BYTES = 120 * 1024 * 1024;
const DEFAULT_ACTOR_TIMEOUT_MS = 120_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000;
const NON_EXPIRING_URL_DATE = new Date('2099-12-31T00:00:00.000Z');
const INSTAGRAM_CDN_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

export class InstagramReferenceImportError extends Error {
  constructor(
    public readonly reason: InstagramReferenceImportFailureReason,
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'InstagramReferenceImportError';
  }
}

export async function importInstagramReferenceVideo(
  input: ImportInstagramReferenceVideoInput,
  deps: InstagramReferenceImporterDeps = {},
): Promise<ImportedInstagramReferenceVideo> {
  const parsed = parseInstagramReferenceUrl(input.instagramUrl);
  if (!parsed) {
    throw new InstagramReferenceImportError(
      'instagram_reference_ingestion_failed',
      'Instagram reference must be a public reel, post, or TV URL with a shortcode.',
    );
  }

  const assetId = buildInstagramReferenceAssetId(input.userId, parsed.shortcode);
  const sourceFingerprint = input.sourceFingerprint || buildInstagramReferenceFingerprint(parsed.shortcode);
  const existing = await (deps.findExistingAsset ?? findExistingInstagramReferenceAsset)(assetId, input.userId);
  if (existing?.cachedUrl && existing.type === 'video') {
    return {
      asset: existing,
      videoUrl: existing.cachedUrl,
      durationSec: existing.duration,
      sourceLabel: existing.filename || `Instagram reference ${parsed.shortcode}`,
      sourceFingerprint: `${sourceFingerprint}|asset:${existing.assetId}`,
    };
  }

  const actorTimeoutMs = normalizeTimeout(input.actorTimeoutMs, DEFAULT_ACTOR_TIMEOUT_MS);
  const actorResult = await (deps.resolveActor ?? resolveInstagramActor)(
    parsed.canonicalUrl,
    parsed.shortcode,
    actorTimeoutMs,
  );
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const downloadTimeoutMs = normalizeTimeout(input.downloadTimeoutMs, DEFAULT_DOWNLOAD_TIMEOUT_MS);
  const buffer = await (deps.downloadVideo ?? downloadInstagramVideo)(
    actorResult.videoUrl,
    maxBytes,
    downloadTimeoutMs,
    deps.dnsLookup,
  );
  assertMp4(buffer);

  const filename = `instagram-reference-${parsed.shortcode}.mp4`;
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
    duration: actorResult.durationSec,
    uploadedAt: importedAt,
    ...(upload.r2Key && { r2Key: upload.r2Key }),
  };
  const registered = await (deps.registerAsset ?? registerInstagramReferenceAsset)(asset, {
    shortcode: parsed.shortcode,
    canonicalUrl: parsed.canonicalUrl,
    sourceFingerprint,
    providerRunId: actorResult.providerRunId,
    importedAt,
  });

  return {
    asset: registered,
    videoUrl: registered.cachedUrl || upload.signedUrl,
    durationSec: registered.duration ?? actorResult.durationSec,
    sourceLabel: actorResult.sourceLabel,
    sourceFingerprint: `${sourceFingerprint}|asset:${registered.assetId}`,
  };
}

export function parseInstagramReferenceUrl(rawUrl: string | URL): { shortcode: string; canonicalUrl: string } | null {
  let url: URL;
  try {
    url = typeof rawUrl === 'string' ? new URL(rawUrl.trim()) : rawUrl;
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['reel', 'reels', 'p', 'tv'].includes(parts[0] ?? '')) return null;
  const shortcode = parts[1]?.trim();
  if (!shortcode || !/^[A-Za-z0-9_-]{5,64}$/.test(shortcode)) return null;
  return { shortcode, canonicalUrl: `https://www.instagram.com/reel/${shortcode}/` };
}

export function buildInstagramReferenceFingerprint(shortcode: string): string {
  return `instagram|${shortcode}`;
}

export function buildInstagramReferenceAssetId(userId: string, shortcode: string): string {
  return `ref_ig_${createHash('sha256').update(`${userId}|${shortcode}`).digest('hex').slice(0, 24)}`;
}

async function resolveInstagramActor(
  canonicalUrl: string,
  shortcode: string,
  timeoutMs: number,
): Promise<InstagramActorResult> {
  const token = process.env.APIFY_API_KEY || process.env.APIFY_TOKEN;
  if (!token) {
    throw new InstagramReferenceImportError(
      'instagram_reference_configuration_missing',
      'Instagram reference ingestion is not configured.',
    );
  }
  const actorId = (process.env.APIFY_INSTAGRAM_ACTOR_ID || 'apify/instagram-scraper').replace('/', '~');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://api.apify.com/v2/actors/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?clean=true&maxItems=5&timeout=${Math.ceil(timeoutMs / 1000)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrls: [canonicalUrl], resultsType: 'posts', resultsLimit: 1, addParentData: false }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Apify actor returned ${response.status}.`);
    const items = await response.json() as unknown;
    if (!Array.isArray(items)) throw new Error('Apify actor returned an invalid dataset.');
    const item = items.find((candidate) => actorItemMatchesShortcode(candidate, shortcode));
    if (!item || typeof item !== 'object') {
      throw new InstagramReferenceImportError(
        'instagram_reference_not_found',
        'The Instagram reference was unavailable, private, removed, or did not match the requested Reel.',
      );
    }
    const record = item as Record<string, unknown>;
    const videoUrl = firstString(record.videoUrl, record.video_url);
    if (!videoUrl) throw new Error('Instagram actor returned no video media.');
    return {
      videoUrl,
      sourceLabel: clampSourceLabel(firstString(record.caption, record.title) || `Instagram reference ${shortcode}`),
      durationSec: positiveNumber(record.videoDuration ?? record.duration),
      providerRunId: response.headers.get('x-apify-run-id') || undefined,
    };
  } catch (error) {
    if (error instanceof InstagramReferenceImportError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new InstagramReferenceImportError(
      timedOut ? 'instagram_reference_download_timeout' : 'instagram_reference_ingestion_failed',
      timedOut ? 'Instagram resolver timed out.' : `Instagram resolver failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function actorItemMatchesShortcode(value: unknown, shortcode: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const direct = firstString(record.shortCode, record.shortcode, record.code);
  if (direct) return direct === shortcode;
  const sourceUrl = firstString(record.url, record.inputUrl, record.permalink);
  return sourceUrl ? parseInstagramReferenceUrl(sourceUrl)?.shortcode === shortcode : false;
}

async function downloadInstagramVideo(
  rawUrl: string,
  maxBytes: number,
  timeoutMs: number,
  dnsLookup?: ReferenceVideoDnsLookup,
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = new URL(rawUrl);
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      await assertAllowedInstagramCdn(url, dnsLookup);
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 3) throw new Error('Instagram media redirect limit exceeded.');
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`Instagram media returned ${response.status}.`);
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType && contentType !== 'video/mp4' && contentType !== 'application/octet-stream') {
        throw new Error(`Instagram media returned unsupported content type ${contentType}.`);
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('Instagram media exceeds the size limit.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('Instagram media exceeds the size limit.');
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
    }
    throw new Error('Instagram media could not be resolved.');
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new InstagramReferenceImportError(
      timedOut ? 'instagram_reference_download_timeout' : 'instagram_reference_ingestion_failed',
      timedOut ? 'Instagram media download timed out.' : `Instagram media download failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function assertAllowedInstagramCdn(url: URL, dnsLookup?: ReferenceVideoDnsLookup): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || isUnsafeReferenceHostname(hostname)) throw new Error('Instagram media URL is unsafe.');
  if (!INSTAGRAM_CDN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error('Instagram media URL did not use an approved CDN.');
  }
  const dns = await assertPublicReferenceDnsResolution(hostname, dnsLookup);
  if (!dns.ok) throw new Error(dns.diagnostics[0]);
}

function assertMp4(buffer: Buffer): void {
  if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') {
    throw new InstagramReferenceImportError('instagram_reference_ingestion_failed', 'Instagram media was not a valid MP4 video.');
  }
}

async function findExistingInstagramReferenceAsset(assetId: string, userId: string): Promise<MediaAsset | null> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({ assetId, userId }) as Promise<MediaAsset | null>;
}

async function uploadReferenceMedia(file: Buffer, userId: string, filename: string, contentType: string, options?: UploadOptions): Promise<UploadResult> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  return uploadMedia(file, userId, filename, contentType, options);
}

async function registerInstagramReferenceAsset(asset: MediaAsset, metadata: InstagramReferenceMetadata): Promise<MediaAsset> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const collection = db.collection(COLLECTIONS.MEDIA_ASSETS);
  await collection.updateOne(
    { assetId: asset.assetId, userId: asset.userId },
    {
      $setOnInsert: {
        ...asset,
        contentType: 'video/mp4',
        referenceSource: { provider: 'instagram', ...metadata, lastUsedAt: metadata.importedAt },
      },
    },
    { upsert: true },
  );
  // Keep reuse telemetry current without mixing parent and child paths in one
  // Mongo update, which MongoDB rejects even when the upsert inserts a new row.
  await collection.updateOne(
    { assetId: asset.assetId, userId: asset.userId },
    { $set: { 'referenceSource.lastUsedAt': metadata.importedAt } },
  );
  return await collection.findOne({ assetId: asset.assetId, userId: asset.userId }) as MediaAsset || asset;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function clampSourceLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240) || 'Instagram reference';
}

function positiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 1_000 ? Math.min(value!, 300_000) : fallback;
}
