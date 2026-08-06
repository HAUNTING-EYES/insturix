import { describe, expect, it, vi } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import { renderMgMoment, type RenderMomentDeps } from '@/lib/editron/motion-graphics/codegen/render/render-moment';
import type { MgRenderResult } from '@/lib/editron/motion-graphics/codegen/render/frame-renderer';
import type { MgRenderInput } from '@/lib/editron/motion-graphics/codegen/render/scaffold';
import { workspaceId } from '@/lib/editron/motion-graphics/codegen/render/scaffold';
import { sequenceFrameKey } from '@/lib/editron/motion-graphics/codegen/render/sequence-playback';
import type { MgGenerateResult, MgMomentInput, MgReceipt } from '@/lib/editron/motion-graphics/codegen/types';
import type { MgMomentDesignPlan, MgVideoDesignBrief } from '@/lib/editron/motion-graphics/codegen/design/design-plan';
import type { SemanticMgCandidate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';

const CANVAS = { width: 1080, height: 1920 };
const CODE = "import React from 'react';\nexport const MgScene = () => null;";

function candidate(): SemanticMgCandidate {
  return {
    id: 'smg_1',
    factKind: 'bounded-stat',
    sourceSpan: { text: 'we grew 40%', startMs: 0, endMs: 900 },
    content: { value: 40, label: 'YoY growth', unit: '%' },
    evidenceKeys: ['part:v:primary-value'],
    licenses: ['bounded-proportion', 'source-span'],
    salience: 0.6,
    rhetoricalRole: 'claim',
    hardGate: { passed: true, reasons: ['licensed-by-content-facts'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.6, salience: 0.6, evidenceStrength: 0.5, renderRisk: 0.2 },
  };
}

function input(over: Partial<MgMomentInput> = {}): MgMomentInput {
  return {
    momentId: 'm1',
    candidate: candidate(),
    brand: INSTURIX,
    window: { startFrame: 0, endFrame: 90, fps: 30 },
    expressiveness: { tier: 'standard', intensity: 0.6, emphasisScale: 1 },
    placement: { region: 'bottom-center', avoid: [], prefer: [] },
    ...over,
  };
}

const receipt = (outcome: MgReceipt['outcome'], reason?: string): MgReceipt => ({
  momentId: 'm1', promptHash: 'h', attempts: 1, scans: [{ passed: true }], compiled: outcome !== 'fallback', outcome, reason,
});

/** The render input the orchestrator builds — used to predict the deterministic sequenceId. */
function expectedRenderInput(mi: MgMomentInput): MgRenderInput {
  return {
    componentSource: CODE,
    brand: mi.brand,
    data: mi.candidate.content,
    width: CANVAS.width,
    height: CANVAS.height,
    fps: mi.window.fps,
    durationInFrames: Math.max(1, Math.round(mi.window.endFrame - mi.window.startFrame)),
  };
}

/** A fake render result whose frame files are named like the real renderer's output. */
function fakeRender(count = 3): MgRenderResult {
  return {
    webpDir: '/ws/webp',
    files: Array.from({ length: count }, (_, i) => `${String(i).padStart(5, '0')}.webp`),
    workspaceDir: '/ws',
    width: CANVAS.width,
    height: CANVAS.height,
    fps: 30,
    count,
    renderMs: 1234,
  };
}

/** A fake ingest that returns URLs built with the REAL key convention, so toPlaybackAddress runs real logic. */
function fakeIngestOk(base = 'https://cdn.test') {
  return vi.fn(async (r: MgRenderResult, d: { sequenceId: string }) => ({
    sequenceId: d.sequenceId,
    frameUrls: r.files.map((_, i) => `${base}/asset/${sequenceFrameKey(d.sequenceId, i)}`),
    fps: r.fps,
    width: r.width,
    height: r.height,
    count: r.count,
    transparent: true as const,
  }));
}

function deps(over: Partial<RenderMomentDeps> = {}): RenderMomentDeps {
  return {
    codegen: { writeComponent: async () => CODE, compile: async () => ({ ok: true }), evaluate: async () => ({ score: 8, issues: [] }) },
    canvas: CANVAS,
    uploadFrame: async () => 'unused-when-ingest-is-faked',
    generate: async () => ({ status: 'generated', code: CODE, receipt: receipt('generated') } as MgGenerateResult),
    render: async () => fakeRender(),
    ingest: fakeIngestOk(),
    cleanup: vi.fn(async () => undefined),
    frameSize: async () => 9600,
    ...over,
  };
}

describe('renderMgMoment - the seam entry (generate → render → ingest → compact address)', () => {
  it('★ generated → returns the sequence with a verified compact address + persist fields', async () => {
    const mi = input();
    const d = deps();
    const res = await renderMgMoment(mi, d);
    if (res.status !== 'generated') throw new Error(`expected generated, got ${res.status}`);

    const seqId = workspaceId(expectedRenderInput(mi));
    expect(res.sequence.address.sequenceId).toBe(seqId);
    expect(res.sequence.address.frameCount).toBe(3);
    expect(res.sequence.address.cdnBaseUrl).toBe('https://cdn.test'); // derived from frame 0, trailing /asset/<key> stripped
    expect(res.sequence.r2Prefix).toBe(`mgseq_${seqId}_`);
    expect(res.sequence.frameFormat).toBe('webp');
    expect(res.sequence.transparent).toBe(true);
    expect(res.sequence.sizeBytes).toBe(9600);
    expect(res.sequence.fps).toBe(30);
    expect(res.sequence.width).toBe(1080);
    expect(res.sequence.renderMs).toBe(1234);
    expect(d.cleanup).toHaveBeenCalledWith('/ws'); // workspace always cleaned
  });

  it('★ same code+data+dims → same sequenceId (idempotent R2 keys); a data-value change → new id', async () => {
    const a = await renderMgMoment(input(), deps());
    const b = await renderMgMoment(input(), deps());
    if (a.status !== 'generated' || b.status !== 'generated') throw new Error('expected generated');
    expect(a.sequence.address.sequenceId).toBe(b.sequence.address.sequenceId);

    const changed = candidate();
    changed.content = { value: 99, label: 'YoY growth', unit: '%' }; // different rendered value → different frames
    const c = await renderMgMoment(input({ candidate: changed }), deps());
    if (c.status !== 'generated') throw new Error('expected generated');
    expect(c.sequence.address.sequenceId).not.toBe(a.sequence.address.sequenceId);
  });

  it('★ model DECLINES → declined passthrough, render NEVER called', async () => {
    const render = vi.fn();
    const res = await renderMgMoment(input(), deps({
      generate: async () => ({ status: 'declined', reason: 'no faithful visual', receipt: receipt('declined', 'no faithful visual') }),
      render,
    }));
    expect(res.status).toBe('declined');
    if (res.status !== 'declined') throw new Error();
    expect(res.reason).toMatch(/no faithful visual/);
    expect(render).not.toHaveBeenCalled();
  });

  it('★ codegen fallback (scan/compile/judge failed) → fallback passthrough, render NEVER called', async () => {
    const render = vi.fn();
    const res = await renderMgMoment(input(), deps({
      generate: async () => ({ status: 'fallback', reason: 'scan failed twice', receipt: receipt('fallback', 'scan failed twice') }),
      render,
    }));
    expect(res.status).toBe('fallback');
    expect(render).not.toHaveBeenCalled();
  });

  it('★ render throws → fallback (honest, not a silent success) + workspace still cleaned via the raw dir', async () => {
    // render throws before returning a workspace handle → nothing to clean, but the result is an honest fallback.
    const res = await renderMgMoment(input(), deps({ render: async () => { throw new Error('Chromium crashed'); } }));
    expect(res.status).toBe('fallback');
    if (res.status !== 'fallback') throw new Error();
    expect(res.reason).toMatch(/Chromium crashed/);
    expect(res.receipt.outcome).toBe('fallback');
  });

  it('★ ingest throws → fallback + the rendered workspace IS cleaned (finally)', async () => {
    const cleanup = vi.fn(async () => undefined);
    const res = await renderMgMoment(input(), deps({ ingest: async () => { throw new Error('R2 5xx'); }, cleanup }));
    expect(res.status).toBe('fallback');
    expect(cleanup).toHaveBeenCalledWith('/ws');
  });

  it('★ URL convention drift (ingest URL not /asset/<key>) → fallback, NOT a broken address', async () => {
    const badIngest = vi.fn(async (r: MgRenderResult, d: { sequenceId: string }) => ({
      sequenceId: d.sequenceId,
      frameUrls: r.files.map((_, i) => `https://cdn.test/WRONG/${i}`),
      fps: r.fps, width: r.width, height: r.height, count: r.count, transparent: true as const,
    }));
    const res = await renderMgMoment(input(), deps({ ingest: badIngest }));
    expect(res.status).toBe('fallback');
    if (res.status !== 'fallback') throw new Error();
    expect(res.reason).toMatch(/convention|reconstruct/i);
  });

  it('the sequenceId is always URL-safe (Codex sequenceFrameKey accepts it)', async () => {
    const res = await renderMgMoment(input(), deps());
    if (res.status !== 'generated') throw new Error();
    expect(() => sequenceFrameKey(res.sequence.address.sequenceId, 0)).not.toThrow();
    expect(res.sequence.address.sequenceId).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('renderMgMoment - illustrated-overlay backdrop (P5-3)', () => {
  const brief: MgVideoDesignBrief = {
    styleName: 'clean', motifLanguage: 'thin gold rule', paletteMoves: 'charcoal + gold',
    motionPersonality: 'snappy', formVariety: 'type over scene',
  };
  const illustratedPlan: MgMomentDesignPlan = {
    momentId: 'm1', lane: 'illustrated-overlay', concept: 'charcoal field with the figure', targetBar: 'restraint',
    primaryCommunicativeJob: 'emphasize',
    structure: { placement: 'center', grouping: 'headline over scene', readingOrder: 'headline' },
    elements: [{ kind: 'headline', role: 'the line', dataProps: ['label'] }],
    imagery: { scenePrompt: 'abstract charcoal field, soft gold light', mode: 'still', paletteDirection: 'charcoal + gold' },
    motion: { enterOrder: [0], build: 'fade in', hold: 'gentle drift', syncTo: 'phases-only' },
    look: 'integrated',
  };

  it('★ generates the backdrop → a base64 data URI reaches the render as data.backdropSrc', async () => {
    let captured: MgRenderInput | undefined;
    const generateBackdrop = vi.fn(async () => ({ mimeType: 'image/jpeg', data: Buffer.alloc(2000, 1).toString('base64') }));
    const res = await renderMgMoment(input({ design: { plan: illustratedPlan, brief } }), deps({
      generateBackdrop,
      render: async (ri) => { captured = ri; return fakeRender(); },
    }));
    expect(res.status).toBe('generated');
    expect(generateBackdrop).toHaveBeenCalledOnce();
    expect(String(captured?.data.backdropSrc)).toMatch(/^data:image\/jpeg;base64,/); // embedded, no network fetch
  });

  it('★ a backdrop failure → fallback (never a blank Scene); render NEVER called', async () => {
    const render = vi.fn();
    const res = await renderMgMoment(input({ design: { plan: illustratedPlan, brief } }), deps({
      generateBackdrop: async () => { throw new Error('gemini 500'); },
      render,
    }));
    expect(res.status).toBe('fallback');
    if (res.status !== 'fallback') throw new Error();
    expect(res.reason).toMatch(/backdrop/);
    expect(render).not.toHaveBeenCalled();
  });

  it('an overlay-kit design (no imagery) generates no backdrop and sets no data.backdropSrc', async () => {
    let captured: MgRenderInput | undefined;
    const generateBackdrop = vi.fn();
    const overlayKit: MgMomentDesignPlan = {
      ...illustratedPlan, lane: 'overlay-kit', imagery: undefined,
      elements: [{ kind: 'headline', role: 'x', dataProps: ['label'] }, { kind: 'rule', role: 'underline', dataProps: [] }],
    };
    const res = await renderMgMoment(input({ design: { plan: overlayKit, brief } }), deps({
      generateBackdrop, render: async (ri) => { captured = ri; return fakeRender(); },
    }));
    expect(res.status).toBe('generated');
    expect(generateBackdrop).not.toHaveBeenCalled();
    expect(captured?.data.backdropSrc).toBeUndefined();
  });
});
