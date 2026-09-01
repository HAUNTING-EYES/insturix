/**
 * Director Mode cancel endpoint — money-path guardrails.
 *
 * Cancel must: be assist-only, transition atomically (a lost race never
 * double-refunds), refund EXACTLY where a deduction was persisted, stop the
 * batch orchestration loop, and flag support loudly when a refund throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findProject: vi.fn(),
  updateProject: vi.fn(),
  updateBatch: vi.fn(),
  refundForWallet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { PROJECTS: 'projects', MEDIA_UPLOAD_BATCHES: 'mediaUploadBatches' },
  getDatabase: vi.fn(async () => ({
    collection: (name: string) => {
      if (name === 'projects') return { findOne: mocks.findProject, updateOne: mocks.updateProject };
      if (name === 'mediaUploadBatches') return { updateOne: mocks.updateBatch };
      throw new Error(`unexpected collection ${name}`);
    },
  })),
}));
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { refundForWallet: mocks.refundForWallet },
}));

import { POST } from '@/app/api/services/editron/auto-edit/cancel/route';

const request = (body: unknown) => new Request('http://localhost/api/services/editron/auto-edit/cancel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}) as never;

const assistScanning = (over: Record<string, unknown> = {}) => ({
  projectId: 'proj_1',
  editMode: 'assist',
  autoEditStatus: 'transcribing',
  ...over,
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockResolvedValue({ userId: 'user_1' });
  mocks.updateProject.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.updateBatch.mockResolvedValue({ matchedCount: 1 });
  mocks.refundForWallet.mockResolvedValue({ success: true });
});

describe('assist cancel route', () => {
  it('rejects unauthenticated and malformed requests', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request({ projectId: 'proj_1' }))).status).toBe(401);

    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    expect((await POST(request({}))).status).toBe(400);
  });

  it('404s unknown projects and refuses non-assist projects', async () => {
    mocks.findProject.mockResolvedValue(null);
    expect((await POST(request({ projectId: 'proj_1' }))).status).toBe(404);

    mocks.findProject.mockResolvedValue({ projectId: 'proj_1', editMode: 'auto', autoEditStatus: 'directing' });
    const res = await POST(request({ projectId: 'proj_1' }));
    expect(res.status).toBe(400);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it('409s when the scan already finished — no transition, no refund', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ autoEditStatus: 'ready_for_chat' }));
    expect((await POST(request({ projectId: 'proj_1' }))).status).toBe(409);
    expect(mocks.updateProject).not.toHaveBeenCalled();
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-cancelled project short-circuits without a second refund', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ autoEditStatus: 'scan_failed' }));
    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();
    expect(payload).toMatchObject({ success: true, alreadyCancelled: true });
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('cancels a from-asset scan: atomic transition, batch stopped, exact refund', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({
      sourceUploadBatchId: 'batch_1',
      assistCreditTransactionId: 'tx_9',
      assistChargedCredits: 12,
    }));

    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();

    expect(payload).toMatchObject({ success: true, status: 'scan_failed', refunded: true });
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        userId: 'user_1',
        autoEditStatus: { $nin: ['scan_failed', 'ready_for_chat', 'complete'] },
      }),
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'scan_failed' }) }),
    );
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1', projectId: 'proj_1' },
      expect.objectContaining({ $set: expect.objectContaining({ orchestrationStatus: 'failed' }) }),
    );
    expect(mocks.refundForWallet).toHaveBeenCalledWith(
      { type: 'user', clerkUserId: 'user_1' },
      12,
      'Director Mode scan cancelled — full refund',
      { service: 'editron', action: 'auto_edit_analysis', originalTransactionId: 'tx_9', projectId: 'proj_1' },
    );
    // MONEY: the transaction is consumed after refund so no other path can refund it again.
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        userId: 'user_1',
        assistCreditTransactionId: 'tx_9',
      }),
      expect.objectContaining({ $unset: expect.objectContaining({ assistCreditTransactionId: '', assistChargedCredits: '' }) }),
    );
  });

  it('ATTACK: NoSQL-injection projectId shapes are rejected before any query runs', async () => {
    const res = await POST(request({ projectId: { $ne: null } }));
    expect(res.status).toBe(400);
    expect(mocks.findProject).not.toHaveBeenCalled();

    const res2 = await POST(request({ projectId: ['proj_1'] }));
    expect(res2.status).toBe(400);
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it('a lost transition race never refunds (the winner already did the accounting)', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ assistCreditTransactionId: 'tx_9', assistChargedCredits: 12 }));
    mocks.updateProject.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();
    expect(payload).toMatchObject({ success: true, alreadyCancelled: true });
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('a from-batch cancel before lay-down refunds nothing — nothing was deducted', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ sourceUploadBatchId: 'batch_1' }));
    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();
    expect(payload).toMatchObject({ success: true, refunded: false });
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('a refund THROW is loud: cancel succeeds, refunded=false, support flag set', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ assistCreditTransactionId: 'tx_9', assistChargedCredits: 12 }));
    mocks.refundForWallet.mockRejectedValue(new Error('credits service down'));

    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();
    expect(payload).toMatchObject({ success: true, refunded: false });
    expect(mocks.updateProject.mock.calls[0]?.[1]).toMatchObject({ $set: { assistRefundPending: true } });
  });

  it('ATTACK: refundCredits returning success:false (not throwing) is treated as failure — tx NOT consumed', async () => {
    mocks.findProject.mockResolvedValue(assistScanning({ assistCreditTransactionId: 'tx_9', assistChargedCredits: 12 }));
    mocks.refundForWallet.mockResolvedValue({ success: false, error: 'Original credit transaction not found' });

    const payload = await (await POST(request({ projectId: 'proj_1' }))).json();
    expect(payload).toMatchObject({ success: true, refunded: false });
    // support-flagged
    expect(mocks.updateProject.mock.calls[0]?.[1]).toMatchObject({ $set: { assistRefundPending: true } });
    // the tx pointer is NEVER destroyed on a failed refund — support can still recover it
    const consumed = mocks.updateProject.mock.calls.some(
      ([, update]) => (update as { $unset?: Record<string, unknown> })?.$unset?.assistCreditTransactionId !== undefined,
    );
    expect(consumed).toBe(false);
  });
});
