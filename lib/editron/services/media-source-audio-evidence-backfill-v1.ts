import { deepFreezeEditronJsonV1 } from './canonical-json-v1';
import type { MediaSourceAudioArtifactAssetStateInputV1 }
  from './media-source-audio-artifact-asset-owner-v1';
import {
  captureMediaSourceAudioAvailabilityEvidenceV1,
  mediaSourceAudioAvailabilityAssetViewV1,
  retainMediaSourceAudioAvailabilityEvidenceV1,
  type MediaSourceAudioAvailabilityEvidenceStorePortsV1,
  type MediaSourceAudioAvailabilityRetentionResultV1,
} from './media-source-audio-availability-evidence-v1';
import {
  captureMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceStorePortsV1,
} from './media-source-version-evidence-owner-v1';
import {
  retainMediaSourceVersionEvidenceV1,
  type MediaSourceVersionEvidenceRetentionResultV1,
} from './media-source-version-evidence-retention-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export type MediaSourceAudioEvidenceBackfillPortsV1 = Readonly<{
  availabilityEvidenceStorePorts:
    MediaSourceAudioAvailabilityEvidenceStorePortsV1;
  legacyEvidenceStorePorts: MediaSourceVersionEvidenceStorePortsV1;
}>;

export type MediaSourceAudioEvidenceBackfillResultV1 = Readonly<
  | {
      disposition: 'BACKFILLED';
      sourceVersionSha256: string;
      audioDisposition: 'NO_AUDIO_STREAMS_OBSERVED' | 'DECODED_ARTIFACT_SET';
      availabilityWriteDisposition: 'APPLIED' | 'UNCHANGED';
      availabilityEvidenceSha256: string;
      legacyWriteDisposition: 'NOT_REQUIRED' | 'APPLIED' | 'UNCHANGED';
      legacyEvidenceSha256: string | null;
    }
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'IMAGE_SOURCE' | 'AUDIO_TERMINAL_STATE_ABSENT';
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'SOURCE_STATE_INVALID'
        | 'CANONICAL_CANDIDATE_INVALID'
        | 'CANONICAL_CURRENT_STATE_INVALID'
        | 'CANONICAL_CONFLICT'
        | 'CANONICAL_RACE_EXHAUSTED'
        | 'CANONICAL_STORE_LOAD_FAILED'
        | 'CANONICAL_STORE_CAS_FAILED'
        | 'LEGACY_CANDIDATE_INVALID'
        | 'LEGACY_CURRENT_STATE_INVALID'
        | 'LEGACY_CONFLICT'
        | 'LEGACY_RACE_EXHAUSTED'
        | 'LEGACY_STORE_LOAD_FAILED'
        | 'LEGACY_STORE_CAS_FAILED';
      retryable: boolean;
    }
>;

/**
 * Backfills one exact active source version. Canonical availability is always
 * retained first; decoded sets then retain the legacy compatibility root.
 * The active MEDIA_ASSETS record is never mutated and media is never decoded.
 */
export async function backfillMediaSourceAudioEvidenceV1(
  asset: MediaSourceAudioArtifactAssetStateInputV1,
  ports: MediaSourceAudioEvidenceBackfillPortsV1,
): Promise<MediaSourceAudioEvidenceBackfillResultV1> {
  assertPorts(ports);
  let sourceVersion: ReturnType<typeof assertMediaSourceVersionV1>;
  try {
    sourceVersion = assertMediaSourceVersionV1(asset?.sourceVersionV1);
  } catch {
    return unverifiable('SOURCE_STATE_INVALID', false);
  }
  if (sourceVersion.mediaKind === 'image') {
    return frozen({
      disposition: 'NOT_APPLICABLE' as const,
      reason: 'IMAGE_SOURCE' as const,
    });
  }

  let canonicalCandidate;
  try {
    canonicalCandidate = captureMediaSourceAudioAvailabilityEvidenceV1(asset);
  } catch (error) {
    const code = diagnostic(error);
    if (code === 'MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_SET_MISSING'
      || code === 'MEDIA_SOURCE_AUDIO_AVAILABILITY_ARTIFACT_SET_INCOMPLETE') {
      return frozen({
        disposition: 'NOT_APPLICABLE' as const,
        reason: 'AUDIO_TERMINAL_STATE_ABSENT' as const,
      });
    }
    return unverifiable('SOURCE_STATE_INVALID', false);
  }

  const canonical = await retainMediaSourceAudioAvailabilityEvidenceV1(
    canonicalCandidate,
    ports.availabilityEvidenceStorePorts,
  );
  if (canonical.disposition === 'REJECTED') {
    return unverifiable(
      canonicalFailureReason(canonical.reason),
      canonical.retryable,
    );
  }
  if (canonical.record.availability.disposition
    === 'NO_AUDIO_STREAMS_OBSERVED') {
    return frozen({
      disposition: 'BACKFILLED',
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
      audioDisposition: 'NO_AUDIO_STREAMS_OBSERVED',
      availabilityWriteDisposition: canonical.writeDisposition,
      availabilityEvidenceSha256: canonical.record.evidenceSha256,
      legacyWriteDisposition: 'NOT_REQUIRED',
      legacyEvidenceSha256: null,
    });
  }

  let legacyCandidate;
  try {
    legacyCandidate = captureMediaSourceVersionEvidenceV1(
      mediaSourceAudioAvailabilityAssetViewV1(canonical.record),
    );
  } catch {
    return unverifiable('LEGACY_CANDIDATE_INVALID', false);
  }
  const legacy = await retainMediaSourceVersionEvidenceV1(
    legacyCandidate,
    ports.legacyEvidenceStorePorts,
  );
  if (legacy.disposition === 'REJECTED') {
    return unverifiable(
      legacyFailureReason(legacy.reason),
      legacy.retryable,
    );
  }
  return frozen({
    disposition: 'BACKFILLED',
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    audioDisposition: 'DECODED_ARTIFACT_SET',
    availabilityWriteDisposition: canonical.writeDisposition,
    availabilityEvidenceSha256: canonical.record.evidenceSha256,
    legacyWriteDisposition: legacy.writeDisposition,
    legacyEvidenceSha256: legacy.record.evidenceSha256,
  });
}

function canonicalFailureReason(
  reason: Extract<
    MediaSourceAudioAvailabilityRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
): Extract<
  MediaSourceAudioEvidenceBackfillResultV1,
  { disposition: 'UNVERIFIABLE' }
>['reason'] {
  switch (reason) {
    case 'CANDIDATE_INVALID': return 'CANONICAL_CANDIDATE_INVALID';
    case 'CURRENT_STATE_INVALID': return 'CANONICAL_CURRENT_STATE_INVALID';
    case 'CONFLICTING_EVIDENCE': return 'CANONICAL_CONFLICT';
    case 'RACE_EXHAUSTED': return 'CANONICAL_RACE_EXHAUSTED';
    case 'STORE_LOAD_FAILED': return 'CANONICAL_STORE_LOAD_FAILED';
    case 'STORE_CAS_FAILED': return 'CANONICAL_STORE_CAS_FAILED';
  }
}

function legacyFailureReason(
  reason: Extract<
    MediaSourceVersionEvidenceRetentionResultV1,
    { disposition: 'REJECTED' }
  >['reason'],
): Extract<
  MediaSourceAudioEvidenceBackfillResultV1,
  { disposition: 'UNVERIFIABLE' }
>['reason'] {
  switch (reason) {
    case 'CANDIDATE_INVALID': return 'LEGACY_CANDIDATE_INVALID';
    case 'CURRENT_STATE_INVALID': return 'LEGACY_CURRENT_STATE_INVALID';
    case 'CONFLICTING_EVIDENCE': return 'LEGACY_CONFLICT';
    case 'RACE_EXHAUSTED': return 'LEGACY_RACE_EXHAUSTED';
    case 'STORE_LOAD_FAILED': return 'LEGACY_STORE_LOAD_FAILED';
    case 'STORE_CAS_FAILED': return 'LEGACY_STORE_CAS_FAILED';
  }
}

function assertPorts(ports: MediaSourceAudioEvidenceBackfillPortsV1): void {
  if (!ports?.availabilityEvidenceStorePorts
    || typeof ports.availabilityEvidenceStorePorts.load !== 'function'
    || typeof ports.availabilityEvidenceStorePorts.compareAndSet !== 'function'
    || !ports.legacyEvidenceStorePorts
    || typeof ports.legacyEvidenceStorePorts.load !== 'function'
    || typeof ports.legacyEvidenceStorePorts.compareAndSet !== 'function') {
    throw new Error('MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_PORTS_INVALID');
  }
}

function diagnostic(error: unknown): string | null {
  return error instanceof Error && /^[A-Z0-9_]{1,200}$/.test(error.message)
    ? error.message
    : null;
}

function unverifiable(
  reason: Extract<
    MediaSourceAudioEvidenceBackfillResultV1,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
  retryable: boolean,
): MediaSourceAudioEvidenceBackfillResultV1 {
  return frozen({ disposition: 'UNVERIFIABLE', reason, retryable });
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
