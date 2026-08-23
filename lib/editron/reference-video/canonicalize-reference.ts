/**
 * R1-C: Canonicalize a reference for downstream stages.
 *
 * R1's mandate: the canonical asset ID is mandatory for every downstream stage.
 * This service guarantees a resolved reference is (or becomes) a canonical
 * MediaAsset before the caller consumes it:
 *
 *   - 'asset' kind (already uploaded / imported)  -> exact bytes are hashed,
 *     demuxed and registered under a content-addressed alias over the same
 *     managed storage object (or a private copy when storage is unmanaged).
 *   - 'youtube-url' / 'instagram-url' kinds        -> materialized to an asset
 *     by the importers before this runs, so they arrive as 'asset'.
 *   - 'remote-url' (direct .mp4/.mov/.webm/.m4v)   -> materialized NOW:
 *     download -> upload to a private scoped asset -> attach the R1 envelope
 *     (content hash + audio usage mode + demux receipt).
 *
 * Deterministic + fail-loud (R18N). Throws CanonicalizeReferenceError with a
 * stable code so the intake can surface the rejection reason.
 */

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
import {
  buildCanonicalReferenceSourceAssetIdV1,
  resolveCanonicalReferenceStorageV1,
  type CanonicalReferenceStorageKindV1,
} from './reference-source-storage-v1';

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
  /** Whether managed bytes were reused or privately materialized. */
  canonicalKind: CanonicalReferenceStorageKindV1;
  /** Demuxed audio artifact (storage key + content type) for R3 recognition. */
  audioArtifact?: { key: string; contentType: string } | null;
  durationSec?: number;
  sourceLabel?: string;
  sourceFingerprint?: string;
  /** Exact existing-mediaAssets registration required by provider issuance. */
  sourceRegistration?: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
}

export interface CanonicalizeReferenceDeps {
  /** Read the resolved source URL to exact bytes. Injected for tests. */
  downloadSourceBytes?: (url: string) => Promise<Buffer>;
  /** Upload bytes only when no existing managed R2/GCS object can be reused. */
  uploadCanonicalBytes?: (
    file: Buffer,
    userId: string,
    fileName: string,
    contentType: string,
    canonicalAssetId: string,
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
      | 'source_download_failed'
      | 'source_too_small'
      | 'source_storage_failed'
      | 'source_demux_failed'
      | 'source_registration_failed',
    message: string,
    public readonly diagnostics: string[] = [message],
  ) {
    super(message);
    this.name = 'CanonicalizeReferenceError';
  }
}

async function defaultDownloadSourceBytes(url: string): Promise<Buffer> {
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

async function defaultUploadCanonicalBytes(
  file: Buffer,
  userId: string,
  fileName: string,
  contentType: string,
  canonicalAssetId: string,
): Promise<UploadResult> {
  const { uploadMedia } = await import('@/lib/editron/services/upload-service');
  return uploadMedia(file, userId, fileName, contentType, { customAssetId: canonicalAssetId });
}

/**
 * Ensure a resolved reference is canonical before downstream consumption.
 * All source kinds receive one exact content-addressed identity. Managed asset
 * storage is reused; only remote/unmanaged bytes are copied.
 */
export async function canonicalizeReferenceVideo(
  input: CanonicalizeReferenceInput,
  deps: CanonicalizeReferenceDeps = {},
): Promise<CanonicalizeReferenceOutput> {
  const { source, userId, audioUsageMode } = input;

  const downloadSourceBytes = deps.downloadSourceBytes ?? defaultDownloadSourceBytes;
  const uploadCanonicalBytes = deps.uploadCanonicalBytes ?? defaultUploadCanonicalBytes;
  const registerSource = deps.registerSource ?? registerReferenceMaterializedMediaAssetV1;
  const demux = deps.demux ?? demuxReferenceVideo;

  // Exact source bytes are required for both the envelope and immutable ID.
  let bytes: Buffer;
  try {
    bytes = await downloadSourceBytes(source.videoUrl);
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'source_download_failed',
      'Reference source read failed: ' + (error instanceof Error ? error.message : String(error)),
      [source.videoUrl],
    );
  }
  if (bytes.byteLength < MIN_DL_BYTES) {
    throw new CanonicalizeReferenceError(
      'source_too_small',
      `Reference source too small to be video (${bytes.byteLength} bytes): ${source.videoUrl}`,
    );
  }

  let storage: Awaited<ReturnType<typeof resolveCanonicalReferenceStorageV1>>;
  try {
    storage = await resolveCanonicalReferenceStorageV1(
      { userId, source, bytes },
      { uploadCanonicalBytes },
    );
  } catch (error) {
    throw new CanonicalizeReferenceError(
      'source_storage_failed',
      'Reference source storage resolution failed: '
        + (error instanceof Error ? error.message : String(error)),
    );
  }
  const uploaded = storage.upload;

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
      : new CanonicalizeReferenceError('source_demux_failed',
        'Reference source demux failed: ' + (error instanceof Error ? error.message : String(error)));
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
      filename: storage.filename,
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
    canonicalKind: storage.canonicalKind,
    audioArtifact: demuxedAudio,
    sourceLabel: source.sourceLabel,
    sourceFingerprint: source.sourceFingerprint,
    sourceRegistration,
    durationSec: envelope.demux?.durationMs === null || envelope.demux?.durationMs === undefined
      ? source.durationSec
      : envelope.demux.durationMs / 1_000,
  };
}

/** Content-addressed per-user source ID: changed URL bytes never overwrite prior evidence. */
export function buildCanonicalRemoteAssetId(
  userId: string,
  sourceReferenceId: string,
  sourceContentSha256: string,
): string {
  return buildCanonicalReferenceSourceAssetIdV1(
    userId, sourceReferenceId, sourceContentSha256,
  );
}
