import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { MgSequenceOutput } from './render/render-moment';
import type { MgMomentInput, MgReceipt } from './types';

export const MG_RENDER_WORKER_CONTRACT_VERSION = 'editron-mg-render-worker-v1' as const;

const finiteNumber = z.number().finite();
const unitNumber = finiteNumber.min(0).max(1);
const boundedString = (max: number) => z.string().min(1).max(max);
const MAX_WORKER_REQUEST_BYTES = 512 * 1_024;

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
  notes: z.string().max(2_000).optional(),
}).strict();

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
