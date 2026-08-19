import { describe, expect, it } from 'vitest';

import {
  CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R,
  CAP2A_PLANNER_SUPPLEMENT_V2R,
  cap2aPlannerSupplementForOperatorV2R,
} from '@/lib/editron/research/open-ended-planner/cap2a-planner-supplement-v2r';
import { parseCap2aPlannerOperationV2R } from '@/lib/editron/research/open-ended-planner/cap2a-planner-operation-contract-v2r';

const expectedIds = [
  'get_video_transcription', 'batch_update_overlays', 'split_overlay', 'trim_overlay',
  'close_gaps', 'cut_section', 'apply_audio_ducking', 'add_transition', 'reframe_project',
  'use_matching_footage', 'add_sfx', 'search_stock_footage', 'generate_html_scene', 'add_motion_graphic',
] as const;

describe('V2R code-grounded planner supplement', () => {
  it('covers exactly the fourteen previously unmapped selectable operators', () => {
    expect(CAP2A_PLANNER_SUPPLEMENT_V2R.rows.map(({ selectableOperatorId }) => selectableOperatorId)).toEqual(expectedIds);
    expect(new Set(CAP2A_PLANNER_SUPPLEMENT_V2R.rows.map(({ supplementRecordId }) => supplementRecordId)).size).toBe(expectedIds.length);
  });

  it('is immutable, provenance-bound, and never claims CAP2A census authority', () => {
    expect(Object.isFrozen(CAP2A_PLANNER_SUPPLEMENT_V2R)).toBe(true);
    expect(CAP2A_PLANNER_SUPPLEMENT_V2R.authority).toBe('RESEARCH_ONLY_CODE_GROUNDED_SUPPLEMENT_NOT_CAP2A_CENSUS');
    expect(CAP2A_PLANNER_SUPPLEMENT_V2R.sourceCommit).toBe(CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R);
    expect(CAP2A_PLANNER_SUPPLEMENT_V2R.supplementSha256).toHaveLength(64);
    expect(CAP2A_PLANNER_SUPPLEMENT_V2R.rows.every(({ sourceCommit }) => sourceCommit === CAP2A_PLANNER_SUPPLEMENT_SOURCE_COMMIT_V2R)).toBe(true);
  });

  it('contains all production dossier dimensions without certifying any row', () => {
    for (const { dossier } of CAP2A_PLANNER_SUPPLEMENT_V2R.rows) {
      expect(dossier.support.certificationStatus).toBe('UNCERTIFIED');
      expect(dossier.support.plannerEligibility).not.toBe('PRODUCTION_ELIGIBLE');
      expect(dossier.contract.inputSchema).toBeTruthy();
      expect(dossier.contract.outputSchema).toBeTruthy();
      expect(dossier.owners.decisionOwner).toBeTruthy();
      expect(dossier.effects.requires.length).toBeGreaterThan(0);
      expect(dossier.execution.failureDispositions.length).toBeGreaterThan(0);
      expect(dossier.verification.proofDispositions).toEqual(['PASS', 'FAIL', 'UNVERIFIABLE']);
      expect(dossier.recovery.reproducibilityBindings.length).toBeGreaterThanOrEqual(3);
      expect(dossier.policy.rights).toBeTruthy();
      expect(dossier.policy.privacy).toBeTruthy();
      expect(dossier.policy.egress).toBeTruthy();
      expect(dossier.policy.promptInjection).toBeTruthy();
      expect(dossier.policy.network).toBeTruthy();
      expect(dossier.resources.limits).toBeTruthy();
      expect(dossier.evidenceRefs.length).toBeGreaterThan(0);
    }
  });

  it('preserves high-risk code truth instead of inventing canonical receipts', () => {
    const cut = cap2aPlannerSupplementForOperatorV2R('cut_section')?.dossier;
    expect(cut?.execution.revisionSemantics).toBe('UNSAFE_NONE');
    expect(cut?.contract.outputSchema.properties).not.toHaveProperty('receipt');
    expect(cut?.contract.resolverHandoff.disposition).toBe('DIVERGENT');
    const duck = cap2aPlannerSupplementForOperatorV2R('apply_audio_ducking')?.dossier;
    expect(duck?.effects.stateEffects.join(' ')).toContain('duckingConfig');
    expect(duck?.effects.writes.map(({ selector }) => selector).join(' ')).not.toContain('keyframe');
    const transcript = cap2aPlannerSupplementForOperatorV2R('get_video_transcription')?.dossier;
    expect(transcript?.effects.writes.map(({ selector }) => selector)).toContain('media-assets.transcription-cache');
    const motionGraphic = cap2aPlannerSupplementForOperatorV2R('add_motion_graphic')?.dossier;
    expect(motionGraphic?.support.plannerEligibility).toBe('EXCLUDED');
    expect(motionGraphic?.resources.limits.productionFlagDefault).toBe('disabled');
  });

  it('returns null outside the supplement', () => {
    expect(cap2aPlannerSupplementForOperatorV2R('read_project_file')).toBeNull();
  });

  it('rejects any attempt to promote an unsafe writer or apply UNSAFE_NONE to a read', () => {
    const cut = cap2aPlannerSupplementForOperatorV2R('cut_section')?.dossier;
    expect(cut).toBeDefined();
    expect(() => parseCap2aPlannerOperationV2R({
      ...cut,
      support: { ...cut?.support, certificationStatus: 'CERTIFIED' },
    })).toThrow('an unsafe writer cannot be certified or production eligible');
    expect(() => parseCap2aPlannerOperationV2R({ ...cut, kind: 'READ' }))
      .toThrow('UNSAFE_NONE is valid only for a state-changing operation');
  });
});
