import { promises as fs } from 'node:fs';
import path from 'node:path';

import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import sharp from 'sharp';

import { getAnalysisModel, getGeneralModel } from '@/lib/editron/utils/gemini-model-factory';

import type { CodegenDeps } from './codegen-service';
import { JUDGE_PROMPT } from './prompt';
import type { MgMomentInput } from './types';
import {
  cleanupWorkspace,
  renderMomentToWebpFrames,
  type MgRenderInput,
  type MgRenderResult,
} from './render/frame-renderer';

type RenderFn = (input: MgRenderInput, opts?: ProductionMgRuntimeOptions['renderOpts']) => Promise<MgRenderResult>;
type CleanupFn = (workspaceDir: string) => Promise<void>;

const MG_JUDGE_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    faithful: { type: SchemaType.BOOLEAN },
    score: { type: SchemaType.NUMBER },
    issues: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    reasoning: { type: SchemaType.STRING },
  },
  required: ['faithful', 'score', 'issues', 'reasoning'],
};
const JUDGE_ATTEMPTS = [
  { seed: 42, maxOutputTokens: 1_200 },
  { seed: 7, maxOutputTokens: 4_096 },
] as const;
const COMPONENT_MAX_OUTPUT_TOKENS = 16_384;
const COMPONENT_SEEDS = { initial: 42, repair: 7 } as const;

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

async function defaultWriteComponent(prompt: string): Promise<string> {
  const model = await getGeneralModel();
  const isRepair = prompt.includes('<previous_attempt_feedback>');
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      seed: isRepair ? COMPONENT_SEEDS.repair : COMPONENT_SEEDS.initial,
      maxOutputTokens: COMPONENT_MAX_OUTPUT_TOKENS,
    },
  });
  const finishReason = String(result.response?.candidates?.[0]?.finishReason ?? 'unknown');
  const usage = result.response?.usageMetadata as {
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  } | undefined;
  console.info(`[MGCodegen] Component writer finished: finishReason=${finishReason}, totalTokens=${usage?.totalTokenCount ?? 'unknown'}, thoughtsTokens=${usage?.thoughtsTokenCount ?? 'unknown'}`);
  if (finishReason === 'MAX_TOKENS') {
    throw new Error(`MG codegen component truncated: finishReason=MAX_TOKENS, maxOutputTokens=${COMPONENT_MAX_OUTPUT_TOKENS}, totalTokens=${usage?.totalTokenCount ?? 'unknown'}, thoughtsTokens=${usage?.thoughtsTokenCount ?? 'unknown'}`);
  }
  const text = result.response?.text?.().trim();
  if (!text) throw new Error('MG codegen model returned no component source');
  return text;
}

function sampleIndices(frameCount: number): number[] {
  return [...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1])];
}

async function buildContactSheet(render: MgRenderResult): Promise<Buffer> {
  if (!render.files.length) throw new Error('MG judge cannot evaluate an empty frame sequence');
  const tileWidth = 360;
  const tileHeight = Math.max(202, Math.min(640, Math.round(tileWidth * render.height / render.width)));
  const indices = sampleIndices(render.files.length);
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
  const sheet = await buildContactSheet(render);
  const model = await getAnalysisModel();
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
  for (let attempt = 0; attempt < JUDGE_ATTEMPTS.length; attempt += 1) {
    let finishReason = 'unknown';
    let totalTokens: number | undefined;
    let thoughtsTokens: number | undefined;
    try {
      const strictRetry = attempt === 0 ? '' : '\nYour prior response was malformed. Return exactly one complete JSON object matching the schema.';
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: sheet.toString('base64') } },
            { text: `${prompt}${strictRetry}` },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MG_JUDGE_RESPONSE_SCHEMA,
          temperature: 0,
          seed: JUDGE_ATTEMPTS[attempt].seed,
          maxOutputTokens: JUDGE_ATTEMPTS[attempt].maxOutputTokens,
        },
      });
      finishReason = String(result.response?.candidates?.[0]?.finishReason ?? 'unknown');
      const usage = result.response?.usageMetadata as {
        totalTokenCount?: number;
        thoughtsTokenCount?: number;
      } | undefined;
      totalTokens = usage?.totalTokenCount;
      thoughtsTokens = usage?.thoughtsTokenCount;
      const response = result.response?.text?.();
      if (!response) throw new Error('empty response');
      return parseJudgeResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = `${message} (finishReason=${finishReason}, totalTokens=${totalTokens ?? 'unknown'}, thoughtsTokens=${thoughtsTokens ?? 'unknown'})`;
      console.warn(`[MGCodegen] Visual judge structured output failed (${attempt + 1}/${JUDGE_ATTEMPTS.length}): ${lastError.slice(0, 240)}`);
    }
  }
  throw new Error(`MG visual judge failed after ${JUDGE_ATTEMPTS.length} attempts: ${lastError.slice(0, 240)}`);
}

export function createProductionMgRuntime(
  moment: MgMomentInput,
  canvas: { width: number; height: number },
  options: ProductionMgRuntimeOptions = {},
): ProductionMgRuntime {
  const renderFrames = options.render ?? renderMomentToWebpFrames;
  const cleanup = options.cleanup ?? cleanupWorkspace;
  const writeComponent = options.writeComponent ?? defaultWriteComponent;
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
