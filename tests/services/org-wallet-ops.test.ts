import { describe, it, expect } from 'vitest';
import type { ICreditTransaction } from '@/schemas/user';
import {
  buildOrgPoolDeduct,
  buildOrgPoolRefund,
  resolveStampedWallet,
  type OrgPoolDeductInput,
  type OrgPoolRefundInput,
} from '@/lib/services/org-wallet-ops';

/**
 * Decision 2-B, step 1 — the pure WIRING proof.
 *
 * The genuine "two writers at once, exact final balance" proof needs a real Mongo (single-doc
 * atomicity is the DATABASE's guarantee) and runs in scripts/org-wallet-concurrency-check.ts.
 * What we CAN prove with zero database is that our deduct actually ENGAGES that guarantee — i.e.
 * the built filter carries the write-time $expr guard and the idempotency clause. If either
 * clause were dropped, the shared wallet would lose updates; these tests fail loudly if so.
 */

const txn: ICreditTransaction = {
  id: 'txn_test',
  type: 'usage',
  amount: -40,
  service: 'editron',
  action: 'render',
  timestamp: new Date(0),
  balanceAfter: 60,
  metadata: { pool: 'main', fromSubscription: 30, fromTopup: 10 },
};

const base: OrgPoolDeductInput = {
  clerkOrgId: 'org_1',
  service: 'editron',
  action: 'render',
  subPath: 'creditsBalance.subscriptionCredits',
  topupPath: 'creditsBalance.topupCredits',
  cost: 40,
  fromSubscription: 30,
  fromTopup: 10,
  transaction: txn,
  historyCap: 100,
};

describe('buildOrgPoolDeduct — shared-wallet race guard', () => {
  it('filter re-checks (subscription + topup) >= cost AT WRITE TIME ($expr $gte guard)', () => {
    const { filter } = buildOrgPoolDeduct(base);
    expect(filter).toMatchObject({
      clerkOrgId: 'org_1',
      $expr: {
        $gte: [
          {
            $add: [
              { $ifNull: ['$creditsBalance.subscriptionCredits', 0] },
              { $ifNull: ['$creditsBalance.topupCredits', 0] },
            ],
          },
          40,
        ],
      },
    });
  });

  it('update deducts the exact split as a negated $inc on the two pool paths', () => {
    const { update } = buildOrgPoolDeduct(base);
    expect(update).toMatchObject({
      $inc: {
        'creditsBalance.subscriptionCredits': -30,
        'creditsBalance.topupCredits': -10,
      },
    });
  });

  it('the two $inc amounts sum to exactly -cost (no pool can be over- or under-charged)', () => {
    const { update } = buildOrgPoolDeduct(base);
    const inc = update.$inc as Record<string, number>;
    const total = inc['creditsBalance.subscriptionCredits'] + inc['creditsBalance.topupCredits'];
    expect(total).toBe(-base.cost);
  });

  it('update appends the txn to the capped embedded history ($push $slice: -historyCap)', () => {
    const { update } = buildOrgPoolDeduct(base);
    const push = (update.$push as Record<string, { $each: unknown[]; $slice: number }>)[
      'creditsBalance.creditHistory'
    ];
    expect(push.$slice).toBe(-100);
    expect(push.$each).toEqual([txn]);
  });

  it('WITHOUT an idempotencyKey, no idempotency clause is added to the filter', () => {
    const { filter } = buildOrgPoolDeduct(base);
    // literal dotted key, not a nested path — check own-key presence directly
    expect('creditsBalance.creditHistory' in filter).toBe(false);
  });

  it('WITH an idempotencyKey, a $not $elemMatch clause dedupes the exact op', () => {
    const { filter } = buildOrgPoolDeduct({ ...base, idempotencyKey: 'op_abc' });
    expect('creditsBalance.creditHistory' in filter).toBe(true);
    expect(filter).toMatchObject({
      'creditsBalance.creditHistory': {
        $not: {
          $elemMatch: {
            type: 'usage',
            service: 'editron',
            action: 'render',
            'metadata.idempotencyKey': 'op_abc',
          },
        },
      },
    });
  });
});

const refundTxn: ICreditTransaction = {
  id: 'txn_refund',
  type: 'refund',
  amount: 40,
  service: 'editron',
  action: 'render',
  timestamp: new Date(0),
  balanceAfter: 0,
  metadata: { pool: 'main', fromSubscription: 30, fromTopup: 10, originalTransactionId: 'txn_orig' },
};

const refundBase: OrgPoolRefundInput = {
  clerkOrgId: 'org_1',
  subPath: 'creditsBalance.subscriptionCredits',
  topupPath: 'creditsBalance.topupCredits',
  fromSubscription: 30,
  fromTopup: 10,
  transaction: refundTxn,
  originalTransactionId: 'txn_orig',
  historyCap: 100,
};

describe('buildOrgPoolRefund — money returns to the same pool split, at most once', () => {
  it('update returns the exact split as a POSITIVE $inc on the two pool paths', () => {
    const { update } = buildOrgPoolRefund(refundBase);
    expect(update).toMatchObject({
      $inc: {
        'creditsBalance.subscriptionCredits': 30,
        'creditsBalance.topupCredits': 10,
      },
    });
  });

  it('the returned split sums to exactly the refunded amount', () => {
    const { update } = buildOrgPoolRefund(refundBase);
    const inc = update.$inc as Record<string, number>;
    expect(inc['creditsBalance.subscriptionCredits'] + inc['creditsBalance.topupCredits']).toBe(
      refundTxn.amount,
    );
  });

  it('filter never seeds a wallet and dedupes on the original charge (at-most-once refund)', () => {
    const { filter } = buildOrgPoolRefund(refundBase);
    expect(filter).toMatchObject({
      clerkOrgId: 'org_1',
      creditsBalance: { $exists: true },
      'creditsBalance.creditHistory': {
        $not: {
          $elemMatch: {
            type: 'refund',
            'metadata.originalTransactionId': 'txn_orig',
          },
        },
      },
    });
  });

  it('WITHOUT an originalTransactionId, no dedup clause is added (but the wallet must exist)', () => {
    const { filter } = buildOrgPoolRefund({ ...refundBase, originalTransactionId: undefined });
    expect('creditsBalance.creditHistory' in filter).toBe(false);
    expect(filter).toMatchObject({ clerkOrgId: 'org_1', creditsBalance: { $exists: true } });
  });

  it('update appends the refund txn to the capped embedded history ($push $slice)', () => {
    const { update } = buildOrgPoolRefund(refundBase);
    const push = (update.$push as Record<string, { $each: unknown[]; $slice: number }>)[
      'creditsBalance.creditHistory'
    ];
    expect(push.$slice).toBe(-100);
    expect(push.$each).toEqual([refundTxn]);
  });
});

describe('resolveStampedWallet (P3.1 — deferred refunds read the stamp, never re-resolve)', () => {
  it('ABSENT stamp => personal wallet keyed by the fallback user (grandfathered legacy rows)', () => {
    expect(resolveStampedWallet(undefined, 'user_9', 'ThinkForge generation')).toEqual({
      type: 'user',
      clerkUserId: 'user_9',
    });
    expect(resolveStampedWallet(null, 'user_9', 'ThinkForge generation')).toEqual({
      type: 'user',
      clerkUserId: 'user_9',
    });
  });

  it('org stamp => the org wallet, with the STAMPED actor (never the fallback)', () => {
    expect(resolveStampedWallet(
      { type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_9' },
      'user_OTHER',
      'ThinkForge generation',
    )).toEqual({ type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_9' });
  });

  it('org stamp WITHOUT an actor => org wallet with the fallback actor (report-only, D9)', () => {
    expect(resolveStampedWallet(
      { type: 'org', clerkOrgId: 'org_1' },
      'user_9',
      'ThinkForge generation',
    )).toEqual({ type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_9' });
  });

  it('user stamp => the stamped personal wallet (not the fallback)', () => {
    expect(resolveStampedWallet(
      { type: 'user', clerkUserId: 'user_7' },
      'user_9',
      'ThinkForge generation',
    )).toEqual({ type: 'user', clerkUserId: 'user_7' });
  });

  it('MALFORMED stamps fail LOUD instead of guessing a wallet (money code never guesses)', () => {
    expect(() => resolveStampedWallet('org_1', 'user_9', 'ThinkForge generation')).toThrow(/Invalid billedWallet stamp/);
    expect(() => resolveStampedWallet({ type: 'org' }, 'user_9', 'ThinkForge generation')).toThrow(/Invalid billedWallet stamp/);
    expect(() => resolveStampedWallet({ type: 'org', clerkOrgId: '' }, 'user_9', 'ThinkForge generation')).toThrow(/Invalid billedWallet stamp/);
    expect(() => resolveStampedWallet({ type: 'user', clerkUserId: '' }, 'user_9', 'ThinkForge generation')).toThrow(/Invalid billedWallet stamp/);
    expect(() => resolveStampedWallet({ type: 'team', clerkOrgId: 'org_1' }, 'user_9', 'ThinkForge generation')).toThrow(/Invalid billedWallet stamp/);
  });
});
