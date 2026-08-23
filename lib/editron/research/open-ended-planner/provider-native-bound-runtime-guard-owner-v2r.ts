import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
} from './contracts-v1';
import type { ProviderNativeDurableRuntimeGuardOwnerV2R }
  from './provider-native-episode-owner-artifact-resolver-v2r';
import type {
  ProviderNativeRouteV2R,
  SerializedProviderNativeTurnV2R,
} from './provider-native-tool-codecs-v2r';
import {
  SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
  SealedHoldoutRuntimeBudgetControllerV2R,
  type SealedHoldoutInputTokenBoundV2R,
  type SealedHoldoutRuntimeAuthorizationV2R,
} from './sealed-holdout-runtime-budget-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_V2R_1' as const;

export interface ProviderNativeBoundRuntimeGuardArtifactV2R {
  version: typeof PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_VERSION_V2R;
  authority: 'RESEARCH_BOUND_RUNTIME_GUARD_NO_INFERENCE_NO_PROJECT_MUTATION';
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
  publicCase: Readonly<JsonRecord>;
  publicCaseSha256: string;
  manifestSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  routeSha256: string;
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
  authorizationSha256: string;
  guardKind: typeof SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R;
  guardIdentitySha256: string;
  artifactSha256: string;
}

export interface ProviderNativeRuntimeTokenCounterOwnerV2R {
  countInputTokens(
    request: Readonly<SerializedProviderNativeTurnV2R>,
  ): Promise<Readonly<SealedHoldoutInputTokenBoundV2R>>;
}

/**
 * Binds the existing sealed-holdout budget policy to one durable episode.
 * Token counting remains an injected provider-specific owner and is never
 * invoked while binding or resolving this immutable artifact.
 */
export function bindProviderNativeRuntimeGuardArtifactV2R(input: Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
  episodeId: string;
  source: Readonly<{
    ownerVersion: string;
    ownerId: string;
    ownerSha256: string;
  }>;
  publicCase: Readonly<JsonRecord>;
  manifestSha256: string;
  route: Readonly<ProviderNativeRouteV2R>;
  authorization: Readonly<SealedHoldoutRuntimeAuthorizationV2R>;
}>): Readonly<ProviderNativeBoundRuntimeGuardArtifactV2R> {
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
  const publicCase = canonicalClone(input.publicCase);
  const route = canonicalClone(input.route);
  const authorization = canonicalClone(input.authorization);
  const publicCaseSha256 = hashCanonicalJsonV1(publicCase);
  const manifestSha256 = sha256(input.manifestSha256, 'MANIFEST');
  const routeSha256 = hashCanonicalJsonV1(route);
  const authorizationSha256 = hashCanonicalJsonV1(authorization);
  const controller = createController({
    publicCase,
    publicCaseSha256,
    manifestSha256,
    route,
    authorization,
    countInputTokens: tokenCounterMustNotRun,
  });
  const guardIdentitySha256 = controller.createResumeState({
    completedTurns: [],
  }).guardIdentitySha256;
  const material = {
    version: PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_VERSION_V2R,
    authority: 'RESEARCH_BOUND_RUNTIME_GUARD_NO_INFERENCE_NO_PROJECT_MUTATION' as const,
    scope,
    source,
    publicCase,
    publicCaseSha256,
    manifestSha256,
    route,
    routeSha256,
    authorization,
    authorizationSha256,
    guardKind: SEALED_HOLDOUT_RUNTIME_GUARD_KIND_V2R,
    guardIdentitySha256,
  };
  return deepFreezeV1({
    ...material,
    artifactSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeRuntimeGuardArtifactV2R(
  value: unknown,
): Readonly<ProviderNativeBoundRuntimeGuardArtifactV2R> {
  const candidate = record(value, 'ARTIFACT');
  const scope = record(candidate.scope, 'SCOPE');
  const source = record(candidate.source, 'SOURCE');
  const rebound = bindProviderNativeRuntimeGuardArtifactV2R({
    tenantId: text(scope.tenantId, 'TENANT_ID'),
    userId: text(scope.userId, 'USER_ID'),
    projectId: text(scope.projectId, 'PROJECT_ID'),
    episodeId: text(scope.episodeId, 'EPISODE_ID'),
    source: {
      ownerVersion: text(source.ownerVersion, 'SOURCE_OWNER_VERSION'),
      ownerId: text(source.ownerId, 'SOURCE_OWNER_ID'),
      ownerSha256: text(source.ownerSha256, 'SOURCE_OWNER_SHA256'),
    },
    publicCase: record(candidate.publicCase, 'PUBLIC_CASE'),
    manifestSha256: text(candidate.manifestSha256, 'MANIFEST_SHA256'),
    route: record(candidate.route, 'ROUTE') as unknown as ProviderNativeRouteV2R,
    authorization: record(
      candidate.authorization,
      'AUTHORIZATION',
    ) as unknown as SealedHoldoutRuntimeAuthorizationV2R,
  });
  if (candidate.version !== PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_VERSION_V2R
    || candidate.authority
      !== 'RESEARCH_BOUND_RUNTIME_GUARD_NO_INFERENCE_NO_PROJECT_MUTATION'
    || canonicalizeJsonV1(candidate) !== canonicalizeJsonV1(rebound)) {
    throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_ARTIFACT_INVALID');
  }
  return rebound;
}

export function createProviderNativeBoundRuntimeGuardOwnerV2R(
  artifactValue: unknown,
  tokenCounter: Readonly<ProviderNativeRuntimeTokenCounterOwnerV2R>,
): Readonly<ProviderNativeDurableRuntimeGuardOwnerV2R> {
  const artifact = assertProviderNativeRuntimeGuardArtifactV2R(artifactValue);
  return {
    resolve: async (input) => {
      if (input.tenantId !== artifact.scope.tenantId
        || input.userId !== artifact.scope.userId
        || input.projectId !== artifact.scope.projectId
        || input.episodeId !== artifact.scope.episodeId) {
        throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_SCOPE_MISMATCH');
      }
      if (input.guardKind !== artifact.guardKind) {
        throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_KIND_MISMATCH');
      }
      if (input.expectedGuardIdentitySha256 !== artifact.guardIdentitySha256) {
        throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_IDENTITY_MISMATCH');
      }
      const controller = createController({
        publicCase: artifact.publicCase,
        publicCaseSha256: artifact.publicCaseSha256,
        manifestSha256: artifact.manifestSha256,
        route: artifact.route,
        authorization: artifact.authorization,
        countInputTokens: (request) => tokenCounter.countInputTokens(request),
      });
      const resolvedIdentity = controller.createResumeState({
        completedTurns: [],
      }).guardIdentitySha256;
      if (resolvedIdentity !== artifact.guardIdentitySha256) {
        throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_OWNER_DRIFT');
      }
      return controller;
    },
  };
}

function createController(input: ConstructorParameters<
  typeof SealedHoldoutRuntimeBudgetControllerV2R
>[0]): SealedHoldoutRuntimeBudgetControllerV2R {
  return new SealedHoldoutRuntimeBudgetControllerV2R(input);
}

async function tokenCounterMustNotRun(): Promise<never> {
  throw new Error('PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_COUNTER_UNEXPECTED');
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalizeJsonV1(value)) as T;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_${label}_INVALID`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_${label}_INVALID`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_RUNTIME_GUARD_${label}_HASH_INVALID`);
  }
  return result;
}
