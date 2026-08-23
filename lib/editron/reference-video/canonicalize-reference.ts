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

import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ReferenceCanonicalEnvelope,
  ReferenceAudioUsageMode,
} from '@/lib/editron/services/asset-resolver';
import type { UploadResult } from '@/lib/editron/services/upload-service';
import type { ReferenceVideoSource } from './reference-video-source';
import { buildReferenceCanonicalEnvelope, demuxReferenceVideo } from './reference-demux';
import {
  registerReferenceMaterializedMediaFileV1,
  type ReferenceMaterializedMediaFileRegistrationInputV1,
  type ReferenceMaterializedMediaRegistrationReceiptV1,
} from './reference-materialized-media-registration-v1';
import {
  buildCanonicalReferenceSourceAssetIdV1,
  resolveCanonicalReferenceFileStorageV1,
  type CanonicalReferenceFileIdentityV1,
  type CanonicalReferenceStorageKindV1,
} from './reference-source-storage-v1';

export interface CanonicalizeReferenceInput {
  userId: string;
  orgId?: string;
  source: ReferenceVideoSource;
  /** Constraint #7 audio usage mode. Caller decides; never invented here. */
  audioUsageMode: ReferenceAudioUsageMode;
  /** Optional product-job cancellation; no hidden whole-download deadline is imposed. */
  abortSignal?: AbortSignal;
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
  /** Legacy seam for bytes already present in request memory (for example uploads). */
  downloadSourceBytes?: (url: string) => Promise<Buffer>;
  /** Stream a remote source to the supplied private file and return exact identity. */
  downloadSourceToFile?: (
    url: string,
    filePath: string,
    abortSignal?: AbortSignal,
  ) => Promise<Readonly<CanonicalReferenceFileIdentityV1>>;
  /** Upload a file only when no existing managed R2/GCS object can be reused. */
  uploadCanonicalFile?: (
    filePath: string,
    userId: string,
    fileName: string,
    contentType: string,
    canonicalAssetId: string,
  ) => Promise<UploadResult>;
  /** Register the source and its envelope in existing mediaAssets. */
  registerSourceFile?: (
    input: Readonly<ReferenceMaterializedMediaFileRegistrationInputV1>,
  ) => Promise<Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>>;
  /** Demux delegation. Injected for tests. */
  demux?: typeof demuxReferenceVideo;
  /** Duration probe delegation (passes through to the demux). Injected for tests. */
  readDurationMs?: (sourcePath: string, abortSignal?: AbortSignal) => Promise<number | null>;
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

async function defaultDownloadSourceToFile(
  url: string,
  filePath: string,
  abortSignal?: AbortSignal,
): Promise<Readonly<CanonicalReferenceFileIdentityV1>> {
  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) throw new Error(`fetch failed (HTTP ${response.status})`);
  if (!response.body) throw new Error('fetch returned no response body');
  const handle = await open(filePath, 'wx');
  const hash = createHash('sha256');
  let byteLength = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const write = await handle.write(
          chunk, offset, chunk.byteLength - offset, byteLength + offset,
        );
        if (write.bytesWritten < 1) throw new Error('source file write made no progress');
        offset += write.bytesWritten;
      }
      byteLength += chunk.byteLength;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { filePath, byteLength, contentSha256: hash.digest('hex') };
}

async function defaultUploadCanonicalFile(
  filePath: string,
  userId: string,
  fileName: string,
  contentType: string,
  canonicalAssetId: string,
): Promise<UploadResult> {
  const { uploadMediaFromFile } = await import('@/lib/editron/services/upload-service');
  return uploadMediaFromFile(
    filePath, userId, fileName, contentType, { customAssetId: canonicalAssetId },
  );
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

  const downloadSourceToFile = deps.downloadSourceToFile ?? defaultDownloadSourceToFile;
  const uploadCanonicalFile = deps.uploadCanonicalFile ?? defaultUploadCanonicalFile;
  const registerSourceFile = deps.registerSourceFile ?? registerReferenceMaterializedMediaFileV1;
  const demux = deps.demux ?? demuxReferenceVideo;
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'editron-canonicalize-'));
  const tmpPath = path.join(tmpDir, 'source.mp4');
  try {
    let file: Readonly<CanonicalReferenceFileIdentityV1>;
    try {
      if (deps.downloadSourceBytes) {
        const bytes = await deps.downloadSourceBytes(source.videoUrl);
        await writeFile(tmpPath, bytes, { flag: 'wx' });
        file = {
          filePath: tmpPath,
          byteLength: bytes.byteLength,
          contentSha256: createHash('sha256').update(bytes).digest('hex'),
        };
      } else {
        file = await downloadSourceToFile(source.videoUrl, tmpPath, input.abortSignal);
      }
    } catch (error) {
      throw new CanonicalizeReferenceError(
        'source_download_failed',
        'Reference source read failed: ' + (error instanceof Error ? error.message : String(error)),
        [source.videoUrl],
      );
    }
    if (file.filePath !== tmpPath || !Number.isSafeInteger(file.byteLength)
      || file.byteLength < 1 || !/^[a-f0-9]{64}$/.test(file.contentSha256)) {
      throw new CanonicalizeReferenceError(
        'source_too_small', `Reference source is empty or has invalid identity: ${source.videoUrl}`,
      );
    }

    let storage: Awaited<ReturnType<typeof resolveCanonicalReferenceFileStorageV1>>;
    try {
      storage = await resolveCanonicalReferenceFileStorageV1(
        { userId, source, file }, { uploadCanonicalFile },
      );
    } catch (error) {
      throw new CanonicalizeReferenceError(
        'source_storage_failed',
        'Reference source storage resolution failed: '
          + (error instanceof Error ? error.message : String(error)),
      );
    }
    const uploaded = storage.upload;

    let envelope: ReferenceCanonicalEnvelope;
    let demuxedAudio: { key: string; contentType: string } | null = null;
    try {
      const receipt = await demux({
        referenceAssetId: uploaded.assetId, userId, orgId: input.orgId, sourcePath: tmpPath,
        sourceKind: source.kind, sourceLabel: source.sourceLabel,
        abortSignal: input.abortSignal,
      }, { readDurationMs: deps.readDurationMs });
      envelope = buildReferenceCanonicalEnvelope(receipt, audioUsageMode);
      if (receipt.audio) {
        demuxedAudio = { key: receipt.audio.key, contentType: receipt.audio.contentType };
      }
    } catch (error) {
      throw error instanceof CanonicalizeReferenceError
        ? error
        : new CanonicalizeReferenceError('source_demux_failed',
          'Reference source demux failed: ' + (error instanceof Error ? error.message : String(error)));
    }

    let sourceRegistration: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
    try {
      sourceRegistration = await registerSourceFile({
        filePath: tmpPath, upload: uploaded, actorUserId: userId,
        mediaOwner: input.orgId
          ? { type: 'ORG', orgId: input.orgId }
          : { type: 'USER', userId },
        mediaKind: 'video', filename: storage.filename,
        role: { kind: 'SOURCE', referenceEnvelope: envelope },
      });
    } catch (error) {
      throw new CanonicalizeReferenceError(
        'source_registration_failed',
        'Failed to register canonical source: '
          + (error instanceof Error ? error.message : String(error)),
      );
    }

    return {
      referenceAssetId: uploaded.assetId, videoUrl: uploaded.signedUrl, envelope,
      canonicalKind: storage.canonicalKind, audioArtifact: demuxedAudio,
      sourceLabel: source.sourceLabel, sourceFingerprint: source.sourceFingerprint,
      sourceRegistration,
      durationSec: envelope.demux?.durationMs === null || envelope.demux?.durationMs === undefined
        ? source.durationSec
        : envelope.demux.durationMs / 1_000,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
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
