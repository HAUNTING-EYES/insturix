/**
 * Visual-perception extractor (Master v1.1 §7.2) — the LLM half of the EditFingerprint extractor.
 *
 * A provider watches exact registered reference bytes and returns VISUAL layers
 * (treatment/typography/structure/graphics/performance/decisionStream) as a
 * VisualExtractionTarget — the exact shape the eval harness scores.
 *
 * `parseVisualExtraction` is the testable strict core. Source identity, MIME and
 * ownership are validated by the shared canonical reference gate before upload.
 * This remains a learned observation, never proof or a final editing decision.
 *
 * Rule 35: this prompt is XML-structured, rules-over-examples, seeded. It is NOT "deployed" until
 * it clears the eval harness (min-F1 >= 0.85) against human-corrected ground truth.
 */

import { z } from 'zod';

import {
  assertCanonicalReferenceAnalysisSourceV1,
  type CanonicalReferenceAnalysisInputV1,
} from '@/lib/editron/services/reference-content-extractor';
import type { VisualExtractionTarget } from './fingerprint-eval';
import type {
  FingerprintDecision,
} from '@/lib/editron/types/edit-fingerprint';

/**
 * The SUBJECTIVE decision families Gemini is good at (a subset of EDITRON_EXECUTABLES). Cuts and
 * transitions are deliberately EXCLUDED: Gemini fabricates their timing (measured F1 0.66, a ~1 Hz
 * grid on fast edits), so they are detected deterministically by detect-cuts-ffmpeg.ts and merged in
 * by extract-visual-fingerprint-with-cuts.ts. This is the objective/subjective split (Playbook §7).
 */
const VISUAL_FAMILIES = [
  'zoom_punch',
  'zoom_push',
  'zoom_pull_back',
  'caption_emphasis',
  'speed_ramp',
  'speed_slow_motion',
  'camera_shake',
] as const;

export const VISUAL_PROMPT = [
  '<role>You are a professional short-form video editor analyzing a reference video.</role>',
  '<task>Watch the video and describe ONLY its VISUAL edit fingerprint as JSON.</task>',
  '<rules>',
  '- treatment (colour grade as numeric deltas, 1.0 = unchanged): saturate/contrast/brightness (0.5-2.0), sepia/grain (0-1), hueRotateDeg (-180..180). Include a field ONLY if it clearly differs from neutral.',
  '- typography (on-screen captions): textCase (upper|sentence|lower|as-is), reveal (none|fade|slide-up|pop|typewriter), position (center|lower_third|top|varied). Omit if there are no captions.',
  '- structure: slots[] each {role (hook|promise|payoff|text-reveal|loop-point), startMs, endMs}.',
  '- graphics: classes[] (e.g. kinetic-type, data-viz, callout, lower-third, wireframe), density (heavy|moderate|minimal).',
  '- performance.shotScales[] (ecu|cu|mcu|ms|ws|ews) and subjectPosition (left|center|right|varied).',
  '- performance.cameraMotion (static|push_in|pull_out|handheld|whip|varied). Decide by how the WHOLE frame moves, not the subject:',
  '  · If the entire frame (background, edges, fixed objects) drifts, sways, or shakes over time, the CAMERA is moving. Uniform frame-wide motion = camera; motion confined to the subject while the frame stays fixed = the subject, report static.',
  '  · static = a locked-off/tripod shot where the frame edges do NOT move at all. Do NOT default to static — most handheld, selfie, phone, and UGC footage has constant natural shake and is handheld, not static.',
  '  · push_in / pull_out = the frame steadily zooms or dollies in / out (framing tightens / widens). handheld = organic shake/drift with no single direction. whip = a fast blurred swing. varied = it clearly changes between shots.',
  '  · When the frame moves but you are unsure which kind, prefer handheld over static; only choose static when the frame is genuinely locked.',
  `- decisionStream: timed edit events []: {family, tMs, confidence 0-1}. family MUST be one of: ${VISUAL_FAMILIES.join(', ')}.`,
  '- Do NOT report cuts or transitions (hard cut / dissolve / whip / fade) — those are measured separately. Only report the families listed above.',
  '- Report ONLY what you actually see. Omit uncertain fields. Do not guess.',
  '- Output ONLY valid JSON. No markdown, no prose.',
  '</rules>',
  '<output_format>',
  '{"treatment":{},"typography":{},"structure":{"slots":[]},"graphics":{"classes":[],"density":""},"performance":{},"decisionStream":[{"family":"","tMs":0,"confidence":0}]}',
  '</output_format>',
].join('\n');

export type UploadVisualReference = (
  videoUrl: string,
  contentType: string,
) => Promise<string>;

export type GenerateVisual = (
  fileUri: string,
  contentType: string,
  prompt: string,
  seed?: number,
) => Promise<string>;

export interface ExtractVisualFingerprintOptionsV1 {
  seed?: number;
  upload?: UploadVisualReference;
  generate?: GenerateVisual;
}

export class VisualFingerprintExtractionErrorV1 extends Error {
  constructor(
    public readonly code:
      | 'canonical_source_required'
      | 'canonical_media_reader_required'
      | 'model_response_invalid',
    message: string,
  ) {
    super(message);
    this.name = 'VisualFingerprintExtractionErrorV1';
  }
}

export async function extractVisualFingerprint(
  input: Readonly<CanonicalReferenceAnalysisInputV1> | string,
  opts: Readonly<ExtractVisualFingerprintOptionsV1> = {},
): Promise<VisualExtractionTarget> {
  if (typeof input === 'string') {
    throw new VisualFingerprintExtractionErrorV1(
      'canonical_source_required',
      'Visual fingerprint extraction requires a scoped canonical reference receipt',
    );
  }
  assertCanonicalReferenceAnalysisSourceV1(input);
  const contentType = input.source.registration.contentType;
  const upload = opts.upload ?? defaultUpload;
  const fileUri = await upload(input.source.videoUrl, contentType);
  const generate = opts.generate ?? defaultGenerate;
  const text = await generate(fileUri, contentType, VISUAL_PROMPT, opts.seed);
  return parseVisualExtraction(text, {
    ...(input.source.durationSec === undefined
      ? {}
      : { durationMs: input.source.durationSec * 1_000 }),
  });
}

async function defaultUpload(videoUrl: string, contentType: string): Promise<string> {
  const { uploadReferenceVideoToGemini } = await import(
    '@/lib/editron/services/reference-gemini-upload-v1'
  );
  return uploadReferenceVideoToGemini(videoUrl, contentType);
}

/** Real provider call receives only the URI returned by the upload owner. */
async function defaultGenerate(
  fileUri: string,
  contentType: string,
  prompt: string,
  seed?: number,
): Promise<string> {
  const { getAnalysisModel } = await import('@/lib/editron/utils/gemini-model-factory');
  const model = await getAnalysisModel();
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ fileData: { fileUri, mimeType: contentType } }, { text: prompt }],
      },
    ],
    generationConfig: { temperature: 0, ...(seed !== undefined ? { seed } : {}) },
  });
  return result.response.text();
}

// ─── Strict parse (the testable core) ───────────────────────────────────────

const VisualObservationSchema = z.object({
  treatment: z.object({
    saturate: z.number().finite().min(0.5).max(2).optional(),
    contrast: z.number().finite().min(0.5).max(2).optional(),
    brightness: z.number().finite().min(0.5).max(2).optional(),
    sepia: z.number().finite().min(0).max(1).optional(),
    hueRotateDeg: z.number().finite().min(-180).max(180).optional(),
    grain: z.number().finite().min(0).max(1).optional(),
  }).strict().optional(),
  typography: z.object({
    textCase: z.enum(['upper', 'sentence', 'lower', 'as-is']).optional(),
    reveal: z.enum(['none', 'fade', 'slide-up', 'pop', 'typewriter']).optional(),
    position: z.enum(['center', 'lower_third', 'top', 'varied']).optional(),
  }).strict().optional(),
  structure: z.object({
    slots: z.array(z.object({
      role: z.string().trim().min(1).max(80),
      startMs: z.number().finite().nonnegative(),
      endMs: z.number().finite().positive(),
    }).strict()).max(5_000),
  }).strict().optional(),
  graphics: z.object({
    classes: z.array(z.string().trim().min(1).max(120)).max(128),
    density: z.enum(['heavy', 'moderate', 'minimal']).optional(),
  }).strict().optional(),
  performance: z.object({
    shotScales: z.array(z.enum(['ecu', 'cu', 'mcu', 'ms', 'ws', 'ews'])).max(256).optional(),
    subjectPosition: z.enum(['left', 'center', 'right', 'varied']).optional(),
    cameraMotion: z.enum(['static', 'push_in', 'pull_out', 'handheld', 'whip', 'varied']).optional(),
  }).strict().optional(),
  decisionStream: z.array(z.object({
    family: z.enum(VISUAL_FAMILIES),
    tMs: z.number().finite().nonnegative(),
    confidence: z.number().finite().min(0).max(1),
  }).strict()).max(10_000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export interface ParseVisualExtractionOptionsV1 {
  durationMs?: number;
}

/** Parse one strict learned observation; malformed or invented fields fail. */
export function parseVisualExtraction(
  text: string,
  options: Readonly<ParseVisualExtractionOptionsV1> = {},
): VisualExtractionTarget {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw invalidModelResponse('Visual fingerprint model returned no JSON');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    throw invalidModelResponse('Visual fingerprint model returned malformed JSON');
  }
  const parsed = VisualObservationSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalidModelResponse('Visual fingerprint model response violated its schema');
  }
  validateTiming(parsed.data, options.durationMs);

  const decisions: FingerprintDecision[] | undefined = parsed.data.decisionStream?.map((decision) => ({
    family: decision.family,
    anchor: { kind: 'none', tMs: decision.tMs },
    params: {},
    confidence: decision.confidence,
  }));
  return {
    ...(parsed.data.treatment ? { treatment: parsed.data.treatment } : {}),
    ...(parsed.data.typography ? { typography: parsed.data.typography } : {}),
    ...(parsed.data.structure ? { structure: parsed.data.structure } : {}),
    ...(parsed.data.graphics ? { graphics: parsed.data.graphics } : {}),
    ...(parsed.data.performance ? { performance: parsed.data.performance } : {}),
    ...(decisions ? { decisionStream: decisions } : {}),
  };
}

function validateTiming(
  value: z.infer<typeof VisualObservationSchema>,
  durationMs: number | undefined,
): void {
  let priorStartMs = -1;
  for (const slot of value.structure?.slots ?? []) {
    if (slot.endMs <= slot.startMs || slot.startMs < priorStartMs) {
      throw invalidModelResponse('Visual fingerprint structure slots are invalid or unordered');
    }
    if (durationMs !== undefined && slot.endMs > durationMs) {
      throw invalidModelResponse('Visual fingerprint structure exceeds source duration');
    }
    priorStartMs = slot.startMs;
  }
  if (durationMs !== undefined
    && (value.decisionStream ?? []).some((decision) => decision.tMs > durationMs)) {
    throw invalidModelResponse('Visual fingerprint decision exceeds source duration');
  }
}

function invalidModelResponse(message: string): VisualFingerprintExtractionErrorV1 {
  return new VisualFingerprintExtractionErrorV1('model_response_invalid', message);
}
