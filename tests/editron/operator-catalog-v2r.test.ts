import { describe, expect, it } from 'vitest';

import {
  V2R_OPERATOR_CATALOG,
  V2R_OPERATOR_CATALOG_REVISION,
  v2rOperatorFieldSchema,
} from '@/lib/editron/research/open-ended-planner/operator-catalog-v2r';
import { validateJsonSchemaV2 } from '@/lib/editron/research/open-ended-planner/stage4-compilation-evaluator-v2';

type JsonRecord = Record<string, unknown>;

describe('V2R operator-specific input contracts', () => {
  it('versions causal contract changes without rewriting the historical catalog', () => {
    expect(V2R_OPERATOR_CATALOG_REVISION).toBe('EDITRON_OPERATOR_SPECS_V2R_8');
    expect(V2R_OPERATOR_CATALOG.derivedFrom).toMatchObject({
      artifact: 'tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json',
      version: '2.0.0',
    });
    expect(operator('read_project_file').ownerRef)
      .toBe('lib/editron/agent/tools.ts#createEditronTools/read_project_file');
    expect(operator('get_timeline_view').ownerRef)
      .toBe('lib/editron/agent/tools.ts#createEditronTools/get_timeline_view');
    expect(operator('get_video_transcription').ownerRef)
      .toBe('lib/editron/agent/tools.ts#createEditronTools/get_video_transcription');
    expect(operator('find_transcript_moment').ownerRef)
      .toBe('lib/editron/agent/chat-transcript-tools.ts#findTranscriptMomentCandidates');
    expect(operator('find_audio_moment').ownerRef)
      .toBe('lib/editron/agent/chat-audio-tools.ts#findAudioMomentCandidates');
  });

  it('keeps beat alignment distinct from dialogue ducking and exposes causal shake inputs', () => {
    const sync = operator('sync_cuts_to_beats');
    const shake = operator('apply_camera_shake');
    expect(record(sync.input).fields).toEqual([
      'projectId', 'expectedProjectRevision', 'overlayIds', 'beatPlan', 'beatSyncConstraints', 'evidenceIds',
    ]);
    expect(record(sync.input).fields).not.toContain('audioPlan');
    expect(record(sync.output).required).toEqual(['receipt', 'result']);
    expect(record(shake.input).fields).toEqual([
      'projectId', 'expectedProjectRevision', 'overlayId', 'targetFrame', 'effectPlan',
    ]);
    expect(record(shake.input).fields).not.toContain('targetRange');

    const effectPlan = requiredSchema('apply_camera_shake', 'effectPlan');
    expect(validateJsonSchemaV2({
      goal: 'Accentuate the final measured impact without overwhelming the cut.',
      formIntent: 'restrained-impact',
    }, effectPlan, '$.effectPlan')).toEqual([]);
    expect(validateJsonSchemaV2({
      goal: 'Accentuate the final measured impact.',
      formIntent: 'restrained-impact',
      intensity: 0.2,
      durationFrames: 12,
      replacePositionKeyframes: false,
    }, effectPlan, '$.effectPlan')).toEqual(expect.arrayContaining([
      '$.effectPlan.intensity:ADDITIONAL',
      '$.effectPlan.durationFrames:ADDITIONAL',
      '$.effectPlan.replacePositionKeyframes:ADDITIONAL',
    ]));
    expect(validateJsonSchemaV2({
      goal: 'Accentuate the final measured impact.',
      formIntent: 'barely-visible',
    }, effectPlan, '$.effectPlan')).toContain('$.effectPlan.formIntent:ENUM');
  });

  it('accepts the real mixed overlay identity domain only for operators that declare it', () => {
    const shakeOverlayId = requiredSchema('apply_camera_shake', 'overlayId');
    expect(validateJsonSchemaV2('dev03-card-4', shakeOverlayId, '$.overlayId')).toEqual([]);
    expect(validateJsonSchemaV2(104, shakeOverlayId, '$.overlayId')).toEqual([]);
    expect(validateJsonSchemaV2({ id: 104 }, shakeOverlayId, '$.overlayId')).toEqual(['$.overlayId:ANY_OF']);

    const keyframeOverlayId = requiredSchema('set_keyframes', 'overlayId');
    expect(validateJsonSchemaV2(104, keyframeOverlayId, '$.overlayId')).toEqual([]);
    expect(validateJsonSchemaV2('dev03-card-4', keyframeOverlayId, '$.overlayId')).toEqual(['$.overlayId:INTEGER']);
  });

  it('rejects a ducking plan where measured beat evidence is required', () => {
    const beatPlan = requiredSchema('sync_cuts_to_beats', 'beatPlan');
    const valid = {
      schemaVersion: 'EDITRON_MEASURED_BEAT_PLAN_V2R_1',
      assetId: 'dev03-beats',
      measuredEvidenceReceiptHash: 'a'.repeat(64),
      strongPeakFrames: [119, 239, 359, 479],
      finalStrongPeakFrame: 479,
    };
    expect(validateJsonSchemaV2(valid, beatPlan, '$.beatPlan')).toEqual([]);
    expect(validateJsonSchemaV2({ enabled: true }, beatPlan, '$.beatPlan')).toEqual(expect.arrayContaining([
      '$.beatPlan.schemaVersion:REQUIRED',
      '$.beatPlan.strongPeakFrames:REQUIRED',
      '$.beatPlan.enabled:ADDITIONAL',
    ]));
  });

  it('defines duckLevel as an absolute speech-time gain owned by the audio resolver', () => {
    const audioPlan = requiredSchema('apply_audio_ducking', 'audioPlan');
    const properties = record(audioPlan.properties);
    expect(audioPlan.description).toContain('applyAudioDuckingToProject');
    expect(record(properties.duckLevel).description).toContain('Absolute linear BGM output gain');
    expect(record(properties.duckLevel).description).toContain('not a percentage');
    expect(record(properties.duckLevel).description).toContain('owner default');
    expect(validateJsonSchemaV2({ enabled: true }, audioPlan, '$.audioPlan')).toEqual([]);
    expect(validateJsonSchemaV2({ enabled: true, duckLevel: 0.089 }, audioPlan, '$.audioPlan')).toEqual([]);
    expect(validateJsonSchemaV2({ enabled: true, duckLevel: 0.9 }, audioPlan, '$.audioPlan'))
      .toContain('$.audioPlan.duckLevel:NUMBER');
  });

  it('validates evidence-bound beat-sync constraints including source handles', () => {
    const constraints = requiredSchema('sync_cuts_to_beats', 'beatSyncConstraints');
    const valid = {
      maxSnapFrames: 12,
      minClipFrames: 30,
      maxConsecutiveBeatCuts: 4,
      protectedAudioRange: { startFrame: 250, endFrame: 350 },
      protectedBoundaryToleranceFrames: 2,
      sourceDurationFramesByAssetId: { 'dev03-cards': 600 },
      requireSourceHandles: true,
    };
    expect(validateJsonSchemaV2(valid, constraints, '$.constraints')).toEqual([]);
    expect(validateJsonSchemaV2({
      ...valid,
      sourceDurationFramesByAssetId: { 'dev03-cards': 0 },
    }, constraints, '$.constraints')).toEqual(['$.constraints.sourceDurationFramesByAssetId.dev03-cards:INTEGER']);
  });

  it('publishes the real closed resolver action domains instead of opaque objects', () => {
    const transcriptOperator = operator('resolve_transcript_edit');
    expect(record(transcriptOperator.input).fields).toEqual([
      'projectId', 'expectedProjectRevision', 'query', 'intent', 'evidenceIds',
    ]);
    expect(record(transcriptOperator.input).fields).not.toContain('constraints');
    const transcriptQuery = requiredSchema('resolve_transcript_edit', 'query');
    expect(transcriptQuery.description).toContain('Exact spoken transcript phrase');
    expect(transcriptQuery.description).toContain('not the editing instruction');

    const transcript = requiredSchema('resolve_transcript_edit', 'intent');
    expect(validateJsonSchemaV2({ action: 'cut_after_phrase', minGapFrames: 6 }, transcript, '$.intent'))
      .toEqual([]);
    expect(validateJsonSchemaV2({ action: 'duck_music' }, transcript, '$.intent'))
      .toContain('$.intent.action:ENUM');

    const audio = requiredSchema('resolve_audio_edit', 'intent');
    expect(validateJsonSchemaV2({ query: 'final impact', action: 'sync_cuts_to_beats' }, audio, '$.intent'))
      .toEqual([]);
    expect(validateJsonSchemaV2({ query: 'dialogue', action: 'ducking' }, audio, '$.intent'))
      .toContain('$.intent.action:ENUM');

    const keyframe = requiredSchema('resolve_keyframe_edit', 'intent');
    expect(validateJsonSchemaV2({ direction: 'in', scaleDelta: 0.12 }, keyframe, '$.intent'))
      .toEqual([]);
    expect(validateJsonSchemaV2({ direction: 'in', scaleDelta: 0.8 }, keyframe, '$.intent'))
      .toContain('$.intent.scaleDelta:NUMBER');
    expect(validateJsonSchemaV2({ direction: 'in', madeUp: true }, keyframe, '$.intent'))
      .toContain('$.intent.madeUp:ADDITIONAL');
  });
});

function operator(operatorId: string): JsonRecord {
  const match = records(V2R_OPERATOR_CATALOG.operators)
    .find((candidate) => candidate.operatorId === operatorId);
  if (!match) throw new Error(`TEST_OPERATOR_MISSING:${operatorId}`);
  return match;
}

function requiredSchema(operatorId: string, field: string): Readonly<JsonRecord> {
  const schema = v2rOperatorFieldSchema(operatorId, field);
  if (!schema) throw new Error(`TEST_SCHEMA_MISSING:${operatorId}:${field}`);
  return schema;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )) : [];
}
