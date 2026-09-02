import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashScriptDocumentContent } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import type { ProductionContractRefreshJobSnapshot } from '@/lib/thinkforge/production-contract-refresh/job-store';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  configured: vi.fn(),
  dispatch: vi.fn(),
  process: vi.fn(),
  createOrGet: vi.fn(),
  getAuthorized: vi.fn(),
  markCharged: vi.fn(),
  cancelUncharged: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
  deduct: vi.fn(),
  resolveWallet: vi.fn(),
  orgBillingEnabled: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/thinkforge/production-contract-refresh/job', () => ({
  dispatchProductionContractRefreshJob: mocks.dispatch,
  isProductionContractRefreshWorkerConfigured: mocks.configured,
  processProductionContractRefreshJob: mocks.process,
}));
vi.mock('@/lib/thinkforge/production-contract-refresh/job-store', () => ({
  productionContractRefreshJobStore: {
    createOrGet: mocks.createOrGet,
    getAuthorized: mocks.getAuthorized,
    markCharged: mocks.markCharged,
    cancelUncharged: mocks.cancelUncharged,
  },
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: mocks.getSession,
  getScript: mocks.getScript,
}));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { deductForWallet: mocks.deduct },
}));
vi.mock('@/lib/editron/services/project-ownership', () => ({
  resolveContextBillingOwner: mocks.resolveWallet,
}));
vi.mock('@/lib/services/org-wallet-flag', () => ({
  isOrgWalletBillingEnabled: mocks.orgBillingEnabled,
}));

import {
  GET as getRefresh,
  POST as queueRefresh,
} from '@/app/api/services/thinkforge/script/refresh-production-contract/route';
import {
  productionContractRefreshWorkerHandler,
} from '@/app/api/internal/workers/thinkforge/production-contract-refresh/route';

const CONTENT = '# Script\n\nVisible content remains exactly unchanged.';
const HASH = hashScriptDocumentContent(CONTENT);

function job(
  overrides: Partial<ProductionContractRefreshJobSnapshot> = {},
): ProductionContractRefreshJobSnapshot {
  return {
    id: 'contractrefresh_abcdef1234',
    version: 1,
    dedupeKey: 'dedupe_1',
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_canonical',
    scriptId: 'default',
    baseVersion: 2,
    input: {
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_canonical',
      scriptId: 'default',
      baseVersion: 2,
      documentHash: HASH,
    },
    status: 'queued',
    stage: 'treatment',
    dispatchCount: 0,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: null,
    queueMessageId: null,
    treatmentCheckpoint: null,
    treatmentCheckpointHash: null,
    commitReceipt: null,
    billing: {
      status: 'pending',
      wallet: null,
      transactionId: null,
      cost: null,
      updatedAt: '2026-09-01T10:00:00.000Z',
      reason: null,
    },
    error: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    expiresAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

function postRequest() {
  return new Request('http://localhost/api/services/thinkforge/script/refresh-production-contract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'session_1', scriptId: 'default', baseVersion: 2 }),
  });
}

describe('production-contract refresh routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1' });
    mocks.configured.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({ _id: 'session_canonical', orgId: 'org_1' });
    mocks.getScript.mockResolvedValue({
      scriptId: 'default',
      title: 'Script',
      content: CONTENT,
      blocks: [],
      version: 2,
      documentType: 'video_script',
    });
    mocks.resolveWallet.mockReturnValue({ type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_1' });
    mocks.orgBillingEnabled.mockReturnValue(true);
    mocks.dispatch.mockResolvedValue('msg_1');
    mocks.markCharged.mockResolvedValue(undefined);
    mocks.cancelUncharged.mockResolvedValue(undefined);
  });

  it('validates, charges idempotently, and returns a queued job immediately', async () => {
    const pending = job();
    const charged = job({
      billing: {
        status: 'charged',
        wallet: { type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_1' },
        transactionId: 'txn_1',
        cost: 5,
        updatedAt: '2026-09-01T10:00:01.000Z',
        reason: null,
      },
    });
    mocks.createOrGet.mockResolvedValue({ job: pending, created: true });
    mocks.deduct.mockResolvedValue({ success: true, transactionId: 'txn_1', creditsDeducted: 5 });
    mocks.getAuthorized.mockResolvedValue(charged);

    const response = await queueRefresh(postRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.job).toMatchObject({ id: pending.id, status: 'queued', stage: 'treatment' });
    expect(mocks.createOrGet).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session_canonical',
      baseVersion: 2,
      documentHash: HASH,
    }));
    expect(mocks.deduct).toHaveBeenCalledWith(
      charged.billing.wallet,
      'thinkforge',
      'document_creation',
      expect.objectContaining({ idempotencyKey: pending.id }),
    );
    expect(mocks.markCharged).toHaveBeenCalledWith(pending.id, {
      wallet: charged.billing.wallet,
      transactionId: 'txn_1',
      cost: 5,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(pending.id);
  });

  it('cancels an uncharged job when the wallet cannot pay', async () => {
    const pending = job();
    mocks.createOrGet.mockResolvedValue({ job: pending, created: true });
    mocks.deduct.mockResolvedValue({ success: false, creditsDeducted: 0, error: 'Insufficient credits' });

    const response = await queueRefresh(postRequest());

    expect(response.status).toBe(402);
    expect(mocks.cancelUncharged).toHaveBeenCalledWith(pending.id, 'Insufficient credits');
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('hydrates only the document matching a completed commit receipt', async () => {
    const completed = job({
      status: 'completed',
      stage: 'committing',
      commitReceipt: { documentVersion: 3, contentHash: HASH, committedAt: '2026-09-01T10:01:00.000Z' },
    });
    mocks.getAuthorized.mockResolvedValue(completed);
    mocks.getScript.mockResolvedValue({
      scriptId: 'default',
      title: 'Script',
      content: CONTENT,
      blocks: [],
      version: 3,
      documentType: 'video_script',
      metadata: { productionContractRefreshJobId: completed.id },
    });

    const response = await getRefresh(new Request(
      `http://localhost/api/services/thinkforge/script/refresh-production-contract?jobId=${completed.id}`,
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.script).toMatchObject({ version: 3, content: CONTENT });
  });

  it('rejects malformed worker payloads before processing', async () => {
    const response = await productionContractRefreshWorkerHandler(new NextRequest(
      'http://localhost/api/internal/workers/thinkforge/production-contract-refresh',
      { method: 'POST', body: JSON.stringify({ jobId: '../wrong' }) },
    ));

    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
