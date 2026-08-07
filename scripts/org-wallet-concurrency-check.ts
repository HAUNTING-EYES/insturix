/**
 * Org wallet concurrency HARD GATE (plan P1 exit, Decision 2-B step 2).
 *
 * Proves the shared-org-wallet's real failure modes never corrupt the balance, against a REAL
 * MongoDB (single-document atomicity is the database's guarantee — it cannot be proven in the
 * pure vitest layer, which has no DB). The pure wiring proof lives in
 * tests/services/org-wallet-ops.test.ts; this is the end-to-end companion.
 *
 * Two scenarios, both fired as genuine Promise.all races:
 *   1. LOST-UPDATE — wallet funded for EXACTLY one deduct; two members deduct at once. Exactly
 *      one must win, the pool must land at exactly 0 (never negative), and exactly one embedded
 *      txn + one ledger row must exist.
 *   2. IDEMPOTENT REPLAY — wallet funded for two; two members deduct at once with the SAME
 *      idempotencyKey. Both report success but the wallet is charged EXACTLY once.
 *
 * Runs only where a Mongo is available (CI/preview). With no MONGODB_URI it SKIPS and exits 0,
 * so it is safe to invoke locally. Touches only its own uniquely-named throwaway orgs and tears
 * them down in a finally — it can never affect real org data.
 *
 * Run: npx tsx scripts/org-wallet-concurrency-check.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import type { IOrganization } from '@/schemas/Organization';
import type { ICreditsBalance, ICreditTransaction } from '@/schemas/user';

const SERVICE = 'editron';
const ACTION = 'render_export';

let failures = 0;
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

/** Build a fully-zeroed balance with a single pool funded to `amount`. */
function fundedBalance(subField: string, amount: number): Record<string, unknown> {
  return {
    subscriptionCredits: 0,
    topupCredits: 0,
    lastSubscriptionGrant: null,
    subscriptionCreditsExpiry: null,
    mediaCredits: 0,
    mediaTopupCredits: 0,
    lastMediaGrant: null,
    mediaCreditsExpiry: null,
    creditHistory: [],
    [subField]: amount,
  };
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.log(
      '[org-wallet-concurrency-check] SKIP: no MONGODB_URI set. This gate runs only where a real Mongo is available (CI/preview); the pure wiring is covered by tests/services/org-wallet-ops.test.ts.',
    );
    process.exit(0);
  }

  // Dynamic imports AFTER the env guard — ConnectToDatabase throws at module-load without a URI.
  const connectToDatabase = (await import('@/schemas/ConnectToDatabase')).default;
  const { CreditsService } = await import('@/lib/services/creditsService');
  const { Organization } = await import('@/schemas/Organization');
  const { OrgCreditTransaction } = await import('@/schemas/OrgCreditTransaction');
  const { getCreditCost, getCreditPool } = await import('@/lib/config/creditCosts');

  await connectToDatabase();

  const cost = getCreditCost(SERVICE, ACTION);
  const pool = getCreditPool(SERVICE, ACTION);
  const subField = pool === 'media' ? 'mediaCredits' : 'subscriptionCredits';
  const topupField = pool === 'media' ? 'mediaTopupCredits' : 'topupCredits';

  const stamp = `${Date.now()}`;
  const orgRace = `org_test_conc_race_${stamp}`;
  const orgIdem = `org_test_conc_idem_${stamp}`;

  const poolTotal = (bal: ICreditsBalance | null): number => {
    const b = (bal ?? {}) as unknown as Record<string, number>;
    return (b[subField] ?? 0) + (b[topupField] ?? 0);
  };
  const usageCount = (org: IOrganization | null): number =>
    ((org?.creditsBalance?.creditHistory ?? []) as ICreditTransaction[]).filter(
      (t) => t.type === 'usage',
    ).length;

  try {
    console.log(`\n[org-wallet-concurrency-check] cost(${SERVICE}.${ACTION})=${cost} pool=${pool} (field=${subField})`);
    if (!(cost > 0)) {
      console.error(`  ✗ FAIL: chosen action has non-positive cost (${cost}); pick a priced action.`);
      failures += 1;
      throw new Error('unusable cost');
    }

    // ── Scenario 1: LOST-UPDATE ─────────────────────────────────────────────
    console.log('\nScenario 1 — two concurrent deducts, wallet funded for exactly one:');
    await Organization.create({
      clerkOrgId: orgRace,
      name: 'Concurrency Test (race)',
      slug: orgRace.toLowerCase(),
      createdBy: 'user_test',
      creditsBalance: fundedBalance(subField, cost),
    });

    const [r1, r2] = await Promise.all([
      CreditsService.deductOrgCredits(orgRace, 'user_A', SERVICE, ACTION),
      CreditsService.deductOrgCredits(orgRace, 'user_B', SERVICE, ACTION),
    ]);
    const wins = [r1, r2].filter((r) => r.success);
    const losses = [r1, r2].filter((r) => !r.success);
    check(wins.length === 1, `exactly one deduct succeeds (got ${wins.length})`);
    check(losses.length === 1, `exactly one deduct is rejected (got ${losses.length})`);
    check(
      losses.length === 1 && /insufficient/i.test(losses[0]?.error ?? ''),
      `rejection is an insufficient-credits error (got: ${losses[0]?.error ?? 'none'})`,
    );

    const balRace = await CreditsService.getOrgCreditsBalance(orgRace);
    check(poolTotal(balRace) === 0, `pool lands at exactly 0 — no lost update (got ${poolTotal(balRace)})`);
    const bRace = (balRace ?? {}) as unknown as Record<string, number>;
    check(
      (bRace[subField] ?? 0) >= 0 && (bRace[topupField] ?? 0) >= 0,
      'no pool went negative',
    );
    const orgRaceDoc = await Organization.findOne({ clerkOrgId: orgRace }).lean<IOrganization>();
    check(usageCount(orgRaceDoc) === 1, `exactly one embedded usage txn (got ${usageCount(orgRaceDoc)})`);
    const ledgerRace = await OrgCreditTransaction.countDocuments({ clerkOrgId: orgRace, type: 'deduct' });
    check(ledgerRace === 1, `exactly one durable ledger row (got ${ledgerRace})`);

    // ── Scenario 2: IDEMPOTENT REPLAY ───────────────────────────────────────
    console.log('\nScenario 2 — two concurrent deducts with the SAME idempotencyKey, funded for two:');
    await Organization.create({
      clerkOrgId: orgIdem,
      name: 'Concurrency Test (idem)',
      slug: orgIdem.toLowerCase(),
      createdBy: 'user_test',
      creditsBalance: fundedBalance(subField, cost * 2),
    });

    const key = `op_idem_${stamp}`;
    const [i1, i2] = await Promise.all([
      CreditsService.deductOrgCredits(orgIdem, 'user_A', SERVICE, ACTION, { idempotencyKey: key }),
      CreditsService.deductOrgCredits(orgIdem, 'user_B', SERVICE, ACTION, { idempotencyKey: key }),
    ]);
    check(!!i1.success && !!i2.success, 'both idempotent calls report success');
    const dupes = [i1, i2].filter((r) => r.duplicate).length;
    check(dupes >= 1, `at least one call is flagged duplicate (got ${dupes})`);

    const balIdem = await CreditsService.getOrgCreditsBalance(orgIdem);
    check(
      poolTotal(balIdem) === cost,
      `idempotent replay charges EXACTLY once: pool should be ${cost} (got ${poolTotal(balIdem)})`,
    );
    const orgIdemDoc = await Organization.findOne({ clerkOrgId: orgIdem }).lean<IOrganization>();
    check(usageCount(orgIdemDoc) === 1, `exactly one embedded usage txn after replay (got ${usageCount(orgIdemDoc)})`);
    const ledgerIdem = await OrgCreditTransaction.countDocuments({ clerkOrgId: orgIdem, type: 'deduct' });
    check(ledgerIdem === 1, `exactly one durable ledger row after replay (got ${ledgerIdem})`);
  } finally {
    // Tear down ONLY these two uniquely-named throwaway orgs + their ledger rows.
    const ids = [orgRace, orgIdem];
    try {
      await Organization.deleteMany({ clerkOrgId: { $in: ids } });
      await OrgCreditTransaction.deleteMany({ clerkOrgId: { $in: ids } });
    } catch (cleanupError) {
      console.error('  (cleanup warning)', cleanupError);
    }
  }

  if (failures > 0) {
    console.error(`\n[org-wallet-concurrency-check] ${failures} check(s) FAILED — shared-wallet invariant broken.`);
    process.exit(1);
  }
  console.log('\n[org-wallet-concurrency-check] ALL CHECKS PASSED — org wallet is race-safe and idempotent.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[org-wallet-concurrency-check] ERROR', err);
  process.exit(1);
});
