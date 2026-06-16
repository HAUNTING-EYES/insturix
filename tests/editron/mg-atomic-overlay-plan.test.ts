import { describe, expect, it } from 'vitest';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import { planComposition, type MgOverlayScores } from '../../lib/editron/motion-graphics/engine/composition-planner';
import { buildAtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import type { Recipe } from '../../lib/editron/motion-graphics/engine/recipe-types';

const energeticSignals = {
  formality: 0.2,
  enthusiasm: 0.95,
  warmth: 0.35,
  emotional_arousal: 0.85,
  pacing_velocity: 0.8,
  humor: 0.15,
  visceral_impact: 0.75,
  visual_dependency: 0.85,
  cinematic_moment: 0.8,
};

const calmSignals = {
  formality: 0.8,
  enthusiasm: 0.2,
  warmth: 0.55,
  emotional_arousal: 0.2,
  pacing_velocity: 0.25,
  humor: 0.05,
  visceral_impact: 0.15,
  visual_dependency: 0.2,
  cinematic_moment: 0.1,
};

const energeticScores: MgOverlayScores = {
  'mg.animation.entrance_slide': { score: 0.9, values: {} },
  'mg.animation.hold_pulse': { score: 0.9, values: {} },
  'mg.typography.font_size': { score: 0.8, values: { fontSize: 96 } },
  'mg.typography.line_height': { score: 0.6, values: { lineHeight: 1.08 } },
  'mg.emphasis.scale_contrast': { score: 0.7, values: { scaleContrast: 2.1 } },
};

function makeTokens(signals = energeticSignals) {
  return resolveMotionTokens(signals, {
    accentColor: '#00ff00',
    primaryColor: '#f8f8f8',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
  });
}

describe('atomic overlay plan', () => {
  it('breaks a textual numeric MG into typography, color, xyz motion, and intensity atoms', () => {
    const content = { value: '47%', label: 'conversion lift', prefix: '+', suffix: ' YoY' };
    const tokens = makeTokens();
    const recipe = planComposition({ content }, tokens, energeticSignals, energeticScores);
    const atomic = buildAtomicOverlayPlan(recipe, tokens, content, energeticSignals, energeticScores);
    const counter = atomic.elements.find((element) => element.role === 'counter');

    expect(atomic.recipeId).toBe('composed-numeric');
    expect(counter).toBeDefined();
    expect(counter!.structure.parts).toContainEqual({ kind: 'glyph-run', semantic: 'counter' });
    expect(counter!.structure.parts).toContainEqual({
      kind: 'glyph-run',
      semantic: 'counter:prefix',
      channel: 'text',
      purpose: 'label',
      quantity: 1,
      constraints: { minReadablePx: 96 },
    });
    expect(counter!.structure.parts).toContainEqual({
      kind: 'glyph-run',
      semantic: 'counter:value',
      channel: 'text',
      purpose: 'value',
      quantity: 3,
      constraints: { minReadablePx: 96 },
    });
    expect(counter!.structure.parts).toContainEqual({
      kind: 'glyph-run',
      semantic: 'counter:suffix',
      channel: 'text',
      purpose: 'label',
      quantity: 4,
      constraints: { minReadablePx: 96 },
    });
    expect(counter!.structure.text).toEqual({
      glyphRole: 'value',
      hierarchy: 'primary',
      emphasis: 'hero',
      casing: 'mixed',
      lines: ['+47% YoY'],
      splitMode: 'chars',
    });
    expect(counter!.typography?.family).toBe('JetBrains Mono');
    expect(counter!.typography?.sizePx).toBe(96);
    expect(counter!.typography?.lineHeight).toBe(1.08);
    expect(counter!.color.text).toBe(tokens.color.accent);
    expect(counter!.color.accent).toBe('#00ff00');
    expect(counter!.motion.coordinateSystem).toBe('screen-xyz');
    expect(counter!.motion.neutralPosition).toEqual({ x: 0, y: 0, z: 0 });
    expect(counter!.motion.tracks.some((track) => track.property === 'z')).toBe(true);
    expect(counter!.motion.tracks.some((track) => track.property === 'y' && track.phase === 'entrance')).toBe(true);
    expect(counter!.motion.tracks.some((track) => track.property === 'scaleX' && track.phase === 'hold')).toBe(true);
    expect(atomic.intensity.signal).toBeGreaterThan(0.7);
    expect(atomic.intensity.overall).toBeGreaterThan(0.3);
  });

  it('atomizes text semantics and normalized media roles', () => {
    const recipe: Recipe = {
      id: 'text-media-atom-test',
      layout: { position: 'center' },
      exitStyle: 'simultaneous-fade',
      elements: [
        {
          primitive: 'text',
          role: 'primary',
          layer: 'foreground',
          textSplit: 'words',
          bind: {
            text: 'Launch\nNow',
            font: 'Inter',
            weight: 800,
            minSize: 72,
            color: '#ffffff',
            transform: 'uppercase',
          },
        },
        {
          primitive: 'image',
          role: 'avatar',
          layer: 'foreground',
          bind: { src: 'content:avatar', width: 64, height: 64, radius: 999 },
        },
        {
          primitive: 'image',
          role: 'logo',
          layer: 'foreground',
          bind: { src: 'content:logo', height: 40 },
        },
      ],
    };

    const atomic = buildAtomicOverlayPlan(
      recipe,
      makeTokens(),
      { avatar: 'https://x/a.jpg', logo: 'https://x/l.svg' },
      energeticSignals,
      energeticScores,
    );
    const primary = atomic.elements.find((element) => element.role === 'primary');
    const avatar = atomic.elements.find((element) => element.role === 'avatar');
    const logo = atomic.elements.find((element) => element.role === 'logo');

    expect(primary?.structure.text).toEqual({
      glyphRole: 'headline',
      hierarchy: 'primary',
      emphasis: 'hero',
      casing: 'uppercase',
      lines: ['Launch', 'Now'],
      splitMode: 'words',
    });
    expect(primary?.typography).toEqual(expect.objectContaining({
      family: 'Inter',
      weight: 800,
      sizePx: 72,
      transform: 'uppercase',
    }));
    expect(primary?.color.text).toBe('#ffffff');
    expect(primary?.motion.tracks.some((track) => track.phase === 'entrance')).toBe(true);
    expect(avatar?.structure.parts).toContainEqual({
      kind: 'image-plane',
      semantic: 'avatar',
      channel: 'media',
      purpose: 'portrait',
    });
    expect(logo?.structure.parts).toContainEqual({
      kind: 'image-plane',
      semantic: 'logo',
      channel: 'media',
      purpose: 'logo',
    });
  });

  it('exposes data-viz structures as shape atoms inferred from content shape', () => {
    const tokens = makeTokens();

    const barContent = { values: [12, 19, 31, 47], labels: ['Q1', 'Q2', 'Q3', 'Q4'] };
    const ringContent = { values: [72], labels: ['Progress'] };
    const lineContent = { values: [12, 19, 31, 47, 51, 63], labels: ['A', 'B', 'C', 'D', 'E', 'F'] };

    const bar = buildAtomicOverlayPlan(
      planComposition({ content: barContent }, tokens, energeticSignals, energeticScores),
      tokens,
      barContent,
      energeticSignals,
      energeticScores,
    ).elements.find((element) => element.primitive === 'data-viz');
    const ring = buildAtomicOverlayPlan(
      planComposition({ content: ringContent }, tokens, energeticSignals, energeticScores),
      tokens,
      ringContent,
      energeticSignals,
      energeticScores,
    ).elements.find((element) => element.primitive === 'data-viz');
    const line = buildAtomicOverlayPlan(
      planComposition({ content: lineContent }, tokens, energeticSignals, energeticScores),
      tokens,
      lineContent,
      energeticSignals,
      energeticScores,
    ).elements.find((element) => element.primitive === 'data-viz');

    expect(bar?.structure.dataShape).toBe('bar-chart');
    expect(bar?.structure.parts).toContainEqual({ kind: 'bar-rect', semantic: 'bar' });
    expect(bar?.structure.parts).toContainEqual({
      kind: 'bar-rect',
      semantic: 'bar:3',
      channel: 'data',
      purpose: 'value',
      quantity: 47,
      constraints: { minReadablePx: 8, maxCount: 8 },
    });
    expect(bar?.structure.parts).toContainEqual({
      kind: 'glyph-run',
      semantic: 'axis-label:0',
      channel: 'text',
      purpose: 'axis',
      quantity: 2,
      constraints: { minReadablePx: 12, maxCount: 8 },
    });
    expect(ring?.structure.dataShape).toBe('percentage-ring');
    expect(ring?.structure.parts).toContainEqual({ kind: 'arc', semantic: 'value-arc' });
    expect(ring?.structure.parts).toContainEqual({
      kind: 'arc',
      semantic: 'ring:value-fill',
      channel: 'data',
      purpose: 'value',
      quantity: 1,
      constraints: { strokePx: 8, aspectRatio: 1 },
    });
    expect(line?.structure.dataShape).toBe('sparkline');
    expect(line?.structure.parts).toContainEqual({ kind: 'polyline', semantic: 'trend-line' });
    expect(line?.structure.parts).toContainEqual({
      kind: 'polyline',
      semantic: 'sparkline:value-path',
      channel: 'data',
      purpose: 'value',
      quantity: 6,
      constraints: { strokePx: 2 },
    });
  });

  it('atomizes generic shapes into purpose and geometry constraints', () => {
    const recipe: Recipe = {
      id: 'shape-atom-test',
      layout: { position: 'center' },
      exitStyle: 'simultaneous-fade',
      elements: [
        {
          primitive: 'shape',
          role: 'accent-line',
          shape: 'line',
          bind: { width: 240, height: 4, fill: 'token:color.accent' },
        },
        {
          primitive: 'container',
          role: 'backplate',
          shape: 'pill',
          bind: { width: 320, height: 120, radius: 24, fill: '#111111' },
        },
      ],
    };

    const atomic = buildAtomicOverlayPlan(recipe, makeTokens(), {}, energeticSignals, energeticScores);

    expect(atomic.elements[0].structure.parts).toContainEqual({
      kind: 'line',
      semantic: 'accent-line',
      channel: 'shape',
      purpose: 'connector',
      constraints: { aspectRatio: 60 },
    });
    expect(atomic.elements[1].structure.parts).toContainEqual({
      kind: 'pill',
      semantic: 'backplate',
      channel: 'shape',
      purpose: 'container',
      constraints: { radiusPx: 24, aspectRatio: 320 / 120 },
    });
  });

  it('keeps signal intensity deterministic and higher for high-energy moments', () => {
    const content = { value: '47%', label: 'conversion lift' };
    const recipe = planComposition({ content }, makeTokens(), energeticSignals, energeticScores);

    const energetic = buildAtomicOverlayPlan(recipe, makeTokens(), content, energeticSignals, energeticScores);
    const calm = buildAtomicOverlayPlan(recipe, makeTokens(calmSignals), content, calmSignals, energeticScores);

    expect(energetic.intensity.signal).toBeGreaterThan(calm.intensity.signal);
    expect(energetic.intensity.overlayScore).toBe(calm.intensity.overlayScore);
  });

  it('assigns stable render keys for duplicate roles and nested group children', () => {
    const recipe: Recipe = {
      id: 'duplicate-role-test',
      layout: { position: 'center' },
      exitStyle: 'reverse-stagger',
      elements: [
        { primitive: 'text', role: 'label', bind: { text: 'content:first' } },
        { primitive: 'text', role: 'label', bind: { text: 'content:second' } },
        {
          primitive: 'group',
          role: 'badge',
          bind: {},
          children: [
            { primitive: 'text', role: 'label', bind: { text: 'content:nested' } },
          ],
        },
      ],
    };

    const atomic = buildAtomicOverlayPlan(
      recipe,
      makeTokens(),
      { first: 'A', second: 'B', nested: 'C' },
      energeticSignals,
      energeticScores,
    );

    expect(atomic.elements.map((element) => element.renderKey)).toEqual([
      '0:text:label',
      '1:text:label',
      '2:group:badge',
      '2.0:text:label',
    ]);
    expect(atomic.elements[3].parentRenderKey).toBe('2:group:badge');
  });
});
