import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertDev02GeneratedCompositionResearchProxyCapabilityV2,
  DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2,
} from './generated-composition-research-proxy-capability-v2';
import { verifyGeneratedCompositionProgramV1 }
  from './generated-composition-program-verifier-v1';
import {
  evaluateStage25HeldoutRouteCandidateV1,
  hashStage25HeldoutRouteCandidateV1,
  STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1,
  type Stage25HeldoutRouteCandidateV1,
} from './stage25-heldout-route-evaluator-v1';
import {
  STAGE25_HELDOUT_ROUTE_FREEZE_V1,
  type Stage25HeldoutRouteArmV1,
} from './stage25-heldout-route-freeze-v1';
import { createProviderNativeProjectServiceCloneOwnerV2R }
  from './provider-native-project-service-clone-owner-v2r';
import { projectProposalStateV2R } from './project-service-proposal-state-v2r';
import {
  createProviderNativeProjectServiceOperatorDispatcherV2R,
  PROVIDER_NATIVE_PROJECT_SERVICE_PRE_OVERLAY_OPERATOR_IDS_V2R,
} from './provider-native-project-service-operator-dispatcher-v2r';
import type { Project, ProjectRevisionV1 }
  from '../../services/project-service';

type RouteV1 = NonNullable<Stage25HeldoutRouteCandidateV1['selectedRoute']>;
type JsonRecord = Record<string, unknown>;

export const STAGE25_HELDOUT_ROUTE_OWNER_MATERIALIZATION_VERSION_V1 =
  'EDITRON_OE_STAGE25_HELDOUT_ROUTE_OWNER_MATERIALIZATION_V1_2' as const;

interface NativeOwnerObservationV1 {
  route: 'NATIVE';
  proposalCloneOwnerRef: 'provider-native-project-service-clone-owner-v2r.ts#createProviderNativeProjectServiceCloneOwnerV2R';
  operatorDispatcherOwnerRef: 'provider-native-project-service-operator-dispatcher-v2r.ts#createProviderNativeProjectServiceOperatorDispatcherV2R';
  canonicalLoaderFixture: 'IN_MEMORY_READ_ONLY_PROJECT_SNAPSHOT';
  requestedOperatorId: 'add_overlay';
  supportedOperatorIds: readonly string[];
  ownerDisposition: string;
  ownerCode: string;
  proposalReceiptSha256: string;
  proposalChangedPaths: readonly string[];
  canonicalUnchanged: boolean;
  isolatedSnapshotReads: number;
  stateEffects: readonly [];
}

interface GeneratedOwnerObservationV1 {
  route: 'GENERATED_COMPOSITION';
  invokedCapabilityAssertionRef: 'generated-composition-research-proxy-capability-v2.ts#assertDev02GeneratedCompositionResearchProxyCapabilityV2';
  invokedVerifierRef: 'generated-composition-program-verifier-v1.ts#verifyGeneratedCompositionProgramV1';
  candidateExecutionOwnerRef: 'generated-composition-sandbox-runner-v1.ts#executeGeneratedCompositionInSandboxV1';
  candidateExecutionOwnerDisposition: 'NOT_CALLED';
  qualifiedCapabilityTaskId: 'DEV-02';
  requestedTaskId: string;
  capabilityHash: string;
  profileMatches: false;
  fixtureMaterialization: 'NOT_MATERIALIZED';
  verifierDisposition: string;
  verifierExecutionEligibility: string;
  verifierDiagnostics: readonly string[];
  sandboxExecutionCalls: 0;
  stateEffects: readonly [];
}

type OwnerObservationV1 = NativeOwnerObservationV1 | GeneratedOwnerObservationV1;

export interface Stage25HeldoutRouteOwnerMaterializationReceiptV1 {
  version: typeof STAGE25_HELDOUT_ROUTE_OWNER_MATERIALIZATION_VERSION_V1;
  artifactType: 'Stage25HeldoutRouteOwnerMaterializationReceiptV1';
  authority: 'ZERO_SPEND_OWNER_DERIVED_SAFE_STOP_NO_PROJECT_MUTATION';
  freezeSha256: string;
  taskId: string;
  arm: Stage25HeldoutRouteArmV1;
  ownerObservations: readonly OwnerObservationV1[];
  candidate: Readonly<Stage25HeldoutRouteCandidateV1>;
  evaluation: Readonly<JsonRecord>;
  externalCalls: Readonly<{
    providerInferenceCalls: 0;
    renderCalls: 0;
    databaseCalls: 0;
    canonicalProjectMutationWrites: 0;
  }>;
  proofCeiling: 'SAFE_STOP_OWNER_PROOF_ONLY';
  stateEffects: readonly [];
  receiptSha256: string;
}

/**
 * Exercises current owner boundaries without pretending the absent RHC media,
 * fonts, program or isolated overlay writer exist. A future executable arm
 * needs a new materialized fixture and owner-bound receipt, not a boolean fed
 * into the symbolic evaluator.
 */
export async function executeStage25HeldoutRouteOwnerMaterializationV1(input: {
  taskId: string;
  arm: Stage25HeldoutRouteArmV1;
}): Promise<Readonly<Stage25HeldoutRouteOwnerMaterializationReceiptV1>> {
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find((candidate) => candidate.taskId === input.taskId) ?? fail('TASK_UNKNOWN');
  const arm = STAGE25_HELDOUT_ROUTE_FREEZE_V1.arms
    .find((candidate) => candidate.taskId === input.taskId && candidate.arm === input.arm)
    ?? fail('ARM_UNKNOWN');
  if (arm.fixtureMaterialization !== 'NOT_MATERIALIZED') fail('FIXTURE_STATE_DRIFT');

  const forcedRoute = routeForArm(input.arm);
  const checkedRouteFamilies = forcedRoute ? [forcedRoute] : allRoutes();
  const observations: OwnerObservationV1[] = [];
  if (checkedRouteFamilies.includes('NATIVE') || checkedRouteFamilies.includes('HYBRID')) {
    observations.push(await observeNativeOwner(input.taskId));
  }
  if (checkedRouteFamilies.includes('GENERATED_COMPOSITION') || checkedRouteFamilies.includes('HYBRID')) {
    observations.push(observeGeneratedOwner(input.taskId));
  }

  const unsignedCandidate: Omit<Stage25HeldoutRouteCandidateV1, 'candidateSha256'> = {
    version: STAGE25_HELDOUT_ROUTE_EVALUATOR_VERSION_V1,
    taskId: input.taskId,
    arm: input.arm,
    taskSha256: String(task.taskSha256),
    armSha256: String(arm.armSha256),
    disposition: 'CAPABILITY_GAP',
    selectedRoute: forcedRoute,
    capabilityAvailable: false,
    attemptedUnavailableOwner: false,
    checkedRouteFamilies,
    canonicalEditableRepresentation: false,
    qualifications: {
      nativeOwner: false,
      generatedSandbox: false,
      timebaseHandoff: false,
      audioHandoff: false,
      boundaryHandoff: false,
    },
    targetPredicatePassIds: [],
    preservationPredicatePassIds: [],
    capabilityGapCode: capabilityGapCode(forcedRoute),
    proofLevel: 'SAFE_STOP_OWNER_PROOF',
    stateEffects: [],
  };
  const candidate = deepFreezeV1({
    ...unsignedCandidate,
    candidateSha256: hashStage25HeldoutRouteCandidateV1(unsignedCandidate),
  });
  const evaluation = evaluateStage25HeldoutRouteCandidateV1(candidate);
  if (evaluation.assessment !== 'PASS_SAFE_STOP') fail('SAFE_STOP_EVALUATION_INVALID');

  const unsigned = {
    version: STAGE25_HELDOUT_ROUTE_OWNER_MATERIALIZATION_VERSION_V1,
    artifactType: 'Stage25HeldoutRouteOwnerMaterializationReceiptV1' as const,
    authority: 'ZERO_SPEND_OWNER_DERIVED_SAFE_STOP_NO_PROJECT_MUTATION' as const,
    freezeSha256: STAGE25_HELDOUT_ROUTE_FREEZE_V1.freezeSha256,
    taskId: input.taskId,
    arm: input.arm,
    ownerObservations: observations,
    candidate,
    evaluation,
    externalCalls: {
      providerInferenceCalls: 0 as const,
      renderCalls: 0 as const,
      databaseCalls: 0 as const,
      canonicalProjectMutationWrites: 0 as const,
    },
    proofCeiling: 'SAFE_STOP_OWNER_PROOF_ONLY' as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({ ...unsigned, receiptSha256: hashCanonicalJsonV1(unsigned) });
}

async function observeNativeOwner(taskId: string): Promise<NativeOwnerObservationV1> {
  const canonical = probeProject(taskId);
  const revision: ProjectRevisionV1 = {
    schemaVersion: 1,
    value: canonical.projectRevision ?? 0,
    compatibilityUpdatedAt: canonical.updatedAt.toISOString(),
  };
  const canonicalBefore = hashCanonicalJsonV1(projectProposalStateV2R(canonical));
  let snapshotReads = 0;
  const owner = createProviderNativeProjectServiceCloneOwnerV2R({
    projectService: {
      loadProjectForMutation: async () => {
        snapshotReads += 1;
        return { project: structuredClone(canonical), revision: structuredClone(revision) };
      },
    },
    isolatedOperatorOwner: createProviderNativeProjectServiceOperatorDispatcherV2R({
      profile: 'PRE_OVERLAY_OWNER_MATERIALIZATION_V1',
    }),
  });
  const resolved = await owner.resolveFresh!({
    tenantId: 'stage25-route-owner-probe',
    userId: canonical.userId,
    projectId: canonical.projectId,
    episodeId: `stage25-route-owner-${taskId.toLowerCase()}`,
  });
  const execution = await resolved.isolatedClone.executeIsolated({
    operatorId: 'add_overlay',
    arguments: { projectId: canonical.projectId },
    turn: 1,
  });
  const finalize = resolved.isolatedClone.finalizeProposalReceipt
    ?? fail('NATIVE_PROPOSAL_FINALIZER_MISSING');
  const proposal = await finalize();
  const output = execution.output as JsonRecord;
  if (execution.disposition !== 'UNVERIFIABLE'
    || output.code !== 'PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED'
    || proposal.changedPaths.length
    || proposal.canonicalUnchanged !== true
    || canonicalBefore !== hashCanonicalJsonV1(projectProposalStateV2R(canonical))) {
    fail('NATIVE_OWNER_PROBE_DRIFT');
  }
  return deepFreezeV1({
    route: 'NATIVE' as const,
    proposalCloneOwnerRef: 'provider-native-project-service-clone-owner-v2r.ts#createProviderNativeProjectServiceCloneOwnerV2R' as const,
    operatorDispatcherOwnerRef: 'provider-native-project-service-operator-dispatcher-v2r.ts#createProviderNativeProjectServiceOperatorDispatcherV2R' as const,
    canonicalLoaderFixture: 'IN_MEMORY_READ_ONLY_PROJECT_SNAPSHOT' as const,
    requestedOperatorId: 'add_overlay' as const,
    supportedOperatorIds: [
      ...PROVIDER_NATIVE_PROJECT_SERVICE_PRE_OVERLAY_OPERATOR_IDS_V2R,
    ],
    ownerDisposition: execution.disposition,
    ownerCode: String(output.code),
    proposalReceiptSha256: proposal.receiptSha256,
    proposalChangedPaths: [...proposal.changedPaths],
    canonicalUnchanged: proposal.canonicalUnchanged,
    isolatedSnapshotReads: snapshotReads,
    stateEffects: [] as const,
  });
}

function observeGeneratedOwner(taskId: string): GeneratedOwnerObservationV1 {
  assertDev02GeneratedCompositionResearchProxyCapabilityV2(
    DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2,
  );
  const verification = verifyGeneratedCompositionProgramV1({
    program: null,
    sourceBundle: null,
    evidencePack: null,
    referenceBlueprint: null,
  });
  if (verification.disposition !== 'UNVERIFIABLE'
    || verification.executionEligibility !== 'NOT_EXECUTABLE'
    || !verification.diagnostics.includes('CONTRACT_INPUT_MISSING')) {
    fail('GENERATED_OWNER_PROBE_DRIFT');
  }
  return deepFreezeV1({
    route: 'GENERATED_COMPOSITION' as const,
    invokedCapabilityAssertionRef: 'generated-composition-research-proxy-capability-v2.ts#assertDev02GeneratedCompositionResearchProxyCapabilityV2' as const,
    invokedVerifierRef: 'generated-composition-program-verifier-v1.ts#verifyGeneratedCompositionProgramV1' as const,
    candidateExecutionOwnerRef: 'generated-composition-sandbox-runner-v1.ts#executeGeneratedCompositionInSandboxV1' as const,
    candidateExecutionOwnerDisposition: 'NOT_CALLED' as const,
    qualifiedCapabilityTaskId: 'DEV-02' as const,
    requestedTaskId: taskId,
    capabilityHash: DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash,
    profileMatches: false as const,
    fixtureMaterialization: 'NOT_MATERIALIZED' as const,
    verifierDisposition: verification.disposition,
    verifierExecutionEligibility: verification.executionEligibility,
    verifierDiagnostics: [...verification.diagnostics],
    sandboxExecutionCalls: 0 as const,
    stateEffects: [] as const,
  });
}

function probeProject(taskId: string): Project {
  const timestamp = new Date('2026-08-25T00:00:00.000Z');
  return {
    projectId: `stage25-route-probe-${taskId.toLowerCase()}`,
    userId: 'stage25-route-owner-probe',
    name: 'Stage 2.5 route owner probe',
    overlays: [],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 30,
    durationInFrames: 900,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectRevision: 1,
    visibility: 'private',
  };
}

function routeForArm(arm: Stage25HeldoutRouteArmV1): RouteV1 | null {
  return arm === 'FORCED_NATIVE' ? 'NATIVE'
    : arm === 'FORCED_GENERATED_COMPOSITION' ? 'GENERATED_COMPOSITION'
      : arm === 'FORCED_HYBRID' ? 'HYBRID' : null;
}
function allRoutes(): RouteV1[] { return ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID']; }
function capabilityGapCode(route: RouteV1 | null): string {
  return route === 'NATIVE' ? 'CAPABILITY_GAP:NATIVE_PROPOSAL_OWNER_UNAVAILABLE'
    : route === 'GENERATED_COMPOSITION' ? 'CAPABILITY_GAP:GENERATED_RHC_PROGRAM_UNMATERIALIZED'
      : route === 'HYBRID' ? 'CAPABILITY_GAP:HYBRID_COMPONENT_OWNERS_UNAVAILABLE'
        : 'CAPABILITY_GAP:NO_QUALIFIED_RHC_ROUTE';
}
function fail(code: string): never { throw new Error(`STAGE25_HELDOUT_ROUTE_OWNER_${code}`); }
