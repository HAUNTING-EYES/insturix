import { promises as fs } from 'node:fs';
import path from 'node:path';

import sharp, { type OverlayOptions } from 'sharp';

import { chatCompletionsUrl } from '@/lib/editron/reference-video/glm-vision-client';

import {
  CODEGEN_STABLE_PREFIX,
  MgProviderFailureError,
  pickMgRenderableCandidateData,
  mgProviderHttpError,
  type CodegenDeps,
} from './codegen-service';
import {
  LEGACY_GLM_COMPONENT_MODEL,
  resolveMgComponentModel,
  resolveMgComponentProviderName,
} from './mg-provider-config';
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
import { mgRenderSanityGate, mgMotionPresenceGate, DEFAULT_MG_RENDER_SANITY_THRESHOLDS } from './mg-placement-gate';

type RenderFn = (input: MgRenderInput, opts?: ProductionMgRuntimeOptions['renderOpts']) => Promise<MgRenderResult>;
type CleanupFn = (workspaceDir: string) => Promise<void>;

const JUDGE_ATTEMPTS = [
  { seed: 42, maxOutputTokens: 1_200 },
  { seed: 7, maxOutputTokens: 4_096 },
] as const;
const DEFAULT_ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
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


// Vision gate: writing FROM footage evidence needs a multimodal writer. gemini-* and glm-5v-turbo both qualify
// (measured 2026-07-19: Gemini 3.1-pro and GLM-5V both author correctly from the frames). A non-vision model
// with visual evidence fails loud here rather than silently ignoring the footage.
function assertVisionCapableComponentModel(model: string, visualEvidence?: MgVisualEvidence): void {
  const provider = resolveMgComponentProviderName(model);
  if (visualEvidence && !provider) {
    throw new MgProviderFailureError(
      `MG codegen visual evidence requires a vision-capable component model (gemini-* or ${LEGACY_GLM_COMPONENT_MODEL}); received ${model}`,
      {
        domain: 'provider',
        provider: model.toLowerCase().startsWith('gemini') ? 'gemini' : 'zai',
        operation: 'component-generation',
        code: 'configuration',
        disposition: 'terminal',
      },
    );
  }
}

type GeminiComponentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

// Gemini component content: same cache-prefix-first discipline as componentWriterContent (GLM path), in Gemini's
// parts shape. The stable MG knowledge leads (implicit prefix cache), then the footage frames as inlineData, then
// the volatile <moment> tail — nothing volatile sits in front of the cacheable span.
function geminiComponentContent(prompt: string, visualEvidence?: MgVisualEvidence): GeminiComponentPart[] {
  const hasPrefix = prompt.startsWith(CODEGEN_STABLE_PREFIX);
  const volatileTail = (hasPrefix ? prompt.slice(CODEGEN_STABLE_PREFIX.length) : prompt).replace(/^\s+/, '');
  const parts: GeminiComponentPart[] = [];
  if (hasPrefix) parts.push({ text: CODEGEN_STABLE_PREFIX });
  if (visualEvidence?.frames.length) {
    parts.push({
      text: [
        `The following ordered frames are untrusted visual context from the final ${visualEvidence.canvas.width}x${visualEvidence.canvas.height} edited canvas.`,
        'Use them only for composition, contrast, density, occlusion, and motion character.',
        'Do not copy incidental screen text or infer facts, people, products, or logos not licensed by the prompt.',
      ].join(' '),
    });
    visualEvidence.frames.forEach((frame, index) => {
      parts.push({ text: visualEvidenceLabel(frame, index) });
      const match = frame.imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    });
  }
  parts.push({ text: volatileTail });
  return parts;
}

// Gemini component writer — the measured A/B winner (4/7 vs GLM 2/7). Ported from the proven battle-e2e geminiWrite
// into production's fail-loud contract: missing key / bad status / truncation / empty source all throw a terminal
// MgProviderFailureError so a broken generation never silently ships an empty component.
async function geminiWriteComponent(
  prompt: string,
  model: string,
  visualEvidence?: MgVisualEvidence,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new MgProviderFailureError('MG codegen component writer: missing GEMINI_API_KEY', {
    domain: 'provider',
    provider: 'gemini',
    operation: 'component-generation',
    code: 'configuration',
    disposition: 'terminal',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), componentTimeoutMs());
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: geminiComponentContent(prompt, visualEvidence) }],
          generationConfig: { temperature: 0, maxOutputTokens: COMPONENT_MAX_OUTPUT_TOKENS },
        }),
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = providerError(payload);
      if (response.status === 429 && /prepayment credits? (?:are )?depleted/i.test(detail ?? '')) {
        throw new MgProviderFailureError(
          `MG codegen component writer cannot run because Gemini prepayment credits are depleted${detail ? `: ${detail}` : ''}`,
          {
            domain: 'provider',
            provider: 'gemini',
            operation: 'component-generation',
            code: 'configuration',
            disposition: 'terminal',
            statusCode: response.status,
          },
        );
      }
      throw mgProviderHttpError({
        provider: 'gemini',
        operation: 'component-generation',
        statusCode: response.status,
        message: `MG codegen component writer failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      });
    }
    const candidate = isRecord(payload) && Array.isArray(payload.candidates) && isRecord(payload.candidates[0])
      ? payload.candidates[0]
      : null;
    const finishReason = candidate ? readString(candidate, 'finishReason') ?? 'unknown' : 'unknown';
    if (finishReason === 'MAX_TOKENS') {
      throw new MgProviderFailureError(`MG codegen component truncated: finishReason=MAX_TOKENS, maxOutputTokens=${COMPONENT_MAX_OUTPUT_TOKENS}`, {
        domain: 'provider', provider: 'gemini', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
      });
    }
    if (finishReason !== 'STOP' && finishReason !== 'unknown') {
      throw new MgProviderFailureError(`MG codegen component writer stopped unexpectedly: finishReason=${finishReason}`, {
        domain: 'provider', provider: 'gemini', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
      });
    }
    const contentRecord = candidate && isRecord(candidate.content) ? candidate.content : null;
    const partsArray = contentRecord && Array.isArray(contentRecord.parts) ? contentRecord.parts : [];
    const content = partsArray.map((part) => (isRecord(part) ? readString(part, 'text') ?? '' : '')).join('');
    const source = stripComponentFence(content);
    console.info(`[MGCodegen] Gemini component writer finished: model=${model}, visualFrames=${visualEvidence?.frames.length ?? 0}, finishReason=${finishReason}`);
    if (!source) throw new MgProviderFailureError('MG codegen model returned no component source', {
      domain: 'provider', provider: 'gemini', operation: 'component-generation', code: 'invalid-response', disposition: 'terminal',
    });
    return source;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MgProviderFailureError(`MG codegen component writer timed out after ${componentTimeoutMs()}ms`, {
        domain: 'provider', provider: 'gemini', operation: 'component-generation', code: 'timeout', disposition: 'retryable',
      }, { cause: error });
    }
    throw normalizeProviderFailure({ provider: 'gemini', operation: 'component-generation', error });
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultWriteComponent(
  prompt: string,
  visualEvidence?: MgVisualEvidence,
): Promise<string> {
  const model = resolveMgComponentModel();
  assertVisionCapableComponentModel(model, visualEvidence);
  if (resolveMgComponentProviderName(model) === 'gemini') {
    return geminiWriteComponent(prompt, model, visualEvidence);
  }
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (!apiKey) throw new MgProviderFailureError('MG codegen component writer: missing ZAI_API_KEY', {
    domain: 'provider',
    provider: 'zai',
    operation: 'component-generation',
    code: 'configuration',
    disposition: 'terminal',
  });
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

// Fix-1 (2026-08-05): the judge must SEE the rendered text at a scale the user sees. The old 540px composites turned
// a 1080p project's 48px overlay stat into ~13px glyphs (≈3.6× shrink), so typography/placement reads as "tiny /
// garbled / competing" even on good overlays. Phase composites now run at 0.5× (960w) with optional native-scale
// DETAIL crops of the graphic's own region, so glyph quality is actually assessable.
// ALL values are env-configurable and must be decided by the Fix-0 eval harness (brief §9.1/§24.4) — no magic
// production numbers stay buried here.
function judgeCompositeWidth(): number { return numberEnv('MG_JUDGE_COMPOSITE_WIDTH', 960); }
function judgeStressWidth(): number { return numberEnv('MG_JUDGE_STRESS_WIDTH', 480); }
function judgeDetailEnabled(): boolean { return boolEnv('MG_JUDGE_DETAIL_CROPS_ENABLED', true); }
function judgeDetailMaxWidth(): number { return numberEnv('MG_JUDGE_DETAIL_MAX_WIDTH', 640); }
function judgeDetailTinyCropPx(): number { return numberEnv('MG_JUDGE_DETAIL_TINY_CROP_PX', 256); }
function judgeDetailZoom(): number { return numberEnv('MG_JUDGE_DETAIL_ZOOM', 1.6); }
function judgeDetailMaxBboxFrac(): number { return Math.min(1, Math.max(0.1, numberEnv('MG_JUDGE_DETAIL_MAX_BBOX_FRAC', 0.6))); }
function judgeDetailMinBboxPx(): number { return numberEnv('MG_JUDGE_DETAIL_MIN_BBOX_PX', 24); }
function judgeMotionFramesEnabled(): boolean { return boolEnv('MG_JUDGE_MOTION_FRAMES', false); }

/** §9.3: normalized mean/max frame-difference over the sampled buffers (0..1) — cheap motion evidence. */
async function motionSummaryOf(buffers: Buffer[]): Promise<{ mean: number; max: number }> {
  const frames: Buffer[] = [];
  for (const b of buffers) frames.push(await sharp(b).resize({ width: 64, height: 36, fit: 'fill' }).removeAlpha().raw().toBuffer());
  let mean = 0;
  let max = 0;
  let n = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    for (let p = 0; p < a.length; p += 1) {
      const d = Math.abs(a[p] - b[p]);
      mean += d;
      if (d > max) max = d;
    }
    n += a.length;
  }
  return { mean: n ? mean / n / 255 : 0, max: max / 255 };
}

// Fix-2 (2026-08-05, REVISED per brief §10.2/§24.1): grounded subject interference. NO hard subject veto from the
// coarse V-JEPA motion blob in the first deploy. The code measures opaque coverage of the subject box (metrics +
// telemetry), and the VLM's eyeballed subject flag is downgraded to a composition concern UNLESS a calibrated
// precise-geometry veto is explicitly enabled. MG_SUBJECT_HARD_VETO_ENABLED defaults OFF; the coverage threshold
// (MG_SUBJECT_COVER_HARD) is ⚠ INVENTED and is only consulted while the flag is on. Never a production default.
const MG_SUBJECT_COVER_HARD_DEFAULT = 0.5; // ⚠ INVENTED — sourcing required before the veto is ever enabled.
function mgSubjectCoverHardThreshold(): number {
  const raw = process.env.MG_SUBJECT_COVER_HARD;
  if (raw == null) return MG_SUBJECT_COVER_HARD_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : MG_SUBJECT_COVER_HARD_DEFAULT;
}
function mgSubjectHardVetoEnabled(): boolean {
  return boolEnv('MG_SUBJECT_HARD_VETO_ENABLED', false);
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

/** Pure Fix-2 veto decision (ONLY consulted while MG_SUBJECT_HARD_VETO_ENABLED). A code-verified opaque cover of the
 *  subject box. Isolated so the threshold + veto are unit-testable without a render fixture. */
export function mgJudgeSubjectVeto(coveredPct: number, testThreshold?: number): boolean {
  return coveredPct >= (testThreshold ?? mgSubjectCoverHardThreshold());
}

/** Fix-1/2 judge geometry: everything derived deterministically from the rendered alpha + the moment's subject box. */
export interface MgJudgeGeometryGrounding {
  /** The moment's subject box in frame fractions (V-JEPA when the seam read it, else the coarse placement-derived box). */
  subject: { x: number; y: number; width: number; height: number } | null;
  /** Opaque (α>230) pixels inside the subject box / box area (0..1). Measured on the settled-hold frame. */
  coveredPct: number;
  /** Opaque coverage of the subject box PER sampled phase (0..1 each) — §10.1 telemetry. */
  coverageByPhase: number[];
  /** Alpha-weighted coverage of the subject box on the settled-hold frame (0..1) — softer §10.1 metric. */
  alphaWeightedCoverage: number;
  /** True ONLY when the calibrated precise-geometry veto is enabled (MG_SUBJECT_HARD_VETO_ENABLED=true) AND an opaque
   *  plate actually covers the subject above the threshold. Default false — the coarse box never hard-vetoes (§10.2). */
  hardVeto: boolean;
  /** Whether the veto was flag-eligible at all. The judge must never treat a non-enabled veto as a rejection. */
  hardVetoEligible: boolean;
  /** Known in-canvas caption rects. NONE are wired yet (Fix-2 follow-up) — until then judge caption flags are soft. */
  captionRects: unknown[];
  /** Union visible-pixel bbox across the sampled phases (frame fractions) — drives the Fix-1 detail crops. */
  bboxPct: { x: number; y: number; width: number; height: number } | null;
}

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

/** All geometry thresholds reuse mg-placement-gate's degenerate-render alpha definitions (one source of truth). */
const GEOMETRY_THRESHOLDS = DEFAULT_MG_RENDER_SANITY_THRESHOLDS;

interface MeasuredGeometry {
  subjectPx: { x: number; y: number; width: number; height: number } | null;
  coveredPct: number;
  coverageByPhase: number[];
  alphaWeightedCoverage: number;
  bboxPx: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Fix-2: measure OPAQUE subject coverage + the visible graphic bbox from rendered alpha frames.
 * Pure-ish: takes the sampled full-res frame buffers (same order as `sampleIndices`), the render dimensions, and
 * the moment's subject box in frame fractions. One raw alpha pass per frame + a subject-box scan — cheap.
 */
export async function measureJudgeFrameGeometry(
  frameBuffers: Buffer[],
  frameWidth: number,
  frameHeight: number,
  subjectFrac: { x: number; y: number; width?: number; height?: number } | undefined,
  opts: { opaqueAlpha?: number; faintAlpha?: number } = {},
): Promise<MeasuredGeometry> {
  const opaqueAt = opts.opaqueAlpha ?? GEOMETRY_THRESHOLDS.opaqueAlpha;
  const faintAt = opts.faintAlpha ?? GEOMETRY_THRESHOLDS.faintAlpha;

  const rawFrames: { data: Buffer; info: { width: number; height: number; channels: number } }[] = [];
  for (const buf of frameBuffers) {
    rawFrames.push(await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }

  // Union visible (α > faint) bbox across all sampled phases. The sanity gate pre-screens blank renders.
  let bboxPx: { x: number; y: number; width: number; height: number } | null = null;
  for (const fr of rawFrames) {
    const { data, info } = fr;
    const { width, height, channels } = info;
    const alphaIdx = channels - 1;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * channels + alphaIdx] > faintAt) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      const candidate = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      bboxPx = bboxPx
        ? {
            x: Math.min(bboxPx.x, candidate.x),
            y: Math.min(bboxPx.y, candidate.y),
            width: Math.max(bboxPx.width, candidate.width),
            height: Math.max(bboxPx.height, candidate.height),
          }
        : candidate;
    }
  }

  let subjectPx: { x: number; y: number; width: number; height: number } | null = null;
  if (subjectFrac && Number.isFinite(subjectFrac.x) && Number.isFinite(subjectFrac.y)) {
    subjectPx = {
      x: Math.max(0, Math.round(subjectFrac.x * frameWidth)),
      y: Math.max(0, Math.round(subjectFrac.y * frameHeight)),
      width: Math.max(0, Math.min(frameWidth, Math.round((subjectFrac.width ?? 0.2) * frameWidth))),
      height: Math.max(0, Math.min(frameHeight, Math.round((subjectFrac.height ?? 0.4) * frameHeight))),
    };
  }

  // Subject-coverage metrics (§10.1): per-phase opaque coverage + hold-frame simple + alpha-weighted coverage.
  // The coarse subject box feeds METRICS + telemetry; it never hard-vetoes unless the calibrated veto is enabled.
  let coveredPct = 0;
  let alphaWeightedCoverage = 0;
  const coverageByPhase: number[] = [];
  if (subjectPx && subjectPx.width > 0 && subjectPx.height > 0 && rawFrames.length > 0) {
    for (const fr of rawFrames) {
      const { data, info } = fr;
      const { width, height, channels } = info;
      const alphaIdx = channels - 1;
      const sx0 = Math.max(0, subjectPx.x);
      const sx1 = Math.min(width, subjectPx.x + subjectPx.width);
      const sy0 = Math.max(0, subjectPx.y);
      const sy1 = Math.min(height, subjectPx.y + subjectPx.height);
      let opaque = 0;
      let alphaSum = 0;
      for (let y = sy0; y < sy1; y += 1) {
        for (let x = sx0; x < sx1; x += 1) {
          const a = data[(y * width + x) * channels + alphaIdx];
          if (a > opaqueAt) opaque += 1;
          alphaSum += a;
        }
      }
      coverageByPhase.push(opaque / (subjectPx.width * subjectPx.height));
    }
    coveredPct = coverageByPhase[coverageByPhase.length - 1];
    const hold = rawFrames[rawFrames.length - 1];
    const { data: holdData, info: holdInfo } = hold;
    const { width: holdW, height: holdH, channels: holdCh } = holdInfo;
    const holdAlphaIdx = holdCh - 1;
    let alphaSum = 0;
    const hx0 = Math.max(0, subjectPx.x);
    const hx1 = Math.min(holdW, subjectPx.x + subjectPx.width);
    const hy0 = Math.max(0, subjectPx.y);
    const hy1 = Math.min(holdH, subjectPx.y + subjectPx.height);
    for (let y = hy0; y < hy1; y += 1) {
      for (let x = hx0; x < hx1; x += 1) {
        alphaSum += holdData[(y * holdW + x) * holdCh + holdAlphaIdx];
      }
    }
    alphaWeightedCoverage = alphaSum / (subjectPx.width * subjectPx.height) / 255;
  }

  return { subjectPx, coveredPct, coverageByPhase, alphaWeightedCoverage, bboxPx };
}

async function buildJudgeImages(
  render: MgRenderResult,
  moment: MgMomentInput,
): Promise<{ images: MgVisualJudgeImage[]; geometry: MgJudgeGeometryGrounding }> {
  if (!render.files.length) throw new Error('MG judge cannot evaluate an empty frame sequence');
  const phaseWidth = judgeCompositeWidth();
  const phaseHeight = Math.max(304, Math.min(1280, Math.round(phaseWidth * render.height / render.width)));
  const stressTileWidth = judgeStressWidth();
  const stressTileHeight = Math.max(202, Math.min(760, Math.round(stressTileWidth * render.height / render.width)));
  const indices = sampleIndices(render.files.length, moment.brand);
  const evidenceFrames = requireJudgeVisualEvidence(moment);
  if (indices.length !== evidenceFrames.length) {
    throw new Error(`MG judge requires ${evidenceFrames.length} distinct animation phase samples; received ${indices.length}`);
  }

  // Fix-2: measure geometry from the SAME full-res frames (union visible bbox + opaque subject coverage metrics).
  // The bbox also drives the Fix-1 detail crops. Subject box = the moment's V-JEPA/coarse box (frame fractions).
  const frameBuffers: Buffer[] = [];
  for (const i of indices) frameBuffers.push(await fs.readFile(path.join(render.webpDir, render.files[i])));
  const subjectFrac = moment.screen?.subject;
  const measured = await measureJudgeFrameGeometry(frameBuffers, render.width, render.height, subjectFrac);
  const hardVetoEligible = measured.subjectPx != null && mgSubjectHardVetoEnabled();
  if (hardVetoEligible) {
    // Brief §10.2/§24.1: the precise-geometry subject veto must be calibrated BEFORE use. Seeing it enabled with an
    // uncalibrated threshold is a config warning — never a silent production default.
    console.warn('[MGCodegen] MG_SUBJECT_HARD_VETO_ENABLED=true with an uncalibrated coverage threshold — per brief §10.2 the coarse-box veto is off by default; this must be calibrated in the Fix-0 harness before production.');
  }
  const geometry: MgJudgeGeometryGrounding = {
    subject: subjectFrac && Number.isFinite(subjectFrac.x) && Number.isFinite(subjectFrac.y)
      ? {
          x: subjectFrac.x,
          y: subjectFrac.y,
          width: subjectFrac.width ?? 0.2,
          height: subjectFrac.height ?? 0.4,
        }
      : null,
    coveredPct: measured.coveredPct,
    coverageByPhase: measured.coverageByPhase,
    alphaWeightedCoverage: measured.alphaWeightedCoverage,
    hardVetoEligible,
    hardVeto: hardVetoEligible && mgJudgeSubjectVeto(measured.coveredPct),
    captionRects: [],
    bboxPct: measured.bboxPx
      ? {
          x: measured.bboxPx.x / render.width,
          y: measured.bboxPx.y / render.height,
          width: measured.bboxPx.width / render.width,
          height: measured.bboxPx.height / render.height,
        }
      : null,
  };

  // Fix-1 detail crops: only for LOCALIZED graphics AND when enabled. A full-frame kinetic beat gets no detail panel
  // — the (config) composite already shows it at useful scale.
  const detailEnabled = judgeDetailEnabled();
  const bboxPx = measured.bboxPx;
  const wantDetail = detailEnabled && Boolean(
    bboxPx
    && bboxPx.width >= judgeDetailMinBboxPx()
    && bboxPx.height >= judgeDetailMinBboxPx()
    && bboxPx.width * bboxPx.height < judgeDetailMaxBboxFrac() * render.width * render.height,
  );
  const detailCrop = wantDetail && bboxPx
    ? {
        left: bboxPx.x,
        top: bboxPx.y,
        width: Math.max(0, Math.min(bboxPx.width, render.width - bboxPx.x)),
        height: Math.max(0, Math.min(bboxPx.height, render.height - bboxPx.y)),
      }
    : null;

  const images: MgVisualJudgeImage[] = [];
  const stressComposites: OverlayOptions[] = [];

  for (let column = 0; column < indices.length; column += 1) {
    const frameBytes = frameBuffers[column];
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

    // Native-scale detail crop of the graphic's own region over the same footage crop — typography/legibility ONLY.
    // Any resize (tiny-crop upscale or max-width downscale) is RECORDED in the label — never an unlabeled zoom.
    if (detailCrop) {
      const maxW = judgeDetailMaxWidth();
      const tinyPx = judgeDetailTinyCropPx();
      const maxZoom = judgeDetailZoom();
      const cropFrame = await sharp(frameBytes).extract(detailCrop).toBuffer();
      const cropFootage = await sharp(decodeVisualEvidenceFrame(evidenceFrames[column])).extract(detailCrop).toBuffer();
      let dw = detailCrop.width;
      let appliedZoom = 1;
      if (dw < tinyPx) {
        dw = Math.min(Math.round(dw * maxZoom), maxW);
        appliedZoom = dw / detailCrop.width;
      }
      if (dw > maxW) {
        dw = maxW;
        appliedZoom = dw / detailCrop.width;
      }
      const detailFrame = await sharp(cropFrame).resize({ width: dw, fit: 'contain' }).png().toBuffer();
      const detailFootage = await sharp(cropFootage).resize({ width: dw, fit: 'contain' }).png().toBuffer();
      const detail = await sharp(detailFootage).composite([{ input: detailFrame }]).png().toBuffer();
      images.push({
        label: `detail (crop of the graphic region; typography/legibility/clipping authority ONLY - never placement) - ${JUDGE_PHASE_LABELS[column]} phase; bboxPct=${geometry.bboxPct ? JSON.stringify(geometry.bboxPct) : 'n/a'}; cropScale=${appliedZoom.toFixed(3)}x (recorded, never hidden)`,
        image: detail,
        mimeType: 'image/png',
      });
    }

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

  // Phase 8 (§9.3): adaptive motion-transition frames + a normalized motion summary, GATED (default OFF — the
  // classic packet layout and its tests are unchanged). Samples the MIDPOINT between consecutive sampled phases
  // (no-op for 3-frame fixtures; meaningful on real 90+ frame renders) so the judge sees actual transitions.
  if (judgeMotionFramesEnabled() && indices.length >= 2) {
    const midFrames: number[] = [];
    for (let i = 1; i < indices.length; i += 1) {
      const mid = Math.round((indices[i - 1] + indices[i]) / 2);
      if (mid >= 0 && mid < render.files.length && !indices.includes(mid)) midFrames.push(mid);
    }
    if (midFrames.length > 0) {
      const motionBuffers = [...frameBuffers];
      for (const m of midFrames) motionBuffers.push(await fs.readFile(path.join(render.webpDir, render.files[m])));
      const summary = await motionSummaryOf(motionBuffers);
      for (let c = 0; c < midFrames.length; c += 1) {
        const transitionFrame = await sharp(motionBuffers[frameBuffers.length + c])
          .resize({ width: phaseWidth, height: phaseHeight, fit: 'contain' })
          .png()
          .toBuffer();
        const transitionFootage = await sharp(decodeVisualEvidenceFrame(evidenceFrames[Math.min(c, evidenceFrames.length - 1)]))
          .resize({ width: phaseWidth, height: phaseHeight, fit: 'cover' })
          .png()
          .toBuffer();
        const transitionComposite = await sharp(transitionFootage).composite([{ input: transitionFrame }]).png().toBuffer();
        images.push({
          label: `motion transition (adaptive midpoint sample ${midFrames[c]}); motionSummary mean=${summary.mean.toFixed(3)} max=${summary.max.toFixed(3)}`,
          image: transitionComposite,
          mimeType: 'image/png',
        });
      }
    }
  }

  return { images, geometry };
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
const JUDGE_HARD_FAILURES = [
  'fabrication',
  'nonBrandColor',
  'clippedOrOverflowing',
  'subjectInterference',
  'captionOrExistingTextInterference',
  'unreadableContrast',
  'opaqueFootageOcclusion',
  'missingMotionDevelopment',
  'templateLikeForm',
] as const;
const WEAK_DIMENSION_SCORE = 6; // ⚠ tunable — surfaces a weak axis as text (revision hint); the CAPS below are the code-enforced gate.
// The rubric's OWN documented score caps, enforced in code (P5-1 Phase D-2) so a model that overstates a holistic
// score while a craft axis is failing cannot slip past the accept gate. Each value ← a stated JUDGE_PROMPT rule:
const JUDGE_DIMENSION_CAP = 4;       // ← "never award 8+ while any dimension is ≤4"
const JUDGE_DIMENSION_CAP_SCORE = 7; // ← the "not 8+" ceiling (7 < the 7.5 accept threshold → a ≤4 dimension blocks acceptance)
const JUDGE_FORM_CAP = 4;            // ← "if form ≤ 4 (undesigned bare-text output)"
const JUDGE_FORM_CAP_SCORE = 6;      // ← "...score is at most 6"

export function parseJudgeResponse(
  response: string,
  geo: MgJudgeGeometryGrounding | null | undefined = null,
): { score: number; issues: string[] } {
  const parsed = JSON.parse(extractJsonObject(response)) as Record<string, unknown>;
  if (typeof parsed.faithful !== 'boolean') throw new Error('faithful must be a boolean');
  if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) throw new Error('score must be a finite number');
  if (!Array.isArray(parsed.issues) || parsed.issues.some((issue) => typeof issue !== 'string')) {
    throw new Error('issues must be an array of strings');
  }
  const issues = (parsed.issues as string[]).slice(0, 20);

  // Both providers must honor the same verdict contract. Accepting a score-only response lets a provider omit
  // the exact evidence that makes the score enforceable, which is how a detected subject collision previously
  // shipped as an 8/10 render.
  const dims = new Map<string, number>();
  const weak: string[] = [];
  for (const dim of JUDGE_DIMENSIONS) {
    const value = parsed[dim];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${dim} must be a finite number`);
    const clamped = Math.max(0, Math.min(10, value));
    dims.set(dim, clamped);
    if (clamped < WEAK_DIMENSION_SCORE) weak.push(`weak ${dim} (${clamped}/10)`);
  }
  const hardFailures = parsed.hardFailures;
  if (!isRecord(hardFailures)) throw new Error('hardFailures must be an object');
  const hard = Object.fromEntries(
    JUDGE_HARD_FAILURES.map((f) => [f, hardFailures[f]]),
  ) as Record<(typeof JUDGE_HARD_FAILURES)[number], boolean>;
  for (const failure of JUDGE_HARD_FAILURES) {
    if (typeof hard[failure] !== 'boolean') throw new Error(`hardFailures.${failure} must be a boolean`);
  }

  // Fix-2 grounding: the CODE owns the geometry veto, the judge owns craft. When geometry is provided (codegen
  // lane), a judge-flagged subject hard-fail is honored ONLY when the calibrated precise-geometry veto is enabled
  // AND the code measured a real opaque cover (geo.hardVeto). Otherwise — coarse box (default, veto disabled) or a
  // proximity-only flag — it is downgraded to a composition note, killing the false "type is near a face"/"crowds
  // the caption zone" hard-vetoes that were dropping good overlays (prompt.ts rubric matched the placement gate's
  // SOFT intent (mg-placement-gate.ts); enforcement never did — §10.2/§10.4).
  const softNotes: string[] = [];
  if (geo) {
    if (geo.subject) {
      if (geo.hardVeto) {
        hard.subjectInterference = true;
        softNotes.push(
          `subject covered — code-verified ${(geo.coveredPct * 100).toFixed(0)}% opaque coverage of the subject box + calibrated veto enabled: subjectInterference enforced (corpse-⑤)`,
        );
      } else if (hard.subjectInterference) {
        hard.subjectInterference = false;
        softNotes.push(
          geo.hardVetoEligible
            ? `subject proximity flagged by judge but geometry measured ${(geo.coveredPct * 100).toFixed(1)}% opaque coverage of the subject box (below the veto threshold) — downgraded to a composition note (grounded subject, Fix-2)`
            : `subject proximity flagged by judge but the precise-geometry subject veto is DISABLED (MG_SUBJECT_HARD_VETO_ENABLED=false); geometry measured ${(geo.coveredPct * 100).toFixed(1)}% opaque coverage of the subject box — downgraded to a composition note (grounded subject, Fix-2)`,
        );
      }
    }
    if (geo.captionRects.length === 0 && hard.captionOrExistingTextInterference) {
      hard.captionOrExistingTextInterference = false;
      softNotes.push('caption interference downgraded: no caption rects are known yet (Fix-2 follow-up) — treated as composition feedback, not auto-reject');
    }
  }
  const activeHardFailures = JUDGE_HARD_FAILURES.filter((f) => hard[f]);

  if (!parsed.faithful) {
    const unfaithful = [...issues, ...weak].slice(0, 25);
    return { score: 0, issues: unfaithful.length ? unfaithful : ['render is not faithful to the licensed fact'] };
  }

  let score = Math.max(0, Math.min(10, parsed.score));
  const capNotes: string[] = [];
  if (activeHardFailures.length > 0 && score > 4) {
    score = 4;
    capNotes.push(`score capped at 4: hard visual failure(s): ${activeHardFailures.join(', ')}`);
  }
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

  return { score, issues: [...issues, ...weak, ...softNotes, ...capNotes].slice(0, 25) };
}

async function defaultJudgeRendered(
  render: MgRenderResult,
  moment: MgMomentInput,
): Promise<{ score: number; issues: string[] }> {
  const { images, geometry } = await buildJudgeImages(render, moment);
  const providerName = resolveMgVisualJudgeProviderName();
  let provider: Awaited<ReturnType<typeof createMgVisualJudgeProvider>>;
  try {
    provider = await createMgVisualJudgeProvider();
  } catch (error) {
    throw normalizeProviderFailure({ provider: providerName, operation: 'visual-judge', error });
  }
  console.info(`[MGCodegen] Visual judge configured: provider=${provider.name}, model=${provider.model}`);
  // Packet budget telemetry (§9.5): log what the judge is seeing and its size before the provider call.
  console.info(
    `[MGCodegen] Judge packet: ${images.length} images; ${images.map((i) => i.image.byteLength).reduce((a, b) => a + b, 0)} bytes; ` +
    `compositeWidth=${images.some((i) => i.label.includes('phase over')) ? judgeCompositeWidth() : 'n/a'}; detailEnabled=${judgeDetailEnabled()}; ` +
    `geometry=${geometry.subject ? `subjectCoverage=${geometry.coverageByPhase.join('/')}` : 'no-subject-box'}; hardVetoEligible=${geometry.hardVetoEligible}; hardVeto=${geometry.hardVeto}`,
  );
  const fact = JSON.stringify({
    factKind: moment.candidate.factKind,
    rhetoricalRole: moment.candidate.rhetoricalRole,
    content: moment.candidate.content,
    sourceText: moment.candidate.sourceSpan.text,
    placement: moment.placement,
    // Phase 4b (§11): the video taste contract (hash + compact direction) — the judge verifies CONTRACT FIDELITY
    // (execution of the established art direction) instead of substituting its own taste. Absent → fidelity N/A.
    tasteContract: moment.tasteContract ?? null,
    // Fix-2: GROUNDED geometry, code-measured (not eyeballed) per brief §10.1. subjectOverlap.collision is a hard
    // failure ONLY when hardVeto=true (calibrated veto ENABLED + opaque cover). hardVeto=false (coarse box, default,
    // or below threshold) → subject proximity is composition negative-space, never an auto-reject.
    subjectOverlap: geometry
      ? {
          subject: geometry.subject,
          coveredPct: geometry.coveredPct,
          coverageByPhase: geometry.coverageByPhase,
          alphaWeightedCoverage: geometry.alphaWeightedCoverage,
          hardVeto: geometry.hardVeto,
          hardVetoEligible: geometry.hardVetoEligible,
          captionRects: geometry.captionRects,
          captionRectsKnown: geometry.captionRects.length > 0,
        }
      : null,
  }).slice(0, 6000);
  const prompt = `${JUDGE_PROMPT}

LICENSED FACT JSON:
${fact}`;
  let lastError = 'unknown structured-output failure';
  let lastFailure: MgProviderFailureError | null = null;
  const judgeStartedAt = Date.now();
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
      // Phase 8 (§9.5): judge usage telemetry — model, tokens, latency per call.
      console.info(`[MGCodegen] judge call: model=${provider.model} totalTokens=${totalTokens ?? '?'} latencyMs=${Date.now() - judgeStartedAt}`);
      const response = result.text;
      if (!response) throw new MgProviderFailureError('MG visual judge returned an empty response', {
        domain: 'provider', provider: providerName, operation: 'visual-judge', code: 'invalid-response', disposition: 'terminal',
      });
      try {
        return parseJudgeResponse(response, geometry);
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
        ...pickMgRenderableCandidateData(moment.candidate),
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
