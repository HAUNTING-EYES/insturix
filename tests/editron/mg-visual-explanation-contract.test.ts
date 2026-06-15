import { describe, expect, it } from 'vitest';

import { deriveContentStructure } from '../../lib/editron/motion-graphics/engine/content-shape-analyzer';
import {
  resolveVisualExplanationContract,
  type VisualExplanationContract,
} from '../../lib/editron/motion-graphics/engine/visual-explanation-contract';

function expectEveryObligationHasEvidence(contract: VisualExplanationContract) {
  expect(contract.obligations.length).toBeGreaterThan(0);
  for (const obligation of contract.obligations) {
    expect(obligation.evidenceAtomKeys.length).toBeGreaterThan(0);
  }
}

describe('visual explanation contract', () => {
  it('suppresses filler keyword-only content instead of licensing a rich MG', () => {
    const contract = resolveVisualExplanationContract({
      content: { keyword: 'people' },
      signals: {
        speech_energy: 0.2,
        word_importance: 0.15,
        visual_significance: 0.1,
      },
    });

    expect(contract.allow).toBe(false);
    expect(contract.obligations).toEqual([]);
    expect(contract.missingEvidence).toEqual(expect.arrayContaining([
      'visual-obligation',
      'meaningful-structure',
    ]));
    expect(contract.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'conservative-fallback' }),
    ]));
    expect(contract.calibration.status).toBe('invented-needs-calibration');
  });

  it('licenses process/list visuals through ordered evidence obligations', () => {
    const contract = resolveVisualExplanationContract({
      content: {
        title: 'Three-step workflow',
        body: 'How the edit gets better',
        steps: ['Find the claim', 'Show the proof', 'Land the payoff'],
      },
      signals: {
        speech_energy: 0.74,
        word_importance: 0.82,
        visual_dependency: 0.76,
      },
    });

    expect(contract.allow).toBe(true);
    expect(contract.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'preserve-order' }),
      expect.objectContaining({ kind: 'show-sequence' }),
      expect.objectContaining({ kind: 'show-cardinality' }),
    ]));
    expect(contract.evidenceAtomKeys).toEqual(expect.arrayContaining([
      'part:steps:list-items',
      'part:title:title',
    ]));
    expectEveryObligationHasEvidence(contract);
  });

  it('requires bounded evidence before claiming a proportion visual job', () => {
    const unbounded = resolveVisualExplanationContract({
      content: { value: '47%', label: 'conversion lift' },
      signals: { speech_energy: 0.82, word_importance: 0.9 },
    });
    const bounded = resolveVisualExplanationContract({
      content: {
        value: '47%',
        label: 'conversion lift',
        quantityKind: 'percentage',
        denominator: 100,
        bounded: true,
      },
      signals: { speech_energy: 0.82, word_importance: 0.9 },
    });

    expect(unbounded.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'show-magnitude' }),
    ]));
    expect(unbounded.obligations.some((obligation) => obligation.kind === 'show-proportion')).toBe(false);
    expect(unbounded.missingEvidence).toContain('bounded-denominator-or-part-of-whole');

    expect(bounded.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'show-proportion' }),
    ]));
    expectEveryObligationHasEvidence(bounded);
  });

  it('does not compare peers without two peer roles and a compares relation', () => {
    const incompleteStructure = deriveContentStructure({ from: 'before only' });
    const incomplete = resolveVisualExplanationContract({
      content: { from: 'before only' },
      structure: incompleteStructure,
      signals: { word_importance: 0.8 },
    });
    const complete = resolveVisualExplanationContract({
      content: {
        from: 'manual edits',
        to: 'signal-aware edits',
        fromLabel: 'Before',
        toLabel: 'After',
      },
      signals: { word_importance: 0.84, visual_dependency: 0.74 },
    });

    expect(incomplete.obligations.some((obligation) => obligation.kind === 'compare-peers')).toBe(false);
    expect(complete.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'compare-peers' }),
    ]));
    expect(complete.evidenceAtomKeys).toEqual(expect.arrayContaining([
      'relation:compares:compare-from->compare-to',
    ]));
  });

  it('chooses full-frame stage only from high gain plus busy or low-space footage evidence', () => {
    const baseContent = {
      title: 'Launch checklist',
      steps: ['Hook', 'Proof', 'Offer'],
    };
    const overlay = resolveVisualExplanationContract({
      content: baseContent,
      signals: {
        speech_energy: 0.72,
        word_importance: 0.76,
        visual_dependency: 0.68,
        visual_complexity: 0.2,
        negative_space: 0.78,
      },
    });
    const fullFrame = resolveVisualExplanationContract({
      content: baseContent,
      signals: {
        speech_energy: 0.86,
        word_importance: 0.9,
        visual_dependency: 0.86,
        visual_complexity: 0.82,
        negative_space: 0.12,
        text_on_screen: 0.74,
      },
    });

    expect(overlay.stageMode).toBe('overlay-on-footage');
    expect(fullFrame.stageMode).toBe('full-frame-graphic-scene');
    expectEveryObligationHasEvidence(fullFrame);
  });

  it('uses real Path E dotted screen signals and directional negative-space evidence for stage mode', () => {
    const baseContent = {
      title: 'Launch checklist',
      steps: ['Hook', 'Proof', 'Offer'],
    };
    const overlay = resolveVisualExplanationContract({
      content: baseContent,
      signals: {
        'speech.energy': 0.72,
        'word.importance': 0.76,
        'visual.dependency': 0.68,
        'visual.complexity': 0.2,
        'visual.negative_space.right': 0.78,
      },
    });
    const fullFrame = resolveVisualExplanationContract({
      content: baseContent,
      signals: {
        'speech.energy': 0.86,
        'word.importance': 0.9,
        'visual.dependency': 0.86,
        'visual.complexity': 0.82,
        'visual.text_on_screen': 0.74,
        'visual.negative_space.top': 0.12,
        'visual.negative_space.right': 0.16,
        'visual.negative_space.bottom': 0.1,
        'visual.negative_space.left': 0.14,
      },
    });

    expect(overlay.stageMode).toBe('overlay-on-footage');
    expect(fullFrame.stageMode).toBe('full-frame-graphic-scene');
    expectEveryObligationHasEvidence(fullFrame);
  });

  it('routes screen/search evidence to device or screen stage mode without template ids', () => {
    const contract = resolveVisualExplanationContract({
      content: {
        query: 'best ai video editor for podcasts',
        url: 'https://example.com/search',
        title: 'Search proof',
      },
      signals: {
        word_importance: 0.82,
        visual_dependency: 0.8,
      },
    });

    expect(contract.stageMode).toBe('device-or-screen-scene');
    expect(contract.obligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'show-search-query' }),
      expect.objectContaining({ kind: 'show-device-context' }),
    ]));
    expect(JSON.stringify(contract)).not.toMatch(/template/i);
  });
});
