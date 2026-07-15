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
