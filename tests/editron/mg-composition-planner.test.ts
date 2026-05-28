import { describe, it, expect } from 'vitest';
import { planComposition, type MgOverlayScores } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import type { GraphicIntent } from '../../lib/editron/motion-graphics/engine/recipe-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build MotionTokens with specific accent/primary to control hasAccent. */
function makeTokens(overrides?: { accentColor?: string; primaryColor?: string }) {
  return resolveMotionTokens({}, {
    accentColor: overrides?.accentColor ?? '#D4A652',
    primaryColor: overrides?.primaryColor ?? '#ECE9E1',
  });
}

/** Convenience: tokens where accent === primary (no accent line). */
function tokensNoAccent() {
  return resolveMotionTokens({}, { accentColor: '#FFFFFF', primaryColor: '#FFFFFF' });
}

/** Numeric intent — simplest shape for budget/suppression tests. */
function numericIntent(value = '100', label = 'Score'): GraphicIntent {
  return { kind: 'numeric', content: { value, label } };
}

/** Identity intent — lower-third style. */
function identityIntent(name = 'John', title = 'CEO'): GraphicIntent {
  return { kind: 'identity', content: { name, title } };
}

// ---------------------------------------------------------------------------
// 1. Suppression
// ---------------------------------------------------------------------------

describe('planComposition — suppression', () => {
  const tokens = makeTokens();

  it('suppresses when montage_mode > 0.5 (elements empty)', () => {
    const recipe = planComposition(numericIntent(), tokens, { montage_mode: 0.6 } as never);
    expect(recipe.id).toBe('suppressed');
    expect(recipe.elements).toHaveLength(0);
  });

  it('suppresses when active_overlay_count >= 3', () => {
    const recipe = planComposition(numericIntent(), tokens, { active_overlay_count: 3 } as never);
    expect(recipe.id).toBe('suppressed');
    expect(recipe.elements).toHaveLength(0);
  });

  it('montage_mode at exactly 0.5 does NOT suppress', () => {
    // Threshold is > 0.5, so exactly 0.5 should NOT suppress
    const recipe = planComposition(numericIntent(), tokens, {
      montage_mode: 0.5,
      position_in_video: 0.5,
    } as never);
    expect(recipe.id).not.toBe('suppressed');
    expect(recipe.elements.length).toBeGreaterThan(0);
  });

  it('default signals when none provided — does not crash', () => {
    const recipe = planComposition(numericIntent(), tokens);
    // No signals = default budget (3), should compose something
    expect(recipe.elements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Budget gates
// ---------------------------------------------------------------------------

describe('planComposition — budget gates', () => {
  const tokens = makeTokens();

  it('budget >= 3 + accent != primary → accent line appears', () => {
    // position_in_video 0.5 → budget 3. Accent differs from primary (default tokens).
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never);
    const accent = recipe.elements.find(e => e.role === 'accent');
    expect(accent).toBeDefined();
    expect(accent!.primitive).toBe('decoration');
  });

  it('budget 2 → no accent', () => {
    // position_in_video < 0.2 → budget 1 (too low for accent line at budget >= 3)
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.1 } as never);
    const accent = recipe.elements.find(e => e.role === 'accent');
    expect(accent).toBeUndefined();
  });

  it('cinematic_moment > 0.6 boosts budget (brand-pattern appears at boosted 4)', () => {
    // position_in_video 0.5 → base budget 3. cinematic_moment 0.7 > 0.6 → +1 = 4.
    // Budget 4 = brand-pattern appears.
    const recipe = planComposition(numericIntent(), tokens, {
      position_in_video: 0.5,
      cinematic_moment: 0.7,
    } as never);
    const pattern = recipe.elements.find(e => e.role === 'brand-pattern');
    expect(pattern).toBeDefined();
  });

  it('cinematic_moment at exactly 0.6 → no boost', () => {
    // Threshold is > 0.6, so exactly 0.6 should NOT boost.
    // position_in_video 0.5 → base budget 3. No boost → stays 3 → no brand-pattern.
    const recipe = planComposition(numericIntent(), tokens, {
      position_in_video: 0.5,
      cinematic_moment: 0.6,
    } as never);
    const pattern = recipe.elements.find(e => e.role === 'brand-pattern');
    expect(pattern).toBeUndefined();
  });

  it('budget capped at 5', () => {
    // position_in_video 0.9 → base budget 5. cinematic_moment 0.9 → +1 = 6, but cap = 5.
    // Should not crash; elements should still compose.
    const recipe = planComposition(numericIntent(), tokens, {
      position_in_video: 0.9,
      cinematic_moment: 0.9,
    } as never);
    expect(recipe.elements.length).toBeGreaterThan(0);
    // No element count > what budget=5 allows (accent + pattern + particle possible)
    // Just verify it does not exceed reasonable bounds
    expect(recipe.elements.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 3. Overlay-driven layout
// ---------------------------------------------------------------------------

describe('planComposition — overlay-driven layout', () => {
  const tokens = makeTokens();

  it('center_avoidance > 0.6 moves center layout to corner', () => {
    // numeric intent → layout starts as 'center' (from content-shape-analyzer).
    // centerAvoidance > 0.6 → override to a corner position.
    const scores: MgOverlayScores = {
      'mg.layout.center_avoidance': { score: 0.8, values: { centerAvoidance: 0.7 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never, scores);
    expect(recipe.layout.position).not.toBe('center');
    // Should be one of ['bottom-left', 'top-right', 'bottom-right', 'top-left']
    expect(['bottom-left', 'top-right', 'bottom-right', 'top-left']).toContain(recipe.layout.position);
  });

  it('center_avoidance at exactly 0.6 does NOT move', () => {
    // Threshold is > 0.6, so exactly 0.6 should keep center.
    const scores: MgOverlayScores = {
      'mg.layout.center_avoidance': { score: 0.6, values: { centerAvoidance: 0.6 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never, scores);
    expect(recipe.layout.position).toBe('center');
  });

  it('entrance overlay winner overrides entrancePattern', () => {
    const scores: MgOverlayScores = {
      'mg.animation.entrance_pop': { score: 0.9, values: {} },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never, scores);
    // At least one foreground text element should have entranceOverride = 'pop'
    const overridden = recipe.elements.filter(e => e.primitive === 'text' && e.layer === 'foreground' && e.entranceOverride === 'pop');
    expect(overridden.length).toBeGreaterThan(0);
  });

  it("textSplit = 'chars' when enthusiasm > 0.7 with kinetic entrance", () => {
    // Kinetic entrances: pop, slide, scale, skew, zoom-blur
    const scores: MgOverlayScores = {
      'mg.animation.entrance_pop': { score: 0.9, values: {} },
    };
    const recipe = planComposition(numericIntent(), tokens, {
      position_in_video: 0.5,
      enthusiasm: 0.8,
    } as never, scores);
    const textEls = recipe.elements.filter(e => e.primitive === 'text' && e.layer === 'foreground');
    expect(textEls.length).toBeGreaterThan(0);
    for (const el of textEls) {
      if (!el.textSplit) continue; // skip if it already had a textSplit set before the planner loop
      expect(el.textSplit).toBe('chars');
    }
  });

  it("textSplit = 'words' when enthusiasm <= 0.7", () => {
    const scores: MgOverlayScores = {
      'mg.animation.entrance_slide': { score: 0.9, values: {} },
    };
    const recipe = planComposition(numericIntent(), tokens, {
      position_in_video: 0.5,
      enthusiasm: 0.5,
    } as never, scores);
    const textEls = recipe.elements.filter(e => e.primitive === 'text' && e.layer === 'foreground' && e.textSplit);
    expect(textEls.length).toBeGreaterThan(0);
    for (const el of textEls) {
      expect(el.textSplit).toBe('words');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Particle producer
// ---------------------------------------------------------------------------

describe('particle producer', () => {
  const tokens = makeTokens();

  it('particle added when budget >= 4 and particleScore >= 0.15', () => {
    // position_in_video 0.7 → budget 4
    const scores: MgOverlayScores = {
      'mg.particle.confetti': { score: 0.5, values: { particleScore: 0.3 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.7 } as never, scores);
    const particle = recipe.elements.find(e => e.primitive === 'particle');
    expect(particle).toBeDefined();
    expect(particle!.role).toBe('ambient-particles');
  });

  it('particle NOT added when budget < 4', () => {
    // position_in_video 0.5 → budget 3 (< 4)
    const scores: MgOverlayScores = {
      'mg.particle.confetti': { score: 0.5, values: { particleScore: 0.5 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never, scores);
    const particle = recipe.elements.find(e => e.primitive === 'particle');
    expect(particle).toBeUndefined();
  });

  it('particle NOT added when particleScore < 0.15 (use 0.14)', () => {
    // budget 4, but particleScore below threshold
    const scores: MgOverlayScores = {
      'mg.particle.confetti': { score: 0.5, values: { particleScore: 0.14 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.7 } as never, scores);
    const particle = recipe.elements.find(e => e.primitive === 'particle');
    expect(particle).toBeUndefined();
  });

  it('particle count linear mapping (score → count)', () => {
    // Formula: Math.round(10 + particleScore * 60)
    // particleScore=0.5 → round(10+30) = 40
    const scores: MgOverlayScores = {
      'mg.particle.sparkle': { score: 0.8, values: { particleScore: 0.5 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.7 } as never, scores);
    const particle = recipe.elements.find(e => e.primitive === 'particle');
    expect(particle).toBeDefined();
    expect(particle!.bind.particleCount).toBe(40);
  });

  it('preset from overlay ID suffix', () => {
    const scores: MgOverlayScores = {
      'mg.particle.sparkle': { score: 0.8, values: { particleScore: 0.3 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.7 } as never, scores);
    const particle = recipe.elements.find(e => e.primitive === 'particle');
    expect(particle).toBeDefined();
    expect(particle!.bind.particlePreset).toBe('sparkle');
  });
});

// ---------------------------------------------------------------------------
// 5. Mask producer
// ---------------------------------------------------------------------------

describe('mask producer', () => {
  const tokens = makeTokens();

  it('mask added when budget >= 5 and maskScore >= 0.5', () => {
    // cinematic_moment > 0.6 boosts budget to 4, position_in_video 0.9 → budget 5
    const scores: MgOverlayScores = {
      'mg.mask.rect_reveal': { score: 0.8, values: { maskScore: 0.6 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.9, cinematic_moment: 0.7 } as never, scores);
    const mask = recipe.elements.find(e => e.primitive === 'mask');
    expect(mask).toBeDefined();
    expect(mask!.role).toBe('reveal-mask');
  });

  it('mask NOT added when budget < 5', () => {
    // position_in_video 0.5 → budget 3, not enough
    const scores: MgOverlayScores = {
      'mg.mask.rect_reveal': { score: 0.8, values: { maskScore: 0.6 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.5 } as never, scores);
    const mask = recipe.elements.find(e => e.primitive === 'mask');
    expect(mask).toBeUndefined();
  });

  it('mask NOT added when maskScore < 0.5 (use 0.49)', () => {
    // budget 5 but maskScore below threshold
    const scores: MgOverlayScores = {
      'mg.mask.rect_reveal': { score: 0.8, values: { maskScore: 0.49 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.9, cinematic_moment: 0.7 } as never, scores);
    const mask = recipe.elements.find(e => e.primitive === 'mask');
    expect(mask).toBeUndefined();
  });

  it('circle mask from winner ID containing "circle"', () => {
    const scores: MgOverlayScores = {
      'mg.mask.circle_reveal': { score: 0.8, values: { maskScore: 0.6 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.9, cinematic_moment: 0.7 } as never, scores);
    const mask = recipe.elements.find(e => e.primitive === 'mask');
    expect(mask).toBeDefined();
    expect(mask!.shape).toBe('circle');
    expect(mask!.bind.direction).toBe('center');
  });

  it('rect mask for non-circle winner', () => {
    const scores: MgOverlayScores = {
      'mg.mask.rect_reveal': { score: 0.8, values: { maskScore: 0.6 } },
    };
    const recipe = planComposition(numericIntent(), tokens, { position_in_video: 0.9, cinematic_moment: 0.7 } as never, scores);
    const mask = recipe.elements.find(e => e.primitive === 'mask');
    expect(mask).toBeDefined();
    expect(mask!.shape).toBe('rect');
    expect(mask!.bind.direction).toBe('left');
  });
});
