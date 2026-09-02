import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the service (so the real one's mongodb import never loads) and next/server (so NextResponse
// needs no edge runtime). This isolates the ONLY new logic in checkCredits: routing every op —
// pre-flight, deduct, refund — to the SAME effective wallet.
vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: {
    hasCreditsForWallet: vi.fn(),
    deductForWallet: vi.fn(),
    refundForWallet: vi.fn(),
  },
}));
vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: unknown) => ({ body, init }) },
}));

import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsService } from '@/lib/services/creditsService';

const orgWallet = { type: 'org' as const, clerkOrgId: 'org_1', actorUserId: 'user_9' };

const okBalance = { hasCredits: true, required: 3, available: 10, pool: 'main' as const };
const okDeduct = { success: true, creditsDeducted: 3, transactionId: 'txn_1' };

describe('checkCredits — routes every op to the effective wallet (P2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (CreditsService.hasCreditsForWallet as ReturnType<typeof vi.fn>).mockResolvedValue(okBalance);
    (CreditsService.deductForWallet as ReturnType<typeof vi.fn>).mockResolvedValue(okDeduct);
    (CreditsService.refundForWallet as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it('pre-flight + deduct route to the ORG wallet when one is passed', async () => {
    const check = await checkCredits('user_9', 'editron', 'render_export', { durationMinutes: 1 }, orgWallet);
    expect(check.allowed).toBe(true);
    expect(CreditsService.hasCreditsForWallet).toHaveBeenCalledWith(
      orgWallet, 'editron', 'render_export', expect.objectContaining({ durationMinutes: 1 }),
    );
    await check.deduct();
    expect(CreditsService.deductForWallet).toHaveBeenCalledWith(
      orgWallet, 'editron', 'render_export', expect.objectContaining({ durationMinutes: 1 }),
    );
  });

  it('refund routes to the SAME org wallet the deduct used (no leak to personal)', async () => {
    const check = await checkCredits('user_9', 'editron', 'render_export', { durationMinutes: 1 }, orgWallet);
    await check.deduct();
    await check.refund('render failed');
    expect(CreditsService.refundForWallet).toHaveBeenCalledWith(
      orgWallet,
      expect.any(Number),
      'render failed',
      expect.objectContaining({ originalTransactionId: 'txn_1' }),
    );
  });

  it('rejects when the wallet reports that the refund did not complete', async () => {
    const check = await checkCredits('user_9', 'editron', 'render_export', { durationMinutes: 1 }, orgWallet);
    await check.deduct();
    (CreditsService.refundForWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: 'wallet ledger unavailable',
    });

    await expect(check.refund('render failed')).rejects.toThrow('wallet ledger unavailable');
  });

  it('with NO wallet, defaults to the personal wallet — today\'s behavior exactly', async () => {
    const check = await checkCredits('user_9', 'editron', 'render_export', { durationMinutes: 1 });
    await check.deduct();
    expect(CreditsService.deductForWallet).toHaveBeenCalledWith(
      { type: 'user', clerkUserId: 'user_9' }, 'editron', 'render_export', expect.anything(),
    );
  });

  it('insufficient ORG wallet => 402 tagged walletOwner:"org" (plan D2)', async () => {
    (CreditsService.hasCreditsForWallet as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasCredits: false, required: 3, available: 0, pool: 'main',
    });
    const check = await checkCredits('user_9', 'editron', 'render_export', { durationMinutes: 1 }, orgWallet);
    expect(check.allowed).toBe(false);
    expect((check.errorResponse as unknown as { body: Record<string, unknown> }).body).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      walletOwner: 'org',
    });
  });
});
