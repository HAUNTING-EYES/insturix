import { describe, expect, it } from 'vitest';

import {
  CHAT_EDIT_PHASE0_BASELINE_CASES,
  findChatEditPhase0BaselineCase,
  summarizeChatEditPhase0Baseline,
  type ChatEditBaselineCategory,
} from '../../lib/editron/services/chat-edit-phase0-baseline';

describe('chat edit Phase 0 baseline', () => {
  it('defines a stable, non-empty coverage set for chat editing', () => {
    expect(CHAT_EDIT_PHASE0_BASELINE_CASES.length).toBeGreaterThanOrEqual(12);

    const ids = CHAT_EDIT_PHASE0_BASELINE_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const testCase of CHAT_EDIT_PHASE0_BASELINE_CASES) {
      expect(testCase.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(testCase.prompt.trim().length).toBeGreaterThan(12);
      expect(testCase.currentEvidence.trim().length).toBeGreaterThan(20);
      expect(testCase.successCriteria.length).toBeGreaterThan(0);
      expect(testCase.targetPhases.length).toBeGreaterThan(0);
      expect(testCase.requiredContext.length).toBeGreaterThan(0);
      expect(testCase.requiredTools.length).toBeGreaterThan(0);
    }
  });

  it('covers the operation families named in the Phase 0 plan', () => {
    const categories = new Set(CHAT_EDIT_PHASE0_BASELINE_CASES.map((testCase) => testCase.category));
    const requiredCategories: ChatEditBaselineCategory[] = [
      'overlay-crud',
      'cut',
      'captions',
      'transition',
      'sfx',
      'asset-retrieval',
      'keyframes',
      'undo',
      'transcript-reference',
      'visual-reference',
      'sound-reference',
      'operation-gap',
    ];

    for (const category of requiredCategories) {
      expect(categories.has(category), `missing category ${category}`).toBe(true);
    }
  });

  it('keeps only still-missing semantic operation wrappers as expected failures', () => {
    expect(findChatEditPhase0BaselineCase('cut-transcript-phrase')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('asset-logo-by-description')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('keyframes-zoom-selected')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('visual-reference-logo-appears')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('sound-reference-beat-drop')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('undo-ai-edit')?.currentStatus).toBe('partial-now');
    expect(findChatEditPhase0BaselineCase('operation-audio-ducking')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-camera-shake')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-speed-ramp')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-fade')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-layer-reorder')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-move-retime')?.currentStatus).toBe('supported-now');
    expect(findChatEditPhase0BaselineCase('operation-filter-owner')?.currentStatus).toBe('supported-now');
  });

  it('summarizes baseline status for Phase 1 planning', () => {
    const summary = summarizeChatEditPhase0Baseline();

    expect(summary).toMatchObject({
      version: 'chat-edit-phase0-baseline-v1',
      total: CHAT_EDIT_PHASE0_BASELINE_CASES.length,
      byStatus: {
        'supported-now': 20,
        'partial-now': 2,
        'expected-failure': 0,
      },
    });
    expect(summary.expectedFailureIds).toEqual([]);
    expect(summary.targetPhases).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
