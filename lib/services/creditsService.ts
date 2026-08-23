/**
 * Credits Service
 * 
 * Core service for managing user credits balance and transactions.
 * 
 * Consumption order:
 * 1. Subscription credits first (they expire monthly)
 * 2. Top-up credits second (they never expire)
 */

import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User, ICreditsBalance, ICreditTransaction } from "@/schemas/user";
import {
  getCreditCost,
  getPlanCreditAllocation,
  getPlanMediaCreditAllocation,
  getCreditPool,
  type CreditPool,
} from "@/lib/config/creditCosts";
import { nanoid } from "nanoid";
import { Organization, type IOrganization } from "@/schemas/Organization";
import { OrgCreditTransaction } from "@/schemas/OrgCreditTransaction";
import { buildOrgPoolDeduct, buildOrgPoolRefund } from "@/lib/services/org-wallet-ops";
import type { WalletRef } from "@/lib/editron/services/project-ownership";
import type { FilterQuery, UpdateQuery } from "mongoose";
import { createProviderNativeProductBudgetCreditsOwnerV2R } from "@/lib/editron/services/provider-native-product-budget-credits-owner-v2r";
import {
  createCreditsServiceProductBudgetMongoLedgerV2R,
  type ProviderNativeProductBudgetMongoRuntimeV2R,
} from "@/lib/services/provider-native-product-budget-mongo-ledger-v2r";

// Maximum transactions to keep in history (to prevent unbounded growth)
const MAX_CREDIT_HISTORY = 100;

/**
 * Field paths for a given credit pool. The wallet holds two independent pools
 * (main + media), each with a subscription balance (expires) and a top-up
 * balance (never expires). Every deduct/grant/refund routes through one pool.
 */
const POOL_FIELDS: Record<CreditPool, {
  subscription: 'subscriptionCredits' | 'mediaCredits';
  topup: 'topupCredits' | 'mediaTopupCredits';
  lastGrant: 'lastSubscriptionGrant' | 'lastMediaGrant';
  expiry: 'subscriptionCreditsExpiry' | 'mediaCreditsExpiry';
}> = {
  main: {
    subscription: 'subscriptionCredits',
    topup: 'topupCredits',
    lastGrant: 'lastSubscriptionGrant',
    expiry: 'subscriptionCreditsExpiry',
  },
  media: {
    subscription: 'mediaCredits',
    topup: 'mediaTopupCredits',
    lastGrant: 'lastMediaGrant',
    expiry: 'mediaCreditsExpiry',
  },
};

/** A fresh, fully-initialized (zeroed) credits balance for both pools. */
function emptyCreditsBalance() {
  return {
    subscriptionCredits: 0,
    topupCredits: 0,
    lastSubscriptionGrant: null,
    subscriptionCreditsExpiry: null,
    mediaCredits: 0,
    mediaTopupCredits: 0,
    lastMediaGrant: null,
    mediaCreditsExpiry: null,
    creditHistory: [] as ICreditTransaction[],
  };
}

export interface CreditsPurchaseResult {
  success: boolean;
  balance?: ICreditsBalance;
  error?: string;
  /** True when the grant was skipped because this Razorpay event was already processed (idempotent no-op). */
  duplicate?: boolean;
}

export interface CreditsDeductResult {
  success: boolean;
  creditsDeducted: number;
  balance?: ICreditsBalance;
  transactionId?: string;
  error?: string;
  duplicate?: boolean;
}

export interface CreditsBalanceInfo {
  // MAIN pool
  subscriptionCredits: number;
  topupCredits: number;
  totalCredits: number; // main pool total (subscription + topup)
  lastSubscriptionGrant: Date | null;
  subscriptionCreditsExpiry: Date | null;
  // MEDIA pool (image/video/audio generation)
  mediaCredits: number;
  mediaTopupCredits: number;
  totalMediaCredits: number; // media pool total (subscription + topup)
  lastMediaGrant: Date | null;
  mediaCreditsExpiry: Date | null;
  recentTransactions: ICreditTransaction[];
}

export class CreditsService {
  /**
   * Sole product-budget wallet composition boundary. The Mongo helper is an
   * implementation detail; callers receive only the versioned reserve/settle
   * and exact-reservation lookup contract.
   */
  static createProviderNativeProductBudgetOwnerV2R(input: Readonly<{
    now?: () => string;
    loadRuntime?: () => Promise<Readonly<ProviderNativeProductBudgetMongoRuntimeV2R>>;
  }> = {}) {
    return createProviderNativeProductBudgetCreditsOwnerV2R({
      ledger: createCreditsServiceProductBudgetMongoLedgerV2R({
        historyCap: MAX_CREDIT_HISTORY,
        loadRuntime: input.loadRuntime,
      }),
      now: input.now,
    });
  }

  /**
   * Get user's current credits balance
   */
  static async getBalance(clerkUserId: string): Promise<CreditsBalanceInfo> {
    await connectToDatabase();
    
    const user = await User.findOne({ clerkUserId }).select('creditsBalance');
    if (!user) {
      console.error(`[CreditsService] User not found during getBalance: ${clerkUserId}`);
      // Fallback: try one more time without select to see if it's a weird Mongoose state
      const userAlt = await User.findOne({ clerkUserId });
      if (!userAlt) {
        throw new Error(`User not found: ${clerkUserId}`);
      }
      return this.getBalanceFromUser(userAlt);
    }

    return this.getBalanceFromUser(user);
  }

  /**
   * Helper to extract balance from user document
   */
  private static async getBalanceFromUser(user: any): Promise<CreditsBalanceInfo> {
    const clerkUserId = user.clerkUserId;

    // Initialize credits balance if not present (for existing users)
    if (!user.creditsBalance) {
      user.creditsBalance = emptyCreditsBalance();
      await user.save();
    }

    const balance = user.creditsBalance;
    // Existing users predate the media pool; treat missing media fields as 0.
    const mediaCredits = balance.mediaCredits ?? 0;
    const mediaTopupCredits = balance.mediaTopupCredits ?? 0;
    return {
      subscriptionCredits: balance.subscriptionCredits,
      topupCredits: balance.topupCredits,
      totalCredits: balance.subscriptionCredits + balance.topupCredits,
      lastSubscriptionGrant: balance.lastSubscriptionGrant,
      subscriptionCreditsExpiry: balance.subscriptionCreditsExpiry,
      mediaCredits,
      mediaTopupCredits,
      totalMediaCredits: mediaCredits + mediaTopupCredits,
      lastMediaGrant: balance.lastMediaGrant ?? null,
      mediaCreditsExpiry: balance.mediaCreditsExpiry ?? null,
      recentTransactions: balance.creditHistory.slice(-10), // Last 10 transactions
    };
  }

  /**
   * Check if user has enough credits for an action
   */
  static async hasCredits(
    clerkUserId: string,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      quantity?: number;
    }
  ): Promise<{ hasCredits: boolean; required: number; available: number; pool: CreditPool }> {
    const balance = await this.getBalance(clerkUserId);
    const required = getCreditCost(service, action, options);
    const pool = getCreditPool(service, action);
    // Media actions gate on the media pool; everything else on the main pool.
    const available = pool === 'media' ? balance.totalMediaCredits : balance.totalCredits;

    return {
      hasCredits: available >= required,
      required,
      available,
      pool,
    };
  }

  /**
   * Pre-flight balance check for an ORG wallet (plan §3, P2) — the org analogue of hasCredits.
   * Read-only: an org with no wallet yet reports available 0 (the typed-402 empty-org case, D2).
   * Routes on the same pool rule as the charge (media action => media pool).
   */
  static async hasOrgCredits(
    clerkOrgId: string,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      quantity?: number;
    }
  ): Promise<{ hasCredits: boolean; required: number; available: number; pool: CreditPool }> {
    const balance = await this.getOrgCreditsBalance(clerkOrgId);
    const required = getCreditCost(service, action, options);
    const pool = getCreditPool(service, action);
    const b = (balance ?? {}) as unknown as Record<string, number>;
    const available = pool === 'media'
      ? (b.mediaCredits ?? 0) + (b.mediaTopupCredits ?? 0)
      : (b.subscriptionCredits ?? 0) + (b.topupCredits ?? 0);

    return {
      hasCredits: available >= required,
      required,
      available,
      pool,
    };
  }

  /**
   * Pre-flight balance check routed to the correct wallet (plan §3, P2) — the mirror of
   * deductForWallet/refundForWallet, so a route's gate checks the SAME wallet it will bill.
   */
  static async hasCreditsForWallet(
    wallet: WalletRef,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      quantity?: number;
    }
  ): Promise<{ hasCredits: boolean; required: number; available: number; pool: CreditPool }> {
    if (wallet.type === 'org') {
      return this.hasOrgCredits(wallet.clerkOrgId, service, action, options);
    }
    return this.hasCredits(wallet.clerkUserId, service, action, options);
  }

  /**
   * Deduct credits for a service usage
   * Consumes subscription credits first, then top-up credits
   * Uses atomic MongoDB operations to prevent race conditions
   */
  static async deductCredits(
    clerkUserId: string,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      taskId?: string;
      idempotencyKey?: string;
      /** Batch/fan-out multiplier (e.g., 4 scenes means 4 priced units). */
      quantity?: number;
    }
  ): Promise<CreditsDeductResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, creditsDeducted: 0, error: `User not found: ${clerkUserId}` };
    }

    // Initialize credits balance if needed
    if (!user.creditsBalance) {
      await User.findOneAndUpdate(
        { clerkUserId },
        { $set: { creditsBalance: emptyCreditsBalance() } },
      );
      return { success: false, creditsDeducted: 0, error: 'Credits initialized, please retry' };
    }

    const idempotencyKey = options?.idempotencyKey;
    if (idempotencyKey) {
      const existingTransaction = user.creditsBalance.creditHistory?.find(
        (entry: ICreditTransaction) => (
          entry.type === 'usage'
          && entry.service === service
          && entry.action === action
          && entry.metadata?.idempotencyKey === idempotencyKey
        ),
      );
      if (existingTransaction) {
        return {
          success: true,
          creditsDeducted: Math.abs(existingTransaction.amount),
          balance: user.creditsBalance,
          transactionId: existingTransaction.id,
          duplicate: true,
        };
      }
    }

    const cost = getCreditCost(service, action, options);
    // Route to the correct pool: media generation debits the media pool,
    // everything else debits the main pool.
    const pool = getCreditPool(service, action);
    const fields = POOL_FIELDS[pool];
    const balance = user.creditsBalance;
    // Legacy docs predate the media pool; treat missing balances as 0.
    const poolSubscription = (balance as unknown as Record<string, number>)[fields.subscription] ?? 0;
    const poolTopup = (balance as unknown as Record<string, number>)[fields.topup] ?? 0;
    const totalAvailable = poolSubscription + poolTopup;

    if (totalAvailable < cost) {
      return {
        success: false,
        creditsDeducted: 0,
        error: `Insufficient ${pool} credits. Required: ${cost}, Available: ${totalAvailable}`,
      };
    }

    // Calculate split: subscription first (expires), then topup (never expires)
    const fromSubscription = Math.min(poolSubscription, cost);
    const fromTopup = cost - fromSubscription;
    const newTotal = totalAvailable - cost;

    // Create transaction record
    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'usage',
      amount: -cost,
      service,
      action,
      model: options?.model,
      taskId: options?.taskId,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: {
        pool,
        fromSubscription,
        fromTopup,
        ...options,
      },
    };

    const subPath = `creditsBalance.${fields.subscription}`;
    const topupPath = `creditsBalance.${fields.topup}`;

    // Atomic update: $inc for credits, $push for history (capped)
    const updated = await User.findOneAndUpdate(
      {
        clerkUserId,
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
        // Ensure sufficient credits IN THIS POOL at write time (prevents race
        // condition). $ifNull guards legacy docs that lack the media fields.
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
      },
      {
        $inc: {
          [subPath]: -fromSubscription,
          [topupPath]: -fromTopup,
        },
        $push: {
          'creditsBalance.creditHistory': {
            $each: [transaction],
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      if (idempotencyKey) {
        const concurrentUser = await User.findOne({ clerkUserId });
        const existingTransaction = concurrentUser?.creditsBalance?.creditHistory?.find(
          (entry: ICreditTransaction) => (
            entry.type === 'usage'
            && entry.service === service
            && entry.action === action
            && entry.metadata?.idempotencyKey === idempotencyKey
          ),
        );
        if (existingTransaction) {
          return {
            success: true,
            creditsDeducted: Math.abs(existingTransaction.amount),
            balance: concurrentUser?.creditsBalance,
            transactionId: existingTransaction.id,
            duplicate: true,
          };
        }
      }
      return {
        success: false,
        creditsDeducted: 0,
        error: `Insufficient ${pool} credits (concurrent deduction). Required: ${cost}`,
      };
    }

    console.log(`[CreditsService] Deducted ${cost} ${pool} credits from user ${clerkUserId} for ${service}.${action}`);

    return {
      success: true,
      creditsDeducted: cost,
      balance: updated.creditsBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Read an ORG wallet's balance (both pools). Read-only — never seeds. Returns null when the
   * org has no wallet yet (never funded/charged); callers treat null as zero available, i.e.
   * the typed-402 empty-org-wallet case (plan D2).
   */
  static async getOrgCreditsBalance(clerkOrgId: string): Promise<ICreditsBalance | null> {
    await connectToDatabase();
    const org = await Organization.findOne({ clerkOrgId }).lean<IOrganization>();
    return ((org?.creditsBalance as ICreditsBalance | undefined) ?? null);
  }

  /**
   * Deduct credits from an ORG wallet (plan §3, Decision 1). The org analogue of
   * deductCredits: the SAME single-document atomic guard, now on the Organization doc, so
   * concurrent member spends against one shared wallet can never lose an update or overshoot
   * zero (MongoDB serializes writes to a single document). On success it also writes a SEPARATE
   * durable row to org_credit_transactions for unbounded per-member spend reporting (plan D4).
   *
   * Deliberately a parallel method, not a refactor of deductCredits: the proven user money
   * path stays untouched. The atomic filter/update is shared via the pure buildOrgPoolDeduct
   * leaf so the concurrency guard is unit-testable without a database.
   *
   * @param clerkOrgId  the org being billed — its single wallet document is the serialization point
   * @param actorUserId WHO spent (the per-member report key); never the billing signal (plan D9)
   */
  static async deductOrgCredits(
    clerkOrgId: string,
    actorUserId: string,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      taskId?: string;
      idempotencyKey?: string;
      /** Batch/fan-out multiplier (e.g., 4 scenes means 4 priced units). */
      quantity?: number;
      /** Recorded on the ledger row for per-project spend reporting. */
      projectId?: string;
    }
  ): Promise<CreditsDeductResult> {
    await connectToDatabase();

    const org = await Organization.findOne({ clerkOrgId });
    if (!org) {
      return { success: false, creditsDeducted: 0, error: `Organization not found: ${clerkOrgId}` };
    }

    // Seed an empty wallet on first touch (mirrors the user path). An unfunded org wallet then
    // fails the insufficient-credits check below — that is the typed-402 empty-org case (D2).
    if (!org.creditsBalance) {
      await Organization.findOneAndUpdate(
        { clerkOrgId },
        { $set: { creditsBalance: emptyCreditsBalance() } },
      );
      return { success: false, creditsDeducted: 0, error: 'Org credits initialized, please retry' };
    }

    const idempotencyKey = options?.idempotencyKey;
    if (idempotencyKey) {
      const existingTransaction = org.creditsBalance.creditHistory?.find(
        (entry: ICreditTransaction) => (
          entry.type === 'usage'
          && entry.service === service
          && entry.action === action
          && entry.metadata?.idempotencyKey === idempotencyKey
        ),
      );
      if (existingTransaction) {
        return {
          success: true,
          creditsDeducted: Math.abs(existingTransaction.amount),
          balance: org.creditsBalance,
          transactionId: existingTransaction.id,
          duplicate: true,
        };
      }
    }

    const cost = getCreditCost(service, action, options);
    // Route to the correct pool: media generation debits the media pool, everything else main.
    const pool = getCreditPool(service, action);
    const fields = POOL_FIELDS[pool];
    const balance = org.creditsBalance;
    // Legacy docs predate the media pool; treat missing balances as 0.
    const poolSubscription = (balance as unknown as Record<string, number>)[fields.subscription] ?? 0;
    const poolTopup = (balance as unknown as Record<string, number>)[fields.topup] ?? 0;
    const totalAvailable = poolSubscription + poolTopup;

    if (totalAvailable < cost) {
      return {
        success: false,
        creditsDeducted: 0,
        error: `Insufficient ${pool} org credits. Required: ${cost}, Available: ${totalAvailable}`,
      };
    }

    // Calculate split: subscription first (expires), then topup (never expires)
    const fromSubscription = Math.min(poolSubscription, cost);
    const fromTopup = cost - fromSubscription;
    const newTotal = totalAvailable - cost;

    // Embedded transaction (fast-path idempotency + immediate audit). actorUserId is stamped so
    // the embedded history alone can reconstruct WHO spent if the durable ledger row is lost.
    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'usage',
      amount: -cost,
      service,
      action,
      model: options?.model,
      taskId: options?.taskId,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: {
        pool,
        fromSubscription,
        fromTopup,
        actorUserId,
        ...options,
      },
    };

    const subPath = `creditsBalance.${fields.subscription}`;
    const topupPath = `creditsBalance.${fields.topup}`;

    // Atomic single-document deduct on the Organization doc (the shared-wallet race guard).
    const { filter, update } = buildOrgPoolDeduct({
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
      historyCap: MAX_CREDIT_HISTORY,
    });

    const updated = await Organization.findOneAndUpdate(
      filter as unknown as FilterQuery<IOrganization>,
      update as unknown as UpdateQuery<IOrganization>,
      { new: true },
    );

    if (!updated) {
      // The write matched nothing: either a concurrent deduct exhausted the pool, or (with an
      // idempotencyKey) a concurrent replay already applied this exact op.
      if (idempotencyKey) {
        const concurrentOrg = await Organization.findOne({ clerkOrgId });
        const existingTransaction = concurrentOrg?.creditsBalance?.creditHistory?.find(
          (entry: ICreditTransaction) => (
            entry.type === 'usage'
            && entry.service === service
            && entry.action === action
            && entry.metadata?.idempotencyKey === idempotencyKey
          ),
        );
        if (existingTransaction) {
          return {
            success: true,
            creditsDeducted: Math.abs(existingTransaction.amount),
            balance: concurrentOrg?.creditsBalance,
            transactionId: existingTransaction.id,
            duplicate: true,
          };
        }
      }
      return {
        success: false,
        creditsDeducted: 0,
        error: `Insufficient ${pool} org credits (concurrent deduction). Required: ${cost}`,
      };
    }

    // Accurate post-write pool total (reflects the serialized order), for the ledger's audit field.
    const updatedBalance = updated.creditsBalance as unknown as Record<string, number>;
    const balanceAfter = (updatedBalance[fields.subscription] ?? 0) + (updatedBalance[fields.topup] ?? 0);

    // Durable per-member ledger row (plan D4). SEPARATE from the balance write by design: the
    // money is already deducted AND recorded in the embedded creditHistory above, so a ledger
    // failure must NOT roll back the charge — it fails LOUD (R18N) and stays reconcilable from
    // creditHistory. This is why no cross-collection transaction is needed (Decision 1).
    try {
      await OrgCreditTransaction.create({
        clerkOrgId,
        actorUserId,
        projectId: options?.projectId,
        pool,
        type: 'deduct',
        amount: -cost,
        balanceAfter,
        operationId: idempotencyKey,
        metadata: {
          fromSubscription,
          fromTopup,
          service,
          action,
          model: options?.model,
          taskId: options?.taskId,
        },
      });
    } catch (ledgerError) {
      console.error(
        `[CreditsService] ORG LEDGER WRITE FAILED (balance already deducted; reconcile from creditHistory) org=${clerkOrgId} actor=${actorUserId} txn=${transaction.id} ${service}.${action}:`,
        ledgerError,
      );
    }

    console.log(`[CreditsService] Deducted ${cost} ${pool} org credits from org ${clerkOrgId} (actor ${actorUserId}) for ${service}.${action}`);

    return {
      success: true,
      creditsDeducted: cost,
      balance: updated.creditsBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Route a deduct to the correct wallet (plan §3, P2). The SINGLE dispatch point every editron
   * charge point calls once it has resolved a WalletRef via resolveBillingOwner: an org-owned
   * project bills the org wallet (with the actor recorded), everything else the personal wallet.
   * Keeps CreditsService the sole writer of both wallets — routes never touch a balance directly.
   */
  static async deductForWallet(
    wallet: WalletRef,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      characterCount?: number;
      durationMinutes?: number;
      durationSeconds?: number;
      taskId?: string;
      idempotencyKey?: string;
      quantity?: number;
      projectId?: string;
    }
  ): Promise<CreditsDeductResult> {
    if (wallet.type === 'org') {
      return this.deductOrgCredits(wallet.clerkOrgId, wallet.actorUserId, service, action, options);
    }
    return this.deductCredits(wallet.clerkUserId, service, action, options);
  }

  /**
   * Add credits to user balance (Top-up or Subscription Grant)
   * Uses atomic MongoDB operations to prevent race conditions
   */
  static async addCredits(
    clerkUserId: string,
    amount: number,
    type: 'topup' | 'subscription_grant' | 'adjustment' | 'refund' | 'bonus',
    description?: string,
    referenceId?: string
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const now = new Date();
    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: type,
      amount: amount,
      service: 'billing',
      action: type,
      timestamp: now,
      balanceAfter: 0, // Will be calculated after update
      metadata: { description, referenceId },
    };

    // Build atomic update based on credit type
    const incFields: Record<string, number> = {};
    const setFields: Record<string, any> = {};

    if (type === 'subscription_grant') {
      incFields['creditsBalance.subscriptionCredits'] = amount;
      setFields['creditsBalance.lastSubscriptionGrant'] = now;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      setFields['creditsBalance.subscriptionCreditsExpiry'] = expiryDate;
    } else {
      incFields['creditsBalance.topupCredits'] = amount;
    }

    // Ensure creditsBalance exists first (upsert-safe)
    await User.findOneAndUpdate(
      { clerkUserId, creditsBalance: { $exists: false } },
      { $set: { creditsBalance: emptyCreditsBalance() } },
    );

    // Atomic increment + push transaction
    const updated = await User.findOneAndUpdate(
      { clerkUserId },
      {
        $inc: incFields,
        ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
        $push: {
          'creditsBalance.creditHistory': {
            $each: [transaction],
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    // Update balanceAfter in the transaction we just pushed (best-effort, not critical)
    const newTotal = (updated.creditsBalance?.subscriptionCredits || 0) + (updated.creditsBalance?.topupCredits || 0);
    console.log(`[CreditsService] Added ${amount} credits to user ${clerkUserId} via ${type}. New total: ${newTotal}`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Refund credits (e.g., when a task fails)
   * Uses atomic MongoDB $inc to prevent race conditions
   */
  static async refundCredits(
    clerkUserId: string,
    amount: number,
    reason: string,
    options?: {
      service?: string;
      action?: string;
      originalTransactionId?: string;
    }
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    let pool: CreditPool = options?.service && options?.action
      ? getCreditPool(options.service, options.action)
      : 'main';
    let fromSubscription = amount;
    let fromTopup = 0;

    if (options?.originalTransactionId) {
      const chargedUser = await User.findOne({
        clerkUserId,
        'creditsBalance.creditHistory': {
          $elemMatch: { type: 'usage', id: options.originalTransactionId },
        },
      }).select('creditsBalance.creditHistory');
      const originalCharge = chargedUser?.creditsBalance?.creditHistory?.find(
        (entry: ICreditTransaction) => entry.type === 'usage' && entry.id === options.originalTransactionId,
      );
      if (!originalCharge) {
        return {
          success: false,
          error: `Original credit transaction not found: ${options.originalTransactionId}`,
        };
      }

      const metadata = originalCharge.metadata || {};
      if (metadata.pool === 'main' || metadata.pool === 'media') {
        pool = metadata.pool;
      }
      fromSubscription = Number(metadata.fromSubscription ?? amount);
      fromTopup = Number(metadata.fromTopup ?? 0);
      if (
        fromSubscription < 0
        || fromTopup < 0
        || Math.abs((fromSubscription + fromTopup) - amount) > 1e-9
      ) {
        return {
          success: false,
          error: `Original credit transaction has an invalid refund split: ${options.originalTransactionId}`,
        };
      }
    }

    const subscriptionPath = `creditsBalance.${POOL_FIELDS[pool].subscription}`;
    const topupPath = `creditsBalance.${POOL_FIELDS[pool].topup}`;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'refund',
      amount: amount,
      service: options?.service,
      action: options?.action,
      timestamp: new Date(),
      balanceAfter: 0,
      metadata: {
        pool,
        reason,
        originalTransactionId: options?.originalTransactionId,
        fromSubscription,
        fromTopup,
      },
    };

    const refundFilter = options?.originalTransactionId
      ? {
          clerkUserId,
          creditsBalance: { $exists: true },
          'creditsBalance.creditHistory': {
            $not: {
              $elemMatch: {
                type: 'refund',
                'metadata.originalTransactionId': options.originalTransactionId,
              },
            },
          },
        }
      : { clerkUserId, creditsBalance: { $exists: true } };

    const updated = await User.findOneAndUpdate(
      refundFilter,
      {
        $inc: {
          [subscriptionPath]: fromSubscription,
          [topupPath]: fromTopup,
        },
        $push: {
          'creditsBalance.creditHistory': {
            $each: [transaction],
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      if (options?.originalTransactionId) {
        const existing = await User.findOne({
          clerkUserId,
          'creditsBalance.creditHistory': {
            $elemMatch: {
              type: 'refund',
              'metadata.originalTransactionId': options.originalTransactionId,
            },
          },
        }).select('creditsBalance');
        if (existing) {
          return { success: true, duplicate: true, balance: existing.creditsBalance };
        }
      }
      return { success: false, error: `User not found or no credits balance: ${clerkUserId}` };
    }

    console.log(`[CreditsService] Refunded ${amount} ${pool} credits to user ${clerkUserId}: ${reason}`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Refund credits to an ORG wallet (plan §3/D5, P2) — the org analogue of refundCredits. Returns
   * the charge to the SAME pool split it left (read from the original org deduct's recorded
   * fromSubscription/fromTopup), atomically on the single Organization doc, idempotent on the
   * original transaction so a double auto-refund credits the wallet only ONCE. Writes a separate
   * best-effort org_credit_transactions 'refund' row (D4). Never seeds a wallet.
   *
   * @param actorUserId WHO the refund is attributed to (the per-member report key, never a
   *                    billing signal — D9)
   */
  static async refundOrgCredits(
    clerkOrgId: string,
    actorUserId: string,
    amount: number,
    reason: string,
    options?: {
      service?: string;
      action?: string;
      originalTransactionId?: string;
      projectId?: string;
    }
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    let pool: CreditPool = options?.service && options?.action
      ? getCreditPool(options.service, options.action)
      : 'main';
    let fromSubscription = amount;
    let fromTopup = 0;

    if (options?.originalTransactionId) {
      const chargedOrg = await Organization.findOne({
        clerkOrgId,
        'creditsBalance.creditHistory': {
          $elemMatch: { type: 'usage', id: options.originalTransactionId },
        },
      }).select('creditsBalance.creditHistory').lean<IOrganization>();
      const originalCharge = chargedOrg?.creditsBalance?.creditHistory?.find(
        (entry: ICreditTransaction) => entry.type === 'usage' && entry.id === options.originalTransactionId,
      );
      if (!originalCharge) {
        return {
          success: false,
          error: `Original org credit transaction not found: ${options.originalTransactionId}`,
        };
      }

      const metadata = originalCharge.metadata || {};
      if (metadata.pool === 'main' || metadata.pool === 'media') {
        pool = metadata.pool;
      }
      fromSubscription = Number(metadata.fromSubscription ?? amount);
      fromTopup = Number(metadata.fromTopup ?? 0);
      if (
        fromSubscription < 0
        || fromTopup < 0
        || Math.abs((fromSubscription + fromTopup) - amount) > 1e-9
      ) {
        return {
          success: false,
          error: `Original org credit transaction has an invalid refund split: ${options.originalTransactionId}`,
        };
      }
    }

    const subscriptionPath = `creditsBalance.${POOL_FIELDS[pool].subscription}`;
    const topupPath = `creditsBalance.${POOL_FIELDS[pool].topup}`;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'refund',
      amount: amount,
      service: options?.service,
      action: options?.action,
      timestamp: new Date(),
      balanceAfter: 0,
      metadata: {
        pool,
        reason,
        originalTransactionId: options?.originalTransactionId,
        fromSubscription,
        fromTopup,
        actorUserId,
      },
    };

    const { filter, update } = buildOrgPoolRefund({
      clerkOrgId,
      subPath: subscriptionPath,
      topupPath,
      fromSubscription,
      fromTopup,
      transaction,
      originalTransactionId: options?.originalTransactionId,
      historyCap: MAX_CREDIT_HISTORY,
    });

    const updated = await Organization.findOneAndUpdate(
      filter as unknown as FilterQuery<IOrganization>,
      update as unknown as UpdateQuery<IOrganization>,
      { new: true },
    );

    if (!updated) {
      // Either the org/wallet doesn't exist, or (with originalTransactionId) this charge was
      // already refunded — return the existing refund idempotently rather than double-crediting.
      if (options?.originalTransactionId) {
        const existing = await Organization.findOne({
          clerkOrgId,
          'creditsBalance.creditHistory': {
            $elemMatch: {
              type: 'refund',
              'metadata.originalTransactionId': options.originalTransactionId,
            },
          },
        }).select('creditsBalance').lean<IOrganization>();
        if (existing) {
          return { success: true, duplicate: true, balance: existing.creditsBalance };
        }
      }
      return { success: false, error: `Organization not found or no credits balance: ${clerkOrgId}` };
    }

    // Accurate post-write pool total (serialized order) for the durable ledger's audit field.
    const updatedBalance = updated.creditsBalance as unknown as Record<string, number>;
    const balanceAfter = (updatedBalance[POOL_FIELDS[pool].subscription] ?? 0) + (updatedBalance[POOL_FIELDS[pool].topup] ?? 0);

    // Durable per-member ledger row (D4). Best-effort by design: the balance + embedded refund txn
    // are already correct, so a ledger failure fails LOUD (R18N) and stays reconcilable — it never
    // rolls back a completed refund.
    try {
      await OrgCreditTransaction.create({
        clerkOrgId,
        actorUserId,
        projectId: options?.projectId,
        pool,
        type: 'refund',
        amount: amount,
        balanceAfter,
        operationId: options?.originalTransactionId,
        metadata: {
          reason,
          originalTransactionId: options?.originalTransactionId,
          fromSubscription,
          fromTopup,
          service: options?.service,
          action: options?.action,
        },
      });
    } catch (ledgerError) {
      console.error(
        `[CreditsService] ORG REFUND LEDGER WRITE FAILED (balance already refunded; reconcile from creditHistory) org=${clerkOrgId} actor=${actorUserId} original=${options?.originalTransactionId ?? 'none'}:`,
        ledgerError,
      );
    }

    console.log(`[CreditsService] Refunded ${amount} ${pool} org credits to org ${clerkOrgId} (actor ${actorUserId}): ${reason}`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Route a refund to the correct wallet (plan §3, P2) — the mirror of deductForWallet. A charge
   * billed to an org MUST refund to that SAME org, or the org wallet leaks credits into the
   * actor's personal wallet. Route failure paths (and creditsMiddleware.refund()) call this with
   * the exact WalletRef the deduct used.
   */
  static async refundForWallet(
    wallet: WalletRef,
    amount: number,
    reason: string,
    options?: {
      service?: string;
      action?: string;
      originalTransactionId?: string;
      projectId?: string;
    }
  ): Promise<CreditsPurchaseResult> {
    if (wallet.type === 'org') {
      return this.refundOrgCredits(wallet.clerkOrgId, wallet.actorUserId, amount, reason, options);
    }
    return this.refundCredits(wallet.clerkUserId, amount, reason, options);
  }

  /**
   * Add top-up credits (purchased credits that never expire)
   * Uses atomic MongoDB $inc to prevent race conditions
   */
  static async addTopupCredits(
    clerkUserId: string,
    amount: number,
    options?: {
      paymentId?: string;
      packageId?: string;
      /** Which pool the purchased credits land in. Defaults to 'main'. */
      pool?: CreditPool;
    }
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const paymentId = options?.paymentId;
    const pool: CreditPool = options?.pool ?? 'main';
    const topupPath = `creditsBalance.${POOL_FIELDS[pool].topup}`;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'topup',
      amount: amount,
      timestamp: new Date(),
      balanceAfter: 0, // Calculated after update
      metadata: {
        pool,
        paymentId,
        packageId: options?.packageId,
      },
    };

    // Ensure creditsBalance exists first
    await User.findOneAndUpdate(
      { clerkUserId, creditsBalance: { $exists: false } },
      { $set: { creditsBalance: emptyCreditsBalance() } },
    );

    // Idempotency: the same Razorpay payment can arrive via BOTH the client verify
    // route and the payment.captured webhook (and webhooks can be redelivered).
    // The filter only matches when NO existing top-up transaction already carries this
    // paymentId, so concurrent/duplicate calls increment credits exactly once (atomic —
    // no read-then-write race).
    const dedupeFilter = paymentId
      ? {
          clerkUserId,
          'creditsBalance.creditHistory': {
            $not: { $elemMatch: { type: 'topup', 'metadata.paymentId': paymentId } },
          },
        }
      : { clerkUserId };

    const updated = await User.findOneAndUpdate(
      dedupeFilter,
      {
        $inc: { [topupPath]: amount },
        $push: {
          'creditsBalance.creditHistory': {
            $each: [transaction],
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      // Distinguish "already granted" (idempotent no-op) from "user not found".
      if (paymentId) {
        const existing = await User.findOne({
          clerkUserId,
          'creditsBalance.creditHistory': {
            $elemMatch: { type: 'topup', 'metadata.paymentId': paymentId },
          },
        }).select('creditsBalance');
        if (existing) {
          console.log(`[CreditsService] Duplicate top-up for payment ${paymentId} ignored (already granted).`);
          return { success: true, duplicate: true, balance: existing.creditsBalance };
        }
      }
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    console.log(`[CreditsService] Added ${amount} ${pool} top-up credits to user ${clerkUserId}.`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Grant subscription credits (called on subscription activation/renewal)
   * Expires any remaining previous subscription credits and grants new allocation
   * Uses atomic MongoDB operations to prevent race conditions
   */
  static async grantSubscriptionCredits(
    clerkUserId: string,
    planType: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly',
    options?: {
      /**
       * Stable key for the Razorpay billing event (e.g.
       * `razorpay:subscription_charged:<subId>:<invoiceId>`). When provided, the same
       * event can be replayed/redelivered without resetting or re-granting credits.
       */
      idempotencyKey?: string;
    }
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const idempotencyKey = options?.idempotencyKey;
    const allocation = getPlanCreditAllocation(planType); // main pool
    const mediaAllocation = getPlanMediaCreditAllocation(planType); // media pool (on top)
    const now = new Date();

    // Calculate expiry (end of billing cycle). Both pools expire together.
    const expiry = new Date(now);
    if (billingCycle === 'yearly') {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setMonth(expiry.getMonth() + 1);
    }

    // Ensure creditsBalance exists
    await User.findOneAndUpdate(
      { clerkUserId, creditsBalance: { $exists: false } },
      { $set: { creditsBalance: emptyCreditsBalance() } },
    );

    // Read current subscription credits (both pools) to log expiry of the old grant
    const user = await User.findOne({ clerkUserId }).select(
      'creditsBalance.subscriptionCredits creditsBalance.mediaCredits'
    );
    const expiredCredits = user?.creditsBalance?.subscriptionCredits || 0;
    const expiredMedia = user?.creditsBalance?.mediaCredits || 0;

    const transactions: ICreditTransaction[] = [];

    // Log expiry of old MAIN subscription credits if any
    if (expiredCredits > 0) {
      transactions.push({
        id: `txn_${nanoid(12)}`,
        type: 'expiry',
        amount: -expiredCredits,
        timestamp: now,
        balanceAfter: 0,
        metadata: { pool: 'main', reason: 'subscription_renewal' },
      });
    }

    // Log expiry of old MEDIA subscription credits if any
    if (expiredMedia > 0) {
      transactions.push({
        id: `txn_${nanoid(12)}`,
        type: 'expiry',
        amount: -expiredMedia,
        timestamp: now,
        balanceAfter: 0,
        metadata: { pool: 'media', reason: 'subscription_renewal' },
      });
    }

    // MAIN grant transaction (carries the idempotency key that guards replay)
    transactions.push({
      id: `txn_${nanoid(12)}`,
      type: 'subscription_grant',
      amount: allocation,
      timestamp: now,
      balanceAfter: 0,
      metadata: {
        pool: 'main',
        planType,
        billingCycle,
        expiry: expiry.toISOString(),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    });

    // MEDIA grant transaction (only when the plan allocates a media pool)
    if (mediaAllocation > 0) {
      transactions.push({
        id: `txn_${nanoid(12)}`,
        type: 'subscription_grant',
        amount: mediaAllocation,
        timestamp: now,
        balanceAfter: 0,
        metadata: {
          pool: 'media',
          planType,
          billingCycle,
          expiry: expiry.toISOString(),
        },
      });
    }

    // Idempotency: Razorpay redelivers subscription.activated / subscription.charged.
    // The filter only matches when NO existing grant carries this event key, so a
    // replayed billing event cannot reset+re-grant credits (atomic, no read-then-write race).
    const dedupeFilter = idempotencyKey
      ? {
          clerkUserId,
          'creditsBalance.creditHistory': {
            $not: { $elemMatch: { type: 'subscription_grant', 'metadata.idempotencyKey': idempotencyKey } },
          },
        }
      : { clerkUserId };

    // Atomic: SET subscription credits for BOTH pools (reset+grant, not increment).
    // Top-up balances (main + media) are untouched (never expire, no clobbering).
    const updated = await User.findOneAndUpdate(
      dedupeFilter,
      {
        $set: {
          'creditsBalance.subscriptionCredits': allocation,
          'creditsBalance.lastSubscriptionGrant': now,
          'creditsBalance.subscriptionCreditsExpiry': expiry,
          'creditsBalance.mediaCredits': mediaAllocation,
          'creditsBalance.lastMediaGrant': now,
          'creditsBalance.mediaCreditsExpiry': expiry,
        },
        $push: {
          'creditsBalance.creditHistory': {
            $each: transactions,
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      // Distinguish an already-processed billing event (idempotent no-op) from user-not-found.
      if (idempotencyKey) {
        const existing = await User.findOne({
          clerkUserId,
          'creditsBalance.creditHistory': {
            $elemMatch: { type: 'subscription_grant', 'metadata.idempotencyKey': idempotencyKey },
          },
        }).select('creditsBalance');
        if (existing) {
          console.log(`[CreditsService] Duplicate subscription grant for event ${idempotencyKey} ignored (already granted).`);
          return { success: true, duplicate: true, balance: existing.creditsBalance };
        }
      }
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    console.log(`[CreditsService] Granted ${allocation} main + ${mediaAllocation} media subscription credits to user ${clerkUserId} (${planType})`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Expire subscription credits (called by cron job at end of billing cycle)
   * Uses atomic MongoDB operations to prevent race conditions
   */
  static async expireSubscriptionCredits(clerkUserId: string): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    // Read current balance to know how much to expire
    const user = await User.findOne({ clerkUserId }).select('creditsBalance');
    if (!user || !user.creditsBalance) {
      return { success: false, error: `User not found or no credits balance: ${clerkUserId}` };
    }

    const expiredAmount = user.creditsBalance.subscriptionCredits || 0;
    const expiredMedia = user.creditsBalance.mediaCredits || 0;
    if (expiredAmount <= 0 && expiredMedia <= 0) {
      return { success: true, balance: user.creditsBalance };
    }

    const now = new Date();
    const transactions: ICreditTransaction[] = [];
    if (expiredAmount > 0) {
      transactions.push({
        id: `txn_${nanoid(12)}`,
        type: 'expiry',
        amount: -expiredAmount,
        timestamp: now,
        balanceAfter: 0,
        metadata: { pool: 'main', reason: 'billing_cycle_end' },
      });
    }
    if (expiredMedia > 0) {
      transactions.push({
        id: `txn_${nanoid(12)}`,
        type: 'expiry',
        amount: -expiredMedia,
        timestamp: now,
        balanceAfter: 0,
        metadata: { pool: 'media', reason: 'billing_cycle_end' },
      });
    }

    // Atomic: set BOTH pools' subscription balances to 0, clear expiries, push transactions.
    // Top-up balances (never expire) are untouched.
    const updated = await User.findOneAndUpdate(
      { clerkUserId },
      {
        $set: {
          'creditsBalance.subscriptionCredits': 0,
          'creditsBalance.subscriptionCreditsExpiry': null,
          'creditsBalance.mediaCredits': 0,
          'creditsBalance.mediaCreditsExpiry': null,
        },
        $push: {
          'creditsBalance.creditHistory': {
            $each: transactions,
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    console.log(`[CreditsService] Expired ${expiredAmount} main + ${expiredMedia} media subscription credits for user ${clerkUserId}`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }

  /**
   * Process adjustment (admin adjustment of credits)
   * Uses atomic MongoDB $inc to prevent race conditions
   */
  static async adjustCredits(
    clerkUserId: string,
    amount: number,
    reason: string,
    creditType: 'subscription' | 'topup' = 'topup'
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'adjustment',
      amount: amount,
      timestamp: new Date(),
      balanceAfter: 0,
      metadata: { reason, creditType },
    };

    // Ensure creditsBalance exists
    await User.findOneAndUpdate(
      { clerkUserId, creditsBalance: { $exists: false } },
      { $set: { creditsBalance: emptyCreditsBalance() } },
    );

    const field = creditType === 'subscription'
      ? 'creditsBalance.subscriptionCredits'
      : 'creditsBalance.topupCredits';

    // Atomic increment
    const updated = await User.findOneAndUpdate(
      { clerkUserId },
      {
        $inc: { [field]: amount },
        $push: {
          'creditsBalance.creditHistory': {
            $each: [transaction],
            $slice: -MAX_CREDIT_HISTORY,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    // Guard against negative credits (adjustment could be negative)
    const currentVal = creditType === 'subscription'
      ? updated.creditsBalance?.subscriptionCredits
      : updated.creditsBalance?.topupCredits;
    if (currentVal != null && currentVal < 0) {
      await User.findOneAndUpdate(
        { clerkUserId },
        { $set: { [field]: 0 } },
      );
    }

    console.log(`[CreditsService] Adjusted ${amount} ${creditType} credits for user ${clerkUserId}: ${reason}`);

    return {
      success: true,
      balance: updated.creditsBalance,
    };
  }
}
