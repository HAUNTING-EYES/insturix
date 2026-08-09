/**
 * Org wallet atomic-op builder — PURE LEAF (plan §3, Decision 1).
 *
 * Builds the exact { filter, update } pair for an org-wallet pool deduct, mirroring the
 * proven single-document atomic pattern in creditsService.deductCredits (the $expr $gte
 * write-time guard + the $not $elemMatch idempotency clause + the capped $push). Because a
 * single Organization document is updated, MongoDB serializes concurrent writers, so this is
 * the mechanism that makes the shared org wallet safe against lost updates — the new failure
 * mode when many members spend one wallet.
 *
 * WHY THIS FILE EXISTS AS A LEAF: creditsService.ts imports connectToDatabase + mongoose
 * models, so importing it in a test throws at module-load without MONGODB_URI (same trap that
 * forced project-ownership.ts out of project-service.ts). This module has ZERO runtime imports
 * (ICreditTransaction is an erased `import type`), so the concurrency-wiring can be unit-tested
 * — asserting the guard clauses are present — with no database at all (Decision 2-B, step 1).
 * The genuine two-writers-at-once proof runs against a real Mongo in the integration script.
 */

import type { ICreditTransaction } from "@/schemas/user";
import type { WalletRef } from "@/lib/editron/services/project-ownership";

export interface OrgPoolDeductInput {
  /** The org whose single wallet document is updated (the serialization point). */
  clerkOrgId: string;
  service: string;
  action: string;
  /** Dotted path to the pool's subscription balance, e.g. `creditsBalance.subscriptionCredits`. */
  subPath: string;
  /** Dotted path to the pool's top-up balance, e.g. `creditsBalance.topupCredits`. */
  topupPath: string;
  cost: number;
  /** Amount drawn from the subscription pool (spent first — it expires). */
  fromSubscription: number;
  /** Amount drawn from the top-up pool (spent second — never expires). */
  fromTopup: number;
  /** The embedded transaction record pushed onto the wallet's capped creditHistory. */
  transaction: ICreditTransaction;
  /** When present, the write is a no-op if a matching txn already landed (idempotency). */
  idempotencyKey?: string;
  /** Embedded-history cap (pass creditsService.MAX_CREDIT_HISTORY — the single source). */
  historyCap: number;
}

/**
 * Produce the atomic filter + update for an org-wallet deduct. Pure: no I/O, no config, no
 * clock — the exact same inputs always yield the exact same objects. The caller runs it via
 * Organization.findOneAndUpdate(filter, update, { new: true }).
 *
 * The filter carries two guards that together prevent the shared-wallet race:
 *   1. $expr $gte — re-checks (subscription + topup) >= cost AT WRITE TIME against the live
 *      document, so a second concurrent deduct that would overshoot zero matches nothing and
 *      returns null (rejected). $ifNull guards legacy docs missing the media fields.
 *   2. $not $elemMatch (only when idempotencyKey is set) — a replay of the same operation
 *      matches nothing, so the deduct is applied at most once.
 */
export function buildOrgPoolDeduct(input: OrgPoolDeductInput): {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  const {
    clerkOrgId,
    service,
    action,
    subPath,
    topupPath,
    cost,
    fromSubscription,
    fromTopup,
    transaction,
    idempotencyKey,
    historyCap,
  } = input;

  const filter: Record<string, unknown> = {
    clerkOrgId,
    ...(idempotencyKey
      ? {
          'creditsBalance.creditHistory': {
            $not: {
              $elemMatch: {
                type: 'usage',
                service,
                action,
                'metadata.idempotencyKey': idempotencyKey,
              },
            },
          },
        }
      : {}),
    // Sufficient credits IN THIS POOL at write time (prevents the concurrent-deduction race).
    $expr: {
      $gte: [
        {
          $add: [
            { $ifNull: [`$${subPath}`, 0] },
            { $ifNull: [`$${topupPath}`, 0] },
          ],
        },
        cost,
      ],
    },
  };

  const update: Record<string, unknown> = {
    $inc: {
      [subPath]: -fromSubscription,
      [topupPath]: -fromTopup,
    },
    $push: {
      'creditsBalance.creditHistory': {
        $each: [transaction],
        $slice: -historyCap,
      },
    },
  };

  return { filter, update };
}

export interface OrgPoolRefundInput {
  clerkOrgId: string;
  /** Dotted path to the pool's subscription balance the split returns to. */
  subPath: string;
  /** Dotted path to the pool's top-up balance the split returns to. */
  topupPath: string;
  /** Credits to return to the subscription pool (the original charge's recorded split). */
  fromSubscription: number;
  /** Credits to return to the top-up pool (the original charge's recorded split). */
  fromTopup: number;
  /** The embedded 'refund' transaction pushed onto the wallet's capped creditHistory. */
  transaction: ICreditTransaction;
  /** When present, the write is a no-op if this charge was already refunded (idempotency). */
  originalTransactionId?: string;
  /** Embedded-history cap (pass creditsService.MAX_CREDIT_HISTORY — the single source). */
  historyCap: number;
}

/**
 * Produce the atomic filter + update for an org-wallet REFUND — the mirror of buildOrgPoolDeduct.
 * Pure: no I/O, no clock. The caller runs it via Organization.findOneAndUpdate(filter, update,
 * { new: true }) after looking up the original charge's pool + split.
 *
 * The filter carries the at-most-once guard: `creditsBalance: { $exists: true }` (never seed a
 * wallet on a refund) plus, when originalTransactionId is set, a $not $elemMatch that makes a
 * replayed refund of the same charge match nothing — so a double auto-refund credits the wallet
 * only once. The update $inc is POSITIVE (credits returned), returning each pool exactly the split
 * that left it, so the money lands back where it came from and the wallet cannot leak.
 */
export function buildOrgPoolRefund(input: OrgPoolRefundInput): {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  const {
    clerkOrgId,
    subPath,
    topupPath,
    fromSubscription,
    fromTopup,
    transaction,
    originalTransactionId,
    historyCap,
  } = input;

  const filter: Record<string, unknown> = {
    clerkOrgId,
    creditsBalance: { $exists: true },
    ...(originalTransactionId
      ? {
          'creditsBalance.creditHistory': {
            $not: {
              $elemMatch: {
                type: 'refund',
                'metadata.originalTransactionId': originalTransactionId,
              },
            },
          },
        }
      : {}),
  };

  const update: Record<string, unknown> = {
    $inc: {
      [subPath]: fromSubscription,
      [topupPath]: fromTopup,
    },
    $push: {
      'creditsBalance.creditHistory': {
        $each: [transaction],
        $slice: -historyCap,
      },
    },
  };

  return { filter, update };
}

/**
 * Read a persisted billing stamp (plan §3, P3 — "every later charge and refund reads the
 * stamp"). The recorded WalletRef decides who a deferred/headless refund pays — it is NEVER
 * re-resolved from ambient context at refund time (D5), so a member leaving the org between
 * charge and refund cannot leak org money into a personal wallet. Pure leaf: no I/O, no clock.
 *
 * - ABSENT stamp => personal wallet keyed by `fallbackUserId` — the grandfathered rule for
 *   legacy rows created before stamps existed.
 * - MALFORMED stamp => throws (fail LOUD). Money code never guesses a wallet: a guessed
 *   org-wallet refund could credit the wrong org, a guessed personal one could leak.
 *
 * @param stamp         the stamped WalletRef as persisted on the billable record (raw DB JSON)
 * @param fallbackUserId key for personal stamps and the ledger actor when the stamp omits it
 * @param contextLabel  human-readable origin for error messages (e.g. "ThinkForge generation")
 */
export function resolveStampedWallet(
  stamp: unknown,
  fallbackUserId: string,
  contextLabel: string,
): WalletRef {
  if (stamp == null) {
    return { type: 'user', clerkUserId: fallbackUserId };
  }
  if (typeof stamp !== 'object' || Array.isArray(stamp)) {
    throw new Error(`Invalid billedWallet stamp on ${contextLabel}: ${JSON.stringify(stamp)}`);
  }
  const record = stamp as Record<string, unknown>;
  if (
    record.type === 'org'
    && typeof record.clerkOrgId === 'string'
    && record.clerkOrgId.trim()
  ) {
    return {
      type: 'org',
      clerkOrgId: record.clerkOrgId,
      // WHO the refund is attributed to on the org ledger — the stamped actor if present, else
      // the caller's fallback. Reporting only (D9); the wallet is identified by clerkOrgId alone.
      actorUserId:
        typeof record.actorUserId === 'string' && record.actorUserId.trim()
          ? record.actorUserId
          : fallbackUserId,
    };
  }
  if (
    record.type === 'user'
    && typeof record.clerkUserId === 'string'
    && record.clerkUserId.trim()
  ) {
    return { type: 'user', clerkUserId: record.clerkUserId };
  }
  throw new Error(`Invalid billedWallet stamp on ${contextLabel}: ${JSON.stringify(stamp)}`);
}
