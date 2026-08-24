import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  executeStage25HeldoutRouteOwnerMaterializationV1,
} from '@/lib/editron/research/open-ended-planner/stage25-heldout-route-owner-materialization-v1';
import {
  STAGE25_HELDOUT_ROUTE_ARMS_V1,
  STAGE25_HELDOUT_ROUTE_FREEZE_V1,
} from '@/lib/editron/research/open-ended-planner/stage25-heldout-route-freeze-v1';

describe('Stage 2.5 heldout route owner materialization V1', () => {
  it('exercises all 16 frozen arms as owner-derived safe stops', async () => {
    const receipts = await Promise.all(STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks.flatMap(
      ({ taskId }) => STAGE25_HELDOUT_ROUTE_ARMS_V1.map((arm) => (
        executeStage25HeldoutRouteOwnerMaterializationV1({ taskId: String(taskId), arm })
      )),
    ));

    expect(receipts).toHaveLength(16);
    for (const receipt of receipts) {
      expect(receipt).toMatchObject({
        authority: 'ZERO_SPEND_OWNER_DERIVED_SAFE_STOP_NO_PROJECT_MUTATION',
        evaluation: { assessment: 'PASS_SAFE_STOP', diagnostics: [] },
        candidate: {
          disposition: 'CAPABILITY_GAP',
          capabilityAvailable: false,
          attemptedUnavailableOwner: false,
          proofLevel: 'SAFE_STOP_OWNER_PROOF',
        },
        externalCalls: {
          providerInferenceCalls: 0,
          renderCalls: 0,
          databaseCalls: 0,
          canonicalProjectMutationWrites: 0,
        },
        proofCeiling: 'SAFE_STOP_OWNER_PROOF_ONLY',
        stateEffects: [],
      });
      const { receiptSha256, ...unsigned } = receipt;
      expect(receiptSha256).toBe(hashCanonicalJsonV1(unsigned));
    }
  });

  it('derives the native gap from the actual isolated dispatcher and unchanged proposal clone', async () => {
    const receipt = await executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-01', arm: 'FORCED_NATIVE',
    });
    expect(receipt.ownerObservations).toEqual([expect.objectContaining({
      route: 'NATIVE',
      proposalCloneOwnerRef: 'provider-native-project-service-clone-owner-v2r.ts#createProviderNativeProjectServiceCloneOwnerV2R',
      operatorDispatcherOwnerRef: 'provider-native-project-service-operator-dispatcher-v2r.ts#createProviderNativeProjectServiceOperatorDispatcherV2R',
      canonicalLoaderFixture: 'IN_MEMORY_READ_ONLY_PROJECT_SNAPSHOT',
      requestedOperatorId: 'add_overlay',
      supportedOperatorIds: ['cut_section', 'set_keyframes'],
      ownerDisposition: 'UNVERIFIABLE',
      ownerCode: 'PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED',
      proposalChangedPaths: [],
      canonicalUnchanged: true,
      isolatedSnapshotReads: 4,
      stateEffects: [],
    })]);
    expect(receipt.candidate.capabilityGapCode)
      .toBe('CAPABILITY_GAP:NATIVE_PROPOSAL_OWNER_UNAVAILABLE');
  });

  it('derives the generated gap from the DEV-02-only capability and program verifier', async () => {
    const receipt = await executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-02', arm: 'FORCED_GENERATED_COMPOSITION',
    });
    expect(receipt.ownerObservations).toEqual([expect.objectContaining({
      route: 'GENERATED_COMPOSITION',
      invokedCapabilityAssertionRef: 'generated-composition-research-proxy-capability-v2.ts#assertDev02GeneratedCompositionResearchProxyCapabilityV2',
      invokedVerifierRef: 'generated-composition-program-verifier-v1.ts#verifyGeneratedCompositionProgramV1',
      candidateExecutionOwnerRef: 'generated-composition-sandbox-runner-v1.ts#executeGeneratedCompositionInSandboxV1',
      candidateExecutionOwnerDisposition: 'NOT_CALLED',
      qualifiedCapabilityTaskId: 'DEV-02',
      requestedTaskId: 'RHC-02',
      profileMatches: false,
      fixtureMaterialization: 'NOT_MATERIALIZED',
      verifierDisposition: 'UNVERIFIABLE',
      verifierExecutionEligibility: 'NOT_EXECUTABLE',
      verifierDiagnostics: ['CONTRACT_INPUT_MISSING'],
      sandboxExecutionCalls: 0,
      stateEffects: [],
    })]);
    expect(receipt.candidate.capabilityGapCode)
      .toBe('CAPABILITY_GAP:GENERATED_RHC_PROGRAM_UNMATERIALIZED');
  });

  it('requires both component observations before returning a hybrid safe stop', async () => {
    const receipt = await executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-03', arm: 'FORCED_HYBRID',
    });
    expect(receipt.ownerObservations.map(({ route }) => route))
      .toEqual(['NATIVE', 'GENERATED_COMPOSITION']);
    expect(receipt.candidate).toMatchObject({
      selectedRoute: 'HYBRID',
      checkedRouteFamilies: ['HYBRID'],
      qualifications: {
        nativeOwner: false,
        generatedSandbox: false,
        timebaseHandoff: false,
        audioHandoff: false,
        boundaryHandoff: false,
      },
      capabilityGapCode: 'CAPABILITY_GAP:HYBRID_COMPONENT_OWNERS_UNAVAILABLE',
    });
  });

  it('checks every route family for a free-choice safe stop', async () => {
    const receipt = await executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-04', arm: 'FREE_CHOICE',
    });
    expect(receipt.candidate).toMatchObject({
      selectedRoute: null,
      checkedRouteFamilies: ['NATIVE', 'GENERATED_COMPOSITION', 'HYBRID'],
      capabilityGapCode: 'CAPABILITY_GAP:NO_QUALIFIED_RHC_ROUTE',
    });
    expect(receipt.ownerObservations.map(({ route }) => route))
      .toEqual(['NATIVE', 'GENERATED_COMPOSITION']);
  });

  it('ignores forged caller availability hints and stays deterministic', async () => {
    const input = {
      taskId: 'RHC-01',
      arm: 'FORCED_NATIVE',
      capabilityAvailable: true,
      qualifications: { nativeOwner: true },
    } as const;
    const [first, second] = await Promise.all([
      executeStage25HeldoutRouteOwnerMaterializationV1(input),
      executeStage25HeldoutRouteOwnerMaterializationV1(input),
    ]);
    expect(first.candidate.capabilityAvailable).toBe(false);
    expect(first.candidate.qualifications.nativeOwner).toBe(false);
    expect(first.receiptSha256).toBe(second.receiptSha256);
  });

  it('fails closed for unknown task and arm identities', async () => {
    await expect(executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-99', arm: 'FORCED_NATIVE',
    })).rejects.toThrow('STAGE25_HELDOUT_ROUTE_OWNER_TASK_UNKNOWN');
    await expect(executeStage25HeldoutRouteOwnerMaterializationV1({
      taskId: 'RHC-01', arm: 'UNKNOWN' as 'FORCED_NATIVE',
    })).rejects.toThrow('STAGE25_HELDOUT_ROUTE_OWNER_ARM_UNKNOWN');
  });
});
