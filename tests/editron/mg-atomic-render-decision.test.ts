import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAtomicMotionTracks, applyAtomicRenderDecision, applyAtomicStyleAtoms, findAtomicElement } from '../../lib/editron/motion-graphics/engine/composition-renderer';
import type { AtomicOverlayDecision } from '../../lib/editron/motion-graphics/engine/atomic-overlay-decision';
import type { AtomicElementPlan, AtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import type { ComputedChoreography, ResolvedElement } from '../../lib/editron/motion-graphics/engine/recipe-types';
import type { AnimationState } from '../../lib/editron/motion-graphics/engine/primitive-renderers';

const baseAnim: AnimationState = {
  opacity: 0.5,
  translateX: 20,
  translateY: 10,
  scaleX: 1.04,
  scaleY: 0.98,
  rotation: 6,
  skewX: 3,
  clipProgress: 0.5,
  filterBlur: 8,
  filterBrightness: 1,
  filterContrast: 1,
  filterSaturate: 1,
  letterSpacing: 0,
  fontSize: 1,
  textShadowBlur: 4,
  strokeDashoffset: 0,
};

function decision(overrides: Partial<AtomicOverlayDecision> = {}): AtomicOverlayDecision {
  return {
    version: 'atomic-decision-v1',
    score: 0.6,
    band: 'expressive',
    curves: {
      signal: 0.8,
      motion: 0.6,
      structure: 0.5,
      typography: 0.7,
      overlay: 0.5,
      density: 0.4,
    },
    licenses: {
      allowOverlay: true,
      allowKineticEntrance: true,
      allowHoldMotion: true,
      allowDepthMotion: false,
      allowDenseStructure: true,
      allowDataViz: false,
      maxMotionChannels: 2,
      maxElementCount: 4,
    },
    multipliers: {
      motionAmplitude: 1.25,
      typographyScale: 1.15,
      structureDensity: 1.1,
      opacityRange: 0.9,
      depthParallax: 0,
    },
    dominantMotionProperties: ['x', 'scaleX', 'opacity', 'y'],
    dominantPrimitives: ['text'],
    rationale: ['band:expressive'],
    ...overrides,
  };
}

const timing: ComputedChoreography = {
  enterStartFrame: 0,
  enterEndFrame: 20,
  holdStartFrame: 20,
  holdEndFrame: 70,
  exitStartFrame: 70,
  exitEndFrame: 100,
  enterEasing: (t) => t,
  exitEasing: (t) => t,
};

const atomicElement: AtomicElementPlan = {
  id: 'headline-0',
  renderKey: '0:text:headline',
  role: 'headline',
  primitive: 'text',
  structure: {
    primitive: 'text',
    role: 'headline',
    layer: 'foreground',
    parts: [{ kind: 'glyph-run', semantic: 'headline' }],
  },
  typography: {
    family: 'JetBrains Mono',
    weight: 700,
    sizePx: 96,
    lineHeight: 1.05,
    tracking: '0.04em',
    transform: 'uppercase',
  },
  color: { accent: '#00ff00', text: '#ffffff' },
  motion: {
    coordinateSystem: 'screen-xyz',
    neutralPosition: { x: 0, y: 0, z: 0 },
    tracks: [
      { property: 'x', phase: 'entrance', source: 'test:x', keyframes: [{ t: 0, value: 100, easing: 'linear' }, { t: 1, value: 0, easing: 'linear' }] },
      { property: 'opacity', phase: 'entrance', source: 'test:opacity', keyframes: [{ t: 0, value: 0, easing: 'linear' }, { t: 1, value: 1, easing: 'linear' }] },
      { property: 'z', phase: 'entrance', source: 'test:z', keyframes: [{ t: 0, value: 8, easing: 'linear' }, { t: 1, value: 24, easing: 'linear' }] },
      { property: 'blur', phase: 'hold', source: 'test:blur', keyframes: [{ t: 0, value: 0, easing: 'linear' }, { t: 1, value: 10, easing: 'linear' }] },
      { property: 'scaleX', phase: 'hold', source: 'test:scale', keyframes: [{ t: 0, value: 1, easing: 'linear' }, { t: 1, value: 1.2, easing: 'linear' }] },
      { property: 'y', phase: 'exit', source: 'test:y', keyframes: [{ t: 0, value: 0, easing: 'linear' }, { t: 1, value: -40, easing: 'linear' }] },
    ],
  },
  sourceBindings: [],
};

const renderElement: ResolvedElement = {
  primitive: 'text',
  role: 'headline',
  enterOrder: 1,
  resolvedProps: {},
  entrancePattern: 'fade',
  exitPattern: 'fade',
};

function planWith(elements: AtomicElementPlan[]): AtomicOverlayPlan {
  return {
    recipeId: 'test',
    layout: { position: 'center' },
    exitStyle: 'reverse-stagger',
    intensity: {
      motion: 0,
      scale: 0,
      opacity: 0,
      blur: 0,
      typography: 0,
      structure: 0,
      signal: 0,
      overlayScore: 0,
      overall: 0,
    },
    elements,
  };
}

describe('atomic render decision adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves legacy animation state when no decision is provided', () => {
    expect(applyAtomicRenderDecision(baseAnim)).toBe(baseAnim);
  });

  it('applies atomic multipliers while capping non-licensed motion channels', () => {
    const rendered = applyAtomicRenderDecision(baseAnim, decision());

    expect(rendered.translateX).toBe(25);
    expect(rendered.scaleX).toBeCloseTo(1.05);
    expect(rendered.translateY).toBe(0);
    expect(rendered.rotation).toBe(0);
    expect(rendered.skewX).toBe(0);
    expect(rendered.filterBlur).toBe(0);
    expect(rendered.clipProgress).toBe(1);
    expect(rendered.opacity).toBe(0.55);
    expect(rendered.fontSize).toBe(1.15);
  });

  it('can suppress an overlay when the atomic license disallows rendering', () => {
    const rendered = applyAtomicRenderDecision(baseAnim, decision({
      score: 0.05,
      band: 'silent',
      licenses: {
        ...decision().licenses,
        allowOverlay: false,
      },
    }));

    expect(rendered.opacity).toBe(0);
  });

  it('maps active atomic entrance, hold, and exit tracks onto animation state', () => {
    const licensed = decision({
      licenses: {
        ...decision().licenses,
        allowDepthMotion: true,
      },
    });

    const entrance = applyAtomicMotionTracks(baseAnim, atomicElement, 10, timing, licensed);
    expect(entrance.translateX).toBe(50);
    expect(entrance.opacity).toBe(0.5);
    expect(entrance.translateZ).toBe(16);
    expect(entrance.filterBlur).toBe(baseAnim.filterBlur);

    const hold = applyAtomicMotionTracks(baseAnim, atomicElement, 45, timing, licensed);
    expect(hold.translateX).toBe(baseAnim.translateX);
    expect(hold.filterBlur).toBe(5);
    expect(hold.scaleX).toBe(1.1);

    const exit = applyAtomicMotionTracks(baseAnim, atomicElement, 85, timing, licensed);
    expect(exit.translateY).toBe(-20);
    expect(exit.opacity).toBe(baseAnim.opacity);
  });

  it('keeps depth tracks inert until the decision licenses depth motion', () => {
    const rendered = applyAtomicMotionTracks(baseAnim, atomicElement, 10, timing, decision());

    expect(rendered.translateX).toBe(50);
    expect(rendered.translateZ).toBeUndefined();
  });

  it('matches atomic elements by stable render key before legacy role matching', () => {
    const wrongDuplicate = { ...atomicElement, id: 'wrong', renderKey: '1:text:headline' };
    const rightDuplicate = { ...atomicElement, id: 'right', renderKey: '0:text:headline' };

    expect(findAtomicElement(planWith([wrongDuplicate, rightDuplicate]), renderElement, '0:text:headline')).toBe(rightDuplicate);
  });

  it('does not guess among ambiguous legacy duplicate role matches', () => {
    const firstLegacy = { ...atomicElement, id: 'first', renderKey: undefined };
    const secondLegacy = { ...atomicElement, id: 'second', renderKey: undefined };
    const uniqueLegacy = { ...atomicElement, id: 'unique', renderKey: undefined, role: 'unique' };

    expect(findAtomicElement(planWith([firstLegacy, secondLegacy]), renderElement)).toBeUndefined();
    expect(findAtomicElement(planWith([uniqueLegacy]), { ...renderElement, role: 'unique' })).toBe(uniqueLegacy);
  });

  it('applies atomic typography and text color atoms through the decision gate', () => {
    const style = applyAtomicStyleAtoms(
      { color: '#111111', fontFamily: 'Inter', fontWeight: 400, lineHeight: 1.2 },
      atomicElement,
      decision(),
    );

    expect(style.color).toBe('#ffffff');
    expect(style.fontFamily).toBe('JetBrains Mono');
    expect(style.fontWeight).toBe(700);
    expect(style.lineHeight).toBe(1.05);
    expect(style.letterSpacing).toBe('0.04em');
    expect(style.textTransform).toBe('uppercase');
  });

  it('applies gradient text atoms as glyph-clipped color', () => {
    const style = applyAtomicStyleAtoms(
      { color: '#111111' },
      { ...atomicElement, color: { ...atomicElement.color, gradient: 'linear-gradient(red, blue)' } },
      decision(),
    );

    expect(style.background).toBe('linear-gradient(red, blue)');
    expect(style.backgroundClip).toBe('text');
    expect(style.WebkitTextFillColor).toBe('transparent');
    expect(style.color).toBe('transparent');
  });

  it('applies atomic fill and stroke atoms for shape primitives', () => {
    const shapeElement: AtomicElementPlan = {
      ...atomicElement,
      primitive: 'shape',
      structure: {
        primitive: 'shape',
        role: 'accent',
        layer: 'foreground',
        shape: 'rect',
        parts: [{ kind: 'rect', semantic: 'accent' }],
      },
      color: { accent: '#00ff00', fill: '#123456', stroke: '#abcdef' },
      typography: undefined,
    };

    const style = applyAtomicStyleAtoms(
      { backgroundColor: '#000000', borderColor: '#ffffff' },
      shapeElement,
      decision(),
    );

    expect(style.backgroundColor).toBe('#123456');
    expect(style.borderColor).toBe('#abcdef');
  });

  it('leaves style unchanged when no atomic render decision is available', () => {
    const baseStyle = { color: '#111111', fontFamily: 'Inter' };

    expect(applyAtomicStyleAtoms(baseStyle, atomicElement)).toBe(baseStyle);
  });

  it('degrades to legacy rendering when atomic decision metadata is partial', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformedDecision = { version: 'atomic-decision-v1', licenses: { allowOverlay: true } } as unknown as AtomicOverlayDecision;

    expect(applyAtomicRenderDecision(baseAnim, malformedDecision)).toBe(baseAnim);
    expect(applyAtomicMotionTracks(baseAnim, atomicElement, 10, timing, malformedDecision)).toBe(baseAnim);

    const baseStyle = { color: '#111111', fontFamily: 'Inter' };
    expect(applyAtomicStyleAtoms(baseStyle, atomicElement, malformedDecision)).toBe(baseStyle);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Atomic metadata malformed'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('licenses or multipliers are missing'));
  });

  it('ignores malformed atomic plans and tracks instead of crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformedPlan = { recipeId: 'broken', elements: undefined } as unknown as AtomicOverlayPlan;
    const malformedElement = {
      ...atomicElement,
      motion: { coordinateSystem: 'screen-xyz', neutralPosition: { x: 0, y: 0, z: 0 }, tracks: undefined },
    } as unknown as AtomicElementPlan;

    expect(findAtomicElement(malformedPlan, renderElement, '0:text:headline')).toBeUndefined();
    expect(applyAtomicMotionTracks(baseAnim, malformedElement, 10, timing, decision())).toBe(baseAnim);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('atomic plan elements are missing'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('atomic element motion tracks are missing'));
  });
});
