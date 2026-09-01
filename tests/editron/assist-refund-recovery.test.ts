import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  toArray: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  refundForWallet: vi.fn(),
}));

vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: { refundForWallet: mocks.refundForWallet },
}));

import { recoverAssistScanSettlements } from '@/lib/editron/services/assist-refund-recovery';

const cursor = {
  project: vi.fn(),
  limit: vi.fn(),
  toArray: mocks.toArray,
};
cursor.project.mockReturnValue(cursor);
cursor.limit.mockReturnValue(cursor);
const find = vi.fn(() => cursor);
const db = {
  collection: () => ({ find, findOne: mocks.findOne, updateOne: mocks.updateOne }),
};

beforeEach(() => {
  find.mockClear();
  cursor.project.mockClear();
  cursor.limit.mockClear();
  for (const mock of Object.values(mocks)) mock.mockReset();
  cursor.project.mockReturnValue(cursor);
  cursor.limit.mockReturnValue(cursor);
  mocks.toArray.mockResolvedValue([]);
  mocks.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  mocks.refundForWallet.mockResolvedValue({ success: true });
});

describe('recoverAssistScanSettlements', () => {
  const staleBefore = new Date('2026-09-01T00:00:00.000Z');

  it('recovers a durable pending refund through the exact transaction owner', async () => {
    const candidate = {
      projectId: 'p_pending', userId: 'u', editMode: 'assist', autoEditStatus: 'scan_failed',
      assistRefundPending: true, assistCreditTransactionId: 'tx_1', assistChargedCredits: 12,
    };
    mocks.toArray.mockResolvedValue([candidate]);
    mocks.findOne.mockResolvedValue(candidate);

    const result = await recoverAssistScanSettlements(db as never, { staleBefore });

    expect(result).toMatchObject({ found: 1, recovered: 1, pending: 0 });
    expect(mocks.refundForWallet).toHaveBeenCalledOnce();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p_pending', assistCreditTransactionId: 'tx_1' }),
      expect.objectContaining({ $unset: expect.objectContaining({ assistRefundPending: '' }) }),
    );
  });

  it('terminalizes a stale pre-charge Assist scan without touching the wallet', async () => {
    const updatedAt = new Date('2026-08-31T00:00:00.000Z');
    mocks.toArray.mockResolvedValue([{
      projectId: 'p_no_charge', userId: 'u', editMode: 'assist', autoEditStatus: 'analyzing', updatedAt,
    }]);

    const result = await recoverAssistScanSettlements(db as never, { staleBefore });

    expect(result).toMatchObject({ found: 1, recovered: 1, pending: 0 });
    expect(mocks.refundForWallet).not.toHaveBeenCalled();
    expect(mocks.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p_no_charge',
        autoEditStatus: 'analyzing',
        updatedAt,
      }),
      expect.objectContaining({ $set: expect.objectContaining({ autoEditStatus: 'scan_failed' }) }),
    );
  });

  it('keeps malformed pending records visible and bounds each scan', async () => {
    mocks.toArray.mockResolvedValue([{ projectId: 'p_bad', autoEditStatus: 'scan_failed', assistRefundPending: true }]);

    const result = await recoverAssistScanSettlements(db as never, { staleBefore, limit: 100 });

    expect(result).toMatchObject({ found: 1, recovered: 0, pending: 1 });
    expect(result.details).toEqual([{ projectId: 'p_bad', outcome: 'invalid-recovery-record' }]);
    expect(cursor.limit).toHaveBeenCalledWith(25);
  });

  it('queries only Assist pending or stale active states', async () => {
    await recoverAssistScanSettlements(db as never, { staleBefore });
    expect(find).toHaveBeenCalledWith({
      editMode: 'assist',
      $or: [
        { autoEditStatus: 'scan_failed', assistRefundPending: true },
        {
          autoEditStatus: { $in: expect.arrayContaining(['analyzing', 'directing_queued']) },
          updatedAt: { $lt: staleBefore },
        },
      ],
    });
  });

  it('keeps both generic cron recovery queries outside the Assist lane', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/cron/recover-stuck-projects/route.ts'),
      'utf8',
    );
    expect(source).toContain('recoverAssistScanSettlements(db, {');
    expect(source.match(/editMode: \{ \$ne: 'assist' \}/g)).toHaveLength(2);
  });
});
