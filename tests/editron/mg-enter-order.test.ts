import { describe, expect, it } from 'vitest';

import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { planComposition } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { resolveElements } from '../../lib/editron/motion-graphics/engine/property-resolver';
import type { RecipeElement } from '../../lib/editron/motion-graphics/engine/recipe-types';

const baseSignals = {
  formality: 0.3,
  enthusiasm: 0.82,
  warmth: 0.5,
  emotional_arousal: 0.78,
  pacing_velocity: 0.72,
  humor: 0.1,
  visceral_impact: 0.68,
  visual_dependency: 0.4,
};

function emphasisRecipe(signals: Record<string, number>) {
  const tokens = resolveMotionTokens({ ...baseSignals, ...signals }, {});
  const content = { text: 'one thing changed everything' };
  const recipe = planComposition({ content }, tokens, { ...baseSignals, ...signals });
  const resolved = resolveElements(recipe.elements, tokens, content);
  return { recipe, resolved };
}

function orderFor(elements: Array<{ role: string; enterOrder?: number }>, role: string): number {
  const value = elements.find((element) => element.role === role)?.enterOrder;
  if (typeof value !== 'number') throw new Error(`Missing enterOrder for ${role}`);
  return value;
}

describe('MG signal-driven enter order', () => {
  it('lets high-salience low-clutter moments reveal the message before the scaffold', () => {
    const { recipe, resolved } = emphasisRecipe({
      speech_energy: 0.9,
      word_importance: 0.9,
      narrative_pressure: 0.85,
      cinematic_moment: 0.8,
      motion_intensity: 0.1,
      text_on_screen: 0.05,
    });

    expect(orderFor(recipe.elements, 'primary')).toBeLessThan(orderFor(recipe.elements, 'container'));
    expect(orderFor(resolved, 'primary')).toBeLessThan(orderFor(resolved, 'container'));
  });

  it('keeps the scaffold first when visual clutter/reading risk is high', () => {
    const { recipe, resolved } = emphasisRecipe({
      formality: 0.35,
      speech_energy: 0.55,
      word_importance: 0.42,
      narrative_pressure: 0.35,
      cinematic_moment: 0.25,
      motion_intensity: 0.9,
      text_on_screen: 0.92,
      text_coverage: 0.86,
    });

    expect(orderFor(recipe.elements, 'container')).toBeLessThan(orderFor(recipe.elements, 'primary'));
    expect(orderFor(resolved, 'container')).toBeLessThan(orderFor(resolved, 'primary'));
  });

  it('lets explicit recipe order override the legacy role default', () => {
    const tokens = resolveMotionTokens(baseSignals, {});
    const elements: RecipeElement[] = [
      { primitive: 'text', role: 'primary', enterOrder: 1, bind: { text: 'content:text' } },
      { primitive: 'container', role: 'container', enterOrder: 4, bind: { fill: 'token:color.surfaceBase' } },
    ];

    const resolved = resolveElements(elements, tokens, { text: 'priority copy' });

    expect(orderFor(resolved, 'primary')).toBe(1);
    expect(orderFor(resolved, 'container')).toBe(4);
  });
});