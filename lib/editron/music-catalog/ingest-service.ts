import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { MusicCatalogTrack } from '@/lib/editron/music-catalog/types';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import {
  AudioConditioningError,
  MAX_AUDIO_CONDITIONING_INPUT_BYTES,
  type EncodedMusicInspection,
} from '@/lib/pipeline/audio-conditioning';
import type { UploadResult } from '@/lib/editron/services/upload-service';

const INGEST_COLLECTION = 'editron_music_catalog_ingests';
const INGEST_LEASE_MS = 10 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PROVIDER_TRACK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const musicCatalogIngestRequestSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200),
  provider: z.literal('epidemic-sound'),
  providerTrackId: z.string().trim().min(1).max(200).regex(PROVIDER_TRACK_ID_PATTERN),
  idempotencyKey: z.string().trim().min(8).max(200).regex(IDEMPOTENCY_KEY_PATTERN),
});

export type MusicCatalogIngestRequest = z.infer<typeof musicCatalogIngestRequestSchema>;

export type MusicCatalogIngestErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_CONFIGURED'
  | 'PROJECT_NOT_FOUND'
  | 'TRACK_NOT_ENTITLED'
  | 'INGEST_IN_PROGRESS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'DOWNLOAD_FAILED'
  | 'INVALID_AUDIO'
  | 'PERSISTENCE_FAILED';

export class MusicCatalogIngestError extends Error {
  constructor(
    readonly code: MusicCatalogIngestErrorCode,
    message: string,
    readonly httpStatus: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MusicCatalogIngestError';
  }
}

export interface MusicCatalogDownloadEntitlement {
  provider: 'epidemic-sound';
  providerTrackId: string;
  url: string;
  expiresAt: Date;
  format: 'mp3';
  quality: 'normal' | 'high';
  entitlementCheckedAt: Date;
}

export interface MusicCatalogIngestProvider {
  readonly name: 'epidemic-sound';
  available(): boolean;
  getTrack(providerTrackId: string): Promise<MusicCatalogTrack>;
  requestDownload(
    providerTrackId: string,
    quality?: 'normal' | 'high',
  ): Promise<MusicCatalogDownloadEntitlement>;
}

export interface LibraryLicenseReceipt {
  version: 'editron-library-license-receipt-v1';
  provider: 'epidemic-sound';
  providerTrackId: string;
  licenseId: string;
  agreement: {
    reference: string;
    configuredBy: 'deployment-operator';
    authority: 'NEVER_AUTOMATED';
  };
  entitlement: {
    checkedAt: Date;
    downloadExpiresAt: Date;
    format: 'mp3';
    quality: 'normal' | 'high';
    providerTier: 'free' | 'paid' | 'unknown';
  };
  ownership: {
    userId: string;
    projectId: string;
    orgId: string | null;
  };
  sourceObject: {
    sha256: string;
    size: number;
    contentType: 'audio/mpeg';
  };
  acousticAnalysis: EncodedMusicInspection;
  ingestedAt: Date;
}

export interface StoredLibraryMusicAsset {
  assetId: string;
  userId: string;
  orgId: string | null;
  projectId: string;
  type: 'audio';
  filename: string;
  source: 'library';
  gcsPath: string | null;
  r2Key: string | null;
  publicUrl: string;
  cachedUrl: string;
  urlExpiresAt: Date | null;
  size: number;
  duration: number;
  uploadedAt: Date;
  lastUsedAt: Date;
  pinned: boolean;
  renderEligibility: 'requires-audio-assignment-conditioning';
  musicRights: AudioRightsContract;
  libraryLicenseReceipt: LibraryLicenseReceipt;
  catalogMetadata: {
    provider: 'epidemic-sound';
    providerTrackId: string;
    title: string;
    artists: string[];
    featuredArtists: string[];
    bpm: number | null;
    moods: MusicCatalogTrack['moods'];
    genres: MusicCatalogTrack['genres'];
    vocalType: MusicCatalogTrack['vocalType'];
    hasVocals: boolean | null;
    explicit: boolean | null;
    isrc?: string;
  };
}

export interface MusicCatalogIngestResult {
  assetId: string;
  provider: 'epidemic-sound';
  providerTrackId: string;
  title: string;
  durationMs: number;
  licenseId: string;
  rightsStatus: 'licensed';
  renderEligibility: 'requires-audio-assignment-conditioning';
  idempotentReplay: boolean;
}

interface IngestLease {
  reservationId: string;
  leaseToken: string;
}

interface IngestReservationDocument {
  _id: string;
  assetId: string;
  userId: string;
  projectId: string;
  provider: 'epidemic-sound';
  providerTrackId: string;
  status: 'pending' | 'complete' | 'failed';
  leaseToken?: string;
  leaseUntil?: Date;
  failureCode?: string;
  failedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ClaimResult =
  | { kind: 'claimed'; lease: IngestLease }
  | { kind: 'complete'; asset: StoredLibraryMusicAsset }
  | { kind: 'in-progress' }
  | { kind: 'conflict' };

export interface MusicCatalogIngestStore {
  findAsset(assetId: string, userId: string): Promise<StoredLibraryMusicAsset | null>;
  claim(input: {
    reservationId: string;
    assetId: string;
    userId: string;
    projectId: string;
    providerTrackId: string;
    now: Date;
  }): Promise<ClaimResult>;
  saveAsset(asset: StoredLibraryMusicAsset): Promise<StoredLibraryMusicAsset>;
  complete(lease: IngestLease, assetId: string, completedAt: Date): Promise<boolean>;
  fail(lease: IngestLease, code: string, failedAt: Date): Promise<void>;
}

export interface MusicCatalogIngestDependencies {
  provider: MusicCatalogIngestProvider;
  providerAgreementId?: string;
  loadProject(
    userId: string,
    projectId: string,
  ): Promise<{ orgId?: string | null } | null>;
  inspectAudio(buffer: Buffer): Promise<EncodedMusicInspection>;
  detectFileType(
    buffer: Uint8Array,
  ): Promise<{ ext: string; mime: string } | undefined>;
  upload(
    buffer: Buffer,
    userId: string,
    filename: string,
    contentType: string,
    options: { customAssetId: string },
  ): Promise<UploadResult>;
  cleanupUpload(upload: UploadResult): Promise<void>;
  store: MusicCatalogIngestStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export async function ingestMusicCatalogTrack(
  input: MusicCatalogIngestRequest,
  dependencies: MusicCatalogIngestDependencies,
): Promise<MusicCatalogIngestResult> {
  const parsed = musicCatalogIngestRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new MusicCatalogIngestError(
      'INVALID_REQUEST',
      'The music catalog ingest request is invalid',
      400,
      { cause: parsed.error },
    );
  }
  const request = parsed.data;
  const agreementId = dependencies.providerAgreementId?.trim();
  if (!dependencies.provider.available() || !agreementId) {
    throw new MusicCatalogIngestError(
      'NOT_CONFIGURED',
      'Music catalog ingest requires provider credentials and an operator-configured license agreement',
      503,
    );
  }

  const project = await dependencies.loadProject(request.userId, request.projectId);
  if (!project) {
    throw new MusicCatalogIngestError(
      'PROJECT_NOT_FOUND',
      'Project not found or access denied',
      404,
    );
  }

  const assetId = buildAssetId(request, agreementId);
  const existingAsset = await dependencies.store.findAsset(assetId, request.userId);
  if (existingAsset) return resultFromAsset(existingAsset, true);

  const reservationId = buildReservationId(request);
  const now = dependencies.now ?? (() => new Date());
  const claim = await dependencies.store.claim({
    reservationId,
    assetId,
    userId: request.userId,
    projectId: request.projectId,
    providerTrackId: request.providerTrackId,
    now: now(),
  });
  if (claim.kind === 'complete') return resultFromAsset(claim.asset, true);
  if (claim.kind === 'in-progress') {
    throw new MusicCatalogIngestError(
      'INGEST_IN_PROGRESS',
      'An ingest with this idempotency key is already in progress',
      409,
    );
  }
  if (claim.kind === 'conflict') {
    throw new MusicCatalogIngestError(
      'IDEMPOTENCY_CONFLICT',
      'The idempotency key was already used for a different catalog track',
      409,
    );
  }

  let upload: UploadResult | null = null;
  try {
    const track = await dependencies.provider.getTrack(request.providerTrackId);
    if (
      track.provider !== request.provider
      || track.providerTrackId !== request.providerTrackId
      || track.catalogAvailability !== 'download-candidate'
    ) {
      throw new MusicCatalogIngestError(
        'TRACK_NOT_ENTITLED',
        'This catalog track is preview-only or unavailable for controlled ingest',
        403,
      );
    }

    const entitlement = await dependencies.provider.requestDownload(
      request.providerTrackId,
      'high',
    );
    validateEntitlement(entitlement, request.providerTrackId, now());
    const sourceBuffer = await downloadEntitledAudio(
      entitlement.url,
      dependencies.fetchImpl ?? fetch,
    );
    const detectedType = await dependencies.detectFileType(sourceBuffer);
    if (detectedType?.ext !== 'mp3' || detectedType.mime !== 'audio/mpeg') {
      throw new MusicCatalogIngestError(
        'INVALID_AUDIO',
        'The provider download was not a valid MP3 audio asset',
        422,
      );
    }

    let acousticAnalysis: EncodedMusicInspection;
    try {
      acousticAnalysis = await dependencies.inspectAudio(sourceBuffer);
    } catch (error) {
      if (error instanceof AudioConditioningError) {
        throw new MusicCatalogIngestError(
          'INVALID_AUDIO',
          `The provider audio failed acoustic validation: ${error.message}`,
          422,
          { cause: error },
        );
      }
      throw error;
    }

    const contentSha256 = sha256(sourceBuffer);
    const licenseId = buildLicenseId(request, agreementId);
    const ingestedAt = now();
    upload = await dependencies.upload(
      sourceBuffer,
      request.userId,
      `${assetId}.mp3`,
      'audio/mpeg',
      { customAssetId: assetId },
    );
    validateControlledUpload(upload, assetId, sourceBuffer.length);
    const asset = buildStoredAsset({
      request,
      project,
      track,
      agreementId,
      licenseId,
      entitlement,
      acousticAnalysis,
      contentSha256,
      ingestedAt,
      upload,
    });

    let savedAsset: StoredLibraryMusicAsset;
    try {
      savedAsset = await dependencies.store.saveAsset(asset);
    } catch (error) {
      let recovered: StoredLibraryMusicAsset | null;
      try {
        recovered = await recoverPersistedAsset(
          dependencies.store,
          asset,
        );
      } catch (verificationError) {
        upload = null;
        console.error('[MusicCatalogIngest] Persistence outcome is uncertain; preserving controlled object', {
          assetId: asset.assetId,
          error: errorMessage(error),
          verificationError: errorMessage(verificationError),
        });
        throw new MusicCatalogIngestError(
          'PERSISTENCE_FAILED',
          'The catalog asset persistence outcome could not be verified; controlled storage was preserved',
          500,
          { cause: new AggregateError([error, verificationError]) },
        );
      }
      if (recovered) {
        savedAsset = recovered;
      } else {
        throw new MusicCatalogIngestError(
          'PERSISTENCE_FAILED',
          'The controlled catalog asset could not be persisted',
          500,
          { cause: error },
        );
      }
    }

    upload = null;
    let markedComplete = false;
    try {
      markedComplete = await dependencies.store.complete(
        claim.lease,
        savedAsset.assetId,
        now(),
      );
    } catch (error) {
      console.error('[MusicCatalogIngest] Asset persisted but idempotency receipt completion failed', {
        assetId: savedAsset.assetId,
        reservationId: claim.lease.reservationId,
        error: errorMessage(error),
      });
    }
    if (!markedComplete) {
      console.error('[MusicCatalogIngest] Asset persisted but idempotency receipt completion lost its lease', {
        assetId: savedAsset.assetId,
        reservationId: claim.lease.reservationId,
      });
    }
    return resultFromAsset(savedAsset, false);
  } catch (error) {
    let terminalError = error;
    if (upload) {
      const failedUpload = upload;
      upload = null;
      try {
        await cleanupFailedUpload(dependencies, failedUpload, error);
      } catch (cleanupError) {
        terminalError = cleanupError;
      }
    }
    await dependencies.store
      .fail(
        claim.lease,
        terminalError instanceof MusicCatalogIngestError
          ? terminalError.code
          : 'UNEXPECTED_FAILURE',
        now(),
      )
      .catch((storeError: unknown) => {
        console.error('[MusicCatalogIngest] Failed to record ingest failure', {
          reservationId: claim.lease.reservationId,
          error: errorMessage(storeError),
        });
      });
    throw terminalError;
  }
}

export class MongoMusicCatalogIngestStore implements MusicCatalogIngestStore {
  async findAsset(assetId: string, userId: string): Promise<StoredLibraryMusicAsset | null> {
    const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    return await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne({
      assetId,
      userId,
      source: 'library',
      'libraryLicenseReceipt.version': 'editron-library-license-receipt-v1',
    }) as unknown as StoredLibraryMusicAsset | null;
  }

  async claim(input: {
    reservationId: string;
    assetId: string;
    userId: string;
    projectId: string;
    providerTrackId: string;
    now: Date;
  }): Promise<ClaimResult> {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const collection = db.collection<IngestReservationDocument>(INGEST_COLLECTION);
    const leaseToken = randomUUID();
    const leaseUntil = new Date(input.now.getTime() + INGEST_LEASE_MS);
    const pending: IngestReservationDocument = {
      _id: input.reservationId,
      assetId: input.assetId,
      userId: input.userId,
      projectId: input.projectId,
      provider: 'epidemic-sound',
      providerTrackId: input.providerTrackId,
      status: 'pending',
      leaseToken,
      leaseUntil,
      createdAt: input.now,
      updatedAt: input.now,
    };

    try {
      await collection.insertOne(pending);
      return {
        kind: 'claimed',
        lease: { reservationId: input.reservationId, leaseToken },
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const existing = await collection.findOne({ _id: input.reservationId });
    if (!existing) {
      throw new MusicCatalogIngestError(
        'PERSISTENCE_FAILED',
        'The ingest reservation could not be read after a uniqueness conflict',
        500,
      );
    }
    if (
      existing.userId !== input.userId
      || existing.projectId !== input.projectId
      || existing.providerTrackId !== input.providerTrackId
    ) {
      return { kind: 'conflict' };
    }
    if (existing.status === 'complete') {
      const asset = await this.findAsset(input.assetId, input.userId);
      if (asset) return { kind: 'complete', asset };
    }
    if (
      existing.status === 'pending'
      && existing.leaseUntil instanceof Date
      && existing.leaseUntil.getTime() > input.now.getTime()
    ) {
      return { kind: 'in-progress' };
    }

    const reclaimed = await collection.findOneAndUpdate(
      {
        _id: input.reservationId,
        updatedAt: existing.updatedAt,
      },
      {
        $set: {
          assetId: input.assetId,
          status: 'pending',
          leaseToken,
          leaseUntil,
          updatedAt: input.now,
        },
        $unset: {
          failureCode: '',
          failedAt: '',
          completedAt: '',
        },
      },
      { returnDocument: 'after' },
    );
    if (!reclaimed) return { kind: 'in-progress' };
    return {
      kind: 'claimed',
      lease: { reservationId: input.reservationId, leaseToken },
    };
  }

  async saveAsset(asset: StoredLibraryMusicAsset): Promise<StoredLibraryMusicAsset> {
    const { getDatabase, COLLECTIONS } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
      { assetId: asset.assetId, userId: asset.userId },
      { $setOnInsert: asset },
      { upsert: true },
    );
    const stored = await this.findAsset(asset.assetId, asset.userId);
    if (
      !stored
      || stored.projectId !== asset.projectId
      || stored.libraryLicenseReceipt.providerTrackId
        !== asset.libraryLicenseReceipt.providerTrackId
      || stored.libraryLicenseReceipt.sourceObject.sha256
        !== asset.libraryLicenseReceipt.sourceObject.sha256
    ) {
      throw new MusicCatalogIngestError(
        'PERSISTENCE_FAILED',
        'The persisted catalog asset did not match the requested ingest',
        500,
      );
    }
    return stored;
  }

  async complete(lease: IngestLease, assetId: string, completedAt: Date): Promise<boolean> {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const result = await db.collection<IngestReservationDocument>(INGEST_COLLECTION).updateOne(
      {
        _id: lease.reservationId,
        status: 'pending',
        leaseToken: lease.leaseToken,
      },
      {
        $set: {
          status: 'complete',
          assetId,
          completedAt,
          updatedAt: completedAt,
        },
        $unset: { leaseToken: '', leaseUntil: '' },
      },
    );
    return result.matchedCount === 1;
  }

  async fail(lease: IngestLease, code: string, failedAt: Date): Promise<void> {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    await db.collection<IngestReservationDocument>(INGEST_COLLECTION).updateOne(
      {
        _id: lease.reservationId,
        status: 'pending',
        leaseToken: lease.leaseToken,
      },
      {
        $set: {
          status: 'failed',
          failureCode: code,
          failedAt,
          updatedAt: failedAt,
        },
        $unset: { leaseToken: '', leaseUntil: '' },
      },
    );
  }
}

function validateEntitlement(
  entitlement: MusicCatalogDownloadEntitlement,
  providerTrackId: string,
  now: Date,
): void {
  if (
    entitlement.provider !== 'epidemic-sound'
    || entitlement.providerTrackId !== providerTrackId
    || entitlement.format !== 'mp3'
    || entitlement.expiresAt.getTime() <= now.getTime() + 30_000
  ) {
    throw new MusicCatalogIngestError(
      'TRACK_NOT_ENTITLED',
      'The provider did not return a valid, current download entitlement',
      403,
    );
  }
  const url = new URL(entitlement.url);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new MusicCatalogIngestError(
      'TRACK_NOT_ENTITLED',
      'The provider returned an unsafe download entitlement',
      403,
    );
  }
}

function validateControlledUpload(
  upload: UploadResult,
  expectedAssetId: string,
  expectedSize: number,
): void {
  let publicUrl: URL;
  try {
    publicUrl = new URL(upload.signedUrl);
  } catch (error) {
    throw new MusicCatalogIngestError(
      'PERSISTENCE_FAILED',
      'Controlled storage returned an invalid asset URL',
      500,
      { cause: error },
    );
  }
  if (
    upload.assetId !== expectedAssetId
    || upload.size !== expectedSize
    || upload.contentType !== 'audio/mpeg'
    || (!upload.r2Key && !upload.gcsPath)
    || publicUrl.protocol !== 'https:'
    || Boolean(publicUrl.username)
    || Boolean(publicUrl.password)
  ) {
    throw new MusicCatalogIngestError(
      'PERSISTENCE_FAILED',
      'Controlled storage returned asset metadata that did not match the ingest',
      500,
    );
  }
}

async function downloadEntitledAudio(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { accept: 'audio/mpeg' },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new MusicCatalogIngestError(
        'DOWNLOAD_FAILED',
        'The entitled provider audio download failed',
        502,
      );
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(contentLength)
      && contentLength > MAX_AUDIO_CONDITIONING_INPUT_BYTES
    ) {
      throw new MusicCatalogIngestError(
        'INVALID_AUDIO',
        `The provider audio exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
        422,
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_AUDIO_CONDITIONING_INPUT_BYTES) {
        await reader.cancel('Audio download exceeded the ingest limit');
        throw new MusicCatalogIngestError(
          'INVALID_AUDIO',
          `The provider audio exceeds ${MAX_AUDIO_CONDITIONING_INPUT_BYTES} bytes`,
          422,
        );
      }
      chunks.push(value);
    }
    if (totalBytes === 0) {
      throw new MusicCatalogIngestError(
        'INVALID_AUDIO',
        'The provider returned an empty audio asset',
        422,
      );
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
  } catch (error) {
    if (error instanceof MusicCatalogIngestError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MusicCatalogIngestError(
        'DOWNLOAD_FAILED',
        'The entitled provider audio download timed out',
        504,
        { cause: error },
      );
    }
    throw new MusicCatalogIngestError(
      'DOWNLOAD_FAILED',
      'The entitled provider audio download failed',
      502,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildStoredAsset(input: {
  request: MusicCatalogIngestRequest;
  project: { orgId?: string | null };
  track: MusicCatalogTrack;
  agreementId: string;
  licenseId: string;
  entitlement: MusicCatalogDownloadEntitlement;
  acousticAnalysis: EncodedMusicInspection;
  contentSha256: string;
  ingestedAt: Date;
  upload: UploadResult;
}): StoredLibraryMusicAsset {
  const { request, track, entitlement, upload } = input;
  const musicRights: AudioRightsContract = {
    mediaRole: 'music',
    source: 'library',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'library-license',
      sourceAssetId: upload.assetId,
      licenseId: input.licenseId,
    },
  };
  return {
    assetId: upload.assetId,
    userId: request.userId,
    orgId: input.project.orgId ?? null,
    projectId: request.projectId,
    type: 'audio',
    filename: `${upload.assetId}.mp3`,
    source: 'library',
    gcsPath: upload.gcsPath,
    r2Key: upload.r2Key,
    publicUrl: upload.signedUrl,
    cachedUrl: upload.signedUrl,
    urlExpiresAt: upload.urlExpiresAt,
    size: upload.size,
    duration: input.acousticAnalysis.durationMs / 1000,
    uploadedAt: input.ingestedAt,
    lastUsedAt: input.ingestedAt,
    pinned: false,
    renderEligibility: 'requires-audio-assignment-conditioning',
    musicRights,
    libraryLicenseReceipt: {
      version: 'editron-library-license-receipt-v1',
      provider: 'epidemic-sound',
      providerTrackId: request.providerTrackId,
      licenseId: input.licenseId,
      agreement: {
        reference: input.agreementId,
        configuredBy: 'deployment-operator',
        authority: 'NEVER_AUTOMATED',
      },
      entitlement: {
        checkedAt: entitlement.entitlementCheckedAt,
        downloadExpiresAt: entitlement.expiresAt,
        format: entitlement.format,
        quality: entitlement.quality,
        providerTier: track.providerTier ?? 'unknown',
      },
      ownership: {
        userId: request.userId,
        projectId: request.projectId,
        orgId: input.project.orgId ?? null,
      },
      sourceObject: {
        sha256: input.contentSha256,
        size: upload.size,
        contentType: 'audio/mpeg',
      },
      acousticAnalysis: input.acousticAnalysis,
      ingestedAt: input.ingestedAt,
    },
    catalogMetadata: {
      provider: 'epidemic-sound',
      providerTrackId: request.providerTrackId,
      title: track.title,
      artists: track.artists,
      featuredArtists: track.featuredArtists,
      bpm: track.bpm,
      moods: track.moods,
      genres: track.genres,
      vocalType: track.vocalType,
      hasVocals: track.hasVocals,
      explicit: track.explicit,
      isrc: track.isrc,
    },
  };
}

async function recoverPersistedAsset(
  store: MusicCatalogIngestStore,
  expected: StoredLibraryMusicAsset,
): Promise<StoredLibraryMusicAsset | null> {
  const stored = await store.findAsset(expected.assetId, expected.userId);
  if (
    stored?.libraryLicenseReceipt.sourceObject.sha256
      === expected.libraryLicenseReceipt.sourceObject.sha256
    && stored.libraryLicenseReceipt.providerTrackId
      === expected.libraryLicenseReceipt.providerTrackId
  ) {
    return stored;
  }
  return null;
}

async function cleanupFailedUpload(
  dependencies: MusicCatalogIngestDependencies,
  upload: UploadResult,
  cause: unknown,
): Promise<void> {
  try {
    await dependencies.cleanupUpload(upload);
  } catch (cleanupError) {
    console.error('[MusicCatalogIngest] Controlled storage rollback failed', {
      assetId: upload.assetId,
      cause: errorMessage(cause),
      cleanupError: errorMessage(cleanupError),
    });
    throw new MusicCatalogIngestError(
      'PERSISTENCE_FAILED',
      'Catalog ingest failed and controlled storage rollback also failed',
      500,
      { cause: new AggregateError([cause, cleanupError]) },
    );
  }
}

function resultFromAsset(
  asset: StoredLibraryMusicAsset,
  idempotentReplay: boolean,
): MusicCatalogIngestResult {
  return {
    assetId: asset.assetId,
    provider: 'epidemic-sound',
    providerTrackId: asset.libraryLicenseReceipt.providerTrackId,
    title: asset.catalogMetadata.title,
    durationMs: asset.libraryLicenseReceipt.acousticAnalysis.durationMs,
    licenseId: asset.libraryLicenseReceipt.licenseId,
    rightsStatus: 'licensed',
    renderEligibility: 'requires-audio-assignment-conditioning',
    idempotentReplay,
  };
}

function buildAssetId(request: MusicCatalogIngestRequest, agreementId: string): string {
  return `music_lib_${stableHash([
    request.userId,
    request.projectId,
    request.provider,
    request.providerTrackId,
    agreementId,
  ]).slice(0, 32)}`;
}

function buildReservationId(request: MusicCatalogIngestRequest): string {
  return `music_ingest_${stableHash([
    request.userId,
    request.projectId,
    request.idempotencyKey,
  ]).slice(0, 40)}`;
}

function buildLicenseId(request: MusicCatalogIngestRequest, agreementId: string): string {
  return `${request.provider}:${stableHash([
    agreementId,
    request.userId,
    request.projectId,
    request.providerTrackId,
  ]).slice(0, 40)}`;
}

function stableHash(parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
