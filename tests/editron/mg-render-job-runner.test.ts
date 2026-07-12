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
  runDurableMgRenderJob,
  verifyMgStorageAuthorizationToken,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';
import {
  buildMgRenderWorkerRequest,
  type CreateMgRenderJobInput,
  type MgRenderJob,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';
import { MG_RENDER_WORKER_CONTRACT_VERSION } from '@/lib/editron/motion-graphics/codegen/worker-contract';
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
    status,
    attemptCount: status === 'queued' ? 0 : 1,
    maxAttempts: 3,
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

describe('durable MG render job runner', () => {
  it('leases beyond Sandbox timeout, signs exact owner scope, and completes once', async () => {
    const queued = job();
    const result = generatedResult(queued._id);
    const claimJob = vi.fn(async (args) => ({ ...queued, status: 'running' as const, leaseId: args.leaseId }));
    const executeSandbox = vi.fn(async (_options: ExecuteMgRenderInSandboxOptions) => result);
    const completeJob = vi.fn(async () => true);
    const failJob = vi.fn();

    await expect(runDurableMgRenderJob(input(), {
      env: ENV,
      now: NOW,
      dependencies: {
        createOrGetJob: vi.fn(async () => queued),
        claimJob,
        executeSandbox,
        completeJob,
        failJob,
      },
    })).resolves.toEqual(result);

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
