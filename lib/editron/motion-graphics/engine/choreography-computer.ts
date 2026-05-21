import type { MotionTokens } from '../types';
import type {
  ResolvedElement,
  ComputedChoreography,
  ExitStyle,
  SyncTarget,
  RecipeChoreography,
} from './recipe-types';
import { resolveEasingCurve } from './gsap-easing';

interface ChoreographyInput {
  elements: ResolvedElement[];
  tokens: MotionTokens;
  durationInFrames: number;
  fps: number;
  exitStyle: ExitStyle;
  recipeChoreography?: RecipeChoreography;
  syncData?: SyncData;
}

export interface SyncData {
  beatTimesMs?: number[];
  wordTimings?: Array<{ text: string; startMs: number; endMs: number }>;
}

const MIN_HOLD_FRAMES = 6;

export function computeChoreography(input: ChoreographyInput): Map<string, ComputedChoreography> {
  const { elements, tokens, durationInFrames, fps, exitStyle, recipeChoreography, syncData } = input;

  const staggerFrames = Math.round((tokens.animation.staggerMs / 1000) * fps);
  const entranceDurationFrames = Math.round((tokens.animation.entranceDurationMs / 1000) * fps);
  const exitDurationFrames = Math.round((tokens.animation.exitDurationMs / 1000) * fps);

  const entranceEasing = resolveEasingCurve(tokens.animation.entranceEasing);
  const exitEasing = resolveEasingCurve(tokens.animation.exitEasing);

  const syncTarget = resolveSyncTarget(recipeChoreography?.syncTo, syncData);

  const sorted = [...elements].sort((a, b) => a.enterOrder - b.enterOrder);

  const result = new Map<string, ComputedChoreography>();

  if (syncTarget === 'even-stagger' || !recipeChoreography?.pattern || recipeChoreography.pattern === 'staggered') {
    computeStaggered(sorted, result, {
      staggerFrames,
      entranceDurationFrames,
      exitDurationFrames,
      durationInFrames,
      exitStyle,
      entranceEasing,
      exitEasing,
    });
  } else if (recipeChoreography.pattern === 'simultaneous') {
    computeSimultaneous(sorted, result, {
      entranceDurationFrames,
      exitDurationFrames,
      durationInFrames,
      entranceEasing,
      exitEasing,
    });
  } else if (recipeChoreography.pattern === 'word-stagger' || recipeChoreography.pattern === 'left-to-right-stagger') {
    computeStaggered(sorted, result, {
      staggerFrames,
      entranceDurationFrames,
      exitDurationFrames,
      durationInFrames,
      exitStyle,
      entranceEasing,
      exitEasing,
    });
  }

  validateChoreography(result, durationInFrames);
  return result;
}

interface StaggerParams {
  staggerFrames: number;
  entranceDurationFrames: number;
  exitDurationFrames: number;
  durationInFrames: number;
  exitStyle: ExitStyle;
  entranceEasing: (t: number) => number;
  exitEasing: (t: number) => number;
}

function computeStaggered(
  elements: ResolvedElement[],
  result: Map<string, ComputedChoreography>,
  params: StaggerParams,
): void {
  const { staggerFrames, entranceDurationFrames, exitDurationFrames, durationInFrames, exitStyle, entranceEasing, exitEasing } = params;

  const totalEntranceSpan = entranceDurationFrames + (elements.length - 1) * staggerFrames;
  const totalExitSpan = exitStyle === 'reverse-stagger'
    ? exitDurationFrames + (elements.length - 1) * staggerFrames
    : exitDurationFrames;

  const availableHold = durationInFrames - totalEntranceSpan - totalExitSpan;
  const holdFrames = Math.max(MIN_HOLD_FRAMES, availableHold);

  const scale = availableHold < MIN_HOLD_FRAMES
    ? (durationInFrames - MIN_HOLD_FRAMES) / (totalEntranceSpan + totalExitSpan)
    : 1;

  const scaledEntrance = Math.round(entranceDurationFrames * scale);
  const scaledStagger = Math.max(1, Math.round(staggerFrames * scale));
  const scaledExit = Math.round(exitDurationFrames * scale);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const enterStart = i * scaledStagger;
    const enterEnd = enterStart + scaledEntrance;

    let exitStart: number;
    let exitEnd: number;

    if (exitStyle === 'reverse-stagger') {
      const reverseIndex = elements.length - 1 - i;
      exitEnd = durationInFrames - reverseIndex * scaledStagger;
      exitStart = exitEnd - scaledExit;
    } else {
      exitStart = durationInFrames - scaledExit;
      exitEnd = durationInFrames;
    }

    result.set(el.role, {
      enterStartFrame: enterStart,
      enterEndFrame: enterEnd,
      holdStartFrame: enterEnd,
      holdEndFrame: exitStart,
      exitStartFrame: exitStart,
      exitEndFrame: exitEnd,
      enterEasing: entranceEasing,
      exitEasing: exitEasing,
    });
  }
}

function computeSimultaneous(
  elements: ResolvedElement[],
  result: Map<string, ComputedChoreography>,
  params: Omit<StaggerParams, 'staggerFrames' | 'exitStyle'>,
): void {
  const { entranceDurationFrames, exitDurationFrames, durationInFrames, entranceEasing, exitEasing } = params;

  for (const el of elements) {
    result.set(el.role, {
      enterStartFrame: 0,
      enterEndFrame: entranceDurationFrames,
      holdStartFrame: entranceDurationFrames,
      holdEndFrame: durationInFrames - exitDurationFrames,
      exitStartFrame: durationInFrames - exitDurationFrames,
      exitEndFrame: durationInFrames,
      enterEasing: entranceEasing,
      exitEasing: exitEasing,
    });
  }
}

function resolveSyncTarget(requested: SyncTarget | undefined, syncData?: SyncData): SyncTarget {
  if (requested === 'audio-beats') {
    if (syncData?.beatTimesMs?.length) return 'audio-beats';
    console.warn('[MG-Choreo] Sync degraded: audio-beats → word-timings (no beat data)');
    if (syncData?.wordTimings?.length) return 'word-timings';
    console.warn('[MG-Choreo] Sync degraded: word-timings → even-stagger (no word data)');
    return 'even-stagger';
  }
  if (requested === 'word-timings') {
    if (syncData?.wordTimings?.length) return 'word-timings';
    console.warn('[MG-Choreo] Sync degraded: word-timings → even-stagger (no word data)');
    return 'even-stagger';
  }
  return 'even-stagger';
}

function validateChoreography(result: Map<string, ComputedChoreography>, totalFrames: number): void {
  for (const [role, timing] of result) {
    if (timing.enterEndFrame > timing.exitStartFrame) {
      console.warn(`[MG-Choreo] Element "${role}" entrance overlaps exit — duration too short. Clamping.`);
      const mid = Math.round((timing.enterStartFrame + totalFrames) / 2);
      timing.enterEndFrame = Math.min(timing.enterEndFrame, mid);
      timing.holdStartFrame = timing.enterEndFrame;
      timing.holdEndFrame = Math.max(timing.holdStartFrame, timing.exitStartFrame);
    }
  }
}
