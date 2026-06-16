import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAtomicMotionTracks, applyAtomicRenderDecision, applyAtomicStyleAtoms, findAtomicElement, resolveCompactTopLaneTextStyle, resolveCompositionVisualIntent, resolveVisualIntentContentLayoutStyle, resolveVisualIntentSceneAtoms, resolveVisualIntentStageChrome } from '../../lib/editron/motion-graphics/engine/composition-renderer';
import type { AtomicOverlayDecision } from '../../lib/editron/motion-graphics/engine/atomic-overlay-decision';
import type { AtomicElementPlan, AtomicOverlayPlan } from '../../lib/editron/motion-graphics/engine/atomic-overlay-plan';
import type { ComputedChoreography, RecipeVisualIntent, ResolvedElement } from '../../lib/editron/motion-graphics/engine/recipe-types';
import { buildTextStyle, fitFontSize, type AnimationState } from '../../lib/editron/motion-graphics/engine/primitive-renderers';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';

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

type VisualIntentOverrides = Partial<Omit<RecipeVisualIntent, 'renderDirectives' | 'choreography'>> & {
  renderDirectives?: Partial<RecipeVisualIntent['renderDirectives']>;
  choreography?: Partial<RecipeVisualIntent['choreography']>;
};

function visualIntent(overrides: VisualIntentOverrides = {}): RecipeVisualIntent {
  const base: RecipeVisualIntent = {
    source: 'visual-explanation-contract-v1',
    stageMode: 'overlay-on-footage',
    obligationKinds: ['show-magnitude'],
    constraintKinds: ['safe-zone'],
    evidenceAtomKeys: ['number'],
    missingEvidence: [],
    renderDirectives: {
      preferFullFrame: false,
      preferSplitLayout: false,
      preferDeviceFrame: false,
      transitionLed: false,
      captionZoneAware: true,
      suppressDecorativeAccents: true,
      preferDataViz: false,
    },
    choreography: {
      coordinateWithCaptions: true,
      coordinateWithZoom: false,
      coordinateWithTransition: false,
      coordinateWithSfx: false,
      rhythmEvidenceKeys: [],
    },
  };
  const { renderDirectives, choreography, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    renderDirectives: {
      ...base.renderDirectives,
      ...renderDirectives,
    },
    choreography: {
      ...base.choreography,
      ...choreography,
    },
  };
}

const stageTokens = resolveMotionTokens({}, {
  accentColor: '#00ff00',
  primaryColor: '#112233',
  backgroundColor: '#010203',
});

describe('atomic render decision adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not add stage chrome for ordinary overlay-on-footage visual intent', () => {
    expect(resolveVisualIntentStageChrome(visualIntent(), stageTokens)).toBeUndefined();
  });

  it('resolves full-frame stage chrome from visual intent and brand tokens', () => {
    const chrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: { preferFullFrame: true },
    }), stageTokens);

    expect(chrome?.kind).toBe('full-frame');
    expect(String(chrome?.rootStyle.background)).toContain('rgba(1, 2, 3, 0.88)');
    expect(String(chrome?.frameStyle?.border)).toContain('rgba(0, 255, 0, 0.34)');
  });

  it('lets transition-led intent win over other visual stage directives', () => {
    const chrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: {
        preferFullFrame: true,
        transitionLed: true,
      },
    }), stageTokens);

    expect(chrome?.kind).toBe('transition-led');
    expect(chrome?.accentStyle?.height).toBe('12%');
    expect(chrome?.frameStyle).toBeUndefined();
  });

  it('uses recipe visual intent as renderer source of truth before atomic metadata', () => {
    const recipeIntent = visualIntent({
      stageMode: 'device-or-screen-scene',
      renderDirectives: { preferDeviceFrame: true },
    });
    const atomicIntent = visualIntent({
      stageMode: 'split-footage-graphic',
      renderDirectives: { preferSplitLayout: true },
    });
    const plan: AtomicOverlayPlan = {
      ...planWith([]),
      visualIntent: atomicIntent,
    };

    expect(resolveCompositionVisualIntent(recipeIntent, plan)).toBe(recipeIntent);
    expect(resolveCompositionVisualIntent(undefined, plan)).toBe(atomicIntent);
  });

  it('spans multi-element split-stage content across the stage panels', () => {
    const chrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'split-footage-graphic',
      renderDirectives: { preferSplitLayout: true },
    }), stageTokens);
    const style = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', display: 'flex', maxWidth: '92%' },
      chrome,
      { position: 'center', arrangement: 'horizontal-distributed', maxWidth: '92%' },
      2,
    );

    expect(style).toEqual(expect.objectContaining({
      zIndex: 1,
      left: '6%',
      right: '6%',
      width: 'auto',
      maxWidth: 'none',
      minHeight: '52%',
      justifyContent: 'space-between',
    }));
  });

  it('does not spread a one-element split stage away from the center', () => {
    const chrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'split-footage-graphic',
      renderDirectives: { preferSplitLayout: true },
    }), stageTokens);
    const style = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', display: 'flex', maxWidth: '92%' },
      chrome,
      { position: 'center', arrangement: 'horizontal-distributed', maxWidth: '92%' },
      1,
    );

    expect(style).toEqual(expect.objectContaining({
      zIndex: 1,
      left: '6%',
      right: '6%',
      width: 'auto',
      maxWidth: 'none',
      justifyContent: 'center',
    }));
  });

  it('does not add scene atoms for ordinary overlay-on-footage intent', () => {
    expect(resolveVisualIntentSceneAtoms(visualIntent(), undefined, stageTokens)).toEqual([]);
  });

  it('builds full-frame scene atoms from stage and rhythm evidence', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: { preferFullFrame: true },
      choreography: { rhythmEvidenceKeys: ['beat:1', 'beat:2'] },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);
    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, stageTokens);

    expect(atoms.map((atom) => atom.kind)).toEqual([
      'safe-frame',
      'magnitude-scale',
      'rhythm-tick',
      'rhythm-tick',
      'caption-safe-floor',
    ]);
    expect(atoms[0].role).toBe('full-frame-explanation-safe-frame');
  });

  it('adds magnitude and proportion atoms only from numeric obligations', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['show-magnitude', 'show-proportion'],
      renderDirectives: { preferFullFrame: true },
    });
    const nonNumericIntent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['quote-proof'],
      renderDirectives: { preferFullFrame: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);
    const nonNumericChrome = resolveVisualIntentStageChrome(nonNumericIntent, stageTokens);

    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, stageTokens);
    const nonNumericAtoms = resolveVisualIntentSceneAtoms(nonNumericIntent, nonNumericChrome, stageTokens);

    expect(atoms.map((atom) => atom.kind)).toContain('magnitude-scale');
    expect(atoms.find((atom) => atom.kind === 'magnitude-scale')?.children).toHaveLength(4);
    expect(atoms.map((atom) => atom.kind)).toContain('proportion-ring');
    expect(nonNumericAtoms.some((atom) => atom.kind === 'magnitude-scale')).toBe(false);
    expect(nonNumericAtoms.some((atom) => atom.kind === 'proportion-ring')).toBe(false);
  });

  it('adds process sequence atoms only from order or sequence obligations', () => {
    const processIntent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['preserve-order', 'show-sequence'],
      renderDirectives: { preferFullFrame: true },
    });
    const plainIntent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['show-magnitude'],
      renderDirectives: { preferFullFrame: true },
    });

    const processChrome = resolveVisualIntentStageChrome(processIntent, stageTokens);
    const plainChrome = resolveVisualIntentStageChrome(plainIntent, stageTokens);
    const processTrack = resolveVisualIntentSceneAtoms(processIntent, processChrome, stageTokens)
      .find((atom) => atom.kind === 'sequence-track');

    expect(processTrack?.children?.map((child) => child.kind)).toEqual(['sequence-node', 'sequence-node', 'sequence-node']);
    expect(resolveVisualIntentSceneAtoms(plainIntent, plainChrome, stageTokens).some((atom) => atom.kind === 'sequence-track')).toBe(false);
  });

  it('adds proof bracket atoms for quote and claim proof obligations', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['quote-proof', 'prove-claim'],
      renderDirectives: { preferFullFrame: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);

    expect(resolveVisualIntentSceneAtoms(intent, chrome, stageTokens).some((atom) => atom.kind === 'proof-bracket')).toBe(true);
  });

  it('adds locate/identity plinth atoms only for locate or screen-action obligations', () => {
    const locateIntent = visualIntent({
      stageMode: 'device-or-screen-scene',
      obligationKinds: ['show-device-context', 'locate-object'],
      renderDirectives: { preferDeviceFrame: true },
    });
    const deviceOnlyIntent = visualIntent({
      stageMode: 'device-or-screen-scene',
      obligationKinds: ['show-device-context'],
      renderDirectives: { preferDeviceFrame: true },
    });
    const locateChrome = resolveVisualIntentStageChrome(locateIntent, stageTokens);
    const deviceOnlyChrome = resolveVisualIntentStageChrome(deviceOnlyIntent, stageTokens);

    expect(resolveVisualIntentSceneAtoms(locateIntent, locateChrome, stageTokens).some((atom) => atom.kind === 'identity-plinth')).toBe(true);
    expect(resolveVisualIntentSceneAtoms(deviceOnlyIntent, deviceOnlyChrome, stageTokens).some((atom) => atom.kind === 'identity-plinth')).toBe(false);
  });

  it('adds a split comparison rail only when compare-peers is an obligation', () => {
    const splitIntent = visualIntent({
      stageMode: 'split-footage-graphic',
      obligationKinds: ['compare-peers'],
      renderDirectives: { preferSplitLayout: true },
    });
    const noComparisonIntent = visualIntent({
      stageMode: 'split-footage-graphic',
      obligationKinds: ['show-magnitude'],
      renderDirectives: { preferSplitLayout: true },
    });

    const splitChrome = resolveVisualIntentStageChrome(splitIntent, stageTokens);
    const noComparisonChrome = resolveVisualIntentStageChrome(noComparisonIntent, stageTokens);

    expect(resolveVisualIntentSceneAtoms(splitIntent, splitChrome, stageTokens).some((atom) => atom.kind === 'comparison-rail')).toBe(true);
    expect(resolveVisualIntentSceneAtoms(noComparisonIntent, noComparisonChrome, stageTokens).some((atom) => atom.kind === 'comparison-rail')).toBe(false);
  });

  it('builds device shell and search field atoms from device/search obligations', () => {
    const intent = visualIntent({
      stageMode: 'device-or-screen-scene',
      obligationKinds: ['show-device-context', 'show-search-query'],
      renderDirectives: { preferDeviceFrame: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);
    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, stageTokens);

    expect(atoms.map((atom) => atom.kind)).toContain('device-shell');
    expect(atoms.map((atom) => atom.kind)).toContain('search-field');
    expect(atoms.find((atom) => atom.kind === 'device-shell')?.children?.map((child) => child.role)).toEqual([
      'device-window-control-a',
      'device-window-control-b',
      'device-window-control-c',
    ]);
  });

  it('does not fake a search field when device content lacks search obligation', () => {
    const intent = visualIntent({
      stageMode: 'device-or-screen-scene',
      obligationKinds: ['show-device-context'],
      renderDirectives: { preferDeviceFrame: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);

    expect(resolveVisualIntentSceneAtoms(intent, chrome, stageTokens).some((atom) => atom.kind === 'search-field')).toBe(false);
  });

  it('builds transition band atoms for MG-led transition stage intent', () => {
    const intent = visualIntent({
      stageMode: 'mg-led-transition',
      obligationKinds: ['land-on-rhythm'],
      renderDirectives: { transitionLed: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, stageTokens);

    expect(resolveVisualIntentSceneAtoms(intent, chrome, stageTokens).some((atom) => atom.kind === 'transition-band')).toBe(true);
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

  it('allows MG text flex items to shrink and wrap inside the fitted layout box', () => {
    const style = buildTextStyle({
      ...renderElement,
      role: 'primary',
      resolvedProps: {
        text: 'Selection Bias',
        minSize: 140,
        lineHeight: 1.1,
      },
    }, { ...baseAnim, opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, filterBlur: 0, textShadowBlur: 0 }, 88);

    expect(style.minWidth).toBe(0);
    expect(style.maxWidth).toBe('100%');
    expect(style.whiteSpace).toBe('normal');
    expect(style.wordBreak).toBe('normal');
  });

  it('removes child horizontal transforms in compact top lanes to protect title-safe fit', () => {
    const style = resolveCompactTopLaneTextStyle({
      alignSelf: 'flex-start',
      maxWidth: '100%',
      textAlign: 'left',
      transform: 'translateX(108px) translateY(18px) scale(1.02)',
      whiteSpace: 'normal',
    }, true, true);

    expect(style.alignSelf).toBe('center');
    expect(style.textAlign).toBe('center');
    expect(style.whiteSpace).toBe('nowrap');
    expect(style.transform).toBe('translateY(18px) scale(1.02)');
  });

  it('fits multi-word MG titles against the whole phrase, not only the longest word', () => {
    const size = fitFontSize(
      'Selection Bias',
      864,
      98,
      36,
      {},
      (text, px) => text.length * px * 0.62,
    );

    expect(size).toBeLessThan(98);
    expect('Selection Bias'.length * size * 0.62).toBeLessThanOrEqual(864 * 0.9);
  });

  it('lets long support copy wrap instead of shrinking below the readable floor', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const size = fitFontSize(
      'Promoting inflammatory discussion over enthusiasm',
      864,
      59,
      36,
      {},
      (text, px) => text.length * px * 0.62,
    );

    expect(size).toBe(59);
    expect('inflammatory'.length * size * 0.62).toBeLessThanOrEqual(864 * 0.9);
    expect(warn).not.toHaveBeenCalled();
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
