import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  buildMgRenderIdempotencyKey,
  buildMgRenderJobId,
  mgMomentInputSchema,
  mgRenderWorkerRequestSchema,
  mgRenderWorkerResultSchema,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';
const TINY_WEBP_DATA_URL = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQiirUo/+BiOh/AAA=';


const moment = (): MgMomentInput => ({
  momentId: 'moment_1',
  candidate: {
    id: 'candidate_1',
    factKind: 'bounded-stat',
    sourceSpan: { text: 'Revenue rose by 42 percent.' },
    content: { value: 42, unit: '%' },
    evidenceKeys: ['transcript:12'],
    licenses: ['bounded-proportion', 'source-span'],
    salience: 0.8,
    rhetoricalRole: 'proof',
    hardGate: { passed: true, reasons: ['grounded'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.9, salience: 0.8, evidenceStrength: 0.9, renderRisk: 0.1 },
  },
  brand: INSTURIX,
  window: { startFrame: 120, endFrame: 210, fps: 30 },
  expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
  placement: { region: 'full-frame', avoid: [], prefer: [] },
});

describe('MG render worker contract', () => {
  it('accepts the live MgMomentInput shape and rejects unknown fields', () => {
    expect(mgMomentInputSchema.parse(moment())).toEqual(moment());
    expect(() => mgMomentInputSchema.parse({ ...moment(), graphicType: 'counter' })).toThrow();
    expect(() => mgMomentInputSchema.parse({
      ...moment(),
      candidate: { ...moment().candidate, content: { value: () => 42 } },
    })).toThrow();
  });

  it('accepts only bounded, ordered, self-contained visual evidence', () => {
    const visualEvidence = {
      space: 'edited-canvas',
      canvas: { width: 1_920, height: 1_080 },
      frames: [
        { role: 'context-before', coordinate: { kind: 'edited-timeline', timelineFrame: 120 }, imageDataUrl: TINY_WEBP_DATA_URL },
        { role: 'anchor', coordinate: { kind: 'source-asset', assetId: 'asset_1', sourceFrame: 420, timelineFrame: 150 }, imageDataUrl: TINY_WEBP_DATA_URL },
        { role: 'context-after', coordinate: { kind: 'edited-timeline', timelineFrame: 180 }, imageDataUrl: TINY_WEBP_DATA_URL },
      ],
    };
    expect(mgMomentInputSchema.parse({ ...moment(), visualEvidence }).visualEvidence).toEqual(visualEvidence);
    const request = {
      version: MG_RENDER_WORKER_CONTRACT_VERSION,
      jobId: `mgr_${'a'.repeat(32)}`,
      idempotencyKey: 'b'.repeat(64),
      projectId: 'proj_1',
      userId: 'user_1',
      orgId: null,
      appCommit: '80c9200e',
      input: { ...moment(), visualEvidence },
      canvas: visualEvidence.canvas,
      sequenceNamespace: 'user_1:proj_1',
      requestedAt: '2026-07-14T00:00:00.000Z',
    };
    expect(mgRenderWorkerRequestSchema.parse(request).version).toBe('editron-mg-render-worker-v2');
    expect(() => mgRenderWorkerRequestSchema.parse({
      ...request,
      canvas: { width: 1_080, height: 1_920 },
    })).toThrow(/visual evidence canvas must match the render canvas/);


    const malformedImage = {
      ...visualEvidence,
      frames: [
        { ...visualEvidence.frames[0], imageDataUrl: 'data:image/webp;base64,bm90LXdlYnA=' },
        ...visualEvidence.frames.slice(1),
      ],
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: malformedImage })).toThrow(/valid bounded JPEG or WebP/);

    const duplicateRoles = {
      ...visualEvidence,
      frames: [
        visualEvidence.frames[0],
        { ...visualEvidence.frames[1], role: 'context-before' },
        visualEvidence.frames[2],
      ],
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: duplicateRoles })).toThrow();

    const wrongOrder = {
      ...visualEvidence,
      frames: [visualEvidence.frames[1], visualEvidence.frames[0], visualEvidence.frames[2]],
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: wrongOrder })).toThrow();

    const partialEvidence = {
      ...visualEvidence,
      frames: visualEvidence.frames.slice(0, 2),
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: partialEvidence })).toThrow();

    const outsideWindow = {
      ...visualEvidence,
      frames: [
        visualEvidence.frames[0],
        { ...visualEvidence.frames[1], coordinate: { kind: 'edited-timeline', timelineFrame: 241 } },
        visualEvidence.frames[2],
      ],
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: outsideWindow })).toThrow(/must belong to the MG window/);

    const oversized = Buffer.alloc(96 * 1_024 + 13);
    oversized.write('RIFF', 0, 'ascii');
    oversized.write('WEBP', 8, 'ascii');
    const oversizedEvidence = {
      ...visualEvidence,
      frames: [
        visualEvidence.frames[0],
        {
          ...visualEvidence.frames[1],
          imageDataUrl: `data:image/webp;base64,${oversized.toString('base64')}`,
        },
        visualEvidence.frames[2],
      ],
    };
    expect(() => mgMomentInputSchema.parse({ ...moment(), visualEvidence: oversizedEvidence })).toThrow();
  });

  it('derives a stable owner- and commit-scoped job identity', () => {
    const args = {
      projectId: 'proj_1',
      userId: 'user_1',
      orgId: null,
      appCommit: '80c9200e',
      moment: moment(),
      canvas: { width: 1920, height: 1080 },
      sequenceNamespace: 'user_1:proj_1',
    };
    const first = buildMgRenderIdempotencyKey(args);
    const reordered = buildMgRenderIdempotencyKey({ ...args, canvas: { height: 1080, width: 1920 } });
    expect(first).toBe(reordered);
    expect(buildMgRenderJobId(first)).toMatch(/^mgr_[a-f0-9]{32}$/);
    expect(buildMgRenderIdempotencyKey({ ...args, appCommit: '80c9200f' })).not.toBe(first);
    expect(buildMgRenderIdempotencyKey({ ...args, userId: 'user_2' })).not.toBe(first);
  });

  it('requires generated results to carry only the compact sequence descriptor', () => {
    const result = {
      version: MG_RENDER_WORKER_CONTRACT_VERSION,
      jobId: `mgr_${'a'.repeat(32)}`,
      status: 'generated' as const,
      completedAt: new Date().toISOString(),
      receipt: {
        momentId: 'moment_1',
        promptHash: 'hash',
        attempts: 1,
        scans: [{ passed: true }],
        compiled: true,
        outcome: 'generated' as const,
      },
      sequence: {
        address: { sequenceId: 'seq_1', frameCount: 90, cdnBaseUrl: 'https://cdn.example.com' },
        r2Prefix: 'mgseq_seq_1_',
        fps: 30,
        width: 1920,
        height: 1080,
        frameFormat: 'webp' as const,
        transparent: true as const,
        sizeBytes: 1234,
        renderMs: 900,
      },
    };
    expect(mgRenderWorkerResultSchema.parse(result)).toEqual(result);
    expect(() => mgRenderWorkerResultSchema.parse({
      ...result,
      sequence: { ...result.sequence, frameUrls: ['https://cdn.example.com/frame.webp'] },
    })).toThrow();
  });
});
