import {
  RHC02_PREVIEW_FONT_ID_V1,
  buildRhc02PreviewFixtureV1,
  type Rhc02PreviewFixtureIdentityV1,
} from '@/tests/fixtures/editron/open-ended-planner-v2/rhc02-preview-fixture-v1';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import { STAGE25_HELDOUT_ROUTE_FREEZE_V1 } from './stage25-heldout-route-freeze-v1';

export const STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC02_PREVIEW_CANDIDATES_V1' as const;

const TARGET_START = 300;
const TARGET_END = 390;
const TARGET_DURATION = TARGET_END - TARGET_START;

/**
 * Records the exact RHC-02 candidate inputs and honest current owner gaps.
 * Nothing in this artifact executes an unavailable writer or renderer.
 */
export function buildStage25Rhc02PreviewCandidatesV1(
  identity: Rhc02PreviewFixtureIdentityV1,
) {
  const task = STAGE25_HELDOUT_ROUTE_FREEZE_V1.tasks
    .find(({ taskId }) => taskId === 'RHC-02') ?? fail('TASK_MISSING');
  const fixture = buildRhc02PreviewFixtureV1(identity);
  const nativeVisualRequests = buildNativeVisualRequests();
  const common = {
    version: STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V1,
    taskId: 'RHC-02' as const,
    taskSha256: String(task.taskSha256),
    targetPredicateIds: predicateIds(task.targetPredicates),
    preservationPredicateIds: predicateIds(task.preservationPredicates),
    fixtureSha256: fixture.fixtureSha256,
    sourceBindings: fixture.sourceBindings,
    fontBinding: fixture.fontBinding,
    timelineMapping: fixture.timelineMapping,
    audioBaselineHash: hashCanonicalJsonV1(fixture.audioBaseline),
    boundaryHandoffHash: hashCanonicalJsonV1(fixture.boundaryHandoff),
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
      candidateId: 'RHC-02:NATIVE:V1',
      route: 'NATIVE' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'EDITRON_ADD_OVERLAY_INPUTS' as const,
        formOwnerRef: 'lib/editron/agent/tools.ts#add_overlay',
        mutationOwnerRef: 'lib/editron/services/project-service.ts#ProjectService.addOverlay',
        requestedOperations: nativeVisualRequests,
        audioMutationOperations: [] as const,
      },
      qualifications: {
        editableInputForm: true,
        audioBaselineBound: true,
        timebaseHandoff: true,
        boundaryHandoff: true,
        isolatedRevisionIssuedOverlayWriter: false,
        exactNativeFontFileBinding: false,
      },
      capabilityGapCodes: [
        'NATIVE_ADD_OVERLAY_FORM_NOT_EXTRACTED_FOR_ISOLATED_OWNER',
        'NATIVE_EXACT_FONT_FILE_BINDING_UNAVAILABLE',
      ] as const,
      handoffs: fixture.boundaryHandoff,
    },
    {
      ...common,
      candidateId: 'RHC-02:GENERATED_COMPOSITION:V1',
      route: 'GENERATED_COMPOSITION' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'GENERATED_COMPOSITION_REQUIREMENTS' as const,
        requiredVisualInputs: [
          { assetId: 'rhc02-still-a', mediaKind: 'STILL_IMAGE' },
          { assetId: 'rhc02-still-b', mediaKind: 'STILL_IMAGE' },
        ] as const,
        requiredText: 'How we shipped it',
        requiredFontAssetId: RHC02_PREVIEW_FONT_ID_V1,
        currentApiOwnerRef: 'generated-composition-api-v1.tsx#AssetSlot',
        currentProxyOwnerRef: 'generated-composition-proxy-renderer-v1.ts#materializeSources',
        currentSandboxContractRef: 'generated-composition-sandbox-contract-v1.ts#proxyReceiptSchema',
      },
      qualifications: {
        editableInputForm: false,
        stillImageSourceOwner: false,
        playableAudioPreservationOwner: false,
        generatedProgramVerified: false,
        timebaseHandoff: false,
        boundaryHandoff: false,
      },
      capabilityGapCodes: [
        'GENERATED_SOURCE_SLOT_STILL_IMAGE_UNSUPPORTED',
        'GENERATED_PROXY_PLAYABLE_AUDIO_ABSENT',
      ] as const,
      handoffs: null,
    },
    {
      ...common,
      candidateId: 'RHC-02:HYBRID:V1',
      route: 'HYBRID' as const,
      disposition: 'CAPABILITY_GAP' as const,
      candidateForm: {
        kind: 'GENERATED_VISUAL_ISLAND_WITH_NATIVE_AUDIO' as const,
        generatedVisualProjectRange: fixture.timelineMapping.absoluteTargetRange,
        generatedVisualCompositionRange: fixture.timelineMapping.compositionRange,
        nativeAudioOwner: fixture.audioBaseline.owner,
        nativeAudioBaselineHash: hashCanonicalJsonV1(fixture.audioBaseline),
        nativeAudioMutationAllowed: false as const,
        productMutationOwners: {
          prepare: 'lib/editron/services/project-service.ts#ProjectService.prepareProjectGeneratedCompositionV1',
          finalize: 'lib/editron/services/project-service.ts#ProjectService.finalizeProjectGeneratedCompositionV1',
        },
      },
      qualifications: {
        editableInputForm: false,
        nativeAudioBaselineBound: true,
        timebaseHandoff: true,
        audioHandoff: true,
        boundaryHandoff: true,
        stillImageSourceOwner: false,
        generatedProgramVerified: false,
        projectServiceGeneratedCompositionWriter: true,
        isolatedRevisionIssuedProposalAdapter: false,
      },
      capabilityGapCodes: [
        'HYBRID_GENERATED_STILL_IMAGE_OWNER_UNAVAILABLE',
        'HYBRID_ISOLATED_GENERATED_COMPOSITION_PROPOSAL_ADAPTER_UNAVAILABLE',
      ] as const,
      handoffs: fixture.boundaryHandoff,
    },
  ];
  const material = {
    version: STAGE25_RHC02_PREVIEW_CANDIDATES_VERSION_V1,
    artifactType: 'Stage25Rhc02PreviewCandidatesV1' as const,
    authority: 'RESEARCH_ROUTE_CONTRACT_AND_CAPABILITY_GAPS_NO_PROJECT_MUTATION' as const,
    taskSha256: String(task.taskSha256),
    fixture,
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

function buildNativeVisualRequests() {
  return deepFreezeV1([
    {
      operationId: 'rhc02-add-still-a',
      operatorId: 'add_overlay',
      arguments: {
        type: 'image', assetId: 'rhc02-still-a',
        start: TARGET_START, duration: TARGET_DURATION,
        row: 2, x: 0, y: 0, width: 540, height: 1920,
        styles: { objectFit: 'cover', opacity: 1 },
      },
    },
    {
      operationId: 'rhc02-add-still-b',
      operatorId: 'add_overlay',
      arguments: {
        type: 'image', assetId: 'rhc02-still-b',
        start: TARGET_START, duration: TARGET_DURATION,
        row: 1, x: 540, y: 0, width: 540, height: 1920,
        styles: { objectFit: 'cover', opacity: 1 },
      },
    },
    {
      operationId: 'rhc02-add-title',
      operatorId: 'add_overlay',
      arguments: {
        type: 'text', text: 'How we shipped it',
        start: TARGET_START, duration: TARGET_DURATION,
        row: 0, x: 108, y: 786, width: 864, height: 348,
        styles: {
          fontFamily: 'Noto Sans', fontSize: 76, fontWeight: 700,
          textAlign: 'center', color: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.58)', opacity: 1,
        },
      },
    },
  ] as const);
}

function predicateIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(
      (entry as { predicateId?: unknown }).predicateId ?? '',
    )).filter(Boolean)
    : [];
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_PREVIEW_${code}`);
}
