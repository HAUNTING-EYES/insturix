import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { GeneratedCompositionProxyReceiptV1 }
  from './generated-composition-proxy-renderer-v1';

export const STAGE25_RHC04_RENDERED_CORRECTION_PROOF_VERSION_V1 =
  'EDITRON_OE_STAGE25_RHC04_RENDERED_CORRECTION_PROOF_V1' as const;

export const STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1 = deepFreezeV1({
  policyId: 'EDITRON_OE_STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1',
  taskId: 'RHC-04',
  requiredFrames: [0, 44, 45, 89, 90, 104, 105, 179] as const,
  thresholds: {
    minimumPanelVariance: 5,
    minimumGlyphPixels: 500,
    maximumGlyphCenterOffsetPx: 12,
    minimumContrastRatio: 4.5,
  },
  knowledgeGraphBindings: [
    'mapping:entity.quantitative_claim',
    'technique:graphic.stat_counter',
    'constant:typography.stat_counter_min_font',
    'constant:animation.full_title_card',
    'intent:authority.safe_zone_enforcement',
    'constraint:accessibility.text_contrast_failure',
  ] as const,
} as const);

interface LoadedFrame {
  variant: 'INITIAL' | 'CORRECTED';
  frame: number;
  data: Buffer;
  width: number;
  height: number;
  rawSha256: string;
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
  pixels: number;
}

export interface Stage25Rhc04RenderedLayoutContractV1 {
  canvas: Readonly<{ width: number; height: number }>;
  panelBounds: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  numerals: Readonly<{
    fontSizePx: number;
    minimumFontSizePx: number;
    foreground: string;
    minimumContrastRatio: number;
  }>;
  knowledgeGraphBindings: readonly string[];
}

export async function evaluateStage25Rhc04RenderedCorrectionProofV1(input: {
  initialProxyReceipt: Readonly<GeneratedCompositionProxyReceiptV1>;
  correctedProxyReceipt: Readonly<GeneratedCompositionProxyReceiptV1>;
  authoritativeInitialProxyReceiptSha256: string;
  authoritativeCorrectedProxyReceiptSha256: string;
  expectedInitialProgramSha256: string;
  expectedCorrectedProgramSha256: string;
  layoutContract: Readonly<Stage25Rhc04RenderedLayoutContractV1>;
  sourceContrast: readonly Readonly<{
    assetId: string;
    minimumWhiteContrastRatio: number;
  }>[];
}) {
  assertSha(input.authoritativeInitialProxyReceiptSha256, 'INITIAL_PROXY_RECEIPT');
  assertSha(input.authoritativeCorrectedProxyReceiptSha256, 'CORRECTED_PROXY_RECEIPT');
  assertSha(input.expectedInitialProgramSha256, 'INITIAL_PROGRAM');
  assertSha(input.expectedCorrectedProgramSha256, 'CORRECTED_PROGRAM');
  assertLayoutContract(input.layoutContract);
  const sourceContrast = assertSourceContrast(input.sourceContrast);
  assertProxy(
    input.initialProxyReceipt,
    input.expectedInitialProgramSha256,
    'INITIAL',
  );
  assertProxy(
    input.correctedProxyReceipt,
    input.expectedCorrectedProgramSha256,
    'CORRECTED',
  );

  const initialFrames = await loadFrames(input.initialProxyReceipt, 'INITIAL');
  const correctedFrames = await loadFrames(input.correctedProxyReceipt, 'CORRECTED');
  const allFrames = [...initialFrames, ...correctedFrames];
  const measurements = allFrames.map((frame) => measureFrame(
    frame,
    input.layoutContract,
    sourceContrast,
  ));
  const frameIdentity = assertCorrectionFrameIdentity(initialFrames, correctedFrames);
  const portable = {
    version: STAGE25_RHC04_RENDERED_CORRECTION_PROOF_VERSION_V1,
    artifactType: 'Stage25Rhc04RenderedCorrectionProofReceiptV1' as const,
    authority: 'RHC04_OBJECTIVE_RENDERED_CORRECTION_MEASUREMENT_ONLY' as const,
    taskId: 'RHC-04' as const,
    policyId: STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.policyId,
    authoritativeProxyReceipts: {
      initialSha256: input.authoritativeInitialProxyReceiptSha256,
      correctedSha256: input.authoritativeCorrectedProxyReceiptSha256,
    },
    localizedProxyReceipts: {
      initialSha256: input.initialProxyReceipt.receiptHash,
      correctedSha256: input.correctedProxyReceipt.receiptHash,
    },
    programSha256: {
      initial: input.initialProxyReceipt.programHash,
      corrected: input.correctedProxyReceipt.programHash,
    },
    layoutContractSha256: hashCanonicalJsonV1(input.layoutContract),
    measurements,
    frameIdentity,
    proof: {
      requiredBoundaryFramesCaptured: 'PASS' as const,
      initialPairingsVisiblyDistinct: 'PASS' as const,
      correctedPairingsVisiblyDistinct: 'PASS' as const,
      initialFinal10HoldSampled: 'PASS' as const,
      correctedFinal10HoldSampled: 'PASS' as const,
      unrelated60StateExactAcrossCorrection: 'PASS' as const,
      overlappingFinal10StateExactAcrossCorrection: 'PASS' as const,
      declaredCorrectionRegionChanged: 'PASS' as const,
      renderedGlyphBoundsMeasured: 'PASS' as const,
      sourcePixelsVisible: 'PASS' as const,
      minimumFontSizeContractBound: 'PASS' as const,
      conservativeContrast: 'PASS' as const,
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

export type Stage25Rhc04RenderedCorrectionProofReceiptV1 = Awaited<
  ReturnType<typeof evaluateStage25Rhc04RenderedCorrectionProofV1>
>;

async function loadFrames(
  proxy: Readonly<GeneratedCompositionProxyReceiptV1>,
  variant: LoadedFrame['variant'],
): Promise<LoadedFrame[]> {
  const frames: LoadedFrame[] = [];
  for (const still of proxy.stills) {
    const bytes = await readFile(still.path);
    if (sha256(bytes) !== still.sha256) fail(`${variant}_STILL_HASH_DRIFT:${still.frame}`);
    const decoded = await sharp(bytes).removeAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== 1080 || decoded.info.height !== 1920
      || decoded.info.channels !== 3) {
      fail(`${variant}_STILL_DIMENSION_DRIFT:${still.frame}`);
    }
    frames.push({
      variant,
      frame: still.frame,
      data: decoded.data,
      width: decoded.info.width,
      height: decoded.info.height,
      rawSha256: sha256(decoded.data),
    });
  }
  return frames;
}

function measureFrame(
  frame: Readonly<LoadedFrame>,
  layout: Readonly<Stage25Rhc04RenderedLayoutContractV1>,
  sourceContrast: ReadonlyMap<string, number>,
) {
  const state = expectedState(frame.variant, frame.frame);
  const region = normalizedRegion(frame, layout.panelBounds, 24);
  const panelVariance = regionVariance(frame, region);
  const glyphBounds = findGlyphBounds(frame);
  const glyphCenterOffsetPx = Math.abs(glyphBounds.centerX - frame.width / 2);
  const titleSafe = {
    left: frame.width * 0.05,
    right: frame.width * 0.95,
    top: frame.height * 0.05,
    bottom: frame.height * 0.95,
  };
  const minimumSourceContrastRatio = sourceContrast.get(state.assetId)
    ?? fail(`SOURCE_CONTRAST_MISSING:${state.assetId}`);
  const thresholds = STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.thresholds;
  if (panelVariance < thresholds.minimumPanelVariance
    || glyphBounds.pixels < thresholds.minimumGlyphPixels
    || glyphCenterOffsetPx > thresholds.maximumGlyphCenterOffsetPx
    || glyphBounds.left < titleSafe.left || glyphBounds.right > titleSafe.right
    || glyphBounds.top < titleSafe.top || glyphBounds.bottom > titleSafe.bottom
    || minimumSourceContrastRatio < thresholds.minimumContrastRatio
    || minimumSourceContrastRatio < layout.numerals.minimumContrastRatio) {
    fail(`${frame.variant}_RENDERED_STATE_PROOF_FAILED:${frame.frame}`);
  }
  return {
    variant: frame.variant,
    frame: frame.frame,
    expectedAssetId: state.assetId,
    expectedNumber: state.number,
    expectedState: state.state,
    frameRawSha256: frame.rawSha256,
    panelVariance: round(panelVariance),
    glyphBounds,
    glyphCenterOffsetPx: round(glyphCenterOffsetPx),
    minimumSourceContrastRatio,
    disposition: 'PASS' as const,
  };
}

function assertCorrectionFrameIdentity(
  initial: readonly LoadedFrame[],
  corrected: readonly LoadedFrame[],
) {
  const initialHashes = frameHashes(initial);
  const correctedHashes = frameHashes(corrected);
  assertSame(initialHashes, [0, 44], 'INITIAL_60_STATE');
  assertSame(initialHashes, [45, 89], 'INITIAL_30_STATE');
  assertSame(initialHashes, [90, 104, 105, 179], 'INITIAL_10_STATE');
  assertSame(correctedHashes, [0, 44], 'CORRECTED_60_STATE');
  assertSame(correctedHashes, [45, 89, 90, 104], 'CORRECTED_35_STATE');
  assertSame(correctedHashes, [105, 179], 'CORRECTED_10_STATE');
  if (new Set([initialHashes.get(0), initialHashes.get(45), initialHashes.get(90)]).size !== 3
    || new Set([correctedHashes.get(0), correctedHashes.get(45), correctedHashes.get(105)]).size !== 3) {
    fail('PAIRING_STATES_NOT_VISIBLY_DISTINCT');
  }
  for (const frame of [0, 44, 105, 179]) {
    if (initialHashes.get(frame) !== correctedHashes.get(frame)) {
      fail(`UNRELATED_RENDERED_STATE_CHANGED:${frame}`);
    }
  }
  for (const frame of [45, 89, 90, 104]) {
    if (initialHashes.get(frame) === correctedHashes.get(frame)) {
      fail(`DECLARED_CORRECTION_NOT_VISIBLE:${frame}`);
    }
  }
  return deepFreezeV1({
    initial: Object.fromEntries(initialHashes),
    corrected: Object.fromEntries(correctedHashes),
    exactAcrossCorrectionFrames: [0, 44, 105, 179] as const,
    changedAcrossCorrectionFrames: [45, 89, 90, 104] as const,
    initialStaticRanges: [
      { startFrame: 0, endExclusiveFrame: 45, sampledFrames: [0, 44] },
      { startFrame: 45, endExclusiveFrame: 90, sampledFrames: [45, 89] },
      { startFrame: 90, endExclusiveFrame: 180, sampledFrames: [90, 104, 105, 179] },
    ] as const,
    correctedStaticRanges: [
      { startFrame: 0, endExclusiveFrame: 45, sampledFrames: [0, 44] },
      { startFrame: 45, endExclusiveFrame: 105, sampledFrames: [45, 89, 90, 104] },
      { startFrame: 105, endExclusiveFrame: 180, sampledFrames: [105, 179] },
    ] as const,
  });
}

function expectedState(variant: LoadedFrame['variant'], frame: number) {
  if (frame < 45) {
    return { state: 'FIRST' as const, assetId: 'rhc04-closeup-60', number: '60%' };
  }
  if (variant === 'INITIAL' && frame < 90) {
    return { state: 'MIDDLE' as const, assetId: 'rhc04-closeup-30', number: '30%' };
  }
  if (variant === 'CORRECTED' && frame < 105) {
    return {
      state: 'MIDDLE' as const,
      assetId: 'rhc04-correction-source',
      number: '35%',
    };
  }
  return { state: 'FINAL' as const, assetId: 'rhc04-closeup-10', number: '10%' };
}

function findGlyphBounds(frame: Readonly<LoadedFrame>): PixelBounds {
  let left = frame.width;
  let right = -1;
  let top = frame.height;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
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
  if (right < left || bottom < top) fail(`GLYPHS_MISSING:${frame.variant}:${frame.frame}`);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    pixels,
  };
}

function normalizedRegion(
  frame: Readonly<LoadedFrame>,
  bounds: Readonly<{ left: number; top: number; width: number; height: number }>,
  inset: number,
) {
  const left = Math.round(bounds.left * frame.width) + inset;
  const top = Math.round(bounds.top * frame.height) + inset;
  const width = Math.floor(bounds.width * frame.width) - inset * 2;
  const height = Math.floor(bounds.height * frame.height) - inset * 2;
  return { left, top, rightExclusive: left + width, bottomExclusive: top + height };
}

function regionVariance(
  frame: Readonly<LoadedFrame>,
  region: ReturnType<typeof normalizedRegion>,
): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = region.top; y < region.bottomExclusive; y += 1) {
    for (let x = region.left; x < region.rightExclusive; x += 1) {
      const offset = (y * frame.width + x) * 3;
      const value = (frame.data[offset]! + frame.data[offset + 1]!
        + frame.data[offset + 2]!) / 3;
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

function assertProxy(
  proxy: Readonly<GeneratedCompositionProxyReceiptV1>,
  expectedProgramSha256: string,
  variant: LoadedFrame['variant'],
): void {
  const { receiptHash, ...material } = proxy;
  if (receiptHash !== hashCanonicalJsonV1(material)
    || proxy.programHash !== expectedProgramSha256
    || proxy.composition.width !== 1080 || proxy.composition.height !== 1920
    || proxy.composition.fps !== 30 || proxy.composition.durationInFrames !== 180
    || !proxy.playableProxy || proxy.playableProxy.audio !== 'ABSENT'
    || JSON.stringify(proxy.stills.map(({ frame }) => frame))
      !== JSON.stringify(STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.requiredFrames)) {
    fail(`${variant}_PROXY_RECEIPT_BINDING_DRIFT`);
  }
}

function assertSourceContrast(
  values: readonly Readonly<{ assetId: string; minimumWhiteContrastRatio: number }>[],
): ReadonlyMap<string, number> {
  const expected = [
    'rhc04-closeup-60', 'rhc04-closeup-30',
    'rhc04-closeup-10', 'rhc04-correction-source',
  ];
  const map = new Map(values.map(({ assetId, minimumWhiteContrastRatio }) => [
    assetId,
    minimumWhiteContrastRatio,
  ]));
  if (map.size !== expected.length || expected.some((assetId) => !map.has(assetId))
    || [...map.values()].some((value) => !Number.isFinite(value) || value < 4.5)) {
    fail('SOURCE_CONTRAST_CONTRACT_INVALID');
  }
  return map;
}

function assertLayoutContract(
  layout: Readonly<Stage25Rhc04RenderedLayoutContractV1>,
): void {
  if (hashCanonicalJsonV1(layout.canvas) !== hashCanonicalJsonV1({ width: 1080, height: 1920 })
    || hashCanonicalJsonV1(layout.panelBounds)
      !== hashCanonicalJsonV1({ left: 0.04, top: 0.04, width: 0.92, height: 0.92 })
    || layout.numerals.fontSizePx !== 128 || layout.numerals.minimumFontSizePx !== 64
    || layout.numerals.foreground !== '#FFFFFF'
    || layout.numerals.minimumContrastRatio !== 4.5
    || hashCanonicalJsonV1(layout.knowledgeGraphBindings)
      !== hashCanonicalJsonV1(
        STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.knowledgeGraphBindings,
      )) {
    fail('LAYOUT_CONTRACT_DRIFT');
  }
}

function frameHashes(frames: readonly LoadedFrame[]): Map<number, string> {
  const map = new Map(frames.map(({ frame, rawSha256 }) => [frame, rawSha256]));
  if (map.size !== STAGE25_RHC04_RENDERED_CORRECTION_POLICY_V1.requiredFrames.length) {
    fail('FRAME_IDENTITY_SET_INVALID');
  }
  return map;
}
function assertSame(map: ReadonlyMap<number, string>, frames: number[], code: string): void {
  if (new Set(frames.map((frame) => map.get(frame))).size !== 1
    || frames.some((frame) => !map.has(frame))) {
    fail(`${code}_NOT_EXACT`);
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
  throw new Error(`STAGE25_RHC04_RENDERED_CORRECTION_${code}`);
}
