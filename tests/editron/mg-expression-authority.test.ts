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
    ]));
    expect(authority.calibration.status).toBe('invented-needs-calibration');
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
    expect(authority.structuralStrength).toBeGreaterThanOrEqual(0.9);
    expect(authority.momentStrength).toBeGreaterThan(0.8);
    expect(authority.typography.fontSizePx).toBeGreaterThanOrEqual(72);
    expect(authority.layout.position).toBe('top-right');
    expect(authority.layout.maxWidth).toMatch(/%$/);
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
    expect(authority.screenPressure).toBeGreaterThan(0.7);
    expect(authority.reasons).toEqual(expect.arrayContaining([
      'long-copy:wider-readable-layout',
      'screen-pressure:restrain-size-and-density',
    ]));
    expect(authority.layout.position).toBe('top-right');
    expect(maxWidth).toBeGreaterThanOrEqual(48);
    expect(maxWidth).toBeLessThanOrEqual(60);
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
