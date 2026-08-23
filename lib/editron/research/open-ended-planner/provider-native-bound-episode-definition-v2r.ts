import {
  canonicalizeJsonV1,
  deepFreezeV1,
  hashCanonicalJsonV1,
} from './contracts-v1';
import type {
  ProviderNativeDurableEpisodeDefinitionOwnerV2R,
  ProviderNativeDurableEpisodeDefinitionV2R,
} from './provider-native-episode-owner-artifact-resolver-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from './provider-native-result-references-v2r';
import { buildProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';
import type { ProviderNativeEpisodeContextV2R }
  from './provider-native-tool-episode-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_BOUND_EPISODE_DEFINITION_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_BOUND_EPISODE_DEFINITION_V2R_1' as const;

export interface ProviderNativeBoundEpisodeDefinitionArtifactV2R {
  version: typeof PROVIDER_NATIVE_BOUND_EPISODE_DEFINITION_VERSION_V2R;
  authority: 'RESEARCH_IMMUTABLE_DEFINITION_NO_PROJECT_MUTATION';
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
  definition: Readonly<ProviderNativeDurableEpisodeDefinitionV2R>;
  contextSha256: string;
  toolSetSha256: string;
  artifactSha256: string;
}

/**
 * Freezes one research episode definition issued by an existing manifest.
 * This is a serializable value binder, not a PlanService or artifact store.
 */
export function bindProviderNativeEpisodeDefinitionArtifactV2R(input: Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
  source: Readonly<{
    ownerVersion: string;
    ownerId: string;
    ownerSha256: string;
  }>;
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  eligibleOperatorIds: readonly string[];
  finishInputSchema?: Readonly<JsonRecord>;
}>): Readonly<ProviderNativeBoundEpisodeDefinitionArtifactV2R> {
  const scope = {
    tenantId: identity(input.tenantId, 'TENANT_ID'),
    userId: identity(input.userId, 'USER_ID'),
    projectId: identity(input.projectId, 'PROJECT_ID'),
    episodeId: identity(input.context.episodeId, 'EPISODE_ID'),
  };
  const source = {
    ownerVersion: identity(input.source.ownerVersion, 'SOURCE_OWNER_VERSION'),
    ownerId: identity(input.source.ownerId, 'SOURCE_OWNER_ID'),
    ownerSha256: sha256(input.source.ownerSha256, 'SOURCE_OWNER'),
  };
  const context = canonicalClone(input.context) as ProviderNativeEpisodeContextV2R;
  assertContextScope(context, scope.projectId, scope.episodeId);
  const eligibleOperatorIds = input.eligibleOperatorIds.map((operatorId) => (
    identity(operatorId, 'OPERATOR_ID')
  ));
  const finishInputSchema = input.finishInputSchema
    ? canonicalClone(input.finishInputSchema) : undefined;
  const exact = buildProviderNativeToolSetV2R(
    eligibleOperatorIds,
    finishInputSchema,
  );
  const toolSetSha256 = buildOpaqueResultReferenceToolSetV2R(exact).toolSetSha256;
  const definition = {
    context,
    eligibleOperatorIds,
    ...(finishInputSchema ? { finishInputSchema } : {}),
  };
  const material = {
    version: PROVIDER_NATIVE_BOUND_EPISODE_DEFINITION_VERSION_V2R,
    authority: 'RESEARCH_IMMUTABLE_DEFINITION_NO_PROJECT_MUTATION' as const,
    scope,
    source,
    definition,
    contextSha256: hashCanonicalJsonV1(context),
    toolSetSha256,
  };
  return deepFreezeV1({
    ...material,
    artifactSha256: hashCanonicalJsonV1(material),
  });
}

export function assertProviderNativeEpisodeDefinitionArtifactV2R(
  value: unknown,
): Readonly<ProviderNativeBoundEpisodeDefinitionArtifactV2R> {
  const candidate = record(value, 'ARTIFACT');
  const scope = record(candidate.scope, 'SCOPE');
  const source = record(candidate.source, 'SOURCE');
  const definition = record(candidate.definition, 'DEFINITION');
  const context = record(
    definition.context,
    'CONTEXT',
  ) as unknown as ProviderNativeEpisodeContextV2R;
  const eligibleOperatorIds = stringArray(
    definition.eligibleOperatorIds,
    'ELIGIBLE_OPERATOR_IDS',
  );
  const rebound = bindProviderNativeEpisodeDefinitionArtifactV2R({
    tenantId: text(scope.tenantId, 'TENANT_ID'),
    userId: text(scope.userId, 'USER_ID'),
    projectId: text(scope.projectId, 'PROJECT_ID'),
    source: {
      ownerVersion: text(source.ownerVersion, 'SOURCE_OWNER_VERSION'),
      ownerId: text(source.ownerId, 'SOURCE_OWNER_ID'),
      ownerSha256: text(source.ownerSha256, 'SOURCE_OWNER_SHA256'),
    },
    context,
    eligibleOperatorIds,
    ...(definition.finishInputSchema === undefined ? {} : {
      finishInputSchema: record(definition.finishInputSchema, 'FINISH_INPUT_SCHEMA'),
    }),
  });
  if (candidate.version !== PROVIDER_NATIVE_BOUND_EPISODE_DEFINITION_VERSION_V2R
    || candidate.authority !== 'RESEARCH_IMMUTABLE_DEFINITION_NO_PROJECT_MUTATION'
    || canonicalizeJsonV1(candidate) !== canonicalizeJsonV1(rebound)) {
    throw new Error('PROVIDER_NATIVE_BOUND_DEFINITION_ARTIFACT_INVALID');
  }
  return rebound;
}

export function createProviderNativeBoundEpisodeDefinitionOwnerV2R(
  artifactValue: unknown,
): Readonly<ProviderNativeDurableEpisodeDefinitionOwnerV2R> {
  const artifact = assertProviderNativeEpisodeDefinitionArtifactV2R(artifactValue);
  return {
    resolve: async (input) => {
      if (input.tenantId !== artifact.scope.tenantId
        || input.userId !== artifact.scope.userId
        || input.projectId !== artifact.scope.projectId
        || input.episodeId !== artifact.scope.episodeId) {
        throw new Error('PROVIDER_NATIVE_BOUND_DEFINITION_SCOPE_MISMATCH');
      }
      if (input.expectedContextSha256 !== artifact.contextSha256
        || input.expectedToolSetSha256 !== artifact.toolSetSha256) {
        throw new Error('PROVIDER_NATIVE_BOUND_DEFINITION_BINDING_MISMATCH');
      }
      return canonicalClone(
        artifact.definition,
      ) as ProviderNativeDurableEpisodeDefinitionV2R;
    },
  };
}

function assertContextScope(
  context: Readonly<ProviderNativeEpisodeContextV2R>,
  projectId: string,
  episodeId: string,
): void {
  const contextProjectIds = [
    record(context.revisionBinding, 'REVISION_BINDING').projectId,
    record(context.projectState, 'PROJECT_STATE').projectId,
  ];
  if (context.episodeId !== episodeId
    || contextProjectIds.some((value) => value !== projectId)) {
    throw new Error('PROVIDER_NATIVE_BOUND_DEFINITION_CONTEXT_SCOPE_MISMATCH');
  }
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalizeJsonV1(value)) as T;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_DEFINITION_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`PROVIDER_NATIVE_BOUND_DEFINITION_${label}_INVALID`);
  }
  return [...value] as string[];
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PROVIDER_NATIVE_BOUND_DEFINITION_${label}_INVALID`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_DEFINITION_${label}_INVALID`);
  }
  return result;
}

function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new Error(`PROVIDER_NATIVE_BOUND_DEFINITION_${label}_HASH_INVALID`);
  }
  return result;
}
