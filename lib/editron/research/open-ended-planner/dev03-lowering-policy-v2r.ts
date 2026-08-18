import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-03 (audio/video beat-sync) field-binding policy. Binds the
// beat-sync and camera-shake operators against the DEV-03 evidence pack
// (timeline snapshot overlay ids, measured beat grid) and the model's own
// dependency edges.
export const DEV03_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R',
  taskId: 'DEV-03',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    overlayIds: { source: 'FACT_FIELD', factKind: 'TIMELINE_SNAPSHOT', factField: 'overlayIds' },
    audioPlan: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'find_audio_moment', outputName: 'result' }],
    },
  },
  operatorFieldBindings: {
    find_audio_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    find_transcript_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    resolve_transcript_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    find_visual_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    resolve_visual_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_audio_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_keyframe_edit: {
      overlayId: { source: 'STATIC', staticValue: 'dev03-card-4' },
      intent: { source: 'MODEL_INPUT' },
    },
    apply_camera_shake: {
      overlayId: { source: 'STATIC', staticValue: 'dev03-card-4' },
      targetRange: { source: 'STATIC', staticValue: { coordinateDomain: 'PROJECT_TICK', start: '472', endExclusive: '600' } },
      effectPlan: { source: 'MODEL_INPUT' },
    },
  },
});
