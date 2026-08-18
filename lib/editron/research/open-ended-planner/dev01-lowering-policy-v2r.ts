import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-01 field-binding policy. Every value here is a declared constant or
// a mechanical fact/node-output reference; the lowerer invents nothing at runtime.
// The overlay identity is a frozen fixture constant because DEV-01's synthetic
// evidence pack carries no overlay-discovery fact; a production policy would bind
// it from a timeline read instead.
export const DEV01_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_2',
  taskId: 'DEV-01',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    selector: { source: 'STATIC', staticValue: 'whole-project' },
    constraints: { source: 'STATIC', staticValue: { preserveSpeech: true, preserveSourceIdentities: true } },
    targetRange: { source: 'FACT_FIELD', factKind: 'TRANSCRIPT_RANGE', factField: 'deadAirRange' },
    overlayId: { source: 'STATIC', staticValue: 'ov-host-video' },
    keyframes: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'resolve_keyframe_edit', outputName: 'proposedOperation' }],
    },
    audioPlan: {
      source: 'NODE_OUTPUT',
      producers: [
        { operatorId: 'resolve_audio_edit', outputName: 'proposedOperation' },
        { operatorId: 'find_audio_moment', outputName: 'result' },
      ],
    },
  },
  operatorFieldBindings: {
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
    },
    resolve_visual_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    resolve_audio_edit: {
      intent: { source: 'MODEL_INPUT' },
    },
    get_video_transcription: {
      assetId: { source: 'STATIC', staticValue: 'dev01-dialogue-truth-v2' },
    },
  },
});
