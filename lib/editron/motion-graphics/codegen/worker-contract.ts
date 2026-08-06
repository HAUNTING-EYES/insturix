import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { MgSequenceOutput } from './render/render-moment';
import type { MgMomentInput, MgReceipt, MgVisualEvidenceRole } from './types';
import { mgMomentDesignPlanSchema, mgVideoDesignBriefSchema } from './design/design-plan';

export const MG_RENDER_WORKER_CONTRACT_VERSION = 'editron-mg-render-worker-v2' as const;

const finiteNumber = z.number().finite();
const unitNumber = finiteNumber.min(0).max(1);
const boundedString = (max: number) => z.string().min(1).max(max);
export const MAX_WORKER_REQUEST_BYTES = 512 * 1_024;
export const MAX_VISUAL_EVIDENCE_IMAGE_BYTES = 96 * 1_024;
const MAX_VISUAL_EVIDENCE_DATA_URL_CHARS = Math.ceil(MAX_VISUAL_EVIDENCE_IMAGE_BYTES * 4 / 3) + 64;

function isValidVisualEvidenceImage(value: string): boolean {
  const match = value.match(/^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const mime = match[1];
  const encoded = match[2];
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.byteLength < 12 || decoded.byteLength > MAX_VISUAL_EVIDENCE_IMAGE_BYTES) return false;
  if (decoded.toString('base64') !== encoded) return false;
  if (mime === 'jpeg') return decoded[0] === 0xff && decoded[1] === 0xd8 && decoded[2] === 0xff;
  return decoded.subarray(0, 4).toString('ascii') === 'RIFF'
    && decoded.subarray(8, 12).toString('ascii') === 'WEBP';
}

const visualEvidenceImageDataUrlSchema = z.string()
  .max(MAX_VISUAL_EVIDENCE_DATA_URL_CHARS)
  .refine(isValidVisualEvidenceImage, { message: 'visual evidence must be a valid bounded JPEG or WebP data URL' });


type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  finiteNumber,
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema).max(2_000),
  z.record(z.string(), jsonValueSchema),
]));

const sourceSpanSchema = z.object({
  text: z.string().max(8_000),
  startMs: finiteNumber.nonnegative().optional(),
  endMs: finiteNumber.nonnegative().optional(),
  wordStart: z.number().int().nonnegative().optional(),
  wordEnd: z.number().int().nonnegative().optional(),
  source: z.string().max(240).optional(),
}).strict();

const semanticCandidateSchema = z.object({
  id: boundedString(240),
  factKind: z.enum([
    'weak-stat', 'bounded-stat', 'magnitude-stat', 'series', 'comparison',
    'quote', 'identity', 'concept', 'refutation', 'list',
    // P3.5 door: a factless transcript beat, licensed by the DESIGNER's approved plan (edl-executor enforces
    // plan-or-skip; never free-form). data.line carries the verbatim spoken words (coder-prompt.ts).
    'narrative',
  ]),
  sourceSpan: sourceSpanSchema,
  content: z.record(z.string(), jsonValueSchema),
  evidenceKeys: z.array(z.string().max(500)).max(128),
  licenses: z.array(z.enum([
    'bounded-proportion', 'magnitude', 'series-values', 'comparison-relation',
    'named-entity', 'quote-proof', 'concept-context', 'truth-negation',
    'ordered-list', 'salience', 'source-span',
  ])).max(32),
  salience: unitNumber,
  rhetoricalRole: z.enum(['literal', 'claim', 'proof', 'identity', 'concept', 'refutation']).optional(),
  hardGate: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string().max(500)).max(64),
    blockedBy: z.array(z.string().max(500)).max(64),
  }).strict(),
  scoreInputs: z.object({
    structuralStrength: unitNumber,
    salience: unitNumber,
    evidenceStrength: unitNumber,
    renderRisk: unitNumber,
  }).strict(),
}).strict();

const colorSchema = z.string().min(1).max(120);
const brandSchema = z.object({
  name: boundedString(240),
  productName: boundedString(240),
  colors: z.object({
    bg: colorSchema,
    surface: colorSchema,
    surfaceAlt: colorSchema,
    text: colorSchema,
    muted: colorSchema,
    border: colorSchema,
    accent: colorSchema,
    accentText: colorSchema,
  }).strict(),
  fontSans: boundedString(500),
  fontDisplay: boundedString(500).optional(),
  type: z.object({
    headingWeight: finiteNumber.min(100).max(1_000),
    tracking: z.string().max(40),
    lineHeight: finiteNumber.min(0.5).max(3),
    eyebrowCase: z.enum(['none', 'upper']),
  }).strict(),
  shape: z.object({
    radius: finiteNumber.min(0).max(200),
    border: finiteNumber.min(0).max(20),
  }).strict(),
  density: unitNumber,
  decor: z.object({ grid: z.boolean(), glow: z.boolean() }).strict(),
  motion: z.object({ energy: unitNumber, overshoot: unitNumber }).strict(),
}).strict();

const regionBoxSchema = z.object({
  x: unitNumber,
  y: unitNumber,
  width: unitNumber,
  height: unitNumber,
  reason: z.string().max(500),
}).strict().refine((box) => box.x + box.width <= 1.000_001 && box.y + box.height <= 1.000_001, {
  message: 'region box must stay within normalized canvas bounds',
});

const visualEvidenceCoordinateSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source-asset'),
    assetId: boundedString(240),
    sourceFrame: z.number().int().nonnegative(),
    timelineFrame: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    kind: z.literal('edited-timeline'),
    timelineFrame: z.number().int().nonnegative(),
  }).strict(),
]);

function visualEvidenceFrameSchema<const Role extends MgVisualEvidenceRole>(role: Role) {
  return z.object({
    role: z.literal(role),
    coordinate: visualEvidenceCoordinateSchema,
    imageDataUrl: visualEvidenceImageDataUrlSchema,
  }).strict();
}

const visualEvidenceSchema = z.object({
  space: z.literal('edited-canvas'),
  canvas: z.object({
    width: z.number().int().min(64).max(4_096),
    height: z.number().int().min(64).max(4_096),
  }).strict().refine(({ width, height }) => width * height <= 3_840 * 2_160, {
    message: 'visual evidence canvas must not exceed 4K pixel count',
  }),
  frames: z.tuple([
    visualEvidenceFrameSchema('context-before'),
    visualEvidenceFrameSchema('anchor'),
    visualEvidenceFrameSchema('context-after'),
  ]),
}).strict()
  .refine(
    ({ frames }) => frames.every((frame, index) => index === 0
      || frames[index - 1].coordinate.timelineFrame < frame.coordinate.timelineFrame),
    { message: 'visual evidence timeline frames must be strictly increasing' },
  );

// The style-resolver outputs that ride to the worker: the worker AUTHORS the component from request.input, and
// codegen-service.buildCodegenPrompt reads input.videoStyle + input.footageSignals to render the <style_direction>.
// So they MUST cross the wire. These mirror VideoStyle (style/style-resolver.ts) + FootageSignals
// (style/footage-character.ts); the atom-vocab enums mirror FontStylePriors (style/font-family.ts) — if any of
// those unions change, update here too (Rule 10). Footage numbers use finiteNumber (classifyFootage clamps to
// [0,1] downstream) so a valid seam signal is never rejected at the boundary.
const videoStyleSchema = z.object({
  styleName: boundedString(120),
  personality: boundedString(240),
  motion: z.enum(['gentle', 'smooth', 'snappy', 'sharp', 'elastic', 'pop']),
  weight: z.enum(['light', 'regular', 'medium', 'heavy']),
  corner: z.enum(['sharp', 'medium', 'round']),
  alignment: z.enum(['left', 'center']),
  baseSurface: z.enum(['flat', 'frosted', 'raised', 'glow']),
  baseTexture: z.enum(['none', 'grain', 'scanline', 'grid', 'dots']),
  baseDensity: z.enum(['airy', 'standard', 'dense']),
  sources: z.array(z.string().max(120)).max(16),
}).strict();

const footageSignalsSchema = z.object({
  motionEnergy: finiteNumber.optional(),
  warmth: finiteNumber.optional(),
  arousal: finiteNumber.optional(),
  faceEmotion: z.string().max(120).nullable().optional(),
  motionType: z.enum(['subject_moving', 'camera_moving', 'both', 'static']).optional(),
  brightness: finiteNumber.optional(),
  saturation: finiteNumber.optional(),
}).strict();

export const mgMomentInputSchema = z.object({
  momentId: boundedString(240),
  candidate: semanticCandidateSchema,
  brand: brandSchema,
  window: z.object({
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().positive(),
    fps: finiteNumber.positive().max(240),
  }).strict().refine((window) => window.endFrame > window.startFrame, {
    message: 'endFrame must be greater than startFrame',
  }),
  anchors: z.object({
    wordFrames: z.array(z.number().int().nonnegative()).max(2_000).optional(),
    beatFrames: z.array(z.number().int().nonnegative()).max(2_000).optional(),
    landingFrame: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  expressiveness: z.object({
    tier: z.enum(['subtle', 'standard', 'hero']),
    intensity: unitNumber,
    emphasisScale: finiteNumber.min(0.25).max(4),
  }).strict(),
  placement: z.object({
    region: boundedString(120),
    avoid: z.array(regionBoxSchema).max(64),
    prefer: z.array(regionBoxSchema).max(64),
  }).strict(),
  screen: z.object({
    subject: z.object({
      x: unitNumber,
      y: unitNumber,
      width: unitNumber.optional(),
      height: unitNumber.optional(),
    }).strict().optional(),
    negativeSpace: z.object({ region: boundedString(120), strength: unitNumber }).strict().optional(),
  }).strict().optional(),
  visualEvidence: visualEvidenceSchema.optional(),
  notes: z.string().max(2_000).optional(),
  videoStyle: videoStyleSchema.optional(),
  // Phase 4b: the video taste contract as {hash, compact direction} so the judge verifies contract fidelity (§11).
  tasteContract: z.object({
    hash: boundedString(64),
    direction: boundedString(6_000),
  }).strict().optional(),
  footageSignals: footageSignalsSchema.optional(),
  /** Resolved liveness [0.7,1] (brand×video×user) — becomes the reserved data.motionIntensity at render. */
  motionIntensity: z.number().min(0).max(1).optional(),
  /** An approved video-level design for this moment (P5-1 Phase C — design-then-code). Present → the worker's
   *  generateMoment renders THIS design via the coder prompt. The SAME plan/brief schemas the design session
   *  validates against, so a plan that cleared design-time validation crosses this strict boundary unchanged. */
  design: z.object({
    plan: mgMomentDesignPlanSchema,
    brief: mgVideoDesignBriefSchema,
  }).strict().optional(),
}).strict().superRefine((moment, context) => {
  if (!moment.visualEvidence) return;
  for (const [index, frame] of moment.visualEvidence.frames.entries()) {
    const timelineFrame = frame.coordinate.timelineFrame;
    if (timelineFrame < moment.window.startFrame || timelineFrame >= moment.window.endFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visualEvidence', 'frames', index, 'coordinate', 'timelineFrame'],
        message: 'visual evidence timeline frame must belong to the MG window',
      });
    }
  }
});

const receiptSchema: z.ZodType<MgReceipt> = z.object({
  momentId: boundedString(240),
  promptHash: z.string().max(128),
  attempts: z.number().int().nonnegative().max(20),
  scans: z.array(z.object({ passed: z.boolean(), reason: z.string().max(2_000).optional() }).strict()).max(32),
  compiled: z.boolean(),
  compileError: z.string().max(8_000).optional(),
  judgeScore: finiteNumber.optional(),
  judgeIssues: z.array(z.string().max(2_000)).max(100).optional(),
  outcome: z.enum(['generated', 'declined', 'fallback']),
  reason: z.string().max(8_000).optional(),
  failure: z.object({
    domain: z.literal('provider'),
    provider: z.enum(['zai', 'gemini']),
    operation: z.enum(['component-generation', 'visual-judge']),
    code: z.enum([
      'rate-limited',
      'timeout',
      'unavailable',
      'network',
      'authentication',
      'request-rejected',
      'invalid-response',
      'configuration',
    ]),
    disposition: z.enum(['retryable', 'terminal']),
    statusCode: z.number().int().min(100).max(599).optional(),
  }).strict().optional(),
}).strict();

const sequenceOutputSchema: z.ZodType<MgSequenceOutput> = z.object({
  address: z.object({
    sequenceId: boundedString(240),
    frameCount: z.number().int().positive().max(100_000),
    cdnBaseUrl: z.string().url().max(2_000),
  }).strict(),
  r2Prefix: boundedString(500),
  fps: finiteNumber.positive().max(240),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  frameFormat: z.literal('webp'),
  transparent: z.literal(true),
  sizeBytes: z.number().int().nonnegative(),
  renderMs: finiteNumber.nonnegative(),
}).strict();

export const mgRenderWorkerRequestSchema = z.object({
  version: z.literal(MG_RENDER_WORKER_CONTRACT_VERSION),
  jobId: z.string().regex(/^mgr_[a-f0-9]{32}$/),
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: boundedString(240),
  userId: boundedString(240),
  orgId: z.string().min(1).max(240).nullable(),
  appCommit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  input: mgMomentInputSchema,
  canvas: z.object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
  }).strict(),
  sequenceNamespace: boundedString(500),
  requestedAt: z.string().datetime(),
}).strict().superRefine((request, context) => {
  const evidenceCanvas = request.input.visualEvidence?.canvas;
  if (evidenceCanvas
    && (evidenceCanvas.width !== request.canvas.width || evidenceCanvas.height !== request.canvas.height)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['input', 'visualEvidence', 'canvas'],
      message: 'visual evidence canvas must match the render canvas',
    });
  }
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > MAX_WORKER_REQUEST_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'MG render worker request exceeds 512 KiB' });
  }
});

export type MgRenderWorkerRequest = z.infer<typeof mgRenderWorkerRequestSchema>;

const workerResultBase = {
  version: z.literal(MG_RENDER_WORKER_CONTRACT_VERSION),
  jobId: z.string().regex(/^mgr_[a-f0-9]{32}$/),
  completedAt: z.string().datetime(),
  receipt: receiptSchema,
};

export const mgRenderWorkerResultSchema = z.discriminatedUnion('status', [
  z.object({ ...workerResultBase, status: z.literal('generated'), sequence: sequenceOutputSchema }).strict(),
  z.object({ ...workerResultBase, status: z.literal('declined'), reason: boundedString(8_000) }).strict(),
  z.object({ ...workerResultBase, status: z.literal('fallback'), reason: boundedString(8_000) }).strict(),
]);

export type MgRenderWorkerResult = z.infer<typeof mgRenderWorkerResultSchema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function buildMgRenderIdempotencyKey(input: {
  projectId: string;
  userId: string;
  orgId?: string | null;
  appCommit: string;
  moment: MgMomentInput;
  canvas: { width: number; height: number };
  sequenceNamespace: string;
}): string {
  const payload = canonicalize({ contractVersion: MG_RENDER_WORKER_CONTRACT_VERSION, ...input });
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildMgRenderJobId(idempotencyKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(idempotencyKey)) throw new Error('invalid MG render idempotency key');
  return `mgr_${idempotencyKey.slice(0, 32)}`;
}

export function parseMgRenderWorkerRequest(value: unknown): MgRenderWorkerRequest {
  return mgRenderWorkerRequestSchema.parse(value);
}

export function parseMgRenderWorkerResult(value: unknown): MgRenderWorkerResult {
  return mgRenderWorkerResultSchema.parse(value);
}
