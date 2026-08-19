import { describe, expect, it } from 'vitest';

import {
  buildV2RSemanticOperatorPolicyV2R,
  evaluateV2RSemanticOperatorsV2R,
} from '@/lib/editron/research/open-ended-planner/v2r-semantic-operator-policy';

function node(intentNodeId: string, selectedOperatorId: string, requiresNodeIds: string[] = []) {
  return { intentNodeId, selectedOperatorId, requiresNodeIds };
}

const validDev01Nodes = [
  node('transcript-resolve', 'resolve_transcript_edit'),
  node('cut', 'cut_section', ['transcript-resolve']),
  node('visual-find', 'find_visual_moment', ['cut']),
  node('keyframe-resolve', 'resolve_keyframe_edit', ['visual-find']),
  node('push', 'set_keyframes', ['keyframe-resolve']),
  node('duck', 'apply_audio_ducking', ['cut']),
];

describe('V2R semantic operator policy', () => {
  it('is an immutable six-case evaluator freeze that is not model input', () => {
    const policy = buildV2RSemanticOperatorPolicyV2R();
    expect(Object.isFrozen(policy)).toBe(true);
    expect(policy.authority).toBe('RESEARCH_ONLY_EVALUATOR_NOT_EXPOSED_TO_MODELS');
    expect(policy.cases).toHaveLength(6);
    expect(policy.policySha256).toHaveLength(64);
  });

  it('passes a complete causally ordered DEV-01 plan', () => {
    const receipt = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-01', conditionId: 'BASELINE',
      editorialIntent: { nodes: validDev01Nodes },
      evidenceBoundIntent: { stageDisposition: 'READY_FOR_COMPILATION', unresolvedRequirements: [] },
    });
    expect(receipt.disposition).toBe('PASS');
    expect(receipt.diagnostics).toEqual([]);
    expect(receipt.receiptSha256).toHaveLength(64);
  });

  it('fails missing effects and illegal mutation choices without penalizing harmless repeated reads', () => {
    const receipt = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-01', conditionId: 'BASELINE',
      editorialIntent: {
        nodes: [
          ...validDev01Nodes.filter(({ selectedOperatorId }) => selectedOperatorId !== 'apply_audio_ducking'),
          node('project-read', 'read_project_file'),
          node('obsolete-audio-resolver', 'resolve_audio_edit'),
          node('random-grade', 'apply_color_grade'),
        ],
      },
      evidenceBoundIntent: { stageDisposition: 'READY_FOR_COMPILATION', unresolvedRequirements: [] },
    });
    expect(receipt.disposition).toBe('FAIL');
    expect(receipt.diagnostics).toContain('EFFECT_GROUP_CARDINALITY:DIALOGUE_DUCK:0:1:1');
    expect(receipt.diagnostics).toContain('OPERATOR_NOT_ALLOWED:resolve_audio_edit');
    expect(receipt.diagnostics).toContain('OPERATOR_NOT_ALLOWED:apply_color_grade');
    expect(receipt.diagnostics).not.toContainEqual(expect.stringContaining('read_project_file'));
  });

  it('requires honest evidence and capability gaps in the correct conditions', () => {
    const withheld = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-03', conditionId: 'BEAT_EVIDENCE_WITHHELD',
      editorialIntent: { nodes: [node('find', 'find_audio_moment')] },
      evidenceBoundIntent: {
        stageDisposition: 'UNVERIFIABLE',
        unresolvedRequirements: [{ kind: 'EVIDENCE', disposition: 'UNVERIFIABLE' }],
      },
    });
    expect(withheld.disposition).toBe('PASS');

    const dishonestGap = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-04', conditionId: 'BASELINE',
      editorialIntent: { nodes: [node('generated', 'generated_composition_program')] },
      evidenceBoundIntent: { stageDisposition: 'CAPABILITY_GAP', unresolvedRequirements: [] },
    });
    expect(dishonestGap.disposition).toBe('FAIL');
    expect(dishonestGap.diagnostics).toContain('EXPECTED_GAP_MISSING:CAPABILITY:CAPABILITY_GAP');
  });

  it('requires DEV-03 beat discovery, alignment, and final shake in causal order', () => {
    const pass = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-03', conditionId: 'BASELINE',
      editorialIntent: { nodes: [
        node('find', 'find_audio_moment'),
        node('align', 'sync_cuts_to_beats', ['find']),
        node('shake', 'apply_camera_shake', ['align']),
      ] },
      evidenceBoundIntent: { stageDisposition: 'READY_FOR_COMPILATION', unresolvedRequirements: [] },
    });
    expect(pass.disposition).toBe('PASS');

    const fail = evaluateV2RSemanticOperatorsV2R({
      taskId: 'DEV-03', conditionId: 'BASELINE',
      editorialIntent: { nodes: [
        node('find', 'find_audio_moment'),
        node('shake', 'apply_camera_shake', ['find']),
        node('align', 'sync_cuts_to_beats', ['shake']),
      ] },
      evidenceBoundIntent: { stageDisposition: 'READY_FOR_COMPILATION', unresolvedRequirements: [] },
    });
    expect(fail.disposition).toBe('FAIL');
    expect(fail.diagnostics).toContain('DEPENDENCY_MISSING:BEAT_ALIGN:FINAL_SHAKE');
  });
});
