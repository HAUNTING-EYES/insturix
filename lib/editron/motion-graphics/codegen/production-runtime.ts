import { promises as fs } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { chatCompletionsUrl } from '@/lib/editron/reference-video/glm-vision-client';

import {
  CODEGEN_STABLE_PREFIX,
  MgProviderFailureError,
  mgProviderHttpError,
  type CodegenDeps,
} from './codegen-service';
import { phases } from './kit/choreo';
import { JUDGE_PROMPT } from './prompt';
import type { MgMomentInput, MgVisualEvidence, MgVisualEvidenceFrame } from './types';
import {
  createMgVisualJudgeProvider,
  resolveMgVisualJudgeProviderName,
  type MgVisualJudgeImage,
} from './visual-judge-provider';
import {
  cleanupWorkspace,
  renderMomentToWebpFrames,
  type MgRenderInput,
  type MgRenderResult,
} from './render/frame-renderer';
import { mgRenderSanityGate, mgMotionPresenceGate } from './mg-placement-gate';

type RenderFn = (input: MgRenderInput, opts?: ProductionMgRuntimeOptions['renderOpts']) => Promise<MgRenderResult>;
type CleanupFn = (workspaceDir: string) => Promise<void>;

const JUDGE_ATTEMPTS = [
  { seed: 42, maxOutputTokens: 1_200 },
  { seed: 7, maxOutputTokens: 4_096 },
] as const;
const DEFAULT_ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const DEFAULT_MG_CODEGEN_MODEL = 'glm-5v-turbo';
const DEFAULT_COMPONENT_TIMEOUT_MS = 3 * 60 * 1_000;
const COMPONENT_MAX_OUTPUT_TOKENS = 32_768;

export interface ProductionMgRuntimeOptions {
  render?: RenderFn;
  cleanup?: CleanupFn;
  renderOpts?: { repoRoot?: string; workspaceRoot?: string; kitDir?: string };
  writeComponent?: (prompt: string) => Promise<string>;
  judgeRendered?: (render: MgRenderResult, moment: MgMomentInput) => Promise<{ score: number; issues: string[] }>;
  /** Deterministic render-sanity guard (defaults to the real one). Tests inject a pass-through to exercise the
   *  judge in isolation. */
  renderSanityGate?: (render: MgRenderResult, moment: MgMomentInput) => Promise<{ pass: boolean; reasons: string[] }>;
}

export interface ProductionMgRuntime {
  codegen: CodegenDeps;
  render: RenderFn;
  cleanup: CleanupFn;
  dispose(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function providerError(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const direct = readString(payload, 'message');
  if (direct) return direct;
  return isRecord(payload.error) ? readString(payload.error, 'message') : undefined;
}

function providerStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const direct = readNumber(error, 'status') ?? readNumber(error, 'statusCode');
  if (direct) return direct;
  return isRecord(error.response) ? readNumber(error.response, 'status') : undefined;
}

function normalizeProviderFailure(input: {
  provider: 'zai' | 'gemini';
  operation: 'component-generation' | 'visual-judge';
  error: unknown;
}): MgProviderFailureError {
  if (input.error instanceof MgProviderFailureError) return input.error;
  const message = input.error instanceof Error ? input.error.message : String(input.error ?? 'provider request failed');
  const statusCode = providerStatus(input.error);
  if (statusCode) {
    return mgProviderHttpError({
      provider: input.provider,
      operation: input.operation,
      statusCode,
      message,
    });
  }
  return new MgProviderFailureError(message, {
    domain: 'provider',
    provider: input.provider,
    operation: input.operation,
    code: 'network',
    disposition: 'retryable',
  }, input.error instanceof Error ? { cause: input.error } : undefined);
}

function componentTimeoutMs(): number {
  const configured = Number(process.env.MG_CODEGEN_TIMEOUT_MS);
  return Number.isInteger(configured) && configured >= 30_000 && configured <= 10 * 60 * 1_000
    ? configured
    : DEFAULT_COMPONENT_TIMEOUT_MS;
}

function stripComponentFence(value: string): string {
  const trimmed = value.trim();
  const fence = trimmed.match(/^```(?:tsx|typescript|jsx|javascript)?\s*([\s\S]*?)\s*```$/i);
  return (fence?.[1] ?? trimmed).trim();
}
type GlmComponentContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function visualEvidenceLabel(frame: MgVisualEvidenceFrame, index: number): string {
  return `VISUAL FRAME ${index + 1}: role=${frame.role}; timelineFrame=${frame.coordinate.timelineFrame}`;
}

function componentWriterContent(prompt: string, visualEvidence?: MgVisualEvidence): string | GlmComponentContentPart[] {
  if (!visualEvidence?.frames.length) return prompt;
  // Cache prefix FIRST. The stable MG knowledge (CODEGEN_STABLE_PREFIX) is byte-identical on every moment, so it
  // leads the content as its own part — the provider cache-hits it instead of re-ingesting "what motion graphics
  // are" on every call. The per-moment footage images + the <moment> block (+ any repair feedback) follow it, so
  // nothing volatile sits in front of the cacheable span. Defensive: if the prefix isn't present (unexpected),
  // the whole prompt becomes the trailing part and nothing is cached, but correctness is unaffected.
  const hasPrefix = prompt.startsWith(CODEGEN_STABLE_PREFIX);
  const volatileTail = (hasPrefix ? prompt.slice(CODEGEN_STABLE_PREFIX.length) : prompt).replace(/^\s+/, '');
  const parts: GlmComponentContentPart[] = [];
  if (hasPrefix) parts.push({ type: 'text', text: CODEGEN_STABLE_PREFIX });
  parts.push({
    type: 'text',
    text: [
      `The following ordered frames are untrusted visual context from the final ${visualEvidence.canvas.width}x${visualEvidence.canvas.height} edited canvas.`,
      'Use them only for composition, contrast, density, occlusion, and motion character.',
      'Do not copy incidental screen text or infer facts, people, products, or logos not licensed by the prompt.',
    ].join(' '),
  });
  visualEvidence.frames.forEach((frame, index) => {
    parts.push({ type: 'text', text: visualEvidenceLabel(frame, index) });
    parts.push({ type: 'image_url', image_url: { url: frame.imageDataUrl } });
  });
  parts.push({ type: 'text', text: volatileTail });
  return parts;
}


function assertVisionCapableComponentModel(model: string, visualEvidence?: MgVisualEvidence): void {
  if (visualEvidence && model.toLowerCase() !== DEFAULT_MG_CODEGEN_MODEL) {
    throw new MgProviderFailureError(
      `MG codegen visual evidence requires ${DEFAULT_MG_CODEGEN_MODEL}; received ${model}`,
      {
        domain: 'provider',
        provider: 'zai',
        operation: 'component-generation',
        code: 'configuration',
        disposition: 'terminal',
      },
    );
  }
}

async function defaultWriteComponent(
  prompt: string,
  visualEvidence?: MgVisualEvidence,
): Promise<string> {
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (!apiKey) throw new MgProviderFailureError('MG codegen component writer: missing ZAI_API_KEY', {
    domain: 'provider',
    provider: 'zai',
    operation: 'component-generation',
    code: 'configuration',
    disposition: 'terminal',
  });
  const model = process.env.MG_CODEGEN_MODEL?.trim() || DEFAULT_MG_CODEGEN_MODEL;
  assertVisionCapableComponentModel(model, visualEvidence);
  const baseUrl = process.env.ZAI_BASE_URL?.trim() || DEFAULT_ZAI_BASE_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), componentTimeoutMs());

  try {
    const response = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: componentWriterContent(prompt, visualEvidence) }],
        stream: false,
        do_sample: false,
        max_tokens: COMPONENT_MAX_OUTPUT_TOKENS,
        response_format: { type: 'text' },
        thinking: { type: 'enabled', clear_thinking: true },
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = providerError(payload);
      throw mgProviderHttpError({
        provider: 'zai',
        operation: 'component-generation',
        statusCode: response.status,
        message: `MG codegen component writer failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      });
    }
    if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
      throw new MgProviderFailureError('MG codegen component writer returned an invalid completion payload', {
        domain: 'provider', provider: 'zai', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
      });
    }
    const choice = payload.choices[0];
    const message = isRecord(choice.message) ? choice.message : null;
    const finishReason = readString(choice, 'finish_reason') ?? 'unknown';
    const usage = isRecord(payload.usage) ? payload.usage : {};
    const totalTokens = readNumber(usage, 'total_tokens');
    const completionTokens = readNumber(usage, 'completion_tokens');
    console.info(`[MGCodegen] GLM component writer finished: model=${model}, visualFrames=${visualEvidence?.frames.length ?? 0}, finishReason=${finishReason}, totalTokens=${totalTokens ?? 'unknown'}, completionTokens=${completionTokens ?? 'unknown'}`);
    if (finishReason === 'length' || finishReason === 'model_context_window_exceeded') {
      throw new MgProviderFailureError(`MG codegen component truncated: finishReason=${finishReason}, maxOutputTokens=${COMPONENT_MAX_OUTPUT_TOKENS}, totalTokens=${totalTokens ?? 'unknown'}, completionTokens=${completionTokens ?? 'unknown'}`, {
        domain: 'provider', provider: 'zai', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
      });
    }
    if (finishReason !== 'stop') {
      throw new MgProviderFailureError(`MG codegen component writer stopped unexpectedly: finishReason=${finishReason}`, {
        domain: 'provider', provider: 'zai', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
      });
    }
    const source = message ? stripComponentFence(readString(message, 'content') ?? '') : '';
    if (!source) throw new MgProviderFailureError('MG codegen model returned no component source', {
      domain: 'provider', provider: 'zai', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
    });
    return source;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MgProviderFailureError(`MG codegen component writer timed out after ${componentTimeoutMs()}ms`, {
        domain: 'provider', provider: 'zai', operation: 'component-generation', code: 'timeout', disposition: 'retryable',
      }, { cause: error });
    }
    throw normalizeProviderFailure({ provider: 'zai', operation: 'component-generation', error });
  } finally {
    clearTimeout(timeout);
  }
}

function sampleIndices(frameCount: number, brand: MgMomentInput['brand']): number[] {
  const lastFrame = Math.max(0, frameCount - 1);
  const clampFrame = (frame: number) => Math.max(0, Math.min(lastFrame, Math.round(frame)));
  const ph = phases(frameCount, brand);
  const settledHold = ph.resolve + (frameCount - ph.resolve) * 0.35;
  return [...new Set([clampFrame(ph.intro), clampFrame(ph.build), clampFrame(settledHold)])];
}

const JUDGE_EVIDENCE_ROLES: MgVisualEvidenceFrame['role'][] = [
  'context-before',
  'anchor',
  'context-after',
];
const JUDGE_PHASE_LABELS = ['intro', 'build', 'settled-hold'] as const;
const JUDGE_STRESS_BACKGROUNDS = ['#111111', '#f2f2f2'] as const;

function decodeVisualEvidenceFrame(frame: MgVisualEvidenceFrame): Buffer {
  const match = frame.imageDataUrl.match(/^data:image\/(?:jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error(`MG judge received malformed ${frame.role} visual evidence`);
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length) throw new Error(`MG judge received empty ${frame.role} visual evidence`);
  return bytes;
}

function requireJudgeVisualEvidence(moment: MgMomentInput): MgVisualEvidenceFrame[] {
  const frames = moment.visualEvidence?.frames;
  if (!frames || frames.length !== JUDGE_EVIDENCE_ROLES.length) {
    throw new Error('MG judge requires complete edited-canvas visual evidence');
  }
  for (let index = 0; index < JUDGE_EVIDENCE_ROLES.length; index += 1) {
    if (frames[index].role !== JUDGE_EVIDENCE_ROLES[index]) {
      throw new Error(`MG judge expected ${JUDGE_EVIDENCE_ROLES[index]} visual evidence at index ${index}`);
    }
  }
  return frames;
}

async function buildJudgeImages(render: MgRenderResult, moment: MgMomentInput): Promise<MgVisualJudgeImage[]> {
  if (!render.files.length) throw new Error('MG judge cannot evaluate an empty frame sequence');
  const phaseWidth = 540;
  const phaseHeight = Math.max(304, Math.min(960, Math.round(phaseWidth * render.height / render.width)));
  const stressTileWidth = 360;
  const stressTileHeight = Math.max(202, Math.min(640, Math.round(stressTileWidth * render.height / render.width)));
  const indices = sampleIndices(render.files.length, moment.brand);
  const evidenceFrames = requireJudgeVisualEvidence(moment);
  if (indices.length !== evidenceFrames.length) {
    throw new Error(`MG judge requires ${evidenceFrames.length} distinct animation phase samples; received ${indices.length}`);
  }
  const images: MgVisualJudgeImage[] = [];
  const stressComposites: sharp.OverlayOptions[] = [];

  for (let column = 0; column < indices.length; column += 1) {
    const framePath = path.join(render.webpDir, render.files[indices[column]]);
    const frameBytes = await fs.readFile(framePath);
    const phaseFrame = await sharp(frameBytes)
      .resize({ width: phaseWidth, height: phaseHeight, fit: 'contain' })
      .png()
      .toBuffer();
    const footage = await sharp(decodeVisualEvidenceFrame(evidenceFrames[column]))
      .resize({ width: phaseWidth, height: phaseHeight, fit: 'cover' })
      .png()
      .toBuffer();
    const phaseComposite = await sharp(footage).composite([{ input: phaseFrame }]).png().toBuffer();
    images.push({
      label: `${JUDGE_PHASE_LABELS[column]} phase over its matching real edited-canvas frame; generatedFrame=${indices[column]}; timelineFrame=${evidenceFrames[column].coordinate.timelineFrame}`,
      image: phaseComposite,
      mimeType: 'image/png',
    });

    const stressFrame = await sharp(frameBytes)
      .resize({ width: stressTileWidth, height: stressTileHeight, fit: 'contain' })
      .png()
      .toBuffer();

    for (let stressIndex = 0; stressIndex < JUDGE_STRESS_BACKGROUNDS.length; stressIndex += 1) {
      const tile = await sharp({
        create: {
          width: stressTileWidth,
          height: stressTileHeight,
          channels: 4,
          background: JUDGE_STRESS_BACKGROUNDS[stressIndex],
        },
      }).composite([{ input: stressFrame }]).png().toBuffer();
      stressComposites.push({
        input: tile,
        left: column * stressTileWidth,
        top: stressIndex * stressTileHeight,
      });
    }
  }

  const stressSheet = await sharp({
    create: {
      width: stressTileWidth * indices.length,
      height: stressTileHeight * JUDGE_STRESS_BACKGROUNDS.length,
      channels: 4,
      background: '#000000',
    },
  }).composite(stressComposites).png().toBuffer();
  images.push({
    label: 'contrast-only stress sheet; columns=intro/build/settled-hold; top row=dark; bottom row=light; do not use this image for placement or subject-obstruction judgments',
    image: stressSheet,
    mimeType: 'image/png',
  });
  return images;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Gemini occasionally wraps otherwise valid JSON despite responseMimeType. Extract one balanced object.
  }
  const start = trimmed.indexOf('{');
  if (start < 0) throw new Error('response did not contain a JSON object');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }
  throw new Error('response contained an incomplete JSON object');
}

// Taste-gate layer-2 craft dimensions the rubric scores 0-10. OPTIONAL in the parser: the Gemini judge path
// enforces them via responseSchema, but the ZAI path (no schema) and legacy fixtures may omit them — a missing
// dimension is not an error. When present, a dimension below WEAK_DIMENSION_SCORE is surfaced as an actionable
// issue so the revision loop knows WHICH craft axis to fix. The accept gate stays the disciplined holistic `score`.
const JUDGE_DIMENSIONS = ['hierarchy', 'typography', 'color', 'composition', 'motion', 'form'] as const;
const WEAK_DIMENSION_SCORE = 6; // ⚠ tunable — surfaces a weak axis as text (revision hint); the CAPS below are the code-enforced gate.
// The rubric's OWN documented score caps, enforced in code (P5-1 Phase D-2) so a model that overstates a holistic
// score while a craft axis is failing cannot slip past the accept gate. Each value ← a stated JUDGE_PROMPT rule:
const JUDGE_DIMENSION_CAP = 4;       // ← "never award 8+ while any dimension is ≤4"
const JUDGE_DIMENSION_CAP_SCORE = 7; // ← the "not 8+" ceiling (7 < the 7.5 accept threshold → a ≤4 dimension blocks acceptance)
const JUDGE_FORM_CAP = 4;            // ← "if form ≤ 4 (undesigned bare-text output)"
const JUDGE_FORM_CAP_SCORE = 6;      // ← "...score is at most 6"

export function parseJudgeResponse(response: string): { score: number; issues: string[] } {
  const parsed = JSON.parse(extractJsonObject(response)) as Record<string, unknown>;
  if (typeof parsed.faithful !== 'boolean') throw new Error('faithful must be a boolean');
  if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) throw new Error('score must be a finite number');
  if (!Array.isArray(parsed.issues) || parsed.issues.some((issue) => typeof issue !== 'string')) {
    throw new Error('issues must be an array of strings');
  }
  const issues = (parsed.issues as string[]).slice(0, 20);

  // Read the craft-dimension scores that are PRESENT (the ZAI/legacy path may omit them — a missing dimension is
  // not an error, and caps only bind on dimensions the judge actually reported).
  const dims = new Map<string, number>();
  const weak: string[] = [];
  for (const dim of JUDGE_DIMENSIONS) {
    const value = parsed[dim];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const clamped = Math.max(0, Math.min(10, value));
      dims.set(dim, clamped);
      if (clamped < WEAK_DIMENSION_SCORE) weak.push(`weak ${dim} (${clamped}/10)`);
    }
  }

  if (!parsed.faithful) {
    const unfaithful = [...issues, ...weak].slice(0, 25);
    return { score: 0, issues: unfaithful.length ? unfaithful : ['render is not faithful to the licensed fact'] };
  }

  let score = Math.max(0, Math.min(10, parsed.score));
  const capNotes: string[] = [];
  const minDim = dims.size ? Math.min(...dims.values()) : undefined;
  if (minDim !== undefined && minDim <= JUDGE_DIMENSION_CAP && score > JUDGE_DIMENSION_CAP_SCORE) {
    score = JUDGE_DIMENSION_CAP_SCORE;
    capNotes.push(`score capped at ${JUDGE_DIMENSION_CAP_SCORE}: a craft dimension scored ${minDim}/10 (≤${JUDGE_DIMENSION_CAP}) — the rubric forbids 8+ with any dimension that low`);
  }
  const form = dims.get('form');
  if (form !== undefined && form <= JUDGE_FORM_CAP && score > JUDGE_FORM_CAP_SCORE) {
    score = JUDGE_FORM_CAP_SCORE;
    capNotes.push(`score capped at ${JUDGE_FORM_CAP_SCORE}: form ${form}/10 (≤${JUDGE_FORM_CAP}) — undesigned/minimum-viable text cannot score above ${JUDGE_FORM_CAP_SCORE}`);
  }

  return { score, issues: [...issues, ...weak, ...capNotes].slice(0, 25) };
}

async function defaultJudgeRendered(
  render: MgRenderResult,
  moment: MgMomentInput,
): Promise<{ score: number; issues: string[] }> {
  const images = await buildJudgeImages(render, moment);
  const providerName = resolveMgVisualJudgeProviderName();
  let provider: Awaited<ReturnType<typeof createMgVisualJudgeProvider>>;
  try {
    provider = await createMgVisualJudgeProvider();
  } catch (error) {
    throw normalizeProviderFailure({ provider: providerName, operation: 'visual-judge', error });
  }
  console.info(`[MGCodegen] Visual judge configured: provider=${provider.name}, model=${provider.model}`);
  const fact = JSON.stringify({
    factKind: moment.candidate.factKind,
    rhetoricalRole: moment.candidate.rhetoricalRole,
    content: moment.candidate.content,
    sourceText: moment.candidate.sourceSpan.text,
    placement: moment.placement,
    // P5-2(b): the REAL V-JEPA subject box (frame fractions), when known — the judge checks obstruction against these
    // coordinates instead of eyeballing. Absent → the judge falls back to reading the composite alone (unchanged).
    subject: moment.screen?.subject,
  }).slice(0, 6000);
  const prompt = `${JUDGE_PROMPT}

LICENSED FACT JSON:
${fact}`;
  let lastError = 'unknown structured-output failure';
  let lastFailure: MgProviderFailureError | null = null;
  for (let attempt = 0; attempt < JUDGE_ATTEMPTS.length; attempt += 1) {
    let finishReason = 'unknown';
    let totalTokens: number | undefined;
    let thoughtsTokens: number | undefined;
    try {
      const strictRetry = attempt === 0 ? '' : '\nYour prior response was malformed. Return exactly one complete JSON object matching the schema.';
      const result = await provider.generate({
        images,
        prompt: `${prompt}${strictRetry}`,
        seed: JUDGE_ATTEMPTS[attempt].seed,
        maxOutputTokens: JUDGE_ATTEMPTS[attempt].maxOutputTokens,
      });
      finishReason = result.finishReason;
      totalTokens = result.totalTokens;
      thoughtsTokens = result.thoughtsTokens;
      const response = result.text;
      if (!response) throw new MgProviderFailureError('MG visual judge returned an empty response', {
        domain: 'provider', provider: providerName, operation: 'visual-judge', code: 'invalid-response', disposition: 'terminal',
      });
      try {
        return parseJudgeResponse(response);
      } catch (error) {
        throw new MgProviderFailureError('MG visual judge returned invalid structured output', {
          domain: 'provider', provider: providerName, operation: 'visual-judge', code: 'invalid-response', disposition: 'terminal',
        }, error instanceof Error ? { cause: error } : undefined);
      }
    } catch (error) {
      const failure = normalizeProviderFailure({ provider: providerName, operation: 'visual-judge', error });
      const message = failure.message;
      lastFailure = failure;
      lastError = `${message} (finishReason=${finishReason}, totalTokens=${totalTokens ?? 'unknown'}, thoughtsTokens=${thoughtsTokens ?? 'unknown'})`;
      console.warn(`[MGCodegen] Visual judge structured output failed (${attempt + 1}/${JUDGE_ATTEMPTS.length}): ${lastError.slice(0, 240)}`);
    }
  }
  throw new MgProviderFailureError(
    `MG visual judge failed after ${JUDGE_ATTEMPTS.length} attempts: ${lastError.slice(0, 240)}`,
    lastFailure?.failure ?? {
      domain: 'provider', provider: providerName, operation: 'visual-judge', code: 'network', disposition: 'retryable',
    },
    lastFailure ? { cause: lastFailure } : undefined,
  );
}

/**
 * Deterministic render-sanity guard on the SETTLED-HOLD frame (see mg-placement-gate for WHY it is this narrow).
 * It catches only the two degenerate renders that are wrong at every point of the chip→full-frame spectrum: a
 * blank component (no visible pixels) and a near-opaque full-frame field that hides the footage. Placement, size,
 * and subject-clearance are taste over content — the vision judge's job (it sees the footage composite), not a
 * blind-alpha veto: there is no face detection to veto against, and a full-frame MG is legitimate (Tier-B).
 */
async function runMgRenderSanityGate(render: MgRenderResult, moment: MgMomentInput): Promise<{ pass: boolean; reasons: string[] }> {
  if (!render.files.length) return { pass: false, reasons: ['the component rendered no frames'] };
  const indices = sampleIndices(render.files.length, moment.brand);
  const settledHold = indices[indices.length - 1]; // settled-hold = fullest presence, before the exit-out release
  const frame = await fs.readFile(path.join(render.webpDir, render.files[settledHold]));
  const sanity = await mgRenderSanityGate(frame);
  // Taste-gate floor, check 2: MOTION PRESENCE across the sequence — fail a component that renders fine but sits
  // FROZEN (the "static / no motion" failure). Read a spread of ~6 frames; the measure + threshold live in the
  // gate module. Objective (not taste): a frozen render is broken at every point of the chip→full-frame spectrum.
  if (render.files.length < 2) return sanity; // can't judge motion on a single frame — leave it to sanity + judge
  const n = Math.min(6, render.files.length);
  const motionIdx = Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (render.files.length - 1)));
  const motionFrames = await Promise.all(motionIdx.map((i) => fs.readFile(path.join(render.webpDir, render.files[i]))));
  const motion = await mgMotionPresenceGate(motionFrames);
  return { pass: sanity.pass && motion.pass, reasons: [...sanity.reasons, ...motion.reasons] };
}

export function createProductionMgRuntime(
  moment: MgMomentInput,
  canvas: { width: number; height: number },
  options: ProductionMgRuntimeOptions = {},
): ProductionMgRuntime {
  const renderFrames = options.render ?? renderMomentToWebpFrames;
  const cleanup = options.cleanup ?? cleanupWorkspace;
  const writeComponent = options.writeComponent
    ?? ((prompt: string) => defaultWriteComponent(prompt, moment.visualEvidence));
  const judgeRendered = options.judgeRendered ?? defaultJudgeRendered;
  const renderSanityGate = options.renderSanityGate ?? runMgRenderSanityGate;
  let cached: { code: string; result: MgRenderResult } | null = null;

  const discardCached = async (): Promise<void> => {
    if (!cached) return;
    const workspaceDir = cached.result.workspaceDir;
    cached = null;
    await cleanup(workspaceDir);
  };
  const renderCode = async (code: string): Promise<MgRenderResult> => {
    await discardCached();
    const result = await renderFrames({
      componentSource: code,
      brand: moment.brand,
      // Reserved system props AFTER content (never shadowed) — same merge as render-moment.ts (P5-1).
      data: {
        ...moment.candidate.content,
        ...(moment.anchors?.wordFrames?.length ? { wordFrames: moment.anchors.wordFrames } : {}),
        ...(typeof moment.motionIntensity === 'number' ? { motionIntensity: moment.motionIntensity } : {}),
      },
      width: canvas.width,
      height: canvas.height,
      fps: moment.window.fps,
      durationInFrames: Math.max(1, Math.round(moment.window.endFrame - moment.window.startFrame)),
    }, options.renderOpts);
    cached = { code, result };
    return result;
  };

  return {
    codegen: {
      writeComponent,
      compile: async (code) => {
        try {
          await renderCode(code);
          return { ok: true };
        } catch (error) {
          await discardCached();
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
      evaluate: async (code, input) => {
        const rendered = cached?.code === code ? cached.result : await renderCode(code);
        // Deterministic render-sanity guard FIRST: catches the two degenerate renders (blank / opaque-full-frame)
        // the judge shouldn't have to. Cheap (~one downsampled frame), so run it before the VLM judge and skip
        // that call when it trips. score 0 → generateMoment's `score < threshold` forces a revision or decline.
        const gate = await renderSanityGate(rendered, input);
        if (!gate.pass) {
          return { score: 0, issues: gate.reasons.map((reason) => `render: ${reason}`) };
        }
        return judgeRendered(rendered, input);
      },
    },
    render: async (input, renderOpts) => {
      if (cached?.code === input.componentSource) {
        const result = cached.result;
        cached = null;
        return result;
      }
      return renderFrames(input, renderOpts ?? options.renderOpts);
    },
    cleanup,
    dispose: discardCached,
  };
}
