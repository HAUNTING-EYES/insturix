/**
 * settleAssistScanFailure — the shared worker-failure money settlement.
 * Battle-lane P0-2/P1: stage-2/3 assist failures must refund, exactly once,
 * only on the atomic transition, and never destroy the tx pointer on a failed refund.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  refundCredits: vi.fn(),
}));
vi.mock('@/lib/services/creditsService', () => ({ CreditsService: { refundCredits: mocks.refundCredits } }));

import { settleAssistScanFailure } from '@/lib/editron/services/assist-lane';

const db = { collection: () => ({ findOne: mocks.findOne, updateOne: mocks.updateOne }) };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.updateOne.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });
  mocks.refundCredits.mockResolvedValue({ success: true });
});

describe('settleAssistScanFailure', () => {
  it('returns not-assist for auto projects and never refunds', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'auto' });
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('not-assist');
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('refunds once when it wins the atomic transition, then consumes the tx', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('refunded');
    expect(mocks.refundCredits).toHaveBeenCalledWith('u', 20, 'boom',
      { service: 'editron', action: 'auto_edit_analysis', originalTransactionId: 'tx_1' });
    const consumed = mocks.updateOne.mock.calls.some(([, u]) => (u as { $unset?: Record<string, unknown> })?.$unset?.assistCreditTransactionId !== undefined);
    expect(consumed).toBe(true);
  });

  it('LOST TRANSITION (QStash redelivery / cancel already settled) → no refund', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.updateOne.mockResolvedValueOnce({ modifiedCount: 0, matchedCount: 0 }); // the transition
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('transition-lost');
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it('no persisted transaction → refund-pending + support flag, tx NOT consumed', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', userId: 'u' });
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('refund-pending');
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith({ projectId: 'p' }, { $set: { assistRefundPending: true } });
  });

  it('refundCredits returning success:false → refund-pending, tx pointer preserved', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.refundCredits.mockResolvedValue({ success: false, error: 'txn not found' });
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('refund-pending');
    const consumed = mocks.updateOne.mock.calls.some(([, u]) => (u as { $unset?: Record<string, unknown> })?.$unset?.assistCreditTransactionId !== undefined);
    expect(consumed).toBe(false);
  });

  it('refundCredits throwing → refund-pending + support flag', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.refundCredits.mockRejectedValue(new Error('infra down'));
    expect(await settleAssistScanFailure(db as never, 'p', 'boom')).toBe('refund-pending');
    expect(mocks.updateOne).toHaveBeenCalledWith({ projectId: 'p' }, { $set: { assistRefundPending: true } });
  });
});
