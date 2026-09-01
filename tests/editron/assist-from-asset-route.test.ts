/**
 * Director Mode — from-asset intake HANDLER test (the primary single-video path,
 * where the zero-edit P0 lived). Drives the REAL exported POST with mocked infra.
 *
 * Proves at the handler level:
 *   - flag enforcement: assist intake is 403 when DIRECTOR_MODE_ENABLED is off
 *   - assist persists editMode + the refund handle (txId + charged) BEFORE dispatch
 *   - assist (dev-inline path) reaches ready_for_chat WITHOUT running the Director
 *   - AUTO is unchanged: it still runs executeDirectorPlan
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAsset: vi.fn(),
  resolveAssetUrl: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  createProject: vi.fn(),
  saveProject: vi.fn(),
  claimDirectorRunV1: vi.fn(),
  updateOne: vi.fn(),
  admitAssistScanCharge: vi.fn(),
  settleAssistScanFailure: vi.fn(),
  refund: vi.fn(),
  isR2Available: vi.fn(() => false),
  getR2PresignedReadUrl: vi.fn(),
  analyzeVideo: vi.fn(async () => null),
  executeDirectorPlan: vi.fn(async () => ({ actionsExecuted: 1 })),
  getCreditCost: vi.fn(() => 12),
  warmupVjepa: vi.fn(),
  warmupWav2Vec: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    createProject: mocks.createProject,
    saveProject: mocks.saveProject,
    claimDirectorRunV1: mocks.claimDirectorRunV1,
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
vi.mock('@/lib/editron/agent/director-agent', () => ({ executeDirectorPlan: mocks.executeDirectorPlan }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: () => ({ updateOne: mocks.updateOne }) })),
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
  mocks.saveProject.mockResolvedValue(undefined);
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.admitAssistScanCharge.mockResolvedValue({ disposition: 'admitted' });
  mocks.settleAssistScanFailure.mockResolvedValue('refunded');
  mocks.claimDirectorRunV1.mockResolvedValue({ disposition: 'ASSIST_PROJECT' });
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
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.analyzeVideo).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
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
    expect(mocks.saveProject).not.toHaveBeenCalled();
    expect(mocks.analyzeVideo).not.toHaveBeenCalled();
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
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

    const analyzedWrite = mocks.updateOne.mock.calls.find(([, u]) => (u as { $set?: Record<string, unknown> })?.$set?.autoEditStatus === 'analysis_complete');
    expect(analyzedWrite?.[0]).toMatchObject({
      projectId: 'proj_asset_1',
      userId: 'user_1',
      editMode: 'assist',
      autoEditStatus: 'queued',
      assistCreditTransactionId: 'tx_asset_1',
      assistChargedCredits: 12,
    });
    expect(mocks.claimDirectorRunV1).toHaveBeenCalledWith('user_1', 'proj_asset_1');
    expect(mocks.executeDirectorPlan).not.toHaveBeenCalled();
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
    expect(mocks.claimDirectorRunV1).not.toHaveBeenCalled();
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

  it('AUTO is unchanged: no editMode → the Director runs, no ready_for_chat write', async () => {
    process.env.DIRECTOR_MODE_ENABLED = 'true';
    const res = await POST(request({ assetId: 'a1' }));
    expect(res.status).toBe(200);
    expect(mocks.executeDirectorPlan).toHaveBeenCalledOnce();
    expect(mocks.claimDirectorRunV1).not.toHaveBeenCalled();
  });
});
