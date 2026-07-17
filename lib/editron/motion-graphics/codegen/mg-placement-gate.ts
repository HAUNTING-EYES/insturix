/**
 * MG render-sanity guard (Phase B redesign, 2026-07-15) — the ONLY deterministic pixel check this lane can
 * correctly make. It replaces the Phase-A "placement gate" (coverage cap + subject/caption/margin vetoes), which
 * was built on a wrong premise.
 *
 * WHY THE OLD GATE WAS WRONG: the codegen lane IS the Tier-B engine (Fable MG-Codegen-Lane §3 M2 "Licensed
 * concept scene (Tier B proper)"; §8 truth table — codegen alone does kinetic type, maps, particles, reveals,
 * parallax-with-layers, and with assets does full-frame photos/collage). Its output spans a corner chip → a
 * full-frame concept scene (Tier-B Axis 2: pure-vector ↔ cutout ↔ full-frame photo). The v2 context architecture
 * (2026-07-12, founder-directed) states it outright: "a big MG is full-frame transparent with content placed in
 * the frame-safe region." A coverage cap, a subject-overlap veto, and caption/margin rules therefore HARD-FAIL
 * legitimate points on that spectrum. And there is NO real face detection — the subject box is a coarse
 * motion-blob ("do NOT assume we know where the face is"); corpse ⑤ (MG covers the subject) is damage-6, handled
 * by a SOFT prior in the prompt + the vision judge (which sees the footage composite), NOT a deterministic veto.
 *
 * WHAT REMAINS deterministically correct at EVERY point of the spectrum — two degenerate renders that a broken
 * component produces and that the prompt's own hard rules already forbid:
 *   1. the component rendered NOTHING (no visible pixels) — a blank/broken component;
 *   2. a NEAR-OPAQUE FULL-FRAME field — "an opaque full-canvas graphic that hides the footage" (prompt.ts
 *      hardRules: "Never solve this with an opaque or near-opaque full-frame field"; JUDGE_PROMPT auto-rejects
 *      it). A legitimate full-frame MG is TRANSPARENT — kinetic type, vector marks, particles never fill the
 *      frame solid; footage reads through the gaps — so this check has zero false-positives on real output.
 * Everything else ("is it too big? does it cover the speaker? is it in the caption zone?") is taste over content
 * the judge reasons about, not blind alpha geometry. This guard is the cheap deterministic floor under the judge.
 */

import sharp from 'sharp';

export interface MgRenderSanityMetrics {
  /** Visible (alpha > faint threshold) pixels / total — 0 means the component rendered nothing. */
  coverageFrac: number;
  /** Near-opaque (alpha > opaque threshold) pixels / total — ~1 means a solid field hiding the footage. */
  nearOpaqueFrac: number;
}

export interface MgRenderSanityThresholds {
  /** Alpha (0-255) above which a pixel counts as "near-opaque" (part of a solid field). 230 ≈ 0.9. */
  opaqueAlpha: number;
  /** Alpha (0-255) above which a pixel counts as "visible" at all (ignores anti-alias fringe). */
  faintAlpha: number;
  /** Fraction of the frame that, when near-opaque, means the graphic is a solid field hiding the footage. */
  maxNearOpaqueFrac: number;
}

/**
 * Guard constants — these define DEGENERATE, not taste. Sourced from the existing hard rules, not invented:
 *   - opaqueAlpha 230 (0.9)  ← prompt hardRules "near-opaque full-frame field" is forbidden.
 *   - maxNearOpaqueFrac 0.92 ← "full-frame": only a graphic that is BOTH near-opaque AND covers essentially the
 *     whole frame trips this. A translucent scrim (alpha ~0.6) or full-frame kinetic type (huge alpha gaps)
 *     never reaches 0.92 near-opaque coverage, so legitimate full-frame MGs pass.
 */
export const DEFAULT_MG_RENDER_SANITY_THRESHOLDS: MgRenderSanityThresholds = {
  opaqueAlpha: 230,
  faintAlpha: 16,
  maxNearOpaqueFrac: 0.92,
};

export interface MgRenderSanityResult {
  pass: boolean;
  reasons: string[];
  metrics: MgRenderSanityMetrics;
}

/**
 * PURE: given measured alpha metrics, decide pass/fail. Only the two universally-degenerate cases fail; a
 * legitimate MG at any size passes. Unit-tested with synthetic metrics, no rendering needed.
 *
 * `expectOpaque` (4b-3 output-mode routing): a FULL-FRAME illustrated Scene renders legitimately opaque (the
 * generated backdrop IS the frame — it lands as a video-track asset, not an overlay), so the near-opaque veto
 * is a false positive there by construction. The mode comes from designOutputMode (declared from the PLAN,
 * never sniffed from pixels); the rendered-nothing check still applies in both modes.
 */
export function evaluateMgRenderSanity(
  m: MgRenderSanityMetrics,
  t: MgRenderSanityThresholds = DEFAULT_MG_RENDER_SANITY_THRESHOLDS,
  opts: { expectOpaque?: boolean } = {},
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (m.coverageFrac <= 0) {
    reasons.push('the component rendered no visible pixels');
    return { pass: false, reasons };
  }
  if (!opts.expectOpaque && m.nearOpaqueFrac > t.maxNearOpaqueFrac) {
    reasons.push(
      `${Math.round(m.nearOpaqueFrac * 100)}% of the frame is a near-opaque field — it hides the footage (a full-frame MG must stay transparent)`,
    );
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * IMPURE: measure ONE rendered alpha frame. Downsamples first (the two fractions are scale-invariant) so the
 * per-pixel pass is fast even for 1080p frames.
 */
export async function measureMgRenderSanity(
  frame: Buffer,
  opts: { opaqueAlpha?: number; faintAlpha?: number; sampleWidth?: number } = {},
): Promise<MgRenderSanityMetrics> {
  const opaqueAt = opts.opaqueAlpha ?? DEFAULT_MG_RENDER_SANITY_THRESHOLDS.opaqueAlpha;
  const faintAt = opts.faintAlpha ?? DEFAULT_MG_RENDER_SANITY_THRESHOLDS.faintAlpha;

  const target = opts.sampleWidth ?? 256;
  const { data, info } = await sharp(frame)
    .ensureAlpha()
    .resize({ width: target, fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaIdx = channels - 1;

  let visible = 0;
  let nearOpaque = 0;
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const a = data[i * channels + alphaIdx];
    if (a > faintAt) visible += 1;
    if (a > opaqueAt) nearOpaque += 1;
  }

  return {
    coverageFrac: pixels ? visible / pixels : 0,
    nearOpaqueFrac: pixels ? nearOpaque / pixels : 0,
  };
}

/** Measure a rendered alpha frame + apply the guard. The seam calls this on a settled-hold frame. */
export async function mgRenderSanityGate(
  frame: Buffer,
  thresholds: MgRenderSanityThresholds = DEFAULT_MG_RENDER_SANITY_THRESHOLDS,
  opts: { expectOpaque?: boolean } = {},
): Promise<MgRenderSanityResult> {
  const metrics = await measureMgRenderSanity(frame, {
    opaqueAlpha: thresholds.opaqueAlpha,
    faintAlpha: thresholds.faintAlpha,
  });
  return { ...evaluateMgRenderSanity(metrics, thresholds, opts), metrics };
}

// ─── Taste-gate deterministic floor, check 2: MOTION PRESENCE ───
// The sanity guard sees ONE frame; a component can render fine and just SIT there (the "static / no motion"
// failure). This is the objective, no-taste check across the SEQUENCE: if consecutive frames are ~identical,
// nothing is animating. Motion presence ≠ good motion (that's the judge's job), but a frozen render is broken.

/** Minimum mean frame-to-frame change (0-1, all channels incl alpha) for the render to count as ANIMATED. Below
 *  this the graphic is effectively frozen. ⚠ craft-tuned — calibrate on real static-vs-animated renders. */
export const MIN_MG_MOTION_PRESENCE = 0.004;

/** PURE: given a measured motion score, decide pass/fail. Unit-testable with a synthetic number, no rendering. */
export function evaluateMgMotionPresence(
  motion: number,
  min: number = MIN_MG_MOTION_PRESENCE,
): { pass: boolean; reasons: string[] } {
  if (!(motion >= min)) {
    return { pass: false, reasons: [`the graphic barely moves (motion ${motion.toFixed(4)} < ${min}) — a static/frozen render`] };
  }
  return { pass: true, reasons: [] };
}

/**
 * IMPURE: mean frame-to-frame change across the sequence (0-1). Samples up to `maxSamples` evenly-spaced frames,
 * downscales each to a tiny RGBA thumbnail, and averages the mean absolute per-channel delta between consecutive
 * samples (alpha included, so a fade counts as motion). Near-0 = the frames are ~identical = nothing animates.
 * Needs >= 2 frames; returns 0 for fewer (a single-frame "sequence" can't be judged for motion).
 */
export async function measureMgMotionPresence(
  frames: Buffer[],
  opts: { maxSamples?: number; sampleWidth?: number } = {},
): Promise<number> {
  if (frames.length < 2) return 0;
  const width = opts.sampleWidth ?? 48;
  const n = Math.min(Math.max(2, opts.maxSamples ?? 6), frames.length);
  const idxs = Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (frames.length - 1)));
  const thumbs: Buffer[] = [];
  for (const i of idxs) {
    const { data } = await sharp(frames[i]).ensureAlpha().resize({ width, fit: 'fill', kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
    thumbs.push(data);
  }
  let total = 0;
  let comparisons = 0;
  for (let k = 1; k < thumbs.length; k += 1) {
    const a = thumbs[k - 1];
    const b = thumbs[k];
    const len = Math.min(a.length, b.length);
    if (!len) continue;
    let sum = 0;
    for (let j = 0; j < len; j += 1) sum += Math.abs(a[j] - b[j]);
    total += sum / len / 255;
    comparisons += 1;
  }
  return comparisons ? total / comparisons : 0;
}

/** Measure motion across the rendered sequence + apply the floor check. */
export async function mgMotionPresenceGate(
  frames: Buffer[],
  min: number = MIN_MG_MOTION_PRESENCE,
): Promise<{ pass: boolean; reasons: string[]; motion: number }> {
  const motion = await measureMgMotionPresence(frames);
  return { ...evaluateMgMotionPresence(motion, min), motion };
}
