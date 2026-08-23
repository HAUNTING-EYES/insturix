import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '../../services/canonical-json-v1';
import {
  assertEditorialPlanExecutionDefinitionV1,
  type EditorialPlanExecutionDefinitionV1,
} from '../../services/editorial-plan-execution-definition-v1';
import type { EditorialPlanArtifactRefV1 } from '../../services/editorial-plan-v1';
import {
  assertProviderNativeEpisodeDefinitionArtifactV2R,
  type ProviderNativeBoundEpisodeDefinitionArtifactV2R,
} from './provider-native-bound-episode-definition-v2r';
import {
  verifyProviderNativeEpisodeResumeCheckpointV2R,
  type ProviderNativeEpisodeResumeCheckpointV2R,
} from './provider-native-episode-resume-v2r';
import {
  proposalRecoveryWriterTurnsV2R,
  verifyProviderNativeProposalRecoveryStateV2R,
  type ProviderNativeProposalRecoveryStateV2R,
} from './provider-native-proposal-recovery-v2r';
import type { ProviderNativeRouteV2R } from './provider-native-tool-codecs-v2r';
import { PROVIDER_NATIVE_EPISODE_VERSION_V2R }
  from './provider-native-tool-episode-v2r';
import { PROVIDER_NATIVE_TOOL_SET_VERSION_V2R }
  from './provider-native-tool-catalog-v2r';

type JsonRecord = Record<string, unknown>;

export const PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R =
  'EDITRON_PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_V2R_2' as const;
export const PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R =
  'ProviderNativeToolEpisodeV2R' as const;

const SCHEMA_IDENTITY = {
  ownerId: 'PLAN_SERVICE',
  artifactId: 'provider-native-plan-execution-envelope-v2r',
  artifactVersion: PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R,
  executionOwnerId: PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
  executionOwnerVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
  effectPolicy: 'ISOLATED_PROPOSAL_NO_CANONICAL_MUTATION',
  argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
} as const;

export interface ProviderNativePlanExecutionEnvelopeV2R {
  version: typeof PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R;
  authority: 'PLAN_SERVICE_BOUND_RESEARCH_PROXY_ONLY';
  executionOwner: Readonly<{
    ownerId: typeof PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R;
    ownerVersion: typeof PROVIDER_NATIVE_EPISODE_VERSION_V2R;
  }>;
  effectPolicy: 'ISOLATED_PROPOSAL_NO_CANONICAL_MUTATION';
  argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES';
  boundEpisodeDefinition: Readonly<ProviderNativeBoundEpisodeDefinitionArtifactV2R>;
  route: Readonly<ProviderNativeRouteV2R>;
  runtimeGuardBinding: Readonly<{
    guardKind: string;
    guardIdentitySha256: string;
  }>;
  referenceInputManifestSha256: string | null;
  resumeCheckpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R> | null;
  resumeProposalRecoveryState:
    Readonly<ProviderNativeProposalRecoveryStateV2R> | null;
  envelopeSha256: string;
}

export function providerNativePlanExecutionEnvelopeSchemaRefV2R():
Readonly<EditorialPlanArtifactRefV1> {
  return Object.freeze({
    ownerId: SCHEMA_IDENTITY.ownerId,
    artifactId: SCHEMA_IDENTITY.artifactId,
    artifactVersion: SCHEMA_IDENTITY.artifactVersion,
    artifactSha256: hashEditronCanonicalJsonV1(SCHEMA_IDENTITY),
  });
}

export function providerNativeEligibleOperationSetRefV2R(
  envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>,
): Readonly<EditorialPlanArtifactRefV1> {
  return Object.freeze({
    ownerId: 'CAPABILITY_REGISTRY',
    artifactId: `provider-native-toolset-${envelope.boundEpisodeDefinition.toolSetSha256
      .slice(0, 24)}`,
    artifactVersion: PROVIDER_NATIVE_TOOL_SET_VERSION_V2R,
    artifactSha256: envelope.boundEpisodeDefinition.toolSetSha256,
  });
}

export function createProviderNativePlanExecutionEnvelopeV2R(input: Readonly<{
  boundEpisodeDefinition: unknown;
  route: Readonly<ProviderNativeRouteV2R>;
  runtimeGuardBinding: Readonly<{
    guardKind: string;
    guardIdentitySha256: string;
  }>;
  referenceInputManifestSha256?: string;
  resumeCheckpoint?: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  resumeProposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): Readonly<ProviderNativePlanExecutionEnvelopeV2R> {
  const boundEpisodeDefinition = assertProviderNativeEpisodeDefinitionArtifactV2R(
    input.boundEpisodeDefinition,
  );
  const route = canonicalClone(input.route) as ProviderNativeRouteV2R;
  assertRoute(route);
  const runtimeGuardBinding = {
    guardKind: identity(input.runtimeGuardBinding.guardKind, 'GUARD_KIND'),
    guardIdentitySha256: sha256(
      input.runtimeGuardBinding.guardIdentitySha256,
      'GUARD_IDENTITY',
    ),
  };
  const referenceInputManifestSha256 = input.referenceInputManifestSha256
    ? sha256(input.referenceInputManifestSha256, 'REFERENCE_INPUT_MANIFEST') : null;
  const resumeCheckpoint = input.resumeCheckpoint
    ? structuredClone(input.resumeCheckpoint) : null;
  const resumeProposalRecoveryState = input.resumeProposalRecoveryState
    ? structuredClone(input.resumeProposalRecoveryState) : null;
  if (!resumeCheckpoint && resumeProposalRecoveryState) {
    fail('PROVIDER_NATIVE_PLAN_ENVELOPE_RECOVERY_WITHOUT_CHECKPOINT');
  }
  if (resumeCheckpoint) {
    assertResumeBinding({
      boundEpisodeDefinition, route, runtimeGuardBinding,
      referenceInputManifestSha256, resumeCheckpoint,
      resumeProposalRecoveryState,
    });
  }
  const material = {
    version: PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R,
    authority: 'PLAN_SERVICE_BOUND_RESEARCH_PROXY_ONLY' as const,
    executionOwner: {
      ownerId: PROVIDER_NATIVE_PLAN_EXECUTION_OWNER_ID_V2R,
      ownerVersion: PROVIDER_NATIVE_EPISODE_VERSION_V2R,
    },
    effectPolicy: 'ISOLATED_PROPOSAL_NO_CANONICAL_MUTATION' as const,
    argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES' as const,
    boundEpisodeDefinition,
    route,
    runtimeGuardBinding,
    referenceInputManifestSha256,
    resumeCheckpoint,
    resumeProposalRecoveryState,
  };
  return deepFreezeEditronJsonV1({
    ...material, envelopeSha256: hashEditronCanonicalJsonV1(material),
  }) as Readonly<ProviderNativePlanExecutionEnvelopeV2R>;
}

export function assertProviderNativePlanExecutionEnvelopeV2R(
  value: unknown,
): Readonly<ProviderNativePlanExecutionEnvelopeV2R> {
  const candidate = record(value, 'ENVELOPE');
  const candidateGuard = record(candidate.runtimeGuardBinding, 'RUNTIME_GUARD');
  const rebound = createProviderNativePlanExecutionEnvelopeV2R({
    boundEpisodeDefinition: candidate.boundEpisodeDefinition,
    route: record(candidate.route, 'ROUTE') as unknown as ProviderNativeRouteV2R,
    runtimeGuardBinding: {
      guardKind: text(candidateGuard.guardKind, 'GUARD_KIND'),
      guardIdentitySha256: text(candidateGuard.guardIdentitySha256, 'GUARD_IDENTITY'),
    },
    ...(candidate.referenceInputManifestSha256 === null ? {} : {
      referenceInputManifestSha256: text(
        candidate.referenceInputManifestSha256,
        'REFERENCE_INPUT_MANIFEST',
      ),
    }),
    ...(candidate.resumeCheckpoint === null ? {} : {
      resumeCheckpoint: record(candidate.resumeCheckpoint, 'RESUME_CHECKPOINT') as unknown as ProviderNativeEpisodeResumeCheckpointV2R,
    }),
    ...(candidate.resumeProposalRecoveryState === null ? {} : {
      resumeProposalRecoveryState: record(
        candidate.resumeProposalRecoveryState,
        'RESUME_PROPOSAL_RECOVERY_STATE',
      ) as unknown as ProviderNativeProposalRecoveryStateV2R,
    }),
  });
  if (candidate.version !== PROVIDER_NATIVE_PLAN_EXECUTION_ENVELOPE_VERSION_V2R
    || candidate.authority !== 'PLAN_SERVICE_BOUND_RESEARCH_PROXY_ONLY'
    || canonicalizeEditronJsonV1(candidate) !== canonicalizeEditronJsonV1(rebound)) {
    fail('PROVIDER_NATIVE_PLAN_ENVELOPE_INVALID');
  }
  return rebound;
}

/**
 * Validates the immutable PlanService-to-provider definition boundary. It does
 * not execute the provider episode; runtime adaptation remains a separate owner.
 */
export function assertProviderNativePlanExecutionDefinitionV2R(
  value: unknown,
): Readonly<ProviderNativePlanExecutionEnvelopeV2R> {
  const definition = assertEditorialPlanExecutionDefinitionV1(value);
  const expectedSchema = providerNativePlanExecutionEnvelopeSchemaRefV2R();
  if (!sameRef(definition.plannerEnvelopeSchemaRef, expectedSchema)) {
    fail('PROVIDER_NATIVE_PLAN_DEFINITION_SCHEMA_MISMATCH');
  }
  const envelope = assertProviderNativePlanExecutionEnvelopeV2R(
    definition.plannerEnvelope,
  );
  const scope = envelope.boundEpisodeDefinition.scope;
  if (definition.tenantId !== scope.tenantId
    || definition.userId !== scope.userId
    || definition.projectId !== scope.projectId
    || definition.episodeId !== scope.episodeId) {
    fail('PROVIDER_NATIVE_PLAN_DEFINITION_SCOPE_MISMATCH');
  }
  const expectedOperations = providerNativeEligibleOperationSetRefV2R(envelope);
  if (!sameRef(definition.eligibleOperationSetRef, expectedOperations)) {
    fail('PROVIDER_NATIVE_PLAN_DEFINITION_OPERATION_SET_MISMATCH');
  }
  const guardSha256 = envelope.runtimeGuardBinding.guardIdentitySha256;
  if (definition.budgetReservationRefs.length !== 1
    || definition.budgetReservationRefs[0].artifactSha256 !== guardSha256) {
    fail('PROVIDER_NATIVE_PLAN_DEFINITION_BUDGET_MISMATCH');
  }
  return envelope;
}

function assertResumeBinding(input: Readonly<{
  boundEpisodeDefinition: Readonly<ProviderNativeBoundEpisodeDefinitionArtifactV2R>;
  route: Readonly<ProviderNativeRouteV2R>;
  runtimeGuardBinding: Readonly<{ guardKind: string; guardIdentitySha256: string }>;
  referenceInputManifestSha256: string | null;
  resumeCheckpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  resumeProposalRecoveryState:
    Readonly<ProviderNativeProposalRecoveryStateV2R> | null;
}>): void {
  verifyProviderNativeEpisodeResumeCheckpointV2R(input.resumeCheckpoint);
  const checkpoint = input.resumeCheckpoint;
  const referenceSha256 = 'referenceInputManifestSha256' in checkpoint
    ? checkpoint.referenceInputManifestSha256 : null;
  if (!('runtimeGuardResumeState' in checkpoint)
    || input.boundEpisodeDefinition.scope.episodeId !== checkpoint.episodeId
    || input.boundEpisodeDefinition.contextSha256 !== checkpoint.contextSha256
    || input.boundEpisodeDefinition.toolSetSha256 !== checkpoint.toolSetSha256
    || canonicalizeEditronJsonV1(input.route) !== canonicalizeEditronJsonV1(checkpoint.route)
    || input.runtimeGuardBinding.guardKind !== checkpoint.runtimeGuardResumeState.guardKind
    || input.runtimeGuardBinding.guardIdentitySha256
      !== checkpoint.runtimeGuardResumeState.guardIdentitySha256
    || input.referenceInputManifestSha256 !== referenceSha256) {
    fail('PROVIDER_NATIVE_PLAN_ENVELOPE_RESUME_BINDING_MISMATCH');
  }
  const writerTurns = proposalRecoveryWriterTurnsV2R(checkpoint);
  if (writerTurns.length && !input.resumeProposalRecoveryState) {
    fail('PROVIDER_NATIVE_PLAN_ENVELOPE_PROPOSAL_RECOVERY_REQUIRED');
  }
  if (!writerTurns.length && input.resumeProposalRecoveryState) {
    fail('PROVIDER_NATIVE_PLAN_ENVELOPE_PROPOSAL_RECOVERY_UNEXPECTED');
  }
  if (input.resumeProposalRecoveryState) {
    verifyProviderNativeProposalRecoveryStateV2R({
      checkpoint,
      projectId: input.boundEpisodeDefinition.scope.projectId,
      state: input.resumeProposalRecoveryState,
    });
  }
}

export function assertProviderNativePlanResumeArtifactsV2R(input: Readonly<{
  envelope: Readonly<ProviderNativePlanExecutionEnvelopeV2R>;
  checkpoint: Readonly<ProviderNativeEpisodeResumeCheckpointV2R>;
  proposalRecoveryState?: Readonly<ProviderNativeProposalRecoveryStateV2R>;
}>): void {
  const envelope = assertProviderNativePlanExecutionEnvelopeV2R(input.envelope);
  const initial = envelope.resumeCheckpoint;
  assertResumeBinding({
    boundEpisodeDefinition: envelope.boundEpisodeDefinition,
    route: envelope.route,
    runtimeGuardBinding: envelope.runtimeGuardBinding,
    referenceInputManifestSha256: envelope.referenceInputManifestSha256,
    resumeCheckpoint: input.checkpoint,
    resumeProposalRecoveryState: input.proposalRecoveryState ?? null,
  });
  if (initial && (
    input.checkpoint.completedTurns.length < initial.completedTurns.length
    || hashEditronCanonicalJsonV1(
      input.checkpoint.completedTurns.slice(0, initial.completedTurns.length),
    ) !== initial.completedTurnsSha256)) {
    fail('PROVIDER_NATIVE_PLAN_RESUME_CHECKPOINT_NOT_AN_EXTENSION');
  }
}

function assertRoute(route: Readonly<ProviderNativeRouteV2R>): void {
  identity(route.routeId, 'ROUTE_ID');
  identity(route.provider, 'ROUTE_PROVIDER');
  identity(route.model, 'ROUTE_MODEL');
  identity(route.claimedModelIdentity, 'ROUTE_CLAIMED_MODEL');
}

function sameRef(
  left: Readonly<EditorialPlanArtifactRefV1>,
  right: Readonly<EditorialPlanArtifactRefV1>,
): boolean {
  return hashEditronCanonicalJsonV1(left) === hashEditronCanonicalJsonV1(right);
}
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`PROVIDER_NATIVE_PLAN_${label}_INVALID`);
  }
  return value as JsonRecord;
}
function canonicalClone(value: unknown): unknown {
  return JSON.parse(canonicalizeEditronJsonV1(value));
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`PROVIDER_NATIVE_PLAN_${label}_INVALID`);
  }
  return value;
}
function identity(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(result)) {
    fail(`PROVIDER_NATIVE_PLAN_${label}_INVALID`);
  }
  return result;
}
function sha256(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-f0-9]{64}$/.test(result)) {
    fail(`PROVIDER_NATIVE_PLAN_${label}_HASH_INVALID`);
  }
  return result;
}
function fail(message: string): never {
  throw new Error(message);
}
