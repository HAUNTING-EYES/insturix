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
    expect(V2R_OPERATOR_CATALOG_REVISION).toBe('EDITRON_OPERATOR_SPECS_V2R_3');
    expect(V2R_OPERATOR_CATALOG.derivedFrom).toMatchObject({
      artifact: 'tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json',
      version: '2.0.0',
    });
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
