import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  EditorialPlanArtifactRefSchemaV1,
  type EditorialPlanArtifactRefV1,
} from './editorial-plan-v1';
import { bindProviderNativeReferenceInputV2R }
  from '../research/open-ended-planner/provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
} from '../research/open-ended-planner/provider-native-video-reference-input-v2r';
import type { ProviderNativeRouteV2R }
  from '../research/open-ended-planner/provider-native-tool-codecs-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_V2R_1' as const;

export type ProviderNativeCanonicalMediaArtifactMapV2R =
  | Readonly<{
      arm: 'NATIVE_VIDEO';
      artifactId: string;
      artifactVersionSha256: string;
    }>
  | Readonly<{
      arm: 'ORDERED_TIMESTAMPED_IMAGES';
      frames: readonly Readonly<{
        frameId: string;
        artifactId: string;
        artifactVersionSha256: string;
      }>[];
    }>;

export interface ProviderNativeCanonicalMediaReferenceBindingV2R {
  version: typeof PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_VERSION_V2R;
  authority: 'CANONICAL_MEDIA_SERVICE_DERIVED_PROVIDER_REFERENCE';
  scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>;
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  source: Readonly<{
    assetId: string;
    assetVersionSha256: string;
    contentSha256: string;
    referenceEnvelopeSha256: string;
  }>;
  materializer: Readonly<{
    ownerId: string;
    ownerVersion: string;
    parametersSha256: string;
  }>;
  policy: Readonly<{
    rightsPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
    privacyEgressPolicyRef: Readonly<EditorialPlanArtifactRefV1>;
    authorizationSha256: string;
    disposition: 'AUTHORIZED_FOR_BOUND_ROUTE';
  }>;
  materialization: Readonly<{
    arm: 'NATIVE_VIDEO' | 'ORDERED_TIMESTAMPED_IMAGES';
    manifest: Readonly<JsonRecord>;
    manifestSha256: string;
    artifacts: readonly Readonly<{
      artifactId: string;
      artifactVersionSha256: string;
      frameId: string | null;
      bytesSha256: string;
      byteLength: number;
    }>[];
  }>;
  bindingSha256: string;
}

export interface ProviderNativeCanonicalMediaReferenceBindingInputV2R {
  scope: ProviderNativeCanonicalMediaReferenceBindingV2R['scope'];
  route: Readonly<ProviderNativeRouteV2R>;
  source: ProviderNativeCanonicalMediaReferenceBindingV2R['source'];
  materializer: ProviderNativeCanonicalMediaReferenceBindingV2R['materializer'];
  policy: Omit<ProviderNativeCanonicalMediaReferenceBindingV2R['policy'], 'disposition'>;
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>;
  artifactMap: Readonly<ProviderNativeCanonicalMediaArtifactMapV2R>;
}

export class ProviderNativeCanonicalMediaReferenceErrorV2R extends Error {}

/**
 * Creates a small derived-media binding. Reference bytes stay with the
 * canonical media/evidence owners; this record stores only identities needed
 * to reproduce the exact provider input and prove its authorized route.
 */
export function createProviderNativeCanonicalMediaReferenceBindingV2R(
  input: Readonly<ProviderNativeCanonicalMediaReferenceBindingInputV2R>,
): Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R> {
  const scope = {
    tenantId: identity(input.scope.tenantId, 'TENANT_ID'),
    userId: identity(input.scope.userId, 'USER_ID'),
    projectId: identity(input.scope.projectId, 'PROJECT_ID'),
    episodeId: identity(input.scope.episodeId, 'EPISODE_ID'),
  };
  const route = assertRoute(input.route);
  const source = {
    assetId: identity(input.source.assetId, 'SOURCE_ASSET_ID'),
    assetVersionSha256: sha256(input.source.assetVersionSha256, 'SOURCE_ASSET_VERSION'),
    contentSha256: sha256(input.source.contentSha256, 'SOURCE_CONTENT'),
    referenceEnvelopeSha256: sha256(
      input.source.referenceEnvelopeSha256,
      'SOURCE_REFERENCE_ENVELOPE',
    ),
  };
  const materializer = {
    ownerId: identity(input.materializer.ownerId, 'MATERIALIZER_OWNER_ID'),
    ownerVersion: identity(input.materializer.ownerVersion, 'MATERIALIZER_OWNER_VERSION'),
    parametersSha256: sha256(input.materializer.parametersSha256, 'MATERIALIZER_PARAMETERS'),
  };
  const policy = {
    rightsPolicyRef: artifactRef(input.policy.rightsPolicyRef, 'RIGHTS_POLICY'),
    privacyEgressPolicyRef: artifactRef(
      input.policy.privacyEgressPolicyRef,
      'PRIVACY_EGRESS_POLICY',
    ),
    authorizationSha256: sha256(input.policy.authorizationSha256, 'POLICY_AUTHORIZATION'),
    disposition: 'AUTHORIZED_FOR_BOUND_ROUTE' as const,
  };
  const materialization = buildMaterialization(input.referenceInput, input.artifactMap);
  if ((materialization.manifest.referenceAssetSha256 as unknown) !== source.contentSha256) {
    fail('SOURCE_CONTENT_MANIFEST_MISMATCH');
  }
  const material = {
    version: PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_VERSION_V2R,
    authority: 'CANONICAL_MEDIA_SERVICE_DERIVED_PROVIDER_REFERENCE' as const,
    scope,
    route,
    routeSha256: hashEditronCanonicalJsonV1(route),
    source,
    materializer,
    policy,
    materialization,
  };
  return deepFreezeEditronJsonV1({
    ...material,
    bindingSha256: hashEditronCanonicalJsonV1(material),
  }) as Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>;
}

export function assertProviderNativeCanonicalMediaReferenceBindingV2R(
  value: unknown,
): Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R> {
  const candidate = record(value, 'BINDING');
  exactKeys(candidate, [
    'version', 'authority', 'scope', 'route', 'routeSha256', 'source',
    'materializer', 'policy', 'materialization', 'bindingSha256',
  ], 'BINDING');
  if (candidate.version !== PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_VERSION_V2R
    || candidate.authority !== 'CANONICAL_MEDIA_SERVICE_DERIVED_PROVIDER_REFERENCE') {
    fail('BINDING_IDENTITY_INVALID');
  }
  validatePersistedBinding(candidate);
  const { bindingSha256, ...material } = candidate;
  if (hashEditronCanonicalJsonV1(material) !== sha256(bindingSha256, 'BINDING')) {
    fail('BINDING_HASH_MISMATCH');
  }
  return deepFreezeEditronJsonV1(
    cloneCanonicalEditronJsonV1(candidate),
  ) as unknown as Readonly<ProviderNativeCanonicalMediaReferenceBindingV2R>;
}

function buildMaterialization(
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>,
  artifactMap: Readonly<ProviderNativeCanonicalMediaArtifactMapV2R>,
): ProviderNativeCanonicalMediaReferenceBindingV2R['materialization'] {
  if (referenceInput.arm === 'NATIVE_VIDEO') {
    if (artifactMap.arm !== 'NATIVE_VIDEO') fail('ARTIFACT_MAP_ARM_MISMATCH');
    const bound = bindProviderNativeVideoReferenceInputV2R(referenceInput);
    return {
      arm: bound.input.arm,
      manifest: bound.manifest as unknown as JsonRecord,
      manifestSha256: bound.manifestSha256,
      artifacts: [{
        artifactId: identity(artifactMap.artifactId, 'VIDEO_ARTIFACT_ID'),
        artifactVersionSha256: sha256(
          artifactMap.artifactVersionSha256,
          'VIDEO_ARTIFACT_VERSION',
        ),
        frameId: null,
        bytesSha256: bound.manifest.bytesSha256,
        byteLength: bound.manifest.byteLength,
      }],
    };
  }
  if (artifactMap.arm !== 'ORDERED_TIMESTAMPED_IMAGES') {
    fail('ARTIFACT_MAP_ARM_MISMATCH');
  }
  const bound = bindProviderNativeReferenceInputV2R(referenceInput);
  const byFrame = new Map(artifactMap.frames.map((frame) => [frame.frameId, frame]));
  if (byFrame.size !== artifactMap.frames.length
    || byFrame.size !== bound.manifest.frames.length) {
    fail('FRAME_ARTIFACT_MAP_INVALID');
  }
  const artifacts = bound.manifest.frames.map((frame) => {
    const mapped = byFrame.get(frame.frameId);
    if (!mapped) fail('FRAME_ARTIFACT_MISSING');
    return {
      artifactId: identity(mapped.artifactId, 'FRAME_ARTIFACT_ID'),
      artifactVersionSha256: sha256(
        mapped.artifactVersionSha256,
        'FRAME_ARTIFACT_VERSION',
      ),
      frameId: frame.frameId,
      bytesSha256: frame.bytesSha256,
      byteLength: frame.byteLength,
    };
  });
  return {
    arm: bound.input.arm,
    manifest: bound.manifest as unknown as JsonRecord,
    manifestSha256: bound.manifestSha256,
    artifacts,
  };
}

function validatePersistedBinding(candidate: JsonRecord): void {
  const scope = record(candidate.scope, 'SCOPE');
  exactKeys(scope, ['tenantId', 'userId', 'projectId', 'episodeId'], 'SCOPE');
  Object.entries(scope).forEach(([key, value]) => identity(value, `SCOPE_${key}`));
  const route = assertRoute(record(candidate.route, 'ROUTE') as unknown as ProviderNativeRouteV2R);
  if (hashEditronCanonicalJsonV1(route) !== sha256(candidate.routeSha256, 'ROUTE')) {
    fail('ROUTE_HASH_MISMATCH');
  }
  const source = record(candidate.source, 'SOURCE');
  exactKeys(source, [
    'assetId', 'assetVersionSha256', 'contentSha256', 'referenceEnvelopeSha256',
  ], 'SOURCE');
  identity(source.assetId, 'SOURCE_ASSET_ID');
  ['assetVersionSha256', 'contentSha256', 'referenceEnvelopeSha256']
    .forEach((key) => sha256(source[key], `SOURCE_${key}`));
  const materializer = record(candidate.materializer, 'MATERIALIZER');
  exactKeys(materializer, ['ownerId', 'ownerVersion', 'parametersSha256'], 'MATERIALIZER');
  identity(materializer.ownerId, 'MATERIALIZER_OWNER_ID');
  identity(materializer.ownerVersion, 'MATERIALIZER_OWNER_VERSION');
  sha256(materializer.parametersSha256, 'MATERIALIZER_PARAMETERS');
  const policy = record(candidate.policy, 'POLICY');
  exactKeys(policy, [
    'rightsPolicyRef', 'privacyEgressPolicyRef', 'authorizationSha256', 'disposition',
  ], 'POLICY');
  artifactRef(policy.rightsPolicyRef, 'RIGHTS_POLICY');
  artifactRef(policy.privacyEgressPolicyRef, 'PRIVACY_EGRESS_POLICY');
  sha256(policy.authorizationSha256, 'POLICY_AUTHORIZATION');
  if (policy.disposition !== 'AUTHORIZED_FOR_BOUND_ROUTE') fail('POLICY_DISPOSITION_INVALID');
  const materialization = record(candidate.materialization, 'MATERIALIZATION');
  exactKeys(materialization, ['arm', 'manifest', 'manifestSha256', 'artifacts'], 'MATERIALIZATION');
  const manifest = record(materialization.manifest, 'MANIFEST');
  const arm = materialization.arm;
  if (arm !== 'NATIVE_VIDEO' && arm !== 'ORDERED_TIMESTAMPED_IMAGES') fail('ARM_INVALID');
  if (manifest.arm !== arm
    || manifest.referenceAssetSha256 !== source.contentSha256
    || hashEditronCanonicalJsonV1(manifest)
      !== sha256(materialization.manifestSha256, 'MANIFEST')) {
    fail('MANIFEST_BINDING_INVALID');
  }
  validateArtifactDescriptors(arm, manifest, materialization.artifacts);
}

function validateArtifactDescriptors(
  arm: unknown,
  manifest: JsonRecord,
  value: unknown,
): void {
  if (!Array.isArray(value) || !value.length) fail('ARTIFACTS_INVALID');
  const descriptors = value.map((entry, index) => {
    const descriptor = record(entry, `ARTIFACT_${index}`);
    exactKeys(descriptor, [
      'artifactId', 'artifactVersionSha256', 'frameId', 'bytesSha256', 'byteLength',
    ], `ARTIFACT_${index}`);
    identity(descriptor.artifactId, `ARTIFACT_ID_${index}`);
    sha256(descriptor.artifactVersionSha256, `ARTIFACT_VERSION_${index}`);
    sha256(descriptor.bytesSha256, `ARTIFACT_BYTES_${index}`);
    if (!Number.isSafeInteger(descriptor.byteLength) || Number(descriptor.byteLength) <= 0) {
      fail(`ARTIFACT_LENGTH_${index}_INVALID`);
    }
    return descriptor;
  });
  if (arm === 'NATIVE_VIDEO') {
    if (descriptors.length !== 1 || descriptors[0].frameId !== null
      || descriptors[0].bytesSha256 !== manifest.bytesSha256
      || descriptors[0].byteLength !== manifest.byteLength) {
      fail('VIDEO_ARTIFACT_BINDING_INVALID');
    }
    return;
  }
  const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
  if (frames.length !== descriptors.length) fail('FRAME_ARTIFACT_COUNT_MISMATCH');
  frames.forEach((entry, index) => {
    const frame = record(entry, `MANIFEST_FRAME_${index}`);
    const descriptor = descriptors[index];
    if (descriptor.frameId !== frame.frameId
      || descriptor.bytesSha256 !== frame.bytesSha256
      || descriptor.byteLength !== frame.byteLength) {
      fail('FRAME_ARTIFACT_BINDING_INVALID');
    }
  });
}

function assertRoute(value: Readonly<ProviderNativeRouteV2R>): Readonly<ProviderNativeRouteV2R> {
  const route = record(value, 'ROUTE');
  exactKeys(route, [
    'routeId', 'provider', 'model', 'claimedModelIdentity', 'reasoningMode',
  ], 'ROUTE');
  if (!['OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH'].includes(String(route.routeId))
    || !['openai', 'google'].includes(String(route.provider))
    || !['gpt-5.6-luna', 'gpt-5.6-terra', 'gemini-3.6-flash', 'gemini-3.7-flash']
      .includes(String(route.model))
    || !['minimal', 'low', 'medium', 'high'].includes(String(route.reasoningMode))) {
    fail('ROUTE_INVALID');
  }
  identity(route.claimedModelIdentity, 'ROUTE_MODEL_IDENTITY');
  return cloneCanonicalEditronJsonV1(route) as unknown as Readonly<ProviderNativeRouteV2R>;
}

function artifactRef(value: unknown, label: string): Readonly<EditorialPlanArtifactRefV1> {
  const parsed = EditorialPlanArtifactRefSchemaV1.safeParse(value);
  if (!parsed.success) fail(`${label}_REF_INVALID`);
  return cloneCanonicalEditronJsonV1(parsed.data);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}_INVALID`);
  return value as JsonRecord;
}
function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
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
function fail(code: string): never {
  throw new ProviderNativeCanonicalMediaReferenceErrorV2R(
    `PROVIDER_NATIVE_CANONICAL_MEDIA_REFERENCE_${code}`,
  );
}
