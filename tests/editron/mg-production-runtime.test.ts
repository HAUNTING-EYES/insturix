import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getGeneralModel: vi.fn(),
  getAnalysisModel: vi.fn(),
}));

import { createProductionMgRuntime } from '@/lib/editron/motion-graphics/codegen/production-runtime';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import { getAnalysisModel } from '@/lib/editron/utils/gemini-model-factory';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  vi.clearAllMocks();
});

function moment(): MgMomentInput {
  return {
    momentId: 'moment-1',
    candidate: {
      id: 'candidate-1',
      factKind: 'bounded-stat',
      sourceSpan: { text: '43 percent preferred it', startMs: 0, endMs: 1200, source: 'voiceover-transcript' },
      content: { value: 43, unit: '%', label: 'preferred it' },
      evidenceKeys: ['value'],
      licenses: ['source-span'],
      salience: 0.8,
      hardGate: { passed: true, reasons: ['licensed'], blockedBy: [] },
      scoreInputs: { structuralStrength: 0.8, salience: 0.8, evidenceStrength: 0.9, renderRisk: 0.1 },
    },
    brand: INSTURIX,
    window: { startFrame: 30, endFrame: 90, fps: 30 },
    expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
    placement: { region: 'full-frame', avoid: [], prefer: [] },
  };
}

async function fakeRender() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-runtime-test-'));
  tempDirs.push(workspaceDir);
  const webpDir = path.join(workspaceDir, 'webp');
  await fs.mkdir(webpDir);
  const files = ['00000.webp', '00001.webp', '00002.webp'];
  await Promise.all(files.map((file, index) => sharp({
    create: { width: 320, height: 180, channels: 4, background: { r: 212, g: 166, b: 82, alpha: (index + 1) / 3 } },
  }).webp().toFile(path.join(webpDir, file))));
  return { webpDir, files, workspaceDir, width: 320, height: 180, fps: 30, count: 3, renderMs: 12 };
}

describe('production MG codegen runtime', () => {
  it('uses a real rendered result for compile/evaluate and reuses it for final ingest rendering', async () => {
    const render = vi.fn(fakeRender);
    const cleanup = vi.fn(async (dir: string) => fs.rm(dir, { recursive: true, force: true }));
    const judgeRendered = vi.fn(async () => ({ score: 8.5, issues: [] }));
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render,
      cleanup,
      writeComponent: async () => 'component',
      judgeRendered,
    });

    await expect(runtime.codegen.compile('component')).resolves.toEqual({ ok: true });
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 8.5, issues: [] });
    const rendered = await runtime.render({
      componentSource: 'component', brand: INSTURIX, data: {}, width: 1920, height: 1080, fps: 30, durationInFrames: 60,
    });
    expect(rendered.count).toBe(3);
    expect(render).toHaveBeenCalledTimes(1);
    expect(judgeRendered).toHaveBeenCalledTimes(1);
    await runtime.cleanup(rendered.workspaceDir);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('fails compilation honestly and disposes a rejected judge render', async () => {
    const cleanup = vi.fn(async (dir: string) => fs.rm(dir, { recursive: true, force: true }));
    const broken = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: async () => { throw new Error('bundle failed'); },
      cleanup,
      writeComponent: async () => 'bad',
    });
    await expect(broken.codegen.compile('bad')).resolves.toEqual({ ok: false, error: 'bundle failed' });

    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup,
      writeComponent: async () => 'component',
      judgeRendered: async () => ({ score: 0, issues: ['fabricated value'] }),
    });
    await runtime.codegen.compile('component');
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 0, issues: ['fabricated value'] });
    await runtime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('retries malformed visual-judge JSON with a deterministic seed and schema', async () => {
    const generateContent = vi.fn()
      .mockResolvedValueOnce({
        response: {
          text: () => '{"faithful":true,"score":8.4,',
          candidates: [{ finishReason: 'MAX_TOKENS' }],
          usageMetadata: { totalTokenCount: 1_200, thoughtsTokenCount: 1_100 },
        },
      })
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify({ faithful: true, score: 8.4, issues: [], reasoning: 'faithful and readable' }) } });
    vi.mocked(getAnalysisModel).mockResolvedValue({ generateContent } as never);
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
    });

    await expect(runtime.codegen.compile('component')).resolves.toEqual({ ok: true });
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 8.4, issues: [] });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.generationConfig.seed)).toEqual([42, 7]);
    expect(generateContent.mock.calls.map(([request]) => request.generationConfig.maxOutputTokens)).toEqual([1_200, 4_096]);
    expect(generateContent.mock.calls[0][0].generationConfig.responseSchema).toBeDefined();
    await runtime.dispose();
  });

  it('fails closed after both visual-judge structured responses are malformed', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: {
        text: () => '{"faithful":',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { totalTokenCount: 400, thoughtsTokenCount: 100 },
      },
    });
    vi.mocked(getAnalysisModel).mockResolvedValue({ generateContent } as never);
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
    });

    await runtime.codegen.compile('component');
    await expect(runtime.codegen.evaluate('component', moment())).rejects.toThrow(/failed after 2 attempts:.*finishReason=STOP/);
    expect(generateContent).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });
});
