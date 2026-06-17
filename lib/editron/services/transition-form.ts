import type { TransitionStyle } from '@/components/editron/editor/version-7.0.0/types';
import { momentBundleToSignalMap, type AtomicMomentBundle } from './moment-bundle';

export type AtomicTransitionIntent =
  | 'continuity-blend'
  | 'motion-transfer'
  | 'impact-transfer'
  | 'reveal-wipe'
  | 'soft-release';

export type AtomicTransitionJob =
  | 'direct-continuity'
  | 'smooth-continuity'
  | 'hide-jump'
  | 'emphasize-turn'
  | 'reset-attention'
  | 'match-motion'
  | 'reveal-next'
  | 'soft-release';

export interface AtomicTransitionDirection {
  x: number;
  y: number;
  magnitude: number;
  axis: 'x' | 'y' | 'none';
  label: 'left' | 'right' | 'up' | 'down' | 'center';
}

export interface AtomicTransitionForm {
  version: 'atomic-transition-form-v1';
  job: AtomicTransitionJob;
  intent: AtomicTransitionIntent;
  compatibilityType: TransitionStyle;
  evidence: {
    source: 'explicit-boundary-job' | 'semantic-intent' | 'signal-atoms';
    reasonKeys: string[];
    boundary: {
      hasAnchor: boolean;
      hasReason: boolean;
    };
  };
  direction: AtomicTransitionDirection;
  durationFrames: number;
  softness: number;
  blurPx: number;
  smear: number;
  exposure: number;
  maskFeather: number;
  intensity: number;
  visualPressure: number;
  keyframeBased: boolean;
  sfxRole: 'none' | 'soft-whoosh' | 'fast-whoosh' | 'impact' | 'digital-tick';
}

const HARD_CUTS = new Set<TransitionStyle>([
  'hard-cut',
  'smash-cut',
  'match-cut',
  'jump-cut',
  'cut-on-action',
]);

export function resolveAtomicTransitionForm(input: {
  signals?: Record<string, unknown>;
  params?: Record<string, unknown>;
  momentBundle?: AtomicMomentBundle;
  durationFrames?: number;
  defaultDurationFrames?: number;
}): AtomicTransitionForm {
  const signals = input.momentBundle
    ? { ...momentBundleToSignalMap(input.momentBundle), ...(input.signals ?? {}) }
    : input.signals ?? {};
  const params = input.params ?? {};
  const explicitType = normalizeTransitionStyle(paramString(params, 'transitionType'));
  const compatibilityHint = normalizeTransitionStyle(paramString(params, 'transitionCompatibilityHint'));
  const direction = resolveDirection(signals);

  const speechEnergy = signalNumber(signals, 'speech_energy', 'speech.energy');
  const beatStrength = signalNumber(signals, 'beat_strength', 'beat.strength');
  const wordImportance = signalNumber(signals, 'word_importance', 'word.importance');
  const topicShift = signalNumber(signals, 'topic_shift', 'topic.shift');
  const emotion = signalNumber(signals, 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity');
  const visualSignificance = signalNumber(signals, 'visual_significance', 'visual.significance');
  const motionIntensity = signalNumber(signals, 'motion_intensity', 'visual.motion_intensity');
  const textOnScreen = signalNumber(signals, 'text_on_screen', 'visual.text_on_screen');
  const textCoverage = policyAllows(signals, 'vjepa.allow_text_avoidance', 'screen_context.allow_text_avoidance') === false
    ? 0
    : signalNumber(signals, 'text_coverage', 'visual.text_coverage');
  const visualComplexity = signalNumber(signals, 'visual_complexity', 'visual.complexity');
  const shotScale = signalNumber(signals, 'shot_scale', 'visual.shot_scale');
  const facePresent = signalNumber(signals, 'face_present', 'visual.face_present') >= 0.5;
  const eyeContact = signalNumber(signals, 'visual_eye_contact', 'visual.eye_contact', 'eye_contact') >= 0.5;

  const intensity = clamp01(Math.max(
    beatStrength,
    speechEnergy,
    wordImportance,
    topicShift * 0.92,
    emotion * 0.88,
    visualSignificance * 0.78,
    motionIntensity * 0.76,
    direction.magnitude * 0.7,
  ));
  const visualPressure = clamp01(Math.max(
    textOnScreen,
    textCoverage,
    visualComplexity,
    motionIntensity * 0.48,
    shotScale * 0.34,
    facePresent ? 0.54 : 0,
    eyeContact ? 0.68 : 0,
  ));
  const job = resolveTransitionJob({
    params,
    direction,
    intensity,
    topicShift,
    beatStrength,
    emotion,
    visualPressure,
    motionIntensity,
    textOnScreen,
  });
  const intentHint = resolveIntentHint(params);
  const compatibilityType = resolveCompatibilityType({
    explicitType,
    compatibilityHint,
    intentHint,
    direction,
    intensity,
    topicShift,
    beatStrength,
    emotion,
    visualPressure,
    textOnScreen,
  });
  const durationFrames = resolveDurationFrames({
    explicitDuration: input.durationFrames ?? paramNumber(params, 'durationFrames'),
    defaultDuration: input.defaultDurationFrames,
    compatibilityType,
    intensity,
    visualPressure,
    topicShift,
  });
  const softness = resolveSoftness(compatibilityType, visualPressure, emotion, topicShift);
  const blurPx = resolveBlurPx(compatibilityType, intensity, softness);
  const exposure = resolveExposure(compatibilityType, intensity, visualPressure);
  const smear = resolveSmear(compatibilityType, direction.magnitude, intensity, visualPressure);
  const intent = resolveIntent(compatibilityType, topicShift, direction.magnitude, intensity, softness);

  return {
    version: 'atomic-transition-form-v1',
    job,
    intent,
    compatibilityType,
    evidence: resolveTransitionEvidence(params, job, {
      direction,
      intensity,
      topicShift,
      beatStrength,
      emotion,
      visualPressure,
      motionIntensity,
      textOnScreen,
    }),
    direction,
    durationFrames,
    softness,
    blurPx,
    smear,
    exposure,
    maskFeather: clamp01(softness * 0.7 + visualPressure * 0.2),
    intensity,
    visualPressure,
    keyframeBased: compatibilityType === 'dissolve',
    sfxRole: resolveSfxRole(compatibilityType, intensity, softness),
  };
}

function resolveTransitionJob(input: {
  params: Record<string, unknown>;
  direction: AtomicTransitionDirection;
  intensity: number;
  topicShift: number;
  beatStrength: number;
  emotion: number;
  visualPressure: number;
  motionIntensity: number;
  textOnScreen: number;
}): AtomicTransitionJob {
  const explicitJob = normalizeTransitionJob(
    paramString(input.params, 'transitionJob') ?? paramString(input.params, 'transition_job'),
  );
  if (explicitJob) return explicitJob;

  const explicitIntent = paramString(input.params, 'transitionIntent');
  if (explicitIntent === 'motion-transfer') return 'match-motion';
  if (explicitIntent === 'impact-transfer') return 'emphasize-turn';
  if (explicitIntent === 'reveal-wipe') return 'reveal-next';
  if (explicitIntent === 'soft-release') return 'soft-release';
  if (explicitIntent === 'continuity-blend') return 'smooth-continuity';

  if (input.visualPressure >= 0.78 || input.textOnScreen >= 0.62) return 'direct-continuity';
  if (input.direction.magnitude >= 0.48 && input.motionIntensity >= 0.48) return 'match-motion';
  if (input.intensity >= 0.84 || input.beatStrength >= 0.72) return 'emphasize-turn';
  if (input.topicShift >= 0.72 && input.intensity < 0.72) return 'smooth-continuity';
  if (input.topicShift >= 0.56 || input.emotion >= 0.62) return 'reset-attention';
  if (input.intensity < 0.42 && input.direction.magnitude < 0.18) return 'soft-release';
  return 'direct-continuity';
}

function normalizeTransitionJob(value?: string): AtomicTransitionJob | undefined {
  switch (value) {
    case 'invisible':
    case 'direct-continuity':
      return 'direct-continuity';
    case 'smooth-continuity':
    case 'smooth-continuity-gap':
      return 'smooth-continuity';
    case 'hide-jump':
      return 'hide-jump';
    case 'emphasize-turn':
    case 'impact':
      return 'emphasize-turn';
    case 'reset-attention':
      return 'reset-attention';
    case 'match-motion':
    case 'match-motion-direction':
      return 'match-motion';
    case 'reveal':
    case 'reveal-next':
      return 'reveal-next';
    case 'soft-release':
      return 'soft-release';
    default:
      return undefined;
  }
}

function resolveTransitionEvidence(
  params: Record<string, unknown>,
  job: AtomicTransitionJob,
  atoms: {
    direction: AtomicTransitionDirection;
    intensity: number;
    topicShift: number;
    beatStrength: number;
    emotion: number;
    visualPressure: number;
    motionIntensity: number;
    textOnScreen: number;
  },
): AtomicTransitionForm['evidence'] {
  const explicitJob = normalizeTransitionJob(paramString(params, 'transitionJob') ?? paramString(params, 'transition_job'));
  const explicitIntent = paramString(params, 'transitionIntent');
  const reasonKeys: string[] = [];
  if (explicitJob) reasonKeys.push(`job:${job}`);
  if (explicitIntent) reasonKeys.push(`intent:${explicitIntent}`);
  if (atoms.direction.magnitude >= 0.32) reasonKeys.push('motion-direction');
  if (atoms.motionIntensity >= 0.48) reasonKeys.push('visual-motion');
  if (atoms.topicShift >= 0.56) reasonKeys.push('topic-shift');
  if (atoms.beatStrength >= 0.62) reasonKeys.push('beat');
  if (atoms.intensity >= 0.72) reasonKeys.push('intensity');
  if (atoms.emotion >= 0.62) reasonKeys.push('emotion');
  if (atoms.visualPressure >= 0.72 || atoms.textOnScreen >= 0.62) reasonKeys.push('visual-pressure');

  return {
    source: explicitJob
      ? 'explicit-boundary-job'
      : explicitIntent
        ? 'semantic-intent'
        : 'signal-atoms',
    reasonKeys: unique(reasonKeys),
    boundary: {
      hasAnchor: hasAnyParam(params, ['boundaryFrame', 'transitionFrame', 'clipAId', 'clipBId', 'cutFrame']),
      hasReason: hasAnyParam(params, ['transitionJob', 'transition_job', 'transitionIntent', 'topicDelta', 'speechGapMs', 'beatPhase', 'visualContinuity', 'motionVectorX', 'motionVectorY']),
    },
  };
}

function resolveDirection(signals: Record<string, unknown>): AtomicTransitionDirection {
  const motionTrusted = policyAllows(signals, 'vjepa.allow_motion_direction', 'screen_context.allow_motion_direction') !== false;
  const subjectTrusted = policyAllows(signals, 'vjepa.allow_subject_avoidance', 'screen_context.allow_subject_avoidance') !== false;
  const vectorX = motionTrusted ? signalNumberSigned(signals, 'motion_vector_x', 'subject_motion_x', 'camera_motion_x', 'visual.motion_vector.x', 'visual.motion.x') : 0;
  const vectorY = motionTrusted ? signalNumberSigned(signals, 'motion_vector_y', 'subject_motion_y', 'camera_motion_y', 'visual.motion_vector.y', 'visual.motion.y') : 0;
  const subjectX = subjectTrusted ? signalNumber(signals, 'main_subject_x', 'subject_x', 'visual.main_subject.x', 'mainSubjectX', 'subjectX') : 0;
  const subjectY = subjectTrusted ? signalNumber(signals, 'main_subject_y', 'subject_y', 'visual.main_subject.y', 'mainSubjectY', 'subjectY') : 0;

  const fallbackX = vectorX === 0 && subjectX > 0 ? (subjectX - 0.5) * 0.7 : 0;
  const fallbackY = vectorY === 0 && subjectY > 0 ? (subjectY - 0.5) * 0.45 : 0;
  const x = clampSigned(vectorX || fallbackX);
  const y = clampSigned(vectorY || fallbackY);
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const axis = Math.max(absX, absY) < 0.12 ? 'none' : absX >= absY ? 'x' : 'y';
  const label = axis === 'none'
    ? 'center'
    : axis === 'x'
      ? x >= 0 ? 'right' : 'left'
      : y >= 0 ? 'down' : 'up';

  return {
    x,
    y,
    magnitude: clamp01(Math.max(absX, absY)),
    axis,
    label,
  };
}

function resolveCompatibilityType(input: {
  explicitType?: TransitionStyle;
  compatibilityHint?: TransitionStyle;
  intentHint?: string;
  direction: AtomicTransitionDirection;
  intensity: number;
  topicShift: number;
  beatStrength: number;
  emotion: number;
  visualPressure: number;
  textOnScreen: number;
}): TransitionStyle {
  const explicitHardCut = input.explicitType && HARD_CUTS.has(input.explicitType);
  const hasStrongMotionTransfer = input.direction.magnitude >= 0.48 && input.visualPressure < 0.72;
  const hasStrongImpactTransfer = input.intensity >= 0.84 && input.visualPressure < 0.58;
  const hasBeatFlash = input.beatStrength >= 0.72 && input.visualPressure < 0.55;
  const hasSoftBridge = input.topicShift >= 0.74 && input.intensity < 0.72;
  const hasEmotionalBridge = input.emotion >= 0.62 || input.topicShift >= 0.56;

  if (explicitHardCut
    && (!input.intentHint || input.intentHint === 'editorial-cut')
    && !hasStrongMotionTransfer
    && !hasStrongImpactTransfer
    && !hasBeatFlash
    && !hasSoftBridge
    && !hasEmotionalBridge) {
    return input.explicitType as TransitionStyle;
  }

  if (input.visualPressure >= 0.78 || input.textOnScreen >= 0.62) {
    return input.topicShift >= 0.72 && input.intensity < 0.78 ? 'dissolve' : 'soft-cut';
  }

  if (input.intensity >= 0.84 && input.visualPressure < 0.58) {
    return input.direction.magnitude >= 0.38 ? 'whip-pan' : 'zoom-punch';
  }
  if (input.direction.magnitude >= 0.48 && input.visualPressure < 0.72) {
    if (input.direction.axis === 'y') return input.direction.y >= 0 ? 'slide-down' : 'slide-up';
    return 'whip-pan';
  }
  if (input.beatStrength >= 0.72 && input.visualPressure < 0.55) return 'flash';

  if (input.explicitType && !HARD_CUTS.has(input.explicitType)) {
    if ((input.explicitType === 'glitch' || input.explicitType === 'flash' || input.explicitType === 'zoom-punch') && input.visualPressure > 0.62) {
      return 'soft-cut';
    }
    return input.explicitType;
  }

  if (input.intentHint === 'editorial-cut'
    && !hasStrongMotionTransfer
    && !hasStrongImpactTransfer
    && !hasBeatFlash
    && !hasSoftBridge
    && !hasEmotionalBridge) {
    return 'hard-cut';
  }

  if (input.intentHint === 'motion-transfer' && input.direction.magnitude >= 0.32 && input.visualPressure < 0.72) {
    if (input.direction.axis === 'y') return input.direction.y >= 0 ? 'slide-down' : 'slide-up';
    return 'whip-pan';
  }
  if (input.intentHint === 'impact-transfer' && input.intensity >= 0.62 && input.visualPressure < 0.58) {
    return input.beatStrength >= 0.62 ? 'flash' : 'zoom-punch';
  }
  if (input.intentHint === 'reveal-wipe' && input.direction.axis !== 'none' && input.visualPressure < 0.68) {
    if (input.direction.axis === 'y') return input.direction.y >= 0 ? 'slide-down' : 'slide-up';
    return input.direction.x >= 0 ? 'wipe-right' : 'wipe-left';
  }
  if (input.intentHint === 'soft-release' && input.compatibilityHint === 'dip-to-black' && input.visualPressure < 0.82) {
    return 'dip-to-black';
  }
  if (input.intentHint === 'continuity-blend' && (input.topicShift >= 0.4 || input.emotion >= 0.4 || input.visualPressure < 0.65)) {
    return input.compatibilityHint === 'soft-cut' && input.topicShift < 0.56 ? 'soft-cut' : 'dissolve';
  }

  if (input.topicShift >= 0.74 && input.intensity < 0.72) return 'dissolve';
  if (input.emotion >= 0.62 || input.topicShift >= 0.56) return 'dissolve';
  return 'soft-cut';
}

function resolveIntentHint(params: Record<string, unknown>): string | undefined {
  const explicitIntent = paramString(params, 'transitionIntent');
  if (explicitIntent) return explicitIntent;

  const explicitJob = normalizeTransitionJob(
    paramString(params, 'transitionJob') ?? paramString(params, 'transition_job'),
  );
  if (!explicitJob) return undefined;

  switch (explicitJob) {
    case 'direct-continuity':
      return 'editorial-cut';
    case 'smooth-continuity':
    case 'hide-jump':
      return 'continuity-blend';
    case 'emphasize-turn':
    case 'reset-attention':
      return 'impact-transfer';
    case 'match-motion':
      return 'motion-transfer';
    case 'reveal-next':
      return 'reveal-wipe';
    case 'soft-release':
      return 'soft-release';
    default:
      return undefined;
  }
}

function resolveDurationFrames(input: {
  explicitDuration?: number;
  defaultDuration?: number;
  compatibilityType: TransitionStyle;
  intensity: number;
  visualPressure: number;
  topicShift: number;
}): number {
  if (input.explicitDuration != null) {
    return clampFrames(Math.round(input.explicitDuration), input.compatibilityType);
  }

  const base = input.defaultDuration ?? defaultDurationFor(input.compatibilityType);
  const pressurePad = input.visualPressure >= 0.72 ? 8 : 0;
  const topicPad = input.topicShift >= 0.72 && input.compatibilityType === 'dissolve' ? 8 : 0;
  const energyTrim = input.intensity >= 0.82 ? -4 : 0;
  return clampFrames(Math.round(base + pressurePad + topicPad + energyTrim), input.compatibilityType);
}

function resolveSoftness(type: TransitionStyle, visualPressure: number, emotion: number, topicShift: number): number {
  if (type === 'dissolve') return clamp01(0.66 + visualPressure * 0.2 + emotion * 0.12);
  if (type === 'soft-cut' || type === 'blur-transition') return clamp01(0.48 + visualPressure * 0.28);
  if (type === 'whip-pan' || type === 'zoom-punch' || type === 'flash') return clamp01(0.16 + visualPressure * 0.12);
  if (type === 'slide-up' || type === 'slide-down') return clamp01(0.32 + topicShift * 0.12);
  return clamp01(0.3 + visualPressure * 0.2);
}

function resolveBlurPx(type: TransitionStyle, intensity: number, softness: number): number {
  if (type === 'whip-pan') return Math.round(12 + intensity * 22);
  if (type === 'blur-transition') return Math.round(8 + softness * 16);
  if (type === 'soft-cut') return Math.round(2 + softness * 4);
  if (type === 'dissolve') return Math.round(softness * 2);
  return Math.round(softness * 3);
}

function resolveExposure(type: TransitionStyle, intensity: number, visualPressure: number): number {
  if (type === 'flash') return clamp01(0.28 + intensity * 0.42 - visualPressure * 0.18);
  if (type === 'zoom-punch') return clamp01(0.12 + intensity * 0.2 - visualPressure * 0.08);
  if (type === 'film-burn') return clamp01(0.34 + intensity * 0.18);
  return 0;
}

function resolveSmear(type: TransitionStyle, magnitude: number, intensity: number, visualPressure: number): number {
  if (type === 'whip-pan') return clamp01(0.42 + magnitude * 0.34 + intensity * 0.2 - visualPressure * 0.12);
  if (type === 'slide-up' || type === 'slide-down') return clamp01(0.2 + magnitude * 0.18);
  return 0;
}

function resolveIntent(
  type: TransitionStyle,
  topicShift: number,
  directionMagnitude: number,
  intensity: number,
  softness: number,
): AtomicTransitionIntent {
  if (type === 'zoom-punch' || type === 'flash' || type === 'glitch') return 'impact-transfer';
  if (type === 'whip-pan' || type === 'slide-up' || type === 'slide-down') return 'motion-transfer';
  if (type.startsWith('wipe') || type === 'iris-wipe') return 'reveal-wipe';
  if (softness >= 0.62 || topicShift >= 0.7) return 'continuity-blend';
  if (directionMagnitude < 0.18 && intensity < 0.5) return 'soft-release';
  return 'continuity-blend';
}

function resolveSfxRole(type: TransitionStyle, intensity: number, softness: number): AtomicTransitionForm['sfxRole'] {
  if (HARD_CUTS.has(type)) return 'none';
  if (type === 'soft-cut' || type === 'dissolve' || softness > 0.7) return 'none';
  if (type === 'zoom-punch' || type === 'flash') return 'impact';
  if (type === 'glitch') return 'digital-tick';
  if (type === 'whip-pan') return 'fast-whoosh';
  return intensity > 0.52 ? 'soft-whoosh' : 'none';
}

function defaultDurationFor(type: TransitionStyle): number {
  if (type === 'zoom-punch' || type === 'flash') return 8;
  if (type === 'whip-pan' || type === 'glitch') return 10;
  if (type === 'slide-up' || type === 'slide-down') return 15;
  if (type === 'dissolve') return 36;
  if (type === 'soft-cut') return 5;
  return 15;
}

function clampFrames(frames: number, type: TransitionStyle): number {
  if (type === 'soft-cut') return Math.max(3, Math.min(6, frames));
  const min = type === 'dissolve' ? 30 : 4;
  const max = type === 'dissolve' ? 60 : 30;
  return Math.max(min, Math.min(max, frames));
}

function normalizeTransitionStyle(value?: string): TransitionStyle | undefined {
  if (!value) return undefined;
  const known = new Set<TransitionStyle>([
    'dissolve', 'soft-cut', 'blur-transition', 'dip-to-black', 'dip-to-white', 'flash',
    'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'iris-wipe',
    'zoom-punch', 'whip-pan', 'slide-up', 'slide-down',
    'glitch', 'film-burn',
    'hard-cut', 'smash-cut', 'match-cut', 'jump-cut', 'cut-on-action',
  ]);
  return known.has(value as TransitionStyle) ? value as TransitionStyle : undefined;
}

function signalNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return clamp01(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
  }
  return 0;
}

function signalNumberSigned(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return clampSigned(value);
  }
  return 0;
}

function paramNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && isFinite(value) ? value : undefined;
}

function paramString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function hasAnyParam(source: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = source[key];
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== undefined && value !== null;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function policyAllows(source: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && isFinite(value)) return value >= 0.5;
    if (typeof value === 'string' && value.trim()) {
      if (value === 'true') return true;
      if (value === 'false') return false;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric >= 0.5;
    }
  }
  return undefined;
}

function clamp01(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampSigned(value: number): number {
  if (!isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
