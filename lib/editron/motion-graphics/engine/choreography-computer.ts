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

  const beatFrames = syncTarget === 'audio-beats' && syncData?.beatTimesMs?.length
    ? syncData.beatTimesMs.map(ms => Math.round((ms / 1000) * fps))
    : undefined;

  const staggerParams: StaggerParams = {
    staggerFrames,
    entranceDurationFrames,
    exitDurationFrames,
    durationInFrames,
    exitStyle,
    entranceEasing,
    exitEasing,
    beatFrames,
  };

  const pattern = recipeChoreography?.pattern || 'staggered';
  if (pattern === 'simultaneous') {
    computeSimultaneous(sorted, result, {
      entranceDurationFrames,
      exitDurationFrames,
      durationInFrames,
      entranceEasing,
      exitEasing,
    });
  } else {
    computeStaggered(sorted, result, staggerParams);
  }

  validateChoreography(result, durationInFrames);
  addAnticipation(result);
  return result;
}

// Disney #2 — Anticipation: carve a brief reverse phase from the start of each entrance.
// Steals 20% of entrance frames (min 2) — no total duration change.
// ⚠️ 0.2 ratio INVENTED — AE practice: 15-25% of entrance for anticipation
function addAnticipation(result: Map<string, ComputedChoreography>): void {
  for (const [, timing] of result) {
    const entranceDuration = timing.enterEndFrame - timing.enterStartFrame;
    const anticipationFrames = Math.floor(entranceDuration * 0.2);
    if (anticipationFrames >= 2) {
      timing.anticipateStartFrame = timing.enterStartFrame;
      timing.anticipateEndFrame = timing.enterStartFrame + anticipationFrames;
      timing.enterStartFrame = timing.enterStartFrame + anticipationFrames;
    }
  }
}

interface StaggerParams {
  staggerFrames: number;
  entranceDurationFrames: number;
  exitDurationFrames: number;
  durationInFrames: number;
  exitStyle: ExitStyle;
  entranceEasing: (t: number) => number;
  exitEasing: (t: number) => number;
  beatFrames?: number[];
}

function computeStaggered(
  elements: ResolvedElement[],
  result: Map<string, ComputedChoreography>,
  params: StaggerParams,
): void {
  const { staggerFrames, entranceDurationFrames, exitDurationFrames, durationInFrames, exitStyle, entranceEasing, exitEasing, beatFrames } = params;

  const totalEntranceSpan = entranceDurationFrames + (elements.length - 1) * staggerFrames;
  const totalExitSpan = exitStyle === 'reverse-stagger'
    ? exitDurationFrames + (elements.length - 1) * staggerFrames
    : exitDurationFrames;

  const availableHold = durationInFrames - totalEntranceSpan - totalExitSpan;
  const _holdFrames = Math.max(MIN_HOLD_FRAMES, availableHold);

  const scale = availableHold < MIN_HOLD_FRAMES
    ? (durationInFrames - MIN_HOLD_FRAMES) / (totalEntranceSpan + totalExitSpan)
    : 1;

  const scaledEntrance = Math.round(entranceDurationFrames * scale);
  const scaledStagger = Math.max(1, Math.round(staggerFrames * scale));
  const scaledExit = Math.round(exitDurationFrames * scale);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    let enterStart = i * scaledStagger;

    // Beat sync: snap enterStart to the nearest musical beat frame.
    // Only when beat data is available (Essentia analysis succeeded).
    // ⚠️ snap tolerance = scaledStagger/2 INVENTED — don't snap further than half a stagger
    if (beatFrames?.length && enterStart < durationInFrames) {
      const maxSnap = Math.round(scaledStagger / 2);
      let nearestBeat = enterStart;
      let nearestDist = Infinity;
      for (const bf of beatFrames) {
        const dist = Math.abs(bf - enterStart);
        if (dist < nearestDist && dist <= maxSnap) {
          nearestDist = dist;
          nearestBeat = bf;
        }
      }
      if (nearestDist < Infinity) enterStart = nearestBeat;
    }

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
