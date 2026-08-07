import { describe, it, expect } from 'vitest';
import type { ICreditTransaction } from '@/schemas/user';
import { buildOrgPoolDeduct, type OrgPoolDeductInput } from '@/lib/services/org-wallet-ops';

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
