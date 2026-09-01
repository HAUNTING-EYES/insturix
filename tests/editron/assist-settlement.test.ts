/**
 * settleAssistScanFailure — the shared worker-failure money settlement.
 * Battle-lane P0-2/P1: stage-2/3 assist failures must refund, exactly once,
 * only on the atomic transition, and never destroy the tx pointer on a failed refund.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  refundForWallet: vi.fn(),
}));
vi.mock('@/lib/services/creditsService', () => ({ CreditsService: { refundForWallet: mocks.refundForWallet } }));

import { registerAssistScanCharge, settleAssistScanFailure } from '@/lib/editron/services/assist-lane';

const db = { collection: () => ({ findOne: mocks.findOne, updateOne: mocks.updateOne }) };
const settlement = (overrides: Record<string, unknown> = {}) => settleAssistScanFailure(db as never, {
  projectId: 'p',
  userId: 'u',
  reason: 'boom',
  creditTransactionId: 'tx_1',
  ...overrides,
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.updateOne.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });
  mocks.refundForWallet.mockResolvedValue({ success: true });
});

describe('registerAssistScanCharge', () => {
  const register = () => registerAssistScanCharge(db as never, {
    projectId: 'p',
    userId: 'u',
    creditTransactionId: 'tx_1',
    chargedCredits: 20,
  });

  it('binds a deduction only to an active Assist scan', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', userId: 'u', editMode: 'assist', autoEditStatus: 'analyzing' });
    expect(await register()).toEqual({ disposition: 'registered', terminal: false });
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p', userId: 'u', editMode: 'assist' }),
      { $set: { assistCreditTransactionId: 'tx_1', assistChargedCredits: 20 } },
    );
  });

  it('turns a cancel-during-registration race into a durable pending refund', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', userId: 'u', editMode: 'assist', autoEditStatus: 'analyzing' });
    mocks.updateOne
      .mockResolvedValueOnce({ modifiedCount: 0, matchedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 1, matchedCount: 1 });
    expect(await register()).toEqual({ disposition: 'registered', terminal: true });
    expect(mocks.updateOne.mock.calls[1]?.[1]).toEqual({
      $set: {
        assistCreditTransactionId: 'tx_1',
        assistChargedCredits: 20,
        assistRefundPending: true,
      },
    });
  });

  it('replays the exact registered charge without writing it twice', async () => {
    mocks.findOne.mockResolvedValue({
      projectId: 'p', userId: 'u', editMode: 'assist', autoEditStatus: 'scan_failed',
      assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, assistRefundPending: true,
    });
    expect(await register()).toEqual({ disposition: 'already-registered', terminal: true });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a competing transaction and malformed charge without mutation', async () => {
    mocks.findOne.mockResolvedValue({
      projectId: 'p', userId: 'u', editMode: 'assist', autoEditStatus: 'analyzing',
      assistCreditTransactionId: 'tx_new', assistChargedCredits: 20,
    });
    expect(await register()).toEqual({ disposition: 'conflict' });
    expect(await registerAssistScanCharge(db as never, {
      projectId: 'p', userId: 'u', creditTransactionId: ' ', chargedCredits: Number.NaN,
    })).toEqual({ disposition: 'invalid' });
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});

describe('settleAssistScanFailure', () => {
  it('returns not-assist for auto projects and never refunds', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'auto' });
    expect(await settlement()).toBe('not-assist');
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('refunds once when it wins the atomic transition, then consumes the tx', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    expect(await settlement()).toBe('refunded');
    expect(mocks.refundForWallet).toHaveBeenCalledWith({ type: 'user', clerkUserId: 'u' }, 20, 'boom',
      { service: 'editron', action: 'auto_edit_analysis', originalTransactionId: 'tx_1', projectId: 'p' });
    const consumed = mocks.updateOne.mock.calls.some(([, u]) => (u as { $unset?: Record<string, unknown> })?.$unset?.assistCreditTransactionId !== undefined);
    expect(consumed).toBe(true);
    expect(mocks.updateOne.mock.calls[0]?.[1]).toMatchObject({
      $set: { autoEditStatus: 'scan_failed', assistRefundPending: true },
    });
  });

  it('LOST TRANSITION (QStash redelivery / cancel already settled) → no refund', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.updateOne.mockResolvedValueOnce({ modifiedCount: 0, matchedCount: 0 }); // the transition
    expect(await settlement()).toBe('transition-lost');
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('missing worker identity fails closed without changing the project or wallet', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', userId: 'u' });
    expect(await settlement({ creditTransactionId: undefined })).toBe('unverifiable-run');
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('a stale worker cannot fail or refund a newer charged scan', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_new', assistChargedCredits: 20, userId: 'u' });
    expect(await settlement()).toBe('unverifiable-run');
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
  });

  it('resumes a durable pending refund without repeating the terminal transition', async () => {
    mocks.findOne.mockResolvedValue({
      projectId: 'p', editMode: 'assist', autoEditStatus: 'scan_failed', assistRefundPending: true,
      assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u',
    });
    expect(await settlement()).toBe('refunded');
    expect(mocks.updateOne).toHaveBeenCalledTimes(1);
    expect(mocks.refundForWallet).toHaveBeenCalledTimes(1);
  });

  it('refundForWallet returning success:false → refund-pending, tx pointer preserved', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.refundForWallet.mockResolvedValue({ success: false, error: 'txn not found' });
    expect(await settlement()).toBe('refund-pending');
    const consumed = mocks.updateOne.mock.calls.some(([, u]) => (u as { $unset?: Record<string, unknown> })?.$unset?.assistCreditTransactionId !== undefined);
    expect(consumed).toBe(false);
  });

  it('refundForWallet throwing → refund-pending + support flag', async () => {
    mocks.findOne.mockResolvedValue({ projectId: 'p', editMode: 'assist', assistCreditTransactionId: 'tx_1', assistChargedCredits: 20, userId: 'u' });
    mocks.refundForWallet.mockRejectedValue(new Error('infra down'));
    expect(await settlement()).toBe('refund-pending');
    expect(mocks.updateOne.mock.calls[0]?.[1]).toMatchObject({ $set: { assistRefundPending: true } });
  });
});
