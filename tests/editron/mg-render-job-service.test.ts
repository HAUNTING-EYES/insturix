import { describe, expect, it, vi } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MG_RENDER_JOBS: 'editron_mg_render_jobs' },
  getDatabase: vi.fn(),
}));

import {
  buildMgRenderWorkerRequest,
  claimMgRenderJob,
  completeMgRenderJob,
  createOrGetMgRenderJob,
  failMgRenderJob,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import { MG_RENDER_WORKER_CONTRACT_VERSION } from '@/lib/editron/motion-graphics/codegen/worker-contract';

const input: MgMomentInput = {
  momentId: 'moment_1',
  candidate: {
    id: 'candidate_1',
    factKind: 'identity',
    sourceSpan: { text: 'Ada Lovelace' },
    content: { name: 'Ada Lovelace' },
    evidenceKeys: ['transcript:1'],
    licenses: ['named-entity'],
    salience: 0.9,
    rhetoricalRole: 'identity',
    hardGate: { passed: true, reasons: ['named entity'], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.8, salience: 0.9, evidenceStrength: 0.9, renderRisk: 0.1 },
  },
  brand: INSTURIX,
  window: { startFrame: 30, endFrame: 120, fps: 30 },
  expressiveness: { tier: 'standard', intensity: 0.6, emphasisScale: 1 },
  placement: { region: 'top-right', avoid: [], prefer: [] },
};

const createInput = {
  projectId: 'proj_1',
  userId: 'user_1',
  appCommit: '80c9200e',
  input,
  canvas: { width: 1920, height: 1080 },
  sequenceNamespace: 'user_1:proj_1',
};

describe('MG render job service', () => {
  it('upserts deterministic jobs instead of duplicating renderer work', async () => {
    const now = new Date('2026-07-13T00:00:00.000Z');
    const request = buildMgRenderWorkerRequest(createInput, now);
    const findOneAndUpdate = vi.fn(async (_filter, update) => update.$setOnInsert);
    const job = await createOrGetMgRenderJob(createInput, {
      now,
      collection: { findOneAndUpdate } as any,
    });
    expect(job._id).toBe(request.jobId);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: request.jobId },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ idempotencyKey: request.idempotencyKey }),
      }),
      { upsert: true, returnDocument: 'after' },
    );
  });

  it('claims queued work with an expiring lease and increments attempts', async () => {
    const findOneAndUpdate = vi.fn(async (..._args: unknown[]) => ({ _id: 'mgr_job', status: 'running', leaseId: 'lease_1' }));
    const claimed = await claimMgRenderJob({
      jobId: 'mgr_job',
      leaseId: 'lease_1',
      now: new Date('2026-07-13T00:00:00.000Z'),
      collection: { findOneAndUpdate } as any,
    });
    expect(claimed?.leaseId).toBe('lease_1');
    expect(findOneAndUpdate.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ $inc: { attemptCount: 1 } }));
  });

  it('rejects stale completion leases and validates job/result identity', async () => {
    const updateOne = vi.fn(async () => ({ modifiedCount: 0 }));
    const result = {
      version: MG_RENDER_WORKER_CONTRACT_VERSION,
      jobId: `mgr_${'a'.repeat(32)}`,
      status: 'declined' as const,
      reason: 'no faithful visual structure',
      completedAt: '2026-07-13T00:00:00.000Z',
      receipt: {
        momentId: 'moment_1',
        promptHash: 'hash',
        attempts: 1,
        scans: [],
        compiled: false,
        outcome: 'declined' as const,
      },
    };
    await expect(completeMgRenderJob({
      jobId: 'different',
      leaseId: 'lease_1',
      result,
      collection: { updateOne } as any,
    })).rejects.toThrow(/different job/);
    expect(await completeMgRenderJob({
      jobId: result.jobId,
      leaseId: 'stale',
      result,
      collection: { updateOne } as any,
    })).toBe(false);
  });

  it('requeues retryable failures before the attempt ceiling and terminally fails otherwise', async () => {
    const updateOne = vi.fn()
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 1 });
    const collection = { updateOne } as any;
    expect(await failMgRenderJob({
      jobId: 'mgr_job', leaseId: 'lease', error: 'transient', retryable: true, collection,
    })).toBe('queued');
    expect(await failMgRenderJob({
      jobId: 'mgr_job', leaseId: 'lease', error: 'terminal', retryable: true, collection,
    })).toBe('failed');
  });
});
