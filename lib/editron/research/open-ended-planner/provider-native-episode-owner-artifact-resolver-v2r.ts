import { hashCanonicalJsonV1 } from './contracts-v1';
import type { ProviderNativeEpisodeResumeCheckpointV2R }
  from './provider-native-episode-resume-v2r';
import type {
  ProviderNativeDurableArtifactResolverV2R,
  ProviderNativeDurableIsolatedCloneV2R,
  ProviderNativeDurableResolvedArtifactsV2R,
  ProviderNativeDurableCurrentRevisionReadV2R,
} from './provider-native-episode-durable-worker-v2r';
import { buildProviderNativeToolSetV2R }
  from './provider-native-tool-catalog-v2r';
import { buildOpaqueResultReferenceToolSetV2R }
  from './provider-native-result-references-v2r';
import { bindProviderNativeReferenceInputV2R }
  from './provider-native-reference-input-v2r';
import {
  bindProviderNativeVideoReferenceInputV2R,
  type ProviderNativeReferenceMediaInputV2R,
} from './provider-native-video-reference-input-v2r';
import type {
  ProviderNativeEpisodeContextV2R,
  ProviderNativeRuntimeGuardV2R,
} from './provider-native-tool-episode-v2r';
import type { ProviderNativeRouteV2R }
  from './provider-native-tool-codecs-v2r';
import type { DurableWorkflowJobSnapshotV1 }
  from '../../services/durable-workflow-job-v1';

type JsonRecord = Record<string, unknown>;

export interface ProviderNativeDurableEpisodeDefinitionV2R {
  context: Readonly<ProviderNativeEpisodeContextV2R>;
  eligibleOperatorIds: readonly string[];
  finishInputSchema?: Readonly<JsonRecord>;
}

export interface ProviderNativeDurableEpisodeDefinitionOwnerV2R {
  resolve(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    expectedContextSha256: string;
    expectedToolSetSha256: string;
  }>): Promise<Readonly<ProviderNativeDurableEpisodeDefinitionV2R>>;
}

export interface ProviderNativeDurableProjectCloneOwnerV2R {
  resolve(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  }>): Promise<Readonly<{
    currentRevision: Readonly<ProviderNativeDurableCurrentRevisionReadV2R>;
    isolatedClone: Readonly<ProviderNativeDurableIsolatedCloneV2R>;
  }>>;
}

export interface ProviderNativeDurableTransportOwnerV2R {
  resolve(input: Readonly<{
    route: Readonly<ProviderNativeRouteV2R>;
    episodeId: string;
  }>): Promise<ProviderNativeDurableResolvedArtifactsV2R['invoke']>;
}

export interface ProviderNativeDurableReferenceOwnerV2R {
  resolve(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    expectedManifestSha256: string;
  }>): Promise<Readonly<ProviderNativeReferenceMediaInputV2R>>;
}

export interface ProviderNativeDurableRuntimeGuardOwnerV2R {
  resolve(input: Readonly<{
    tenantId: string;
    userId: string;
    projectId: string;
    episodeId: string;
    guardKind: string;
    expectedGuardIdentitySha256: string;
  }>): Promise<Readonly<ProviderNativeRuntimeGuardV2R>>;
}

export interface ProviderNativeDurableArtifactOwnersV2R {
  episodeDefinition: Readonly<ProviderNativeDurableEpisodeDefinitionOwnerV2R>;
  projectClone: Readonly<ProviderNativeDurableProjectCloneOwnerV2R>;
  transport: Readonly<ProviderNativeDurableTransportOwnerV2R>;
  reference?: Readonly<ProviderNativeDurableReferenceOwnerV2R>;
  runtimeGuard?: Readonly<ProviderNativeDurableRuntimeGuardOwnerV2R>;
}

/**
 * Coordinates existing owners for one durable episode. It intentionally owns
 * no artifact storage, provider registry, project state, or isolated executor.
 */
export function createProviderNativeDurableOwnerArtifactResolverV2R(
  owners: Readonly<ProviderNativeDurableArtifactOwnersV2R>,
): Readonly<ProviderNativeDurableArtifactResolverV2R> {
  return {
    resolve: async ({ job, checkpoint }) => resolveArtifacts(owners, job, checkpoint),
  };
}

async function resolveArtifacts(
  owners: Readonly<ProviderNativeDurableArtifactOwnersV2R>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): Promise<Readonly<ProviderNativeDurableResolvedArtifactsV2R>> {
  const projectId = requireProjectScope(job, checkpoint);
  assertExactDependencyBindings(job, checkpoint);

  const definition = await owners.episodeDefinition.resolve({
    tenantId: job.tenantId,
    userId: job.userId,
    projectId,
    episodeId: checkpoint.episodeId,
    expectedContextSha256: checkpoint.contextSha256,
    expectedToolSetSha256: checkpoint.toolSetSha256,
  });
  assertDefinition(job, checkpoint, definition);

  // Optional artifact owners are checked before any project clone or provider
  // transport is materialized, so an incomplete job cannot consume resources.
  const referenceInput = await resolveReference(owners, job, checkpoint, projectId);
  const runtimeGuard = await resolveRuntimeGuard(owners, job, checkpoint, projectId);
  const project = await owners.projectClone.resolve({
    tenantId: job.tenantId,
    userId: job.userId,
    projectId,
    checkpoint,
  });
  const invoke = await owners.transport.resolve({
    route: checkpoint.route,
    episodeId: checkpoint.episodeId,
  });
  return {
    context: definition.context,
    eligibleOperatorIds: definition.eligibleOperatorIds,
    ...(definition.finishInputSchema
      ? { finishInputSchema: definition.finishInputSchema } : {}),
    ...(referenceInput ? { referenceInput } : {}),
    ...(runtimeGuard ? { runtimeGuard } : {}),
    currentRevision: project.currentRevision,
    isolatedClone: project.isolatedClone,
    invoke,
  };
}

function requireProjectScope(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): string {
  if (!job.projectId || job.operationId !== checkpoint.episodeId) {
    throw new Error('PROVIDER_NATIVE_DURABLE_PROJECT_SCOPE_INVALID');
  }
  return job.projectId;
}

function assertDefinition(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  definition: Readonly<ProviderNativeDurableEpisodeDefinitionV2R>,
): void {
  if (definition.context.episodeId !== checkpoint.episodeId
    || hashCanonicalJsonV1(definition.context) !== checkpoint.contextSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CONTEXT_OWNER_MISMATCH');
  }
  const contextProjectIds = [
    record(definition.context.revisionBinding).projectId,
    record(definition.context.projectState).projectId,
  ];
  if (contextProjectIds.some((value) => value !== job.projectId)) {
    throw new Error('PROVIDER_NATIVE_DURABLE_CONTEXT_PROJECT_MISMATCH');
  }
  const exact = buildProviderNativeToolSetV2R(
    definition.eligibleOperatorIds,
    definition.finishInputSchema,
  );
  const opaque = buildOpaqueResultReferenceToolSetV2R(exact);
  if (opaque.toolSetSha256 !== checkpoint.toolSetSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_TOOLSET_OWNER_MISMATCH');
  }
}

function assertExactDependencyBindings(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
): void {
  const expected = new Map<string, string>([
    ['provider_route', hashCanonicalJsonV1(checkpoint.route)],
    ['episode_context', checkpoint.contextSha256],
    ['operator_tool_set', checkpoint.toolSetSha256],
  ]);
  if ('referenceInputManifestSha256' in checkpoint) {
    expected.set('reference_media_manifest', checkpoint.referenceInputManifestSha256);
  }
  if ('runtimeGuardResumeState' in checkpoint) {
    expected.set(
      'runtime_guard_authorization',
      checkpoint.runtimeGuardResumeState.guardIdentitySha256,
    );
  }
  if (job.dependencies.length !== expected.size
    || job.dependencies.some((dependency) => (
      expected.get(dependency.dependencyId) !== dependency.bindingSha256
    ))) {
    throw new Error('PROVIDER_NATIVE_DURABLE_DEPENDENCY_OWNER_MISMATCH');
  }
}

async function resolveReference(
  owners: Readonly<ProviderNativeDurableArtifactOwnersV2R>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  projectId: string,
): Promise<Readonly<ProviderNativeReferenceMediaInputV2R> | undefined> {
  if (!('referenceInputManifestSha256' in checkpoint)) return undefined;
  if (!owners.reference) throw new Error('PROVIDER_NATIVE_DURABLE_REFERENCE_OWNER_REQUIRED');
  const reference = await owners.reference.resolve({
    tenantId: job.tenantId,
    userId: job.userId,
    projectId,
    episodeId: checkpoint.episodeId,
    expectedManifestSha256: checkpoint.referenceInputManifestSha256,
  });
  const bound = reference.arm === 'NATIVE_VIDEO'
    ? bindProviderNativeVideoReferenceInputV2R(reference)
    : bindProviderNativeReferenceInputV2R(reference);
  if (bound.manifestSha256 !== checkpoint.referenceInputManifestSha256) {
    throw new Error('PROVIDER_NATIVE_DURABLE_REFERENCE_OWNER_MISMATCH');
  }
  return bound.input;
}

async function resolveRuntimeGuard(
  owners: Readonly<ProviderNativeDurableArtifactOwnersV2R>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>,
  projectId: string,
): Promise<Readonly<ProviderNativeRuntimeGuardV2R> | undefined> {
  if (!('runtimeGuardResumeState' in checkpoint)) return undefined;
  if (!owners.runtimeGuard) {
    throw new Error('PROVIDER_NATIVE_DURABLE_RUNTIME_GUARD_OWNER_REQUIRED');
  }
  return owners.runtimeGuard.resolve({
    tenantId: job.tenantId,
    userId: job.userId,
    projectId,
    episodeId: checkpoint.episodeId,
    guardKind: checkpoint.runtimeGuardResumeState.guardKind,
    expectedGuardIdentitySha256:
      checkpoint.runtimeGuardResumeState.guardIdentitySha256,
  });
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
