import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from './editorial-plan-v1';
import {
  assertProviderNativeCanonicalMediaReferenceBindingV2R,
  type ProviderNativeCanonicalMediaReferenceBindingV2R,
} from './provider-native-canonical-media-reference-v2r';

type Scope = ProviderNativeCanonicalMediaReferenceBindingV2R['scope'];

export const PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_COLLECTION_V2R =
  'editron_provider_native_media_bindings_v2r' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_COLLECTION_V2R =
  'editron_provider_native_media_policy_grants_v2r' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_RECORD_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_RECORD_V2R_1' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_GRANT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_GRANT_V2R_1' as const;
export const PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_BINDING_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_BINDING_V2R_1' as const;

export interface ProviderNativeCanonicalMediaBindingRecordV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_RECORD_VERSION_V2R;
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>;
  createdAt: string;
  recordSha256: string;
}

export interface ProviderNativeCanonicalMediaPolicyGrantV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_GRANT_VERSION_V2R;
  scope: Readonly<Scope>;
  routeSha256: string;
  sourceAssetId: string;
  sourceContentSha256: string;
  rightsPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
  disposition: 'AUTHORIZED' | 'REVOKED';
  authorizationSha256: string;
  recordSha256: string;
}

/** Stored inside the existing mediaAssets row; it never owns media bytes. */
export interface ProviderNativeCanonicalMediaArtifactBindingV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_BINDING_VERSION_V2R;
  scope: Readonly<Scope>;
  sourceAssetId: string;
  sourceAssetVersionSha256: string;
  referenceEnvelopeSha256: string;
  artifactId: string;
  artifactVersionSha256: string;
  bytesSha256: string;
  byteLength: number;
  storage: Readonly<{
    backend: 'R2' | 'GCS';
    key: string;
  }>;
  createdAt: string;
  bindingSha256: string;
}

export function createProviderNativeCanonicalMediaBindingRecordV2R(input: Readonly<{
  binding: Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>;
  createdAt: string;
}>): Readonly<ProviderNativeCanonicalMediaBindingRecordV2R> {
  const material = {
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_RECORD_VERSION_V2R,
    binding: assertProviderNativeCanonicalMediaReferenceBindingV2R(input.binding),
    createdAt: timestamp(input.createdAt, 'BINDING_CREATED_AT'),
  };
  return frozen({ ...material, recordSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertProviderNativeCanonicalMediaBindingRecordV2R(
  value: unknown,
): Readonly<ProviderNativeCanonicalMediaBindingRecordV2R> {
  const candidate = record(value, 'BINDING_RECORD');
  exactKeys(candidate, ['version', 'binding', 'createdAt', 'recordSha256'], 'BINDING_RECORD');
  if (candidate.version !== PROVIDER_NATIVE_CANONICAL_MEDIA_BINDING_RECORD_VERSION_V2R) {
    fail('BINDING_RECORD_VERSION_INVALID');
  }
  const material = {
    version: candidate.version,
    binding: assertProviderNativeCanonicalMediaReferenceBindingV2R(candidate.binding),
    createdAt: timestamp(candidate.createdAt, 'BINDING_CREATED_AT'),
  };
  if (hashEditronCanonicalJsonV1(material) !== sha256(candidate.recordSha256, 'BINDING_RECORD')) {
    fail('BINDING_RECORD_HASH_MISMATCH');
  }
  return frozen({ ...material, recordSha256: candidate.recordSha256 as string });
}

export function createProviderNativeCanonicalMediaPolicyGrantV2R(input: Readonly<{
  scope: Readonly<Scope>;
  routeSha256: string;
  sourceAssetId: string;
  sourceContentSha256: string;
  rightsPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
  authorizationDecisionRef: Readonly<EditorialPlanArtifactRefV1>;
  issuedAt: string;
  expiresAt: string;
  disposition?: 'AUTHORIZED' | 'REVOKED';
}>): Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R> {
  const issuedAt = timestamp(input.issuedAt, 'POLICY_ISSUED_AT');
  const expiresAt = timestamp(input.expiresAt, 'POLICY_EXPIRES_AT');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail('POLICY_EXPIRY_INVALID');
  const authorization = {
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_POLICY_GRANT_VERSION_V2R,
    scope: scope(input.scope),
    routeSha256: sha256(input.routeSha256, 'POLICY_ROUTE'),
    sourceAssetId: identity(input.sourceAssetId, 'POLICY_SOURCE_ASSET'),
    sourceContentSha256: sha256(input.sourceContentSha256, 'POLICY_SOURCE_CONTENT'),
    rightsPolicyRef: artifactRef(input.rightsPolicyRef, 'RIGHTS_POLICY'),
    privacyEgressPolicyRef: artifactRef(input.privacyEgressPolicyRef, 'PRIVACY_EGRESS_POLICY'),
    authorizationDecisionRef: artifactRef(
      input.authorizationDecisionRef,
      'AUTHORIZATION_DECISION',
    ),
    issuedAt,
    expiresAt,
  };
  const material = {
    ...authorization,
    disposition: input.disposition ?? 'AUTHORIZED',
    authorizationSha256: hashEditronCanonicalJsonV1(authorization),
  };
  return frozen({ ...material, recordSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertProviderNativeCanonicalMediaPolicyGrantV2R(
  value: unknown,
): Readonly<ProviderNativeCanonicalMediaPolicyGrantV2R> {
  const candidate = record(value, 'POLICY_GRANT');
  exactKeys(candidate, [
    'version', 'scope', 'routeSha256', 'sourceAssetId', 'sourceContentSha256',
    'rightsPolicyRef', 'privacyEgressPolicyRef', 'authorizationDecisionRef',
    'issuedAt', 'expiresAt', 'disposition', 'authorizationSha256', 'recordSha256',
  ], 'POLICY_GRANT');
  const rebound = createProviderNativeCanonicalMediaPolicyGrantV2R({
    scope: scope(candidate.scope),
    routeSha256: sha256(candidate.routeSha256, 'POLICY_ROUTE'),
    sourceAssetId: identity(candidate.sourceAssetId, 'POLICY_SOURCE_ASSET'),
    sourceContentSha256: sha256(candidate.sourceContentSha256, 'POLICY_SOURCE_CONTENT'),
    rightsPolicyRef: artifactRef(candidate.rightsPolicyRef, 'RIGHTS_POLICY'),
    privacyEgressPolicyRef: artifactRef(candidate.privacyEgressPolicyRef, 'PRIVACY_EGRESS_POLICY'),
    authorizationDecisionRef: artifactRef(
      candidate.authorizationDecisionRef,
      'AUTHORIZATION_DECISION',
    ),
    issuedAt: timestamp(candidate.issuedAt, 'POLICY_ISSUED_AT'),
    expiresAt: timestamp(candidate.expiresAt, 'POLICY_EXPIRES_AT'),
    disposition: disposition(candidate.disposition),
  });
  if (rebound.authorizationSha256 !== sha256(candidate.authorizationSha256, 'POLICY_AUTHORIZATION')
    || rebound.recordSha256 !== sha256(candidate.recordSha256, 'POLICY_RECORD')) {
    fail('POLICY_GRANT_HASH_MISMATCH');
  }
  return rebound;
}

export function createProviderNativeCanonicalMediaArtifactBindingV2R(input: Omit<
  ProviderNativeCanonicalMediaArtifactBindingV2R,
  'version' | 'bindingSha256'
>): Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R> {
  const material = {
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_BINDING_VERSION_V2R,
    scope: scope(input.scope),
    sourceAssetId: identity(input.sourceAssetId, 'ARTIFACT_SOURCE_ASSET'),
    sourceAssetVersionSha256: sha256(input.sourceAssetVersionSha256, 'ARTIFACT_SOURCE_VERSION'),
    referenceEnvelopeSha256: sha256(input.referenceEnvelopeSha256, 'ARTIFACT_ENVELOPE'),
    artifactId: identity(input.artifactId, 'ARTIFACT_ID'),
    artifactVersionSha256: sha256(input.artifactVersionSha256, 'ARTIFACT_VERSION'),
    bytesSha256: sha256(input.bytesSha256, 'ARTIFACT_BYTES'),
    byteLength: positiveInteger(input.byteLength, 'ARTIFACT_BYTE_LENGTH'),
    storage: storage(input.storage),
    createdAt: timestamp(input.createdAt, 'ARTIFACT_CREATED_AT'),
  };
  return frozen({ ...material, bindingSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertProviderNativeCanonicalMediaArtifactBindingV2R(
  value: unknown,
): Readonly<ProviderNativeCanonicalMediaArtifactBindingV2R> {
  const candidate = record(value, 'ARTIFACT_BINDING');
  exactKeys(candidate, [
    'version', 'scope', 'sourceAssetId', 'sourceAssetVersionSha256',
    'referenceEnvelopeSha256', 'artifactId', 'artifactVersionSha256',
    'bytesSha256', 'byteLength', 'storage', 'createdAt', 'bindingSha256',
  ], 'ARTIFACT_BINDING');
  if (candidate.version !== PROVIDER_NATIVE_CANONICAL_MEDIA_ARTIFACT_BINDING_VERSION_V2R) {
    fail('ARTIFACT_BINDING_VERSION_INVALID');
  }
  const rebound = createProviderNativeCanonicalMediaArtifactBindingV2R({
    scope: scope(candidate.scope),
    sourceAssetId: identity(candidate.sourceAssetId, 'ARTIFACT_SOURCE_ASSET'),
    sourceAssetVersionSha256: sha256(candidate.sourceAssetVersionSha256, 'ARTIFACT_SOURCE_VERSION'),
    referenceEnvelopeSha256: sha256(candidate.referenceEnvelopeSha256, 'ARTIFACT_ENVELOPE'),
    artifactId: identity(candidate.artifactId, 'ARTIFACT_ID'),
    artifactVersionSha256: sha256(candidate.artifactVersionSha256, 'ARTIFACT_VERSION'),
    bytesSha256: sha256(candidate.bytesSha256, 'ARTIFACT_BYTES'),
    byteLength: positiveInteger(candidate.byteLength, 'ARTIFACT_BYTE_LENGTH'),
    storage: storage(candidate.storage),
    createdAt: timestamp(candidate.createdAt, 'ARTIFACT_CREATED_AT'),
  });
  if (rebound.bindingSha256 !== sha256(candidate.bindingSha256, 'ARTIFACT_BINDING')) {
    fail('ARTIFACT_BINDING_HASH_MISMATCH');
  }
  return rebound;
}

export class ProviderNativeCanonicalMediaProductRecordErrorV2R extends Error {}

function scope(value: unknown): Readonly<Scope> {
  const candidate = record(value, 'SCOPE');
  exactKeys(candidate, ['tenantId', 'userId', 'projectId', 'episodeId'], 'SCOPE');
  return {
    tenantId: identity(candidate.tenantId, 'TENANT_ID'),
    userId: identity(candidate.userId, 'USER_ID'),
    projectId: identity(candidate.projectId, 'PROJECT_ID'),
    episodeId: identity(candidate.episodeId, 'EPISODE_ID'),
  };
}

function artifactRef(value: unknown, label: string): Readonly<EditorialPlanArtifactRefV1> {
  const parsed = EditorialPlanArtifactRefSchemaV1.safeParse(value);
  if (!parsed.success) fail(`${label}_REF_INVALID`);
  return cloneCanonicalEditronJsonV1(parsed.data);
}

function storage(value: unknown): ProviderNativeCanonicalMediaArtifactBindingV2R['storage'] {
  const candidate = record(value, 'STORAGE');
  exactKeys(candidate, ['backend', 'key'], 'STORAGE');
  if (candidate.backend !== 'R2' && candidate.backend !== 'GCS') fail('STORAGE_BACKEND_INVALID');
  return { backend: candidate.backend, key: identity(candidate.key, 'STORAGE_KEY') };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    fail(`${label}_FIELDS_INVALID`);
  }
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label}_INVALID`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    fail(`${label}_INVALID`);
  }
  return value;
}

function disposition(value: unknown): 'AUTHORIZED' | 'REVOKED' {
  if (value !== 'AUTHORIZED' && value !== 'REVOKED') fail('POLICY_DISPOSITION_INVALID');
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(`${label}_INVALID`);
  return Number(value);
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value)) as Readonly<T>;
}

function fail(code: string): never {
  throw new ProviderNativeCanonicalMediaProductRecordErrorV2R(
    `PROVIDER_NATIVE_CANONICAL_MEDIA_PRODUCT_${code}`,
  );
}
