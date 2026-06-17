import { describe, expect, it } from 'vitest';
import {
  applyVisualIntentTextTreatment,
  resolveSemanticContentSceneAtoms,
  resolveVisualIntentContentElementMotion,
  resolveVisualIntentSceneAtomAnimatedStyle,
  resolveVisualIntentContentLayoutStyle,
  resolveVisualIntentSceneAtoms,
  resolveVisualIntentStageChrome,
  shouldSuppressVisualIntentLegacyElement,
} from '../../lib/editron/motion-graphics/engine/composition-renderer';
import type { RecipeLayout, RecipeVisualIntent } from '../../lib/editron/motion-graphics/engine/recipe-types';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';

type VisualIntentOverrides = Partial<Omit<RecipeVisualIntent, 'renderDirectives' | 'choreography'>> & {
  renderDirectives?: Partial<RecipeVisualIntent['renderDirectives']>;
  choreography?: Partial<RecipeVisualIntent['choreography']>;
};

const language = resolveMotionTokens({}, {
  accentColor: '#00ff99',
  primaryColor: '#113355',
  backgroundColor: '#05070b',
});

function visualIntent(overrides: VisualIntentOverrides = {}): RecipeVisualIntent {
  const base: RecipeVisualIntent = {
    source: 'visual-explanation-contract-v1',
    stageMode: 'overlay-on-footage',
    obligationKinds: ['show-magnitude'],
    constraintKinds: ['safe-zone'],
    evidenceAtomKeys: ['content:value'],
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
    renderDirectives: { ...base.renderDirectives, ...renderDirectives },
    choreography: { ...base.choreography, ...choreography },
  };
}

function layout(overrides: Partial<RecipeLayout> = {}): RecipeLayout {
  return {
    position: 'center',
    arrangement: 'vertical-stack',
    maxWidth: '88%',
    captionZoneAware: true,
    ...overrides,
  };
}

describe('MG stage composition renderer', () => {
  it('promotes full-frame visual explanations into a centered stage, not a corner text block', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['show-magnitude', 'show-proportion'],
      renderDirectives: { preferFullFrame: true, preferDataViz: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, language);
    const style = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', bottom: '12%', left: '5%', maxWidth: '45%' },
      chrome,
      layout({ maxWidth: '88%' }),
      3,
    );
    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, language);

    expect(chrome?.kind).toBe('full-frame');
    expect(style).toEqual(expect.objectContaining({
      top: '50%',
      left: '50%',
      width: '88%',
      minHeight: '48%',
      textAlign: 'center',
    }));
    expect(style.bottom).toBeUndefined();
    expect(atoms.map((atom) => atom.kind)).toEqual(expect.arrayContaining([
      'safe-frame',
      'magnitude-scale',
      'proportion-ring',
    ]));
  });

  it('turns comparison intent into a full split-stage geometry from contract metadata', () => {
    const intent = visualIntent({
      stageMode: 'split-footage-graphic',
      obligationKinds: ['compare-peers'],
      renderDirectives: { preferSplitLayout: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, language);
    const style = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
      chrome,
      layout({ arrangement: 'horizontal-distributed', maxWidth: '92%' }),
      5,
    );
    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, language);

    expect(chrome?.kind).toBe('split-layout');
    expect(style).toEqual(expect.objectContaining({
      left: '6%',
      right: '6%',
      minHeight: '52%',
      flexDirection: 'row',
      justifyContent: 'space-between',
    }));
    expect(style.maxWidth).toBe('none');
    expect(atoms.map((atom) => atom.kind)).toContain('comparison-rail');
  });

  it('routes device and transition stage modes to distinct content geometries', () => {
    const deviceChrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'device-or-screen-scene',
      obligationKinds: ['show-device-context', 'show-search-query'],
      renderDirectives: { preferDeviceFrame: true },
    }), language);
    const transitionChrome = resolveVisualIntentStageChrome(visualIntent({
      stageMode: 'mg-led-transition',
      obligationKinds: ['preserve-order', 'show-sequence'],
      renderDirectives: { transitionLed: true },
    }), language);

    const deviceStyle = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', top: '50%', left: '50%' },
      deviceChrome,
      layout({ maxWidth: '78%' }),
      2,
    );
    const transitionStyle = resolveVisualIntentContentLayoutStyle(
      { position: 'absolute', top: '8%', left: '5%', right: '5%' },
      transitionChrome,
      layout({ position: 'full-width-top', maxWidth: '100%' }),
      3,
    );

    expect(deviceChrome?.kind).toBe('device-frame');
    expect(deviceStyle).toEqual(expect.objectContaining({
      width: '78%',
      minHeight: '34%',
      textAlign: 'center',
    }));
    expect(transitionChrome?.kind).toBe('transition-led');
    expect(transitionStyle).toEqual(expect.objectContaining({
      top: '6%',
      left: '5%',
      right: '5%',
      maxWidth: 'none',
    }));
  });

  it('animates obligation atoms across frames instead of leaving static decoration', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      obligationKinds: ['show-magnitude', 'show-proportion', 'preserve-order'],
      renderDirectives: { preferFullFrame: true, preferDataViz: true },
    });
    const chrome = resolveVisualIntentStageChrome(intent, language);
    const atoms = resolveVisualIntentSceneAtoms(intent, chrome, language);
    const scaleAtom = atoms.find((atom) => atom.kind === 'magnitude-scale');
    const ringAtom = atoms.find((atom) => atom.kind === 'proportion-ring');
    const nodeAtom = atoms.find((atom) => atom.kind === 'sequence-track')?.children?.[0];

    expect(scaleAtom).toBeDefined();
    expect(ringAtom).toBeDefined();
    expect(nodeAtom).toBeDefined();

    const scaleEarly = resolveVisualIntentSceneAtomAnimatedStyle(scaleAtom!, 0, 30, 0);
    const scaleLate = resolveVisualIntentSceneAtomAnimatedStyle(scaleAtom!, 24, 30, 0);
    const ringEarly = resolveVisualIntentSceneAtomAnimatedStyle(ringAtom!, 0, 30, 0);
    const ringLate = resolveVisualIntentSceneAtomAnimatedStyle(ringAtom!, 24, 30, 0);
    const nodeEarly = resolveVisualIntentSceneAtomAnimatedStyle(nodeAtom!, 0, 30, 2);
    const nodeLate = resolveVisualIntentSceneAtomAnimatedStyle(nodeAtom!, 24, 30, 2);

    expect(scaleEarly.transform).toContain('scaleX(0)');
    expect(scaleLate.transform).toContain('scaleX(1)');
    expect(Number(scaleEarly.opacity)).toBeLessThan(Number(scaleLate.opacity));
    expect(ringEarly.transform).toContain('rotate(-24deg)');
    expect(ringLate.transform).toContain('rotate(0deg)');
    expect(Number(nodeEarly.opacity)).toBeLessThan(Number(nodeLate.opacity));
    expect(nodeLate.transform).toContain('scale(');
  });

  it('coordinates content text motion with rich stage mode instead of generic immediate appearance', () => {
    const intent = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: { preferFullFrame: true },
    });

    const early = resolveVisualIntentContentElementMotion({ role: 'primary', primitive: 'text' }, intent, 0, 30, 0);
    const late = resolveVisualIntentContentElementMotion({ role: 'primary', primitive: 'text' }, intent, 28, 30, 0);
    const overlay = resolveVisualIntentContentElementMotion({ role: 'primary', primitive: 'text' }, visualIntent(), 28, 30, 0);

    expect(overlay).toBeUndefined();
    expect(early?.opacity).toBe(0);
    expect(early?.transform).toContain('translateY(18px)');
    expect(late?.opacity).toBe(1);
    expect(late?.transform).toContain('translateY(0px)');
  });

  it('uses stage and role to choose content motion direction', () => {
    const split = visualIntent({
      stageMode: 'split-footage-graphic',
      renderDirectives: { preferSplitLayout: true },
    });
    const transition = visualIntent({
      stageMode: 'mg-led-transition',
      renderDirectives: { transitionLed: true },
    });

    const splitBefore = resolveVisualIntentContentElementMotion({ role: 'secondary', primitive: 'text' }, split, 0, 30, 0);
    const splitAfter = resolveVisualIntentContentElementMotion({ role: 'primary', primitive: 'text' }, split, 0, 30, 0);
    const transitionText = resolveVisualIntentContentElementMotion({ role: 'primary', primitive: 'text' }, transition, 0, 30, 0);

    expect(splitBefore?.transform).toContain('translateX(-26px)');
    expect(splitAfter?.transform).toContain('translateX(26px)');
    expect(transitionText?.transform).toContain('translateY(-18px)');
  });

  it('suppresses legacy card decoration only after a rich visual contract owns the stage', () => {
    const fullFrame = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: { preferFullFrame: true, suppressDecorativeAccents: true },
    });
    const overlay = visualIntent({
      stageMode: 'overlay-on-footage',
      renderDirectives: { suppressDecorativeAccents: true },
    });

    expect(shouldSuppressVisualIntentLegacyElement({ role: 'sm-accent-line', primitive: 'shape' }, fullFrame)).toBe(true);
    expect(shouldSuppressVisualIntentLegacyElement({ role: 'sm-side-bar', primitive: 'shape' }, fullFrame)).toBe(true);
    expect(shouldSuppressVisualIntentLegacyElement({ role: 'brand-pattern', primitive: 'pattern' }, fullFrame)).toBe(true);
    expect(shouldSuppressVisualIntentLegacyElement({ role: 'primary', primitive: 'text' }, fullFrame)).toBe(false);
    expect(shouldSuppressVisualIntentLegacyElement({ role: 'sm-accent-line', primitive: 'shape' }, overlay)).toBe(false);
  });

  it('lifts text contrast for non-overlay stages without changing overlay text', () => {
    const fullFrame = visualIntent({
      stageMode: 'full-frame-graphic-scene',
      renderDirectives: { preferFullFrame: true },
    });
    const base = { color: '#94a3b8', opacity: 0.72, textShadow: '0 1px 2px rgba(0,0,0,0.1)' };

    const treated = applyVisualIntentTextTreatment(base, { role: 'primary' }, fullFrame);
    const overlay = applyVisualIntentTextTreatment(base, { role: 'primary' }, visualIntent());

    expect(treated.color).toBe('#ffffff');
    expect(treated.opacity).toBe(1);
    expect(String(treated.textShadow)).toContain('0 2px 18px rgba(0,0,0,0.46)');
    expect(overlay).toEqual(base);
  });

  it('derives stat graphics only when numeric content licenses the visual wires', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { value: '90%', label: 'good people', quantityKind: 'percent', boundedRange: true },
      [{ role: 'counter', primitive: 'text', resolvedProps: { text: '90%', encodingChannel: 'sweep' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toEqual(expect.arrayContaining([
      'semantic-stat-field',
      'semantic-stat-axis',
    ]));
    expect(String(atoms[0].style.background)).toContain('conic-gradient');
    expect(atoms[1].children?.map((atom) => atom.kind)).toContain('rhythm-tick');
  });

  it('does not add the repeated stat shell to unbounded scalar rate content', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { value: '0.02', label: 'human beings per day' },
      [{ role: 'counter', primitive: 'text', resolvedProps: { text: '0.02' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).not.toContain('semantic-stat-field');
    expect(atoms.map((atom) => atom.kind)).not.toContain('semantic-stat-axis');
    expect(atoms).toEqual([]);
  });

  it('derives concept maps from title and body content', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { title: 'Selection Bias', body: 'Only hostile people comment, so the sample looks worse than reality.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Selection Bias' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toContain('semantic-concept-map');
    expect(atoms[0].role).toBe('semantic-concept-contrast-map');
    expect(atoms[0].style.background).toBe('transparent');
    expect(atoms[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-contrast-before-plane',
      'semantic-concept-contrast-thesis-divider',
      'semantic-concept-contrast-after-plane',
    ]));
  });

  it('derives concept maps from keyword and body fact content', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { keyword: 'selection bias', body: 'the sample changed the story' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'selection bias' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toContain('semantic-concept-map');
    expect(atoms[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-claim-stage-plane',
      'semantic-concept-claim-left-edge',
      'semantic-concept-claim-title-rule',
      'semantic-concept-claim-support-rule',
    ]));
    expect(atoms[0].children?.map((atom) => atom.role)).not.toEqual(expect.arrayContaining([
      'semantic-concept-node-main',
      'semantic-concept-node-context',
      'semantic-concept-node-proof',
      'semantic-concept-claim-field',
      'semantic-concept-claim-support-rail',
    ]));
  });

  it('varies concept scene atoms from semantic relation facts instead of one repeated map', () => {
    const problem = resolveSemanticContentSceneAtoms(
      { title: 'Algorithm Problem', body: 'Inflammatory discussion creates a hostile loop.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Algorithm Problem' } }],
      language,
    );
    const causal = resolveSemanticContentSceneAtoms(
      { title: 'Promotion Loop', body: 'Promoting outrage drives the whole discussion.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Promotion Loop' } }],
      language,
    );
    const affirming = resolveSemanticContentSceneAtoms(
      { title: 'Good Discussion', body: 'Helpful context makes the conversation better.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Good Discussion' } }],
      language,
    );

    expect(problem[0].role).toBe('semantic-concept-problem-map');
    expect(problem[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-pressure-mass',
      'semantic-concept-pressure-fracture-a',
      'semantic-concept-pressure-fracture-b',
    ]));
    expect(causal[0].role).toBe('semantic-concept-causal-map');
    expect(causal[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-causal-origin-plate',
      'semantic-concept-causal-outcome-plate',
      'semantic-concept-causal-terminal-burst',
    ]));
    expect(affirming[0].role).toBe('semantic-concept-affirming-map');
    expect(affirming[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-affirming-horizon',
      'semantic-concept-affirming-step-three',
      'semantic-concept-affirming-signal-field',
    ]));
    expect([problem[0], causal[0], affirming[0]].map((atom) => atom.style.background)).toEqual([
      'transparent',
      'transparent',
      'transparent',
    ]);
    expect(new Set([problem, causal, affirming].map((atomsForRegister) =>
      atomsForRegister[0].children?.map((atom) => atom.role).join('|'))).size).toBe(3);
    expect(problem[0].children?.map((atom) => atom.style.transform).filter(Boolean)).toEqual(expect.arrayContaining([
      'rotate(13deg)',
      'rotate(-19deg)',
    ]));
    expect(causal[0].children?.map((atom) => atom.style.transform).filter(Boolean)).toEqual(expect.arrayContaining([
      'rotate(-8deg)',
      'rotate(-24deg)',
    ]));
    expect(resolveSemanticContentSceneAtoms(
      { title: 'Selection Bias', body: 'Only hostile people comment, so the sample looks worse than reality.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Selection Bias' } }],
      language,
    )[0].children?.map((atom) => atom.style.transform).filter(Boolean)).toEqual(expect.arrayContaining([
      'rotate(2deg)',
      'rotate(18deg)',
    ]));
  });

  it('does not let negation swallow stronger semantic concept facts', () => {
    const problemWithNegation = resolveSemanticContentSceneAtoms(
      { title: 'Normal Deep Evil', body: "in real life isn't because they're normal people with deep evil inside of them" },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Normal Deep Evil' } }],
      language,
    );
    const contrastWithNegation = resolveSemanticContentSceneAtoms(
      { title: 'Culture Tells Good', body: "Not because culture, not because culture tells them to be good" },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Culture Tells Good' } }],
      language,
    );
    const pureNegation = resolveSemanticContentSceneAtoms(
      { title: 'Nobody Likes', body: 'talk to people in real life, because nobody likes them.' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Nobody Likes' } }],
      language,
    );

    expect(problemWithNegation[0].role).toBe('semantic-concept-problem-map');
    expect(problemWithNegation[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-concept-pressure-negation-cut',
      'semantic-concept-pressure-causal-cue',
    ]));
    expect(problemWithNegation[0].children?.map((atom) => atom.role)).not.toContain('semantic-concept-pressure-repeat-cut');
    expect(contrastWithNegation[0].role).toBe('semantic-concept-contrast-map');
    expect(pureNegation[0].role).toBe('semantic-concept-causal-map');
  });

  it('derives quote proof atoms only from quoted source content', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { quote: 'The machine can weave algebraic patterns.', author: 'Ada' },
      [{ role: 'quote', primitive: 'text', resolvedProps: { text: 'The machine can weave algebraic patterns.' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toContain('semantic-quote-proof');
    expect(atoms[0].role).toBe('semantic-quote-proof-source-frame');
    expect(atoms[0].style).toMatchObject({
      inset: '12% 8% 14%',
      border: 0,
      boxShadow: 'none',
    });
    expect(atoms[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-quote-proof-paper-field',
      'semantic-quote-proof-left-citation-rule',
      'semantic-quote-proof-evidence-tab',
      'semantic-quote-proof-author-anchor',
    ]));
  });

  it('derives refutation atoms only from truth-negation facts', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { text: 'Not harder, but smarter.', refuted: true, polarity: 'false' },
      [{ role: 'truth-negation', primitive: 'decoration', resolvedProps: { text: 'Not harder, but smarter.' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toContain('semantic-refutation-proof');
    expect(atoms[0].role).toBe('semantic-refutation-truth-frame');
    expect(atoms[0].style).toMatchObject({
      inset: '10% 7% 13%',
      border: 0,
      boxShadow: 'none',
    });
    expect(atoms[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-refutation-rejected-claim-field',
      'semantic-refutation-correction-field',
      'semantic-refutation-primary-strike',
      'semantic-refutation-polarity-notch',
    ]));
  });

  it('derives speaker identity framing from name and title content', () => {
    const atoms = resolveSemanticContentSceneAtoms(
      { name: 'Hank Green', title: 'YouTuber' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'Hank Green' } }],
      language,
    );

    expect(atoms.map((atom) => atom.kind)).toContain('semantic-identity-frame');
    expect(atoms[0].style).toMatchObject({
      inset: '14% 7% 13%',
      border: 0,
      boxShadow: 'none',
    });
    expect(atoms[0].style.bottom).toBeUndefined();
    expect(atoms[0].style.height).toBeUndefined();
    expect(atoms[0].children?.map((atom) => atom.role)).toEqual(expect.arrayContaining([
      'semantic-identity-portrait-field',
      'semantic-identity-name-plinth',
      'semantic-identity-title-rule',
    ]));
  });

  it('does not invent semantic scene atoms for unknown content', () => {
    expect(resolveSemanticContentSceneAtoms(
      { text: 'hello' },
      [{ role: 'primary', primitive: 'text', resolvedProps: { text: 'hello' } }],
      language,
    )).toEqual([]);
  });
});
