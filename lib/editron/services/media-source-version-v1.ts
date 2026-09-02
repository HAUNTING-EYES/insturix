import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  createMediaSourceStorageVersionV1,
  MEDIA_SOURCE_STORAGE_VERSION_KIND_V1,
  type MediaSourceStorageVersionV1,
} from './media-source-storage-version-v1';

/**
 * Immutable byte identity for one version of an existing MediaAsset.
 *
 * This value has no persistence or mutation authority. A future MediaAsset
 * owner must issue it only after a server-side byte hash completes against one
 * unchanged provider object. It deliberately cannot turn an URL or an ETag
 * into a byte identity by itself.
 */
export const MEDIA_SOURCE_VERSION_KIND_V1 = 'EDITRON_MEDIA_SOURCE_VERSION_V1' as const;
export const MEDIA_PROXY_MASTER_RELATION_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_RELATION_V1' as const;
export const MEDIA_SOURCE_INVALIDATION_PLAN_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_INVALIDATION_PLAN_V1' as const;

export type MediaSourceOwnerV1 =
  | { kind: 'USER'; userId: string }
  | { kind: 'ORG'; orgId: string };

export type MediaSourceVersionV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_VERSION_KIND_V1;
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: 'video' | 'audio' | 'image';
  byteLength: number;
  /** SHA-256 measured across the complete stored object, never browser-supplied metadata. */
  contentSha256: string;
  /** Provider observation that was stable for the complete byte-hash operation. */
  storageVersion: MediaSourceStorageVersionV1;
  sourceVersionSha256: string;
};

export type MediaProxyMasterRelationV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_RELATION_KIND_V1;
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
  proxy: MediaSourceVersionReferenceV1;
  master: MediaSourceVersionReferenceV1;
  /** No relation can be used for precise source-time work until this changes. */
  mapping: {
    disposition: 'UNQUALIFIED';
    diagnostic: 'SOURCE_PTS_MAPPING_REQUIRED';
  };
  relationSha256: string;
};

export type MediaSourceVersionReferenceV1 = {
  sourceVersionSha256: string;
  contentSha256: string;
  storageVersionSha256: string;
};

export type MediaSourceInvalidationTargetV1 =
  | 'TECHNICAL_OBSERVATION'
  | 'TRANSCRIPTION'
  | 'AUDIO_ANALYSIS'
  | 'VISUAL_ANALYSIS'
  | 'SEMANTIC_ANALYSIS'
  | 'PROXY_TIME_MAPPING'
  | 'RENDERED_PREVIEW'
  | 'DELIVERY_PROOF'
  | 'PROJECT_SOURCE_BINDING_REVALIDATION';

export type MediaSourceInvalidationPlanV1 =
  | {
      schemaVersion: 1;
      kind: typeof MEDIA_SOURCE_INVALIDATION_PLAN_KIND_V1;
      disposition: 'NO_CHANGE';
      owner: MediaSourceOwnerV1;
      assetId: string;
      mediaKind: MediaSourceVersionV1['mediaKind'];
      sourceVersionSha256: string;
      planSha256: string;
    }
  | {
      schemaVersion: 1;
      kind: typeof MEDIA_SOURCE_INVALIDATION_PLAN_KIND_V1;
      disposition: 'INVALIDATE_DERIVATIVES';
      reason: 'SOURCE_VERSION_REPLACED' | 'PROXY_MASTER_PROMOTED';
      owner: MediaSourceOwnerV1;
      assetId: string;
      mediaKind: MediaSourceVersionV1['mediaKind'];
      previousSourceVersionSha256: string;
      nextSourceVersionSha256: string;
      invalidates: readonly MediaSourceInvalidationTargetV1[];
      projectServiceReviewRequired: true;
      planSha256: string;
    };

export function createMediaSourceVersionV1(input: {
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
  byteLength: number;
  contentSha256: string;
  storageVersion: MediaSourceStorageVersionV1;
}): Readonly<MediaSourceVersionV1> {
  const owner = normalizeOwner(input.owner);
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_ASSET_ID_INVALID');
  const mediaKind = normalizeMediaKind(input.mediaKind);
  const byteLength = positiveSafeInteger(input.byteLength, 'MEDIA_SOURCE_BYTE_LENGTH_INVALID');
  const contentSha256 = sha256(input.contentSha256, 'MEDIA_SOURCE_CONTENT_SHA256_INVALID');
  const storageVersion = assertStorageVersion(input.storageVersion);
  if (storageVersion.byteLength !== byteLength) {
    throw new Error('MEDIA_SOURCE_STORAGE_BYTE_LENGTH_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_VERSION_KIND_V1,
    owner,
    assetId,
    mediaKind,
    byteLength,
    contentSha256,
    storageVersion,
  };
  return frozen({
    ...material,
    sourceVersionSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertMediaSourceVersionV1(value: unknown): Readonly<MediaSourceVersionV1> {
  const candidate = record(value, 'MEDIA_SOURCE_VERSION_INVALID');
  exactKeys(candidate, [
    'schemaVersion',
    'kind',
    'owner',
    'assetId',
    'mediaKind',
    'byteLength',
    'contentSha256',
    'storageVersion',
    'sourceVersionSha256',
  ], 'MEDIA_SOURCE_VERSION_FIELDS_INVALID');
  if (candidate.schemaVersion !== 1 || candidate.kind !== MEDIA_SOURCE_VERSION_KIND_V1) {
    throw new Error('MEDIA_SOURCE_VERSION_KIND_INVALID');
  }
  const rebuilt = createMediaSourceVersionV1({
    owner: normalizeOwner(candidate.owner),
    assetId: identifier(candidate.assetId, 'MEDIA_SOURCE_ASSET_ID_INVALID'),
    mediaKind: normalizeMediaKind(candidate.mediaKind),
    byteLength: positiveSafeInteger(candidate.byteLength, 'MEDIA_SOURCE_BYTE_LENGTH_INVALID'),
    contentSha256: sha256(candidate.contentSha256, 'MEDIA_SOURCE_CONTENT_SHA256_INVALID'),
    storageVersion: assertStorageVersion(candidate.storageVersion),
  });
  if (rebuilt.sourceVersionSha256 !== sha256(
    candidate.sourceVersionSha256,
    'MEDIA_SOURCE_VERSION_HASH_INVALID',
  )) {
    throw new Error('MEDIA_SOURCE_VERSION_HASH_MISMATCH');
  }
  return rebuilt;
}

export function createMediaProxyMasterRelationV1(input: {
  proxy: MediaSourceVersionV1;
  master: MediaSourceVersionV1;
}): Readonly<MediaProxyMasterRelationV1> {
  const proxy = assertMediaSourceVersionV1(input.proxy);
  const master = assertMediaSourceVersionV1(input.master);
  if (proxy.sourceVersionSha256 === master.sourceVersionSha256) {
    throw new Error('MEDIA_PROXY_MASTER_SAME_SOURCE_VERSION');
  }
  if (!sameOwner(proxy.owner, master.owner)
    || proxy.assetId !== master.assetId
    || proxy.mediaKind !== master.mediaKind) {
    throw new Error('MEDIA_PROXY_MASTER_SCOPE_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_RELATION_KIND_V1,
    owner: proxy.owner,
    assetId: proxy.assetId,
    mediaKind: proxy.mediaKind,
    proxy: sourceReference(proxy),
    master: sourceReference(master),
    mapping: {
      disposition: 'UNQUALIFIED' as const,
      diagnostic: 'SOURCE_PTS_MAPPING_REQUIRED' as const,
    },
  };
  return frozen({ ...material, relationSha256: hashEditronCanonicalJsonV1(material) });
}

/**
 * Produces invalidation intent only. The future MediaAsset owner clears its own
 * derived records, and ProjectService separately decides how project bindings
 * are rebased, blocked, or restored.
 */
export function createMediaSourceInvalidationPlanV1(input: {
  previous: MediaSourceVersionV1;
  next: MediaSourceVersionV1;
  proxyMasterRelation?: MediaProxyMasterRelationV1;
}): Readonly<MediaSourceInvalidationPlanV1> {
  const previous = assertMediaSourceVersionV1(input.previous);
  const next = assertMediaSourceVersionV1(input.next);
  if (!sameOwner(previous.owner, next.owner)
    || previous.assetId !== next.assetId
    || previous.mediaKind !== next.mediaKind) {
    throw new Error('MEDIA_SOURCE_REPLACEMENT_SCOPE_MISMATCH');
  }
  if (previous.sourceVersionSha256 === next.sourceVersionSha256) {
    const material = {
      schemaVersion: 1 as const,
      kind: MEDIA_SOURCE_INVALIDATION_PLAN_KIND_V1,
      disposition: 'NO_CHANGE' as const,
      owner: previous.owner,
      assetId: previous.assetId,
      mediaKind: previous.mediaKind,
      sourceVersionSha256: previous.sourceVersionSha256,
    };
    return frozen({ ...material, planSha256: hashEditronCanonicalJsonV1(material) });
  }

  const relation = input.proxyMasterRelation
    ? assertMediaProxyMasterRelationV1(input.proxyMasterRelation)
    : null;
  const isPromotion = relation !== null
    && relation.proxy.sourceVersionSha256 === previous.sourceVersionSha256
    && relation.master.sourceVersionSha256 === next.sourceVersionSha256;
  if (relation !== null && !isPromotion) {
    throw new Error('MEDIA_SOURCE_REPLACEMENT_RELATION_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_INVALIDATION_PLAN_KIND_V1,
    disposition: 'INVALIDATE_DERIVATIVES' as const,
    reason: isPromotion ? 'PROXY_MASTER_PROMOTED' as const : 'SOURCE_VERSION_REPLACED' as const,
    owner: previous.owner,
    assetId: previous.assetId,
    mediaKind: previous.mediaKind,
    previousSourceVersionSha256: previous.sourceVersionSha256,
    nextSourceVersionSha256: next.sourceVersionSha256,
    invalidates: [
      'TECHNICAL_OBSERVATION',
      'TRANSCRIPTION',
      'AUDIO_ANALYSIS',
      'VISUAL_ANALYSIS',
      'SEMANTIC_ANALYSIS',
      'PROXY_TIME_MAPPING',
      'RENDERED_PREVIEW',
      'DELIVERY_PROOF',
      'PROJECT_SOURCE_BINDING_REVALIDATION',
    ] as const,
    projectServiceReviewRequired: true as const,
  };
  return frozen({ ...material, planSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterRelationV1(
  value: unknown,
): Readonly<MediaProxyMasterRelationV1> {
  const candidate = record(value, 'MEDIA_PROXY_MASTER_RELATION_INVALID');
  exactKeys(candidate, [
    'schemaVersion',
    'kind',
    'owner',
    'assetId',
    'mediaKind',
    'proxy',
    'master',
    'mapping',
    'relationSha256',
  ], 'MEDIA_PROXY_MASTER_RELATION_FIELDS_INVALID');
  if (candidate.schemaVersion !== 1 || candidate.kind !== MEDIA_PROXY_MASTER_RELATION_KIND_V1) {
    throw new Error('MEDIA_PROXY_MASTER_RELATION_KIND_INVALID');
  }
  const owner = normalizeOwner(candidate.owner);
  const assetId = identifier(candidate.assetId, 'MEDIA_PROXY_MASTER_ASSET_ID_INVALID');
  const mediaKind = normalizeMediaKind(candidate.mediaKind);
  const proxy = normalizeSourceReference(candidate.proxy);
  const master = normalizeSourceReference(candidate.master);
  if (proxy.sourceVersionSha256 === master.sourceVersionSha256) {
    throw new Error('MEDIA_PROXY_MASTER_SAME_SOURCE_VERSION');
  }
  const mapping = record(candidate.mapping, 'MEDIA_PROXY_MASTER_MAPPING_INVALID');
  exactKeys(mapping, ['disposition', 'diagnostic'], 'MEDIA_PROXY_MASTER_MAPPING_FIELDS_INVALID');
  if (mapping.disposition !== 'UNQUALIFIED' || mapping.diagnostic !== 'SOURCE_PTS_MAPPING_REQUIRED') {
    throw new Error('MEDIA_PROXY_MASTER_MAPPING_INVALID');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_RELATION_KIND_V1,
    owner,
    assetId,
    mediaKind,
    proxy,
    master,
    mapping: {
      disposition: 'UNQUALIFIED' as const,
      diagnostic: 'SOURCE_PTS_MAPPING_REQUIRED' as const,
    },
  };
  const rebuilt = frozen({ ...material, relationSha256: hashEditronCanonicalJsonV1(material) });
  if (rebuilt.relationSha256 !== sha256(candidate.relationSha256, 'MEDIA_PROXY_MASTER_RELATION_HASH_INVALID')) {
    throw new Error('MEDIA_PROXY_MASTER_RELATION_HASH_MISMATCH');
  }
  return rebuilt;
}

function sourceReference(source: MediaSourceVersionV1): MediaSourceVersionReferenceV1 {
  return {
    sourceVersionSha256: source.sourceVersionSha256,
    contentSha256: source.contentSha256,
    storageVersionSha256: source.storageVersion.storageVersionSha256,
  };
}

function assertStorageVersion(value: unknown): MediaSourceStorageVersionV1 {
  const candidate = record(value, 'MEDIA_SOURCE_STORAGE_VERSION_INVALID');
  exactKeys(candidate, [
    'schemaVersion',
    'kind',
    'locator',
    'byteLength',
    'providerVersion',
    'storageVersionSha256',
  ], 'MEDIA_SOURCE_STORAGE_VERSION_FIELDS_INVALID');
  if (candidate.schemaVersion !== 1 || candidate.kind !== MEDIA_SOURCE_STORAGE_VERSION_KIND_V1) {
    throw new Error('MEDIA_SOURCE_STORAGE_VERSION_KIND_INVALID');
  }
  const locatorValue = record(candidate.locator, 'MEDIA_SOURCE_STORAGE_LOCATOR_INVALID');
  exactKeys(locatorValue, ['provider', 'objectKey'], 'MEDIA_SOURCE_STORAGE_LOCATOR_FIELDS_INVALID');
  const provider = locatorValue.provider;
  if (provider !== 'R2' && provider !== 'GCS') throw new Error('MEDIA_SOURCE_STORAGE_PROVIDER_INVALID');
  const providerVersionValue = record(
    candidate.providerVersion,
    'MEDIA_SOURCE_STORAGE_PROVIDER_VERSION_INVALID',
  );
  exactKeys(
    providerVersionValue,
    ['kind', 'value'],
    'MEDIA_SOURCE_STORAGE_PROVIDER_VERSION_FIELDS_INVALID',
  );
  const providerVersion = {
    kind: providerVersionValue.kind,
    value: providerVersionValue.value,
  } as MediaSourceStorageVersionV1['providerVersion'];
  const rebuilt = createMediaSourceStorageVersionV1({
    locator: {
      provider,
      objectKey: identifier(locatorValue.objectKey, 'MEDIA_SOURCE_STORAGE_OBJECT_KEY_INVALID'),
    },
    byteLength: positiveSafeInteger(candidate.byteLength, 'MEDIA_SOURCE_STORAGE_BYTE_LENGTH_INVALID'),
    providerVersion,
  });
  if (rebuilt.storageVersionSha256 !== sha256(
    candidate.storageVersionSha256,
    'MEDIA_SOURCE_STORAGE_VERSION_HASH_INVALID',
  )) {
    throw new Error('MEDIA_SOURCE_STORAGE_VERSION_HASH_MISMATCH');
  }
  return rebuilt;
}

function normalizeSourceReference(value: unknown): MediaSourceVersionReferenceV1 {
  const candidate = record(value, 'MEDIA_SOURCE_REFERENCE_INVALID');
  exactKeys(candidate, [
    'sourceVersionSha256',
    'contentSha256',
    'storageVersionSha256',
  ], 'MEDIA_SOURCE_REFERENCE_FIELDS_INVALID');
  return {
    sourceVersionSha256: sha256(candidate.sourceVersionSha256, 'MEDIA_SOURCE_REFERENCE_VERSION_INVALID'),
    contentSha256: sha256(candidate.contentSha256, 'MEDIA_SOURCE_REFERENCE_CONTENT_INVALID'),
    storageVersionSha256: sha256(candidate.storageVersionSha256, 'MEDIA_SOURCE_REFERENCE_STORAGE_INVALID'),
  };
}

function normalizeOwner(value: unknown): MediaSourceOwnerV1 {
  const candidate = record(value, 'MEDIA_SOURCE_OWNER_INVALID');
  if (candidate.kind === 'USER') {
    exactKeys(candidate, ['kind', 'userId'], 'MEDIA_SOURCE_OWNER_FIELDS_INVALID');
    return { kind: 'USER', userId: identifier(candidate.userId, 'MEDIA_SOURCE_OWNER_USER_INVALID') };
  }
  if (candidate.kind === 'ORG') {
    exactKeys(candidate, ['kind', 'orgId'], 'MEDIA_SOURCE_OWNER_FIELDS_INVALID');
    return { kind: 'ORG', orgId: identifier(candidate.orgId, 'MEDIA_SOURCE_OWNER_ORG_INVALID') };
  }
  throw new Error('MEDIA_SOURCE_OWNER_KIND_INVALID');
}

function normalizeMediaKind(value: unknown): MediaSourceVersionV1['mediaKind'] {
  if (value === 'video' || value === 'audio' || value === 'image') return value;
  throw new Error('MEDIA_SOURCE_MEDIA_KIND_INVALID');
}

function sameOwner(left: MediaSourceOwnerV1, right: MediaSourceOwnerV1): boolean {
  return left.kind === right.kind && (left.kind === 'USER'
    ? left.userId === (right as Extract<MediaSourceOwnerV1, { kind: 'USER' }>).userId
    : left.orgId === (right as Extract<MediaSourceOwnerV1, { kind: 'ORG' }>).orgId);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(code);
  }
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(code);
  return Number(value);
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value)) as Readonly<T>;
}
