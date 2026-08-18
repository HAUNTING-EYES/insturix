import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type {
  Dev03MeasuredEvidenceReceiptV2,
  Dev03WithheldEvidenceReceiptV2,
} from './dev03-measured-evidence-v2';
import { getCanonicalDev03NativeProxyFixtureV2 } from './dev03-native-proxy-fixture-v2';

type JsonRecord = Record<string, unknown>;
export type Dev03ConditionV2 = 'BASELINE' | 'BEAT_EVIDENCE_WITHHELD';

export interface Dev03Stage123CanonicalV2 {
  stageOneTextInputs: Record<Dev03ConditionV2, JsonRecord>;
  referenceBlueprints: Record<Dev03ConditionV2, JsonRecord>;
  editorialIntent: JsonRecord;
  evidencePacks: Record<Dev03ConditionV2, JsonRecord>;
  evidenceBoundIntents: Record<Dev03ConditionV2, JsonRecord>;
  editorialIntentV2R: JsonRecord;
  evidenceBoundIntentsV2R: Record<Dev03ConditionV2, JsonRecord>;
}

const allEvidenceIds = ['EV-DEV03-B1', 'EV-DEV03-D1', 'EV-DEV03-T1'];
const hardClaimIds = [
  'claim-align-existing-boundaries',
  'claim-protect-audio-range',
  'claim-final-hit-shake',
  'claim-preserve-timeline-structure',
];
const fixture = getCanonicalDev03NativeProxyFixtureV2();

export function getCanonicalDev03Stage123V2(input: {
  measuredEvidence: Readonly<Dev03MeasuredEvidenceReceiptV2>;
  withheldEvidence: Readonly<Dev03WithheldEvidenceReceiptV2>;
}): Readonly<Dev03Stage123CanonicalV2> {
  const receiptHash = hashCanonicalJsonV1(input.measuredEvidence);
  const build = (conditionId: Dev03ConditionV2) => ({
    text: stageOneTextInput(conditionId, receiptHash),
    blueprint: referenceBlueprint(conditionId),
    pack: evidencePack(conditionId, input.measuredEvidence, receiptHash),
    bound: evidenceBoundIntent(conditionId),
  });
  const baseline = build('BASELINE');
  const withheld = build('BEAT_EVIDENCE_WITHHELD');
  if (input.withheldEvidence.stageDisposition !== 'UNVERIFIABLE') {
    throw new Error('DEV03_WITHHELD_EVIDENCE_MUST_STOP');
  }
  return deepFreezeV1({
    stageOneTextInputs: { BASELINE: baseline.text, BEAT_EVIDENCE_WITHHELD: withheld.text },
    referenceBlueprints: { BASELINE: baseline.blueprint, BEAT_EVIDENCE_WITHHELD: withheld.blueprint },
    editorialIntent: editorialIntent(),
    evidencePacks: { BASELINE: baseline.pack, BEAT_EVIDENCE_WITHHELD: withheld.pack },
    evidenceBoundIntents: { BASELINE: baseline.bound, BEAT_EVIDENCE_WITHHELD: withheld.bound },
    editorialIntentV2R: editorialIntentV2R(),
    evidenceBoundIntentsV2R: { BASELINE: evidenceBoundIntentV2R('BASELINE'), BEAT_EVIDENCE_WITHHELD: evidenceBoundIntentV2R('BEAT_EVIDENCE_WITHHELD') },
  });
}

function stageOneTextInput(conditionId: Dev03ConditionV2, receiptHash: string): JsonRecord {
  const baseline = conditionId === 'BASELINE';
  return {
    taskId: 'DEV-03', conditionId,
    request: 'Sync the three montage cuts to the strongest beats and add a restrained shake on the final hit, but leave the spoken sentence in the middle untouched.',
    projectFacts: {
      projectId: fixture.project.projectId, projectRevision: fixture.project.projectRevision,
      timebase: { coordinateDomain: 'PROJECT_TICK', rate: { numerator: String(fixture.project.fps), denominator: '1' }, duration: { start: '0', endExclusive: String(fixture.project.durationInFrames) } },
      currentVisualBoundaryCount: 3,
    },
    evidenceAvailability: baseline
      ? [{ evidenceId: 'EV-DEV03-B1', kind: 'MEASURED_AUDIO', receiptHash, measuredStrongImpactCount: 4 }, { evidenceId: 'EV-DEV03-D1', kind: 'PROTECTED_AUDIO_RANGE' }, { evidenceId: 'EV-DEV03-T1', kind: 'TIMELINE' }]
      : [{ evidenceId: 'EV-DEV03-D1', kind: 'PROTECTED_AUDIO_RANGE' }, { evidenceId: 'EV-DEV03-T1', kind: 'TIMELINE' }],
    mediaPolicy: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_MEDIA_EGRESS',
  };
}

function referenceBlueprint(conditionId: Dev03ConditionV2): JsonRecord {
  const baseline = conditionId === 'BASELINE';
  const ambiguity = baseline ? 'RESOLVED' : 'ASK_USER';
  return {
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-03',
    globalEditorialLanguage: [observation('AUDIO_MUSIC_SFX', 'Existing montage boundaries should land on measured strongest musical impacts without inventing new cuts.', baseline ? 'OBSERVED' : 'AMBIGUOUS', baseline ? ['EV-DEV03-B1', 'EV-DEV03-T1'] : ['EV-DEV03-T1'])],
    recurringDesignGrammar: [],
    uniqueMoments: [{ momentId: 'moment-final-impact', scope: projectScope(), targetClaimIds: ['claim-final-hit-shake'], evidenceIds: baseline ? ['EV-DEV03-B1'] : [] }],
    targetClaims: [
      claim('claim-align-existing-boundaries', 'MEASURED_AUDIOVISUAL_BOUNDARY_ALIGNMENT', 'ALIGNS_WITH', 'Align exactly the three existing visual boundaries to nearby strongest measured musical impacts.', baseline ? ['EV-DEV03-B1', 'EV-DEV03-T1'] : ['EV-DEV03-T1'], 'RENDERED_BOUNDARY_TIMING', ambiguity),
      claim('claim-protect-audio-range', 'PROTECTED_AUDIO_PRESERVATION', 'PRESERVES', 'Keep the protected middle audio range byte- and time-identical.', ['EV-DEV03-D1', 'EV-DEV03-T1'], 'PROTECTED_AUDIO_BYTES_AND_TIMING', 'RESOLVED'),
      claim('claim-final-hit-shake', 'BOUNDED_FINAL_IMPACT_EMPHASIS', 'HAS', 'Apply one restrained, bounded visual shake at the final strongest measured impact and return to neutral.', baseline ? ['EV-DEV03-B1'] : [], 'RENDERED_SHAKE_AND_NEUTRAL_RETURN', ambiguity),
      claim('claim-preserve-timeline-structure', 'TIMELINE_STRUCTURE_PRESERVATION', 'PRESERVES', 'Preserve clip count, order, asset identities, total duration, speed, and all non-target state.', ['EV-DEV03-T1'], 'STATE_RELOAD', 'RESOLVED'),
    ],
    temporalStructure: [{ phaseId: 'phase-montage', label: 'measured montage', phaseRole: 'STEADY', scope: projectScope(), description: 'One 600-tick montage with three existing internal visual boundaries.', evidenceIds: ['EV-DEV03-T1'] }],
    uncertainties: baseline ? [] : [{ uncertaintyId: 'uncertainty-measured-beats', statement: 'The requested strongest impacts cannot be located without measured beat evidence.', impact: 'Beat alignment and the final-hit shake must stop before compilation.', affectedClaimIds: ['claim-align-existing-boundaries', 'claim-final-hit-shake'], disposition: 'REQUIRES_ADDITIONAL_EVIDENCE', evidenceIds: ['EV-DEV03-T1'] }],
    evidenceIds: baseline ? allEvidenceIds : ['EV-DEV03-D1', 'EV-DEV03-T1'],
  };
}

function editorialIntent(): JsonRecord {
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-03', executionForm: 'NATIVE',
    routeDecision: {
      scopeClassification: 'NATIVE_ONLY_PLAN', coverageStatus: 'COMPLETE',
      candidateForms: [{
        form: 'NATIVE', hardGateStatus: 'ELIGIBLE',
        claimCoverage: hardClaimIds.map((claimId) => ({
          claimId, status: 'COVERED', ownerRefs: coverageOwnerRefs(claimId),
          reasonCodes: ['CERTIFIED_NATIVE_OWNER_COVERS_CLAIM'],
        })),
        representabilitySignals: ['NONE'], blockers: [],
        ownerRefs: ['read_project_file', 'get_timeline_view', 'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'],
        evidenceIds: allEvidenceIds,
      }],
      selectedReasonCodes: ['CERTIFIED_NATIVE_TIMELINE_AND_EFFECT_OWNERS_COVER_TARGET'], generatedIslandClaimIds: [], nativeSurroundClaimIds: hardClaimIds,
    },
    nodes: [
      intentNode('node-observe', 'inspect_current_timeline', hardClaimIds, ['read_project_file', 'get_timeline_view'], [], ['EV-DEV03-T1']),
      intentNode('node-resolve-impacts', 'locate_measured_audio_impacts', ['claim-align-existing-boundaries', 'claim-final-hit-shake'], ['find_audio_moment'], ['node-observe'], ['EV-DEV03-B1']),
      intentNode('node-align-boundaries', 'beat_aligned_retime', ['claim-align-existing-boundaries', 'claim-protect-audio-range'], ['sync_cuts_to_beats'], ['node-resolve-impacts'], allEvidenceIds),
      intentNode('node-final-shake', 'camera_shake', ['claim-final-hit-shake'], ['apply_camera_shake'], ['node-align-boundaries'], ['EV-DEV03-B1', 'EV-DEV03-T1']),
      intentNode('node-proof', 'verify_rendered_and_persisted_outcome', hardClaimIds, ['read_project_file', 'get_timeline_view'], ['node-final-shake'], allEvidenceIds),
    ],
    edges: [edge('observe-impacts', 'node-observe', 'node-resolve-impacts', 'DATA'), edge('impacts-align', 'node-resolve-impacts', 'node-align-boundaries', 'DATA'), edge('align-shake', 'node-align-boundaries', 'node-final-shake', 'READ_AFTER_WRITE'), edge('shake-proof', 'node-final-shake', 'node-proof', 'PROOF')],
    preservationIntents: [
      preservation('preserve-protected-audio', 'claim-protect-audio-range', 'Do not move, trim, replace, attenuate, or resample the protected audio range.', 'project:oe-dev-03/range:250-350', 'PROTECTED_AUDIO_BYTES_AND_TIMING'),
      preservation('preserve-clip-count-order-assets', 'claim-preserve-timeline-structure', 'Do not add, remove, reorder, or replace visual clips.', 'project:oe-dev-03@R11', 'STATE_RELOAD'),
      preservation('preserve-duration-and-speed', 'claim-preserve-timeline-structure', 'Keep total duration and every clip speed unchanged.', 'project:oe-dev-03@R11', 'STATE_RELOAD'),
      preservation('preserve-non-target-motion', 'claim-preserve-timeline-structure', 'Do not add position motion outside the bounded final-hit shake.', 'project:oe-dev-03/range:0-600', 'RENDERED_GEOMETRY'),
    ],
    unresolvedRequirements: [],
  };
}

function editorialIntentV2R(): JsonRecord {
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-03', executionForm: 'NATIVE',
    routeDecision: {
      scopeClassification: 'NATIVE_ONLY_PLAN', coverageStatus: 'COMPLETE',
      candidateForms: [{
        form: 'NATIVE', hardGateStatus: 'ELIGIBLE',
        claimCoverage: hardClaimIds.map((claimId) => ({
          claimId, status: 'COVERED', ownerRefs: coverageOwnerRefs(claimId),
          reasonCodes: ['CERTIFIED_NATIVE_OWNER_COVERS_CLAIM'],
        })),
        representabilitySignals: ['NONE'], blockers: [],
        ownerRefs: ['read_project_file', 'get_timeline_view', 'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'],
        evidenceIds: allEvidenceIds,
      }],
      selectedReasonCodes: ['CERTIFIED_NATIVE_TIMELINE_AND_EFFECT_OWNERS_COVER_TARGET'], generatedIslandClaimIds: [], nativeSurroundClaimIds: hardClaimIds,
    },
    nodes: [
      intentNodeV2R('node-observe-project', 'project_observation', hardClaimIds, 'read_project_file', [], ['EV-DEV03-T1']),
      intentNodeV2R('node-observe-timeline', 'inspect_current_timeline', hardClaimIds, 'get_timeline_view', ['node-observe-project'], ['EV-DEV03-T1']),
      intentNodeV2R('node-resolve-impacts', 'locate_measured_audio_impacts', ['claim-align-existing-boundaries', 'claim-final-hit-shake'], 'find_audio_moment', ['node-observe-timeline'], ['EV-DEV03-B1']),
      intentNodeV2R('node-align-boundaries', 'beat_aligned_retime', ['claim-align-existing-boundaries', 'claim-protect-audio-range'], 'sync_cuts_to_beats', ['node-resolve-impacts'], allEvidenceIds),
      intentNodeV2R('node-final-shake', 'camera_shake', ['claim-final-hit-shake'], 'apply_camera_shake', ['node-align-boundaries'], ['EV-DEV03-B1', 'EV-DEV03-T1']),
      intentNodeV2R('node-proof-project', 'post_mutation_project_state_proof', hardClaimIds, 'read_project_file', ['node-final-shake'], allEvidenceIds),
      intentNodeV2R('node-proof-timeline', 'post_mutation_timeline_proof', hardClaimIds, 'get_timeline_view', ['node-proof-project'], allEvidenceIds),
    ],
    edges: [
      edge('observe-project-observe-timeline', 'node-observe-project', 'node-observe-timeline', 'DATA'),
      edge('observe-timeline-impacts', 'node-observe-timeline', 'node-resolve-impacts', 'DATA'),
      edge('impacts-align', 'node-resolve-impacts', 'node-align-boundaries', 'DATA'),
      edge('align-shake', 'node-align-boundaries', 'node-final-shake', 'READ_AFTER_WRITE'),
      edge('shake-proof-project', 'node-final-shake', 'node-proof-project', 'PROOF'),
      edge('proof-project-proof-timeline', 'node-proof-project', 'node-proof-timeline', 'PROOF'),
    ],
    preservationIntents: [
      preservation('preserve-protected-audio', 'claim-protect-audio-range', 'Do not move, trim, replace, attenuate, or resample the protected audio range.', 'project:oe-dev-03/range:250-350', 'PROTECTED_AUDIO_BYTES_AND_TIMING'),
      preservation('preserve-clip-count-order-assets', 'claim-preserve-timeline-structure', 'Do not add, remove, reorder, or replace visual clips.', 'project:oe-dev-03@R11', 'STATE_RELOAD'),
      preservation('preserve-duration-and-speed', 'claim-preserve-timeline-structure', 'Keep total duration and every clip speed unchanged.', 'project:oe-dev-03@R11', 'STATE_RELOAD'),
      preservation('preserve-non-target-motion', 'claim-preserve-timeline-structure', 'Do not add position motion outside the bounded final-hit shake.', 'project:oe-dev-03/range:0-600', 'RENDERED_GEOMETRY'),
    ],
    unresolvedRequirements: [],
  };
}

function evidenceBoundIntentV2R(conditionId: Dev03ConditionV2): JsonRecord {
  const baseline = conditionId === 'BASELINE';
  const beatStatus = baseline ? 'BOUND' : 'UNVERIFIABLE';
  const unresolved = beatStatus === 'BOUND' ? [] : ['req-measured-beat-evidence'];
  const preservationIds = ['preserve-protected-audio', 'preserve-clip-count-order-assets', 'preserve-duration-and-speed', 'preserve-non-target-motion'];
  const allBindings = baseline ? ['bind-project', 'bind-timeline', 'bind-beats', 'bind-protected-audio'] : ['bind-project', 'bind-timeline', 'bind-protected-audio'];
  const allProofs = ['proof-revision', 'proof-boundary-timing', 'proof-source-handles', 'proof-protected-audio', 'proof-shake', 'proof-state'];
  const node = (intentNodeId: string, selectedOperatorId: string, bindingIds: string[], proofIds: string[], status = 'BOUND', unresolvedIds: string[] = []) => ({ intentNodeId, selectedOperatorId, alternativeOperatorIds: [], evidenceBindingIds: bindingIds, preservationIds, proofObligationIds: proofIds, bindingStatus: status, unresolvedRequirementIds: unresolvedIds });
  return {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-03', stageDisposition: baseline ? 'READY_FOR_COMPILATION' : 'UNVERIFIABLE',
    nodes: [
      node('node-observe-project', 'read_project_file', ['bind-project', 'bind-timeline'], ['proof-revision', 'proof-state']),
      node('node-observe-timeline', 'get_timeline_view', ['bind-project', 'bind-timeline'], ['proof-revision', 'proof-state']),
      node('node-resolve-impacts', 'find_audio_moment', ['bind-beats'], ['proof-measured-beats'], beatStatus, unresolved),
      node('node-align-boundaries', 'sync_cuts_to_beats', ['bind-beats', 'bind-timeline', 'bind-protected-audio'], ['proof-boundary-timing', 'proof-source-handles', 'proof-protected-audio'], beatStatus, unresolved),
      node('node-final-shake', 'apply_camera_shake', ['bind-beats', 'bind-timeline'], ['proof-shake'], beatStatus, unresolved),
      node('node-proof-project', 'read_project_file', allBindings, allProofs, beatStatus, unresolved),
      node('node-proof-timeline', 'get_timeline_view', allBindings, allProofs, beatStatus, unresolved),
    ],
    evidenceBindings: [
      { bindingId: 'bind-project', factIds: ['fact-project-revision', 'fact-project-timebase'], nodeIds: ['node-observe-project', 'node-observe-timeline', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
      { bindingId: 'bind-timeline', factIds: ['fact-timeline-boundaries', 'fact-source-handles'], nodeIds: ['node-observe-project', 'node-observe-timeline', 'node-align-boundaries', 'node-final-shake', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
      { bindingId: 'bind-beats', factIds: baseline ? ['fact-measured-beats'] : [], nodeIds: ['node-resolve-impacts', 'node-align-boundaries', 'node-final-shake', 'node-proof-project', 'node-proof-timeline'], status: beatStatus },
      { bindingId: 'bind-protected-audio', factIds: ['fact-protected-audio'], nodeIds: ['node-align-boundaries', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev03-owned-fixtures', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy'], allowedAssetIds: ['dev03-cards', 'dev03-beats'], deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['OWNED_FIXTURE_ASSETS_ONLY'] },
    privacyDecision: { decisionId: 'privacy-dev03-no-egress', status: 'COMPLIANT', policyFactIds: ['fact-privacy-egress-policy'], egressDisposition: 'DENIED', reasonCodes: ['NO_MEDIA_EGRESS'] },
    revisionBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-protected-audio', factIds: ['fact-protected-audio'], status: 'BOUND' },
      { preservationId: 'preserve-clip-count-order-assets', factIds: ['fact-timeline-boundaries', 'fact-source-handles'], status: 'BOUND' },
      { preservationId: 'preserve-duration-and-speed', factIds: ['fact-project-timebase', 'fact-timeline-boundaries'], status: 'BOUND' },
      { preservationId: 'preserve-non-target-motion', factIds: ['fact-timeline-boundaries'], status: 'BOUND' },
    ],
    proofPlan: proofPlanV2R(baseline),
    unresolvedRequirements: baseline ? [] : [{ requirementId: 'req-measured-beat-evidence', kind: 'EVIDENCE', factIds: [], disposition: 'UNVERIFIABLE', failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER' }],
  };
}

function proofPlanV2R(baseline: boolean): JsonRecord[] {
  const status = baseline ? 'PLANNED' : 'UNVERIFIABLE';
  const observeNodes = ['node-observe-project', 'node-observe-timeline'];
  const proofNodes = ['node-proof-project', 'node-proof-timeline'];
  return [
    proof('proof-revision', 'REVISION_FRESHNESS', [...observeNodes, ...proofNodes], ['claim-preserve-timeline-structure'], ['fact-project-revision']),
    proof('proof-measured-beats', 'MEASURED_BEAT_PROVENANCE', ['node-resolve-impacts', 'node-align-boundaries', 'node-final-shake'], ['claim-align-existing-boundaries', 'claim-final-hit-shake'], baseline ? ['fact-measured-beats'] : [], status),
    proof('proof-source-handles', 'SOURCE_HANDLE_LEGALITY', ['node-align-boundaries'], ['claim-align-existing-boundaries'], ['fact-source-handles'], status),
    proof('proof-protected-audio', 'PROTECTED_AUDIO_BYTES_AND_TIMING', ['node-align-boundaries', ...proofNodes], ['claim-protect-audio-range'], ['fact-protected-audio']),
    proof('proof-boundary-timing', 'RENDERED_BOUNDARY_TIMING', ['node-align-boundaries', ...proofNodes], ['claim-align-existing-boundaries'], baseline ? ['fact-measured-beats', 'fact-timeline-boundaries'] : ['fact-timeline-boundaries'], status),
    proof('proof-shake', 'RENDERED_SHAKE_AND_NEUTRAL_RETURN', ['node-final-shake', ...proofNodes], ['claim-final-hit-shake'], baseline ? ['fact-measured-beats', 'fact-timeline-boundaries'] : ['fact-timeline-boundaries'], status),
    proof('proof-state', 'STATE_RELOAD', [...observeNodes, ...proofNodes], ['claim-preserve-timeline-structure'], ['fact-project-revision', 'fact-timeline-boundaries']),
  ];
}

function evidencePack(conditionId: Dev03ConditionV2, receipt: Readonly<Dev03MeasuredEvidenceReceiptV2>, receiptHash: string): JsonRecord {
  const baseline = conditionId === 'BASELINE';
  const facts: JsonRecord[] = [
    { factId: 'fact-project-revision', kind: 'PROJECT_REVISION', projectId: fixture.project.projectId, expectedProjectRevision: fixture.project.projectRevision },
    { factId: 'fact-project-timebase', kind: 'PROJECT_TIMEBASE', coordinateDomain: 'PROJECT_TICK', rate: { numerator: String(fixture.project.fps), denominator: '1' }, duration: { start: '0', endExclusive: String(fixture.project.durationInFrames) } },
    { factId: 'fact-timeline-boundaries', kind: 'TIMELINE_SNAPSHOT', evidenceId: 'EV-DEV03-T1', overlayIds: fixture.project.overlays.filter(({ type }) => type === 'video').map(({ id }) => id), initialBoundaryFrames: fixture.evidence.initialBoundaryFrames, totalDurationFrames: fixture.project.durationInFrames, clipCount: 4, assetId: fixture.assets.cards.assetId },
    { factId: 'fact-source-handles', kind: 'SOURCE_HANDLE_WINDOWS', evidenceId: 'EV-DEV03-T1', sourceArtifactSha256: fixture.assets.cards.sha256, sourceRate: { numerator: String(fixture.assets.cards.fpsNumerator), denominator: String(fixture.assets.cards.fpsDenominator) }, sourceDurationFramesByAssetId: { [fixture.assets.cards.assetId]: fixture.assets.cards.durationInFrames }, sourceStartFrames: fixture.evidence.sourceStartFrames, maxBoundaryShiftFrames: fixture.evidence.maxBoundaryShiftFrames },
    { factId: 'fact-protected-audio', kind: 'PROTECTED_AUDIO_RANGE', evidenceId: 'EV-DEV03-D1', coordinateDomain: 'PROJECT_TICK', range: fixture.evidence.protectedAudioRange, requiredPreservation: 'BYTES_AND_TIMING', limitation: 'SYNTHETIC_TONAL_RANGE_NOT_INTELLIGIBLE_DIALOGUE' },
    ...(baseline ? [{ factId: 'fact-measured-beats', kind: 'HASH_BOUND_MEASURED_AUDIO', evidenceId: 'EV-DEV03-B1', receiptHash, sourceArtifactSha256: receipt.sourceBinding.artifactSha256, analyzerImplementationSha256: receipt.analyzerBinding.implementationSha256, analyzerOptionsHash: receipt.analyzerBinding.optionsHash, bpm: receipt.analysis.bpm, bpmConfidence: receipt.analysis.bpmConfidence, strongPeakFrames: receipt.analysis.strongPeaks.map(({ projectFrame }) => projectFrame), finalStrongPeakFrame: receipt.analysis.finalStrongPeakFrame, frameRounding: receipt.analysis.strongPeakPolicy.frameRounding } as JsonRecord] : []),
    { factId: 'fact-rights-policy', kind: 'RIGHTS_POLICY', allowedAssetIds: ['dev03-cards', 'dev03-beats'], deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'] },
    { factId: 'fact-privacy-egress-policy', kind: 'PRIVACY_EGRESS_POLICY', networkPolicy: 'DENY' },
    ...['read_project_file', 'get_timeline_view', 'find_audio_moment', 'sync_cuts_to_beats', 'apply_camera_shake'].map(supportFact),
  ];
  return {
    artifactType: 'EvidencePackV2', evidencePackVersion: 'EDITRON_OE_DEV03_STAGE3_EVIDENCE_PACK_V2', taskId: 'DEV-03', conditionId,
    authority: 'HASH_BOUND_SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION',
    visibleEvidenceIds: baseline ? allEvidenceIds : ['EV-DEV03-D1', 'EV-DEV03-T1'], facts,
    preservationRequirements: ['preserve-protected-audio', 'preserve-clip-count-order-assets', 'preserve-duration-and-speed', 'preserve-non-target-motion'],
    proofRequirements: proofPlan(baseline),
  };
}

function evidenceBoundIntent(conditionId: Dev03ConditionV2): JsonRecord {
  const baseline = conditionId === 'BASELINE';
  const beatStatus = baseline ? 'BOUND' : 'UNVERIFIABLE';
  const node = (intentNodeId: string, capabilityIds: string[], bindingIds: string[], proofIds: string[], status = 'BOUND') => ({ intentNodeId, candidateCapabilityIds: capabilityIds, evidenceBindingIds: bindingIds, preservationIds: ['preserve-protected-audio', 'preserve-clip-count-order-assets', 'preserve-duration-and-speed', 'preserve-non-target-motion'], proofObligationIds: proofIds, bindingStatus: status, unresolvedRequirementIds: status === 'BOUND' ? [] : ['req-measured-beat-evidence'] });
  return {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-03', stageDisposition: baseline ? 'READY_FOR_COMPILATION' : 'UNVERIFIABLE',
    nodes: [
      node('node-observe', ['read_project_file', 'get_timeline_view'], ['bind-project', 'bind-timeline'], ['proof-revision', 'proof-state']),
      node('node-resolve-impacts', ['find_audio_moment'], ['bind-beats'], ['proof-measured-beats'], beatStatus),
      node('node-align-boundaries', ['sync_cuts_to_beats'], ['bind-beats', 'bind-timeline', 'bind-protected-audio'], ['proof-boundary-timing', 'proof-source-handles', 'proof-protected-audio'], beatStatus),
      node('node-final-shake', ['apply_camera_shake'], ['bind-beats', 'bind-timeline'], ['proof-shake'], beatStatus),
      node('node-proof', ['read_project_file', 'get_timeline_view'], baseline ? ['bind-project', 'bind-timeline', 'bind-beats', 'bind-protected-audio'] : ['bind-project', 'bind-timeline', 'bind-protected-audio'], ['proof-revision', 'proof-boundary-timing', 'proof-source-handles', 'proof-protected-audio', 'proof-shake', 'proof-state'], beatStatus),
    ],
    evidenceBindings: [
      { bindingId: 'bind-project', factIds: ['fact-project-revision', 'fact-project-timebase'], nodeIds: ['node-observe', 'node-proof'], status: 'BOUND' },
      { bindingId: 'bind-timeline', factIds: ['fact-timeline-boundaries', 'fact-source-handles'], nodeIds: ['node-observe', 'node-align-boundaries', 'node-final-shake', 'node-proof'], status: 'BOUND' },
      { bindingId: 'bind-beats', factIds: baseline ? ['fact-measured-beats'] : [], nodeIds: ['node-resolve-impacts', 'node-align-boundaries', 'node-final-shake', 'node-proof'], status: beatStatus },
      { bindingId: 'bind-protected-audio', factIds: ['fact-protected-audio'], nodeIds: ['node-align-boundaries', 'node-proof'], status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev03-owned-fixtures', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy'], allowedAssetIds: ['dev03-cards', 'dev03-beats'], deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['OWNED_FIXTURE_ASSETS_ONLY'] },
    privacyDecision: { decisionId: 'privacy-dev03-no-egress', status: 'COMPLIANT', policyFactIds: ['fact-privacy-egress-policy'], egressDisposition: 'DENIED', reasonCodes: ['NO_MEDIA_EGRESS'] },
    revisionBinding: { projectId: 'oe-dev-03', expectedProjectRevision: 'R11', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-protected-audio', factIds: ['fact-protected-audio'], status: 'BOUND' },
      { preservationId: 'preserve-clip-count-order-assets', factIds: ['fact-timeline-boundaries', 'fact-source-handles'], status: 'BOUND' },
      { preservationId: 'preserve-duration-and-speed', factIds: ['fact-project-timebase', 'fact-timeline-boundaries'], status: 'BOUND' },
      { preservationId: 'preserve-non-target-motion', factIds: ['fact-timeline-boundaries'], status: 'BOUND' },
    ],
    proofPlan: proofPlan(baseline),
    unresolvedRequirements: baseline ? [] : [{ requirementId: 'req-measured-beat-evidence', kind: 'EVIDENCE', factIds: [], disposition: 'UNVERIFIABLE', failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER' }],
  };
}

function proofPlan(baseline: boolean): JsonRecord[] {
  const status = baseline ? 'PLANNED' : 'UNVERIFIABLE';
  return [
    proof('proof-revision', 'REVISION_FRESHNESS', ['node-observe', 'node-proof'], ['claim-preserve-timeline-structure'], ['fact-project-revision']),
    proof('proof-measured-beats', 'MEASURED_BEAT_PROVENANCE', ['node-resolve-impacts', 'node-align-boundaries', 'node-final-shake'], ['claim-align-existing-boundaries', 'claim-final-hit-shake'], baseline ? ['fact-measured-beats'] : [], status),
    proof('proof-source-handles', 'SOURCE_HANDLE_LEGALITY', ['node-align-boundaries'], ['claim-align-existing-boundaries'], ['fact-source-handles'], status),
    proof('proof-protected-audio', 'PROTECTED_AUDIO_BYTES_AND_TIMING', ['node-align-boundaries', 'node-proof'], ['claim-protect-audio-range'], ['fact-protected-audio']),
    proof('proof-boundary-timing', 'RENDERED_BOUNDARY_TIMING', ['node-align-boundaries', 'node-proof'], ['claim-align-existing-boundaries'], baseline ? ['fact-measured-beats', 'fact-timeline-boundaries'] : ['fact-timeline-boundaries'], status),
    proof('proof-shake', 'RENDERED_SHAKE_AND_NEUTRAL_RETURN', ['node-final-shake', 'node-proof'], ['claim-final-hit-shake'], baseline ? ['fact-measured-beats', 'fact-timeline-boundaries'] : ['fact-timeline-boundaries'], status),
    proof('proof-state', 'STATE_RELOAD', ['node-observe', 'node-proof'], ['claim-preserve-timeline-structure'], ['fact-project-revision', 'fact-timeline-boundaries']),
  ];
}

function projectScope(): JsonRecord { return { coordinateDomain: 'PROJECT_TICK', timebaseId: `${fixture.project.projectId}:timeline`, timebaseVersion: 'V2_1F', rate: { numerator: String(fixture.project.fps), denominator: '1' }, start: '0', endExclusive: String(fixture.project.durationInFrames) }; }
function observation(dimension: string, text: string, certainty: string, evidenceIds: string[]): JsonRecord { return { dimension, observation: text, applicability: 'project ticks 0-599', strength: 'HARD', certainty, evidenceIds }; }
function claim(claimId: string, claimKind: string, relation: string, value: string, evidenceIds: string[], proofKind: string, ambiguity: string): JsonRecord { return { claimId, claimKind, scope: projectScope(), subjects: ['oe-dev-03'], relation, desired: { valueType: 'editorial-result', value, unit: 'rendered and persisted edit', comparisonBasis: 'explicit user request and supplied evidence' }, tolerance: { kind: 'EDITORIAL_JUDGMENT', value: 'validated by declared proof', unit: 'bounded proof result' }, criticality: 'HARD', provenance: 'USER_EXPLICIT', evidenceIds, ambiguity, proofKind }; }
function intentNode(intentNodeId: string, operationFamily: string, targetClaimIds: string[], candidateCapabilityIds: string[], requiresNodeIds: string[], evidenceIds: string[]): JsonRecord { return { intentNodeId, operationFamily, targetClaimIds, candidateCapabilityIds, executionForm: 'NATIVE', requiresNodeIds, invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_OUTPUT_PROOF'], evidenceIds, failureDisposition: 'FAIL' }; }
function intentNodeV2R(intentNodeId: string, operationFamily: string, targetClaimIds: string[], selectedOperatorId: string, requiresNodeIds: string[], evidenceIds: string[]): JsonRecord { return { intentNodeId, operationFamily, targetClaimIds, selectedOperatorId, alternativeOperatorIds: [], executionForm: 'NATIVE', requiresNodeIds, invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_OUTPUT_PROOF'], evidenceIds, failureDisposition: 'FAIL' }; }
function edge(edgeId: string, fromNodeId: string, toNodeId: string, edgeType: string): JsonRecord { return { edgeId, fromNodeId, toNodeId, edgeType }; }
function coverageOwnerRefs(claimId: string): string[] {
  if (claimId === 'claim-align-existing-boundaries') return ['find_audio_moment', 'sync_cuts_to_beats'];
  if (claimId === 'claim-protect-audio-range') return ['sync_cuts_to_beats'];
  if (claimId === 'claim-final-hit-shake') return ['apply_camera_shake'];
  return ['read_project_file', 'get_timeline_view'];
}
function preservation(preservationId: string, claimId: string, rule: string, scopeRef: string, proofKind: string): JsonRecord { return { preservationId, claimId, rule, scopeRef, proofKind }; }
function proof(proofObligationId: string, kind: string, nodeIds: string[], targetClaimIds: string[], requiredFactIds: string[], status = 'PLANNED'): JsonRecord { return { proofObligationId, kind, nodeIds, targetClaimIds, requiredFactIds, status }; }
function supportFact(operatorId: string): JsonRecord { const mutating = ['sync_cuts_to_beats', 'apply_camera_shake'].includes(operatorId); return { factId: `fact-support-${operatorId}`, kind: 'CAPABILITY_SUPPORT', operatorId, supportStatus: mutating ? operatorId === 'sync_cuts_to_beats' ? 'LIVE_MULTIWRITE_UNCERTIFIED' : 'LIVE_NATIVE_RECEIPT_PARTIAL' : 'LIVE_READ_UNCERTIFIED', compilerEligibility: mutating ? 'ISOLATED_PROXY_ONLY' : 'RESEARCH_READ_ONLY' }; }
