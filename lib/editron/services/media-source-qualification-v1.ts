import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type {
  MediaSourceProbeResultV1,
  MediaSourceTechnicalObservationV1,
} from './media-source-probe-v1';

/**
 * Embedded lifecycle for one measured source technical observation.
 *
 * It belongs inside the existing MEDIA_ASSETS record. It is intentionally not
 * a second media registry, canonical source identity, proxy map, or project
 * receipt. A MEASURED_TECHNICAL result remains ineligible for precise timeline
 * and conform operations until later byte/PTS/proxy phases finish.
 */
export const MEDIA_SOURCE_QUALIFICATION_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const;

export type MediaSourceStorageLocatorV1 = {
  provider: 'R2' | 'GCS';
  objectKey: string;
};

export type MediaSourceQualificationStatusV1 =
  | 'PENDING'
  | 'PROBING'
  | 'MEASURED_TECHNICAL'
  | 'UNVERIFIABLE';

export type MediaSourceQualificationRecordV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_QUALIFICATION_VERSION_V1;
  status: MediaSourceQualificationStatusV1;
  assetId: string;
  locator: MediaSourceStorageLocatorV1;
  sourceBindingSha256: string;
  requestId: string;
  attemptCount: number;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  observation: MediaSourceTechnicalObservationV1 | null;
  diagnostic: string | null;
};

export type MediaSourceQualificationAssetInputV1 = {
  assetId: string;
  source: 'user-upload' | 'public';
  r2Key?: string | null;
  gcsPath?: string | null;
};

export type MediaSourceQualificationCreationV1 =
  | { disposition: 'CREATED'; record: MediaSourceQualificationRecordV1 }
  | {
      disposition: 'UNAVAILABLE';
      record: null;
      diagnostic: 'MEDIA_SOURCE_NOT_USER_UPLOAD' | 'MEDIA_SOURCE_STORAGE_LOCATOR_MISSING';
    };

export type MediaSourceQualificationClaimV1 =
  | { disposition: 'CLAIMED'; record: MediaSourceQualificationRecordV1 }
  | {
      disposition: 'NOT_CLAIMED';
      reason: 'SOURCE_BINDING_MISMATCH' | 'ACTIVE_CLAIM' | 'TERMINAL';
      record: MediaSourceQualificationRecordV1;
    };

export type MediaSourceQualificationCompletionV1 =
  | { disposition: 'COMPLETED'; record: MediaSourceQualificationRecordV1 }
  | {
      disposition: 'REJECTED';
      reason: 'SOURCE_BINDING_MISMATCH' | 'CLAIM_NOT_ACTIVE';
      record: MediaSourceQualificationRecordV1;
    };

export const MEDIA_SOURCE_PROBE_CLAIM_STALE_MS_V1 = 15 * 60 * 1000;

/**
 * Creates a stable source-bound job for a newly registered user upload. The
 * object key must already be server-owned; client URLs and duration values are
 * intentionally excluded from the source binding.
 */
export function createMediaSourceQualificationV1(input: {
  asset: MediaSourceQualificationAssetInputV1;
  now: Date;
}): MediaSourceQualificationCreationV1 {
  if (input.asset.source !== 'user-upload') {
    return unavailable('MEDIA_SOURCE_NOT_USER_UPLOAD');
  }
  const locator = resolveMediaSourceStorageLocatorV1(input.asset);
  if (!locator) return unavailable('MEDIA_SOURCE_STORAGE_LOCATOR_MISSING');

  const sourceBindingSha256 = hashSourceBinding(input.asset.assetId, locator);
  const now = input.now.toISOString();
  return {
    disposition: 'CREATED',
    record: {
      schemaVersion: 1,
      kind: MEDIA_SOURCE_QUALIFICATION_VERSION_V1,
      status: 'PENDING',
      assetId: input.asset.assetId,
      locator,
      sourceBindingSha256,
      requestId: `media-source-probe:${sourceBindingSha256}`,
      attemptCount: 0,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
      observation: null,
      diagnostic: null,
    },
  };
}

/**
 * Claims a source-bound job exactly once, except that a failed worker lease
 * becomes retryable after the bounded stale period. A different object binding
 * can never reuse this claim.
 */
export function claimMediaSourceQualificationV1(input: {
  record: MediaSourceQualificationRecordV1;
  sourceBindingSha256: string;
  now: Date;
  staleAfterMs?: number;
}): MediaSourceQualificationClaimV1 {
  const { record } = input;
  if (record.sourceBindingSha256 !== input.sourceBindingSha256) {
    return { disposition: 'NOT_CLAIMED', reason: 'SOURCE_BINDING_MISMATCH', record };
  }
  const claimable = record.status === 'PENDING'
    || (record.status === 'PROBING' && isStale(record.startedAt, input.now, input.staleAfterMs));
  if (!claimable) {
    return {
      disposition: 'NOT_CLAIMED',
      reason: record.status === 'PROBING' ? 'ACTIVE_CLAIM' : 'TERMINAL',
      record,
    };
  }

  return {
    disposition: 'CLAIMED',
    record: {
      ...record,
      status: 'PROBING',
      attemptCount: record.attemptCount + 1,
      startedAt: input.now.toISOString(),
      completedAt: null,
      observation: null,
      diagnostic: null,
    },
  };
}

/**
 * Accepts a probe result only for the exact source binding that owns the live
 * claim. A measured technical report is deliberately not promoted to canonical
 * source qualification here.
 */
export function completeMediaSourceQualificationV1(input: {
  record: MediaSourceQualificationRecordV1;
  sourceBindingSha256: string;
  result: MediaSourceProbeResultV1;
  now: Date;
}): MediaSourceQualificationCompletionV1 {
  const { record } = input;
  if (record.sourceBindingSha256 !== input.sourceBindingSha256) {
    return { disposition: 'REJECTED', reason: 'SOURCE_BINDING_MISMATCH', record };
  }
  if (record.status !== 'PROBING') {
    return { disposition: 'REJECTED', reason: 'CLAIM_NOT_ACTIVE', record };
  }

  const completedAt = input.now.toISOString();
  const next: MediaSourceQualificationRecordV1 = input.result.disposition === 'MEASURED'
    ? {
        ...record,
        status: 'MEASURED_TECHNICAL',
        completedAt,
        observation: input.result.observation,
        diagnostic: null,
      }
    : {
        ...record,
        status: 'UNVERIFIABLE',
        completedAt,
        observation: null,
        diagnostic: input.result.diagnostics[0],
      };

  return { disposition: 'COMPLETED', record: next };
}

/** R2 is the primary browser copy when present. Mirror equality is not assumed. */
export function resolveMediaSourceStorageLocatorV1(
  asset: MediaSourceQualificationAssetInputV1,
): MediaSourceStorageLocatorV1 | null {
  const r2Key = cleanIdentifier(asset.r2Key);
  if (r2Key) return { provider: 'R2', objectKey: r2Key };
  const gcsPath = cleanIdentifier(asset.gcsPath);
  if (gcsPath) return { provider: 'GCS', objectKey: gcsPath };
  return null;
}

function hashSourceBinding(assetId: string, locator: MediaSourceStorageLocatorV1): string {
  return hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_QUALIFICATION_VERSION_V1,
    assetId,
    locator,
  });
}

function unavailable(
  diagnostic: Extract<MediaSourceQualificationCreationV1, { disposition: 'UNAVAILABLE' }>['diagnostic'],
): MediaSourceQualificationCreationV1 {
  return { disposition: 'UNAVAILABLE', record: null, diagnostic };
}

function isStale(startedAt: string | null, now: Date, staleAfterMs = MEDIA_SOURCE_PROBE_CLAIM_STALE_MS_V1): boolean {
  if (!startedAt) return true;
  const started = Date.parse(startedAt);
  return !Number.isFinite(started) || started <= now.getTime() - staleAfterMs;
}

function cleanIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 512) : null;
}
