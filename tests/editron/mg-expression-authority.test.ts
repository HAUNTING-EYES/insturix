import { describe, expect, it } from 'vitest';

import {
  applyMgExpressionAuthorityToRecipe,
  applyMgExpressionAuthorityToScores,
  resolveMgExpressionAuthority,
} from '../../lib/editron/services/mg-expression-authority';
import type { ContentStructureSignature, Recipe } from '../../lib/editron/motion-graphics/engine/recipe-types';

function structure(parts: ContentStructureSignature['parts']): ContentStructureSignature {
  const channels: ContentStructureSignature['channels'] = {};
  for (const part of parts) channels[part.channel] = (channels[part.channel] ?? 0) + part.confidence;
  return {
    parts,
    relations: [],
    channels,
    evidence: {},
    primaryChannel: parts[0]?.channel ?? 'text',
  };
}

describe('MG expression authority', () => {
  it('suppresses low-signal keyword-only MG candidates', () => {
    const authority = resolveMgExpressionAuthority({
      content: { keyword: 'people' },
      structure: structure([
        { role: 'keyword', channel: 'text', sourceKey: 'keyword', value: 'people', confidence: 0.6 },
      ]),
      signals: {
        speech_energy: 0.12,
        word_importance: 0.16,
        visual_significance: 0.08,
        text_on_screen: 0.2,
      },
      graphicsDensity: 'moderate',
    });

    expect(authority.allowMotionGraphic).toBe(false);
    expect(authority.qualityTier).toBe('suppressed');
    expect(authority.reasons).toEqual(expect.arrayContaining([
      'suppressed:relevance-below-threshold',
      'keyword-only:requires-high-moment-strength',
      'visual-contract:no-evidence-backed-obligation',
    ]));
    expect(authority.visualExplanationContract.allow).toBe(false);
    expect(authority.visualExplanationContract.obligations).toHaveLength(0);
    expect(authority.calibration.status).toBe('invented-needs-calibration');
  });

  it('blocks high-energy keyword-only candidates with no visual obligation', () => {
    const authority = resolveMgExpressionAuthority({
      content: { keyword: 'momentum' },
      structure: structure([
        { role: 'keyword', channel: 'text', sourceKey: 'keyword', value: 'momentum', confidence: 0.82 },
      ]),
      signals: {
        speech_energy: 0.96,
        word_importance: 0.92,
        visual_significance: 0.86,
        cinematic_moment: 0.9,
      },
      graphicsDensity: 'moderate',
    });

    expect(authority.relevanceScore).toBeGreaterThan(0.45);
    expect(authority.allowMotionGraphic).toBe(false);
    expect(authority.qualityTier).toBe('suppressed');
    expect(authority.reasons).toEqual(expect.arrayContaining([
      'visual-contract:no-evidence-backed-obligation',
      'visual-contract:observe-only-risk-or-low-gain',
    ]));
  });

  it('allows a meaningful scalar moment and resolves readable size metadata', () => {
    const authority = resolveMgExpressionAuthority({
      content: { value: '47%', label: 'conversion lift' },
      structure: structure([
        { role: 'primary-value', channel: 'scalar', sourceKey: 'value', value: '47%', confidence: 0.95 },
        { role: 'supporting-label', channel: 'text', sourceKey: 'label', value: 'conversion lift', confidence: 0.9 },
      ]),
      signals: {
        speech_energy: 0.8,
        word_importance: 0.86,
        visual_significance: 0.55,
        text_on_screen: 0.12,
      },
      placementRegion: 'top-right',
      graphicsDensity: 'moderate',
    });

    expect(authority.allowMotionGraphic).toBe(true);
    expect(authority.visualExplanationContract.obligations.map((obligation) => obligation.kind)).toContain('show-magnitude');
    expect(authority.structuralStrength).toBeGreaterThanOrEqual(0.9);
    expect(authority.momentStrength).toBeGreaterThan(0.8);
    expect(authority.typography.fontSizePx).toBeGreaterThanOrEqual(72);
    expect(authority.layout.position).toBe('top-right');
    expect(authority.layout.maxWidth).toMatch(/%$/);
  });

  it('lets the visual explanation contract veto structurally strong but low-gain MG candidates', () => {
    const authority = resolveMgExpressionAuthority({
      content: { value: '47%', label: 'conversion lift' },
      structure: structure([
        { role: 'primary-value', channel: 'scalar', sourceKey: 'value', value: '47%', confidence: 0.95 },
        { role: 'supporting-label', channel: 'text', sourceKey: 'label', value: 'conversion lift', confidence: 0.9 },
      ]),
      signals: {
        word_importance: 0.3,
        text_on_screen: 0.02,
      },
      graphicsDensity: 'moderate',
    });

    expect(authority.structuralStrength).toBeGreaterThanOrEqual(0.9);
    expect(authority.relevanceScore).toBeGreaterThanOrEqual(0.45);
    expect(authority.visualExplanationContract.obligations.map((obligation) => obligation.kind)).toContain('show-magnitude');
    expect(authority.visualExplanationContract.allow).toBe(false);
    expect(authority.allowMotionGraphic).toBe(false);
    expect(authority.qualityTier).toBe('suppressed');
    expect(authority.reasons).toContain('visual-contract:observe-only-risk-or-low-gain');
  });

  it('uses screen pressure to restrain long-copy layout without losing relevance', () => {
    const authority = resolveMgExpressionAuthority({
      content: {
        quote: 'This is the one reason the entire system started behaving differently.',
        author: 'Founder',
      },
      structure: structure([
        { role: 'quote', channel: 'text', sourceKey: 'quote', value: 'This is the one reason the entire system started behaving differently.', confidence: 0.9 },
        { role: 'author', channel: 'identity', sourceKey: 'author', value: 'Founder', confidence: 0.7 },
      ]),
      signals: {
        speech_energy: 0.88,
        visual_significance: 0.6,
        text_on_screen: 0.85,
        text_box_count: 3,
        object_count: 6,
        visual_complexity: 0.75,
      },
      placementRegion: 'top-right',
      graphicsDensity: 'moderate',
    });

    const maxWidth = Number.parseInt(authority.layout.maxWidth, 10);

    expect(authority.allowMotionGraphic).toBe(true);
    expect(authority.visualExplanationContract.obligations.map((obligation) => obligation.kind)).toContain('quote-proof');
    expect(authority.screenPressure).toBeGreaterThan(0.7);
    expect(authority.reasons).toEqual(expect.arrayContaining([
      'long-copy:wider-readable-layout',
      'screen-pressure:restrain-size-and-density',
    ]));
    expect(authority.layout.position).toBe('top-right');
    expect(maxWidth).toBeGreaterThanOrEqual(48);
    expect(maxWidth).toBeLessThanOrEqual(60);
  });

  it('carries process obligations as authority metadata before renderer wiring', () => {
    const authority = resolveMgExpressionAuthority({
      content: {
        title: 'How the edit shifts',
        items: ['Hook lands', 'Claim gets proved', 'Offer resolves'],
      },
      structure: structure([
        { role: 'title', channel: 'text', sourceKey: 'title', value: 'How the edit shifts', confidence: 0.84 },
        { role: 'list-items', channel: 'text', sourceKey: 'items', value: ['Hook lands', 'Claim gets proved', 'Offer resolves'], confidence: 0.9 },
      ]),
      signals: {
        speech_energy: 0.94,
        word_importance: 0.96,
        visual_dependency: 0.92,
        cinematic_moment: 0.88,
        visual_significance: 0.9,
        visual_complexity: 0.7,
        negative_space: 0.16,
      },
      placementRegion: 'top-center',
      graphicsDensity: 'moderate',
    });

    expect(authority.allowMotionGraphic).toBe(true);
    expect(authority.visualExplanationContract.obligations.map((obligation) => obligation.kind)).toEqual(expect.arrayContaining([
      'preserve-order',
      'show-sequence',
    ]));
    expect(authority.visualExplanationContract.stageMode).toBe('full-frame-graphic-scene');
    expect(authority.reasons).toContain('visual-contract:stage:full-frame-graphic-scene');
  });

  it('projects visual contract stage into recipe visual intent and layout', () => {
    const authority = resolveMgExpressionAuthority({
      content: {
        title: 'How the edit shifts',
        items: ['Hook lands', 'Claim gets proved', 'Offer resolves'],
      },
      structure: structure([
        { role: 'title', channel: 'text', sourceKey: 'title', value: 'How the edit shifts', confidence: 0.84 },
        { role: 'list-items', channel: 'text', sourceKey: 'items', value: ['Hook lands', 'Claim gets proved', 'Offer resolves'], confidence: 0.9 },
      ]),
      signals: {
        speech_energy: 0.94,
        word_importance: 0.96,
        visual_dependency: 0.92,
        cinematic_moment: 0.88,
        visual_significance: 0.9,
        visual_complexity: 0.7,
        negative_space: 0.16,
      },
      placementRegion: 'top-right',
      graphicsDensity: 'moderate',
    });
    const recipe: Recipe = {
      id: 'composed-process',
      elements: [],
      layout: { position: 'top-right' },
      exitStyle: 'hold-then-fade',
    };
    const resolvedRecipe = applyMgExpressionAuthorityToRecipe(recipe, authority);

    expect(resolvedRecipe.visualIntent).toEqual(expect.objectContaining({
      source: 'visual-explanation-contract-v1',
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: expect.arrayContaining(['preserve-order', 'show-sequence']),
    }));
    expect(resolvedRecipe.visualIntent?.renderDirectives).toEqual(expect.objectContaining({
      preferFullFrame: true,
      captionZoneAware: true,
      suppressDecorativeAccents: true,
      preferDataViz: true,
    }));
    expect(resolvedRecipe.layout.position).toBe('center');
    expect(resolvedRecipe.layout.maxWidth).toBe('88%');
    expect(resolvedRecipe.layout.captionZoneAware).toBe(true);
    expect(resolvedRecipe.layout.arrangement).toBe('vertical-stack');
  });

  it('projects split, device, and transition stage modes into distinct recipe layouts', () => {
    const comparisonAuthority = resolveMgExpressionAuthority({
      content: {
        from: 'manual edits',
        to: 'signal-aware edits',
        fromLabel: 'Before',
        toLabel: 'After',
      },
      signals: {
        speech_energy: 0.9,
        word_importance: 0.92,
        visual_dependency: 0.9,
        cinematic_moment: 0.72,
        visual_significance: 0.72,
        screen_pressure: 0.5,
      },
    });
    const deviceAuthority = resolveMgExpressionAuthority({
      content: {
        query: 'best ai video editor for podcasts',
        url: 'https://example.com/search',
        title: 'Search proof',
      },
      signals: {
        speech_energy: 0.86,
        word_importance: 0.9,
        visual_dependency: 0.9,
      },
    });
    const transitionAuthority = resolveMgExpressionAuthority({
      content: {
        title: 'Three-step workflow',
        steps: ['Find the claim', 'Show the proof', 'Land the payoff'],
      },
      signals: {
        speech_energy: 0.86,
        word_importance: 0.9,
        visual_dependency: 0.86,
        transition_boundary_strength: 0.8,
      },
    });
    const baseRecipe: Recipe = {
      id: 'composed-stage-test',
      elements: [],
      layout: { position: 'bottom-right' },
      exitStyle: 'hold-then-fade',
    };

    const split = applyMgExpressionAuthorityToRecipe(baseRecipe, comparisonAuthority);
    const device = applyMgExpressionAuthorityToRecipe(baseRecipe, deviceAuthority);
    const transition = applyMgExpressionAuthorityToRecipe(baseRecipe, transitionAuthority);

    expect(split.visualIntent?.stageMode).toBe('split-footage-graphic');
    expect(split.layout).toEqual(expect.objectContaining({
      position: 'center',
      maxWidth: '92%',
      arrangement: 'horizontal-distributed',
      captionZoneAware: true,
    }));

    expect(device.visualIntent?.stageMode).toBe('device-or-screen-scene');
    expect(device.layout).toEqual(expect.objectContaining({
      position: 'center',
      maxWidth: '78%',
      captionZoneAware: true,
    }));

    expect(transition.visualIntent?.stageMode).toBe('mg-led-transition');
    expect(transition.layout).toEqual(expect.objectContaining({
      position: 'full-width-top',
      maxWidth: '100%',
      captionZoneAware: true,
    }));
  });

  it('applies authority to MG scores and the final recipe layout', () => {
    const authority = resolveMgExpressionAuthority({
      content: { value: '82%', label: 'retention lift' },
      structure: structure([
        { role: 'primary-value', channel: 'scalar', sourceKey: 'value', value: '82%', confidence: 0.95 },
      ]),
      signals: { speech_energy: 0.82, word_importance: 0.88 },
      placementRegion: 'bottom-right',
    });
    const scores = applyMgExpressionAuthorityToScores({
      'mg.typography.font_size': { score: 0.1, values: { fontSize: 48 } },
    }, authority);
    const recipe: Recipe = {
      id: 'composed-numeric',
      elements: [],
      layout: { position: 'center' },
      exitStyle: 'hold-then-fade',
    };
    const resolvedRecipe = applyMgExpressionAuthorityToRecipe(recipe, authority);

    expect(scores?.['mg.typography.font_size'].values.fontSize).toBeGreaterThanOrEqual(72);
    expect(scores?.['mg.emphasis.scale_contrast'].values.scaleContrast).toBeGreaterThan(1.08);
    expect(resolvedRecipe.layout.position).toBe('bottom-right');
    expect(resolvedRecipe.layout.maxWidth).toMatch(/%$/);
  });
});
