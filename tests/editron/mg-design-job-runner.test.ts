import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  designerGenerate: vi.fn(),
  projectFindOne: vi.fn(async () => ({ projectId: 'project-1' })),
  projectUpdateOne: vi.fn(async () => ({ matchedCount: 1 })),
}));

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: {
    PROJECTS: 'projects',
    PROJECT_ASSET_ANALYSES: 'editron_asset_analyses',
    MG_DESIGN_JOBS: 'editron_mg_design_jobs',
  },
  getDatabase: vi.fn(async () => ({
    collection: () => ({
      findOne: mocks.projectFindOne,
      updateOne: mocks.projectUpdateOne,
      find: () => ({ toArray: async () => [] }),
    }),
  })),
}));

vi.mock('@/lib/editron/motion-graphics/codegen/design/designer-client', () => ({
  defaultGeminiDesignerGenerate: vi.fn(() => mocks.designerGenerate),
}));

import { OverlayType, type Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  buildMgDesignJobId,
  enqueueDurableMgDesignJob,
  executeQueuedMgDesignJob,
  type CreateMgDesignJobInput,
  type MgDesignExecutionResult,
  type MgDesignJob,
} from '@/lib/editron/motion-graphics/codegen/mg-design-job-runner';
import { executeEDL } from '@/lib/editron/services/edl-executor';
import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';

function graphicEdl(generatedAt = new Date('2026-08-03T06:00:00.000Z')): EditDecisionList {
  return {
    projectId: 'project-1',
    generatedAt,
    totalDecisions: 1,
    decisions: [{
      type: 'graphic',
      frame: 60,
      durationFrames: 90,
      priority: 2,
      source: 'signal-driven',
      signal: 'claim-proof',
      reason: 'Explain the measured result',
      params: { text: 'Conversion increased', value: '28%', label: 'conversion lift' },
      confidence: 0.9,
    }],
    stats: {
      cutsPerMinute: 0,
      transitionCount: 0,
      graphicCount: 1,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: 0.9,
    },
  };
}

function designJob(status: MgDesignJob['status'] = 'queued'): MgDesignJob {
  const now = new Date('2026-08-03T06:00:00.000Z');
  return {
    _id: 'mgd_0123456789abcdef0123456789abcdef',
    version: 'mg-design-job-v1',
    projectId: 'project-1',
    userId: 'user-1',
    edl: graphicEdl(),
    canvas: { width: 1920, height: 1080 },
    graphicsDensity: 'moderate',
    status,
    attemptCount: 1,
    maxAttempts: 4,
    nextAttemptAt: now,
    retryDeadlineAt: new Date(now.getTime() + 60 * 60 * 1_000),
    leaseId: null,
    leaseExpiresAt: null,
    lastError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
  };
}

function completedResult(): MgDesignExecutionResult {
  return {
    jobId: 'mgd_0123456789abcdef0123456789abcdef',
    decisionsExecuted: 1,
    decisionsSkipped: 0,
    renderJobsQueued: 1,
    approvedCount: 1,
    declinedCount: 0,
    unavailableCount: 0,
    completedAt: '2026-08-03T06:05:00.000Z',
    projectEvidence: {
      schemaVersion: 1,
      mgKineticSfxContexts: [],
      mgDeliveryRecords: [],
    },
  };
}

function preparedResult() {
  return {
    expectedRevision: {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: '2026-08-03T06:04:00.000Z',
    },
    result: completedResult(),
  };
}

describe('durable MG design scheduling', () => {
  beforeEach(() => {
    process.env.MG_CODEGEN_ENABLED = 'true';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.MG_CODEGEN_ENABLED;
  });

  it('defers all graphic decisions without invoking the video designer in Director', async () => {
    const enqueue = vi.fn(async () => ({
      jobId: 'mgd_0123456789abcdef0123456789abcdef',
      status: 'queued' as const,
    }));
    const overlays: Overlay[] = [{
      id: 1,
      type: OverlayType.VIDEO,
      row: 0,
      from: 0,
      durationInFrames: 300,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      assetId: 'asset-1',
      src: 'https://cdn.example/video.mp4',
    } as Overlay];

    const result = await executeEDL(
      graphicEdl(),
      'project-1',
      'user-1',
      overlays,
      { width: 1920, height: 1080 },
      undefined,
      'moderate',
      { deferMgDesign: true, enqueueMgDesignJob: enqueue },
    );

    expect(enqueue).toHaveBeenCalledOnce();
    expect(mocks.designerGenerate).not.toHaveBeenCalled();
    expect(result.decisionsDeferred).toBe(1);
    expect(result.decisionsExecuted).toBe(0);
    expect(result.decisionsSkipped).toBe(0);
    expect(result.mgDesignJob).toMatchObject({ status: 'queued', decisionCount: 1 });
    expect(result.decisionExecutionTrace[0]?.outcome).toBe('deferred');
  });

  it('uses a deterministic id but distinguishes separate Director generations', () => {
    const input: CreateMgDesignJobInput = {
      projectId: 'project-1',
      userId: 'user-1',
      edl: graphicEdl(),
      canvas: { width: 1920, height: 1080 },
      graphicsDensity: 'moderate',
    };
    expect(buildMgDesignJobId(input)).toBe(buildMgDesignJobId(input));
    expect(buildMgDesignJobId(input)).not.toBe(buildMgDesignJobId({
      ...input,
      edl: graphicEdl(new Date('2026-08-03T07:00:00.000Z')),
    }));
  });

  it('enqueues the durable job without creating a project lifecycle mirror', async () => {
    const stored = designJob('queued');
    const dispatchJob = vi.fn(async () => ({ messageId: 'qstash-design-1' }));

    await expect(enqueueDurableMgDesignJob({
      projectId: 'project-1',
      userId: 'user-1',
      edl: graphicEdl(),
      canvas: { width: 1920, height: 1080 },
      graphicsDensity: 'moderate',
    }, {
      dependencies: {
        createOrGetJob: async () => stored,
        dispatchJob,
      },
    })).resolves.toEqual({
      jobId: stored._id,
      status: 'queued',
      messageId: 'qstash-design-1',
    });
    expect(dispatchJob).toHaveBeenCalledOnce();
    expect(mocks.projectUpdateOne).not.toHaveBeenCalled();
  });

  it('does not claim work before the Director save barrier clears', async () => {
    const claimJob = vi.fn();
    const result = await executeQueuedMgDesignJob('mgd_0123456789abcdef0123456789abcdef', {
      dependencies: {
        getState: async () => ({
          status: 'queued',
          projectId: 'project-1',
          userId: 'user-1',
          leaseExpiresAt: null,
          nextAttemptAt: new Date(),
        }),
        waitForProjectReady: async () => false,
        claimJob,
      },
    });
    expect(result).toMatchObject({ status: 'not-claimed', jobStatus: 'queued' });
    expect(claimJob).not.toHaveBeenCalled();
  });

  it('claims, executes, and completes exactly once', async () => {
    const executeJob = vi.fn(async () => preparedResult());
    const completeJob = vi.fn(async () => true);
    const reconcileParent = vi.fn(async () => undefined);
    const result = await executeQueuedMgDesignJob('mgd_0123456789abcdef0123456789abcdef', {
      dependencies: {
        getState: async () => ({
          status: 'queued',
          projectId: 'project-1',
          userId: 'user-1',
          leaseExpiresAt: null,
          nextAttemptAt: new Date(),
        }),
        waitForProjectReady: async () => true,
        claimJob: async () => designJob('running'),
        executeJob,
        completeJob,
        reconcileParent,
      },
    });
    expect(result).toEqual({ status: 'completed', result: completedResult() });
    expect(executeJob).toHaveBeenCalledOnce();
    expect(completeJob).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'mgd_0123456789abcdef0123456789abcdef' }),
      expect.stringMatching(/^mgdl_/),
      preparedResult(),
    );
    expect(reconcileParent).toHaveBeenCalledOnce();
  });

  it('persists a retry disposition for transient provider failure', async () => {
    await expect(executeQueuedMgDesignJob('mgd_0123456789abcdef0123456789abcdef', {
      now: new Date('2026-08-03T06:01:00.000Z'),
      dependencies: {
        getState: async () => ({
          status: 'queued',
          projectId: 'project-1',
          userId: 'user-1',
          leaseExpiresAt: null,
          nextAttemptAt: new Date(),
        }),
        waitForProjectReady: async () => true,
        claimJob: async () => designJob('running'),
        executeJob: async () => { throw new Error('Gemini 429 RESOURCE_EXHAUSTED'); },
      },
    })).rejects.toMatchObject({ disposition: 'queued' });
    expect(mocks.projectUpdateOne).toHaveBeenCalledOnce();
    expect(mocks.projectUpdateOne).toHaveBeenCalledWith(
      {
        _id: 'mgd_0123456789abcdef0123456789abcdef',
        status: 'running',
        leaseId: expect.stringMatching(/^mgdl_/),
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'queued', leaseId: null }),
      }),
    );
  });
});
