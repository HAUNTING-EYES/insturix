import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-03 (audio/video beat-sync) field-binding policy. Semantic values
// (the find query, the shake effect plan) are MODEL_INPUT; structural values
// (revision, overlay ids, beat-sync constraints and post-alignment target) are
// bound by the lowerer from revision/facts/causal owner outputs.
export const DEV03_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_3',
  taskId: 'DEV-03',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    overlayIds: { source: 'FACT_FIELD', factKind: 'TIMELINE_SNAPSHOT', factField: 'overlayIds' },
    beatPlan: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'find_audio_moment', outputName: 'result' }],
    },
    beatSyncConstraints: {
      source: 'FACT_FIELD', factKind: 'BEAT_SYNC_CONSTRAINTS', factField: 'constraints',
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
      overlayId: { source: 'MODEL_INPUT' },
    },
    resolve_visual_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_audio_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    apply_camera_shake: {
      overlayId: {
        source: 'NODE_OUTPUT',
        producers: [{ operatorId: 'sync_cuts_to_beats', outputName: 'result', projectionPath: ['finalHitOverlayId'] }],
      },
      targetFrame: {
        source: 'NODE_OUTPUT',
        producers: [{ operatorId: 'sync_cuts_to_beats', outputName: 'result', projectionPath: ['finalStrongPeakFrame'] }],
      },
      effectPlan: { source: 'MODEL_INPUT' },
    },
  },
});
