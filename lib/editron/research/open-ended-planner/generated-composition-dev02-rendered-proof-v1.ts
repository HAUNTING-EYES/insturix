import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import sharp from 'sharp';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  resolveDev02RenderedProofClaimBindingsV1,
  type Dev02RenderedProofClaimBindingsV1,
} from './dev02-rendered-proof-claim-policy-v1';
import type { GeneratedCompositionProgramV1 } from './generated-composition-program-v1';
import type { GeneratedCompositionProxyReceiptV1 } from './generated-composition-proxy-renderer-v1';

export const DEV02_RENDERED_PROOF_POLICY_V1 = Object.freeze({
  policyId: 'EDITRON_DEV02_RENDERED_PROOF_POLICY_V1',
  taskId: 'DEV-02',
  requiredFrames: [0, 24, 108, 144, 145, 179] as const,
  requiredClaims: [
    'claim-ref-five-panels', 'claim-ref-black-gutters', 'claim-ref-yellow-two-line-title',
    'claim-ref-opposed-motion', 'claim-ref-green-centre-takeover', 'claim-ref-temporal-progression',
  ] as const,
  creativeKnowledgeRefs: [
    'constant:safe_zone.title_safe', 'signal:visual.motion_intensity',
    'constant:accessibility.flash_max_per_second', 'constant:accessibility.flash_verification_tool',
  ] as const,
  thresholds: {
    minimumFrameVariance: 50,
    minimumNonBlackRatio: 0.02,
    minimumPanelInteriorRatio: 0.5,
    maximumGutterNonBlackRatio: 0.05,
    minimumBuildDifference: 0.02,
    maximumHoldDifference: 0.005,
    minimumReleaseDifference: 0.02,
    minimumOpposedTravelPixelsAt1080x1920: 100,
    minimumFullCanvasNonBlackRatio: 0.95,
    maximumBoundaryDifference: 0.01,
  },
} as const);

export const DEV02_GENERATED_SOURCE_ACCEPTANCE_CONTRACT_V1 = Object.freeze({
  contractId: 'EDITRON_DEV02_GENERATED_SOURCE_ACCEPTANCE_CONTRACT_V1',
  policyId: DEV02_RENDERED_PROOF_POLICY_V1.policyId,
  requiredFrames: DEV02_RENDERED_PROOF_POLICY_V1.requiredFrames,
  thresholds: DEV02_RENDERED_PROOF_POLICY_V1.thresholds,
  hardGateChecks: [
    {
      checkId: 'FRAME_INTEGRITY',
      rule: 'Every required frame must meet minimumNonBlackRatio and minimumFrameVariance.',
    },
    {
      checkId: 'SETTLED_PANEL_GEOMETRY',
      observationFrame: 108,
      rule: 'All five declared panel interiors must be occupied while the declared black gutters remain black.',
    },
    {
      checkId: 'TITLE_FORM',
      observationFrame: 108,
      rule: 'Exactly two visible yellow title-line bands must remain inside the centre 90 percent title-safe area.',
    },
    {
      checkId: 'OPPOSED_PANEL_MOTION',
      earlyFrame: 24,
      settledFrame: 108,
      rule: 'Centre occupancy must rise and side occupancy must descend by at least minimumOpposedTravelPixelsAt1080x1920.',
    },
    {
      checkId: 'PHASE_STRUCTURE',
      comparisons: ['0->24 build', '24->108 build', '108->144 hold', '145->179 release'],
      rule: 'Both build comparisons and the release must exceed their minimum differences; the hold must remain below maximumHoldDifference.',
    },
    {
      checkId: 'FULL_CANVAS_RELEASE',
      observationFrame: 179,
      rule: 'The final centre takeover must meet minimumFullCanvasNonBlackRatio.',
    },
  ],
  additionalProof: [
    {
      checkId: 'BOUNDARY_CONTINUITY',
      generatedFrame: 179,
      followingSourceFrame: 180,
      rule: 'The generated exit and trusted following source frame must remain within maximumBoundaryDifference.',
    },
    {
      checkId: 'FLASH_SAFETY',
      rule: 'Still-frame checks cannot prove flash safety; frame-complete approved PSE QC remains required.',
    },
  ],
} as const);

type ProofStatus = 'PASS' | 'FAIL' | 'UNVERIFIABLE';

export interface GeneratedCompositionRenderedCheckV1 {
  checkId: string;
  status: ProofStatus;
  claimIds: readonly string[];
  metrics: Readonly<Record<string, number | string>>;
  reason: string;
}

export interface Dev02GeneratedCompositionRenderedProofV1 {
  artifactType: 'Dev02GeneratedCompositionRenderedProofV1';
  policyId: typeof DEV02_RENDERED_PROOF_POLICY_V1.policyId;
  taskId: 'DEV-02';
  programHash: string;
  proxyReceiptHash: string;
  hardGateDisposition: 'PASS' | 'FAIL';
  technicalDisposition: ProofStatus;
  creativeDisposition: 'UNVERIFIABLE';
  checks: readonly GeneratedCompositionRenderedCheckV1[];
  stateEffects: readonly [];
  proofHash: string;
}

interface LoadedFrame {
  frame: number;
  data: Buffer;
  width: number;
  height: number;
}

export async function evaluateDev02GeneratedCompositionRenderedProofV1(input: {
  program: GeneratedCompositionProgramV1;
  proxyReceipt: GeneratedCompositionProxyReceiptV1;
  authoritativeProxyReceiptHash: string;
  boundaryReferencePath?: string;
  referenceBlueprint?: unknown;
}): Promise<Readonly<Dev02GeneratedCompositionRenderedProofV1>> {
  if (!/^[a-f0-9]{64}$/.test(input.authoritativeProxyReceiptHash)) throw new Error('DEV-02 rendered proof authoritative proxy identity is invalid');
  const claimBindings = assertPolicyBindings(
    input.program, input.proxyReceipt, input.authoritativeProxyReceiptHash, input.referenceBlueprint,
  );
  const frames = new Map<number, LoadedFrame>();
  for (const still of input.proxyReceipt.stills) {
    const bytes = await fs.readFile(still.path);
    if (sha256(bytes) !== still.sha256) throw new Error(`DEV-02 rendered proof still hash drift: ${still.frame}`);
    const image = await loadImage(bytes, input.program.canvas.width, input.program.canvas.height, still.frame);
    frames.set(still.frame, image);
  }
  const required = DEV02_RENDERED_PROOF_POLICY_V1.requiredFrames.map((frame) => requiredFrame(frames, frame));
  const [frame0, frame24, frame108, frame144, frame145, frame179] = required;
  const checks: GeneratedCompositionRenderedCheckV1[] = [
    frameIntegrityCheck(required),
    settledGeometryCheck(frame108, claimBindings.settledGeometry),
    titleFormCheck(frame108, claimBindings.titleForm),
    opposedMotionCheck(frame24, frame108, claimBindings.opposedMotion),
    phaseStructureCheck(frame0, frame24, frame108, frame144, frame145, frame179, claimBindings.phaseStructure),
    fullCanvasReleaseCheck(frame179, claimBindings.fullCanvasRelease),
    await boundaryContinuityCheck(frame179, input.boundaryReferencePath, claimBindings.boundaryContinuity),
    unverifiable('FLASH_SAFETY', [], 'Six stills cannot establish flash frequency, red-flash, or spatial-pattern safety; frame-complete screening and approved PSE QC are required.'),
  ];
  const hardCheckIds = new Set(['FRAME_INTEGRITY', 'SETTLED_PANEL_GEOMETRY', 'TITLE_FORM', 'OPPOSED_PANEL_MOTION', 'PHASE_STRUCTURE', 'FULL_CANVAS_RELEASE']);
  const hardGateDisposition: 'PASS' | 'FAIL' = checks.some((check) => hardCheckIds.has(check.checkId) && check.status !== 'PASS') ? 'FAIL' : 'PASS';
  const technicalDisposition: ProofStatus = checks.some(({ status }) => status === 'FAIL')
    ? 'FAIL'
    : checks.some(({ status }) => status === 'UNVERIFIABLE') ? 'UNVERIFIABLE' : 'PASS';
  const unsigned = {
    artifactType: 'Dev02GeneratedCompositionRenderedProofV1' as const,
    policyId: DEV02_RENDERED_PROOF_POLICY_V1.policyId,
    taskId: 'DEV-02' as const,
    programHash: input.proxyReceipt.programHash,
    proxyReceiptHash: input.authoritativeProxyReceiptHash,
    hardGateDisposition,
    technicalDisposition,
    creativeDisposition: 'UNVERIFIABLE' as const,
    checks,
    stateEffects: [] as const,
  };
  return Object.freeze({ ...unsigned, proofHash: hashCanonicalJsonV1(unsigned) });
}

function assertPolicyBindings(
  program: GeneratedCompositionProgramV1,
  receipt: GeneratedCompositionProxyReceiptV1,
  _authoritativeProxyReceiptHash: string,
  referenceBlueprint?: unknown,
): Readonly<Dev02RenderedProofClaimBindingsV1> {
  if (program.taskId !== DEV02_RENDERED_PROOF_POLICY_V1.taskId) throw new Error('DEV-02 rendered proof policy cannot evaluate another task');
  const { receiptHash, ...unsignedReceipt } = receipt;
  if (receiptHash !== hashCanonicalJsonV1(unsignedReceipt)) {
    throw new Error('DEV-02 rendered proof localized proxy receipt identity drift');
  }
  if (hashCanonicalJsonV1(program) !== receipt.programHash) throw new Error('DEV-02 rendered proof program identity drift');
  if (referenceBlueprint === undefined) {
    if (DEV02_RENDERED_PROOF_POLICY_V1.requiredClaims.some((claim) => !program.expectedMeasurementRefs.includes(claim))) {
      throw new Error('DEV-02 rendered proof reference blueprint is required for non-legacy claim identities');
    }
  } else if (hashCanonicalJsonV1(referenceBlueprint) !== program.referenceBinding.blueprintHash) {
    throw new Error('DEV-02 rendered proof reference blueprint identity drift');
  }
  const frames = receipt.stills.map(({ frame }) => frame);
  if (JSON.stringify(frames) !== JSON.stringify(DEV02_RENDERED_PROOF_POLICY_V1.requiredFrames)) throw new Error('DEV-02 rendered proof frame schedule drift');
  return referenceBlueprint === undefined
    ? legacyClaimBindings()
    : resolveDev02RenderedProofClaimBindingsV1({
      expectedMeasurementRefs: program.expectedMeasurementRefs,
      referenceBlueprint,
    });
}

async function loadImage(bytes: Buffer, width: number, height: number, frame: number): Promise<LoadedFrame> {
  const decoded = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels !== 3) throw new Error(`DEV-02 rendered proof dimensions drift: ${frame}`);
  return { frame, data: decoded.data, width, height };
}

function requiredFrame(frames: Map<number, LoadedFrame>, frame: number): LoadedFrame {
  const value = frames.get(frame);
  if (!value) throw new Error(`DEV-02 rendered proof frame is missing: ${frame}`);
  return value;
}

function frameIntegrityCheck(frames: readonly LoadedFrame[]): GeneratedCompositionRenderedCheckV1 {
  const metrics: Record<string, number> = {};
  let pass = true;
  for (const frame of frames) {
    const summary = pixelSummary(frame);
    metrics[`frame${frame.frame}NonBlackRatio`] = summary.nonBlackRatio;
    metrics[`frame${frame.frame}Variance`] = summary.variance;
    if (summary.nonBlackRatio < DEV02_RENDERED_PROOF_POLICY_V1.thresholds.minimumNonBlackRatio || summary.variance < DEV02_RENDERED_PROOF_POLICY_V1.thresholds.minimumFrameVariance) pass = false;
  }
  return check('FRAME_INTEGRITY', pass, [], metrics, 'Required frames must be materially rendered rather than blank or effectively solid.');
}

function settledGeometryCheck(frame: LoadedFrame, claimIds: readonly string[]): GeneratedCompositionRenderedCheckV1 {
  const interiors = {
    leftTop: [0.02, 0.01, 0.30, 0.31], leftBottom: [0.02, 0.68, 0.30, 0.31], centre: [0.35, 0.36, 0.30, 0.28],
    rightTop: [0.69, 0.01, 0.29, 0.31], rightBottom: [0.69, 0.68, 0.29, 0.31],
  } as const;
  const gutters = {
    leftVertical: [0.329, 0.01, 0.01, 0.31], rightVertical: [0.662, 0.01, 0.01, 0.31],
    leftHorizontal: [0.02, 0.4974, 0.30, 0.0053], rightHorizontal: [0.69, 0.4974, 0.29, 0.0053],
  } as const;
  const metrics: Record<string, number> = {};
  for (const [id, region] of Object.entries(interiors)) metrics[`${id}Occupancy`] = regionNonBlackRatio(frame, region);
  for (const [id, region] of Object.entries(gutters)) metrics[`${id}Occupancy`] = regionNonBlackRatio(frame, region);
  const pass = Object.keys(interiors).every((id) => metrics[`${id}Occupancy`] >= DEV02_RENDERED_PROOF_POLICY_V1.thresholds.minimumPanelInteriorRatio)
    && Object.keys(gutters).every((id) => metrics[`${id}Occupancy`] <= DEV02_RENDERED_PROOF_POLICY_V1.thresholds.maximumGutterNonBlackRatio);
  return check('SETTLED_PANEL_GEOMETRY', pass, claimIds, metrics, 'Five settled occupied regions must remain separated by black gutters.');
}

function titleFormCheck(frame: LoadedFrame, claimIds: readonly string[]): GeneratedCompositionRenderedCheckV1 {
  const rows: number[] = [];
  let minX = frame.width; let maxX = -1; let minY = frame.height; let maxY = -1;
  for (let y = Math.floor(frame.height * 0.3); y < Math.ceil(frame.height * 0.7); y += 1) {
    let rowMin = frame.width; let rowMax = -1;
    for (let x = Math.floor(frame.width * 0.05); x < Math.ceil(frame.width * 0.95); x += 1) {
      const offset = (y * frame.width + x) * 3;
      if (!isYellow(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2])) continue;
      rowMin = Math.min(rowMin, x); rowMax = Math.max(rowMax, x); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (rowMax - rowMin + 1 >= frame.width * 0.15) rows.push(y);
  }
  const lineBands = contiguousBands(rows).filter(([start, end]) => end - start + 1 >= frame.height * 0.01);
  const titleSafe = minX >= frame.width * 0.05 && maxX <= frame.width * 0.95 && minY >= frame.height * 0.05 && maxY <= frame.height * 0.95;
  const pass = lineBands.length === 2 && titleSafe;
  return check('TITLE_FORM', pass, claimIds, { lineBands: lineBands.length, minX, maxX, minY, maxY, titleSafe: titleSafe ? 1 : 0 }, 'A visible yellow two-line title must remain inside the title-safe centre 90%.');
}

function opposedMotionCheck(early: LoadedFrame, settled: LoadedFrame, claimIds: readonly string[]): GeneratedCompositionRenderedCheckV1 {
  const earlyCentre = regionCentroidY(early, [[0.35, 0.65]]); const settledCentre = regionCentroidY(settled, [[0.35, 0.65]]);
  const earlySides = regionCentroidY(early, [[0.02, 0.32], [0.69, 0.98]]); const settledSides = regionCentroidY(settled, [[0.02, 0.32], [0.69, 0.98]]);
  const scale = settled.height / 1920;
  const minimum = DEV02_RENDERED_PROOF_POLICY_V1.thresholds.minimumOpposedTravelPixelsAt1080x1920 * scale;
  const centreRise = earlyCentre - settledCentre; const sideDescent = settledSides - earlySides;
  return check('OPPOSED_PANEL_MOTION', centreRise >= minimum && sideDescent >= minimum, claimIds, { earlyCentre, settledCentre, earlySides, settledSides, centreRise, sideDescent }, 'Centre occupancy must rise while side occupancy descends across ordered proof frames.');
}

function phaseStructureCheck(frame0: LoadedFrame, frame24: LoadedFrame, frame108: LoadedFrame, frame144: LoadedFrame, frame145: LoadedFrame, frame179: LoadedFrame, claimIds: readonly string[]): GeneratedCompositionRenderedCheckV1 {
  const buildA = meanAbsoluteDifference(frame0, frame24); const buildB = meanAbsoluteDifference(frame24, frame108);
  const hold = meanAbsoluteDifference(frame108, frame144); const releaseStart = meanAbsoluteDifference(frame144, frame145); const release = meanAbsoluteDifference(frame145, frame179);
  const t = DEV02_RENDERED_PROOF_POLICY_V1.thresholds;
  const pass = buildA >= t.minimumBuildDifference && buildB >= t.minimumBuildDifference && hold <= t.maximumHoldDifference && release >= t.minimumReleaseDifference;
  return check('PHASE_STRUCTURE', pass, claimIds, { buildA, buildB, hold, releaseStart, release }, 'The render must show an ordered build, stable hold, and release—not six unrelated states.');
}

function fullCanvasReleaseCheck(frame: LoadedFrame, claimIds: readonly string[]): GeneratedCompositionRenderedCheckV1 {
  const ratio = pixelSummary(frame).nonBlackRatio;
  return check('FULL_CANVAS_RELEASE', ratio >= DEV02_RENDERED_PROOF_POLICY_V1.thresholds.minimumFullCanvasNonBlackRatio, claimIds, { nonBlackRatio: ratio }, 'The final centre-panel takeover must materially occupy the complete canvas.');
}

async function boundaryContinuityCheck(finalFrame: LoadedFrame, referencePath: string | undefined, claimIds: readonly string[]): Promise<GeneratedCompositionRenderedCheckV1> {
  if (!referencePath) return unverifiable('BOUNDARY_CONTINUITY', claimIds, 'No trusted following-shot source frame was supplied.');
  const decoded = await sharp(await fs.readFile(referencePath)).resize(finalFrame.width, finalFrame.height, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const reference: LoadedFrame = { frame: finalFrame.frame + 1, data: decoded.data, width: decoded.info.width, height: decoded.info.height };
  const difference = meanAbsoluteDifference(finalFrame, reference);
  return check('BOUNDARY_CONTINUITY', difference <= DEV02_RENDERED_PROOF_POLICY_V1.thresholds.maximumBoundaryDifference, claimIds, { normalizedDifference: difference }, 'The generated exit must match the trusted source frame used by the following native shot.');
}

function legacyClaimBindings(): Readonly<Dev02RenderedProofClaimBindingsV1> {
  return Object.freeze({
    settledGeometry: ['claim-ref-five-panels', 'claim-ref-black-gutters'],
    titleForm: ['claim-ref-yellow-two-line-title'],
    opposedMotion: ['claim-ref-opposed-motion'],
    phaseStructure: ['claim-ref-temporal-progression'],
    fullCanvasRelease: ['claim-ref-green-centre-takeover'],
    boundaryContinuity: ['claim-ref-green-centre-takeover'],
  });
}

function pixelSummary(frame: LoadedFrame): { nonBlackRatio: number; variance: number } {
  let nonBlack = 0; let sum = 0; let sumSquares = 0; const pixels = frame.data.length / 3;
  for (let offset = 0; offset < frame.data.length; offset += 3) {
    const red = frame.data[offset]; const green = frame.data[offset + 1]; const blue = frame.data[offset + 2];
    if (Math.max(red, green, blue) > 20) nonBlack += 1;
    const luminance = (red + green + blue) / 3; sum += luminance; sumSquares += luminance * luminance;
  }
  const mean = sum / pixels;
  return { nonBlackRatio: nonBlack / pixels, variance: sumSquares / pixels - mean * mean };
}

function regionNonBlackRatio(frame: LoadedFrame, region: readonly number[]): number {
  const [x0, y0, width, height] = normalizedRegion(frame, region); let nonBlack = 0; let pixels = 0;
  for (let y = y0; y < y0 + height; y += 1) for (let x = x0; x < x0 + width; x += 1) {
    const offset = (y * frame.width + x) * 3;
    if (Math.max(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2]) > 20) nonBlack += 1;
    pixels += 1;
  }
  return nonBlack / pixels;
}

function regionCentroidY(frame: LoadedFrame, xRanges: readonly (readonly [number, number])[]): number {
  let weightedY = 0; let pixels = 0;
  for (let y = 0; y < frame.height; y += 1) for (const [from, to] of xRanges) {
    for (let x = Math.floor(frame.width * from); x < Math.ceil(frame.width * to); x += 1) {
      const offset = (y * frame.width + x) * 3; const red = frame.data[offset]; const green = frame.data[offset + 1]; const blue = frame.data[offset + 2];
      if (Math.max(red, green, blue) <= 20 || isYellow(red, green, blue)) continue;
      weightedY += y; pixels += 1;
    }
  }
  return pixels ? weightedY / pixels : Number.NaN;
}

function normalizedRegion(frame: LoadedFrame, region: readonly number[]): [number, number, number, number] {
  return [Math.floor(frame.width * region[0]), Math.floor(frame.height * region[1]), Math.max(1, Math.floor(frame.width * region[2])), Math.max(1, Math.floor(frame.height * region[3]))];
}

function meanAbsoluteDifference(left: LoadedFrame, right: LoadedFrame): number {
  if (left.width !== right.width || left.height !== right.height || left.data.length !== right.data.length) throw new Error('DEV-02 rendered proof comparison dimensions drift');
  let difference = 0;
  for (let index = 0; index < left.data.length; index += 1) difference += Math.abs(left.data[index] - right.data[index]);
  return difference / left.data.length / 255;
}

function contiguousBands(rows: readonly number[]): [number, number][] {
  const bands: [number, number][] = [];
  for (const row of rows) {
    const last = bands[bands.length - 1];
    if (last && row === last[1] + 1) last[1] = row; else bands.push([row, row]);
  }
  return bands;
}

function isYellow(red: number, green: number, blue: number): boolean { return red > 180 && green > 150 && blue < 100; }
function check(checkId: string, pass: boolean, claimIds: readonly string[], metrics: Record<string, number | string>, reason: string): GeneratedCompositionRenderedCheckV1 { return { checkId, status: pass ? 'PASS' : 'FAIL', claimIds, metrics, reason }; }
function unverifiable(checkId: string, claimIds: readonly string[], reason: string): GeneratedCompositionRenderedCheckV1 { return { checkId, status: 'UNVERIFIABLE', claimIds, metrics: {}, reason }; }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
