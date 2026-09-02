import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionProxyReceiptV1 }
  from './generated-composition-proxy-renderer-v1';

export const STAGE25_RHC03_RENDERED_VISUAL_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC03_RENDERED_VISUAL_PROOF_V1' as const;

export const STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1 = deepFreezeV1({
  policyId: 'EDITRON_OE_STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1',
  taskId: 'RHC-03',
  requiredFrames: [0, 1, 74, 149] as const,
  thresholds: {
    minimumPanelVariance: 50,
    minimumDistinctViewDifference: 0.01,
    minimumGlyphPixels: 100,
    minimumGlyphClearanceFromPanelPx: 24,
    maximumGlyphCenterOffsetPx: 8,
    minimumContrastRatio: 4.5,
  },
  knowledgeGraphBindings: [
    'intent:authority.safe_zone_enforcement',
    'constant:safe_zone.action_safe',
    'constant:safe_zone.title_safe',
    'constant:typography.callout_label_min_font',
    'constraint:accessibility.text_contrast_failure',
    'theory:structure.versus_comparison',
  ] as const,
} as const);

export interface Stage25Rhc03VisualLayoutContractV1 {
  canvas: Readonly<{ width: number; height: number }>;
  leftPanelBounds: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  rightPanelBounds: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  conservativeTrackedSubjectRegions: readonly Readonly<{
    view: 'LEFT' | 'RIGHT';
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>[];
  centeredLabelGap: Readonly<{ left: number; right: number }>;
  label: Readonly<{
    text: string;
    defaultFontSizePx: number;
    minimumFontSizePx: number;
    foreground: string;
    background: string;
    minimumContrastRatio: number;
    defaultContrastRatio: number;
    renderedGlyphBoundsProof: string;
  }>;
  knowledgeGraphBindings: readonly string[];
  danglingKnowledgeGraphEdgeExcluded: string;
}

interface LoadedFrame {
  frame: number;
  data: Buffer;
  width: number;
  height: number;
}

interface PixelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Measures only RHC03's rendered, objective visual predicates. It does not
 * score taste, choose a layout, or promote the candidate.
 */
export async function evaluateStage25Rhc03RenderedVisualProofV1(input: {
  proxyReceipt: Readonly<GeneratedCompositionProxyReceiptV1>;
  authoritativeProxyReceiptSha256: string;
  expectedProgramSha256: string;
  layoutContract: Readonly<Stage25Rhc03VisualLayoutContractV1>;
}) {
  assertSha(input.authoritativeProxyReceiptSha256, 'AUTHORITATIVE_PROXY_RECEIPT');
  assertSha(input.expectedProgramSha256, 'EXPECTED_PROGRAM');
  assertLayoutContract(input.layoutContract);
  const proxy = input.proxyReceipt;
  const { receiptHash, ...proxyMaterial } = proxy;
  if (receiptHash !== hashCanonicalJsonV1(proxyMaterial)
    || proxy.programHash !== input.expectedProgramSha256
    || proxy.composition.width !== input.layoutContract.canvas.width
    || proxy.composition.height !== input.layoutContract.canvas.height
    || proxy.composition.fps !== 30
    || proxy.composition.durationInFrames !== 150
    || !proxy.playableProxy
    || proxy.playableProxy.audio !== 'ABSENT') {
    fail('PROXY_RECEIPT_BINDING_DRIFT');
  }
  const frameSchedule = proxy.stills.map(({ frame }) => frame);
  if (JSON.stringify(frameSchedule)
    !== JSON.stringify(STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.requiredFrames)) {
    fail('PROOF_FRAME_SCHEDULE_DRIFT');
  }

  const frames: LoadedFrame[] = [];
  for (const still of proxy.stills) {
    const bytes = await readFile(still.path);
    if (sha256(bytes) !== still.sha256) fail(`STILL_HASH_DRIFT:${still.frame}`);
    const decoded = await sharp(bytes).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== input.layoutContract.canvas.width
      || decoded.info.height !== input.layoutContract.canvas.height
      || decoded.info.channels !== 3) {
      fail(`STILL_DIMENSION_DRIFT:${still.frame}`);
    }
    frames.push({
      frame: still.frame,
      data: decoded.data,
      width: decoded.info.width,
      height: decoded.info.height,
    });
  }

  const measurements = frames.map((frame) => measureFrame(
    frame,
    input.layoutContract,
  ));
  const glyphBoundsIdentity = hashCanonicalJsonV1(
    measurements.map(({ glyphBounds }) => glyphBounds),
  );
  if (new Set(measurements.map(({ glyphBounds }) =>
    JSON.stringify(glyphBounds))).size !== 1) {
    fail('GLYPH_BOUNDS_TEMPORAL_DRIFT');
  }
  const portable = {
    version: STAGE25_RHC03_RENDERED_VISUAL_PROOF_VERSION_V1,
    artifactType: 'Stage25Rhc03RenderedVisualProofReceiptV1' as const,
    authority: 'RHC03_OBJECTIVE_RENDERED_VISUAL_MEASUREMENT_ONLY' as const,
    taskId: 'RHC-03' as const,
    policyId: STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.policyId,
    authoritativeProxyReceiptSha256: input.authoritativeProxyReceiptSha256,
    localizedProxyReceiptSha256: receiptHash,
    programSha256: proxy.programHash,
    layoutContractSha256: hashCanonicalJsonV1(input.layoutContract),
    measurements,
    proof: {
      requiredFramesCaptured: 'PASS' as const,
      twoDistinctViewsVisible: 'PASS' as const,
      renderedGlyphBoundsMeasured: 'PASS' as const,
      glyphBoundsStableAcrossFrames: 'PASS' as const,
      labelOutsideConservativeSubjectRegions: 'PASS' as const,
      labelMinimumSizeContractBound: 'PASS' as const,
      renderedContrast: 'PASS' as const,
      glyphBoundsIdentity,
      humanAestheticQuality: 'UNJUDGED' as const,
    },
    technicalDisposition: 'PASS' as const,
    creativeDisposition: 'UNJUDGED' as const,
    projectStateEffects: [] as const,
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
  });
}

export type Stage25Rhc03RenderedVisualProofReceiptV1 = Awaited<
  ReturnType<typeof evaluateStage25Rhc03RenderedVisualProofV1>
>;

function measureFrame(
  frame: Readonly<LoadedFrame>,
  layout: Readonly<Stage25Rhc03VisualLayoutContractV1>,
) {
  const left = insetRegion(frame, layout.leftPanelBounds, 15);
  const right = insetRegion(frame, layout.rightPanelBounds, 15);
  if (left.width !== right.width || left.height !== right.height) {
    fail(`PANEL_MEASUREMENT_GEOMETRY_DRIFT:${frame.frame}`);
  }
  const leftVariance = regionVariance(frame, left);
  const rightVariance = regionVariance(frame, right);
  const distinctViewDifference = regionDifference(frame, left, right);
  const thresholds = STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.thresholds;
  if (leftVariance < thresholds.minimumPanelVariance
    || rightVariance < thresholds.minimumPanelVariance
    || distinctViewDifference < thresholds.minimumDistinctViewDifference) {
    fail(`TWO_VIEW_RENDER_PROOF_FAILED:${frame.frame}`);
  }

  const gapLeft = Math.ceil(layout.centeredLabelGap.left * frame.width);
  const gapRightExclusive = Math.floor(
    layout.centeredLabelGap.right * frame.width,
  );
  const glyphBounds = findGlyphBounds(frame, {
    left: gapLeft,
    rightExclusive: gapRightExclusive,
    top: Math.floor(frame.height * 0.4),
    bottomExclusive: Math.ceil(frame.height * 0.6),
  });
  const glyphClearanceFromPanelPx = Math.min(
    glyphBounds.left - gapLeft,
    gapRightExclusive - 1 - glyphBounds.right,
  );
  const glyphCenterOffsetPx = Math.abs(glyphBounds.centerX - frame.width / 2);
  const titleSafe = {
    left: frame.width * 0.05,
    right: frame.width * 0.95,
    top: frame.height * 0.05,
    bottom: frame.height * 0.95,
  };
  const outsideSubjects = layout.conservativeTrackedSubjectRegions.every(
    (region) => glyphBounds.right < region.left * frame.width
      || glyphBounds.left >= region.right * frame.width
      || glyphBounds.bottom < region.top * frame.height
      || glyphBounds.top >= region.bottom * frame.height,
  );
  if (glyphClearanceFromPanelPx
      < thresholds.minimumGlyphClearanceFromPanelPx
    || glyphCenterOffsetPx > thresholds.maximumGlyphCenterOffsetPx
    || glyphBounds.left < titleSafe.left || glyphBounds.right > titleSafe.right
    || glyphBounds.top < titleSafe.top || glyphBounds.bottom > titleSafe.bottom
    || !outsideSubjects) {
    fail(`LABEL_SAFE_ZONE_FAILED:${frame.frame}`);
  }

  const background = modalBackground(frame, gapLeft, gapRightExclusive);
  const expectedBackground = hexRgb(layout.label.background);
  const contrastRatio = contrast(
    hexRgb(layout.label.foreground),
    background,
  );
  if (background.some((value, index) => value !== expectedBackground[index])
    || contrastRatio < layout.label.minimumContrastRatio
    || contrastRatio < thresholds.minimumContrastRatio) {
    fail(`LABEL_CONTRAST_FAILED:${frame.frame}`);
  }
  return {
    frame: frame.frame,
    leftPanelVariance: round(leftVariance),
    rightPanelVariance: round(rightVariance),
    distinctViewNormalizedDifference: round(distinctViewDifference),
    glyphBounds,
    glyphClearanceFromPanelPx,
    glyphCenterOffsetPx: round(glyphCenterOffsetPx),
    detectedBackgroundSrgb: rgbHex(background),
    contrastRatio: round(contrastRatio),
    conservativeSubjectOverlapPixels: 0 as const,
    disposition: 'PASS' as const,
  };
}

function findGlyphBounds(frame: Readonly<LoadedFrame>, region: {
  left: number;
  rightExclusive: number;
  top: number;
  bottomExclusive: number;
}): PixelBounds {
  let left = frame.width;
  let right = -1;
  let top = frame.height;
  let bottom = -1;
  let pixels = 0;
  for (let y = region.top; y < region.bottomExclusive; y += 1) {
    for (let x = region.left; x < region.rightExclusive; x += 1) {
      const offset = (y * frame.width + x) * 3;
      const red = frame.data[offset]!;
      const green = frame.data[offset + 1]!;
      const blue = frame.data[offset + 2]!;
      if (red < 180 || green < 180 || blue < 180
        || Math.max(red, green, blue) - Math.min(red, green, blue) > 30) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      pixels += 1;
    }
  }
  if (pixels
    < STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.thresholds.minimumGlyphPixels
    || right < left || bottom < top) {
    fail(`LABEL_GLYPHS_MISSING:${frame.frame}`);
  }
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function insetRegion(
  frame: Readonly<LoadedFrame>,
  bounds: Readonly<{ left: number; top: number; width: number; height: number }>,
  inset: number,
) {
  const left = Math.round(bounds.left * frame.width) + inset;
  const top = Math.round(bounds.top * frame.height) + inset;
  const width = Math.floor(bounds.width * frame.width) - inset * 2;
  const height = Math.floor(bounds.height * frame.height) - inset * 2;
  const rightExclusive = left + width;
  const bottomExclusive = top + height;
  return {
    left,
    top,
    rightExclusive,
    bottomExclusive,
    width,
    height,
  };
}

function regionVariance(
  frame: Readonly<LoadedFrame>,
  region: ReturnType<typeof insetRegion>,
): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = region.top; y < region.bottomExclusive; y += 1) {
    for (let x = region.left; x < region.rightExclusive; x += 1) {
      const offset = (y * frame.width + x) * 3;
      const value = (
        frame.data[offset]!
        + frame.data[offset + 1]!
        + frame.data[offset + 2]!
      ) / 3;
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

function regionDifference(
  frame: Readonly<LoadedFrame>,
  left: ReturnType<typeof insetRegion>,
  right: ReturnType<typeof insetRegion>,
): number {
  let total = 0;
  let samples = 0;
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const leftOffset = ((left.top + y) * frame.width + left.left + x) * 3;
      const rightOffset = ((right.top + y) * frame.width + right.left + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        total += Math.abs(
          frame.data[leftOffset + channel]!
          - frame.data[rightOffset + channel]!,
        );
        samples += 1;
      }
    }
  }
  return total / samples / 255;
}

function modalBackground(
  frame: Readonly<LoadedFrame>,
  left: number,
  rightExclusive: number,
): readonly [number, number, number] {
  const counts = new Map<number, number>();
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = left; x < rightExclusive; x += 1) {
      const offset = (y * frame.width + x) * 3;
      const key = (frame.data[offset]! << 16)
        | (frame.data[offset + 1]! << 8)
        | frame.data[offset + 2]!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let mode = -1;
  let modeCount = 0;
  for (const [key, count] of counts) {
    if (count > modeCount) {
      mode = key;
      modeCount = count;
    }
  }
  if (mode < 0 || modeCount < frame.height * (rightExclusive - left) * 0.8) {
    fail(`LABEL_BACKGROUND_NOT_UNIFORM:${frame.frame}`);
  }
  return [(mode >> 16) & 255, (mode >> 8) & 255, mode & 255] as const;
}

function contrast(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(rgb: readonly [number, number, number]): number {
  const channels = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]!
    + 0.0722 * channels[2]!;
}

function hexRgb(value: string): readonly [number, number, number] {
  const match = /^#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/
    .exec(value);
  if (!match) fail('LABEL_FOREGROUND_INVALID');
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2]!, 16),
    Number.parseInt(match[3]!, 16),
  ] as const;
}

function rgbHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`
    .toUpperCase();
}

function assertLayoutContract(
  layout: Readonly<Stage25Rhc03VisualLayoutContractV1>,
): void {
  const expected = {
    canvas: { width: 1920, height: 1080 },
    leftPanelBounds: { left: 0.04, top: 0.04, width: 0.41, height: 0.92 },
    rightPanelBounds: { left: 0.55, top: 0.04, width: 0.41, height: 0.92 },
    centeredLabelGap: { left: 0.45, right: 0.55 },
  };
  if (JSON.stringify(layout.canvas) !== JSON.stringify(expected.canvas)
    || JSON.stringify(layout.leftPanelBounds)
      !== JSON.stringify(expected.leftPanelBounds)
    || JSON.stringify(layout.rightPanelBounds)
      !== JSON.stringify(expected.rightPanelBounds)
    || JSON.stringify(layout.centeredLabelGap)
      !== JSON.stringify(expected.centeredLabelGap)
    || layout.conservativeTrackedSubjectRegions.length !== 2
    || layout.label.text !== 'SYNC'
    || layout.label.defaultFontSizePx !== 40
    || layout.label.minimumFontSizePx !== 36
    || layout.label.foreground !== '#FFFFFF'
    || layout.label.background !== '#05070A'
    || layout.label.minimumContrastRatio !== 4.5
    || layout.label.renderedGlyphBoundsProof !== 'REQUIRED_AFTER_RENDER'
    || JSON.stringify(layout.knowledgeGraphBindings)
      !== JSON.stringify(
        STAGE25_RHC03_RENDERED_VISUAL_POLICY_V1.knowledgeGraphBindings,
      )
    || layout.danglingKnowledgeGraphEdgeExcluded
      !== 'technique:layout.split_screen') {
    fail('LAYOUT_CONTRACT_DRIFT');
  }
}

function round(value: number): number { return Number(value.toFixed(6)); }
function assertSha(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) fail(`${code}_SHA_INVALID`);
}
function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function fail(code: string): never {
  throw new Error(`STAGE25_RHC03_RENDERED_VISUAL_${code}`);
}
