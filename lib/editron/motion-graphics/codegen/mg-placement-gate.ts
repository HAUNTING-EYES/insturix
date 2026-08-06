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

/** Minimum MEAN frame-to-frame change (0-1) for the render to count as continuously animated. ⚠ craft-tuned. */
export const MIN_MG_MOTION_PRESENCE = 0.004;

/** Minimum PEAK single-interval change proving a real BUILD occurred (an entrance/assembly). A build-then-hold
 *  render (professional restraint: elements enter, then hold calm) can land its MEAN just under
 *  MIN_MG_MOTION_PRESENCE because the calm hold dominates the sampled intervals — yet it is NOT frozen; it
 *  built, and whether the hold is TOO calm is the judge's taste call, not the floor's. A render clearing this
 *  peak passes the floor and goes to the judge; a truly frozen render has ~0 in EVERY interval, so it clears
 *  neither. Calibrated on REAL renders (calibrate-motion, 2026-07-18): frozen control peak = 0.0000; intended
 *  build-then-hold control peak = 0.0154; modest-but-real coder builds = 0.0069–0.0080; timid/under-built =
 *  0.0038. 0.006 sits above the timid floor and below the modest real builds — only genuine builds pass. */
export const MIN_MG_MOTION_BUILD = 0.006;

/** PURE (mean-only, retained): decide pass/fail from a single mean score. Kept for callers/tests that only have
 *  the mean. Prefer evaluateMgMotionProfile, which also credits a build peak. */
export function evaluateMgMotionPresence(
  motion: number,
  min: number = MIN_MG_MOTION_PRESENCE,
): { pass: boolean; reasons: string[] } {
  if (!(motion >= min)) {
    return { pass: false, reasons: [`the graphic barely moves (motion ${motion.toFixed(4)} < ${min}) — a static/frozen render`] };
  }
  return { pass: true, reasons: [] };
}

/** PURE: a render is ANIMATED (not frozen/broken) if it SUSTAINS motion (median interval delta ≥ minMean —
 *  a single spike cannot carry a median, so a frozen clip with one exit flash reads 0) OR it BUILT at least
 *  once inside the build window (peak ≥ minBuild). Only calm-everywhere AND never-built is rejected.
 *  `sustained` falls back to `mean` for legacy callers that only measured a mean. */
export function evaluateMgMotionProfile(
  profile: { mean: number; peak: number; sustained?: number },
  minMean: number = MIN_MG_MOTION_PRESENCE,
  minBuild: number = MIN_MG_MOTION_BUILD,
): { pass: boolean; reasons: string[] } {
  const sustained = profile.sustained ?? profile.mean;
  if (sustained >= minMean || profile.peak >= minBuild) return { pass: true, reasons: [] };
  return { pass: false, reasons: [`the graphic never moves (sustained ${sustained.toFixed(4)} < ${minMean} and peak build ${profile.peak.toFixed(4)} < ${minBuild}) — a static/frozen render; give it a real entrance/build`] };
}

/**
 * IMPURE: motion profile across the sequence — { mean, peak } of the per-interval mean-absolute per-channel
 * delta (0-1, alpha included so a fade counts). Samples up to `maxSamples` evenly-spaced frames, downscales
 * each to a tiny RGBA thumbnail, and compares consecutive samples. Deltas are normalized over the union of
 * VISIBLE graphic pixels, not the whole transparent canvas: otherwise identical motion on a compact overlay is
 * diluted below the floor while a full-frame graphic passes. Premultiplied RGB prevents hidden colour in fully
 * transparent pixels from faking motion. `mean` = continuous-motion signal; `peak` = the single biggest interval,
 * the "did it ever build" signal. Needs >= 2 frames; {0,0} for fewer.
 */
export async function measureMgMotionProfile(
  frames: Buffer[],
  opts: { maxSamples?: number; sampleWidth?: number } = {},
): Promise<{ mean: number; peak: number; sustained: number }> {
  if (frames.length < 2) return { mean: 0, peak: 0, sustained: 0 };
  const width = opts.sampleWidth ?? 48;
  const n = Math.min(Math.max(2, opts.maxSamples ?? 6), frames.length);
  const idxs = Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (frames.length - 1)));
  const thumbs: Array<{ data: Buffer; channels: number }> = [];
  for (const i of idxs) {
    const { data, info } = await sharp(frames[i])
      .ensureAlpha()
      .resize({ width, fit: 'fill', kernel: 'nearest' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    thumbs.push({ data, channels: info.channels });
  }
  // The BUILD peak only counts intervals ending before the exit segment begins (choreo: resolve = durF×0.84,
  // the scene releases after it). Without this cut, a frozen render with ONLY a fade-out spikes the final
  // interval and games the build credit (external audit repro, 2026-07-19: 5 identical frames + 1 transparent
  // exit frame → peak 1.0 → wrongly passed). An exit is a departure, not a build.
  const buildCutoff = 0.84 * (frames.length - 1);
  let total = 0;
  let peak = 0;
  const deltas: number[] = [];
  for (let k = 1; k < thumbs.length; k += 1) {
    const a = thumbs[k - 1];
    const b = thumbs[k];
    const channels = Math.min(a.channels, b.channels);
    const pixels = Math.floor(Math.min(a.data.length / a.channels, b.data.length / b.channels));
    if (!pixels || channels < 4) continue;
    let sum = 0;
    let comparedChannels = 0;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const aOffset = pixel * a.channels;
      const bOffset = pixel * b.channels;
      const aAlpha = a.data[aOffset + a.channels - 1];
      const bAlpha = b.data[bOffset + b.channels - 1];
      if (Math.max(aAlpha, bAlpha) <= DEFAULT_MG_RENDER_SANITY_THRESHOLDS.faintAlpha) continue;

      const aWeight = aAlpha / 255;
      const bWeight = bAlpha / 255;
      for (let channel = 0; channel < channels - 1; channel += 1) {
        sum += Math.abs(a.data[aOffset + channel] * aWeight - b.data[bOffset + channel] * bWeight);
        comparedChannels += 1;
      }
      sum += Math.abs(aAlpha - bAlpha);
      comparedChannels += 1;
    }
    const delta = comparedChannels ? sum / comparedChannels / 255 : 0;
    total += delta;
    deltas.push(delta);
    if (idxs[k] <= buildCutoff && delta > peak) peak = delta;
  }
  // sustained = MEDIAN interval delta: one big flash (an exit fade on an otherwise frozen clip) cannot carry
  // a median the way it inflates the mean (audit repro 2026-07-19: frozen+exit read mean 0.15, median 0).
  const sorted = [...deltas].sort((x, y) => x - y);
  const sustained = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  return { mean: deltas.length ? total / deltas.length : 0, peak, sustained };
}

/** IMPURE (mean-only, retained for existing callers/tests): the MEAN interval change across the sequence. */
export async function measureMgMotionPresence(
  frames: Buffer[],
  opts: { maxSamples?: number; sampleWidth?: number } = {},
): Promise<number> {
  return (await measureMgMotionProfile(frames, opts)).mean;
}

/** Measure motion across the rendered sequence + apply the floor check (sustained OR a real build). */
export async function mgMotionPresenceGate(
  frames: Buffer[],
  min: number = MIN_MG_MOTION_PRESENCE,
): Promise<{ pass: boolean; reasons: string[]; motion: number; peak: number }> {
  const profile = await measureMgMotionProfile(frames);
  return { ...evaluateMgMotionProfile(profile, min), motion: profile.mean, peak: profile.peak };
}
