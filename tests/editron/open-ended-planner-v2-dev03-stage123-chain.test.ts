import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildCanonicalDev03BeatWithheldEvidenceV2,
  buildCanonicalDev03MeasuredEvidenceV2,
  type Dev03MeasuredEvidenceReceiptV2,
} from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { getCanonicalDev03Stage123V2, type Dev03ConditionV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-canonical-v2';
import { evaluateDev03StagesOneToThreeV2 } from '@/lib/editron/research/open-ended-planner/dev03-stage123-evaluator-v2';

type JsonRecord = Record<string, unknown>;
let measured: Readonly<Dev03MeasuredEvidenceReceiptV2>;

beforeAll(async () => {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
});

function canonical() {
  return getCanonicalDev03Stage123V2({ measuredEvidence: measured, withheldEvidence: buildCanonicalDev03BeatWithheldEvidenceV2() });
}

function evaluate(conditionId: Dev03ConditionV2, overrides: Partial<{ referenceBlueprint: JsonRecord; editorialIntent: JsonRecord; evidencePack: JsonRecord; evidenceBoundIntent: JsonRecord }> = {}) {
  const source = canonical();
  return evaluateDev03StagesOneToThreeV2({
    conditionId, measuredEvidence: measured,
    referenceBlueprint: overrides.referenceBlueprint ?? source.referenceBlueprints[conditionId],
    editorialIntent: overrides.editorialIntent ?? source.editorialIntent,
    evidencePack: overrides.evidencePack ?? source.evidencePacks[conditionId],
    evidenceBoundIntent: overrides.evidenceBoundIntent ?? source.evidenceBoundIntents[conditionId],
  });
}

describe('open-ended planner V2 DEV-03 connected Stage 1-3 semantics', () => {
  it('passes the baseline with measured beats and the withheld condition as an honest stop', () => {
    expect(evaluate('BASELINE')).toEqual({ assessment: 'PASS', expectedStageDisposition: 'READY_FOR_COMPILATION', diagnostics: [] });
    expect(evaluate('BEAT_EVIDENCE_WITHHELD')).toEqual({ assessment: 'PASS', expectedStageDisposition: 'UNVERIFIABLE', diagnostics: [] });
  });

  it('reconstructs observable targets without leaking operator names', () => {
    const source = canonical();
    expect(JSON.stringify(source.referenceBlueprints.BASELINE)).not.toMatch(/sync_cuts_to_beats|apply_camera_shake/);
    const leaked = structuredClone(source.referenceBlueprints.BASELINE) as JsonRecord;
    (leaked.targetClaims as JsonRecord[])[0].desired = { value: 'call sync_cuts_to_beats' };
    expect(evaluate('BASELINE', { referenceBlueprint: leaked }).diagnostics).toContain('DEV03_STAGE1_OPERATOR_LEAK');
  });

  it('requires the native route and rejects generated or unrelated substitutions', () => {
    const intent = structuredClone(canonical().editorialIntent) as JsonRecord;
    intent.executionForm = 'GENERATED_COMPOSITION';
    (intent.nodes as JsonRecord[])[2].candidateCapabilityIds = ['generated_composition_program', 'add_sfx'];
    const result = evaluate('BASELINE', { editorialIntent: intent });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      'DEV03_STAGE2_ROUTE_NOT_NATIVE',
      'DEV03_STAGE2_FORBIDDEN_SUBSTITUTION:generated_composition_program',
      'DEV03_STAGE2_FORBIDDEN_SUBSTITUTION:add_sfx',
      'DEV03_STAGE2_CAPABILITY_COVERAGE',
    ]));
  });

  it('requires impact resolution before alignment and alignment before the final shake', () => {
    const intent = structuredClone(canonical().editorialIntent) as JsonRecord;
    intent.edges = (intent.edges as JsonRecord[]).filter(({ edgeId }) => edgeId !== 'impacts-align' && edgeId !== 'align-shake');
    const nodes = intent.nodes as JsonRecord[];
    const align = nodes.find(({ intentNodeId }) => intentNodeId === 'node-align-boundaries');
    const shake = nodes.find(({ intentNodeId }) => intentNodeId === 'node-final-shake');
    if (!align || !shake) throw new Error('Missing canonical dependency nodes');
    align.requiresNodeIds = [];
    shake.requiresNodeIds = [];
    expect(evaluate('BASELINE', { editorialIntent: intent }).diagnostics).toEqual(expect.arrayContaining([
      'DEV03_ORDER_IMPACTS_BEFORE_ALIGNMENT', 'DEV03_ORDER_ALIGNMENT_BEFORE_SHAKE',
    ]));
  });

  it('allows rejected generated candidates and provider-authored preservation IDs', () => {
    const intent = structuredClone(canonical().editorialIntent) as JsonRecord;
    const routeDecision = intent.routeDecision as JsonRecord;
    const nativeCandidate = structuredClone((routeDecision.candidateForms as JsonRecord[])[0]);
    routeDecision.candidateForms = [nativeCandidate, {
      ...nativeCandidate,
      form: 'GENERATED_COMPOSITION',
      hardGateStatus: 'INELIGIBLE',
      ownerRefs: ['generated_composition_program'],
      blockers: ['RESEARCH_ONLY_NOT_IMPLEMENTED'],
    }];
    (intent.preservationIntents as JsonRecord[]).forEach((entry, index) => {
      entry.preservationId = `provider-authored-preservation-${index}`;
    });
    expect(evaluate('BASELINE', { editorialIntent: intent })).toEqual({
      assessment: 'PASS', expectedStageDisposition: 'READY_FOR_COMPILATION', diagnostics: [],
    });
  });

  it('accepts a bound plan that honestly stops at isolated-proxy capability support', () => {
    const bound = structuredClone(canonical().evidenceBoundIntents.BASELINE) as JsonRecord;
    bound.stageDisposition = 'CAPABILITY_GAP';
    bound.unresolvedRequirements = [{
      requirementId: 'provider-authored-native-execution-gap', kind: 'CAPABILITY',
      factIds: ['fact-support-sync_cuts_to_beats', 'fact-support-apply_camera_shake'],
      disposition: 'CAPABILITY_GAP', failureDisposition: 'STOP_BEFORE_COMPILATION_OR_RENDER',
    }];
    expect(evaluate('BASELINE', { evidenceBoundIntent: bound })).toEqual({
      assessment: 'PASS', expectedStageDisposition: 'READY_FOR_COMPILATION', diagnostics: [],
    });
  });

  it('rejects the old authored 120-grid in place of measured 119/239/359/479 evidence', () => {
    const pack = structuredClone(canonical().evidencePacks.BASELINE) as JsonRecord;
    const fact = (pack.facts as JsonRecord[]).find(({ factId }) => factId === 'fact-measured-beats');
    if (!fact) throw new Error('Missing measured beat fact');
    fact.strongPeakFrames = [120, 240, 360, 480];
    fact.finalStrongPeakFrame = 480;
    expect(evaluate('BASELINE', { evidencePack: pack }).diagnostics).toContain('DEV03_STAGE3_MEASURED_PEAK_DRIFT');
  });

  it('binds exact media/analyzer provenance rather than trusting a BPM label', () => {
    const pack = structuredClone(canonical().evidencePacks.BASELINE) as JsonRecord;
    const fact = (pack.facts as JsonRecord[]).find(({ factId }) => factId === 'fact-measured-beats');
    if (!fact) throw new Error('Missing measured beat fact');
    fact.receiptHash = '0'.repeat(64);
    fact.analyzerOptionsHash = '1'.repeat(64);
    expect(evaluate('BASELINE', { evidencePack: pack }).diagnostics).toEqual(expect.arrayContaining([
      'DEV03_STAGE3_MEASURED_RECEIPT_HASH_DRIFT', 'DEV03_STAGE3_ANALYZER_BINDING_DRIFT',
    ]));
  });

  it('binds source handles to the probed 600-frame cards asset', () => {
    const pack = structuredClone(canonical().evidencePacks.BASELINE) as JsonRecord;
    const handles = (pack.facts as JsonRecord[]).find(({ factId }) => factId === 'fact-source-handles');
    if (!handles) throw new Error('Missing source handle fact');
    expect(handles).toMatchObject({
      sourceArtifactSha256: '4e1050d3922a599b9354a3eb87a670acfdd4232e839058071e46081df4d9ebfd',
      sourceDurationFramesByAssetId: { 'dev03-cards': 600 },
      sourceStartFrames: [0, 160, 10, 470],
    });
    handles.sourceDurationFramesByAssetId = { 'dev03-cards': 900 };
    handles.sourceStartFrames = [0, 160, 320, 600];
    expect(evaluate('BASELINE', { evidencePack: pack }).diagnostics).toContain('DEV03_STAGE3_SOURCE_HANDLE_FACT_DRIFT');
  });

  it('requires explicit protected-audio and rendered-result proof', () => {
    const bound = structuredClone(canonical().evidenceBoundIntents.BASELINE) as JsonRecord;
    bound.proofPlan = (bound.proofPlan as JsonRecord[]).filter(({ kind }) => kind !== 'PROTECTED_AUDIO_BYTES_AND_TIMING' && kind !== 'RENDERED_SHAKE_AND_NEUTRAL_RETURN');
    expect(evaluate('BASELINE', { evidenceBoundIntent: bound }).diagnostics).toEqual(expect.arrayContaining([
      'DEV03_STAGE3_PROOF_MISSING:PROTECTED_AUDIO_BYTES_AND_TIMING',
      'DEV03_STAGE3_PROOF_MISSING:RENDERED_SHAKE_AND_NEUTRAL_RETURN',
    ]));
  });

  it('never turns withheld beat evidence into a ready or fabricated binding', () => {
    const source = canonical();
    const bound = structuredClone(source.evidenceBoundIntents.BEAT_EVIDENCE_WITHHELD) as JsonRecord;
    bound.stageDisposition = 'READY_FOR_COMPILATION';
    const pack = structuredClone(source.evidencePacks.BEAT_EVIDENCE_WITHHELD) as JsonRecord;
    (pack.facts as JsonRecord[]).push({ factId: 'fact-measured-beats' });
    const result = evaluate('BEAT_EVIDENCE_WITHHELD', { evidencePack: pack, evidenceBoundIntent: bound });
    expect(result.diagnostics).toEqual(expect.arrayContaining(['DEV03_STAGE3_WITHHELD_BEATS_FALSE_BOUND', 'DEV03_STAGE3_DISPOSITION']));
  });

  it('is deterministic for the same measured receipt', () => {
    const first = canonical();
    const second = canonical();
    expect(hashCanonicalJsonV1(first)).toBe(hashCanonicalJsonV1(second));
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
