import type { MusicCatalogProviderName, MusicCatalogTrack } from '@/lib/editron/music-catalog/types';

import type { Overlay } from '../types';

export const MUSIC_RIGHTS_ATTESTATION_VERSION = 'music-rights-attestation-v1';

export type BackgroundMusicUsageMode = 'embedded' | 'reference-only';

const IDEMPOTENCY_FRAGMENT_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

export class BackgroundMusicAssignmentClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BackgroundMusicAssignmentClientError';
  }
}

export interface AssignBackgroundMusicAssetInput {
  projectId: string;
  assetId: string;
  idempotencyKey: string;
  usageMode?: BackgroundMusicUsageMode;
  rightsSource?: 'user-upload' | 'library';
  sourceMetadata?: BackgroundMusicSourceMetadata;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface BackgroundMusicSourceMetadata {
  identityId?: string;
  title?: string;
  artists?: string[];
  provider?: string;
  providerTrackId?: string;
  isrcs?: string[];
}

export interface AssignBackgroundMusicAssetResult {
  replayed: boolean;
  usageMode: BackgroundMusicUsageMode;
  sourceAssetId: string;
  derivativeAssetId: string;
  overlays: Overlay[];
  snappedCutCount: number;
}

export interface SearchMusicCatalogInput {
  mode: 'search' | 'recommend';
  projectId?: string;
  term?: string;
  limit?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface SearchMusicCatalogResult {
  provider: MusicCatalogProviderName;
  tracks: MusicCatalogTrack[];
  recommendation?: {
    providerTrackId: string | null;
    query: string;
    evidenceSources: string[];
    requiresExplicitUse: true;
  };
}

export interface IngestAndAssignMusicCatalogTrackInput {
  projectId: string;
  track: MusicCatalogTrack;
  idempotencyKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface IngestAndAssignMusicCatalogTrackResult {
  ingestedAssetId: string;
  licenseId: string;
  assignment: AssignBackgroundMusicAssetResult;
}

export function createBackgroundMusicIdempotencyKey(
  randomUUID?: () => string,
): string {
  const generator = randomUUID ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!generator) {
    throw new BackgroundMusicAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser cannot create safe background music requests',
    );
  }
  let fragment: string;
  try {
    fragment = generator().trim();
  } catch (error) {
    throw new BackgroundMusicAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser could not create a safe background music request',
      null,
      { cause: error },
    );
  }
  if (!IDEMPOTENCY_FRAGMENT_PATTERN.test(fragment)) {
    throw new BackgroundMusicAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser could not create a valid background music request identity',
    );
  }
  return `bgm_${fragment}`;
}

export function hasReferenceOnlyBackgroundMusic(overlays: readonly unknown[]): boolean {
  return overlays.some((overlay) => {
    const record = recordField(overlay);
    if (!record || record.type !== 'sound') return false;
    const rights = recordField(record.audioRights) ?? recordField(record.musicRights);
    const metadata = recordField(record.metadata);
    const assignment = recordField(metadata?.assignment);
    return (
      rights?.source === 'preview-only'
      && rights.userChoice === 'no-music'
      && rights.licensed === false
    ) || assignment?.usageMode === 'reference-only';
  });
}

export async function assignBackgroundMusicAsset({
  projectId,
  assetId,
  idempotencyKey,
  usageMode = 'embedded',
  rightsSource = 'user-upload',
  sourceMetadata,
  signal,
  fetchImpl = fetch,
}: AssignBackgroundMusicAssetInput): Promise<AssignBackgroundMusicAssetResult> {
  const normalizedProjectId = projectId.trim();
  const normalizedAssetId = assetId.trim();
  if (
    !normalizedProjectId
    || !normalizedAssetId
    || !idempotencyKey.trim()
    || (rightsSource !== 'user-upload' && rightsSource !== 'library')
    || (usageMode !== 'embedded' && usageMode !== 'reference-only')
    || (usageMode === 'reference-only' && rightsSource !== 'user-upload')
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_REQUEST',
      'Project, audio asset, and request identity are required',
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `/api/services/editron/projects/${encodeURIComponent(normalizedProjectId)}/background-music`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: normalizedAssetId,
          idempotencyKey,
          ...(usageMode === 'reference-only' ? { usageMode } : {}),
          ...(sourceMetadata ? { sourceMetadata } : {}),
          ...(rightsSource === 'user-upload' && usageMode === 'embedded'
            ? {
                rightsAttestation: {
                  accepted: true,
                  version: MUSIC_RIGHTS_ATTESTATION_VERSION,
                },
              }
            : {}),
        }),
        signal,
      },
    );
  } catch (error) {
    if (error instanceof BackgroundMusicAssignmentClientError) throw error;
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new BackgroundMusicAssignmentClientError(
      aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      aborted
        ? 'Background music assignment was interrupted'
        : 'Could not reach the background music service',
      null,
      { cause: error },
    );
  }

  const payload = await readJsonRecord(response);
  if (!response.ok || payload.success !== true) {
    throw new BackgroundMusicAssignmentClientError(
      stringField(payload.code) ?? `HTTP_${response.status}`,
      stringField(payload.error) ?? `Background music assignment failed (${response.status})`,
      response.status,
    );
  }
  if (
    !Array.isArray(payload.overlays)
    || !stringField(payload.sourceAssetId)
    || !stringField(payload.derivativeAssetId)
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_RESPONSE',
      'Background music service returned an incomplete committed timeline',
      response.status,
    );
  }
  const responseUsageMode = stringField(payload.usageMode) ?? usageMode;
  if (responseUsageMode !== usageMode) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_RESPONSE',
      'Background music service returned a different usage mode',
      response.status,
    );
  }

  return {
    replayed: payload.replayed === true,
    usageMode,
    sourceAssetId: payload.sourceAssetId as string,
    derivativeAssetId: payload.derivativeAssetId as string,
    overlays: payload.overlays as Overlay[],
    snappedCutCount: Number.isSafeInteger(payload.snappedCutCount)
      ? payload.snappedCutCount as number
      : 0,
  };
}

export async function searchMusicCatalog({
  mode,
  projectId,
  term,
  limit = 12,
  signal,
  fetchImpl = fetch,
}: SearchMusicCatalogInput): Promise<SearchMusicCatalogResult> {
  const normalizedProjectId = projectId?.trim();
  const normalizedTerm = term?.trim();
  if (
    (mode === 'recommend' && !normalizedProjectId)
    || (mode === 'search' && !normalizedTerm)
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 60
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_REQUEST',
      'Music search requires a valid mode, query, project, and result limit',
    );
  }

  const searchParams = new URLSearchParams({
    mode,
    limit: String(limit),
    ...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
    ...(normalizedTerm ? { q: normalizedTerm } : {}),
  });
  let response: Response;
  try {
    response = await fetchImpl(
      `/api/services/editron/music-catalog/search?${searchParams.toString()}`,
      { method: 'GET', signal },
    );
  } catch (error) {
    throw requestFailure(error, 'Music catalog search was interrupted', 'Could not reach the music catalog');
  }

  const payload = await readJsonRecord(response);
  if (!response.ok || payload.success !== true) {
    throw responseFailure(payload, response, 'Music catalog search failed');
  }
  const provider = stringField(payload.provider);
  if (
    (provider !== 'epidemic-sound' && provider !== 'soundstripe')
    || !Array.isArray(payload.tracks)
    || !payload.tracks.every(isMusicCatalogTrack)
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_RESPONSE',
      'Music catalog returned incomplete track metadata',
      response.status,
    );
  }

  const rawRecommendation = recordField(payload.recommendation);
  const recommendation = rawRecommendation
    && Array.isArray(rawRecommendation.evidenceSources)
    && rawRecommendation.evidenceSources.every((source) => typeof source === 'string')
    && typeof rawRecommendation.query === 'string'
    && rawRecommendation.requiresExplicitUse === true
    ? {
        providerTrackId: stringField(rawRecommendation.providerTrackId),
        query: rawRecommendation.query,
        evidenceSources: rawRecommendation.evidenceSources as string[],
        requiresExplicitUse: true as const,
      }
    : undefined;
  if (mode === 'recommend' && !recommendation) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_RESPONSE',
      'Music recommendation returned without its decision evidence',
      response.status,
    );
  }

  return {
    provider,
    tracks: payload.tracks as MusicCatalogTrack[],
    ...(recommendation ? { recommendation } : {}),
  };
}

export async function ingestAndAssignMusicCatalogTrack({
  projectId,
  track,
  idempotencyKey,
  signal,
  fetchImpl = fetch,
}: IngestAndAssignMusicCatalogTrackInput): Promise<IngestAndAssignMusicCatalogTrackResult> {
  const normalizedProjectId = projectId.trim();
  if (
    !normalizedProjectId
    || !track.providerTrackId.trim()
    || !idempotencyKey.trim()
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_REQUEST',
      'Project, catalog track, and request identity are required',
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `/api/services/editron/projects/${encodeURIComponent(normalizedProjectId)}/music-catalog/ingest`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: track.provider,
          providerTrackId: track.providerTrackId,
          idempotencyKey,
        }),
        signal,
      },
    );
  } catch (error) {
    throw requestFailure(error, 'Music catalog ingest was interrupted', 'Could not ingest the catalog track');
  }

  const payload = await readJsonRecord(response);
  if (!response.ok || payload.success !== true) {
    throw responseFailure(payload, response, 'Music catalog ingest failed');
  }
  const assetId = stringField(payload.assetId);
  const licenseId = stringField(payload.licenseId);
  if (
    !assetId
    || !licenseId
    || payload.providerTrackId !== track.providerTrackId
    || payload.rightsStatus !== 'licensed'
    || payload.renderEligibility !== 'requires-audio-assignment-conditioning'
  ) {
    throw new BackgroundMusicAssignmentClientError(
      'INVALID_RESPONSE',
      'Music catalog ingest did not return a render-safe licensed asset',
      response.status,
    );
  }

  const assignment = await assignBackgroundMusicAsset({
    projectId: normalizedProjectId,
    assetId,
    idempotencyKey,
    rightsSource: 'library',
    signal,
    fetchImpl,
  });
  return {
    ingestedAssetId: assetId,
    licenseId,
    assignment,
  };
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requestFailure(
  error: unknown,
  abortedMessage: string,
  networkMessage: string,
): BackgroundMusicAssignmentClientError {
  const aborted = error instanceof Error && error.name === 'AbortError';
  return new BackgroundMusicAssignmentClientError(
    aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
    aborted ? abortedMessage : networkMessage,
    null,
    { cause: error },
  );
}

function responseFailure(
  payload: Record<string, unknown>,
  response: Response,
  fallbackMessage: string,
): BackgroundMusicAssignmentClientError {
  return new BackgroundMusicAssignmentClientError(
    stringField(payload.code) ?? `HTTP_${response.status}`,
    stringField(payload.error) ?? `${fallbackMessage} (${response.status})`,
    response.status,
  );
}

function isMusicCatalogTrack(value: unknown): value is MusicCatalogTrack {
  const track = recordField(value);
  if (!track) return false;
  return (
    (track.provider === 'epidemic-sound' || track.provider === 'soundstripe')
    && Boolean(stringField(track.providerTrackId))
    && Boolean(stringField(track.title))
    && Array.isArray(track.artists)
    && track.artists.every((artist) => typeof artist === 'string')
    && Array.isArray(track.featuredArtists)
    && track.featuredArtists.every((artist) => typeof artist === 'string')
    && typeof track.durationMs === 'number'
    && Number.isFinite(track.durationMs)
    && Array.isArray(track.moods)
    && track.moods.every(isMusicCatalogTag)
    && Array.isArray(track.genres)
    && track.genres.every(isMusicCatalogTag)
    && (track.catalogAvailability === 'preview-only' || track.catalogAvailability === 'download-candidate')
    && track.rightsStatus === 'unverified'
    && track.renderEligibility === 'requires-entitlement-and-ingest'
  );
}

function isMusicCatalogTag(value: unknown): boolean {
  const tag = recordField(value);
  return Boolean(tag && stringField(tag.id) && stringField(tag.name));
}
