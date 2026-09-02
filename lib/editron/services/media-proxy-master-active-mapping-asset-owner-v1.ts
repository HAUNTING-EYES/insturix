import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterMappingQualificationReceiptV1,
  type MediaProxyMasterMappingQualificationReceiptV1,
} from './media-proxy-master-mapping-qualification-v1';
import {
  assertMediaProxyMasterRelationV1,
  assertMediaSourceVersionV1,
  createMediaProxyMasterRelationV1,
  createMediaSourceInvalidationPlanV1,
  type MediaProxyMasterRelationV1,
  type MediaSourceInvalidationPlanV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_ACTIVE_MAPPING_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_ACTIVE_MAPPING_V1' as const;

export type MediaProxyMasterActiveMappingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_ACTIVE_MAPPING_KIND_V1;
  disposition: 'ACTIVE';
  assetId: string;
  relationSha256: string;
  qualification: MediaProxyMasterMappingQualificationReceiptV1;
  sourceInvalidationPlanSha256: string;
  predecessorStateSha256: string | null;
  activatedAt: string;
  activationSha256: string;
}>;

export type MediaProxyMasterActiveMappingAssetStateV1 = Readonly<{
  proxyMasterActiveMappingV1: MediaProxyMasterActiveMappingV1;
  proxyMasterActiveMappingStateSha256V1: string;
}>;

export type MediaProxyMasterActiveMappingAssetInputV1 = Readonly<{
  assetId?: unknown;
  userId?: unknown;
  type?: unknown;
  isProxy?: unknown;
  sourceVersionV1?: unknown;
  proxySourceVersionV1?: unknown;
  proxyMasterRelationV1?: unknown;
  sourceInvalidationPlanV1?: unknown;
  proxyMasterActiveMappingV1?: unknown;
  proxyMasterActiveMappingStateSha256V1?: unknown;
}>;

export type MediaProxyMasterActiveMappingAssetStoreResultV1 = Readonly<
  | {
      disposition: 'APPLIED' | 'UNCHANGED';
      state: MediaProxyMasterActiveMappingAssetStateV1;
    }
  | { disposition: 'RACE_LOST' }
  | { disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }
  | {
      disposition: 'REJECTED';
      reason:
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'QUALIFICATION_INVALID'
        | 'QUALIFICATION_NOT_NEWER'
        | 'ASSET_SCOPE_MISMATCH'
        | 'INVALIDATION_PLAN_MISMATCH'
        | 'ACTIVATION_TIME_INCONSISTENT';
    }
>;

export type MediaProxyMasterActiveMappingAssetStorePortsV1 = Readonly<{
  load(
    assetId: string,
    userId: string,
  ): Promise<MediaProxyMasterActiveMappingAssetInputV1 | null>;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaProxyMasterActiveMappingAssetStateV1 | null;
    nextState: MediaProxyMasterActiveMappingAssetStateV1;
  }>): Promise<boolean>;
}>;

export function createMediaProxyMasterActiveMappingAssetStateV1(input: Readonly<{
  assetId: string;
  userId: string;
  asset: MediaProxyMasterActiveMappingAssetInputV1;
  qualification: MediaProxyMasterMappingQualificationReceiptV1;
  predecessorStateSha256: string | null;
  activatedAt: Date;
}>): MediaProxyMasterActiveMappingAssetStateV1 {
  const assetId = identifier(
    input.assetId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_ID_INVALID',
  );
  const userId = identifier(
    input.userId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_USER_ID_INVALID',
  );
  const qualification =
    assertMediaProxyMasterMappingQualificationReceiptV1(input.qualification);
  const predecessorStateSha256 = nullableSha256(
    input.predecessorStateSha256,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_PREDECESSOR_INVALID',
  );
  const activatedAt = isoDate(
    input.activatedAt,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_TIME_INVALID',
  );
  if (Date.parse(activatedAt) < Date.parse(qualification.execution.qualifiedAt)) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_TIME_INCONSISTENT');
  }
  const scope = assertAssetScope({
    assetId,
    userId,
    asset: input.asset,
    qualification,
  });
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_ACTIVE_MAPPING_KIND_V1,
    disposition: 'ACTIVE' as const,
    assetId,
    relationSha256: qualification.relation.relationSha256,
    qualification,
    sourceInvalidationPlanSha256: scope.invalidationPlan.planSha256,
    predecessorStateSha256,
    activatedAt,
  };
  const active = assertMediaProxyMasterActiveMappingV1({
    ...material,
    activationSha256: hashEditronCanonicalJsonV1(material),
  });
  return frozen({
    proxyMasterActiveMappingV1: active,
    proxyMasterActiveMappingStateSha256V1: active.activationSha256,
  });
}

export function assertMediaProxyMasterActiveMappingV1(
  value: unknown,
): MediaProxyMasterActiveMappingV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_INVALID',
  );
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'assetId', 'relationSha256',
    'qualification', 'sourceInvalidationPlanSha256',
    'predecessorStateSha256', 'activatedAt', 'activationSha256',
  ], 'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_ACTIVE_MAPPING_KIND_V1
    || record.disposition !== 'ACTIVE') {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_IDENTITY_INVALID');
  }
  const qualification =
    assertMediaProxyMasterMappingQualificationReceiptV1(record.qualification);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_ACTIVE_MAPPING_KIND_V1,
    disposition: 'ACTIVE' as const,
    assetId: identifier(
      record.assetId,
      'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_ID_INVALID',
    ),
    relationSha256: sha256(
      record.relationSha256,
      'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_RELATION_INVALID',
    ),
    qualification,
    sourceInvalidationPlanSha256: sha256(
      record.sourceInvalidationPlanSha256,
      'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_INVALIDATION_INVALID',
    ),
    predecessorStateSha256: nullableSha256(
      record.predecessorStateSha256,
      'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_PREDECESSOR_INVALID',
    ),
    activatedAt: isoInstant(
      record.activatedAt,
      'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_TIME_INVALID',
    ),
  };
  const activationSha256 = sha256(
    record.activationSha256,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_HASH_INVALID',
  );
  if (material.assetId !== qualification.relation.assetId
    || material.relationSha256 !== qualification.relation.relationSha256
    || Date.parse(material.activatedAt)
      < Date.parse(qualification.execution.qualifiedAt)
    || activationSha256 !== hashEditronCanonicalJsonV1(material)) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_BINDING_INVALID');
  }
  return frozen({ ...material, activationSha256 });
}

export function readMediaProxyMasterActiveMappingAssetStateV1(
  asset: MediaProxyMasterActiveMappingAssetInputV1,
): MediaProxyMasterActiveMappingAssetStateV1 | null {
  const hasRecord = present(asset.proxyMasterActiveMappingV1);
  const hasHash = present(asset.proxyMasterActiveMappingStateSha256V1);
  if (!hasRecord && !hasHash) return null;
  if (!hasRecord || !hasHash) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_STATE_INCOMPLETE');
  }
  const active = assertMediaProxyMasterActiveMappingV1(
    asset.proxyMasterActiveMappingV1,
  );
  const assetId = identifier(
    asset.assetId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_ID_INVALID',
  );
  const userId = identifier(
    asset.userId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_USER_ID_INVALID',
  );
  const scope = assertAssetScope({
    assetId,
    userId,
    asset,
    qualification: active.qualification,
  });
  if (active.sourceInvalidationPlanSha256 !== scope.invalidationPlan.planSha256
    || asset.proxyMasterActiveMappingStateSha256V1
      !== active.activationSha256) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_STATE_HASH_OR_SCOPE_MISMATCH');
  }
  return frozen({
    proxyMasterActiveMappingV1: active,
    proxyMasterActiveMappingStateSha256V1: active.activationSha256,
  });
}

export async function persistMediaProxyMasterActiveMappingAssetStateV1(
  input: Readonly<{
    assetId: string;
    userId: string;
    expectedStateSha256: string | null;
    qualification: MediaProxyMasterMappingQualificationReceiptV1;
    activatedAt: Date;
  }>,
  ports: MediaProxyMasterActiveMappingAssetStorePortsV1,
): Promise<MediaProxyMasterActiveMappingAssetStoreResultV1> {
  const assetId = identifier(
    input.assetId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_ID_INVALID',
  );
  const userId = identifier(
    input.userId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_USER_ID_INVALID',
  );
  const expectedStateSha256 = nullableSha256(
    input.expectedStateSha256,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_EXPECTED_STATE_INVALID',
  );
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };

  let currentState: MediaProxyMasterActiveMappingAssetStateV1 | null;
  try {
    currentState = readMediaProxyMasterActiveMappingAssetStateV1(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  let qualification: MediaProxyMasterMappingQualificationReceiptV1;
  try {
    qualification =
      assertMediaProxyMasterMappingQualificationReceiptV1(input.qualification);
  } catch {
    return { disposition: 'REJECTED', reason: 'QUALIFICATION_INVALID' };
  }
  if (currentState?.proxyMasterActiveMappingV1.qualification.qualificationSha256
    === qualification.qualificationSha256) {
    return { disposition: 'UNCHANGED', state: currentState };
  }
  if ((currentState?.proxyMasterActiveMappingStateSha256V1 ?? null)
    !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }
  if (currentState
    && Date.parse(qualification.execution.qualifiedAt) <= Date.parse(
      currentState.proxyMasterActiveMappingV1.qualification.execution.qualifiedAt,
    )) {
    return { disposition: 'REJECTED', reason: 'QUALIFICATION_NOT_NEWER' };
  }

  let nextState: MediaProxyMasterActiveMappingAssetStateV1;
  try {
    nextState = createMediaProxyMasterActiveMappingAssetStateV1({
      assetId,
      userId,
      asset,
      qualification,
      predecessorStateSha256:
        currentState?.proxyMasterActiveMappingStateSha256V1 ?? null,
      activatedAt: input.activatedAt,
    });
  } catch (error) {
    return {
      disposition: 'REJECTED',
      reason: classifyActivationError(error),
    };
  }
  if (currentState
    && Date.parse(nextState.proxyMasterActiveMappingV1.activatedAt) <= Date.parse(
      currentState.proxyMasterActiveMappingV1.activatedAt,
    )) {
    return { disposition: 'REJECTED', reason: 'ACTIVATION_TIME_INCONSISTENT' };
  }
  if (!await ports.replace({
    assetId,
    userId,
    expectedState: currentState,
    nextState,
  })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', state: nextState };
}

export async function runMediaProxyMasterActiveMappingAssetStoreV1(
  input: Readonly<{
    assetId: string;
    userId: string;
    expectedStateSha256: string | null;
    qualification: MediaProxyMasterMappingQualificationReceiptV1;
    activatedAt: Date;
  }>,
): Promise<MediaProxyMasterActiveMappingAssetStoreResultV1> {
  return persistMediaProxyMasterActiveMappingAssetStateV1(
    input,
    await createMediaProxyMasterActiveMappingAssetMongoPortsV1(),
  );
}

export async function createMediaProxyMasterActiveMappingAssetMongoPortsV1(
): Promise<MediaProxyMasterActiveMappingAssetStorePortsV1> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return {
    load: async (assetId, userId) => (
      await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        {
          projection: {
            assetId: 1,
            userId: 1,
            type: 1,
            isProxy: 1,
            sourceVersionV1: 1,
            proxySourceVersionV1: 1,
            proxyMasterRelationV1: 1,
            sourceInvalidationPlanV1: 1,
            proxyMasterActiveMappingV1: 1,
            proxyMasterActiveMappingStateSha256V1: 1,
          },
        },
      )
    ) as MediaProxyMasterActiveMappingAssetInputV1 | null,
    replace: async ({ assetId, userId, expectedState, nextState }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaProxyMasterActiveMappingAssetCompareAndSetFilterV1({
          assetId,
          userId,
          expectedState,
          nextState,
        }),
        {
          $set: {
            proxyMasterActiveMappingV1:
              nextState.proxyMasterActiveMappingV1,
            proxyMasterActiveMappingStateSha256V1:
              nextState.proxyMasterActiveMappingStateSha256V1,
          },
        },
      );
      return result.matchedCount === 1;
    },
  };
}

export function mediaProxyMasterActiveMappingAssetCompareAndSetFilterV1(
  input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaProxyMasterActiveMappingAssetStateV1 | null;
    nextState: MediaProxyMasterActiveMappingAssetStateV1;
  }>,
): Record<string, unknown> {
  const assetId = identifier(
    input.assetId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_ID_INVALID',
  );
  const userId = identifier(
    input.userId,
    'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_USER_ID_INVALID',
  );
  const active = assertMediaProxyMasterActiveMappingV1(
    input.nextState.proxyMasterActiveMappingV1,
  );
  if (input.nextState.proxyMasterActiveMappingStateSha256V1
    !== active.activationSha256) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_NEXT_STATE_HASH_MISMATCH');
  }
  const relation = active.qualification.relation;
  const filter: Record<string, unknown> = {
    assetId,
    userId,
    type: 'video',
    isProxy: false,
    'sourceVersionV1.sourceVersionSha256': relation.master.sourceVersionSha256,
    'sourceVersionV1.contentSha256': relation.master.contentSha256,
    'sourceVersionV1.storageVersion.storageVersionSha256':
      relation.master.storageVersionSha256,
    'proxySourceVersionV1.sourceVersionSha256':
      relation.proxy.sourceVersionSha256,
    'proxySourceVersionV1.contentSha256': relation.proxy.contentSha256,
    'proxySourceVersionV1.storageVersion.storageVersionSha256':
      relation.proxy.storageVersionSha256,
    'proxyMasterRelationV1.relationSha256': relation.relationSha256,
    'sourceInvalidationPlanV1.planSha256':
      active.sourceInvalidationPlanSha256,
  };
  if (input.expectedState === null) {
    filter.$and = [
      absentOrNull('proxyMasterActiveMappingV1'),
      absentOrNull('proxyMasterActiveMappingStateSha256V1'),
    ];
    return filter;
  }
  const expected = input.expectedState.proxyMasterActiveMappingV1;
  filter.proxyMasterActiveMappingStateSha256V1 =
    input.expectedState.proxyMasterActiveMappingStateSha256V1;
  filter['proxyMasterActiveMappingV1.activationSha256'] =
    expected.activationSha256;
  filter['proxyMasterActiveMappingV1.qualification.qualificationSha256'] =
    expected.qualification.qualificationSha256;
  return filter;
}

function assertAssetScope(input: Readonly<{
  assetId: string;
  userId: string;
  asset: MediaProxyMasterActiveMappingAssetInputV1;
  qualification: MediaProxyMasterMappingQualificationReceiptV1;
}>): Readonly<{
  relation: Readonly<MediaProxyMasterRelationV1>;
  proxy: Readonly<MediaSourceVersionV1>;
  master: Readonly<MediaSourceVersionV1>;
  invalidationPlan: Readonly<MediaSourceInvalidationPlanV1>;
}> {
  if (input.asset.assetId !== input.assetId
    || input.asset.userId !== input.userId
    || input.asset.type !== 'video'
    || input.asset.isProxy !== false) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_SCOPE_MISMATCH');
  }
  let relation: Readonly<MediaProxyMasterRelationV1>;
  let proxy: Readonly<MediaSourceVersionV1>;
  let master: Readonly<MediaSourceVersionV1>;
  try {
    relation = assertMediaProxyMasterRelationV1(
      input.asset.proxyMasterRelationV1,
    );
    proxy = assertMediaSourceVersionV1(input.asset.proxySourceVersionV1);
    master = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
  } catch {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_SCOPE_MISMATCH');
  }
  const rebuiltRelation = createMediaProxyMasterRelationV1({ proxy, master });
  if (rebuiltRelation.relationSha256 !== relation.relationSha256
    || relation.relationSha256
      !== input.qualification.relation.relationSha256
    || input.qualification.mapping.relationSha256 !== relation.relationSha256
    || (relation.owner.kind === 'USER'
      && relation.owner.userId !== input.userId)) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_ASSET_SCOPE_MISMATCH');
  }
  const expectedInvalidationPlan = createMediaSourceInvalidationPlanV1({
    previous: proxy,
    next: master,
    proxyMasterRelation: relation,
  });
  let actualInvalidationPlanJson: string;
  try {
    actualInvalidationPlanJson = canonicalizeEditronJsonV1(
      input.asset.sourceInvalidationPlanV1,
    );
  } catch {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_INVALIDATION_PLAN_MISMATCH');
  }
  if (expectedInvalidationPlan.disposition !== 'INVALIDATE_DERIVATIVES'
    || expectedInvalidationPlan.reason !== 'PROXY_MASTER_PROMOTED'
    || actualInvalidationPlanJson
      !== canonicalizeEditronJsonV1(expectedInvalidationPlan)) {
    fail('MEDIA_PROXY_MASTER_ACTIVE_MAPPING_INVALIDATION_PLAN_MISMATCH');
  }
  return frozen({
    relation,
    proxy,
    master,
    invalidationPlan: expectedInvalidationPlan,
  });
}

function classifyActivationError(
  error: unknown,
): Extract<
MediaProxyMasterActiveMappingAssetStoreResultV1,
{ disposition: 'REJECTED' }
>['reason'] {
  if (error instanceof Error
    && error.message
      === 'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_INVALIDATION_PLAN_MISMATCH') {
    return 'INVALIDATION_PLAN_MISMATCH';
  }
  if (error instanceof Error
    && (error.message === 'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_TIME_INVALID'
      || error.message
        === 'MEDIA_PROXY_MASTER_ACTIVE_MAPPING_TIME_INCONSISTENT')) {
    return 'ACTIVATION_TIME_INCONSISTENT';
  }
  return 'ASSET_SCOPE_MISMATCH';
}

function absentOrNull(field: string): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string') fail(error);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(normalized)) fail(error);
  return normalized;
}

function nullableSha256(value: unknown, error: string): string | null {
  return value === null ? null : sha256(value, error);
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

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function frozen<const T>(value: T): T {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
