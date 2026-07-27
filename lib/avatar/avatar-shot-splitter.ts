/**
 * Shot splitter — turn a whole script into ≤10s speaking shots (the Kling LipSync
 * cap). The keystone of multi-shot avatar production: a 30-40s script becomes N
 * shots, each generated as its own clip, then assembled in Editron.
 *
 * Audio-first (never estimate): split the script into sentence units, MEASURE each
 * unit's synthesized voice, then greedily pack consecutive units into shots whose
 * combined measured duration fits the budget. A single sentence longer than the
 * budget becomes its own over-budget shot — the caller applies the fit rule
 * (atempo ≤4% or rewrite) per shot.
 */

export const DEFAULT_SHOT_BUDGET_SEC = 10; // Kling LipSync input-video cap

export interface MeasuredUnit {
  text: string;
  durationSec: number;
}

export interface AvatarShot {
  index: number;
  text: string;
  /** Sum of the measured unit durations packed into this shot. */
  durationSec: number;
  unitCount: number;
  /** true when a single unit alone exceeds the budget → caller must fit/rewrite. */
  overBudget: boolean;
}

/** Split a script into sentence-ish units for measurement. Pure. */
export function splitIntoSentences(script: string): string[] {
  return script
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Greedily pack measured units into shots, each ≤ budgetSec. Consecutive units join
 * until the next would overflow; then a new shot starts. A unit that alone exceeds
 * the budget is its own shot, flagged overBudget. Pure.
 */
export function packUnitsIntoShots(units: MeasuredUnit[], budgetSec: number = DEFAULT_SHOT_BUDGET_SEC): AvatarShot[] {
  const shots: AvatarShot[] = [];
  let curText: string[] = [];
  let curDur = 0;

  const flush = () => {
    if (!curText.length) return;
    shots.push({
      index: shots.length,
      text: curText.join(' '),
      durationSec: round2(curDur),
      unitCount: curText.length,
      overBudget: curDur > budgetSec + 1e-6,
    });
    curText = [];
    curDur = 0;
  };

  for (const unit of units) {
    // If this unit would overflow a non-empty shot, close the current shot first.
    if (curDur > 0 && curDur + unit.durationSec > budgetSec) flush();
    curText.push(unit.text);
    curDur += unit.durationSec;
    // A shot that has reached/exceeded the budget is closed immediately.
    if (curDur >= budgetSec) flush();
  }
  flush();
  return shots;
}

/**
 * Plan the shots for a script: split → measure each unit (injectable, audio-first) →
 * pack. `measure(text)` returns the synthesized-voice duration in seconds.
 */
export async function planShots(
  script: string,
  measure: (text: string) => Promise<number>,
  budgetSec: number = DEFAULT_SHOT_BUDGET_SEC,
): Promise<AvatarShot[]> {
  const sentences = splitIntoSentences(script);
  const units: MeasuredUnit[] = [];
  for (const text of sentences) {
    units.push({ text, durationSec: await measure(text) });
  }
  return packUnitsIntoShots(units, budgetSec);
}

/** True when a script needs more than one shot → route to Editron for assembly. */
export function isMultiShot(shots: AvatarShot[]): boolean {
  return shots.length > 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
