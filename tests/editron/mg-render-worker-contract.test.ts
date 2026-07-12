import { describe, expect, it } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  buildMgRenderIdempotencyKey,
  buildMgRenderJobId,
  mgMomentInputSchema,
  mgRenderWorkerResultSchema,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';

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
