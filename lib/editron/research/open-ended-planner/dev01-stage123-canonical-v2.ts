import { deepFreezeV1 } from './contracts-v1';
import {
  getCanonicalDev01NativeProxyFixtureV2,
  hashCanonicalDev01NativeProxyFixtureV2,
} from './dev01-native-proxy-fixture-v2';

type JsonRecord = Record<string, unknown>;
type Dev01ConditionV2 = 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD';

export interface Dev01Stage123CanonicalV2 {
  stageOneTextInputs: Record<Dev01ConditionV2, JsonRecord>;
  referenceBlueprints: Record<Dev01ConditionV2, JsonRecord>;
  editorialIntent: JsonRecord;
  evidencePacks: Record<Dev01ConditionV2, JsonRecord>;
  evidenceBoundIntents: Record<Dev01ConditionV2, JsonRecord>;
  editorialIntentV2R: JsonRecord;
  evidenceBoundIntentsV2R: Record<Dev01ConditionV2, JsonRecord>;
}

const fixture = getCanonicalDev01NativeProxyFixtureV2();
const fixtureHash = hashCanonicalDev01NativeProxyFixtureV2();
const allEvidenceIds = ['EV-DEV01-T1', 'EV-DEV01-V1', 'EV-DEV01-A1'];
const hardClaimIds = ['claim-remove-dead-air', 'claim-preserve-speech', 'claim-product-push-in', 'claim-dialogue-ducking'];

export function getCanonicalDev01Stage123V2(): Readonly<Dev01Stage123CanonicalV2> {
  return deepFreezeV1(structuredClone(buildCanonical()));
}

function buildCanonical(): Dev01Stage123CanonicalV2 {
  const baselineBlueprint = referenceBlueprint(false);
  const withheldBlueprint = referenceBlueprint(true);
  const intent = editorialIntent();
  return {
    stageOneTextInputs: {
      BASELINE: stageOneTextInput(false),
      VISUAL_EVIDENCE_WITHHELD: stageOneTextInput(true),
    },
    referenceBlueprints: {
      BASELINE: baselineBlueprint,
      VISUAL_EVIDENCE_WITHHELD: withheldBlueprint,
    },
    editorialIntent: intent,
    evidencePacks: {
      BASELINE: evidencePack(false),
      VISUAL_EVIDENCE_WITHHELD: evidencePack(true),
    },
    evidenceBoundIntents: {
      BASELINE: evidenceBoundIntent(false),
      VISUAL_EVIDENCE_WITHHELD: evidenceBoundIntent(true),
    },
    editorialIntentV2R: editorialIntentV2R(),
    evidenceBoundIntentsV2R: {
      BASELINE: evidenceBoundIntentV2R(false),
      VISUAL_EVIDENCE_WITHHELD: evidenceBoundIntentV2R(true),
    },
  };
}

function stageOneTextInput(withholdVisual: boolean): JsonRecord {
  const evidence = [
    { evidenceId: 'EV-DEV01-T1', kind: 'TRANSCRIPT', binding: `${fixture.assets.dialogueAssetId}@fixture:${fixtureHash}/R7`, value: { phrase: 'here it is', phraseRange: [120, 151], deadAirRange: [151, 196], nextWordFrame: 196 } },
    { evidenceId: 'EV-DEV01-V1', kind: 'VISUAL', binding: `${fixture.assets.hostVideoAssetId}@fixture:${fixtureHash}/R7`, value: { label: 'product-box', sourceFrame: 205, normalizedBox: [0.62, 0.24, 0.25, 0.52], confidence: 1 } },
    { evidenceId: 'EV-DEV01-A1', kind: 'AUDIO', binding: `${fixture.assets.dialogueAssetId}+${fixture.assets.bgmAssetId}@fixture:${fixtureHash}/R7`, value: { speechSourceRanges: [[60, 151], [196, 330]], dialogueAssetId: fixture.assets.dialogueAssetId, bgmAssetId: fixture.assets.bgmAssetId, confidence: 1 } },
  ].filter(({ evidenceId }) => !withholdVisual || evidenceId !== 'EV-DEV01-V1');
  return {
    projectFacts: {
      projectId: 'oe-dev-01', projectRevision: 'R7',
      projectTimebase: { timebaseId: 'oe-dev-01:timeline', version: 'DEV01_TRUTH_V2', rate: { numerator: '30', denominator: '1' } },
      duration: { coordinateDomain: 'PROJECT_TICK', start: '0', endExclusive: '480' },
      canvas: { width: 1920, height: 1080 },
      assets: [
        { assetId: fixture.assets.hostVideoAssetId, type: 'video', rightsStatus: 'INTERNAL_OWNED_FIXTURE' },
        { assetId: fixture.assets.dialogueAssetId, type: 'audio', rightsStatus: 'INTERNAL_OWNED_FIXTURE' },
        { assetId: fixture.assets.bgmAssetId, type: 'audio', rightsStatus: 'INTERNAL_OWNED_FIXTURE' },
      ],
    },
    sourceCoordinateFacts: [
      { assetId: fixture.assets.hostVideoAssetId, coordinateDomain: 'SOURCE_FRAME', rate: { numerator: '30', denominator: '1' }, extent: { start: '0', endExclusive: '480' }, sourceFixtureHash: fixtureHash },
      { assetId: fixture.assets.dialogueAssetId, coordinateDomain: 'SOURCE_SAMPLE', rate: { numerator: '48000', denominator: '1' }, extent: { start: '0', endExclusive: '768000' }, sourceFixtureHash: fixtureHash },
      { assetId: fixture.assets.bgmAssetId, coordinateDomain: 'SOURCE_SAMPLE', rate: { numerator: '48000', denominator: '1' }, extent: { start: '0', endExclusive: '768000' }, sourceFixtureHash: fixtureHash },
    ],
    evidence,
    mediaDescriptors: [],
    mediaPolicy: 'NO_MEDIA_BYTES_OR_PATHS_TRUTHFUL_TEXT_EVIDENCE_ONLY',
    sourceFixture: { schemaVersion: fixture.schemaVersion, sourceFixtureHash: fixtureHash, materializationStatus: 'NOT_MATERIALIZED_STAGE123' },
  };
}

function referenceBlueprint(withholdVisual: boolean): JsonRecord {
  const scope = projectScope('0', '480');
  const claims = [
    claim('claim-remove-dead-air', 'DEAD_AIR_REMOVAL', projectScope('151', '196'), ['dialogue'], 'AVOIDS', 'remove only the transcript-bound silence', 'EV-DEV01-T1', 'STATE_RELOAD'),
    claim('claim-preserve-speech', 'SPEECH_PRESERVATION', projectScope('60', '330'), ['spoken-words'], 'PRESERVES', 'all spoken words and their order', 'EV-DEV01-T1', 'RENDERED_AUDIO_PRESERVATION'),
    claim('claim-product-push-in', 'PRODUCT_REVEAL_EMPHASIS', sourceScope('205', '221'), ['product-box'], 'HAS', 'restrained product-centred push-in after coordinate rebasing', withholdVisual ? '' : 'EV-DEV01-V1', 'RENDERED_GEOMETRY', withholdVisual ? 'ASK_USER' : 'RESOLVED'),
    claim('claim-dialogue-ducking', 'DIALOGUE_CONDITIONAL_MUSIC_GAIN', scope, ['dialogue', 'background-music'], 'HAS', 'lower only BGM under measured speech and restore outside it', 'EV-DEV01-A1', 'RENDERED_AUDIO_MIX'),
  ];
  return {
    artifactType: 'ReferenceBlueprintV2', taskId: 'DEV-01',
    globalEditorialLanguage: [
      observation('PACING_RHYTHM', 'Remove only the measured dead-air gap and preserve every spoken word.', 'project ticks 60-330', 'EV-DEV01-T1'),
      observation('COMPOSITION_FRAMING', 'Use a restrained product-centred push-in at the measured reveal.', 'source frames 205-221', withholdVisual ? '' : 'EV-DEV01-V1', withholdVisual ? 'AMBIGUOUS' : 'OBSERVED'),
      observation('AUDIO_MUSIC_SFX', 'Background music is lower only while dialogue is active.', 'project duration', 'EV-DEV01-A1'),
    ],
    recurringDesignGrammar: [],
    uniqueMoments: [
      { momentId: 'moment-dead-air', scope: projectScope('151', '196'), targetClaimIds: ['claim-remove-dead-air', 'claim-preserve-speech'], evidenceIds: ['EV-DEV01-T1'] },
      { momentId: 'moment-product-reveal', scope: sourceScope('205', '221'), targetClaimIds: ['claim-product-push-in'], evidenceIds: withholdVisual ? [] : ['EV-DEV01-V1'] },
    ],
    targetClaims: claims,
    temporalStructure: [
      { phaseId: 'phase-speech-before-gap', label: 'speech before gap', phaseRole: 'STEADY', scope: projectScope('60', '151'), description: 'Protected speech ending with here it is.', evidenceIds: ['EV-DEV01-T1', 'EV-DEV01-A1'] },
      { phaseId: 'phase-removable-gap', label: 'removable silence', phaseRole: 'TRANSITION', scope: projectScope('151', '196'), description: 'Exact silence eligible for removal.', evidenceIds: ['EV-DEV01-T1'] },
      { phaseId: 'phase-product-and-speech', label: 'product reveal and continued speech', phaseRole: 'BUILD', scope: projectScope('196', '330'), description: 'Speech resumes and the product appears at source frame 205.', evidenceIds: withholdVisual ? ['EV-DEV01-T1', 'EV-DEV01-A1'] : allEvidenceIds },
    ],
    uncertainties: withholdVisual ? [{ uncertaintyId: 'uncertainty-product-reveal', statement: 'Product reveal evidence is withheld.', impact: 'Push-in target and timing cannot be bound.', affectedClaimIds: ['claim-product-push-in'], disposition: 'REQUIRES_ADDITIONAL_EVIDENCE', evidenceIds: [] }] : [],
    evidenceIds: withholdVisual ? ['EV-DEV01-T1', 'EV-DEV01-A1'] : allEvidenceIds,
  };
}

function editorialIntent(): JsonRecord {
  const coverage = hardClaimIds.map((claimId) => ({ claimId, status: 'COVERED', ownerRefs: claimOwners(claimId), reasonCodes: ['CERTIFIED_FAMILY_OWNER_REQUIRED'] }));
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-01', executionForm: 'NATIVE',
    routeDecision: { scopeClassification: 'NATIVE_ONLY_PLAN', coverageStatus: 'COMPLETE', candidateForms: [{ form: 'NATIVE', hardGateStatus: 'ELIGIBLE', claimCoverage: coverage, representabilitySignals: ['NONE'], blockers: [], ownerRefs: ['resolve_transcript_edit', 'cut_section', 'resolve_keyframe_edit', 'set_keyframes', 'apply_audio_ducking'], evidenceIds: allEvidenceIds }], selectedReasonCodes: ['ALL_HARD_TARGETS_HAVE_NATIVE_FAMILY_OWNERS'], generatedIslandClaimIds: [], nativeSurroundClaimIds: hardClaimIds },
    nodes: [
      intentNode('node-observe', 'project_and_timeline_observation', hardClaimIds, ['read_project_file', 'get_timeline_view'], [], []),
      intentNode('node-resolve-cut', 'transcript_range_resolution', ['claim-remove-dead-air', 'claim-preserve-speech'], ['find_transcript_moment', 'resolve_transcript_edit'], ['node-observe'], ['EV-DEV01-T1']),
      intentNode('node-cut', 'transcript_safe_timeline_cut', ['claim-remove-dead-air', 'claim-preserve-speech'], ['cut_section'], ['node-resolve-cut'], ['EV-DEV01-T1']),
      intentNode('node-resolve-post-cut-product', 'post_cut_visual_target_and_coordinate_resolution', ['claim-product-push-in'], ['find_visual_moment', 'resolve_keyframe_edit'], ['node-cut'], ['EV-DEV01-V1']),
      intentNode('node-push-in', 'product_keyframed_transform', ['claim-product-push-in'], ['set_keyframes'], ['node-resolve-post-cut-product'], ['EV-DEV01-V1']),
      intentNode('node-duck', 'dialogue_conditioned_bgm_ducking', ['claim-dialogue-ducking', 'claim-preserve-speech'], ['find_audio_moment', 'apply_audio_ducking'], ['node-cut'], ['EV-DEV01-A1']),
      intentNode('node-proof', 'state_render_and_audio_proof', hardClaimIds, ['read_project_file', 'get_timeline_view'], ['node-push-in', 'node-duck'], allEvidenceIds),
    ],
    edges: [
      edge('observe-resolve-cut', 'node-observe', 'node-resolve-cut', 'DATA'), edge('resolve-cut-cut', 'node-resolve-cut', 'node-cut', 'DATA'),
      edge('cut-resolve-product', 'node-cut', 'node-resolve-post-cut-product', 'READ_AFTER_WRITE'), edge('resolve-product-push', 'node-resolve-post-cut-product', 'node-push-in', 'DATA'),
      edge('cut-duck', 'node-cut', 'node-duck', 'TIME_ANCHOR'), edge('push-proof', 'node-push-in', 'node-proof', 'PROOF'), edge('duck-proof', 'node-duck', 'node-proof', 'PROOF'),
    ],
    preservationIntents: [
      preservation('preserve-spoken-words', 'claim-preserve-speech', 'All spoken words and word order survive the cut.', 'dialogue:dev01-dialogue-truth-v2@R7', 'RENDERED_AUDIO_PRESERVATION'),
      preservation('preserve-source-identities', 'claim-preserve-speech', 'Host, dialogue and BGM source identities remain unchanged.', 'project:oe-dev-01@R7', 'ASSET_AND_STATE'),
      preservation('preserve-bgm-outside-speech', 'claim-dialogue-ducking', 'BGM restores outside remapped speech ranges.', 'audio:dev01-bgm-truth-v2@R7', 'RENDERED_AUDIO_MIX'),
      preservation('preserve-non-target-state', 'claim-product-push-in', 'Non-target overlays, canvas and unrelated geometry remain unchanged.', 'project:oe-dev-01@R7', 'STATE_RELOAD'),
    ],
    unresolvedRequirements: [{ requirementId: 'req-post-cut-coordinate-binding', kind: 'EVIDENCE', detail: 'Stage 3 must bind source reveal evidence and the cut transform contract before keyframe compilation.', targetClaimIds: ['claim-product-push-in'], disposition: 'NEEDS_REVIEW' }],
  };
}

function evidencePack(withholdVisual: boolean): JsonRecord {
  const conditionId: Dev01ConditionV2 = withholdVisual ? 'VISUAL_EVIDENCE_WITHHELD' : 'BASELINE';
  const facts: JsonRecord[] = [
    { factId: 'fact-project-revision', kind: 'PROJECT_REVISION', projectId: 'oe-dev-01', expectedProjectRevision: 'R7' },
    { factId: 'fact-project-timebase', kind: 'PROJECT_TIMEBASE', timebaseId: 'oe-dev-01:timeline', timebaseVersion: 'DEV01_TRUTH_V2', coordinateDomain: 'PROJECT_TICK', rate: { numerator: '30', denominator: '1' } },
    { factId: 'fact-source-fixture', kind: 'SYNTHETIC_SOURCE_FIXTURE', schemaVersion: fixture.schemaVersion, sourceFixtureHash: fixtureHash, materializationStatus: 'NOT_MATERIALIZED_STAGE123', assetIds: Object.values(fixture.assets) },
    { factId: 'fact-transcript-cut', kind: 'TRANSCRIPT_RANGE', evidenceId: 'EV-DEV01-T1', phraseRange: ['120', '151'], deadAirRange: ['151', '196'], nextWordFrame: '196' },
    ...(withholdVisual ? [] : [{ factId: 'fact-product-reveal', kind: 'VISUAL_TARGET', evidenceId: 'EV-DEV01-V1', assetId: fixture.assets.hostVideoAssetId, sourceFrame: '205', normalizedBox: ['0.62', '0.24', '0.25', '0.52'], normalizedFocalPoint: ['0.745', '0.5'] }]),
    { factId: 'fact-audio-stems', kind: 'SEPARATE_AUDIO_STEMS', evidenceId: 'EV-DEV01-A1', dialogueAssetId: fixture.assets.dialogueAssetId, bgmAssetId: fixture.assets.bgmAssetId, speechSourceRanges: [['60', '151'], ['196', '330']] },
    { factId: 'fact-rights-policy', kind: 'RIGHTS_POLICY', policyId: 'KS-018_ONLY', allowedAssetIds: Object.values(fixture.assets), deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'] },
    { factId: 'fact-privacy-policy', kind: 'PRIVACY_EGRESS_POLICY', policyId: 'SYNTHETIC_ONLY_NO_EGRESS', networkPolicy: 'DENY' },
    ...['read_project_file', 'get_timeline_view', 'find_transcript_moment', 'resolve_transcript_edit', 'cut_section', 'find_visual_moment', 'resolve_keyframe_edit', 'set_keyframes', 'find_audio_moment', 'apply_audio_ducking'].map(supportFact),
  ];
  return {
    evidencePackVersion: 'EDITRON_OE_DEV01_STAGE3_EVIDENCE_PACK_V2', authority: 'SYNTHETIC_BENCHMARK_EVIDENCE_ONLY_NO_PROJECT_MUTATION',
    taskId: 'DEV-01', conditionId, sourceFixtureHash: fixtureHash,
    visibleEvidenceIds: withholdVisual ? ['EV-DEV01-T1', 'EV-DEV01-A1'] : allEvidenceIds,
    facts,
    preservationRequirements: ['preserve-spoken-words', 'preserve-source-identities', 'preserve-bgm-outside-speech', 'preserve-non-target-state'].map((preservationId) => ({ preservationId, requiredFactIds: ['fact-project-revision', 'fact-source-fixture'] })),
    proofRequirements: [
      { proofObligationId: 'proof-revision', kind: 'REVISION_FRESHNESS', requiredFactIds: ['fact-project-revision'] },
      { proofObligationId: 'proof-speech', kind: 'SPEECH_PRESERVATION', requiredFactIds: ['fact-transcript-cut', 'fact-audio-stems'] },
      { proofObligationId: 'proof-product', kind: 'RENDERED_GEOMETRY', requiredFactIds: withholdVisual ? [] : ['fact-product-reveal'] },
      { proofObligationId: 'proof-audio-mix', kind: 'RENDERED_AUDIO_MIX', requiredFactIds: ['fact-audio-stems'] },
      { proofObligationId: 'proof-state', kind: 'STATE_RELOAD', requiredFactIds: ['fact-project-revision', 'fact-source-fixture'] },
    ],
  };
}

function evidenceBoundIntent(withholdVisual: boolean): JsonRecord {
  const visualStatus = withholdVisual ? 'UNVERIFIABLE' : 'BOUND';
  const node = (intentNodeId: string, capabilities: string[], bindingIds: string[], proofIds: string[], status = 'BOUND', unresolved: string[] = []) => ({ intentNodeId, candidateCapabilityIds: capabilities, evidenceBindingIds: bindingIds, preservationIds: ['preserve-spoken-words', 'preserve-source-identities', 'preserve-non-target-state'], proofObligationIds: proofIds, bindingStatus: status, unresolvedRequirementIds: unresolved });
  return {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-01', stageDisposition: withholdVisual ? 'UNVERIFIABLE' : 'READY_FOR_COMPILATION',
    nodes: [
      node('node-observe', ['read_project_file', 'get_timeline_view'], ['bind-project'], ['proof-revision', 'proof-state']),
      node('node-resolve-cut', ['find_transcript_moment', 'resolve_transcript_edit'], ['bind-transcript'], ['proof-speech']),
      node('node-cut', ['cut_section'], ['bind-transcript'], ['proof-speech', 'proof-state']),
      node('node-resolve-post-cut-product', ['find_visual_moment', 'resolve_keyframe_edit'], ['bind-product'], ['proof-product'], visualStatus, withholdVisual ? ['req-product-visual-evidence'] : []),
      node('node-push-in', ['set_keyframes'], ['bind-product'], ['proof-product', 'proof-state'], visualStatus, withholdVisual ? ['req-product-visual-evidence'] : []),
      node('node-duck', ['find_audio_moment', 'apply_audio_ducking'], ['bind-audio'], ['proof-audio-mix', 'proof-speech']),
      node('node-proof', ['read_project_file', 'get_timeline_view'], ['bind-project', 'bind-transcript', 'bind-audio', ...(withholdVisual ? [] : ['bind-product'])], ['proof-revision', 'proof-speech', 'proof-product', 'proof-audio-mix', 'proof-state'], visualStatus, withholdVisual ? ['req-product-visual-evidence'] : []),
    ],
    evidenceBindings: [
      { bindingId: 'bind-project', factIds: ['fact-project-revision', 'fact-project-timebase', 'fact-source-fixture'], nodeIds: ['node-observe', 'node-proof'], status: 'BOUND' },
      { bindingId: 'bind-transcript', factIds: ['fact-transcript-cut'], nodeIds: ['node-resolve-cut', 'node-cut'], status: 'BOUND' },
      { bindingId: 'bind-product', factIds: withholdVisual ? ['fact-source-fixture'] : ['fact-product-reveal', 'fact-source-fixture'], nodeIds: ['node-resolve-post-cut-product', 'node-push-in'], status: visualStatus },
      { bindingId: 'bind-audio', factIds: ['fact-audio-stems'], nodeIds: ['node-duck', 'node-proof'], status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev01-owned-fixture', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy', 'fact-source-fixture'], allowedAssetIds: Object.values(fixture.assets), deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['OWNED_FIXTURE_ONLY'] },
    privacyDecision: { decisionId: 'privacy-dev01-no-egress', status: 'COMPLIANT', policyFactIds: ['fact-privacy-policy'], egressDisposition: 'DENIED', reasonCodes: ['NO_NETWORK_EGRESS_PLANNED'] },
    revisionBinding: { projectId: 'oe-dev-01', expectedProjectRevision: 'R7', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-spoken-words', factIds: ['fact-transcript-cut', 'fact-audio-stems'], status: 'BOUND' },
      { preservationId: 'preserve-source-identities', factIds: ['fact-source-fixture'], status: 'BOUND' },
      { preservationId: 'preserve-bgm-outside-speech', factIds: ['fact-audio-stems'], status: 'BOUND' },
      { preservationId: 'preserve-non-target-state', factIds: ['fact-project-revision'], status: 'BOUND' },
    ],
    proofPlan: [
      proof('proof-revision', 'REVISION_FRESHNESS', ['node-observe', 'node-proof'], hardClaimIds, ['fact-project-revision']),
      proof('proof-speech', 'SPEECH_PRESERVATION', ['node-cut', 'node-duck', 'node-proof'], ['claim-preserve-speech'], ['fact-transcript-cut', 'fact-audio-stems']),
      proof('proof-product', 'RENDERED_GEOMETRY', ['node-push-in', 'node-proof'], ['claim-product-push-in'], withholdVisual ? ['fact-source-fixture'] : ['fact-product-reveal'], withholdVisual ? 'UNVERIFIABLE' : 'PLANNED'),
      proof('proof-audio-mix', 'RENDERED_AUDIO_MIX', ['node-duck', 'node-proof'], ['claim-dialogue-ducking'], ['fact-audio-stems']),
      proof('proof-state', 'STATE_RELOAD', ['node-cut', 'node-push-in', 'node-proof'], hardClaimIds, ['fact-project-revision', 'fact-source-fixture']),
    ],
    unresolvedRequirements: withholdVisual ? [{ requirementId: 'req-product-visual-evidence', kind: 'EVIDENCE', factIds: [], disposition: 'UNVERIFIABLE' }] : [],
  };
}

function editorialIntentV2R(): JsonRecord {
  const coverage = hardClaimIds.map((claimId) => ({ claimId, status: 'COVERED', ownerRefs: claimOwners(claimId), reasonCodes: ['CERTIFIED_FAMILY_OWNER_REQUIRED'] }));
  return {
    artifactType: 'EditorialIntentGraphV2', taskId: 'DEV-01', executionForm: 'NATIVE',
    routeDecision: { scopeClassification: 'NATIVE_ONLY_PLAN', coverageStatus: 'COMPLETE', candidateForms: [{ form: 'NATIVE', hardGateStatus: 'ELIGIBLE', claimCoverage: coverage, representabilitySignals: ['NONE'], blockers: [], ownerRefs: ['resolve_transcript_edit', 'cut_section', 'resolve_keyframe_edit', 'set_keyframes', 'apply_audio_ducking'], evidenceIds: allEvidenceIds }], selectedReasonCodes: ['ALL_HARD_TARGETS_HAVE_NATIVE_FAMILY_OWNERS'], generatedIslandClaimIds: [], nativeSurroundClaimIds: hardClaimIds },
    nodes: [
      intentNodeV2R('node-observe-project', 'project_observation', hardClaimIds, 'read_project_file', [], []),
      intentNodeV2R('node-observe-timeline', 'timeline_observation', hardClaimIds, 'get_timeline_view', ['node-observe-project'], []),
      intentNodeV2R('node-find-transcript', 'transcript_moment_location', ['claim-remove-dead-air', 'claim-preserve-speech'], 'find_transcript_moment', ['node-observe-project', 'node-observe-timeline'], ['EV-DEV01-T1'], { query: 'dead air after the phrase here it is' }),
      intentNodeV2R('node-resolve-cut', 'transcript_range_resolution', ['claim-remove-dead-air', 'claim-preserve-speech'], 'resolve_transcript_edit', ['node-find-transcript'], ['EV-DEV01-T1'], { intent: { goal: 'remove dead air preserving all spoken words' } }),
      intentNodeV2R('node-cut', 'transcript_safe_timeline_cut', ['claim-remove-dead-air', 'claim-preserve-speech'], 'cut_section', ['node-resolve-cut'], ['EV-DEV01-T1']),
      intentNodeV2R('node-find-product', 'post_cut_visual_moment_location', ['claim-product-push-in'], 'find_visual_moment', ['node-cut'], ['EV-DEV01-V1'], { query: 'product box reveal' }),
      intentNodeV2R('node-resolve-product', 'post_cut_keyframe_target_resolution', ['claim-product-push-in'], 'resolve_keyframe_edit', ['node-find-product'], ['EV-DEV01-V1'], { intent: { goal: 'restrained product-centred push-in' } }),
      intentNodeV2R('node-push-in', 'product_keyframed_transform', ['claim-product-push-in'], 'set_keyframes', ['node-resolve-product'], ['EV-DEV01-V1']),
      intentNodeV2R('node-find-audio', 'speech_moment_location', ['claim-dialogue-ducking', 'claim-preserve-speech'], 'find_audio_moment', ['node-cut'], ['EV-DEV01-A1'], { query: 'speech ranges for ducking' }),
      intentNodeV2R('node-duck', 'dialogue_conditioned_bgm_ducking', ['claim-dialogue-ducking', 'claim-preserve-speech'], 'apply_audio_ducking', ['node-find-audio'], ['EV-DEV01-A1']),
      intentNodeV2R('node-proof-project', 'post_mutation_project_state_proof', hardClaimIds, 'read_project_file', ['node-push-in', 'node-duck'], allEvidenceIds),
      intentNodeV2R('node-proof-timeline', 'post_mutation_timeline_proof', hardClaimIds, 'get_timeline_view', ['node-proof-project'], allEvidenceIds),
    ],
    edges: [
      edge('observe-project-observe-timeline', 'node-observe-project', 'node-observe-timeline', 'DATA'),
      edge('observe-find-transcript', 'node-observe-timeline', 'node-find-transcript', 'DATA'),
      edge('find-resolve-cut', 'node-find-transcript', 'node-resolve-cut', 'DATA'),
      edge('resolve-cut-cut', 'node-resolve-cut', 'node-cut', 'DATA'),
      edge('cut-find-product', 'node-cut', 'node-find-product', 'READ_AFTER_WRITE'),
      edge('find-resolve-product', 'node-find-product', 'node-resolve-product', 'DATA'),
      edge('resolve-product-push', 'node-resolve-product', 'node-push-in', 'DATA'),
      edge('cut-find-audio', 'node-cut', 'node-find-audio', 'TIME_ANCHOR'),
      edge('find-audio-duck', 'node-find-audio', 'node-duck', 'DATA'),
      edge('push-proof-project', 'node-push-in', 'node-proof-project', 'PROOF'),
      edge('duck-proof-project', 'node-duck', 'node-proof-project', 'PROOF'),
      edge('proof-project-proof-timeline', 'node-proof-project', 'node-proof-timeline', 'PROOF'),
    ],
    preservationIntents: [
      preservation('preserve-spoken-words', 'claim-preserve-speech', 'All spoken words and word order survive the cut.', 'dialogue:dev01-dialogue-truth-v2@R7', 'RENDERED_AUDIO_PRESERVATION'),
      preservation('preserve-source-identities', 'claim-preserve-speech', 'Host, dialogue and BGM source identities remain unchanged.', 'project:oe-dev-01@R7', 'ASSET_AND_STATE'),
      preservation('preserve-bgm-outside-speech', 'claim-dialogue-ducking', 'BGM restores outside remapped speech ranges.', 'audio:dev01-bgm-truth-v2@R7', 'RENDERED_AUDIO_MIX'),
      preservation('preserve-non-target-state', 'claim-product-push-in', 'Non-target overlays, canvas and unrelated geometry remain unchanged.', 'project:oe-dev-01@R7', 'STATE_RELOAD'),
    ],
    unresolvedRequirements: [{ requirementId: 'req-post-cut-coordinate-binding', kind: 'EVIDENCE', detail: 'Stage 3 must bind source reveal evidence and the cut transform contract before keyframe compilation.', targetClaimIds: ['claim-product-push-in'], disposition: 'NEEDS_REVIEW' }],
  };
}

function evidenceBoundIntentV2R(withholdVisual: boolean): JsonRecord {
  const visualStatus = withholdVisual ? 'UNVERIFIABLE' : 'BOUND';
  const visualUnresolved = withholdVisual ? ['req-product-visual-evidence'] : [];
  const node = (intentNodeId: string, selectedOperatorId: string, bindingIds: string[], proofIds: string[], status = 'BOUND', unresolved: string[] = [], nodeInputs?: JsonRecord) => ({ intentNodeId, selectedOperatorId, alternativeOperatorIds: [], evidenceBindingIds: bindingIds, preservationIds: ['preserve-spoken-words', 'preserve-source-identities', 'preserve-non-target-state'], proofObligationIds: proofIds, bindingStatus: status, unresolvedRequirementIds: unresolved, ...(nodeInputs ? { nodeInputs } : {}) });
  return {
    artifactType: 'EvidenceBoundIntentGraphV2', taskId: 'DEV-01', stageDisposition: withholdVisual ? 'UNVERIFIABLE' : 'READY_FOR_COMPILATION',
    nodes: [
      node('node-observe-project', 'read_project_file', ['bind-project'], ['proof-revision', 'proof-state']),
      node('node-observe-timeline', 'get_timeline_view', ['bind-project'], ['proof-revision', 'proof-state']),
      node('node-find-transcript', 'find_transcript_moment', ['bind-transcript'], ['proof-speech'], 'BOUND', [], { query: 'dead air after the phrase here it is' }),
      node('node-resolve-cut', 'resolve_transcript_edit', ['bind-transcript'], ['proof-speech'], 'BOUND', [], { intent: { goal: 'remove dead air preserving all spoken words' } }),
      node('node-cut', 'cut_section', ['bind-transcript'], ['proof-speech', 'proof-state']),
      node('node-find-product', 'find_visual_moment', ['bind-product'], ['proof-product'], visualStatus, visualUnresolved, { query: 'product box reveal' }),
      node('node-resolve-product', 'resolve_keyframe_edit', ['bind-product'], ['proof-product'], visualStatus, visualUnresolved, { intent: { goal: 'restrained product-centred push-in' } }),
      node('node-push-in', 'set_keyframes', ['bind-product'], ['proof-product', 'proof-state'], visualStatus, visualUnresolved),
      node('node-find-audio', 'find_audio_moment', ['bind-audio'], ['proof-audio-mix', 'proof-speech'], 'BOUND', [], { query: 'speech ranges for ducking' }),
      node('node-duck', 'apply_audio_ducking', ['bind-audio'], ['proof-audio-mix', 'proof-speech']),
      node('node-proof-project', 'read_project_file', ['bind-project', 'bind-transcript', 'bind-audio', ...(withholdVisual ? [] : ['bind-product'])], ['proof-revision', 'proof-speech', 'proof-product', 'proof-audio-mix', 'proof-state'], visualStatus, visualUnresolved),
      node('node-proof-timeline', 'get_timeline_view', ['bind-project', 'bind-transcript', 'bind-audio', ...(withholdVisual ? [] : ['bind-product'])], ['proof-revision', 'proof-speech', 'proof-product', 'proof-audio-mix', 'proof-state'], visualStatus, visualUnresolved),
    ],
    evidenceBindings: [
      { bindingId: 'bind-project', factIds: ['fact-project-revision', 'fact-project-timebase', 'fact-source-fixture'], nodeIds: ['node-observe-project', 'node-observe-timeline', 'node-proof-project', 'node-proof-timeline'], status: 'BOUND' },
      { bindingId: 'bind-transcript', factIds: ['fact-transcript-cut'], nodeIds: ['node-find-transcript', 'node-resolve-cut', 'node-cut'], status: 'BOUND' },
      { bindingId: 'bind-product', factIds: withholdVisual ? ['fact-source-fixture'] : ['fact-product-reveal', 'fact-source-fixture'], nodeIds: ['node-find-product', 'node-resolve-product', 'node-push-in'], status: visualStatus },
      { bindingId: 'bind-audio', factIds: ['fact-audio-stems'], nodeIds: ['node-find-audio', 'node-duck'], status: 'BOUND' },
    ],
    rightsDecision: { decisionId: 'rights-dev01-owned-fixture', status: 'COMPLIANT', policyFactIds: ['fact-rights-policy', 'fact-source-fixture'], allowedAssetIds: Object.values(fixture.assets), deniedActions: ['REMOTE_MEDIA_RETRIEVAL', 'UNDECLARED_ASSET_USE'], reasonCodes: ['OWNED_FIXTURE_ONLY'] },
    privacyDecision: { decisionId: 'privacy-dev01-no-egress', status: 'COMPLIANT', policyFactIds: ['fact-privacy-policy'], egressDisposition: 'DENIED', reasonCodes: ['NO_NETWORK_EGRESS_PLANNED'] },
    revisionBinding: { projectId: 'oe-dev-01', expectedProjectRevision: 'R7', timebaseFactId: 'fact-project-timebase', status: 'BOUND' },
    preservationBindings: [
      { preservationId: 'preserve-spoken-words', factIds: ['fact-transcript-cut', 'fact-audio-stems'], status: 'BOUND' },
      { preservationId: 'preserve-source-identities', factIds: ['fact-source-fixture'], status: 'BOUND' },
      { preservationId: 'preserve-bgm-outside-speech', factIds: ['fact-audio-stems'], status: 'BOUND' },
      { preservationId: 'preserve-non-target-state', factIds: ['fact-project-revision'], status: 'BOUND' },
    ],
    proofPlan: [
      proof('proof-revision', 'REVISION_FRESHNESS', ['node-observe-project', 'node-observe-timeline', 'node-proof-project', 'node-proof-timeline'], hardClaimIds, ['fact-project-revision']),
      proof('proof-speech', 'SPEECH_PRESERVATION', ['node-cut', 'node-duck', 'node-proof-project', 'node-proof-timeline'], ['claim-preserve-speech'], ['fact-transcript-cut', 'fact-audio-stems']),
      proof('proof-product', 'RENDERED_GEOMETRY', ['node-push-in', 'node-proof-project', 'node-proof-timeline'], ['claim-product-push-in'], withholdVisual ? ['fact-source-fixture'] : ['fact-product-reveal'], withholdVisual ? 'UNVERIFIABLE' : 'PLANNED'),
      proof('proof-audio-mix', 'RENDERED_AUDIO_MIX', ['node-duck', 'node-proof-project'], ['claim-dialogue-ducking'], ['fact-audio-stems']),
      proof('proof-state', 'STATE_RELOAD', ['node-cut', 'node-push-in', 'node-proof-project', 'node-proof-timeline'], hardClaimIds, ['fact-project-revision', 'fact-source-fixture']),
    ],
    unresolvedRequirements: withholdVisual ? [{ requirementId: 'req-product-visual-evidence', kind: 'EVIDENCE', factIds: [], disposition: 'UNVERIFIABLE' }] : [],
  };
}

function projectScope(start: string, endExclusive: string): JsonRecord { return { coordinateDomain: 'PROJECT_TICK', timebaseId: 'oe-dev-01:timeline', timebaseVersion: 'DEV01_TRUTH_V2', rate: { numerator: '30', denominator: '1' }, start, endExclusive }; }
function sourceScope(start: string, endExclusive: string): JsonRecord { return { coordinateDomain: 'SOURCE_FRAME', timebaseId: `${fixture.assets.hostVideoAssetId}:source`, timebaseVersion: 'DEV01_TRUTH_V2', rate: { numerator: '30', denominator: '1' }, start, endExclusive }; }
function observation(dimension: string, text: string, applicability: string, evidenceId: string, certainty = 'OBSERVED'): JsonRecord { return { dimension, observation: text, applicability, strength: 'HARD', certainty, evidenceIds: evidenceId ? [evidenceId] : [] }; }
function claim(claimId: string, claimKind: string, scope: JsonRecord, subjects: string[], relation: string, value: string, evidenceId: string, proofKind: string, ambiguity = 'RESOLVED'): JsonRecord { return { claimId, claimKind, scope, subjects, relation, desired: { valueType: 'editorial-result', value, unit: 'bounded result', comparisonBasis: 'explicit user request and bound evidence' }, tolerance: { kind: 'EXACT', value: 'no protected-content violation', unit: 'validator result' }, criticality: 'HARD', provenance: 'USER_EXPLICIT', evidenceIds: evidenceId ? [evidenceId] : [], ambiguity, proofKind }; }
function claimOwners(claimId: string): string[] { if (claimId === 'claim-remove-dead-air' || claimId === 'claim-preserve-speech') return ['resolve_transcript_edit', 'cut_section']; if (claimId === 'claim-product-push-in') return ['resolve_keyframe_edit', 'set_keyframes']; return ['apply_audio_ducking']; }
function supportFact(operatorId: string): JsonRecord { const mutating = ['cut_section', 'set_keyframes', 'apply_audio_ducking'].includes(operatorId); return { factId: `fact-support-${operatorId}`, kind: 'CAPABILITY_SUPPORT', operatorId, supportStatus: mutating ? operatorId === 'set_keyframes' ? 'LIVE_NATIVE_RECEIPT_PARTIAL' : 'LIVE_MULTIWRITE_UNCERTIFIED' : 'LIVE_READ_UNCERTIFIED', compilerEligibility: mutating ? 'ISOLATED_PROXY_ONLY' : 'RESEARCH_READ_ONLY' }; }
function intentNode(intentNodeId: string, operationFamily: string, targetClaimIds: string[], candidateCapabilityIds: string[], requiresNodeIds: string[], evidenceIds: string[]): JsonRecord { return { intentNodeId, operationFamily, targetClaimIds, candidateCapabilityIds, executionForm: 'NATIVE', requiresNodeIds, invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_OUTPUT_PROOF'], evidenceIds, failureDisposition: 'FAIL' }; }
function intentNodeV2R(intentNodeId: string, operationFamily: string, targetClaimIds: string[], selectedOperatorId: string, requiresNodeIds: string[], evidenceIds: string[], nodeInputs?: JsonRecord): JsonRecord { return { intentNodeId, operationFamily, targetClaimIds, selectedOperatorId, alternativeOperatorIds: [], executionForm: 'NATIVE', requiresNodeIds, invalidates: ['STATE_RELOAD_PROOF', 'RENDERED_OUTPUT_PROOF'], evidenceIds, failureDisposition: 'FAIL', ...(nodeInputs ? { nodeInputs } : {}) }; }
function edge(edgeId: string, fromNodeId: string, toNodeId: string, edgeType: string): JsonRecord { return { edgeId, fromNodeId, toNodeId, edgeType }; }
function preservation(preservationId: string, claimId: string, rule: string, scopeRef: string, proofKind: string): JsonRecord { return { preservationId, claimId, rule, scopeRef, proofKind }; }
function proof(proofObligationId: string, kind: string, nodeIds: string[], targetClaimIds: string[], requiredFactIds: string[], status = 'PLANNED'): JsonRecord { return { proofObligationId, kind, nodeIds, targetClaimIds, requiredFactIds, status }; }
