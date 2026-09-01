import { afterEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  reserveStorage: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MG_RENDER_JOBS: 'mgRenderJobs' },
  getDatabase: vi.fn(async () => { throw new Error('unexpected Mongo access in runner unit test'); }),
}));

vi.mock('@/lib/editron/motion-graphics/codegen/mg-render-job-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/motion-graphics/codegen/mg-render-job-service')>();
  return { ...actual, getMgRenderJobForOwner: routeMocks.getJob };
});

vi.mock('@/lib/services/storage-reserve-service', () => ({
  reserveStorageForUpload: routeMocks.reserveStorage,
}));

import { POST } from '@/app/api/internal/workers/mg-render/storage-authorize/route';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import {
  createMgStorageAuthorizationToken,
  enqueueDurableMgRenderJob,
  executeQueuedMgRenderJob,
  resolveMgRenderRetryDelayMs,
  runDurableMgRenderJob,
  verifyMgStorageAuthorizationToken,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';
import {
  buildMgRenderJobRequestAudit,
  buildMgRenderWorkerRequest,
  type CreateMgRenderJobInput,
  type MgRenderJob,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  type MgRenderWorkerResult,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';
import type { ExecuteMgRenderInSandboxOptions } from '@/lib/editron/motion-graphics/codegen/sandbox-render-worker';

const NOW = new Date('2026-07-13T00:00:00.000Z');
const APP_COMMIT = '76d7d693c84786f33e57c018006f7a6cfbf6403e';
const AUTH_SECRET = 'mg-render-storage-auth-secret-0123456789abcdef';
const ENV = {
  NODE_ENV: 'production',
  MG_RENDER_STORAGE_AUTH_SECRET: AUTH_SECRET,
  MG_RENDER_CALLBACK_ORIGIN: 'https://preview.example.com',
  MG_RENDER_SANDBOX_TIMEOUT_MS: String(20 * 60 * 1_000),
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function input(): CreateMgRenderJobInput {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    orgId: 'org-1',
    appCommit: APP_COMMIT,
    sequenceNamespace: 'org-1:project-1',
    canvas: { width: 1920, height: 1080 },
    input: {
      momentId: 'moment-1',
      candidate: {
        id: 'candidate-1',
        factKind: 'comparison',
        sourceSpan: { text: 'Conversion rose from 12 to 19 percent.' },
        content: { from: 12, to: 19, unit: '%' },
        evidenceKeys: ['transcript:4'],
        licenses: ['comparison-relation', 'source-span'],
        salience: 0.9,
        rhetoricalRole: 'proof',
        hardGate: { passed: true, reasons: ['grounded'], blockedBy: [] },
        scoreInputs: { structuralStrength: 0.9, salience: 0.9, evidenceStrength: 0.9, renderRisk: 0.1 },
      },
      brand: INSTURIX,
      window: { startFrame: 300, endFrame: 390, fps: 30 },
      expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
      placement: { region: 'full-frame', avoid: [], prefer: [] },
    },
  };
}

function job(status: MgRenderJob['status'] = 'queued'): MgRenderJob {
  const request = buildMgRenderWorkerRequest(input(), NOW);
  return {
    _id: request.jobId,
    version: request.version,
    idempotencyKey: request.idempotencyKey,
    projectId: request.projectId,
    userId: request.userId,
    orgId: request.orgId,
    request,
    requestAudit: buildMgRenderJobRequestAudit(request),
    status,
    attemptCount: status === 'queued' ? 0 : 1,
    maxAttempts: 6,
    retryDeadlineAt: new Date(NOW.getTime() + 45 * 60 * 1_000),
    nextAttemptAt: NOW,
    leaseId: status === 'running' ? 'mgl_test' : null,
    leaseExpiresAt: status === 'running' ? new Date(NOW.getTime() + 25 * 60 * 1_000) : null,
    lastError: null,
    result: null,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: status === 'running' ? NOW : null,
    completedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1_000),
  };
}

function generatedResult(jobId: string) {
  return {
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    jobId,
    status: 'generated' as const,
    completedAt: '2026-07-13T00:01:00.000Z',
    receipt: {
      momentId: 'moment-1',
      promptHash: 'prompt-hash',
      attempts: 1,
      scans: [{ passed: true }],
      compiled: true,
      judgeScore: 9,
      judgeIssues: [],
      outcome: 'generated' as const,
    },
    sequence: {
      address: { sequenceId: 'seq-1', frameCount: 90, cdnBaseUrl: 'https://cdn.example.com' },
      r2Prefix: 'mgseq_seq-1_',
      fps: 30,
      width: 1920,
      height: 1080,
      frameFormat: 'webp' as const,
      transparent: true as const,
      sizeBytes: 12_345,
      renderMs: 4_500,
    },
  };
}

function queuedJobState(overrides: Partial<{
  status: MgRenderJob['status'] | 'missing';
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  projectId: string | null;
  userId: string | null;
}> = {}) {
  return {
    status: 'queued' as const,
    leaseExpiresAt: null,
    nextAttemptAt: NOW,
    projectId: 'project-1',
    userId: 'user-1',
    ...overrides,
  };
}

function providerFallbackResult(
  jobId: string,
  disposition: 'retryable' | 'terminal',
): MgRenderWorkerResult {
  return {
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    jobId,
    status: 'fallback',
    completedAt: '2026-07-13T00:01:00.000Z',
    reason: 'component provider unavailable',
    receipt: {
      momentId: 'moment-1',
      promptHash: 'prompt-hash',
      attempts: 2,
      scans: [{ passed: false, reason: 'model call failed' }],
      compiled: false,
      outcome: 'fallback',
      reason: 'component provider unavailable',
      failure: {
        domain: 'provider',
        provider: 'zai',
        operation: 'component-generation',
        code: disposition === 'retryable' ? 'rate-limited' : 'authentication',
        disposition,
        statusCode: disposition === 'retryable' ? 429 : 401,
      },
    },
  };
}

describe('durable MG render job runner', () => {
  it('persists and dispatches a job id without executing Sandbox in the caller', async () => {
    const queued = job();
    const createOrGetJob = vi.fn(async () => queued);
    const dispatchJob = vi.fn(async () => ({ messageId: 'qstash-mg-1' }));

    await expect(enqueueDurableMgRenderJob(input(), {
      env: ENV,
      now: NOW,
      dependencies: { createOrGetJob, dispatchJob },
    })).resolves.toEqual({
      jobId: queued._id,
      status: 'queued',
      messageId: 'qstash-mg-1',
    });

    expect(createOrGetJob).toHaveBeenCalledWith(input(), { now: NOW });
    expect(dispatchJob).toHaveBeenCalledWith(queued, ENV);
  });

  it('lets the worker claim, render, deliver, and only then complete the durable job', async () => {
    const queued = job();
    const running = { ...queued, status: 'running' as const, leaseId: 'mgl_worker' };
    const result = generatedResult(queued._id);
    const deliverResult = vi.fn(async () => undefined);
    const completeJob = vi.fn(async () => true);
    const reconcileParent = vi.fn(async () => undefined);

    await expect(executeQueuedMgRenderJob(queued._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => queuedJobState()),
        waitForProjectReady: vi.fn(async () => true),
        claimJob: vi.fn(async () => running),
        executeSandbox: vi.fn(async () => result),
        deliverResult,
        completeJob,
        failJob: vi.fn(),
        reconcileParent,
      },
    })).resolves.toEqual({ status: 'completed', result });

    expect(deliverResult).toHaveBeenCalledWith(running, result);
    expect(completeJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: queued._id,
      result,
    }));
    expect(reconcileParent).toHaveBeenCalledWith({
      jobId: queued._id,
      projectId: 'project-1',
      userId: 'user-1',
    });
    expect(deliverResult.mock.invocationCallOrder[0]).toBeLessThan(completeJob.mock.invocationCallOrder[0]);
    expect(completeJob.mock.invocationCallOrder[0]).toBeLessThan(reconcileParent.mock.invocationCallOrder[0]);
  });

  it('commits a generated MG delivery through the revision-fenced ProjectService command', async () => {
    const queued = job();
    const running = { ...queued, status: 'running' as const, leaseId: 'mgl_worker' };
    const result = generatedResult(queued._id);
    const revision = {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: '2026-07-13T00:00:00.000Z',
    };
    const loadProjectForMutation = vi.fn(async () => ({
      project: { overlays: [], intelligence: {} } as any,
      revision,
    }));
    const commitMgRenderDelivery = vi.fn(async () => ({
      delivered: true,
      receipt: {
        schemaVersion: 1 as const,
        projectId: 'project-1',
        revision: { ...revision, value: 8 },
        committedAt: '2026-07-13T00:01:01.000Z',
      },
    }));
    const buildSequenceOverlay = vi.fn((args: any) => ({
      id: args.overlayId,
      type: 'mg-sequence',
      from: args.snappedFrame,
      row: 5,
      durationInFrames: args.sequence.address.frameCount,
      metadata: {},
    }) as any);
    const completeJob = vi.fn(async () => true);

    await expect(executeQueuedMgRenderJob(queued._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => queuedJobState()),
        waitForProjectReady: vi.fn(async () => true),
        claimJob: vi.fn(async () => running),
        executeSandbox: vi.fn(async () => result),
        upsertSequenceAsset: vi.fn(async () => ({ assetId: 'mgseq_seq-1', inserted: true })),
        buildSequenceOverlay,
        loadProjectForMutation,
        commitMgRenderDelivery,
        completeJob,
        failJob: vi.fn(),
        reconcileParent: vi.fn(async () => undefined),
      },
    })).resolves.toEqual({ status: 'completed', result });

    expect(loadProjectForMutation).toHaveBeenCalledWith('user-1', 'project-1');
    expect(commitMgRenderDelivery).toHaveBeenCalledWith('user-1', 'project-1', expect.objectContaining({
      expectedRevision: revision,
      jobId: queued._id,
      outcome: expect.objectContaining({
        status: 'generated',
        sequenceId: 'seq-1',
      }),
      overlays: [expect.objectContaining({
        metadata: expect.objectContaining({ mgRenderJobId: queued._id }),
      })],
    }));
    expect(commitMgRenderDelivery.mock.invocationCallOrder[0]).toBeLessThan(completeJob.mock.invocationCallOrder[0]);
  });

  it('replays only parent reconciliation when a completed child worker delivery is retried', async () => {
    const completed = queuedJobState({ status: 'completed' });
    const reconcileParent = vi.fn(async () => undefined);
    const claimJob = vi.fn();
    const executeSandbox = vi.fn();

    await expect(executeQueuedMgRenderJob(job()._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => completed),
        reconcileParent,
        claimJob,
        executeSandbox,
      },
    })).resolves.toEqual({
      status: 'not-claimed',
      jobStatus: 'completed',
      leaseExpiresAt: null,
      nextAttemptAt: NOW,
    });

    expect(reconcileParent).toHaveBeenCalledOnce();
    expect(claimJob).not.toHaveBeenCalled();
    expect(executeSandbox).not.toHaveBeenCalled();
  });

  it('notifies the parent after terminal child failure without rewriting child disposition', async () => {
    const queued = job();
    const running = { ...queued, status: 'running' as const, leaseId: 'mgl_worker' };
    const failJob = vi.fn(async () => 'failed' as const);
    const reconcileParent = vi.fn(async () => undefined);

    await expect(executeQueuedMgRenderJob(queued._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => queuedJobState()),
        waitForProjectReady: vi.fn(async () => true),
        claimJob: vi.fn(async () => running),
        executeSandbox: vi.fn(async () => {
          throw new Error('terminal renderer configuration failure');
        }),
        deliverResult: vi.fn(),
        completeJob: vi.fn(),
        failJob,
        reconcileParent,
      },
    })).rejects.toThrow(/failed \(failed\): terminal renderer configuration failure/);

    expect(failJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: queued._id,
      retryable: true,
    }));
    expect(reconcileParent).toHaveBeenCalledWith({
      jobId: queued._id,
      projectId: 'project-1',
      userId: 'user-1',
    });
    expect(failJob.mock.invocationCallOrder[0]).toBeLessThan(reconcileParent.mock.invocationCallOrder[0]);
  });

  it('does no paid or persistence work when another worker owns the lease', async () => {
    const executeSandbox = vi.fn();
    const deliverResult = vi.fn();
    await expect(executeQueuedMgRenderJob(job()._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        claimJob: vi.fn(async () => null),
        getJobState: vi.fn(async () => ({
          status: 'running' as const,
          leaseExpiresAt: new Date(NOW.getTime() + 60_000),
          nextAttemptAt: NOW,
          projectId: 'project-1',
          userId: 'user-1',
        })),
        executeSandbox,
        deliverResult,
      },
    })).resolves.toEqual({
      status: 'not-claimed',
      jobStatus: 'running',
      leaseExpiresAt: new Date(NOW.getTime() + 60_000),
      nextAttemptAt: NOW,
    });
    expect(executeSandbox).not.toHaveBeenCalled();
    expect(deliverResult).not.toHaveBeenCalled();
  });

  it('does not claim or launch paid work before Director completes its final overlay save', async () => {
    const claimJob = vi.fn();
    const executeSandbox = vi.fn();
    const waitForProjectReady = vi.fn(async () => false);

    await expect(executeQueuedMgRenderJob(job()._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => queuedJobState()),
        waitForProjectReady,
        claimJob,
        executeSandbox,
      },
    })).resolves.toEqual({
      status: 'not-claimed',
      jobStatus: 'queued',
      leaseExpiresAt: null,
      nextAttemptAt: NOW,
    });

    expect(waitForProjectReady).toHaveBeenCalledWith('project-1', 'user-1', ENV);
    expect(claimJob).not.toHaveBeenCalled();
    expect(executeSandbox).not.toHaveBeenCalled();
  });

  it('leases beyond Sandbox timeout, signs exact owner scope, and completes once', async () => {
    const queued = job();
    const result = generatedResult(queued._id);
    const createOrGetJob = vi.fn(async () => queued);
    const claimJob = vi.fn(async (args) => ({ ...queued, status: 'running' as const, leaseId: args.leaseId }));
    const executeSandbox = vi.fn(async (_options: ExecuteMgRenderInSandboxOptions) => result);
    const completeJob = vi.fn(async () => true);
    const failJob = vi.fn();

    await expect(runDurableMgRenderJob(input(), {
      env: ENV,
      now: NOW,
      dependencies: {
        createOrGetJob,
        claimJob,
        executeSandbox,
        completeJob,
        failJob,
      },
    })).resolves.toEqual(result);

    expect(createOrGetJob).toHaveBeenCalledWith(input(), { now: NOW });
    expect(claimJob).toHaveBeenCalledWith(expect.objectContaining({ leaseMs: 25 * 60 * 1_000 }));
    const sandboxArgs = executeSandbox.mock.calls.at(0)?.[0];
    if (!sandboxArgs) throw new Error('expected Sandbox execution arguments');
    const claims = verifyMgStorageAuthorizationToken(
      sandboxArgs.storageAuthorization.token,
      ENV,
      NOW.getTime(),
    );
    expect(claims).toMatchObject({
      jobId: queued._id,
      leaseId: sandboxArgs.executionId,
      projectId: 'project-1',
      userId: 'user-1',
      orgId: 'org-1',
    });
    expect(claims.expiresAtMs).toBe(NOW.getTime() + 25 * 60 * 1_000);
    expect(sandboxArgs.storageAuthorization.url).toBe(
      'https://preview.example.com/api/internal/workers/mg-render/storage-authorize',
    );
    expect(completeJob).toHaveBeenCalledOnce();
    expect(failJob).not.toHaveBeenCalled();
  });

  it('requeues a typed transient provider fallback instead of caching it as completed', async () => {
    const queued = job();
    const result = providerFallbackResult(queued._id, 'retryable');
    const completeJob = vi.fn();
    const failJob = vi.fn(async () => 'queued' as const);

    await expect(runDurableMgRenderJob(input(), {
      env: ENV,
      now: NOW,
      dependencies: {
        createOrGetJob: vi.fn(async () => queued),
        claimJob: vi.fn(async (args) => ({
          ...queued,
          status: 'running' as const,
          leaseId: args.leaseId ?? 'lease-retryable-provider-fallback',
        })),
        executeSandbox: vi.fn(async () => result),
        completeJob,
        failJob,
      },
    })).rejects.toThrow(/failed \(queued\): MG render worker returned retryable provider failure \(zai\/rate-limited\)/);

    expect(completeJob).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: queued._id,
      retryable: true,
      retryDelayMs: expect.any(Number),
      retryDeadlineAt: queued.retryDeadlineAt,
      error: expect.any(Error),
    }));
  });

  it('uses deterministic exponential backoff and a longer floor for rate limits', () => {
    const queued = job();
    const rateLimited = new Error('provider returned 429 rate limited');
    const first = resolveMgRenderRetryDelayMs({ _id: queued._id, attemptCount: 1 }, rateLimited, {});
    const second = resolveMgRenderRetryDelayMs({ _id: queued._id, attemptCount: 2 }, rateLimited, {});
    const repeated = resolveMgRenderRetryDelayMs({ _id: queued._id, attemptCount: 2 }, rateLimited, {});
    const network = resolveMgRenderRetryDelayMs(
      { _id: queued._id, attemptCount: 1 },
      new Error('ECONNRESET'),
      {},
    );

    expect(first).toBeGreaterThanOrEqual(60_000);
    expect(second).toBeGreaterThan(first);
    expect(repeated).toBe(second);
    expect(network).toBeGreaterThanOrEqual(15_000);
    expect(network).toBeLessThan(first);
  });

  it('completes a typed terminal provider fallback without scheduling another paid attempt', async () => {
    const queued = job();
    const result = providerFallbackResult(queued._id, 'terminal');
    const completeJob = vi.fn(async () => true);
    const failJob = vi.fn();
    const revision = {
      schemaVersion: 1 as const,
      value: 7,
      compatibilityUpdatedAt: '2026-07-13T00:00:00.000Z',
    };
    const loadProjectForMutation = vi.fn(async () => ({
      project: { overlays: [], intelligence: {} } as any,
      revision,
    }));
    const commitMgRenderDelivery = vi.fn(async () => ({
      delivered: true,
      receipt: {
        schemaVersion: 1 as const,
        projectId: 'project-1',
        revision: { ...revision, value: 8 },
        committedAt: '2026-07-13T00:01:01.000Z',
      },
    }));
    const reconcileParent = vi.fn(async () => undefined);

    await expect(executeQueuedMgRenderJob(queued._id, {
      env: ENV,
      now: NOW,
      dependencies: {
        getJobState: vi.fn(async () => queuedJobState()),
        waitForProjectReady: vi.fn(async () => true),
        claimJob: vi.fn(async (args) => ({
          ...queued,
          status: 'running' as const,
          leaseId: args.leaseId ?? 'lease-terminal-provider-fallback',
        })),
        executeSandbox: vi.fn(async () => result),
        loadProjectForMutation,
        commitMgRenderDelivery,
        completeJob,
        failJob,
        reconcileParent,
      },
    })).resolves.toEqual({ status: 'completed', result });

    expect(completeJob).toHaveBeenCalledOnce();
    expect(failJob).not.toHaveBeenCalled();
    expect(commitMgRenderDelivery).toHaveBeenCalledWith('user-1', 'project-1', {
      expectedRevision: revision,
      jobId: queued._id,
      overlays: [],
      outcome: expect.objectContaining({
        jobId: queued._id,
        status: 'fallback',
        reason: 'component provider unavailable',
      }),
    });
    expect(commitMgRenderDelivery.mock.invocationCallOrder[0]).toBeLessThan(completeJob.mock.invocationCallOrder[0]);
    expect(completeJob.mock.invocationCallOrder[0]).toBeLessThan(reconcileParent.mock.invocationCallOrder[0]);
  });

  it('records authorization failures after a lease is claimed', async () => {
    const queued = job();
    const claimJob = vi.fn(async (args) => ({ ...queued, status: 'running' as const, leaseId: args.leaseId }));
    const executeSandbox = vi.fn();
    const failJob = vi.fn(async () => 'failed' as const);

    await expect(runDurableMgRenderJob(input(), {
      env: { ...ENV, MG_RENDER_STORAGE_AUTH_SECRET: undefined },
      now: NOW,
      dependencies: {
        createOrGetJob: vi.fn(async () => queued),
        claimJob,
        executeSandbox,
        completeJob: vi.fn(),
        failJob,
      },
    })).rejects.toThrow(/failed \(failed\): MG render job runner: missing MG_RENDER_STORAGE_AUTH_SECRET/);

    expect(executeSandbox).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: queued._id,
      retryable: false,
      error: expect.any(Error),
    }));
  });

  it('reuses a completed idempotent result without launching another Sandbox', async () => {
    const completed = { ...job('completed'), result: generatedResult(job()._id) };
    const claimJob = vi.fn();
    const executeSandbox = vi.fn();
    await expect(runDurableMgRenderJob(input(), {
      env: ENV,
      dependencies: { createOrGetJob: vi.fn(async () => completed), claimJob, executeSandbox },
    })).resolves.toEqual(completed.result);
    expect(claimJob).not.toHaveBeenCalled();
    expect(executeSandbox).not.toHaveBeenCalled();
  });

  it('terminally fails a runnable job whose executable request was already redacted', async () => {
    const queued = { ...job(), request: null };
    const executeSandbox = vi.fn();
    const failJob = vi.fn(async () => 'failed' as const);

    await expect(runDurableMgRenderJob(input(), {
      env: ENV,
      now: NOW,
      dependencies: {
        createOrGetJob: vi.fn(async () => queued),
        claimJob: vi.fn(async (args) => {
          if (!args.leaseId) throw new Error('runner must provide a lease id');
          return { ...queued, status: 'running' as const, leaseId: args.leaseId };
        }),
        executeSandbox,
        completeJob: vi.fn(),
        failJob,
      },
    })).rejects.toThrow(/missing its executable request/);

    expect(executeSandbox).not.toHaveBeenCalled();
    expect(failJob).toHaveBeenCalledWith(expect.objectContaining({ retryable: false }));
  });

  it('rejects forged and expired storage tokens', () => {
    const running = job('running');
    const claims = {
      version: 1 as const,
      jobId: running._id,
      leaseId: running.leaseId!,
      projectId: running.projectId,
      userId: running.userId,
      orgId: running.orgId,
      expiresAtMs: NOW.getTime() + 1_000,
    };
    const token = createMgStorageAuthorizationToken(claims, ENV);
    expect(() => verifyMgStorageAuthorizationToken(`${token}x`, ENV, NOW.getTime())).toThrow(/signature/);
    expect(() => verifyMgStorageAuthorizationToken(token, ENV, NOW.getTime() + 1_001)).toThrow(/expired/);
  });
});

describe('MG storage authorization route', () => {
  it('allows exact bytes only for the currently leased owner-scoped job', async () => {
    vi.stubEnv('MG_RENDER_STORAGE_AUTH_SECRET', AUTH_SECRET);
    const running = job('running');
    const token = createMgStorageAuthorizationToken({
      version: 1,
      jobId: running._id,
      leaseId: running.leaseId!,
      projectId: running.projectId,
      userId: running.userId,
      orgId: running.orgId,
      expiresAtMs: Date.now() + 60_000,
    }, { ...process.env, MG_RENDER_STORAGE_AUTH_SECRET: AUTH_SECRET });
    routeMocks.getJob.mockResolvedValue(running);
    routeMocks.reserveStorage.mockResolvedValue({ allowed: true, overage: false, evictedAssetIds: [] });
    const body = {
      jobId: running._id,
      idempotencyKey: running.idempotencyKey,
      projectId: running.projectId,
      userId: running.userId,
      orgId: running.orgId,
      sizeBytes: 12_345,
    };
    const response = await POST(new Request(
      'https://preview.example.com/api/internal/workers/mg-render/storage-authorize',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': `${running._id}:12345`,
        },
        body: JSON.stringify(body),
      },
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ allowed: true });
    expect(routeMocks.reserveStorage).toHaveBeenCalledWith('user-1', 'org-1', 12_345);
  });

  it('rejects a valid token after the job lease changes, before quota side effects', async () => {
    vi.stubEnv('MG_RENDER_STORAGE_AUTH_SECRET', AUTH_SECRET);
    const running = job('running');
    const token = createMgStorageAuthorizationToken({
      version: 1,
      jobId: running._id,
      leaseId: running.leaseId!,
      projectId: running.projectId,
      userId: running.userId,
      orgId: running.orgId,
      expiresAtMs: Date.now() + 60_000,
    }, { ...process.env, MG_RENDER_STORAGE_AUTH_SECRET: AUTH_SECRET });
    routeMocks.getJob.mockResolvedValue({ ...running, leaseId: 'mgl_new_owner' });
    const response = await POST(new Request(
      'https://preview.example.com/api/internal/workers/mg-render/storage-authorize',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': `${running._id}:12345`,
        },
        body: JSON.stringify({
          jobId: running._id,
          idempotencyKey: running.idempotencyKey,
          projectId: running.projectId,
          userId: running.userId,
          orgId: running.orgId,
          sizeBytes: 12_345,
        }),
      },
    ));
    expect(response.status).toBe(409);
    expect(routeMocks.reserveStorage).not.toHaveBeenCalled();
  });
});
