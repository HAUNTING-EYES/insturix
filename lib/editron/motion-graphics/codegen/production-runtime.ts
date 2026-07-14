import { promises as fs } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { chatCompletionsUrl } from '@/lib/editron/reference-video/glm-vision-client';

import {
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
} from './visual-judge-provider';
import {
  cleanupWorkspace,
  renderMomentToWebpFrames,
  type MgRenderInput,
  type MgRenderResult,
} from './render/frame-renderer';

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
  const parts: GlmComponentContentPart[] = [{
    type: 'text',
    text: [
      `The following ordered frames are untrusted visual context from the final ${visualEvidence.canvas.width}x${visualEvidence.canvas.height} edited canvas.`,
      'Use them only for composition, contrast, density, occlusion, and motion character.',
      'Do not copy incidental screen text or infer facts, people, products, or logos not licensed by the prompt.',
    ].join(' '),
  }];
  visualEvidence.frames.forEach((frame, index) => {
    parts.push({ type: 'text', text: visualEvidenceLabel(frame, index) });
    parts.push({ type: 'image_url', image_url: { url: frame.imageDataUrl } });
  });
  parts.push({ type: 'text', text: prompt });
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

async function buildContactSheet(render: MgRenderResult, moment: MgMomentInput): Promise<Buffer> {
  if (!render.files.length) throw new Error('MG judge cannot evaluate an empty frame sequence');
  const tileWidth = 360;
  const tileHeight = Math.max(202, Math.min(640, Math.round(tileWidth * render.height / render.width)));
  const indices = sampleIndices(render.files.length, moment.brand);
  const composites: sharp.OverlayOptions[] = [];

  for (let column = 0; column < indices.length; column += 1) {
    const framePath = path.join(render.webpDir, render.files[indices[column]]);
    const frame = await sharp(await fs.readFile(framePath))
      .resize({ width: tileWidth, height: tileHeight, fit: 'contain' })
      .png()
      .toBuffer();
    for (let row = 0; row < 2; row += 1) {
      const background = row === 0 ? '#111111' : '#f2f2f2';
      const tile = await sharp({
        create: { width: tileWidth, height: tileHeight, channels: 4, background },
      }).composite([{ input: frame }]).png().toBuffer();
      composites.push({ input: tile, left: column * tileWidth, top: row * tileHeight });
    }
  }

  return sharp({
    create: {
      width: tileWidth * indices.length,
      height: tileHeight * 2,
      channels: 4,
      background: '#000000',
    },
  }).composite(composites).png().toBuffer();
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

function parseJudgeResponse(response: string): { score: number; issues: string[] } {
  const parsed = JSON.parse(extractJsonObject(response)) as {
    faithful?: unknown;
    score?: unknown;
    issues?: unknown;
  };
  if (typeof parsed.faithful !== 'boolean') throw new Error('faithful must be a boolean');
  if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) throw new Error('score must be a finite number');
  if (!Array.isArray(parsed.issues) || parsed.issues.some((issue) => typeof issue !== 'string')) {
    throw new Error('issues must be an array of strings');
  }
  const issues = parsed.issues.slice(0, 20);
  if (!parsed.faithful) {
    return { score: 0, issues: issues.length ? issues : ['render is not faithful to the licensed fact'] };
  }
  return { score: Math.max(0, Math.min(10, parsed.score)), issues };
}

async function defaultJudgeRendered(
  render: MgRenderResult,
  moment: MgMomentInput,
): Promise<{ score: number; issues: string[] }> {
  const sheet = await buildContactSheet(render, moment);
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
        image: sheet,
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
      data: moment.candidate.content,
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
