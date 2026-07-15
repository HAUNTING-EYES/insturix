/**
 * MG placement gate (Phase A) — the DETERMINISTIC "don't obscure the footage" check.
 *
 * WHY: the codegen pipeline accepts a graphic on a single VLM score (bar 7.5). The investigation found that
 * placement is 100% suggestion — the scan enforces NO geometry, so a full-frame centered box is legal, and the
 * judge waves it through. This gate replaces taste with measurement for the properties that are COMPUTABLE from
 * the rendered alpha: how much of the frame the graphic covers, whether it sits on the subject, whether it
 * overlaps the caption band, and whether it bleeds outside title-safe. A failed check forces revision/decline,
 * regardless of the judge's number.
 *
 * The PRINCIPLES are sourced from the creative knowledge graph (the codegen never consumed them):
 *   - caption clearance  ← constraint:overlay.graphic_in_caption_zone (caption = bottom 15-25%)
 *   - title-safe         ← constant:safe_zone.title_safe (center 90%, SMPTE ST 2046-1)
 *   - subject clearance  ← constraint:overlay + placement engine's subject box ("don't cover the subject")
 * The TOLERANCES (how much overlap trips a fail) are calibration knobs, marked ⚠ below — the graph gives the
 * rule, not the tolerance. Contrast (WCAG) and the 72px font floor need the footage / component and land in a
 * follow-up (they can't be read from the graphic's alpha alone).
 */

import sharp from 'sharp';

/** A rectangle in frame fractions [0,1]. */
export interface MgGateRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MgAlphaMetrics {
  /** Opaque (visible) pixels / total pixels — how much of the frame the graphic paints. */
  coverageFrac: number;
  /** Bounding box of the opaque pixels (fractions), or null if the component rendered nothing. */
  bbox: MgGateRegion | null;
  /** Opaque pixels inside the subject box / subject box area — how much of the subject is covered. */
  subjectOverlapFrac: number;
  /** Opaque pixels inside the caption band / caption band area. */
  captionOverlapFrac: number;
  /** Opaque pixels outside title-safe / total opaque — how much of the graphic risks being cropped. */
  marginBleedFrac: number;
}

export interface MgGateThresholds {
  maxCoverageFrac: number;
  maxSubjectOverlapFrac: number;
  maxCaptionOverlapFrac: number;
  maxMarginBleedFrac: number;
  /** Top of the caption band (fraction of height). Graph: caption = bottom 15-25% → guard the bottom 20%. */
  captionBandTop: number;
  /** Title-safe margin (fraction). Graph: center 90% → 5% margins. */
  titleSafeMargin: number;
  /** Alpha value (0-255) at/below which a pixel is treated as transparent. */
  opaqueThreshold: number;
}

export const DEFAULT_MG_GATE_THRESHOLDS: MgGateThresholds = {
  // ⚠ INVENTED (calibration-pending): the graph has NO "graphic too big" constraint. This is a generous sanity
  //   ceiling so a full-frame swamp fails; tune down against the first batch of human-accepted MGs.
  maxCoverageFrac: 0.55,
  // ⚠ calibration: graph constraint:overlay says "don't cover the subject" (qualitative). A graphic edge grazing
  //   the box is fine; painting over the person/product is not.
  maxSubjectOverlapFrac: 0.15,
  // ⚠ calibration: graph constraint:overlay.graphic_in_caption_zone flags "any spatial overlap" — too strict for
  //   a pixel; tolerate a sliver, fail a real intrusion.
  maxCaptionOverlapFrac: 0.10,
  // graph constant:safe_zone.title_safe = center 90%; a little bleed is tolerated, a lot means cropping.
  maxMarginBleedFrac: 0.03,
  captionBandTop: 0.80, // graph: caption zone bottom 15-25%
  titleSafeMargin: 0.05, // graph: 5% margins (center 90%)
  opaqueThreshold: 32, // alpha > 32/255 counts as visible (ignores near-transparent anti-alias fringe)
};

export interface MgPlacementGateResult {
  pass: boolean;
  reasons: string[];
  metrics: MgAlphaMetrics;
}

/**
 * PURE: given measured alpha metrics + thresholds, decide pass/fail with human-readable reasons.
 * This is the whole verdict logic — unit-tested with synthetic metrics, no rendering needed.
 */
export function evaluateMgPlacement(
  m: MgAlphaMetrics,
  t: MgGateThresholds = DEFAULT_MG_GATE_THRESHOLDS,
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (m.bbox === null || m.coverageFrac <= 0) {
    reasons.push('the component rendered no visible pixels');
    return { pass: false, reasons };
  }
  if (m.coverageFrac > t.maxCoverageFrac) {
    reasons.push(`covers ${pct(m.coverageFrac)} of the frame (max ${pct(t.maxCoverageFrac)}) — the graphic swamps the footage`);
  }
  if (m.subjectOverlapFrac > t.maxSubjectOverlapFrac) {
    reasons.push(`paints over ${pct(m.subjectOverlapFrac)} of the subject (max ${pct(t.maxSubjectOverlapFrac)}) — obscures the person/product`);
  }
  if (m.captionOverlapFrac > t.maxCaptionOverlapFrac) {
    reasons.push(`intrudes ${pct(m.captionOverlapFrac)} into the caption band (max ${pct(t.maxCaptionOverlapFrac)}) — two competing reading tasks`);
  }
  if (m.marginBleedFrac > t.maxMarginBleedFrac) {
    reasons.push(`${pct(m.marginBleedFrac)} of the graphic sits outside title-safe (max ${pct(t.maxMarginBleedFrac)}) — will be cropped on some platforms`);
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * IMPURE: measure ONE rendered alpha frame against the placement regions. Downsamples first (coverage/overlap
 * fractions are scale-invariant) so the per-pixel pass is fast even for 1080p frames.
 */
export async function measureMgAlpha(
  frame: Buffer,
  opts: {
    subject?: MgGateRegion | null;
    captionBandTop?: number;
    titleSafeMargin?: number;
    opaqueThreshold?: number;
    sampleWidth?: number;
  } = {},
): Promise<MgAlphaMetrics> {
  const captionTop = opts.captionBandTop ?? DEFAULT_MG_GATE_THRESHOLDS.captionBandTop;
  const margin = opts.titleSafeMargin ?? DEFAULT_MG_GATE_THRESHOLDS.titleSafeMargin;
  const opaqueAt = opts.opaqueThreshold ?? DEFAULT_MG_GATE_THRESHOLDS.opaqueThreshold;
  const subj = opts.subject ?? null;

  // Downsample to a bounded width (default 256px) — fractions are invariant, and 1080p per-pixel in JS is slow.
  const target = opts.sampleWidth ?? 256;
  const { data, info } = await sharp(frame)
    .ensureAlpha()
    .resize({ width: target, fit: 'fill', kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaIdx = channels - 1;

  let opaque = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let subjOpaque = 0;
  let capOpaque = 0;
  let marginOpaque = 0;

  const subjArea = subj
    ? Math.max(1, Math.round(subj.width * width) * Math.round(subj.height * height))
    : 1;
  const capArea = Math.max(1, Math.round((1 - captionTop) * height) * width);

  for (let y = 0; y < height; y += 1) {
    const fy = y / height;
    const inCaption = fy >= captionTop;
    const yMargin = fy < margin || fy > 1 - margin;
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * channels + alphaIdx];
      if (a <= opaqueAt) continue;
      opaque += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const fx = x / width;
      if (subj && fx >= subj.x && fx < subj.x + subj.width && fy >= subj.y && fy < subj.y + subj.height) subjOpaque += 1;
      if (inCaption) capOpaque += 1;
      if (yMargin || fx < margin || fx > 1 - margin) marginOpaque += 1;
    }
  }

  const total = width * height;
  const bbox: MgGateRegion | null = maxX < 0
    ? null
    : { x: minX / width, y: minY / height, width: (maxX - minX + 1) / width, height: (maxY - minY + 1) / height };

  return {
    coverageFrac: opaque / total,
    bbox,
    subjectOverlapFrac: subj ? Math.min(1, subjOpaque / subjArea) : 0,
    captionOverlapFrac: Math.min(1, capOpaque / capArea),
    marginBleedFrac: opaque ? marginOpaque / opaque : 0,
  };
}

/** Measure a rendered alpha frame + apply the gate. The seam calls this on a settled-hold frame. */
export async function mgPlacementGate(
  frame: Buffer,
  regions: { subject?: MgGateRegion | null },
  thresholds: MgGateThresholds = DEFAULT_MG_GATE_THRESHOLDS,
): Promise<MgPlacementGateResult> {
  const metrics = await measureMgAlpha(frame, {
    subject: regions.subject,
    captionBandTop: thresholds.captionBandTop,
    titleSafeMargin: thresholds.titleSafeMargin,
    opaqueThreshold: thresholds.opaqueThreshold,
  });
  return { ...evaluateMgPlacement(metrics, thresholds), metrics };
}
