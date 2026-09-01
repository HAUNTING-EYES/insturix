/**
 * Director Mode — from-asset intake HANDLER test (the primary single-video path,
 * where the zero-edit P0 lived). Drives the REAL exported POST with mocked infra.
 *
 * Proves at the handler level:
 *   - flag enforcement: assist intake is 403 when DIRECTOR_MODE_ENABLED is off
 *   - assist persists editMode + the refund handle (txId + charged) BEFORE dispatch
 *   - assist (dev-inline path) reaches ready_for_chat WITHOUT running the Director
 *   - AUTO runs through the canonical Director lifecycle
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAsset: vi.fn(),
  resolveAssetUrl: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  createProject: vi.fn(),
  saveProjectWithReceipt: vi.fn(),
  admitProjectAnalysisRunV1: vi.fn(),
  loadProjectForMutation: vi.fn(),
  advanceProjectAnalysisRunV1: vi.fn(),
  commitProjectAnalysisPhase1V1: vi.fn(),
  prepareProjectAnalysisDirectorDispatchV1: vi.fn(),
  failProjectAnalysisRunV1: vi.fn(),
  admitAssistScanCharge: vi.fn(),
  settleAssistScanFailure: vi.fn(),
  refund: vi.fn(),
  isR2Available: vi.fn(() => false),
  getR2PresignedReadUrl: vi.fn(),
  analyzeVideo: vi.fn(async () => null),
  activateProjectAnalysisDirectorInlineV1: vi.fn(),
  runCanonicalDirectorV1: vi.fn(),
  getCreditCost: vi.fn(() => 12),
  warmupVjepa: vi.fn(),
  warmupWav2Vec: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    saveProjectWithReceipt: mocks.saveProjectWithReceipt,
    admitProjectAnalysisRunV1: mocks.admitProjectAnalysisRunV1,
    loadProjectForMutation: mocks.loadProjectForMutation,
    advanceProjectAnalysisRunV1: mocks.advanceProjectAnalysisRunV1,
    commitProjectAnalysisPhase1V1: mocks.commitProjectAnalysisPhase1V1,
    prepareProjectAnalysisDirectorDispatchV1: mocks.prepareProjectAnalysisDirectorDispatchV1,
    failProjectAnalysisRunV1: mocks.failProjectAnalysisRunV1,
  },
}));
vi.mock('@/lib/editron/services/assist-lane', async () => ({
  ...(await vi.importActual('@/lib/editron/services/assist-lane')),
  admitAssistScanCharge: mocks.admitAssistScanCharge,
  settleAssistScanFailure: mocks.settleAssistScanFailure,
}));
vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { getAsset: mocks.getAsset, resolveAssetUrl: mocks.resolveAssetUrl },
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({ ROW: { VIDEO: 2 } }));
vi.mock('@/lib/services/creditsMiddleware', () => ({ checkCredits: mocks.checkCredits }));
vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: mocks.isR2Available,
  getR2PresignedReadUrl: mocks.getR2PresignedReadUrl,
  getR2PublicUrl: (id: string) => `https://r2/${id}`,
}));
vi.mock('@/lib/config/creditCosts', () => ({ getCreditCost: mocks.getCreditCost }));
vi.mock('@/lib/editron/services/vjepa-service', () => ({ warmupVjepa: mocks.warmupVjepa }));
vi.mock('@/lib/editron/services/wav2vec-service', () => ({ warmupWav2Vec: mocks.warmupWav2Vec }));
vi.mock('@/lib/editron/services/video-understanding-service', () => ({ analyzeVideo: mocks.analyzeVideo }));
vi.mock('@/lib/editron/services/project-analysis-director-publication', () => ({
  activateProjectAnalysisDirectorInlineV1: mocks.activateProjectAnalysisDirectorInlineV1,
}));
vi.mock('@/lib/editron/services/canonical-director-run', () => ({
  runCanonicalDirectorV1: mocks.runCanonicalDirectorV1,
}));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: vi.fn() })),
}));

import { POST } from '@/app/api/services/editron/auto-edit/from-asset/route';

const request = (body: Record<string, unknown>) => new Request('http://localhost/api/services/editron/auto-edit/from-asset', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

const oldEnv = { ...process.env };
const oldFetch = globalThis.fetch;

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  // Dev-inline path: no QSTASH_TOKEN so the handler runs analysis + director inline.
  process.env = { ...oldEnv, NODE_ENV: 'development' };
  delete process.env.QSTASH_TOKEN;
  mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
  mocks.getAsset.mockResolvedValue({ assetId: 'a1', filename: 'clip.mp4', type: 'video', duration: 30 });
  mocks.resolveAssetUrl.mockResolvedValue('https://cdn.test/a1');
  mocks.isR2Available.mockReturnValue(false);
  mocks.checkCredits.mockResolvedValue({
    allowed: true,
    deduct: mocks.deduct,
    refund: mocks.refund,
    errorResponse: null,
  });
  mocks.deduct.mockResolvedValue({ transactionId: 'tx_asset_1' });
  mocks.createProject.mockResolvedValue({ projectId: 'proj_asset_1' });
  mocks.saveProjectWithReceipt.mockResolvedValue({
    schemaVersion: 1,
    projectId: 'proj_asset_1',
    revision: { schemaVersion: 1, value: 1, compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z' },
    committedAt: '2026-09-01T00:00:00.000Z',
  });
  mocks.admitProjectAnalysisRunV1.mockResolvedValue({
    disposition: 'ADMITTED',
    run: { runId: 'analysis_run_asset_1' },
  });
  mocks.loadProjectForMutation.mockResolvedValue({
    revision: { schemaVersion: 1, value: 2, compatibilityUpdatedAt: '2026-09-01T00:00:01.000Z' },
  });
  mocks.advanceProjectAnalysisRunV1.mockResolvedValue({ disposition: 'ADVANCED' });
  mocks.commitProjectAnalysisPhase1V1.mockResolvedValue({ disposition: 'ADVANCED' });
  mocks.prepareProjectAnalysisDirectorDispatchV1.mockResolvedValue({
    disposition: 'ADVANCED',
    run: {
      directorDispatch: {
        schemaVersion: 1,
        status: 'pending',
        deduplicationId: 'editron_director_asset_1',
        preparedAt: '2026-09-01T00:00:02.000Z',
      },
    },
  });
  mocks.failProjectAnalysisRunV1.mockResolvedValue({ disposition: 'RECORDED' });
  mocks.admitAssistScanCharge.mockResolvedValue({ disposition: 'admitted' });
  mocks.settleAssistScanFailure.mockResolvedValue('refunded');
  mocks.runCanonicalDirectorV1.mockResolvedValue({ disposition: 'ASSIST_READY' });
  mocks.getCreditCost.mockReturnValue(12);
});

afterEach(() => {
  process.env = oldEnv;
  globalThis.fetch = oldFetch;
});

describe('from-asset assist intake handler', () => {
  it('403s an assist intake when the Director Mode flag is off (server-side enforcement)', async () => {
    delete process.env.DIRECTOR_MODE_ENABLED;
    delete process.env.NEXT_PUBLIC_DIRECTOR_MODE_ENABLED;
    const res = await POST(request({ assetId: 'a1', editMode: 'assist' }));
    expect(res.status).toBe(403);
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
  });

  it('fails before charging or creating a project when QStash has no signing key pair', async () => {
    process.env.QSTASH_TOKEN = 'qstash-token';
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    const res = await POST(request({ assetId: 'a1' }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Auto-edit queue is unavailable because its signing keys are not configured.',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
    expect(mocks.analyzeVideo).not.toHaveBeenCalled();
    expect(mocks.runCanonicalDirectorV1).not.toHaveBeenCalled();
  });

  it('fails before charging or creating a project when production has no QStash publisher token', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    delete process.env.QSTASH_TOKEN;
    delete process.env.QSTASH_CURRENT_SIGNING_KEY;
    delete process.env.QSTASH_NEXT_SIGNING_KEY;

    const res = await POST(request({ assetId: 'a1' }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'Auto-edit queue is unavailable because its publisher token or signing keys are not configured.',
    });
    expect(mocks.checkCredits).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectWithReceipt).not.toHaveBeenCalled();
    expect(mocks.analyzeVideo).not.toHaveBeenCalled();
    expect(mocks.runCanonicalDirectorV1).not.toHaveBeenCalled();
  });

  it('assist: persists editMode + refund handle, reaches ready_for_chat, and NEVER runs the Director', async () => {
    process.env.DIRECTOR_MODE_ENABLED = 'true';
    const res = await POST(request({ assetId: 'a1', editMode: 'assist' }));
    expect(res.status).toBe(200);

    expect(mocks.admitAssistScanCharge).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'proj_asset_1',
      userId: 'user_1',
      creditTransactionId: 'tx_asset_1',
      chargedCredits: 12,
    });
    expect(mocks.admitProjectAnalysisRunV1).toHaveBeenCalledWith('user_1', 'proj_asset_1', {
      expectedRevision: {
        schemaVersion: 1,
        value: 1,
        compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
      },
      sourceAssetId: 'a1',
      creditTransactionId: 'tx_asset_1',
      chargedCredits: 12,
      lane: 'assist',
      queueFacts: {},
    });
    expect(mocks.advanceProjectAnalysisRunV1).toHaveBeenNthCalledWith(1, 'user_1', 'proj_asset_1', {
      expectedRevision: expect.any(Object),
      runId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
      fromState: 'queued',
      toState: 'analyzing',
    });
    expect(mocks.advanceProjectAnalysisRunV1).toHaveBeenNthCalledWith(2, 'user_1', 'proj_asset_1', {
      expectedRevision: expect.any(Object),
      runId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
      fromState: 'analyzing',
      toState: 'transcribing',
    });
    expect(mocks.commitProjectAnalysisPhase1V1).toHaveBeenCalledWith('user_1', 'proj_asset_1', {
      expectedRevision: expect.any(Object),
      runId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
      fromState: 'transcribing',
      evidence: {},
    });
    expect(mocks.runCanonicalDirectorV1).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj_asset_1',
      userId: 'user_1',
      analysisRunId: 'analysis_run_asset_1',
    }));
    expect(mocks.prepareProjectAnalysisDirectorDispatchV1).not.toHaveBeenCalled();
    expect(mocks.activateProjectAnalysisDirectorInlineV1).not.toHaveBeenCalled();
  });

  it('settles the exact Assist deduction when inline analysis fails after starting', async () => {
    process.env.DIRECTOR_MODE_ENABLED = 'true';
    mocks.analyzeVideo.mockRejectedValueOnce(new Error('decoder failed'));

    const res = await POST(request({ assetId: 'a1', editMode: 'assist' }));

    expect(res.status).toBe(500);
    expect(mocks.settleAssistScanFailure).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'proj_asset_1',
      userId: 'user_1',
      creditTransactionId: 'tx_asset_1',
      reason: 'decoder failed',
    });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.runCanonicalDirectorV1).not.toHaveBeenCalled();
  });

  it('settles the exact Assist deduction when QStash rejects the publish', async () => {
    process.env.DIRECTOR_MODE_ENABLED = 'true';
    process.env.QSTASH_TOKEN = 'qstash-token';
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('queue unavailable', { status: 503 }));

    const res = await POST(request({ assetId: 'a1', editMode: 'assist' }));

    expect(res.status).toBe(502);
    expect(mocks.settleAssistScanFailure).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'proj_asset_1',
      userId: 'user_1',
      creditTransactionId: 'tx_asset_1',
      reason: 'QStash dispatch failed: HTTP 503 — queue unavailable',
    });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.analyzeVideo).not.toHaveBeenCalled();
  });

  it('AUTO prepares an exact dispatch and runs only the canonical Director owner', async () => {
    process.env.DIRECTOR_MODE_ENABLED = 'true';
    mocks.runCanonicalDirectorV1.mockResolvedValueOnce({ disposition: 'COMPLETED' });
    const res = await POST(request({ assetId: 'a1' }));
    expect(res.status).toBe(200);
    expect(mocks.prepareProjectAnalysisDirectorDispatchV1).toHaveBeenCalledWith('user_1', 'proj_asset_1', {
      expectedRevision: expect.any(Object),
      runId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
    });
    expect(mocks.activateProjectAnalysisDirectorInlineV1).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj_asset_1',
      userId: 'user_1',
      analysisRunId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
      dispatch: expect.objectContaining({ deduplicationId: 'editron_director_asset_1' }),
    }));
    expect(mocks.runCanonicalDirectorV1).toHaveBeenCalledWith(expect.objectContaining({
      analysisRunId: 'analysis_run_asset_1',
      analysisDirectorDispatchId: 'editron_director_asset_1',
    }));
  });

  it('AUTO records exact run failure before refund when QStash rejects publication', async () => {
    process.env.QSTASH_TOKEN = 'qstash-token';
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-key';
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next-key';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('queue unavailable', { status: 503 }));

    const res = await POST(request({ assetId: 'a1' }));

    expect(res.status).toBe(502);
    expect(mocks.failProjectAnalysisRunV1).toHaveBeenCalledWith('user_1', 'proj_asset_1', {
      expectedRevision: expect.any(Object),
      runId: 'analysis_run_asset_1',
      sourceAssetId: 'a1',
      errorMessage: 'QStash dispatch failed: HTTP 503 — queue unavailable',
    });
    expect(mocks.refund).toHaveBeenCalledWith('Auto-edit analysis dispatch failed before worker queueing');
  });
});
