import { deepFreezeV1 } from './contracts-v1';
import type { GenericLoweringPolicyV2R } from './generic-lowerer-v2r';

// Frozen DEV-01 field-binding policy. Creative and mutation parameters must come
// from the model-owned intent or a declared production-owner output. Fixture
// ranges and overlay ids are deliberately forbidden as lowering shortcuts.
export const DEV01_LOWERING_POLICY_V2R: GenericLoweringPolicyV2R = deepFreezeV1({
  policyVersion: 'EDITRON_OE_GENERIC_LOWERING_POLICY_V2R_3',
  taskId: 'DEV-01',
  fieldBindings: {
    projectId: { source: 'REVISION_PROJECT_ID' },
    expectedProjectRevision: { source: 'REVISION_EXPECTED_REVISION' },
    evidenceIds: { source: 'EVIDENCE_IDS' },
    selector: { source: 'STATIC', staticValue: { scope: 'WHOLE_PROJECT' } },
    constraints: { source: 'STATIC', staticValue: { preserveSpeech: true, preserveSourceIdentities: true } },
    targetRange: {
      source: 'NODE_OUTPUT',
      producers: [{
        operatorId: 'resolve_transcript_edit', outputName: 'proposedOperation',
        projectionPath: ['arguments', 'targetRange'],
      }],
    },
    timelineCoordinateTransform: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'cut_section', outputName: 'timelineCoordinateTransform' }],
    },
    splitChildren: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'cut_section', outputName: 'splitChildren' }],
    },
    overlayId: {
      source: 'NODE_OUTPUT',
      producers: [
        {
          operatorId: 'resolve_keyframe_edit', outputName: 'proposedOperation',
          projectionPath: ['arguments', 'overlayId'],
        },
        { operatorId: 'find_visual_moment', outputName: 'overlayId' },
      ],
    },
    targetFrame: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'find_visual_moment', outputName: 'targetFrame' }],
    },
    evidenceStrength: {
      source: 'NODE_OUTPUT',
      producers: [{ operatorId: 'find_visual_moment', outputName: 'evidenceStrength' }],
    },
    focalPoint: {
      source: 'NODE_OUTPUT',
      producers: [
        {
          operatorId: 'resolve_keyframe_edit', outputName: 'proposedOperation',
          projectionPath: ['arguments', 'focalPoint'],
        },
        { operatorId: 'find_visual_moment', outputName: 'focalPoint' },
      ],
    },
    keyframes: {
      source: 'NODE_OUTPUT',
      producers: [{
        operatorId: 'resolve_keyframe_edit', outputName: 'proposedOperation',
        projectionPath: ['arguments', 'keyframes'],
      }],
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
      query: { source: 'MODEL_INPUT' },
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
    apply_audio_ducking: {
      audioPlan: { source: 'MODEL_INPUT' },
    },
    get_video_transcription: {
      assetId: { source: 'STATIC', staticValue: 'dev01-dialogue-truth-v2' },
    },
  },
});
