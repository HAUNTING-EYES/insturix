import canonicalEvidenceBoundIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-evidence-bound-intent-v2.json';
import canonicalEditorialIntentJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-editorial-intent-v2.json';
import canonicalReferenceBlueprintJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-canonical-reference-blueprint-v2.json';
import evidencePackJson from '@/tests/fixtures/editron/open-ended-planner-v2/dev02-stage3-evidence-pack-v2.json';
import operatorCatalogJson from '@/tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  executeDev01TruthCutV2,
  getCanonicalDev01NativeProxyFixtureV2,
  mapDev01SourceTimelineFrameV2,
  mapDev01SourceTimelineRangeV2,
} from './dev01-native-proxy-fixture-v2';
import { getCanonicalDev01Stage123V2 } from './dev01-stage123-canonical-v2';
import {
  resolveDev01CompilerMaterializationTraceV1,
  resolveDev01Stage4RoleSymbolsV2,
} from './dev01-stage4-role-resolver-v2';
import { resolveDev02Stage4RoleSymbolsV2 } from './dev02-stage4-role-resolver-v2';

type JsonRecord = Record<string, unknown>;

export interface Stage4DeterministicCompilerInputV2 {
  referenceBlueprint?: unknown;
  editorialIntent: unknown;
  evidenceBoundIntent: unknown;
  evidencePack: unknown;
}

const canonicalEditorialIntent = canonicalEditorialIntentJson as unknown as JsonRecord;
const canonicalEvidenceBoundIntent = canonicalEvidenceBoundIntentJson as unknown as JsonRecord;
const canonicalReferenceBlueprint = canonicalReferenceBlueprintJson as unknown as JsonRecord;
const canonicalEvidencePack = evidencePackJson as unknown as JsonRecord;
const operatorCatalog = operatorCatalogJson as unknown as JsonRecord;
const operators = new Map(records(operatorCatalog.operators).map((operator) => [text(operator.operatorId), operator]));
const canonicalDev01 = getCanonicalDev01Stage123V2();
const canonicalDev01Fixture = getCanonicalDev01NativeProxyFixtureV2();

export function compileCanonicalStage4DeterministicBaselineV2(): Readonly<JsonRecord> {
  return compileStage4DeterministicBaselineV2({
    referenceBlueprint: canonicalReferenceBlueprint,
    editorialIntent: canonicalEditorialIntent,
    evidenceBoundIntent: canonicalEvidenceBoundIntent,
    evidencePack: canonicalEvidencePack,
  });
}

export function compileStage4DeterministicBaselineV2(input: Stage4DeterministicCompilerInputV2): Readonly<JsonRecord> {
  assertCanonicalSource('EVIDENCE_PACK', input.evidencePack, canonicalEvidencePack);
  const roles = resolveDev02Stage4RoleSymbolsV2({
    referenceBlueprint: input.referenceBlueprint ?? canonicalReferenceBlueprint,
    editorialIntent: input.editorialIntent,
    evidenceBoundIntent: input.evidenceBoundIntent,
    evidencePack: input.evidencePack,
  });

  const editorialIntent = record(input.editorialIntent);
  const evidenceBoundIntent = record(input.evidenceBoundIntent);
  const evidencePack = record(input.evidencePack);
  const facts = records(evidencePack.facts);
  const factsById = new Map(facts.map((fact) => [text(fact.factId), fact]));
  const sourceNode = requiredById(records(evidenceBoundIntent.nodes), 'intentNodeId', roles.sourceResolutionIntentNodeId, 'SOURCE_INTENT');
  const continuationNode = requiredById(records(editorialIntent.nodes), 'intentNodeId', roles.nativeContinuationIntentNodeId, 'CONTINUATION_INTENT');
  const proofNode = requiredById(records(editorialIntent.nodes), 'intentNodeId', roles.proofIntentNodeId, 'PROOF_INTENT');
  requireSetContains(strings(sourceNode.candidateCapabilityIds), ['inspect_user_asset', 'resolve_user_asset_overlay'], 'SOURCE_OPERATOR_SET');

  const revision = record(evidenceBoundIntent.revisionBinding);
  const projectId = requiredText(revision.projectId, 'PROJECT_ID');
  const expectedProjectRevision = requiredText(revision.expectedProjectRevision, 'PROJECT_REVISION');
  const timebaseFactId = requiredText(revision.timebaseFactId, 'PROJECT_TIMEBASE_FACT');
  requiredFact(factsById, timebaseFactId);
  const revisionFact = requiredFactByKind(facts, 'PROJECT_REVISION');
  const targetRangeFact = requiredFactByKind(facts, 'AUTHORIZED_TARGET_RANGE');
  const targetRange = {
    startFrame: safeInteger(targetRangeFact.start, 'TARGET_RANGE_START'),
    endFrame: safeInteger(targetRangeFact.endExclusive, 'TARGET_RANGE_END'),
  };
  if (targetRange.endFrame <= targetRange.startFrame) throw new Error('STAGE4_BASELINE_TARGET_RANGE_INVALID');

  const sourceWindowsFact = requiredFactByKind(facts, 'ALLOWED_SOURCE_WINDOWS');
  const rightsPolicyFact = requiredFactByKind(facts, 'RIGHTS_POLICY');
  const privacyPolicyFact = requiredFactByKind(facts, 'PRIVACY_EGRESS_POLICY');
  const rightsDecision = record(evidenceBoundIntent.rightsDecision);
  const allowedAssetIds = unique(strings(rightsDecision.allowedAssetIds)).sort(compareUtf16);
  if (!allowedAssetIds.length) throw new Error('STAGE4_BASELINE_ALLOWED_ASSET_SET_EMPTY');
  const sourceFactsByAsset = new Map(
    facts.filter((fact) => fact.kind === 'SOURCE_MEDIA_IDENTITY').map((fact) => [text(fact.assetId), fact]),
  );
  for (const assetId of allowedAssetIds) if (!sourceFactsByAsset.has(assetId)) throw new Error(`STAGE4_BASELINE_SOURCE_FACT_MISSING:${assetId}`);

  const sourceBindingIds = strings(sourceNode.evidenceBindingIds);
  const sourceProofIds = strings(sourceNode.proofObligationIds);
  const sourcePreservationIds = strings(sourceNode.preservationIds);
  const policyFactIds = [text(rightsPolicyFact.factId), text(privacyPolicyFact.factId)];
  const nodes: JsonRecord[] = [];
  const edges: JsonRecord[] = [];
  for (const assetId of allowedAssetIds) {
    const sourceFact = sourceFactsByAsset.get(assetId) as JsonRecord;
    const sourceFactId = requiredText(sourceFact.factId, `SOURCE_FACT_ID:${assetId}`);
    const inspectNodeId = `compile-inspect-${assetId}`;
    const resolveNodeId = `compile-resolve-${assetId}`;
    nodes.push(compiledNode({
      nodeId: inspectNodeId,
      intentNodeId: roles.sourceResolutionIntentNodeId,
      operatorId: 'inspect_user_asset',
      inputs: { projectId, assetId },
      reads: [sourceFactId, text(sourceWindowsFact.factId), text(rightsPolicyFact.factId)],
      requires: [],
      coordinateBindings: [{
        coordinateDomain: requiredText(sourceFact.coordinateDomain, `SOURCE_COORDINATE_DOMAIN:${assetId}`),
        timebaseFactIds: [sourceFactId], rangeFactIds: [text(sourceWindowsFact.factId)], assetFactIds: [sourceFactId],
      }],
      projectId, expectedProjectRevision, revisionFactId: text(revisionFact.factId),
      proofObligationIds: sourceProofIds, policyFactIds,
      traceRefs: [roles.sourceResolutionIntentNodeId, ...sourceBindingIds, ...sourceProofIds, ...sourcePreservationIds],
    }));
    nodes.push(compiledNode({
      nodeId: resolveNodeId,
      intentNodeId: roles.sourceResolutionIntentNodeId,
      operatorId: 'resolve_user_asset_overlay',
      inputs: { projectId, expectedProjectRevision, assetId, targetRange },
      reads: [text(revisionFact.factId), timebaseFactId, text(targetRangeFact.factId), sourceFactId, text(sourceWindowsFact.factId), text(rightsPolicyFact.factId)],
      requires: [`${inspectNodeId}.result`],
      coordinateBindings: [
        { coordinateDomain: requiredText(sourceFact.coordinateDomain, `SOURCE_COORDINATE_DOMAIN:${assetId}`), timebaseFactIds: [sourceFactId], rangeFactIds: [text(sourceWindowsFact.factId)], assetFactIds: [sourceFactId] },
        { coordinateDomain: 'PROJECT_TICK', timebaseFactIds: [timebaseFactId], rangeFactIds: [text(targetRangeFact.factId)], assetFactIds: [sourceFactId] },
      ],
      projectId, expectedProjectRevision, revisionFactId: text(revisionFact.factId),
      proofObligationIds: sourceProofIds, policyFactIds,
      traceRefs: [roles.sourceResolutionIntentNodeId, ...sourceBindingIds, ...sourceProofIds, ...sourcePreservationIds],
    }));
    edges.push({
      edgeId: `edge-${inspectNodeId}-${resolveNodeId}`,
      fromNodeId: inspectNodeId,
      toNodeId: resolveNodeId,
      edgeType: 'DATA',
    });
  }

  const proofIds = records(evidenceBoundIntent.proofPlan).map((proof) => requiredText(proof.proofObligationId, 'PROOF_ID'));
  const preservationIds = records(evidenceBoundIntent.preservationBindings).map((entry) => requiredText(entry.preservationId, 'PRESERVATION_ID'));
  const material: JsonRecord = {
    artifactType: 'CompiledOperationGraphV2',
    taskId: requiredText(editorialIntent.taskId, 'TASK_ID'),
    compileDisposition: 'CAPABILITY_GAP',
    executionEligibility: 'NOT_EXECUTABLE',
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent),
    sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent),
    evidencePackHash: hashCanonicalJsonV1(evidencePack),
    operatorCatalogVersion: requiredText(operatorCatalog.version, 'OPERATOR_CATALOG_VERSION'),
    projectId,
    expectedProjectRevision,
    nodes,
    edges,
    proofPolicy: {
      proofVersion: 'OE_STAGE4_PROOF_POLICY_V1',
      mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION',
      proofObligationIds: proofIds,
      preservationIds,
      onUnverifiable: 'BLOCK_EXECUTION',
    },
    diagnostics: [
      { diagnosticId: 'diag-generated-owner', code: 'CAPABILITY_NOT_IMPLEMENTED', intentNodeIds: [roles.generatedIslandIntentNodeId], operatorIds: ['generated_composition_program'], factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-continuation-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: [roles.nativeContinuationIntentNodeId], operatorIds: strings(continuationNode.candidateCapabilityIds), factIds: ['fact-support-generated-composition', 'fact-exit-continuity'], disposition: 'CAPABILITY_GAP' },
      { diagnosticId: 'diag-proof-blocked', code: 'DEPENDENCY_BLOCKED', intentNodeIds: [roles.proofIntentNodeId], operatorIds: strings(proofNode.candidateCapabilityIds), factIds: ['fact-support-generated-composition'], disposition: 'CAPABILITY_GAP' },
    ],
    unresolvedIntentNodeIds: [
      roles.generatedIslandIntentNodeId,
      roles.nativeContinuationIntentNodeId,
      roles.proofIntentNodeId,
    ],
  };
  return deepFreezeV1(material);
}

export function compileCanonicalDev01Stage4NativeV2(): Readonly<JsonRecord> {
  return compileDev01Stage4NativeV2({
    referenceBlueprint: canonicalDev01.referenceBlueprints.BASELINE,
    editorialIntent: canonicalDev01.editorialIntent,
    evidenceBoundIntent: canonicalDev01.evidenceBoundIntents.BASELINE,
    evidencePack: canonicalDev01.evidencePacks.BASELINE,
  });
}

export function compileDev01Stage4NativeV2(input: Stage4DeterministicCompilerInputV2): Readonly<JsonRecord> {
  assertDev01EvidencePack(input.evidencePack);
  const referenceBlueprint = input.referenceBlueprint ?? canonicalDev01.referenceBlueprints.BASELINE;
  const roles = resolveDev01Stage4RoleSymbolsV2({
    referenceBlueprint,
    editorialIntent: input.editorialIntent,
    evidenceBoundIntent: input.evidenceBoundIntent,
    evidencePack: input.evidencePack,
  });

  const editorialIntent = record(input.editorialIntent);
  const evidenceBoundIntent = record(input.evidenceBoundIntent);
  const evidencePack = record(input.evidencePack);
  if (evidenceBoundIntent.stageDisposition !== 'READY_FOR_COMPILATION') {
    throw new Error(`STAGE4_DEV01_SOURCE_NOT_COMPILABLE:${String(evidenceBoundIntent.stageDisposition)}`);
  }
  const facts = records(evidencePack.facts);
  const transcriptFact = requiredFactByKind(facts, 'TRANSCRIPT_RANGE');
  const visualFact = requiredFactByKind(facts, 'VISUAL_TARGET');
  const audioFact = requiredFactByKind(facts, 'SEPARATE_AUDIO_STEMS');
  const revisionFact = requiredFactByKind(facts, 'PROJECT_REVISION');
  const timebaseFact = requiredFactByKind(facts, 'PROJECT_TIMEBASE');
  const fixtureFact = requiredFactByKind(facts, 'SYNTHETIC_SOURCE_FIXTURE');
  const rightsFact = requiredFactByKind(facts, 'RIGHTS_POLICY');
  const privacyFact = requiredFactByKind(facts, 'PRIVACY_EGRESS_POLICY');
  const revision = record(evidenceBoundIntent.revisionBinding);
  const projectId = requiredText(revision.projectId, 'DEV01_PROJECT_ID');
  const initialRevision = requiredText(revision.expectedProjectRevision, 'DEV01_PROJECT_REVISION');
  const cutStart = safeInteger(recordRange(transcriptFact.deadAirRange)[0], 'DEV01_CUT_START');
  const cutEnd = safeInteger(recordRange(transcriptFact.deadAirRange)[1], 'DEV01_CUT_END');
  const sourceRevealFrame = safeInteger(visualFact.sourceFrame, 'DEV01_REVEAL_SOURCE_FRAME');
  const truthCut = executeDev01TruthCutV2();
  const hostRight = truthCut.splitChildren.find(({ beforeOverlayId }) => beforeOverlayId === 101)
    ?? fail('STAGE4_DEV01_HOST_SPLIT_CHILD_MISSING');
  const revealOutputFrame = mapDev01SourceTimelineFrameV2(sourceRevealFrame)
    ?? fail('STAGE4_DEV01_REVEAL_REMOVED_BY_CUT');
  const revealLocalFrame = revealOutputFrame - hostRight.rightTimelineStartFrame;
  const outputSpeechRanges = recordsOfRanges(audioFact.speechSourceRanges).map(mapDev01SourceTimelineRangeV2);
  const bgmAssetId = requiredText(audioFact.bgmAssetId, 'DEV01_BGM_ASSET');
  const dialogueAssetId = requiredText(audioFact.dialogueAssetId, 'DEV01_DIALOGUE_ASSET');
  if (bgmAssetId === dialogueAssetId) throw new Error('STAGE4_DEV01_AUDIO_STEMS_NOT_SEPARATE');
  const bgmOverlay = truthCut.overlays.find((overlay) => overlay.assetId === bgmAssetId)
    ?? fail('STAGE4_DEV01_BGM_OVERLAY_MISSING');
  const bgmOverlayId = requiredText(String(bgmOverlay.id), 'DEV01_BGM_OVERLAY_ID');
  const hostOverlayRef = '@compile-cut.splitChildren[beforeOverlayId=101].rightOverlayId';
  const cutRevisionRef = '@compile-cut.receipt.revision';
  const pushRevisionRef = '@compile-push.receipt.revision';
  const duckRevisionRef = '@compile-duck.receipt.revision';
  const policyFactIds = [requiredText(rightsFact.factId, 'DEV01_RIGHTS_FACT'), requiredText(privacyFact.factId, 'DEV01_PRIVACY_FACT')];
  const fixtureFactId = requiredText(fixtureFact.factId, 'DEV01_FIXTURE_FACT');
  const revisionFactId = requiredText(revisionFact.factId, 'DEV01_REVISION_FACT');
  const timebaseFactId = requiredText(timebaseFact.factId, 'DEV01_TIMEBASE_FACT');
  const transcriptFactId = requiredText(transcriptFact.factId, 'DEV01_TRANSCRIPT_FACT');
  const visualFactId = requiredText(visualFact.factId, 'DEV01_VISUAL_FACT');
  const audioFactId = requiredText(audioFact.factId, 'DEV01_AUDIO_FACT');
  const projectRange = { startFrame: 0, endFrame: canonicalDev01Fixture.project.durationInFrames };
  const outputRange = { startFrame: 0, endFrame: truthCut.newDurationInFrames };
  const cutRange = { startFrame: cutStart, endFrame: cutEnd };
  const visualRange = { startFrame: sourceRevealFrame, endFrame: sourceRevealFrame + 1 };
  const projectCoordinate = (rangeFactIds: string[]): JsonRecord[] => [{
    coordinateDomain: 'PROJECT_TICK', timebaseFactIds: [timebaseFactId], rangeFactIds, assetFactIds: [fixtureFactId],
  }];
  const sourceVisualCoordinate: JsonRecord[] = [{
    coordinateDomain: 'SOURCE_FRAME', timebaseFactIds: [timebaseFactId], rangeFactIds: [visualFactId], assetFactIds: [fixtureFactId],
  }];
  const sourceAudioCoordinate: JsonRecord[] = [{
    coordinateDomain: 'SOURCE_SAMPLE', timebaseFactIds: [], rangeFactIds: [audioFactId], assetFactIds: [fixtureFactId],
  }, ...projectCoordinate([audioFactId])];
  const boundNodes = new Map(records(evidenceBoundIntent.nodes).map((node) => [text(node.intentNodeId), node]));
  const makeNode = (input: Omit<Dev01CompiledNodeInput, 'projectId' | 'revisionFactId' | 'policyFactIds' | 'boundIntent'>): JsonRecord => {
    const boundIntent = boundNodes.get(input.intentNodeId) ?? fail(`STAGE4_DEV01_BOUND_INTENT_MISSING:${input.intentNodeId}`);
    return compiledDev01Node({ ...input, projectId, revisionFactId, policyFactIds, boundIntent });
  };

  const resolvedAudioPlan = {
    sourceFactId: audioFactId,
    outputSpeechRanges,
    storedState: canonicalDev01Fixture.operatorContractAmendments.applyAudioDucking.storedState,
    rendererEffect: canonicalDev01Fixture.operatorContractAmendments.applyAudioDucking.rendererEffect,
    ...(roles.audioResolverIntentNodeId
      ? { fromOutputRef: 'compile-resolve-audio.proposedOperation' }
      : {}),
  };
  const nodes: JsonRecord[] = [
    makeNode({ nodeId: 'compile-read-project', intentNodeId: roles.readProjectIntentNodeId, operatorId: 'read_project_file', inputs: { projectId, expectedProjectRevision: initialRevision, selector: { fields: ['overlays', 'durationInFrames', 'fps'] } }, reads: [revisionFactId, fixtureFactId], requires: [], coordinateBindings: projectCoordinate([fixtureFactId]), expectedProjectRevision: initialRevision }),
    makeNode({ nodeId: 'compile-read-timeline', intentNodeId: roles.readTimelineIntentNodeId, operatorId: 'get_timeline_view', inputs: { projectId, expectedProjectRevision: initialRevision, targetRange: projectRange }, reads: [revisionFactId, timebaseFactId, fixtureFactId], requires: ['compile-read-project.result'], coordinateBindings: projectCoordinate([fixtureFactId]), expectedProjectRevision: initialRevision }),
    makeNode({ nodeId: 'compile-find-transcript', intentNodeId: roles.transcriptFinderIntentNodeId, operatorId: 'find_transcript_moment', inputs: { projectId, query: 'here it is', evidenceIds: ['EV-DEV01-T1'], targetRange: cutRange }, reads: [transcriptFactId, fixtureFactId], requires: ['compile-read-timeline.result'], coordinateBindings: projectCoordinate([transcriptFactId]), expectedProjectRevision: initialRevision }),
    makeNode({ nodeId: 'compile-resolve-cut', intentNodeId: roles.transcriptResolverIntentNodeId, operatorId: 'resolve_transcript_edit', inputs: { projectId, expectedProjectRevision: initialRevision, intent: { kind: 'CUT_ONLY_BOUND_DEAD_AIR', preserveAllSpeech: true }, evidenceIds: ['EV-DEV01-T1'], constraints: { phraseRange: numberPair(transcriptFact.phraseRange, 'DEV01_PHRASE_RANGE'), deadAirRange: [cutStart, cutEnd], nextWordFrame: safeInteger(transcriptFact.nextWordFrame, 'DEV01_NEXT_WORD') } }, reads: [revisionFactId, transcriptFactId, fixtureFactId], requires: ['compile-find-transcript.result'], coordinateBindings: projectCoordinate([transcriptFactId]), expectedProjectRevision: initialRevision }),
    makeNode({ nodeId: 'compile-cut', intentNodeId: roles.cutIntentNodeId, operatorId: 'cut_section', inputs: { projectId, expectedProjectRevision: initialRevision, targetRange: cutRange, constraints: { preserveAllSpeech: true, requireTimelineCoordinateTransform: true, requireSplitChildren: true }, evidenceIds: ['EV-DEV01-T1'] }, reads: [revisionFactId, timebaseFactId, transcriptFactId, fixtureFactId], requires: ['compile-resolve-cut.proposedOperation'], coordinateBindings: projectCoordinate([transcriptFactId]), expectedProjectRevision: initialRevision, produces: ['compile-cut.receipt', 'compile-cut.timelineCoordinateTransform', 'compile-cut.splitChildren'], writes: [`project:${projectId}.overlays`, `project:${projectId}.durationInFrames`], invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_OUTPUT_PROOF', 'TIMELINE_COORDINATE_BINDINGS'] }),
    makeNode({ nodeId: 'compile-find-product', intentNodeId: roles.visualFinderIntentNodeId, operatorId: 'find_visual_moment', inputs: { projectId, query: 'product-box at the measured reveal', assetIds: [canonicalDev01Fixture.assets.hostVideoAssetId], targetRange: visualRange }, reads: [visualFactId, fixtureFactId], requires: ['compile-cut.timelineCoordinateTransform', 'compile-cut.splitChildren'], coordinateBindings: sourceVisualCoordinate, expectedProjectRevision: cutRevisionRef }),
    makeNode({ nodeId: 'compile-resolve-product', intentNodeId: roles.keyframeResolverIntentNodeId, operatorId: 'resolve_keyframe_edit', inputs: { projectId, expectedProjectRevision: cutRevisionRef, overlayId: hostOverlayRef, intent: { kind: 'RESTRAINED_PRODUCT_PUSH_IN', sourceFrame: sourceRevealFrame, outputTimelineFrame: revealOutputFrame, rightChildLocalFrame: revealLocalFrame }, evidenceIds: ['EV-DEV01-V1'], constraints: { expectedResolvedOverlayId: String(hostRight.rightOverlayId), normalizedBox: numbers(visualFact.normalizedBox), normalizedFocalPoint: numbers(visualFact.normalizedFocalPoint), scaleBounds: [...canonicalDev01Fixture.expected.scaleBounds], preserveNonTargetGeometry: true } }, reads: [revisionFactId, timebaseFactId, visualFactId, fixtureFactId], requires: ['compile-find-product.result', 'compile-cut.timelineCoordinateTransform', 'compile-cut.splitChildren'], coordinateBindings: [...sourceVisualCoordinate, ...projectCoordinate([visualFactId])], expectedProjectRevision: cutRevisionRef }),
    makeNode({ nodeId: 'compile-push', intentNodeId: roles.pushIntentNodeId, operatorId: 'set_keyframes', inputs: { projectId, expectedProjectRevision: cutRevisionRef, overlayId: hostOverlayRef, keyframes: [{ fromOutputRef: 'compile-resolve-product.proposedOperation.keyframes' }], evidenceIds: ['EV-DEV01-V1'] }, reads: [revisionFactId, visualFactId, fixtureFactId], requires: ['compile-resolve-product.proposedOperation', 'compile-cut.splitChildren'], coordinateBindings: projectCoordinate([visualFactId]), expectedProjectRevision: cutRevisionRef, writes: [`project:${projectId}.overlays.${hostOverlayRef}.keyframeTracks.scale`], invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_GEOMETRY_PROOF'] }),
    makeNode({ nodeId: 'compile-find-audio', intentNodeId: roles.audioFinderIntentNodeId, operatorId: 'find_audio_moment', inputs: { projectId, query: 'measured dialogue ranges and separate background music', assetIds: [dialogueAssetId, bgmAssetId], targetRange: outputRange }, reads: [audioFactId, fixtureFactId], requires: ['compile-cut.timelineCoordinateTransform'], coordinateBindings: sourceAudioCoordinate, expectedProjectRevision: cutRevisionRef }),
    ...(roles.audioResolverIntentNodeId ? [makeNode({ nodeId: 'compile-resolve-audio', intentNodeId: roles.audioResolverIntentNodeId, operatorId: 'resolve_audio_edit', inputs: { projectId, expectedProjectRevision: cutRevisionRef, intent: { kind: 'DIALOGUE_PROTECTION_DUCKING', targetOverlayId: bgmOverlayId }, evidenceIds: ['EV-DEV01-A1'], constraints: { dialogueAssetId, bgmAssetId, outputSpeechRanges, preserveOutsideSpeech: true } }, reads: [revisionFactId, audioFactId, fixtureFactId], requires: ['compile-find-audio.result', 'compile-cut.timelineCoordinateTransform'], coordinateBindings: sourceAudioCoordinate, expectedProjectRevision: cutRevisionRef })] : []),
    makeNode({ nodeId: 'compile-duck', intentNodeId: roles.duckIntentNodeId, operatorId: 'apply_audio_ducking', inputs: { projectId, expectedProjectRevision: pushRevisionRef, overlayId: bgmOverlayId, audioPlan: resolvedAudioPlan, evidenceIds: ['EV-DEV01-A1'] }, reads: [revisionFactId, audioFactId, fixtureFactId], requires: [roles.audioResolverIntentNodeId ? 'compile-resolve-audio.proposedOperation' : 'compile-find-audio.result', 'compile-cut.timelineCoordinateTransform', 'compile-push.receipt'], coordinateBindings: sourceAudioCoordinate, expectedProjectRevision: pushRevisionRef, stateEffects: [canonicalDev01Fixture.operatorContractAmendments.applyAudioDucking.storedState], writes: [`project:${projectId}.overlays.${bgmOverlayId}.styles.duckingConfig`], invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_AUDIO_MIX_PROOF'] }),
    makeNode({ nodeId: 'compile-proof-read', intentNodeId: roles.proofReadIntentNodeId, operatorId: 'read_project_file', inputs: { projectId, expectedProjectRevision: duckRevisionRef, selector: { fields: ['overlays', 'durationInFrames', 'fps'] } }, reads: [revisionFactId, fixtureFactId, transcriptFactId, visualFactId, audioFactId], requires: ['compile-duck.receipt'], coordinateBindings: projectCoordinate([fixtureFactId]), expectedProjectRevision: duckRevisionRef }),
    makeNode({ nodeId: 'compile-proof-timeline', intentNodeId: roles.proofTimelineIntentNodeId, operatorId: 'get_timeline_view', inputs: { projectId, expectedProjectRevision: duckRevisionRef, targetRange: outputRange }, reads: [revisionFactId, timebaseFactId, fixtureFactId, transcriptFactId, visualFactId, audioFactId], requires: ['compile-proof-read.result', 'compile-duck.receipt'], coordinateBindings: projectCoordinate([fixtureFactId]), expectedProjectRevision: duckRevisionRef }),
  ];
  const edge = (edgeId: string, fromNodeId: string, toNodeId: string, edgeType: string): JsonRecord => ({ edgeId, fromNodeId, toNodeId, edgeType });
  const edges = [
    edge('edge-read-project-timeline', 'compile-read-project', 'compile-read-timeline', 'DATA'),
    edge('edge-timeline-find-transcript', 'compile-read-timeline', 'compile-find-transcript', 'DATA'),
    edge('edge-find-transcript-resolve-cut', 'compile-find-transcript', 'compile-resolve-cut', 'DATA'),
    edge('edge-resolve-cut-cut', 'compile-resolve-cut', 'compile-cut', 'DATA'),
    edge('edge-cut-find-product', 'compile-cut', 'compile-find-product', 'READ_AFTER_WRITE'),
    edge('edge-find-product-resolve-product', 'compile-find-product', 'compile-resolve-product', 'DATA'),
    edge('edge-cut-resolve-product', 'compile-cut', 'compile-resolve-product', 'TIME_ANCHOR'),
    edge('edge-resolve-product-push', 'compile-resolve-product', 'compile-push', 'DATA'),
    edge('edge-cut-push', 'compile-cut', 'compile-push', 'READ_AFTER_WRITE'),
    edge('edge-cut-find-audio', 'compile-cut', 'compile-find-audio', 'TIME_ANCHOR'),
    ...(roles.audioResolverIntentNodeId
      ? [edge('edge-find-audio-resolve-audio', 'compile-find-audio', 'compile-resolve-audio', 'DATA'), edge('edge-resolve-audio-duck', 'compile-resolve-audio', 'compile-duck', 'DATA')]
      : [edge('edge-find-audio-duck', 'compile-find-audio', 'compile-duck', 'DATA')]),
    edge('edge-push-duck', 'compile-push', 'compile-duck', 'WRITE_CONFLICT'),
    edge('edge-duck-proof-read', 'compile-duck', 'compile-proof-read', 'PROOF'),
    edge('edge-proof-read-timeline', 'compile-proof-read', 'compile-proof-timeline', 'PROOF'),
  ];
  const proofIds = records(evidenceBoundIntent.proofPlan).map((proof) => requiredText(proof.proofObligationId, 'DEV01_PROOF_ID'));
  const preservationIds = records(evidenceBoundIntent.preservationBindings).map((entry) => requiredText(entry.preservationId, 'DEV01_PRESERVATION_ID'));
  return deepFreezeV1({
    artifactType: 'CompiledOperationGraphV2', taskId: 'DEV-01', compileDisposition: 'COMPILED_RESEARCH_PROXY', executionEligibility: 'RESEARCH_PROXY_ONLY',
    sourceEditorialIntentHash: hashCanonicalJsonV1(editorialIntent), sourceEvidenceBoundIntentHash: hashCanonicalJsonV1(evidenceBoundIntent), evidencePackHash: hashCanonicalJsonV1(evidencePack),
    operatorCatalogVersion: requiredText(operatorCatalog.version, 'OPERATOR_CATALOG_VERSION'), projectId, expectedProjectRevision: initialRevision,
    nodes, edges,
    proofPolicy: { proofVersion: 'OE_DEV01_STAGE4_PROOF_POLICY_V1', mode: 'ALL_BOUND_OBLIGATIONS_REQUIRED_BEFORE_EXECUTION', proofObligationIds: proofIds, preservationIds, onUnverifiable: 'BLOCK_EXECUTION' },
    diagnostics: [], unresolvedIntentNodeIds: [],
  });
}

interface Dev01CompiledNodeInput {
  nodeId: string;
  intentNodeId: string;
  operatorId: string;
  inputs: JsonRecord;
  reads: string[];
  requires: string[];
  coordinateBindings: JsonRecord[];
  projectId: string;
  expectedProjectRevision: string;
  revisionFactId: string;
  policyFactIds: string[];
  boundIntent: JsonRecord;
  produces?: string[];
  stateEffects?: string[];
  writes?: string[];
  invalidates?: string[];
}

function compiledDev01Node(input: Dev01CompiledNodeInput): JsonRecord {
  const operator = operators.get(input.operatorId);
  if (!operator || !['RESEARCH_READ_ONLY', 'ISOLATED_PROXY_ONLY'].includes(requiredText(operator.compilerEligibility, `DEV01_OPERATOR_ELIGIBILITY:${input.operatorId}`))) {
    throw new Error(`STAGE4_DEV01_OPERATOR_FORBIDDEN:${input.operatorId}`);
  }
  const kind = requiredText(operator.kind, `DEV01_OPERATOR_KIND:${input.operatorId}`);
  const mutating = kind === 'MUTATION';
  const writes = unique(input.writes ?? []);
  const invalidates = unique(input.invalidates ?? []);
  if (mutating !== Boolean(writes.length && invalidates.length)) throw new Error(`STAGE4_DEV01_STATE_EFFECT_CONTRACT_INVALID:${input.nodeId}`);
  const proofIds = strings(input.boundIntent.proofObligationIds);
  const preservationIds = strings(input.boundIntent.preservationIds);
  const bindingIds = strings(input.boundIntent.evidenceBindingIds);
  const materializationTrace = resolveDev01CompilerMaterializationTraceV1({
    nodeId: input.nodeId,
    sourceIntentNodeId: input.intentNodeId,
    operatorId: input.operatorId,
    candidateCapabilityIds: strings(input.boundIntent.candidateCapabilityIds),
  });
  return {
    nodeId: input.nodeId, intentNodeId: input.intentNodeId, operatorId: input.operatorId,
    operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalog.version}#${input.operatorId}`,
    ownerRef: requiredText(operator.ownerRef, `DEV01_OPERATOR_OWNER:${input.operatorId}`),
    inputs: input.inputs, reads: unique(input.reads), writes, requires: unique(input.requires),
    produces: input.produces ?? strings(record(operator.output).required).map((outputName) => `${input.nodeId}.${outputName}`),
    invalidates, coordinateBindings: input.coordinateBindings,
    revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision },
    stabilityRequirement: 'RANGE_STABLE', stateEffects: input.stateEffects ?? strings(operator.stateEffects),
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: unique([input.intentNodeId, input.expectedProjectRevision, input.revisionFactId, ...input.reads, ...input.requires]) },
    proofObligationIds: proofIds, failureDisposition: 'ABORT_GRAPH', retryDisposition: mutating ? 'REBASE_REQUIRED' : 'TRANSIENT_SAME_COMMAND',
    policyFactIds: unique(input.policyFactIds),
    concurrency: { class: mutating ? 'MUTATION_EXCLUSIVE' : kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED', conflictDomainRefs: writes },
    resourcePolicyId: mutating ? 'OE_STAGE4_MUTATION_PROXY_V1' : kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1',
    reversibility: mutating ? { disposition: 'CHECKPOINT_REQUIRED', undoBindingRefs: [`${input.nodeId}.receipt.undoReference`] } : { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: unique([
      input.intentNodeId, ...bindingIds, ...proofIds, ...preservationIds,
      ...input.reads, ...input.policyFactIds, ...(materializationTrace ? [materializationTrace] : []),
    ]),
  };
}

function compiledNode(input: {
  nodeId: string;
  intentNodeId: string;
  operatorId: string;
  inputs: JsonRecord;
  reads: string[];
  requires: string[];
  coordinateBindings: JsonRecord[];
  projectId: string;
  expectedProjectRevision: string;
  revisionFactId: string;
  proofObligationIds: string[];
  policyFactIds: string[];
  traceRefs: string[];
}): JsonRecord {
  const operator = operators.get(input.operatorId);
  if (!operator || operator.compilerEligibility !== 'RESEARCH_READ_ONLY') throw new Error(`STAGE4_BASELINE_OPERATOR_FORBIDDEN:${input.operatorId}`);
  const kind = requiredText(operator.kind, `OPERATOR_KIND:${input.operatorId}`);
  if (!['READ', 'RESOLVER'].includes(kind)) throw new Error(`STAGE4_BASELINE_OPERATOR_KIND_FORBIDDEN:${input.operatorId}/${kind}`);
  const outputs = strings(record(operator.output).required).map((outputName) => `${input.nodeId}.${outputName}`);
  return {
    nodeId: input.nodeId,
    intentNodeId: input.intentNodeId,
    operatorId: input.operatorId,
    operatorSpecRef: `EDITRON_OPERATOR_SPECS_V2@${operatorCatalog.version}#${input.operatorId}`,
    ownerRef: requiredText(operator.ownerRef, `OPERATOR_OWNER:${input.operatorId}`),
    inputs: input.inputs,
    reads: unique(input.reads),
    writes: [],
    requires: unique(input.requires),
    produces: outputs,
    invalidates: [],
    coordinateBindings: input.coordinateBindings,
    revisionBinding: { projectId: input.projectId, expectedProjectRevision: input.expectedProjectRevision },
    stabilityRequirement: 'RANGE_STABLE',
    stateEffects: strings(operator.stateEffects),
    idempotency: { scope: 'PROJECT_REVISION', keyMaterialRefs: unique([input.intentNodeId, input.revisionFactId, ...input.reads]) },
    proofObligationIds: unique(input.proofObligationIds),
    failureDisposition: 'ABORT_GRAPH',
    retryDisposition: 'TRANSIENT_SAME_COMMAND',
    policyFactIds: unique(input.policyFactIds),
    concurrency: { class: kind === 'READ' ? 'READ_SHARED' : 'RESOLVER_ISOLATED', conflictDomainRefs: [] },
    resourcePolicyId: kind === 'READ' ? 'OE_STAGE4_READ_V1' : 'OE_STAGE4_RESOLVER_V1',
    reversibility: { disposition: 'NOT_APPLICABLE_READ_ONLY', undoBindingRefs: [] },
    traceRefs: unique(input.traceRefs),
  };
}

function assertCanonicalSource(label: string, value: unknown, canonical: unknown): void {
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(canonical)) throw new Error(`STAGE4_BASELINE_${label}_DRIFT`);
}

function assertDev01EvidencePack(value: unknown): void {
  if (hashCanonicalJsonV1(value) !== hashCanonicalJsonV1(canonicalDev01.evidencePacks.BASELINE)) {
    throw new Error('STAGE4_DEV01_EVIDENCE_PACK_DRIFT');
  }
}

function requiredById(values: JsonRecord[], field: string, id: string, label: string): JsonRecord {
  return values.find((value) => value[field] === id) ?? fail(`STAGE4_BASELINE_${label}_MISSING`);
}
function requiredFact(factsById: Map<string, JsonRecord>, factId: string): JsonRecord { return factsById.get(factId) ?? fail(`STAGE4_BASELINE_FACT_MISSING:${factId}`); }
function requiredFactByKind(facts: JsonRecord[], kind: string): JsonRecord { return facts.find((fact) => fact.kind === kind) ?? fail(`STAGE4_BASELINE_FACT_KIND_MISSING:${kind}`); }
function requireSetContains(values: string[], required: string[], label: string): void { for (const value of required) if (!values.includes(value)) throw new Error(`STAGE4_BASELINE_${label}_MISSING:${value}`); }
function requiredText(value: unknown, label: string): string { const result = text(value); return result || fail(`STAGE4_BASELINE_${label}_MISSING`); }
function safeInteger(value: unknown, label: string): number { const result = Number(value); return Number.isSafeInteger(result) && result >= 0 ? result : fail(`STAGE4_BASELINE_${label}_INVALID`); }
function recordRange(value: unknown): unknown[] { return Array.isArray(value) && value.length === 2 ? value : fail('STAGE4_DEV01_RANGE_INVALID'); }
function numberPair(value: unknown, label: string): [number, number] { const range = recordRange(value); return [safeInteger(range[0], `${label}_START`), safeInteger(range[1], `${label}_END`)]; }
function recordsOfRanges(value: unknown): Array<readonly [number, number]> { return Array.isArray(value) ? value.map((range, index) => numberPair(range, `DEV01_AUDIO_RANGE_${index}`)) : fail('STAGE4_DEV01_AUDIO_RANGES_INVALID'); }
function numbers(value: unknown): number[] { return Array.isArray(value) && value.every((entry) => typeof entry === 'string' || typeof entry === 'number') ? value.map(Number) : fail('STAGE4_DEV01_NUMBER_ARRAY_INVALID'); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record).filter((entry) => Object.keys(entry).length > 0) : []; }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message: string): never { throw new Error(message); }
