import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  getAudioRightsContractIssue,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';

type UnknownRecord = Record<string, unknown>;

export interface NativeVideoAudioRightsAttestation {
  accepted: true;
  version: typeof AUDIO_RIGHTS_ATTESTATION_VERSION;
}

export const CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION:
NativeVideoAudioRightsAttestation = Object.freeze({
  accepted: true,
  version: AUDIO_RIGHTS_ATTESTATION_VERSION,
});

export const SOURCE_MEDIA_RIGHTS_ATTESTATION_TEXT_V1 =
  'I own this media or have permission to use it in exported videos, including any embedded audio.' as const;

export interface BuildNativeVideoAudioRightsInput {
  sourceAssetId: string;
  userId: string;
  attestation: unknown;
  attestedAt?: Date;
}

export class NativeVideoAudioRightsError extends Error {
  readonly code = 'NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'NativeVideoAudioRightsError';
  }
}

export function buildNativeVideoAudioRights(
  input: BuildNativeVideoAudioRightsInput,
): AudioRightsContract {
  const sourceAssetId = nonEmptyString(input.sourceAssetId);
  const userId = nonEmptyString(input.userId);
  const attestation = asRecord(input.attestation);
  const attestedAt = input.attestedAt ?? new Date();

  if (!sourceAssetId || !userId) {
    throw new NativeVideoAudioRightsError(
      'Native-video audio rights require an owned source asset',
    );
  }
  if (
    attestation?.accepted !== true
    || attestation.version !== AUDIO_RIGHTS_ATTESTATION_VERSION
  ) {
    throw new NativeVideoAudioRightsError(
      'Confirm that you own or have permission to use the uploaded media, including its embedded audio',
    );
  }
  if (!Number.isFinite(attestedAt.getTime())) {
    throw new NativeVideoAudioRightsError(
      'Native-video audio rights require a valid server attestation time',
    );
  }

  return {
    mediaRole: 'native-video',
    source: 'user-upload',
    userChoice: 'attested',
    licensed: true,
    evidence: {
      kind: 'user-attestation',
      sourceAssetId,
      attestationVersion: AUDIO_RIGHTS_ATTESTATION_VERSION,
      attestedAt: attestedAt.toISOString(),
      attestedBy: userId,
    },
  };
}

export function readStoredNativeVideoAudioRights(
  asset: unknown,
): AudioRightsContract | null {
  const record = asRecord(asset);
  const assetId = nonEmptyString(record?.assetId);

  if (
    !record
    || record.type !== 'video'
    || record.source !== 'user-upload'
    || !assetId
  ) {
    return null;
  }

  const rights = readNativeVideoAudioRightsClaim(record, assetId);
  return rights?.source === 'user-upload' ? rights : null;
}

export function readNativeVideoAudioRightsClaim(
  value: unknown,
  expectedAssetId?: string,
): AudioRightsContract | null {
  const record = asRecord(value);
  const assetId = nonEmptyString(expectedAssetId) ?? nonEmptyString(record?.assetId);
  const rights = asRecord(record?.audioRights);
  const evidence = asRecord(rights?.evidence);

  if (
    !record
    || !assetId
    || rights?.mediaRole !== 'native-video'
    || rights.licensed !== true
    || evidence?.sourceAssetId !== assetId
    || getAudioRightsContractIssue(rights) !== null
  ) {
    return null;
  }

  return rights as unknown as AudioRightsContract;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
