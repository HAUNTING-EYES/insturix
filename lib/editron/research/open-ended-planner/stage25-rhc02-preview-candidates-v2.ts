import type { Rhc02PreviewFixtureIdentityV1 }
  from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-preview-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2 }
  from './generated-composition-research-proxy-capability-v2';
import { executeStage25Rhc02NativeOwnerObservationV1 }
  from './stage25-rhc02-native-owner-observation-v1';
import { buildStage25Rhc02PreviewCandidatesV1 }
  from './stage25-rhc02-preview-candidates-v1';

export const STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V2 =
  'EDITRON_OE_STAGE25_RHC02_PREVIEW_CANDIDATES_V2' as const;

const IMPLEMENTATION_BINDING = deepFreezeV1({
  dependencyCommit: '504b8640f2c43921edb1b8419e67c0c9ecd39763',
  generatedComposition: {
    verifierSha256: '9707e4f05a74ee719ce5de8770082924ffdda09ea6c2e7074f4e61a7fb3348c4',
    apiSha256: 'ee2468e25c67987e466abaee1e1ef18b0e7caa08c48875b8c52b66ee0382e4bc',
    proxySha256: 'afd7c992b7665f6d6a6afe655465d5d5e3b26ab5b430dc994af2633f75797c12',
    historicalDev02CapabilityHash:
      DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2.capabilityHash,
    historicalDev02ApiSha256:
      DEV02_GENERATED_COMPOSITION_RESEARCH_PROXY_CAPABILITY_V2
        .implementation.apiImplementationHash,
    currentSandboxCapabilityAvailable: false as const,
    invalidationReason: 'API_IMPLEMENTATION_HASH_CHANGED' as const,
  },
});

/**
 * Reissues the preliminary route contract against current owner observations.
 * It records capability only; it performs no render or canonical mutation.
 */
export async function buildStage25Rhc02PreviewCandidatesV2(
  identity: Rhc02PreviewFixtureIdentityV1,
) {
  const predecessor = buildStage25Rhc02PreviewCandidatesV1(identity);
  const predecessorNative = predecessor.routes.find(
    ({ route }) => route === 'NATIVE',
  );
  if (!predecessorNative
    || predecessorNative.candidateForm.kind !== 'EDITRON_ADD_OVERLAY_INPUTS') {
    fail('PREDECESSOR_NATIVE_ROUTE_MISSING');
  }
  const nativeObservation = await executeStage25Rhc02NativeOwnerObservationV1(identity);
  const nativeVisualRequests = deepFreezeV1(
    predecessorNative.candidateForm.requestedOperations.map((operation) => ({
      ...operation,
      arguments: {
        ...operation.arguments,
        evidenceIds: evidenceIdsFor(operation.operationId),
      },
    })),
  );
  const common = {
    version: STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V2,
    taskId: 'RHC-02' as const,
    taskSha256: predecessor.taskSha256,
    targetPredicateIds: predecessor.routes[0].targetPredicateIds,
    preservationPredicateIds: predecessor.routes[0].preservationPredicateIds,
    fixtureSha256: predecessor.fixture.fixtureSha256,
    sourceBindings: predecessor.fixture.sourceBindings,
    fontBinding: predecessor.fixture.fontBinding,
    timelineMapping: predecessor.fixture.timelineMapping,
    audioBaselineHash: hashCanonicalJsonV1(predecessor.fixture.audioBaseline),
    boundaryHandoffHash: hashCanonicalJsonV1(predecessor.fixture.boundaryHandoff),
    renderDisposition: 'NOT_RENDERED' as const,
    routeQualityDisposition: 'UNJUDGED' as const,
    productExecutionDisposition: 'NOT_AUTHORIZED' as const,
    capabilityAvailable: false as const,
    attemptedUnavailableOwner: false as const,
    providerInferenceCalls: 0 as const,
    stateEffects: [] as const,
  };
  const routes = [
    {
      ...common,
      candidateId: 'RHC-02:NATIVE:V2',
      route: 'NATIVE' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'EDITRON_ADD_OVERLAY_INPUTS' as const,
        formOwnerRef:
          'lib/editron/agent/chat-add-overlay-form.ts#buildChatAddOverlayForm',
        proposalOwnerRef:
          'lib/editron/research/open-ended-planner/provider-native-project-service-overlay-owner-v2r.ts#createProviderNativeProjectServiceOverlayOwnerV2R',
        dispatcherProfile: 'RHC02_OVERLAY_RESEARCH_V1' as const,
        productMutationOwnerRef:
          'lib/editron/services/project-service.ts#ProjectService.addOverlay',
        runtimeInjectedInputs: ['projectId', 'expectedProjectRevision'] as const,
        requestedOperations: nativeVisualRequests,
        audioMutationOperations: [] as const,
      },
      ownerObservation: {
        receiptSha256: nativeObservation.receiptSha256,
        implementationBinding: nativeObservation.implementationBinding,
        proofCeiling: nativeObservation.proofCeiling,
      },
      qualifications: {
        editableInputForm: true,
        audioBaselineBound: true,
        timebaseHandoff: true,
        boundaryHandoff: true,
        isolatedRevisionIssuedOverlayWriter: true,
        bothStillImageFormsAccepted: true,
        exactNativeFontFileBinding: false,
      },
      capabilityGapCodes: [
        'NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE',
      ] as const,
      handoffs: predecessor.fixture.boundaryHandoff,
    },
    {
      ...common,
      candidateId: 'RHC-02:GENERATED_COMPOSITION:V2',
      route: 'GENERATED_COMPOSITION' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'GENERATED_COMPOSITION_REQUIREMENTS' as const,
        requiredVisualInputs: [
          { assetId: 'rhc02-still-a', mediaKind: 'STILL_IMAGE' },
          { assetId: 'rhc02-still-b', mediaKind: 'STILL_IMAGE' },
        ] as const,
        requiredText: 'How we shipped it',
        requiredFontAssetId: predecessor.fixture.fontBinding.fontAssetId,
        currentApiOwnerRef: 'generated-composition-api-v1.tsx#AssetSlot',
        currentProxyOwnerRef:
          'generated-composition-proxy-renderer-v1.ts#materializeSources',
        currentSandboxContractRef:
          'generated-composition-sandbox-contract-v1.ts#proxyReceiptSchema',
      },
      qualifications: {
        editableInputForm: true,
        stillImageSourceOwner: true,
        playableAudioPreservationOwner: false,
        generatedProgramVerified: false,
        currentSandboxCapability: false,
        timebaseHandoff: false,
        boundaryHandoff: false,
      },
      capabilityGapCodes: [
        'GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT',
        'GENERATED_CURRENT_SANDBOX_CAPABILITY_UNAVAILABLE',
        'GENERATED_RHC02_PROGRAM_UNMATERIALIZED',
      ] as const,
      handoffs: null,
    },
    {
      ...common,
      candidateId: 'RHC-02:HYBRID:V2',
      route: 'HYBRID' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'GENERATED_VISUAL_ISLAND_WITH_NATIVE_AUDIO' as const,
        generatedVisualProjectRange:
          predecessor.fixture.timelineMapping.absoluteTargetRange,
        generatedVisualCompositionRange:
          predecessor.fixture.timelineMapping.compositionRange,
        nativeAudioOwner: predecessor.fixture.audioBaseline.owner,
        nativeAudioBaselineHash:
          hashCanonicalJsonV1(predecessor.fixture.audioBaseline),
        nativeAudioMutationAllowed: false as const,
        productMutationOwners: {
          prepare:
            'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
          finalize:
            'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
        },
      },
      qualifications: {
        editableInputForm: false,
        nativeAudioBaselineBound: true,
        timebaseHandoff: true,
        audioHandoff: true,
        boundaryHandoff: true,
        stillImageSourceOwner: true,
        generatedProgramVerified: false,
        currentSandboxCapability: false,
        projectServiceGeneratedCompositionWriter: true,
        isolatedRevisionIssuedProposalAdapter: false,
      },
      capabilityGapCodes: [
        'HYBRID_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_ADAPTER_UNAVAILABLE',
        'HYBRID_CURRENT_SANDBOX_CAPABILITY_UNAVAILABLE',
        'HYBRID_RHC02_PROGRAM_UNMATERIALIZED',
      ] as const,
      handoffs: predecessor.fixture.boundaryHandoff,
    },
  ];
  const material = {
    version: STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V2,
    artifactType: 'Stage25Rhc02PreviewCandidatesV2' as const,
    authority: 'CURRENT_RESEARCH_ROUTE_CONTRACT_NO_PROJECT_MUTATION' as const,
    supersedesArtifactHash: predecessor.artifactHash,
    implementationBinding: IMPLEMENTATION_BINDING,
    taskSha256: predecessor.taskSha256,
    fixture: predecessor.fixture,
    routes,
    providerInferenceCalls: 0 as const,
    renderCalls: 0 as const,
    databaseCalls: 0 as const,
    canonicalProjectMutationWrites: 0 as const,
    stateEffects: [] as const,
  };
  return deepFreezeV1({
    ...material,
    routeSetHash: hashCanonicalJsonV1(routes),
    artifactHash: hashCanonicalJsonV1(material),
  });
}

function evidenceIdsFor(operationId: string): readonly string[] {
  switch (operationId) {
    case 'rhc02-add-still-a': return ['rhc02-source-rhc02-still-a'];
    case 'rhc02-add-still-b': return ['rhc02-source-rhc02-still-b'];
    case 'rhc02-add-title': return ['rhc02-font'];
    default: return fail('PREDECESSOR_OPERATION_UNRECOGNIZED');
  }
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_PREVIEW_V2_${code}`);
}
