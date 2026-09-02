import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  readMediaProxyMasterActiveMappingAssetStateV1,
  type MediaProxyMasterActiveMappingAssetInputV1,
  type MediaProxyMasterActiveMappingAssetStateV1,
} from './media-proxy-master-active-mapping-asset-owner-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const PROJECT_VIDEO_SOURCE_VERSION_PIN_KIND_V1 =
  'EDITRON_PROJECT_VIDEO_SOURCE_VERSION_PIN_V1' as const;
export const PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1 =
  'EDITRON_PROJECT_SERVICE_VIDEO_SOURCE_VERSION_PIN_OWNER_V1' as const;

export type ProjectVideoSourceVersionPinAuthorityV1 = Readonly<
  | {
      kind: 'PROJECT_PROXY_SOURCE_BINDING';
      bindingSha256: string;
      proxyTimeMapReferenceSha256: string;
    }
  | {
      kind: 'PROJECT_PROXY_MASTER_RELINK';
      relinkStateSha256: string;
      relationSha256: string;
      activeMappingStateSha256: string;
    }
>;

export type ProjectVideoSourceVersionPinV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof PROJECT_VIDEO_SOURCE_VERSION_PIN_KIND_V1;
  writerAuthority: typeof PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1;
  projectId: string;
  overlayId: number;
  assetId: string;
  sourceRole: 'PROXY' | 'MASTER';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  authority: ProjectVideoSourceVersionPinAuthorityV1;
  issuedAt: string;
  pinSha256: string;
}>;

type ProjectVideoSourceVersionPinMaterialV1 = Readonly<
Omit<ProjectVideoSourceVersionPinV1, 'pinSha256'>
>;

export type ProjectVideoSourceStorageAssetV1 = Readonly<
  MediaProxyMasterActiveMappingAssetInputV1 & {
    orgId?: unknown;
    r2Key?: unknown;
    originalR2Key?: unknown;
  }
>;

export type ProjectVideoSourceStorageResolutionV1 = Readonly<
  | {
      disposition: 'DIRECT_SOURCE';
      storageKey: string;
    }
  | {
      disposition: 'PINNED_PROXY_SOURCE' | 'PINNED_MASTER_SOURCE';
      storageKey: string;
      pin: ProjectVideoSourceVersionPinV1;
      activeMappingStateSha256: string | null;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'ASSET_SCOPE_INVALID'
        | 'STORAGE_KEY_INVALID'
        | 'DUAL_VERSION_SOURCE_PIN_REQUIRED'
        | 'SOURCE_PIN_INVALID'
        | 'SOURCE_PIN_SCOPE_MISMATCH'
        | 'SOURCE_PIN_AUTHORITY_MISMATCH'
        | 'SOURCE_VERSION_INVALID'
        | 'SOURCE_VERSION_MISMATCH'
        | 'SOURCE_STORAGE_MISMATCH'
        | 'ACTIVE_MAPPING_REQUIRED'
        | 'ACTIVE_MAPPING_INVALID'
        | 'ACTIVE_MAPPING_MISMATCH';
    }
>;

export function createProjectVideoSourceVersionPinV1(input: Readonly<{
  projectId: string;
  overlayId: number;
  assetId: string;
  sourceRole: 'PROXY' | 'MASTER';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  authority: ProjectVideoSourceVersionPinAuthorityV1;
  issuedAt: Date;
}>): ProjectVideoSourceVersionPinV1 {
  const material = normalizePinMaterial({
    schemaVersion: 1,
    kind: PROJECT_VIDEO_SOURCE_VERSION_PIN_KIND_V1,
    writerAuthority: PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1,
    projectId: input.projectId,
    overlayId: input.overlayId,
    assetId: input.assetId,
    sourceRole: input.sourceRole,
    sourceVersionSha256: input.sourceVersionSha256,
    storageVersionSha256: input.storageVersionSha256,
    authority: input.authority,
    issuedAt: isoDate(
      input.issuedAt,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_TIME_INVALID',
    ),
  });
  return assertProjectVideoSourceVersionPinV1({
    ...material,
    pinSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function assertProjectVideoSourceVersionPinV1(
  value: unknown,
): ProjectVideoSourceVersionPinV1 {
  const record = object(
    value,
    'PROJECT_VIDEO_SOURCE_VERSION_PIN_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'writerAuthority', 'projectId', 'overlayId',
    'assetId', 'sourceRole', 'sourceVersionSha256',
    'storageVersionSha256', 'authority', 'issuedAt', 'pinSha256',
  ], 'PROJECT_VIDEO_SOURCE_VERSION_PIN_FIELDS_INVALID');
  const material = normalizePinMaterial(record);
  const pinSha256 = sha256(
    record.pinSha256,
    'PROJECT_VIDEO_SOURCE_VERSION_PIN_HASH_INVALID',
  );
  if (pinSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('PROJECT_VIDEO_SOURCE_VERSION_PIN_HASH_MISMATCH');
  }
  return frozen({ ...material, pinSha256 });
}

export function resolveProjectVideoSourceStorageV1(input: Readonly<{
  projectId: string;
  overlayId: number;
  assetId: string;
  sourcePin?: unknown;
  asset: ProjectVideoSourceStorageAssetV1;
}>): ProjectVideoSourceStorageResolutionV1 {
  const projectId = optionalIdentifier(input.projectId);
  const assetId = optionalIdentifier(input.assetId);
  const overlayId = optionalOverlayId(input.overlayId);
  if (!projectId || !assetId || overlayId === null
    || input.asset.assetId !== assetId
    || input.asset.type !== 'video') {
    return unverifiable('ASSET_SCOPE_INVALID');
  }

  const proxyStorageKey = storageKey(input.asset.r2Key);
  const masterStorageKey = storageKey(input.asset.originalR2Key);
  const dualVersionEvidencePresent = masterStorageKey !== null
    || present(input.asset.proxySourceVersionV1)
    || present(input.asset.proxyMasterRelationV1)
    || present(input.asset.proxyMasterActiveMappingV1)
    || present(input.asset.proxyMasterActiveMappingStateSha256V1);

  if (!present(input.sourcePin)) {
    if (dualVersionEvidencePresent) {
      return unverifiable('DUAL_VERSION_SOURCE_PIN_REQUIRED');
    }
    return proxyStorageKey
      ? frozen({ disposition: 'DIRECT_SOURCE', storageKey: proxyStorageKey })
      : unverifiable('STORAGE_KEY_INVALID');
  }

  let pin: ProjectVideoSourceVersionPinV1;
  try {
    pin = assertProjectVideoSourceVersionPinV1(input.sourcePin);
  } catch {
    return unverifiable('SOURCE_PIN_INVALID');
  }
  if (pin.projectId !== projectId
    || pin.overlayId !== overlayId
    || pin.assetId !== assetId) {
    return unverifiable('SOURCE_PIN_SCOPE_MISMATCH');
  }

  const active = readActiveState(input.asset);
  if (active.disposition === 'INVALID') {
    return unverifiable('ACTIVE_MAPPING_INVALID');
  }

  if (pin.sourceRole === 'PROXY') {
    if (pin.authority.kind !== 'PROJECT_PROXY_SOURCE_BINDING') {
      return unverifiable('SOURCE_PIN_AUTHORITY_MISMATCH');
    }
    const proxySourceCandidate = input.asset.isProxy === true
      ? input.asset.sourceVersionV1
      : input.asset.proxySourceVersionV1;
    const source = readSource(proxySourceCandidate);
    if (!source) return unverifiable('SOURCE_VERSION_INVALID');
    const sourceCheck = validatePinnedSource({
      source,
      pin,
      asset: input.asset,
      assetId,
      storageKey: proxyStorageKey,
    });
    if (sourceCheck) return unverifiable(sourceCheck);
    if (active.state) {
      const mapping = active.state.proxyMasterActiveMappingV1.qualification;
      if (mapping.relation.proxy.sourceVersionSha256
          !== pin.sourceVersionSha256
        || hashEditronCanonicalJsonV1(mapping.mapping.proxyTimeMap)
          !== pin.authority.proxyTimeMapReferenceSha256) {
        return unverifiable('ACTIVE_MAPPING_MISMATCH');
      }
    }
    return frozen({
      disposition: 'PINNED_PROXY_SOURCE',
      storageKey: proxyStorageKey as string,
      pin,
      activeMappingStateSha256:
        active.state?.proxyMasterActiveMappingStateSha256V1 ?? null,
    });
  }

  if (pin.authority.kind !== 'PROJECT_PROXY_MASTER_RELINK') {
    return unverifiable('SOURCE_PIN_AUTHORITY_MISMATCH');
  }
  if (!active.state) return unverifiable('ACTIVE_MAPPING_REQUIRED');
  const activeMapping = active.state.proxyMasterActiveMappingV1;
  if (pin.authority.activeMappingStateSha256
      !== active.state.proxyMasterActiveMappingStateSha256V1
    || pin.authority.relationSha256 !== activeMapping.relationSha256
    || activeMapping.qualification.relation.master.sourceVersionSha256
      !== pin.sourceVersionSha256) {
    return unverifiable('ACTIVE_MAPPING_MISMATCH');
  }
  const masterSource = readSource(input.asset.sourceVersionV1);
  if (!masterSource) return unverifiable('SOURCE_VERSION_INVALID');
  const sourceCheck = validatePinnedSource({
    source: masterSource,
    pin,
    asset: input.asset,
    assetId,
    storageKey: masterStorageKey,
  });
  if (sourceCheck) return unverifiable(sourceCheck);
  return frozen({
    disposition: 'PINNED_MASTER_SOURCE',
    storageKey: masterStorageKey as string,
    pin,
    activeMappingStateSha256:
      active.state.proxyMasterActiveMappingStateSha256V1,
  });
}

function normalizePinMaterial(
  value: Record<string, unknown>,
): ProjectVideoSourceVersionPinMaterialV1 {
  if (value.schemaVersion !== 1
    || value.kind !== PROJECT_VIDEO_SOURCE_VERSION_PIN_KIND_V1
    || value.writerAuthority !== PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1) {
    fail('PROJECT_VIDEO_SOURCE_VERSION_PIN_IDENTITY_INVALID');
  }
  const sourceRole = value.sourceRole;
  if (sourceRole !== 'PROXY' && sourceRole !== 'MASTER') {
    fail('PROJECT_VIDEO_SOURCE_VERSION_PIN_ROLE_INVALID');
  }
  const authority = normalizeAuthority(value.authority);
  if ((sourceRole === 'PROXY'
      && authority.kind !== 'PROJECT_PROXY_SOURCE_BINDING')
    || (sourceRole === 'MASTER'
      && authority.kind !== 'PROJECT_PROXY_MASTER_RELINK')) {
    fail('PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_MISMATCH');
  }
  return {
    schemaVersion: 1 as const,
    kind: PROJECT_VIDEO_SOURCE_VERSION_PIN_KIND_V1,
    writerAuthority: PROJECT_VIDEO_SOURCE_VERSION_PIN_OWNER_V1,
    projectId: identifier(
      value.projectId,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_PROJECT_ID_INVALID',
    ),
    overlayId: overlayId(
      value.overlayId,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_OVERLAY_ID_INVALID',
    ),
    assetId: identifier(
      value.assetId,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_ASSET_ID_INVALID',
    ),
    sourceRole,
    sourceVersionSha256: sha256(
      value.sourceVersionSha256,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_SOURCE_INVALID',
    ),
    storageVersionSha256: sha256(
      value.storageVersionSha256,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_STORAGE_INVALID',
    ),
    authority,
    issuedAt: isoInstant(
      value.issuedAt,
      'PROJECT_VIDEO_SOURCE_VERSION_PIN_TIME_INVALID',
    ),
  };
}

function normalizeAuthority(
  value: unknown,
): ProjectVideoSourceVersionPinAuthorityV1 {
  const record = object(
    value,
    'PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_INVALID',
  );
  if (record.kind === 'PROJECT_PROXY_SOURCE_BINDING') {
    exactKeys(record, [
      'kind', 'bindingSha256', 'proxyTimeMapReferenceSha256',
    ], 'PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_FIELDS_INVALID');
    return frozen({
      kind: 'PROJECT_PROXY_SOURCE_BINDING',
      bindingSha256: sha256(
        record.bindingSha256,
        'PROJECT_VIDEO_SOURCE_VERSION_PIN_BINDING_INVALID',
      ),
      proxyTimeMapReferenceSha256: sha256(
        record.proxyTimeMapReferenceSha256,
        'PROJECT_VIDEO_SOURCE_VERSION_PIN_TIME_MAP_INVALID',
      ),
    });
  }
  if (record.kind === 'PROJECT_PROXY_MASTER_RELINK') {
    exactKeys(record, [
      'kind', 'relinkStateSha256', 'relationSha256',
      'activeMappingStateSha256',
    ], 'PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_FIELDS_INVALID');
    return frozen({
      kind: 'PROJECT_PROXY_MASTER_RELINK',
      relinkStateSha256: sha256(
        record.relinkStateSha256,
        'PROJECT_VIDEO_SOURCE_VERSION_PIN_RELINK_INVALID',
      ),
      relationSha256: sha256(
        record.relationSha256,
        'PROJECT_VIDEO_SOURCE_VERSION_PIN_RELATION_INVALID',
      ),
      activeMappingStateSha256: sha256(
        record.activeMappingStateSha256,
        'PROJECT_VIDEO_SOURCE_VERSION_PIN_ACTIVE_MAPPING_INVALID',
      ),
    });
  }
  fail('PROJECT_VIDEO_SOURCE_VERSION_PIN_AUTHORITY_KIND_INVALID');
}

function readActiveState(
  asset: ProjectVideoSourceStorageAssetV1,
): Readonly<{
  disposition: 'VALID' | 'INVALID';
  state: MediaProxyMasterActiveMappingAssetStateV1 | null;
}> {
  try {
    return frozen({
      disposition: 'VALID',
      state: readMediaProxyMasterActiveMappingAssetStateV1(asset),
    });
  } catch {
    return frozen({ disposition: 'INVALID', state: null });
  }
}

function readSource(value: unknown): Readonly<MediaSourceVersionV1> | null {
  try {
    return assertMediaSourceVersionV1(value);
  } catch {
    return null;
  }
}

function validatePinnedSource(input: Readonly<{
  source: Readonly<MediaSourceVersionV1>;
  pin: ProjectVideoSourceVersionPinV1;
  asset: ProjectVideoSourceStorageAssetV1;
  assetId: string;
  storageKey: string | null;
}>): Extract<
ProjectVideoSourceStorageResolutionV1,
{ disposition: 'UNVERIFIABLE' }
>['reason'] | null {
  if (input.source.assetId !== input.assetId
    || input.source.mediaKind !== 'video'
    || !sourceOwnerMatchesAsset(input.source, input.asset)) {
    return 'SOURCE_VERSION_MISMATCH';
  }
  if (input.source.sourceVersionSha256 !== input.pin.sourceVersionSha256) {
    return 'SOURCE_VERSION_MISMATCH';
  }
  if (!input.storageKey
    || input.source.storageVersion.locator.provider !== 'R2'
    || input.source.storageVersion.locator.objectKey !== input.storageKey
    || input.source.storageVersion.storageVersionSha256
      !== input.pin.storageVersionSha256) {
    return 'SOURCE_STORAGE_MISMATCH';
  }
  return null;
}

function sourceOwnerMatchesAsset(
  source: Readonly<MediaSourceVersionV1>,
  asset: ProjectVideoSourceStorageAssetV1,
): boolean {
  if (source.owner.kind === 'USER') {
    return source.owner.userId === asset.userId;
  }
  return source.owner.orgId === asset.orgId;
}

function unverifiable(
  reason: Extract<
  ProjectVideoSourceStorageResolutionV1,
  { disposition: 'UNVERIFIABLE' }
  >['reason'],
): ProjectVideoSourceStorageResolutionV1 {
  return frozen({ disposition: 'UNVERIFIABLE', reason });
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(error);
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string') fail(error);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(normalized)) fail(error);
  return normalized;
}

function optionalIdentifier(value: unknown): string | null {
  try {
    return identifier(value, 'PROJECT_VIDEO_SOURCE_VERSION_PIN_IDENTIFIER_INVALID');
  } catch {
    return null;
  }
}

function overlayId(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(error);
  return value as number;
}

function optionalOverlayId(value: unknown): number | null {
  try {
    return overlayId(value, 'PROJECT_VIDEO_SOURCE_VERSION_PIN_OVERLAY_ID_INVALID');
  } catch {
    return null;
  }
}

function storageKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 512
    || /[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function isoDate(value: unknown, error: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(error);
  return value.toISOString();
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string') fail(error);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) fail(error);
  return value;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(code: string): never {
  throw new Error(code);
}
