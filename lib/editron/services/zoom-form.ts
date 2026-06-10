import type { ZoomKeyframe } from './zoom-keyframes';
import { momentBundleToSignalMap, type AtomicMomentBundle } from './moment-bundle';

export type AtomicZoomDirection = 'push-in' | 'pull-back';
export type ZoomCompatibilityType = 'punch-in' | 'slow-push' | 'pull-back';

export interface ZoomFocalAnchor {
  x: number;
  y: number;
  strength: number;
  transformOrigin: string;
}

export interface AtomicZoomForm {
  version: 'atomic-zoom-form-v1';
  intent: 'emphasis-push' | 'cinematic-push' | 'reveal-pull-back';
  direction: AtomicZoomDirection;
  compatibilityType: ZoomCompatibilityType;
  scaleFrom: number;
  scaleTo: number;
  scaleDelta: number;
  durationFrames: number;
  attackFrames: number;
  startFrame: number;
  endFrame: number;
  holdFrames: number;
  focal: ZoomFocalAnchor;
  intensity: number;
  visualPressure: number;
  keyframes: ZoomKeyframe[];
}

export function resolveAtomicZoomForm(input: {
  signals?: Record<string, unknown>;
  params?: Record<string, unknown>;
  momentBundle?: AtomicMomentBundle;
  localFrame: number;
  sceneEnd: number;
  durationFrames?: number;
}): AtomicZoomForm {
  const signals = input.momentBundle
    ? { ...momentBundleToSignalMap(input.momentBundle), ...(input.signals ?? {}) }
    : input.signals ?? {};
  const params = input.params ?? {};
  const localFrame = Math.max(0, Math.round(input.localFrame));
  const sceneEnd = Math.max(1, Math.round(input.sceneEnd));
  const focal = deriveZoomFocalAnchor(signals);

  const speechEnergy = signalNumber(signals, 'speech_energy', 'speech.energy');
  const wordImportance = signalNumber(signals, 'word_importance', 'word.importance');
  const beatStrength = signalNumber(signals, 'beat_strength', 'beat.strength');
  const emotion = signalNumber(signals, 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity');
  const visualSignificance = signalNumber(signals, 'visual_significance', 'visual.significance');
  const motionIntensity = signalNumber(signals, 'motion_intensity', 'visual.motion_intensity');
  const shotScale = signalNumber(signals, 'shot_scale', 'visual.shot_scale');
  const textOnScreen = signalNumber(signals, 'text_on_screen', 'visual.text_on_screen');
  const visualComplexity = signalNumber(signals, 'visual_complexity', 'visual.complexity');
  const topicShift = signalNumber(signals, 'topic_shift', 'topic.shift');

  const intensity = clamp01(Math.max(
    speechEnergy,
    wordImportance,
    beatStrength,
    emotion,
    visualSignificance * 0.86,
    motionIntensity * 0.72,
  ));
  const visualPressure = clamp01(Math.max(
    textOnScreen,
    visualComplexity,
    motionIntensity * 0.66,
    shotScale * 0.18,
  ));

  const explicitScaleFrom = paramNumber(params, 'scaleFrom');
  const explicitScaleTo = paramNumber(params, 'scaleTo');
  const legacyType = paramString(params, 'zoomType');
  const shouldPullBack = (explicitScaleFrom != null && explicitScaleTo != null && explicitScaleTo < explicitScaleFrom)
    || legacyType === 'pull-back'
    || topicShift >= 0.72;
  const direction: AtomicZoomDirection = shouldPullBack ? 'pull-back' : 'push-in';
  const scaleDelta = resolveScaleDelta({
    intensity,
    visualPressure,
    shotScale,
    explicitScaleFrom,
    explicitScaleTo,
    direction,
  });
  const scaleFrom = explicitScaleFrom ?? (direction === 'pull-back' ? 1 + scaleDelta : 1);
  const scaleTo = explicitScaleTo ?? (direction === 'pull-back' ? 1 : 1 + scaleDelta);
  const durationFrames = resolveDurationFrames({
    explicitDuration: input.durationFrames ?? paramNumber(params, 'durationFrames'),
    direction,
    intensity,
    emotion,
    wordImportance,
    sceneEnd,
  });
  const compatibilityType = resolveCompatibilityType(direction, durationFrames, sceneEnd, intensity);
  const attackFrames = direction === 'pull-back'
    ? durationFrames
    : compatibilityType === 'slow-push'
      ? sceneEnd
      : Math.max(6, Math.min(16, Math.round(durationFrames * 0.72)));
  const startOffset = direction === 'push-in' && compatibilityType !== 'slow-push' && Math.max(wordImportance, beatStrength, speechEnergy) >= 0.62
    ? Math.min(6, Math.max(3, Math.round(4 + intensity * 3)))
    : 0;
  const startFrame = compatibilityType === 'slow-push' ? 0 : Math.max(0, localFrame - startOffset);
  const endFrame = compatibilityType === 'slow-push'
    ? sceneEnd
    : Math.min(sceneEnd, startFrame + durationFrames);
  const holdFrames = compatibilityType === 'punch-in' ? Math.max(0, sceneEnd - endFrame) : 0;
  const intent = direction === 'pull-back'
    ? 'reveal-pull-back'
    : compatibilityType === 'slow-push'
      ? 'cinematic-push'
      : 'emphasis-push';

  return {
    version: 'atomic-zoom-form-v1',
    intent,
    direction,
    compatibilityType,
    scaleFrom,
    scaleTo,
    scaleDelta: scaleTo - scaleFrom,
    durationFrames,
    attackFrames,
    startFrame,
    endFrame,
    holdFrames,
    focal,
    intensity,
    visualPressure,
    keyframes: buildAtomicZoomKeyframes({
      direction,
      compatibilityType,
      scaleFrom,
      scaleTo,
      startFrame,
      endFrame,
      sceneEnd,
    }),
  };
}

export function deriveZoomFocalAnchor(signals: Record<string, unknown>): ZoomFocalAnchor {
  const explicitX = signalNumber(signals, 'zoom_focal_x', 'zoom.focal_x');
  const explicitY = signalNumber(signals, 'zoom_focal_y', 'zoom.focal_y');
  const subjectX = signalNumber(signals, 'main_subject_x', 'subject_x', 'visual.main_subject.x', 'mainSubjectX', 'subjectX');
  const subjectY = signalNumber(signals, 'main_subject_y', 'subject_y', 'visual.main_subject.y', 'mainSubjectY', 'subjectY');
  const facePresent = signalNumber(signals, 'face_present', 'visual.face_present', 'facePresent') >= 0.5;
  const subjectWidth = signalNumber(signals, 'main_subject_width', 'subject_width', 'visual.main_subject.width', 'mainSubjectWidth', 'subjectWidth');
  const subjectHeight = signalNumber(signals, 'main_subject_height', 'subject_height', 'visual.main_subject.height', 'mainSubjectHeight', 'subjectHeight');
  const hasSubjectAnchor = subjectX > 0 || subjectY > 0 || subjectWidth > 0 || subjectHeight > 0 || facePresent;
  const hasExplicitFocal = explicitX > 0 || explicitY > 0;
  const rawX = explicitX > 0 ? explicitX : hasSubjectAnchor && subjectX > 0 ? subjectX : 0.5;
  const rawY = explicitY > 0 ? explicitY : hasSubjectAnchor && subjectY > 0 ? subjectY : 0.5;
  const x = hasExplicitFocal ? clamp01(rawX) : clampRange(rawX, 0.16, 0.84);
  const y = hasExplicitFocal ? clamp01(rawY) : clampRange(rawY, 0.18, 0.82);
  const offCenter = Math.max(Math.abs(x - 0.5) * 2, Math.abs(y - 0.5) * 2);
  const subjectWeight = hasSubjectAnchor ? Math.max(facePresent ? 0.68 : 0.45, offCenter) : offCenter;

  return {
    x,
    y,
    strength: clamp01(subjectWeight),
    transformOrigin: `${formatPercent(x)} ${formatPercent(y)}`,
  };
}

function buildAtomicZoomKeyframes(input: {
  direction: AtomicZoomDirection;
  compatibilityType: ZoomCompatibilityType;
  scaleFrom: number;
  scaleTo: number;
  startFrame: number;
  endFrame: number;
  sceneEnd: number;
}): ZoomKeyframe[] {
  if (input.direction === 'pull-back') {
    return [
      { frame: input.startFrame, value: input.scaleFrom, easing: 'ease-in-out' },
      { frame: input.endFrame, value: input.scaleTo, easing: 'ease-out' },
    ];
  }

  if (input.compatibilityType === 'slow-push') {
    return [
      { frame: 0, value: input.scaleFrom, easing: 'ease-in-out' },
      { frame: input.sceneEnd, value: input.scaleTo, easing: 'ease-in-out' },
    ];
  }

  return [
    { frame: input.startFrame, value: input.scaleFrom, easing: 'ease-in' },
    { frame: input.endFrame, value: input.scaleTo, easing: 'ease-out' },
    { frame: input.sceneEnd, value: input.scaleTo, easing: 'linear' },
  ];
}

function resolveScaleDelta(input: {
  intensity: number;
  visualPressure: number;
  shotScale: number;
  explicitScaleFrom?: number;
  explicitScaleTo?: number;
  direction: AtomicZoomDirection;
}): number {
  if (input.explicitScaleFrom != null && input.explicitScaleTo != null) {
    return Math.abs(input.explicitScaleTo - input.explicitScaleFrom);
  }
  const energyDelta = 0.026 + input.intensity * 0.078;
  const pressurePenalty = input.visualPressure * 0.032 + input.shotScale * 0.012;
  const expressiveBoost = input.intensity >= 0.82 && input.visualPressure < 0.52 ? 0.018 : 0;
  const pullBackBoost = input.direction === 'pull-back' ? 0.012 : 0;
  return clampRange(energyDelta - pressurePenalty + expressiveBoost + pullBackBoost, 0.022, 0.14);
}

function resolveDurationFrames(input: {
  explicitDuration?: number;
  direction: AtomicZoomDirection;
  intensity: number;
  emotion: number;
  wordImportance: number;
  sceneEnd: number;
}): number {
  if (input.explicitDuration != null) {
    return Math.max(1, Math.min(input.sceneEnd, Math.round(input.explicitDuration)));
  }
  if (input.direction === 'pull-back') {
    return Math.min(input.sceneEnd, Math.round(28 + (1 - input.intensity) * 30));
  }
  if (Math.max(input.wordImportance, input.intensity) >= 0.72) {
    return Math.min(input.sceneEnd, Math.round(10 + (1 - input.intensity) * 10));
  }
  if (input.emotion >= 0.58) {
    return Math.min(input.sceneEnd, Math.round(36 + (1 - input.emotion) * 26));
  }
  return Math.min(input.sceneEnd, Math.max(45, Math.round(input.sceneEnd * 0.42)));
}

function resolveCompatibilityType(
  direction: AtomicZoomDirection,
  durationFrames: number,
  sceneEnd: number,
  intensity: number,
): ZoomCompatibilityType {
  if (direction === 'pull-back') return 'pull-back';
  if (durationFrames >= sceneEnd * 0.5 || intensity < 0.52) return 'slow-push';
  return 'punch-in';
}

function signalNumber(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && isFinite(value)) return clamp01(value);
    if (typeof value === 'boolean') return value ? 1 : 0;
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

function formatPercent(value: number): string {
  const rounded = Math.round(clamp01(value) * 1000) / 10;
  return `${rounded}%`;
}

function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

function clampRange(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
