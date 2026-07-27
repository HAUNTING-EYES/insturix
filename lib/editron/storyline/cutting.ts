/**
 * cutting - the VLM-cutting contract: find the PRECISE in/out inside a clip for a wanted moment.
 * Coverage answers "which clip has the moment"; cutting answers "WHERE in that clip is it," so we
 * can trim to exactly the part the user wants (and if the moment appears more than once in a clip,
 * SPLIT it into the usable pieces).
 *
 * The contract = the strict shape a VLM's answer must satisfy before we trust its cut: timecodes
 * inside the clip's bounds, out > in, at least a minimum duration. A model that returns
 * out-of-bounds, inverted, or too-short windows is not obeyed - the offending window is clamped
 * or dropped, never turned into a bad cut. Same conviction as coverage: we act on grounded,
 * validated timecoded evidence or we say "not found here," we never fabricate a cut point.
 *
 * Async only through the injected `vlmCut`; pure otherwise; never throws.
 */

import { MIN_CLIP_DURATION_SEC } from './storyline';
import { makeScene, type Scene } from './scene';

/** The moment to locate inside a clip ("the moment she opens the box"). */
export interface CutRequest {
  text: string;
}

/** A timecoded window the VLM located inside a scene, in ABSOLUTE source seconds. */
export interface CutWindow {
  startSec: number;
  endSec: number;
  confidence: number; // 0..1
}

/** The VLM's grounded answer to "where inside this clip is [request]?" Injected (a vision model). */
export type VlmCut = (
  request: CutRequest,
  scene: Scene,
) => Promise<{ present: boolean; windows: CutWindow[]; note?: string }>;

export type CutVerdict = 'cut' | 'split' | 'whole' | 'not-found';

export interface CutResult {
  verdict: CutVerdict;
  /** Contract-validated, in-bounds windows kept (the cut points), sorted by start. */
  windows: CutWindow[];
  /** The trimmed sub-scene(s) - one per window - ready for the composer. Empty when not-found. */
  clips: Scene[];
  statement: string;
}

/** Tolerance (seconds) for treating a window as "the whole clip" (no meaningful trim). */
const WHOLE_CLIP_TOLERANCE_SEC = 0.5;

function num01(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0.5;
}

/** Clamp a claimed window into the scene's bounds; return null if it can't be a valid clip. */
function validateWindow(scene: Scene, w: CutWindow, minClip: number): CutWindow | null {
  if (!w || !Number.isFinite(w.startSec) || !Number.isFinite(w.endSec)) return null;
  // swap inverted timecodes, then clamp into the scene's actual bounds
  const rawStart = Math.min(w.startSec, w.endSec);
  const rawEnd = Math.max(w.startSec, w.endSec);
  const start = Math.max(scene.startTime, rawStart);
  const end = Math.min(scene.endTime, rawEnd);
  if (!(end - start >= minClip)) return null; // out of bounds, or too short after clamping
  return { startSec: start, endSec: end, confidence: num01(w.confidence) };
}

/** A trimmed sub-scene for one window: same source, narrower window; parent signals inherited
 *  (re-analysis of the sub-segment is a future refinement). */
function clipForWindow(scene: Scene, w: CutWindow): Scene {
  return makeScene({
    ...scene,
    startTime: w.startSec,
    endTime: w.endSec,
    id: undefined, // re-derive the content-addressed id for the new window
  });
}

function coversWholeClip(scene: Scene, w: CutWindow): boolean {
  return w.startSec - scene.startTime <= WHOLE_CLIP_TOLERANCE_SEC && scene.endTime - w.endSec <= WHOLE_CLIP_TOLERANCE_SEC;
}

/**
 * Find where the requested moment is inside a clip and return the cut(s). Runs the injected VLM,
 * validates every returned window against the contract, and classifies:
 *   cut       - one in-bounds sub-window -> trim to it.
 *   split     - two+ in-bounds windows   -> the clip yields multiple usable pieces.
 *   whole     - the one window is essentially the whole clip -> no meaningful trim.
 *   not-found - the moment isn't present, or the VLM returned nothing the contract accepts.
 * Async only through `vlmCut`; never throws.
 */
export async function cutToMoment(
  scene: Scene,
  request: CutRequest,
  vlmCut: VlmCut,
  opts?: { minClipDurationSec?: number },
): Promise<CutResult> {
  const minClip = opts?.minClipDurationSec ?? MIN_CLIP_DURATION_SEC;

  let answer: { present: boolean; windows: CutWindow[]; note?: string };
  try {
    answer = await vlmCut(request, scene);
  } catch {
    return { verdict: 'not-found', windows: [], clips: [], statement: `Couldn't locate "${request.text}" in this clip.` };
  }

  if (!answer || answer.present === false || !Array.isArray(answer.windows)) {
    return { verdict: 'not-found', windows: [], clips: [], statement: `"${request.text}" isn't in this clip.` };
  }

  const windows = answer.windows
    .map((w) => validateWindow(scene, w, minClip))
    .filter((w): w is CutWindow => w !== null)
    .sort((a, b) => a.startSec - b.startSec);

  if (windows.length === 0) {
    return { verdict: 'not-found', windows: [], clips: [], statement: `No valid cut for "${request.text}" in this clip.` };
  }
  if (windows.length === 1 && coversWholeClip(scene, windows[0])) {
    return { verdict: 'whole', windows, clips: [scene], statement: `"${request.text}" spans the whole clip — no trim needed.` };
  }

  const clips = windows.map((w) => clipForWindow(scene, w));
  const verdict: CutVerdict = windows.length > 1 ? 'split' : 'cut';
  const statement =
    verdict === 'split'
      ? `"${request.text}" appears ${windows.length} times — split into ${windows.length} clips.`
      : `Trimmed to "${request.text}": ${windows[0].startSec.toFixed(1)}–${windows[0].endSec.toFixed(1)}s.`;
  return { verdict, windows, clips, statement };
}
