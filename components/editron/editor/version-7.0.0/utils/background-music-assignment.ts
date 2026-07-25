import type { Overlay } from '../types';

export const MUSIC_RIGHTS_ATTESTATION_VERSION = 'music-rights-attestation-v1';

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
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface AssignBackgroundMusicAssetResult {
  replayed: boolean;
  sourceAssetId: string;
  derivativeAssetId: string;
  overlays: Overlay[];
  snappedCutCount: number;
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

export async function assignBackgroundMusicAsset({
  projectId,
  assetId,
  idempotencyKey,
  signal,
  fetchImpl = fetch,
}: AssignBackgroundMusicAssetInput): Promise<AssignBackgroundMusicAssetResult> {
  const normalizedProjectId = projectId.trim();
  const normalizedAssetId = assetId.trim();
  if (!normalizedProjectId || !normalizedAssetId || !idempotencyKey.trim()) {
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
          rightsAttestation: {
            accepted: true,
            version: MUSIC_RIGHTS_ATTESTATION_VERSION,
          },
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

  return {
    replayed: payload.replayed === true,
    sourceAssetId: payload.sourceAssetId as string,
    derivativeAssetId: payload.derivativeAssetId as string,
    overlays: payload.overlays as Overlay[],
    snappedCutCount: Number.isSafeInteger(payload.snappedCutCount)
      ? payload.snappedCutCount as number
      : 0,
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
