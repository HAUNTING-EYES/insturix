import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/utils/gemini-model-factory', () => ({
  getAnalysisModel: vi.fn(),
}));

import { createProductionMgRuntime } from '@/lib/editron/motion-graphics/codegen/production-runtime';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import { getAnalysisModel } from '@/lib/editron/utils/gemini-model-factory';

const tempDirs: string[] = [];
const TINY_WEBP_DATA_URL = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=';


afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    visualEvidence: {
      space: 'edited-canvas',
      canvas: { width: 1_920, height: 1_080 },
      frames: [
        {
          role: 'context-before',
          coordinate: { kind: 'edited-timeline', timelineFrame: 30 },
          imageDataUrl: TINY_WEBP_DATA_URL,
        },
        {
          role: 'anchor',
          coordinate: { kind: 'source-asset', assetId: 'asset-1', sourceFrame: 240, timelineFrame: 60 },
          imageDataUrl: TINY_WEBP_DATA_URL,
        },
        {
          role: 'context-after',
          coordinate: { kind: 'edited-timeline', timelineFrame: 89 },
          imageDataUrl: TINY_WEBP_DATA_URL,
        },
      ],
    },
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
/** Full-frame render at a fixed ALPHA (sets the sanity semantics) with a subtle per-frame COLOUR shift so the
 *  fixture ANIMATES like a real render (passes the motion-presence floor). alpha 1 = a solid plate (guard fails,
 *  hides footage); alpha 0.3 = translucent (guard passes). The colour shift never touches the alpha check. */
async function solidFrames(prefix: string, alpha: number) {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(workspaceDir);
  const webpDir = path.join(workspaceDir, 'webp');
  await fs.mkdir(webpDir);
  const files = ['00000.webp', '00001.webp', '00002.webp'];
  await Promise.all(files.map((file, index) => sharp({
    create: { width: 320, height: 180, channels: 4, background: { r: 212, g: 120 + 46 * (index / (files.length - 1)), b: 82, alpha } },
  }).webp({ lossless: true }).toFile(path.join(webpDir, file))));
  return { webpDir, files, workspaceDir, width: 320, height: 180, fps: 30, count: 3, renderMs: 12 };
}
const opaqueFullFrameRender = () => solidFrames('mg-runtime-opaque-', 1);
const transparentFullFrameRender = () => solidFrames('mg-runtime-transp-', 0.3);
async function phaseSampleRender() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mg-runtime-phase-test-'));
  tempDirs.push(workspaceDir);
  const webpDir = path.join(workspaceDir, 'webp');
  await fs.mkdir(webpDir);
  const files = Array.from({ length: 60 }, (_, index) => `${String(index).padStart(5, '0')}.webp`);
  await Promise.all(files.map(async (file, index) => {
    const fill = index === 10
      ? '#ff0000'
      : index === 27
        ? '#00ff00'
        : index === 54
          ? '#0000ff'
          : null;
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18">${fill ? `<rect width="16" height="18" fill="${fill}"/>` : ''}</svg>`,
    );
    await sharp(svg)
      .webp({ lossless: true })
      .toFile(path.join(webpDir, file));
  }));
  return { webpDir, files, workspaceDir, width: 32, height: 18, fps: 30, count: 60, renderMs: 12 };
}

// The judge tests exercise the VLM judge in isolation, so they bypass the deterministic render-sanity guard.
// (The guard itself is proven in mg-placement-gate.test.ts + the "vetoes" / "passes full-frame" tests below.)
const PASS_SANITY = async () => ({ pass: true, reasons: [] as string[] });

describe('production MG codegen runtime', () => {
  it('uses a real rendered result for compile/evaluate and reuses it for final ingest rendering', async () => {
    const render = vi.fn(fakeRender);
    const cleanup = vi.fn(async (dir: string) => fs.rm(dir, { recursive: true, force: true }));
    const judgeRendered = vi.fn(async () => ({ score: 8.5, issues: [] }));
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render,
      cleanup,
      writeComponent: async () => 'component',
      renderSanityGate: PASS_SANITY,
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
      renderSanityGate: PASS_SANITY,
      judgeRendered: async () => ({ score: 0, issues: ['fabricated value'] }),
    });
    await runtime.codegen.compile('component');
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 0, issues: ['fabricated value'] });
    await runtime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('★ the render-sanity guard VETOES an opaque full-frame plate (score 0, judge never called)', async () => {
    const judgeRendered = vi.fn(async () => ({ score: 9, issues: [] })); // judge WOULD accept — the guard must not
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: opaqueFullFrameRender, // a fully-opaque full frame → hides the footage (prompt hard-rule)
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      judgeRendered,
      // no renderSanityGate override → the REAL guard runs
    });
    await runtime.codegen.compile('component');
    const ev = await runtime.codegen.evaluate('component', moment());
    expect(ev.score).toBe(0);
    expect(ev.issues.join(' ')).toMatch(/render:.*hides the footage/);
    expect(judgeRendered).not.toHaveBeenCalled(); // guard-first skips the expensive VLM judge on a degenerate render
    await runtime.dispose();
  });

  it('★ a full-frame TRANSPARENT graphic PASSES the guard and reaches the judge (Tier-B is legitimate)', async () => {
    const judgeRendered = vi.fn(async () => ({ score: 8, issues: [] }));
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: transparentFullFrameRender, // full-frame EXTENT but translucent → footage reads through → NOT a plate
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      judgeRendered,
      // no renderSanityGate override → the REAL guard runs, and must NOT reject a legit full-frame MG
    });
    await runtime.codegen.compile('component');
    const ev = await runtime.codegen.evaluate('component', moment());
    expect(ev.score).toBe(8);
    expect(judgeRendered).toHaveBeenCalledTimes(1); // guard passed a full-frame transparent graphic → judge ran
    await runtime.dispose();
  });

  it('sends ordered real-frame evidence to GLM-5V-Turbo with deterministic sampling disabled', async () => {
    vi.stubEnv('ZAI_API_KEY', 'zai-secret');
    const completion = {
      choices: [{ message: { content: '```tsx\ncomponent\n```' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 2_100, completion_tokens: 9_100, total_tokens: 11_200 },
    };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(completion), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
    });

    await expect(runtime.codegen.writeComponent('initial prompt')).resolves.toBe('component');
    await expect(runtime.codegen.writeComponent('<previous_attempt_feedback>repair</previous_attempt_feedback>')).resolves.toBe('component');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer zai-secret' });
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      model: 'glm-5v-turbo',
      stream: false,
      do_sample: false,
      max_tokens: 32_768,
      response_format: { type: 'text' },
      thinking: { type: 'enabled', clear_thinking: true },
    });
    const content = payload.messages[0].content;
    expect(content.map((part: { type: string }) => part.type)).toEqual([
      'text', 'text', 'image_url', 'text', 'image_url', 'text', 'image_url', 'text',
    ]);
    expect(content[0].text).toContain('untrusted visual context');
    expect(content[0].text).toContain('final 1920x1080 edited canvas');
    expect(content[1].text).toContain('role=context-before; timelineFrame=30');
    expect(content[2]).toEqual({ type: 'image_url', image_url: { url: TINY_WEBP_DATA_URL } });
    expect(content[3].text).toContain('role=anchor; timelineFrame=60');
    expect(content[3].text).not.toContain('assetId');
    expect(content[3].text).not.toContain('sourceFrame');
    expect(content[4]).toEqual({ type: 'image_url', image_url: { url: TINY_WEBP_DATA_URL } });
    expect(content[content.length - 1]).toEqual({ type: 'text', text: 'initial prompt' });
    const retryPayload = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    const retryContent = retryPayload.messages[0].content;
    expect(retryContent[retryContent.length - 1].text).toContain('<previous_attempt_feedback>repair</previous_attempt_feedback>');
    await runtime.dispose();
  });

  it('refuses visual evidence when the component model is not the approved vision model', async () => {
    vi.stubEnv('ZAI_API_KEY', 'zai-secret');
    vi.stubEnv('MG_CODEGEN_MODEL', 'glm-4.5');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createProductionMgRuntime(moment(), { width: 1_920, height: 1_080 });

    await expect(runtime.codegen.writeComponent('initial prompt')).rejects.toThrow(/requires glm-5v-turbo/);
    expect(fetchMock).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('rejects a length-truncated GLM component before scanner or compiler can accept JSX', async () => {
    vi.stubEnv('ZAI_API_KEY', 'zai-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'export const MgScene = (' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 2_500, completion_tokens: 32_768, total_tokens: 35_268 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
    });

    await expect(runtime.codegen.writeComponent('initial prompt')).rejects.toThrow(/component truncated: finishReason=length/);
    await runtime.dispose();
  });

  it('judges full-resolution phase composites separately from contrast-only stress evidence', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      response: { text: () => JSON.stringify({ faithful: true, score: 8.4, issues: [], reasoning: 'phase samples are readable' }) },
    });
    vi.mocked(getAnalysisModel).mockResolvedValue({ generateContent } as never);
    const runtime = createProductionMgRuntime(moment(), { width: 1920, height: 1080 }, {
      render: phaseSampleRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
      renderSanityGate: PASS_SANITY,
    });

    await expect(runtime.codegen.compile('component')).resolves.toEqual({ ok: true });
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 8.4, issues: [] });
    const request = generateContent.mock.calls[0][0];
    const parts = request.contents[0].parts;
    expect(parts.map((part: { text?: string; inlineData?: unknown }) => part.text ? 'text' : 'image')).toEqual([
      'text', 'text', 'image', 'text', 'image', 'text', 'image', 'text', 'image',
    ]);
    expect(parts[1].text).toContain('intro phase over its matching real edited-canvas frame');
    expect(parts[3].text).toContain('build phase over its matching real edited-canvas frame');
    expect(parts[5].text).toContain('settled-hold phase over its matching real edited-canvas frame');
    expect(parts[7].text).toContain('contrast-only stress sheet');

    const phaseImages = [parts[2], parts[4], parts[6]].map((part) => Buffer.from(part.inlineData.data, 'base64'));
    const phasePixels = await Promise.all(phaseImages.map((image) => sharp(image)
      .extract({ left: 135, top: 152, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer()));
    expect([...phasePixels[0]]).toEqual([255, 0, 0]);
    expect([...phasePixels[1]]).toEqual([0, 255, 0]);
    expect([...phasePixels[2]]).toEqual([0, 0, 255]);

    const footagePixels = await Promise.all(phaseImages.map((image) => sharp(image)
      .extract({ left: 405, top: 152, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer()));
    expect(footagePixels.map((pixel) => [...pixel])).toEqual([
      [10, 20, 30], [10, 20, 30], [10, 20, 30],
    ]);

    const stressSheet = Buffer.from(parts[8].inlineData.data, 'base64');
    const stressMetadata = await sharp(stressSheet).metadata();
    expect({ width: stressMetadata.width, height: stressMetadata.height }).toEqual({ width: 1_080, height: 406 });
    const backgroundPixels = await Promise.all([0, 1].map((row) => sharp(stressSheet)
      .extract({
        left: 270,
        top: row * 203 + 101,
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer()));
    expect([...backgroundPixels[0]]).toEqual([17, 17, 17]);
    expect([...backgroundPixels[1]]).toEqual([242, 242, 242]);
    expect(parts[0].text).toContain('JUDGE IMAGES 1-3 are sequential full composites');
    expect(parts[0].text).toContain('final judge image is one contrast-only stress sheet');
    await runtime.dispose();
  });

  it('fails closed when the rendered judge has no final edited-canvas evidence', async () => {
    const input = moment();
    delete input.visualEvidence;
    const generateContent = vi.fn();
    vi.mocked(getAnalysisModel).mockResolvedValue({ generateContent } as never);
    const runtime = createProductionMgRuntime(input, { width: 1920, height: 1080 }, {
      render: fakeRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
      renderSanityGate: PASS_SANITY,
    });

    await expect(runtime.codegen.compile('component')).resolves.toEqual({ ok: true });
    await expect(runtime.codegen.evaluate('component', input)).rejects.toThrow(/requires complete edited-canvas visual evidence/);
    expect(generateContent).not.toHaveBeenCalled();
    await runtime.dispose();
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
      render: phaseSampleRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
      renderSanityGate: PASS_SANITY,
    });

    await expect(runtime.codegen.compile('component')).resolves.toEqual({ ok: true });
    await expect(runtime.codegen.evaluate('component', moment())).resolves.toEqual({ score: 8.4, issues: [] });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls.map(([request]) => request.generationConfig.seed)).toEqual([42, 7]);
    expect(generateContent.mock.calls.map(([request]) => request.generationConfig.maxOutputTokens)).toEqual([1_200, 4_096]);
    expect(generateContent.mock.calls[0][0].generationConfig.responseSchema).toBeDefined();
    const judgePrompt = generateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(judgePrompt).toContain('ALLOW transient interpolated numbers');
    expect(judgePrompt).toContain('REJECT unsupported settled values');
    expect(judgePrompt).toContain('opaque full-canvas graphic');
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
      render: phaseSampleRender,
      cleanup: async (dir) => fs.rm(dir, { recursive: true, force: true }),
      writeComponent: async () => 'component',
      renderSanityGate: PASS_SANITY,
    });

    await runtime.codegen.compile('component');
    await expect(runtime.codegen.evaluate('component', moment())).rejects.toThrow(/failed after 2 attempts:.*finishReason=STOP/);
    expect(generateContent).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });
});
