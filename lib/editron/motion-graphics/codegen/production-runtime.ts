import { promises as fs } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { getAnalysisModel, getGeneralModel } from '@/lib/editron/utils/gemini-model-factory';

import type { CodegenDeps } from './codegen-service';
import type { MgMomentInput } from './types';
import {
  cleanupWorkspace,
  renderMomentToWebpFrames,
  type MgRenderInput,
  type MgRenderResult,
} from './render/frame-renderer';

type RenderFn = (input: MgRenderInput, opts?: ProductionMgRuntimeOptions['renderOpts']) => Promise<MgRenderResult>;
type CleanupFn = (workspaceDir: string) => Promise<void>;

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
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  });
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
  const prompt = `You are the final motion-graphics craft and faithfulness judge.
The image is a 3-moment contact sheet of one transparent animation over both dark and light backgrounds.
Compare it against the licensed fact JSON below. Reject any fabricated, missing, altered, or misleading value.
Also judge mobile readability, hierarchy, clipping, contrast on both backgrounds, safe-region compliance,
visual polish, and whether the animation visibly develops across the three sampled moments.

LICENSED FACT JSON:
${fact}

Return JSON only:
{"faithful":boolean,"score":0-10,"issues":["specific issue"],"reasoning":"one sentence"}`;
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: sheet.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 1200,
    },
  });
  const response = result.response?.text?.();
  if (!response) throw new Error('MG visual judge returned an empty response');
  const parsed = JSON.parse(response) as { faithful?: unknown; score?: unknown; issues?: unknown };
  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 20) : [];
  const score = typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? parsed.score : 0;
  if (parsed.faithful !== true) return { score: 0, issues: issues.length ? issues : ['render is not faithful to the licensed fact'] };
  return { score: Math.max(0, Math.min(10, score)), issues };
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
