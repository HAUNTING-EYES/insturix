/**
 * R1-C: Canonicalize a reference for downstream stages.
 *
 * R1's mandate: the canonical asset ID is mandatory for every downstream stage.
 * This service guarantees a resolved reference is (or becomes) a canonical
 * MediaAsset before the caller consumes it:
 *
 *   - 'asset' kind (already uploaded / imported)  -> canonical, no fetch.
 *   - 'youtube-url' / 'instagram-url' kinds        -> materialized to an asset
 *     by the importers before this runs, so they arrive as 'asset'.
 *   - 'remote-url' (direct .mp4/.mov/.webm/.m4v)   -> materialized NOW:
 *     download -> upload to a private scoped asset -> attach the R1 envelope
 *     (content hash + audio usage mode + demux receipt).
 *
 * Demuxes are only built for the materialized remote-url path (which has local
 * bytes). Imported assets keep their importer provenance; their envelope is
 * attached by the caller when a demux runs later, not double-fetched here.
 *
 * Deterministic + fail-loud (R18N). Throws CanonicalizeReferenceError with a
 * stable code so the intake can surface the rejection reason.
 */

import { createHash } from 'node:crypto';

import type {
  ReferenceCanonicalEnvelope,
  ReferenceAudioUsageMode,
} from '@/lib/editron/services/asset-resolver';
import type { ReferenceVideoSource } from './reference-video-source';
import { buildReferenceCanonicalEnvelope, demuxReferenceVideo } from './reference-demux';

const MIN_DL_BYTES = 10_000; // ⚠️ INVENTED sanity floor — a real video file is ≥100KB
const DL_TIMEOUT_MS = 90_000; // ⚠️ INVENTED — generous fetch bound; matches yt-dlp default

export interface CanonicalizeReferenceInput {
  userId: string;
  source: ReferenceVideoSource;
  /** Constraint #7 audio usage mode. Caller decides; never invented here. */
  audioUsageMode: ReferenceAudioUsageMode;
}

export interface CanonicalizeReferenceOutput {
  /** Canonical asset id every downstream stage must use. */
  referenceAssetId: string;
  /** The mutable/private bytes URL for analysis (asset URL or materialized URL). */
  videoUrl: string;
  /** Canonical record; present when materialized here or already attached. */
  envelope?: ReferenceCanonicalEnvelope;
  /** Where the bytes physically live ('asset' | 'materialized-remote'). */
  canonicalKind: 'asset' | 'materialized-remote';
  durationSec?: number;
  sourceLabel?: string;
  sourceFingerprint?: string;
}

export interface CanonicalizeReferenceDeps {
  /** Download a remote URL to local bytes. Injected for tests (no network). */
  downloadRemoteBytes?: (url: string) => Promise<Buffer>;
  /** Upload local bytes as a private scoped asset. Injected for tests. */
  uploadRemoteBytes?: (
    file: Buffer,
    userId: string,
    fileName: string,
    referenceAssetId: string,
  ) => Promise<{ assetId: string; videoUrl: string; size: number }>;
  /** Persist the canonical envelope on the asset row. Injected for tests. */
  persistEnvelope?: (input: {
    assetId: string;
    userId: string;
    envelope: ReferenceCanonicalEnvelope;
  }) => Promise<unknown>;
  /** Demux delegation. Injected for tests. */
  demux?: typeof demuxReferenceVideo;
  /** Duration probe delegation (passes through to the demux). Injected for tests. */
  readDurationMs?: (sourcePath: string) => Promise<number | null>;
  sha256?: (buffer: Buffer) => string;
}

export class CanonicalizeReferenceError extends Error {
  constructor(
    public readonly code:
      | 'remote_download_failed'
      | 'remote_too_small'
      | 'remote_upload_failed'
      | 'remote_demux_failed'
      | 'envelope_persist_failed',
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'CanonicalizeReferenceError';
  }
}

function defaultSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function defaultDownloadRemoteBytes(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DL_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`fetch failed (HTTP ${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function defaultUploadRemoteBytes(
  file: Buffer,
  userId: string,
  fileName: string,
  referenceAssetId: string,
): Promise<{ assetId: string; videoUrl: string; size: number }> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  const result = await uploadMedia(file, userId, fileName, 'video/mp4', { customAssetId: referenceAssetId });
  return { assetId: result.assetId, videoUrl: result.signedUrl, size: result.size };
}

async function defaultPersistEnvelope(input: {
  assetId: string;
  userId: string;
  envelope: ReferenceCanonicalEnvelope;
}): Promise<unknown> {
  const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOneAndUpdate(
    { assetId: input.assetId, userId: input.userId },
    {
      $set: {
        referenceEnvelope: input.envelope,
        contentHash: input.envelope.contentHash,
      },
    },
    { returnDocument: 'after' },
  );
  if (!result?.value) {
    throw new Error(`asset ${input.assetId} not found for envelope persist`);
  }
  return result.value;
}

/**
 * Ensure a resolved reference is canonical before downstream consumption.
 * 'asset' / imported references pass through; direct remote URLs are
 * materialized (download -> upload -> envelope + demux) and returned with their
 * canonical asset id.
 */
export async function canonicalizeReferenceVideo(
  input: CanonicalizeReferenceInput,
  deps: CanonicalizeReferenceDeps = {},
): Promise<CanonicalizeReferenceOutput> {
  const { source, userId, audioUsageMode } = input;

  if (source.kind !== 'remote-url') {
    // Asset / youtube / instagram arrive with an asset already (importers
    // materialize them). Use the canonical id + existing URL; envelope is
    // attached when a demux runs (avoid double-fetching imported bytes).
    return {
      referenceAssetId: source.referenceId,
      videoUrl: source.videoUrl,
      canonicalKind: source.asset ? 'asset' : 'asset',
      durationSec: source.durationSec,
      sourceLabel: source.sourceLabel,
      sourceFingerprint: source.sourceFingerprint,
    };
  }

  const downloadRemoteBytes = deps.downloadRemoteBytes ?? defaultDownloadRemoteBytes;
  const uploadRemoteBytes = deps.uploadRemoteBytes ?? defaultUploadRemoteBytes;
  const persistEnvelope = deps.persistEnvelope ?? defaultPersistEnvelope;
  const demux = deps.demux ?? demuxReferenceVideo;
  const sha256 = deps.sha256 ?? defaultSha256;

  // 1. Download the direct file to local bytes.
  let bytes: Buffer;
  try {
    bytes = await downloadRemoteBytes(source.videoUrl);
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'remote_download_failed',
      'Remote reference download failed: ' + (error instanceof Error ? error.message : String(error)),
      [source.videoUrl],
    );
  }
  if (bytes.byteLength < MIN_DL_BYTES) {
    throw new CanonicalizeReferenceError(
      'remote_too_small',
      `Remote reference too small to be video (${bytes.byteLength} bytes): ${source.videoUrl}`,
    );
  }

  // 2. Upload into a private scoped asset. The canonical asset id MUST be
  //    per-user: source.referenceId is URL-derived (same for every user) and
  //    would collide cross-user since assetId == R2 key. Derive a scoped id,
  //    and keep the URL fingerprint as provenance on the asset row.
  const canonicalAssetId = buildCanonicalRemoteAssetId(input.userId, source.referenceId);
  const uploaded = await uploadRemoteBytes(
    bytes,
    userId,
    sanitizeAssetPart(source.sourceLabel) || 'remote-reference',
    canonicalAssetId,
  );

  // 3. Demux + attach the canonical envelope (content hash = source hash).
  //    Write bytes to a temp file for the demux (it reads from disk).
  const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'editron-canonicalize-'));
  const tmpPath = path.join(tmpDir, 'source.mp4');
  let envelope: ReferenceCanonicalEnvelope;
  try {
    await writeFile(tmpPath, bytes);
    const receipt = await demux(
      {
        referenceAssetId: uploaded.assetId,
        userId,
        sourcePath: tmpPath,
        sourceKind: source.kind,
        sourceLabel: source.sourceLabel,
      },
      { sha256: deps.sha256, readDurationMs: deps.readDurationMs },
    );
    envelope = buildReferenceCanonicalEnvelope(receipt, audioUsageMode);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error instanceof CanonicalizeReferenceError
      ? error
      : new CanonicalizeReferenceError('remote_demux_failed',
        'Demux failed for remote reference: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // 4. Persist the envelope on the canonical asset row.
  try {
    await persistEnvelope({ assetId: uploaded.assetId, userId, envelope });
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'envelope_persist_failed',
      'Failed to persist canonical envelope: ' + (error instanceof Error ? error.message : String(error)),
    );
  }

  return {
    referenceAssetId: uploaded.assetId,
    videoUrl: uploaded.videoUrl,
    envelope,
    canonicalKind: 'materialized-remote',
    sourceLabel: source.sourceLabel,
    sourceFingerprint: source.sourceFingerprint,
  };
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
 * Per-user canonical asset id for a materialized remote reference. assetId is
 * the R2 key, so scope to the user to avoid cross-user collisions: the same
 * public URL materialized by two users must produce two distinct ids.
 */
export function buildCanonicalRemoteAssetId(userId: string, sourceReferenceId: string): string {
  return `ref_canon_${createHash('sha256').update(`${userId}|${sourceReferenceId}`).digest('hex').slice(0, 16)}`;
}
