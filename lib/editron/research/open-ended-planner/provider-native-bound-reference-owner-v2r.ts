import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
} from './contracts-v1';
import type { ProviderNativeDurableReferenceOwnerV2R }
  from './provider-native-episode-owner-artifact-resolver-v2r';
import { bindProviderNativeReferenceInputV2R }
  from './provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
} from './provider-native-video-reference-input-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_V2R_1' as const;

export interface ProviderNativeBoundReferenceArtifactV2R {
  version: typeof PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_VERSION_V2R;
  authority: 'RESEARCH_IMMUTABLE_REFERENCE_NO_PROJECT_MUTATION';
  scope: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
  }>;
  source: Readonly<{
    ownerVersion: string;
    ownerId: string;
    ownerSha256: string;
  }>;
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>;
  referenceManifestSha256: string;
  artifactSha256: string;
}

/**
 * Binds already validated research reference bytes to one episode scope. This
 * is a value artifact and resolver only; it owns no upload or media storage.
 */
export function bindProviderNativeReferenceArtifactV2R(input: Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
  source: Readonly<{
    ownerVersion: string;
    ownerId: string;
    ownerSha256: string;
  }>;
  referenceInput: Readonly<ProviderNativeReferenceMediaInputV2R>;
}>): Readonly<ProviderNativeBoundReferenceArtifactV2R> {
  const scope = {
    tenantId: identity(input.tenantId, 'TENANT_ID'),
    userId: identity(input.userId, 'USER_ID'),
    projectId: identity(input.projectId, 'PROJECT_ID'),
    episodeId: identity(input.episodeId, 'EPISODE_ID'),
  };
  const source = {
    ownerVersion: identity(input.source.ownerVersion, 'SOURCE_OWNER_VERSION'),
    ownerId: identity(input.source.ownerId, 'SOURCE_OWNER_ID'),
    ownerSha256: sha256(input.source.ownerSha256, 'SOURCE_OWNER'),
  };
  const bound = bindReference(input.referenceInput);
  const material = {
    version: PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_VERSION_V2R,
    authority: 'RESEARCH_IMMUTABLE_REFERENCE_NO_PROJECT_MUTATION' as const,
    scope,
    source,
    referenceInput: bound.input,
    referenceManifestSha256: bound.manifestSha256,
  };
  return deepFreezeV1({
    ...material,
    artifactSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeReferenceArtifactV2R(
  value: unknown,
): Readonly<ProviderNativeBoundReferenceArtifactV2R> {
  const candidate = record(value, 'ARTIFACT');
  const scope = record(candidate.scope, 'SCOPE');
  const source = record(candidate.source, 'SOURCE');
  const rebound = bindProviderNativeReferenceArtifactV2R({
    tenantId: text(scope.tenantId, 'TENANT_ID'),
    userId: text(scope.userId, 'USER_ID'),
    projectId: text(scope.projectId, 'PROJECT_ID'),
    episodeId: text(scope.episodeId, 'EPISODE_ID'),
    source: {
      ownerVersion: text(source.ownerVersion, 'SOURCE_OWNER_VERSION'),
      ownerId: text(source.ownerId, 'SOURCE_OWNER_ID'),
      ownerSha256: text(source.ownerSha256, 'SOURCE_OWNER_SHA256'),
    },
    referenceInput: record(
      candidate.referenceInput,
      'REFERENCE_INPUT',
    ) as unknown as ProviderNativeReferenceMediaInputV2R,
  });
  if (candidate.version !== PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_VERSION_V2R
    || candidate.authority !== 'RESEARCH_IMMUTABLE_REFERENCE_NO_PROJECT_MUTATION'
    || canonicalizeJsonV1(candidate) !== canonicalizeJsonV1(rebound)) {
    throw new Error('PROVIDER_NATIVE_BOUND_REFERENCE_ARTIFACT_INVALID');
  }
  return rebound;
}

export function createProviderNativeBoundReferenceOwnerV2R(
  artifactValue: unknown,
): Readonly<ProviderNativeDurableReferenceOwnerV2R> {
  const artifact = assertProviderNativeReferenceArtifactV2R(artifactValue);
  return {
    resolve: async (input) => {
      if (input.tenantId !== artifact.scope.tenantId
        || input.userId !== artifact.scope.userId
        || input.projectId !== artifact.scope.projectId
        || input.episodeId !== artifact.scope.episodeId) {
        throw new Error('PROVIDER_NATIVE_BOUND_REFERENCE_SCOPE_MISMATCH');
      }
      if (input.expectedManifestSha256 !== artifact.referenceManifestSha256) {
        throw new Error('PROVIDER_NATIVE_BOUND_REFERENCE_MANIFEST_MISMATCH');
      }
      return canonicalClone(artifact.referenceInput);
    },
  };
}

function bindReference(value: Readonly<ProviderNativeReferenceMediaInputV2R>) {
  return value.arm === 'NATIVE_VIDEO'
    ? bindProviderNativeVideoReferenceInputV2R(value)
    : bindProviderNativeReferenceInputV2R(value);
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalizeJsonV1(value)) as T;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_REFERENCE_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PROVIDER_NATIVE_BOUND_REFERENCE_${label}_INVALID`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_REFERENCE_${label}_INVALID`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_REFERENCE_${label}_HASH_INVALID`);
  }
  return result;
}
