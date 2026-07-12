import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import {
  buildMgSandboxNetworkPolicy,
  executeMgRenderInSandbox,
  resolveMgSandboxRuntimeConfig,
} from '@/lib/editron/motion-graphics/codegen/sandbox-render-worker';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  buildMgRenderIdempotencyKey,
  buildMgRenderJobId,
  parseMgRenderWorkerRequest,
  type MgRenderWorkerRequest,
} from '@/lib/editron/motion-graphics/codegen/worker-contract';

const APP_COMMIT = '350b04ccb037ce3ae018627a1b6df0d3f959e2b8';

function request(): MgRenderWorkerRequest {
  const moment = {
    momentId: 'moment_1',
    candidate: {
      id: 'candidate_1',
      factKind: 'comparison' as const,
      sourceSpan: { text: 'Conversion rose from 12 to 19 percent.' },
      content: { from: 12, to: 19, unit: '%' },
      evidenceKeys: ['transcript:4'],
      licenses: ['comparison-relation' as const, 'source-span' as const],
      salience: 0.9,
      rhetoricalRole: 'proof' as const,
      hardGate: { passed: true, reasons: ['grounded'], blockedBy: [] },
      scoreInputs: { structuralStrength: 0.9, salience: 0.9, evidenceStrength: 0.9, renderRisk: 0.1 },
    },
    brand: INSTURIX,
    window: { startFrame: 300, endFrame: 390, fps: 30 },
    expressiveness: { tier: 'hero' as const, intensity: 0.8, emphasisScale: 1.2 },
    placement: { region: 'full-frame', avoid: [], prefer: [] },
  };
  const idempotencyKey = buildMgRenderIdempotencyKey({
    projectId: 'proj_1',
    userId: 'user_1',
    orgId: 'org_1',
    appCommit: APP_COMMIT,
    moment,
    canvas: { width: 1920, height: 1080 },
    sequenceNamespace: 'org_1:proj_1',
  });
  return parseMgRenderWorkerRequest({
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    jobId: buildMgRenderJobId(idempotencyKey),
    idempotencyKey,
    projectId: 'proj_1',
    userId: 'user_1',
    orgId: 'org_1',
    appCommit: APP_COMMIT,
    input: moment,
    canvas: { width: 1920, height: 1080 },
    sequenceNamespace: 'org_1:proj_1',
    requestedAt: '2026-07-13T00:00:00.000Z',
  });
}

const env = {
  NODE_ENV: 'production',
  MG_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_commit_350b04cc',
  MG_RENDER_SANDBOX_APP_COMMIT: APP_COMMIT,
  GEMINI_API_KEY: 'gemini-secret',
  R2_ACCESS_KEY_ID: 'r2-access',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_ACCOUNT_ID: 'account123',
  R2_BUCKET_NAME: 'editron-cdn',
  CDN_WORKER_URL: 'https://cdn.example.com',
  MONGODB_URI: 'must-not-cross-boundary',
};

function generatedResult(jobId: string) {
  return {
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    jobId,
    status: 'generated' as const,
    completedAt: '2026-07-13T00:01:00.000Z',
    receipt: {
      momentId: 'moment_1',
      promptHash: 'prompt-hash',
      attempts: 1,
      scans: [{ passed: true }],
      compiled: true,
      judgeScore: 9,
      judgeIssues: [],
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
      sizeBytes: 12_345,
      renderMs: 4_500,
    },
  };
}

describe('MG Sandbox render worker', () => {
  it('keeps heavy Remotion runtime imports out of the Next.js-side client', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'lib/editron/motion-graphics/codegen/sandbox-render-worker.ts'),
      'utf8',
    );
    expect(source).not.toContain('production-runtime');
    expect(source).not.toContain('frame-renderer');
    expect(source).not.toContain('@remotion/bundler');
  });

  it('builds a commit-pinned, least-privilege runtime config', () => {
    const config = resolveMgSandboxRuntimeConfig({
      request: request(),
      storageAuthorization: { url: 'https://app.example.com/api/internal/mg-storage', token: 'job-token' },
      env,
    });
    expect(config.snapshotId).toBe('snap_commit_350b04cc');
    expect(config.workerEnv.GEMINI_API_KEY).toBe('gemini-secret');
    expect(config.workerEnv.MONGODB_URI).toBeUndefined();
    expect(config.workerEnv.MG_STORAGE_AUTHORIZATION_TOKEN).toBe('job-token');
    expect(config.networkPolicy).toEqual(buildMgSandboxNetworkPolicy({
      authorizationUrl: 'https://app.example.com/api/internal/mg-storage',
      r2AccountId: 'account123',
    }));
    expect(() => resolveMgSandboxRuntimeConfig({
      request: { ...request(), appCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      storageAuthorization: { url: 'https://app.example.com/api/internal/mg-storage', token: 'job-token' },
      env,
    })).toThrow(/does not match snapshot commit/);
    expect(() => resolveMgSandboxRuntimeConfig({
      request: request(),
      storageAuthorization: { url: 'https://app.example.com/api/internal/mg-storage', token: '   ' },
      env,
    })).toThrow(/storage authorization token/);
  });

  it('runs the worker, parses only the compact result, and always deletes the sandbox', async () => {
    const req = request();
    const result = generatedResult(req.jobId);
    const writeFiles = vi.fn(async () => undefined);
    const runCommand = vi.fn(async () => ({
      exitCode: 0,
      stdout: async () => '',
      stderr: async () => '',
    }));
    const readFileToBuffer = vi.fn(async () => Buffer.from(JSON.stringify(result)));
    const deleteSandbox = vi.fn(async () => undefined);
    const createSandbox = vi.fn(async () => ({
      writeFiles,
      runCommand,
      readFileToBuffer,
      delete: deleteSandbox,
    }));

    await expect(executeMgRenderInSandbox({
      request: req,
      executionId: 'lease_01',
      storageAuthorization: { url: 'https://app.example.com/api/internal/mg-storage', token: 'job-token' },
      env,
      createSandbox,
    })).resolves.toEqual(result);
    expect(writeFiles).toHaveBeenCalledOnce();
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      cmd: './node_modules/.bin/tsx',
      cwd: '/vercel/sandbox',
    }));
    expect(deleteSandbox).toHaveBeenCalledOnce();
  });

  it('fails loudly on worker errors and still deletes the sandbox', async () => {
    const deleteSandbox = vi.fn(async () => undefined);
    const createSandbox = vi.fn(async () => ({
      writeFiles: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => ({
        exitCode: 1,
        stdout: async () => '',
        stderr: async () => 'Chromium launch failed',
      })),
      readFileToBuffer: vi.fn(async () => null),
      delete: deleteSandbox,
    }));
    await expect(executeMgRenderInSandbox({
      request: request(),
      executionId: 'lease_02',
      storageAuthorization: { url: 'https://app.example.com/api/internal/mg-storage', token: 'job-token' },
      env,
      createSandbox,
    })).rejects.toThrow(/Chromium launch failed/);
    expect(deleteSandbox).toHaveBeenCalledOnce();
  });
});
