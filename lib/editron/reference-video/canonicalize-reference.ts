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
import type { UploadResult } from '@/lib/editron/services/upload-service';
import type { ReferenceVideoSource } from './reference-video-source';
import { buildReferenceCanonicalEnvelope, demuxReferenceVideo } from './reference-demux';
import {
  registerReferenceMaterializedMediaAssetV1,
  type ReferenceMaterializedMediaRegistrationInputV1,
  type ReferenceMaterializedMediaRegistrationReceiptV1,
} from './reference-materialized-media-registration-v1';

const MIN_DL_BYTES = 10_000; // ⚠️ INVENTED sanity floor — a real video file is ≥100KB
const DL_TIMEOUT_MS = 90_000; // ⚠️ INVENTED — generous fetch bound; matches yt-dlp default

export interface CanonicalizeReferenceInput {
  userId: string;
  orgId?: string;
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
  /** Demuxed audio artifact (storage key + content type) for R3 recognition.
   *  Present only when this step materialized + demuxed a direct remote URL. */
  audioArtifact?: { key: string; contentType: string } | null;
  durationSec?: number;
  sourceLabel?: string;
  sourceFingerprint?: string;
  /** Exact existing-mediaAssets registration required by provider issuance. */
  sourceRegistration?: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
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
  ) => Promise<UploadResult>;
  /** Register the source and its envelope in existing mediaAssets. */
  registerSource?: (
    input: Readonly<ReferenceMaterializedMediaRegistrationInputV1>,
  ) => Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>>;
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
      | 'source_registration_failed',
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
): Promise<UploadResult> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  return uploadMedia(file, userId, fileName, 'video/mp4', { customAssetId: referenceAssetId });
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
  const registerSource = deps.registerSource ?? registerReferenceMaterializedMediaAssetV1;
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
  const canonicalAssetId = buildCanonicalRemoteAssetId(
    input.userId,
    source.referenceId,
    defaultSha256(bytes),
  );
  const sourceFilenameBase = sanitizeAssetPart(source.sourceLabel) || 'remote-reference';
  const sourceFilename = sourceFilenameBase.toLowerCase().endsWith('.mp4')
    ? sourceFilenameBase
    : `${sourceFilenameBase}.mp4`;
  let uploaded: UploadResult;
  try {
    uploaded = await uploadRemoteBytes(bytes, userId, sourceFilename, canonicalAssetId);
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'remote_upload_failed',
      'Remote reference upload failed: ' + (error instanceof Error ? error.message : String(error)),
    );
  }

  // 3. Demux + attach the canonical envelope (content hash = source hash).
  //    Write bytes to a temp file for the demux (it reads from disk).
  const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'editron-canonicalize-'));
  const tmpPath = path.join(tmpDir, 'source.mp4');
  let envelope: ReferenceCanonicalEnvelope;
  let demuxedAudio: { key: string; contentType: string } | null = null;
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
    if (receipt.audio) {
      demuxedAudio = { key: receipt.audio.key, contentType: receipt.audio.contentType };
    }
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error instanceof CanonicalizeReferenceError
      ? error
      : new CanonicalizeReferenceError('remote_demux_failed',
        'Demux failed for remote reference: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // 4. Register source bytes + envelope in the existing mediaAssets authority.
  let sourceRegistration: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
  try {
    sourceRegistration = await registerSource({
      bytes,
      upload: uploaded,
      actorUserId: userId,
      mediaOwner: input.orgId
        ? { type: 'ORG', orgId: input.orgId }
        : { type: 'USER', userId },
      mediaKind: 'video',
      filename: sourceFilename,
      role: { kind: 'SOURCE', referenceEnvelope: envelope },
    });
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'source_registration_failed',
      'Failed to register canonical source: ' + (error instanceof Error ? error.message : String(error)),
    );
  }

  return {
    referenceAssetId: uploaded.assetId,
    videoUrl: uploaded.signedUrl,
    envelope,
    canonicalKind: 'materialized-remote',
    audioArtifact: demuxedAudio,
    sourceLabel: source.sourceLabel,
    sourceFingerprint: source.sourceFingerprint,
    sourceRegistration,
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

/** Content-addressed per-user source ID: changed URL bytes never overwrite prior evidence. */
export function buildCanonicalRemoteAssetId(
  userId: string,
  sourceReferenceId: string,
  sourceContentSha256: string,
): string {
  if (!/^[a-f0-9]{64}$/.test(sourceContentSha256)) {
    throw new Error('Canonical remote source content hash must be a lowercase SHA-256.');
  }
  const identity = `${userId}|${sourceReferenceId}|${sourceContentSha256}`;
  return `ref_canon_${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}
