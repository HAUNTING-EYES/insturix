import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-03 (audio/video beat-sync) field-binding policy. Semantic values
// (the find query, the shake effect plan) are MODEL_INPUT; structural values
// (revision, overlay ids from the timeline snapshot, the final-hit range) are
// bound by the lowerer from revision/facts.
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
    // The model may plan with any of the read/resolver family operators (the
    // same set DEV-01 binds). Their semantic inputs are MODEL_INPUT; binding them
    // here keeps the lowerer from mistaking a legitimate planning choice for a
    // capability gap. The stage-6 executor still gates on the required DEV-03
    // mutation operators (sync_cuts_to_beats + apply_camera_shake).
    find_transcript_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    find_visual_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    find_audio_moment: {
      query: { source: 'MODEL_INPUT' },
    },
    resolve_transcript_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_keyframe_edit: {
      intent: { source: 'MODEL_INPUT' },
      overlayId: { source: 'STATIC', staticValue: 'dev03-card-4' },
    },
    resolve_visual_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_audio_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    apply_camera_shake: {
      overlayId: { source: 'STATIC', staticValue: 'dev03-card-4' },
      targetRange: { source: 'STATIC', staticValue: { coordinateDomain: 'PROJECT_TICK', start: '472', endExclusive: '600' } },
      effectPlan: { source: 'MODEL_INPUT' },
    },
  },
});
