import type { AtomicMomentBundle, MomentAtom, MomentAtomChannel } from './moment-bundle';
import {
  resolveAtomicSfxForm,
  type AtomicSfxCompatibilityToken,
  type AtomicSfxIntent,
  type AtomicSfxPrimitiveAtoms,
} from './sfx-form';

export type AtomicMomentGrammarFamily =
  | 'motion-graphic'
  | 'caption'
  | 'frame-movement'
  | 'transition'
  | 'pacing'
  | 'sfx';

export type AtomicMomentGrammarStatus = 'ready' | 'deferred';
export type AtomicMomentDensity = 'open' | 'balanced' | 'restrained';

export interface AtomicMomentGrammarAction {
  family: AtomicMomentGrammarFamily;
  role: string;
  status: AtomicMomentGrammarStatus;
  startFrame: number;
  peakFrame: number;
  endFrame: number;
  strength: number;
  timing: {
    attackFrames: number;
    holdFrames: number;
    releaseFrames: number;
    offsetFromAnchorFrames: number;
  };
  form: {
    intensity: number;
    density: AtomicMomentDensity;
    restraint: number;
    motionX: number;
    motionY: number;
    motionZ: number;
    legibilityProtection: number;
    placementRegion?: AtomicMomentBundle['screen']['negativeSpace']['region'];
    sfx?: {
      intent: AtomicSfxIntent;
      compatibilityToken: AtomicSfxCompatibilityToken;
      primitiveAtoms: AtomicSfxPrimitiveAtoms;
      queryTerms: string[];
      fallbackPolicy: string;
    };
  };
  constraints: string[];
  evidenceAtomKeys: string[];
  deferredReason?: string;
}

export interface AtomicMomentGrammar {
  version: 'moment-bundle-grammar-v1';
  sourceBundleVersion: AtomicMomentBundle['version'];
  anchorFrame: number;
  timeline: {
    attackFrames: number;
    holdFrames: number;
    releaseFrames: number;
    screenDensity: AtomicMomentDensity;
  };
  actions: AtomicMomentGrammarAction[];
  northstar: {
    sourceOfTruth: 'primitive-atoms';
    createsOverlays: false;
    selectsAssets: false;
    selectsTemplates: false;
  };
}

export function resolveMomentBundleGrammar(input: {
  bundle: AtomicMomentBundle;
}): AtomicMomentGrammar {
  const { bundle } = input;
  const density = screenDensity(bundle);
  const actions = [
    readyAction(bundle, 'frame-movement', 'carry-viewer-eye', bundle.familyIntents.frameMovement, -bundle.rhythm.attackFrames, 0, ['visual', 'motion', 'screen']),
    readyAction(bundle, 'caption', 'emphasize-spoken-words', bundle.familyIntents.captionEmphasis, 0, bundle.rhythm.holdFrames, ['speech', 'transcript', 'screen']),
    readyAction(bundle, 'motion-graphic', 'support-meaning', bundle.familyIntents.motionGraphic, Math.round(bundle.rhythm.attackFrames * -0.35), bundle.rhythm.holdFrames + bundle.rhythm.releaseFrames, ['speech', 'visual', 'structure', 'screen']),
    readyAction(bundle, 'transition', 'bridge-thought-boundary', bundle.familyIntents.transition, Math.round(bundle.rhythm.releaseFrames * -0.5), bundle.rhythm.releaseFrames, ['audio', 'motion', 'structure']),
    readyAction(bundle, 'pacing', 'shape-viewer-breath', bundle.familyIntents.pacing, -1, bundle.rhythm.holdFrames, ['speech', 'audio', 'motion', 'structure']),
    sfxAction(bundle),
  ].filter((action): action is AtomicMomentGrammarAction => action !== undefined)
    .sort((a, b) => a.startFrame - b.startFrame || actionPriority(a.family) - actionPriority(b.family));

  return {
    version: 'moment-bundle-grammar-v1',
    sourceBundleVersion: bundle.version,
    anchorFrame: bundle.rhythm.anchorFrame,
    timeline: {
      attackFrames: bundle.rhythm.attackFrames,
      holdFrames: bundle.rhythm.holdFrames,
      releaseFrames: bundle.rhythm.releaseFrames,
      screenDensity: density,
    },
    actions,
    northstar: {
      sourceOfTruth: 'primitive-atoms',
      createsOverlays: false,
      selectsAssets: false,
      selectsTemplates: false,
    },
  };
}

function readyAction(
  bundle: AtomicMomentBundle,
  family: Exclude<AtomicMomentGrammarFamily, 'sfx'>,
  role: string,
  rawStrength: number,
  startOffsetFrames: number,
  endOffsetFrames: number,
  evidenceChannels: MomentAtomChannel[],
): AtomicMomentGrammarAction | undefined {
  const strength = clamp01(rawStrength);
  if (strength < readinessThreshold(family, bundle)) return undefined;
  return action({
    bundle,
    family,
    role,
    status: 'ready',
    strength,
    startOffsetFrames,
    endOffsetFrames,
    evidenceChannels,
  });
}

function sfxAction(bundle: AtomicMomentBundle): AtomicMomentGrammarAction | undefined {
  const strength = clamp01(bundle.familyIntents.sfx);
  if (strength < 0.34) return undefined;
  const form = resolveAtomicSfxForm({ momentBundle: bundle });
  if (!form.shouldPlace) {
    return action({
      bundle,
      family: 'sfx',
      role: 'sound-accent-intent',
      status: 'deferred',
      strength,
      startOffsetFrames: 0,
      endOffsetFrames: Math.max(4, Math.round(bundle.rhythm.releaseFrames * 0.6)),
      evidenceChannels: ['speech', 'audio', 'motion', 'structure'],
      deferredReason: 'atomic-sfx-form-resolved-silence',
    });
  }

  return action({
    bundle,
    family: 'sfx',
    role: form.intent,
    status: 'ready',
    strength,
    startOffsetFrames: form.timing.startFrame - bundle.rhythm.anchorFrame,
    endOffsetFrames: form.timing.endFrame - bundle.rhythm.anchorFrame,
    evidenceChannels: ['speech', 'audio', 'motion', 'structure'],
    sfxForm: form,
  });
}

function action(input: {
  bundle: AtomicMomentBundle;
  family: AtomicMomentGrammarFamily;
  role: string;
  status: AtomicMomentGrammarStatus;
  strength: number;
  startOffsetFrames: number;
  endOffsetFrames: number;
  evidenceChannels: MomentAtomChannel[];
  deferredReason?: string;
  sfxForm?: ReturnType<typeof resolveAtomicSfxForm>;
}): AtomicMomentGrammarAction {
  const { bundle } = input;
  const anchor = bundle.rhythm.anchorFrame;
  const startFrame = Math.max(0, Math.round(anchor + input.startOffsetFrames));
  const peakFrame = anchor;
  const endFrame = Math.max(startFrame + 1, Math.round(anchor + input.endOffsetFrames));
  const restraint = clamp01(bundle.constraints.restraint);
  const density = screenDensity(bundle);
  const motionScale = input.family === 'frame-movement' ? 0.14
    : input.family === 'motion-graphic' ? 0.08
      : input.family === 'transition' ? 0.11
        : 0.04;

  return {
    family: input.family,
    role: input.role,
    status: input.status,
    startFrame,
    peakFrame,
    endFrame,
    strength: input.strength,
    timing: {
      attackFrames: Math.max(1, peakFrame - startFrame),
      holdFrames: bundle.rhythm.holdFrames,
      releaseFrames: Math.max(1, endFrame - peakFrame),
      offsetFromAnchorFrames: startFrame - anchor,
    },
    form: {
      intensity: clamp01(input.strength * (1 - restraint * 0.28)),
      density,
      restraint,
      motionX: round3(-bundle.screen.motionVector.x * motionScale * input.strength),
      motionY: round3(-bundle.screen.motionVector.y * motionScale * input.strength),
      motionZ: round3(input.strength * (input.family === 'frame-movement' ? 0.1 : 0.045)),
      legibilityProtection: clamp01(Math.max(bundle.screen.legibilityRisk, bundle.constraints.preserveLegibility ? 0.55 : 0)),
      ...(bundle.screen.negativeSpace.region !== 'none' ? { placementRegion: bundle.screen.negativeSpace.region } : {}),
      ...(input.sfxForm ? {
        sfx: {
          intent: input.sfxForm.intent,
          compatibilityToken: input.sfxForm.compatibilityToken,
          primitiveAtoms: input.sfxForm.primitiveAtoms,
          queryTerms: input.sfxForm.asset.queryTerms,
          fallbackPolicy: input.sfxForm.asset.fallbackPolicy,
        },
      } : {}),
    },
    constraints: grammarConstraints(bundle),
    evidenceAtomKeys: evidenceAtomKeys(bundle, input.evidenceChannels),
    ...(input.deferredReason ? { deferredReason: input.deferredReason } : {}),
  };
}

function readinessThreshold(
  family: Exclude<AtomicMomentGrammarFamily, 'sfx'>,
  bundle: AtomicMomentBundle,
): number {
  if (family === 'pacing') return 0.08;
  if (family === 'caption') return bundle.constraints.preserveLegibility ? 0.22 : 0.18;
  if (family === 'transition') return 0.32;
  if (family === 'frame-movement') return bundle.constraints.reduceOverlayDensity ? 0.28 : 0.22;
  return bundle.constraints.reduceOverlayDensity ? 0.36 : 0.28;
}

function screenDensity(bundle: AtomicMomentBundle): AtomicMomentDensity {
  if (bundle.constraints.reduceOverlayDensity || bundle.screen.legibilityRisk >= 0.62) return 'restrained';
  if (bundle.screen.busyness <= 0.28 && bundle.screen.motionPressure <= 0.35) return 'open';
  return 'balanced';
}

function grammarConstraints(bundle: AtomicMomentBundle): string[] {
  return [
    bundle.constraints.avoidFaces ? 'avoid-faces' : undefined,
    bundle.constraints.avoidOnScreenText ? 'avoid-on-screen-text' : undefined,
    bundle.constraints.reduceOverlayDensity ? 'reduce-overlay-density' : undefined,
    bundle.constraints.preferNegativeSpace ? 'prefer-negative-space' : undefined,
    bundle.constraints.preserveLegibility ? 'preserve-legibility' : undefined,
  ].filter((value): value is string => !!value);
}

function evidenceAtomKeys(bundle: AtomicMomentBundle, channels: MomentAtomChannel[]): string[] {
  const channelSet = new Set(channels);
  const atoms = [...bundle.primitiveAtoms, ...bundle.derivedAtoms];
  const preferred = atoms.filter((atom) => channelSet.has(atom.channel));
  return [...preferred, ...atoms]
    .filter(uniqueAtomKey)
    .sort((a, b) => b.strength - a.strength || atomLevelRank(a) - atomLevelRank(b) || a.key.localeCompare(b.key))
    .slice(0, 8)
    .map((atom) => atom.key);
}

function uniqueAtomKey(atom: MomentAtom, index: number, atoms: MomentAtom[]): boolean {
  return atoms.findIndex((candidate) => candidate.key === atom.key) === index;
}

function atomLevelRank(atom: MomentAtom): number {
  return atom.level === 'primitive' ? 0 : 1;
}

function actionPriority(family: AtomicMomentGrammarFamily): number {
  switch (family) {
    case 'frame-movement':
      return 0;
    case 'caption':
      return 1;
    case 'motion-graphic':
      return 2;
    case 'transition':
      return 3;
    case 'pacing':
      return 4;
    case 'sfx':
      return 5;
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
