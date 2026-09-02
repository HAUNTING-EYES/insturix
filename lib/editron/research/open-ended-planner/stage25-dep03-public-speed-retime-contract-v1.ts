import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  V2R_OPERATOR_CATALOG,
  V2R_OPERATOR_CATALOG_REVISION,
} from './operator-catalog-v2r';

type JsonRecord = Record<string, unknown>;

export const DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1 =
  'EDITRON_OE_DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1_1' as const;

export const DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1 = [
  'mutationReceipt',
  'timelineChangeReceipt',
  'sourceRangeRetimeEffect',
  'sourceTimeTransform',
] as const;

const SOURCE_PATHS = [
  'lib/editron/agent/chat-visual-tools.ts',
  'lib/editron/services/project-service.ts',
  'lib/editron/services/video-source-range-retime-v1.ts',
  'lib/editron/services/video-source-time-transform-v1.ts',
] as const;

const CONTRACT_MATERIAL = {
  version: DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1,
  artifactType: 'Dep03PublicSpeedRetimeContractV1' as const,
  authority: 'STAGE25_ZERO_SPEND_PUBLIC_OPERATOR_SUCCESSOR_ONLY' as const,
  operatorId: 'apply_speed_ramp' as const,
  supersedesWithoutRewriting: {
    catalogRevision: V2R_OPERATOR_CATALOG_REVISION,
    frozenOutputFields: ['receipt'] as const,
    reason: 'The frozen V2R9 packet predates the callable writer-issued source-time transform.',
  },
  support: {
    disposition: 'RESEARCH_SUCCESSOR_CURRENT_CALLABLE_NOT_PRODUCTION_CERTIFIED' as const,
    closedSemanticForm: 'ISOLATED_WHOLE_SOURCE_RANGE_CFR_FAST_RETIME_V1' as const,
    plannerEligibility: 'STAGE25_ZERO_SPEND_OWNER_SENTINELS_ONLY' as const,
  },
  input: {
    fields: [
      'projectId',
      'expectedProjectRevision',
      'overlayId',
      'targetRange',
      'playbackRate',
      'sourceTimeEvidenceRef',
    ] as const,
    required: [
      'projectId',
      'expectedProjectRevision',
      'overlayId',
      'targetRange',
      'playbackRate',
      'sourceTimeEvidenceRef',
    ] as const,
    origins: {
      projectId: 'CURRENT_PROJECT_SCOPE',
      expectedProjectRevision: 'PROJECTSERVICE_PAIRED_MUTATION_SNAPSHOT',
      overlayId: 'RESOLVED_SINGLE_VIDEO_OWNER',
      targetRange: 'RESOLVED_EXACT_WHOLE_OVERLAY_TIMELINE_RANGE',
      playbackRate: 'MODEL_SELECTED_BOUNDED_FORM_VALUE_ABOVE_1_THROUGH_4',
      sourceTimeEvidenceRef: 'PROJECTSERVICE_PRIVATE_CURRENT_MEDIA_ASSET_RESOLUTION',
    },
    coordinateDomain: 'PROJECT_TIMELINE_FRAME_V1',
    sourceCadence: 'CFR_ONLY',
  },
  callableLowering: {
    runtimeToolFields: ['startFrame', 'endFrame', 'videoOverlayId', 'targetSpeed'] as const,
    mapping: {
      startFrame: 'targetRange.startFrame',
      endFrame: 'targetRange.endFrame',
      videoOverlayId: 'overlayId',
      targetSpeed: 'playbackRate',
    },
    compilerMayNotAddCreativeOperations: true,
  },
  output: {
    fields: DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1,
    required: DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1,
    downstreamBinding: 'sourceTimeTransform transforms source PTS into the current project frame.',
  },
  ownership: {
    caller: 'lib/editron/agent/chat-visual-tools.ts#apply_speed_ramp',
    mutationOwner: 'lib/editron/services/project-service.ts#applyVideoSourceRangeRetimeV1',
    formOwner: 'lib/editron/services/video-source-range-retime-v1#retimeIsolatedVideoSourceRangeV1',
    transformOwner: 'lib/editron/services/video-source-time-transform-v1#createProjectVideoSourceTimeTransformV1',
    downstreamConsumer: 'lib/editron/services/video-source-time-transform-v1#rebindSourcePresentationTimestampV1',
    rendererMapping: 'lib/editron/utils/keyframe-math.ts#computeSpeedSegments',
  },
  stateEffects: {
    reads: [
      'project revision', 'target video source bounds', 'current MEDIA_ASSETS PTS/cadence binding',
      'active Director lease', 'timeline locks', 'overlapping dependent overlays',
    ] as const,
    writes: [
      'target duration and speed renderer state', 'later non-overlapping overlay coordinates',
      'project duration', 'timelineRangeChangeReceipts',
    ] as const,
    produces: DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1,
    invalidates: [
      'affected-range render proof', 'project-time evidence after the retime seam',
      'downstream timeline-frame anchors not rebound from source identity',
    ] as const,
  },
  failureDispositions: [
    'STALE_PROJECT_REVISION',
    'ACTIVE_DIRECTOR_MUTATION',
    'OVERLAPPING_TIMELINE_LOCK',
    'TARGET_VIDEO_NOT_FOUND',
    'PARTIAL_OR_SLOW_RETIME_UNSUPPORTED',
    'SOURCE_RANGE_MISMATCH',
    'SOURCE_TIME_EVIDENCE_INCOMPLETE',
    'VFR_EVENT_REBIND_UNSUPPORTED',
    'SOURCE_HANDLES_INSUFFICIENT',
    'EXISTING_RETIME_STATE',
    'EXISTING_LOCAL_KEYFRAMES',
    'OVERLAPPING_DEPENDENT_OVERLAY',
  ] as const,
  retryUndoReplay: {
    staleRevision: 'RELOAD_AND_REPLAN',
    unsupportedOrUnsafeForm: 'NEVER_RETRY_UNCHANGED',
    undoReplay: 'NOT_CERTIFIED_BY_THIS_RESEARCH_SUCCESSOR',
  },
  proof: {
    currentCeiling: 'ISOLATED_SYNTHETIC_CURRENT_EDIT_PROOF_ONLY',
    requiredForPromotion: [
      'canonical ProjectService apply and reload',
      'rendered retime and downstream-effect proof',
      'real event/dialogue evidence quality',
      'undo/replay and invalidation-chain proof',
    ] as const,
  },
  privacyRightsInjection: {
    modelReceivesOpaqueSourceTimeEvidenceRefOnly: true,
    sourceBytesOrPrivatePtsIndexEgress: false,
    callerSuppliedBindingIsAuthority: false,
  },
  providerInferenceCallCount: 0 as const,
  renderCallCount: 0 as const,
  canonicalProjectMutationCount: 0 as const,
};

export const DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1 = deepFreezeV1({
  ...CONTRACT_MATERIAL,
  contractSha256: hashCanonicalJsonV1(CONTRACT_MATERIAL),
});

/**
 * Binds the successor to current source without mutating the frozen V2R9
 * catalog. This is a research preflight, not runtime feature detection.
 */
export function auditDep03PublicSpeedRetimeContractV1(): Readonly<JsonRecord> {
  const sources = Object.fromEntries(SOURCE_PATHS.map((path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    return [path, { source, sha256: createHash('sha256').update(source, 'utf8').digest('hex') }];
  })) as Record<typeof SOURCE_PATHS[number], { source: string; sha256: string }>;
  const chatSource = sources['lib/editron/agent/chat-visual-tools.ts'].source;
  const handlerStart = chatSource.indexOf('const applySpeedRamp = tool(');
  const handlerEnd = chatSource.indexOf('const applyFade = tool(', handlerStart);
  const handler = handlerStart >= 0 && handlerEnd > handlerStart
    ? chatSource.slice(handlerStart, handlerEnd)
    : '';
  const projectServiceSource = sources['lib/editron/services/project-service.ts'].source;
  const retimeOwnerSource = sources['lib/editron/services/video-source-range-retime-v1.ts'].source;
  const transformSource = sources['lib/editron/services/video-source-time-transform-v1.ts'].source;
  const historical = operator('apply_speed_ramp');
  const historicalOutput = record(historical.output);
  const checks = {
    frozenV2R9OutputStillReceiptOnly: sameStrings(historicalOutput.fields, ['receipt'])
      && sameStrings(historicalOutput.required, ['receipt']),
    successorOutputIsComplete: sameStrings(
      DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1.output.fields,
      DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1,
    ) && sameStrings(
      DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1.output.required,
      DEP03_PUBLIC_SPEED_RETIME_OUTPUT_FIELDS_V1,
    ),
    chatUsesPairedSnapshot: handler.includes('loadProjectForMutation(userId, projectId)'),
    chatUsesAtomicRetimeOwner: handler.includes('applyVideoSourceRangeRetimeV1('),
    chatReturnsTransformAndEffect: handler.includes('sourceTimeTransform')
      && handler.includes('sourceRangeRetimeEffect')
      && handler.includes('timelineChangeReceipt')
      && handler.includes('mutationReceipt'),
    chatDoesNotUseGenericOverlayWriter: !handler.includes('projectService.updateOverlay'),
    chatDeclaresClosedForm: handler.includes('ISOLATED_WHOLE_SOURCE_RANGE_CFR_FAST_RETIME_V1'),
    projectServiceIssuesTransform: projectServiceSource.includes('async applyVideoSourceRangeRetimeV1(')
      && projectServiceSource.includes('createProjectVideoSourceTimeTransformV1({')
      && projectServiceSource.includes('sourceTimeTransform,'),
    pureRetimeOwnerPresent: retimeOwnerSource.includes('export function retimeIsolatedVideoSourceRangeV1('),
    downstreamRebindOwnerPresent: transformSource.includes('export function rebindSourcePresentationTimestampV1('),
  };
  const material = {
    auditVersion: 'EDITRON_OE_DEP03_PUBLIC_SPEED_RETIME_CONTRACT_AUDIT_V1_1' as const,
    contractVersion: DEP03_PUBLIC_SPEED_RETIME_CONTRACT_VERSION_V1,
    contractSha256: DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1.contractSha256,
    historicalCatalogRevision: V2R_OPERATOR_CATALOG_REVISION,
    sourceFiles: SOURCE_PATHS.map((path) => ({ path, sha256: sources[path].sha256 })),
    checks,
    allChecksPass: Object.values(checks).every(Boolean),
    conclusion: 'PUBLIC_SUCCESSOR_AVAILABLE_FROZEN_V2R9_UNCHANGED' as const,
  };
  return deepFreezeV1({ ...material, auditSha256: hashCanonicalJsonV1(material) });
}

function operator(operatorId: string): JsonRecord {
  const operators = Array.isArray(V2R_OPERATOR_CATALOG.operators)
    ? V2R_OPERATOR_CATALOG.operators : [];
  const found = operators.find((value) => record(value).operatorId === operatorId);
  if (!found) throw new Error(`DEP03_PUBLIC_SPEED_RETIME_OPERATOR_MISSING:${operatorId}`);
  return record(found);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}
