import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

const ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2 =
  'EDITRON_ASSET_TRANSCRIPTION_SOURCE_BINDING_V2' as const;
const ASSET_TRANSCRIPTION_CONTRACT_V2 =
  'EDITRON_ASSET_TRANSCRIPTION_V2' as const;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type AssetTranscriptionSourceRoleV2 =
  | 'DIRECT'
  | 'PROXY'
  | 'MASTER';
export type AssetTranscriptionPrecisionV2 =
  | 'TEXT_ALLOWED'
  | 'MEASURED_WORD_REQUIRED';

export type AssetTranscriptionSourceReferenceV2 = Readonly<{
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: 'video' | 'audio';
  contentSha256: string;
  storageVersionSha256: string;
  sourceVersionSha256: string;
}>;

export type AssetTranscriptionSourceBindingV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2;
  userId: string;
  assetId: string;
  sourceRole: AssetTranscriptionSourceRoleV2;
  source: AssetTranscriptionSourceReferenceV2;
  requestedLanguage: string | null;
  precision: AssetTranscriptionPrecisionV2;
  transcriberContract: typeof ASSET_TRANSCRIPTION_CONTRACT_V2;
  bindingSha256: string;
}>;

type AssetTranscriptionSourceBindingMaterialV2 = Readonly<
  Omit<AssetTranscriptionSourceBindingV2, 'bindingSha256'>
>;

export function createAssetTranscriptionSourceBindingV2(input: Readonly<{
  userId: string;
  assetId: string;
  sourceRole: AssetTranscriptionSourceRoleV2;
  sourceVersion: MediaSourceVersionV1;
  requestedLanguage?: string | null;
  precision: AssetTranscriptionPrecisionV2;
}>): AssetTranscriptionSourceBindingV2 {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  if (sourceVersion.assetId !== input.assetId
    || (sourceVersion.mediaKind !== 'video'
      && sourceVersion.mediaKind !== 'audio')) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_SOURCE_SCOPE_MISMATCH');
  }
  const material = normalizeBindingMaterial({
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2,
    userId: input.userId,
    assetId: input.assetId,
    sourceRole: input.sourceRole,
    source: {
      owner: sourceVersion.owner,
      assetId: sourceVersion.assetId,
      mediaKind: sourceVersion.mediaKind,
      contentSha256: sourceVersion.contentSha256,
      storageVersionSha256:
        sourceVersion.storageVersion.storageVersionSha256,
      sourceVersionSha256: sourceVersion.sourceVersionSha256,
    },
    requestedLanguage: input.requestedLanguage ?? null,
    precision: input.precision,
    transcriberContract: ASSET_TRANSCRIPTION_CONTRACT_V2,
  });
  return assertAssetTranscriptionSourceBindingV2({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertAssetTranscriptionSourceBindingV2(
  value: unknown,
): AssetTranscriptionSourceBindingV2 {
  const record = plainObject(
    value,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'userId', 'assetId', 'sourceRole', 'source',
    'requestedLanguage', 'precision', 'transcriberContract', 'bindingSha256',
  ], 'ASSET_TRANSCRIPTION_SOURCE_BINDING_FIELDS_INVALID');
  const material = normalizeBindingMaterial(record);
  const bindingSha256 = sha256(
    record.bindingSha256,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_HASH_INVALID',
  );
  if (bindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_HASH_MISMATCH');
  }
  return frozen({ ...material, bindingSha256 });
}

function normalizeBindingMaterial(
  value: Readonly<Record<string, unknown>>,
): AssetTranscriptionSourceBindingMaterialV2 {
  if (value.schemaVersion !== 2
    || value.kind !== ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2
    || value.transcriberContract !== ASSET_TRANSCRIPTION_CONTRACT_V2) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_CONTRACT_INVALID');
  }
  const sourceRole = value.sourceRole;
  if (sourceRole !== 'DIRECT'
    && sourceRole !== 'PROXY'
    && sourceRole !== 'MASTER') {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_ROLE_INVALID');
  }
  const precision = value.precision;
  if (precision !== 'TEXT_ALLOWED'
    && precision !== 'MEASURED_WORD_REQUIRED') {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_PRECISION_INVALID');
  }
  const assetId = identifier(
    value.assetId,
    'ASSET_TRANSCRIPTION_SOURCE_BINDING_ASSET_INVALID',
  );
  const source = normalizeSourceReference(value.source);
  if (source.assetId !== assetId) {
    fail('ASSET_TRANSCRIPTION_SOURCE_BINDING_SOURCE_SCOPE_MISMATCH');
  }
  return frozen({
    schemaVersion: 2,
    kind: ASSET_TRANSCRIPTION_SOURCE_BINDING_KIND_V2,
    userId: identifier(
      value.userId,
      'ASSET_TRANSCRIPTION_SOURCE_BINDING_USER_INVALID',
    ),
    assetId,
    sourceRole,
    source,
    requestedLanguage: language(value.requestedLanguage),
    precision,
    transcriberContract: ASSET_TRANSCRIPTION_CONTRACT_V2,
  });
}

function normalizeSourceReference(
  value: unknown,
): AssetTranscriptionSourceReferenceV2 {
  const source = plainObject(
    value,
    'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_INVALID',
  );
  exactKeys(source, [
    'owner', 'assetId', 'mediaKind', 'contentSha256',
    'storageVersionSha256', 'sourceVersionSha256',
  ], 'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_FIELDS_INVALID');
  const mediaKind = source.mediaKind;
  if (mediaKind !== 'video' && mediaKind !== 'audio') {
    fail('ASSET_TRANSCRIPTION_SOURCE_REFERENCE_MEDIA_KIND_INVALID');
  }
  return frozen({
    owner: normalizeOwner(source.owner),
    assetId: identifier(
      source.assetId,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_ASSET_INVALID',
    ),
    mediaKind,
    contentSha256: sha256(
      source.contentSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_CONTENT_HASH_INVALID',
    ),
    storageVersionSha256: sha256(
      source.storageVersionSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_STORAGE_HASH_INVALID',
    ),
    sourceVersionSha256: sha256(
      source.sourceVersionSha256,
      'ASSET_TRANSCRIPTION_SOURCE_REFERENCE_SOURCE_HASH_INVALID',
    ),
  });
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const owner = plainObject(value, 'ASSET_TRANSCRIPTION_SOURCE_OWNER_INVALID');
  if (owner.kind === 'USER') {
    exactKeys(owner, ['kind', 'userId'], 'ASSET_TRANSCRIPTION_SOURCE_OWNER_FIELDS_INVALID');
    return frozen({
      kind: 'USER' as const,
      userId: identifier(
        owner.userId,
        'ASSET_TRANSCRIPTION_SOURCE_OWNER_USER_INVALID',
      ),
    });
  }
  if (owner.kind === 'ORG') {
    exactKeys(owner, ['kind', 'orgId'], 'ASSET_TRANSCRIPTION_SOURCE_OWNER_FIELDS_INVALID');
    return frozen({
      kind: 'ORG' as const,
      orgId: identifier(
        owner.orgId,
        'ASSET_TRANSCRIPTION_SOURCE_OWNER_ORG_INVALID',
      ),
    });
  }
  fail('ASSET_TRANSCRIPTION_SOURCE_OWNER_KIND_INVALID');
}

function language(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return boundedText(value, 64, 'ASSET_TRANSCRIPTION_REQUEST_LANGUAGE_INVALID');
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > maximum) {
    fail(code);
  }
  return value.normalize('NFC');
}

function identifier(value: unknown, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!IDENTITY.test(normalized)) fail(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
  return value;
}

function plainObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length
    || actual.some((key, index) => key !== required[index])) {
    fail(code);
  }
}

function frozen<T>(value: T): T {
  return deepFreezeEditronJsonV1(value) as T;
}

function fail(code: string): never {
  throw new Error(code);
}
