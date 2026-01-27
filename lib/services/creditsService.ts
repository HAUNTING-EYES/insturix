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
import { getCreditCost, getPlanCreditAllocation } from "@/lib/config/creditCosts";
import { nanoid } from "nanoid";

// Maximum transactions to keep in history (to prevent unbounded growth)
const MAX_CREDIT_HISTORY = 100;

export interface CreditsPurchaseResult {
  success: boolean;
  balance?: ICreditsBalance;
  error?: string;
}

export interface CreditsDeductResult {
  success: boolean;
  creditsDeducted: number;
  balance?: ICreditsBalance;
  transactionId?: string;
  error?: string;
}

export interface CreditsBalanceInfo {
  subscriptionCredits: number;
  topupCredits: number;
  totalCredits: number;
  lastSubscriptionGrant: Date | null;
  subscriptionCreditsExpiry: Date | null;
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
      throw new Error(`User not found: ${clerkUserId}`);
    }

    // Initialize credits balance if not present (for existing users)
    if (!user.creditsBalance) {
      user.creditsBalance = {
        subscriptionCredits: 0,
        topupCredits: 0,
        lastSubscriptionGrant: null,
        subscriptionCreditsExpiry: null,
        creditHistory: [],
      };
      await user.save();
    }

    const balance = user.creditsBalance;
    return {
      subscriptionCredits: balance.subscriptionCredits,
      topupCredits: balance.topupCredits,
      totalCredits: balance.subscriptionCredits + balance.topupCredits,
      lastSubscriptionGrant: balance.lastSubscriptionGrant,
      subscriptionCreditsExpiry: balance.subscriptionCreditsExpiry,
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
      durationMinutes?: number;
    }
  ): Promise<{ hasCredits: boolean; required: number; available: number }> {
    const balance = await this.getBalance(clerkUserId);
    const required = getCreditCost(service, action, options);

    return {
      hasCredits: balance.totalCredits >= required,
      required,
      available: balance.totalCredits,
    };
  }

  /**
   * Deduct credits for a service usage
   * Consumes subscription credits first, then top-up credits
   */
  static async deductCredits(
    clerkUserId: string,
    service: string,
    action: string,
    options?: {
      model?: string;
      requestType?: string;
      tokenCount?: number;
      durationMinutes?: number;
      taskId?: string;
    }
  ): Promise<CreditsDeductResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, creditsDeducted: 0, error: `User not found: ${clerkUserId}` };
    }

    // Initialize credits balance if needed
    if (!user.creditsBalance) {
      user.creditsBalance = {
        subscriptionCredits: 0,
        topupCredits: 0,
        lastSubscriptionGrant: null,
        subscriptionCreditsExpiry: null,
        creditHistory: [],
      };
    }

    const cost = getCreditCost(service, action, options);
    const balance = user.creditsBalance;
    const totalAvailable = balance.subscriptionCredits + balance.topupCredits;

    if (totalAvailable < cost) {
      return {
        success: false,
        creditsDeducted: 0,
        error: `Insufficient credits. Required: ${cost}, Available: ${totalAvailable}`,
      };
    }

    // Deduct from subscription credits first (they expire)
    let remaining = cost;
    const fromSubscription = Math.min(balance.subscriptionCredits, remaining);
    balance.subscriptionCredits -= fromSubscription;
    remaining -= fromSubscription;

    // Then from top-up credits
    if (remaining > 0) {
      balance.topupCredits -= remaining;
    }

    const newTotal = balance.subscriptionCredits + balance.topupCredits;

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
        fromSubscription,
        fromTopup: cost - fromSubscription,
        ...options,
      },
    };

    // Add transaction to history (cap at MAX_CREDIT_HISTORY)
    balance.creditHistory.push(transaction);
    if (balance.creditHistory.length > MAX_CREDIT_HISTORY) {
      balance.creditHistory = balance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Deducted ${cost} credits from user ${clerkUserId} for ${service}.${action}`);

    return {
      success: true,
      creditsDeducted: cost,
      balance: user.creditsBalance,
      transactionId: transaction.id,
    };
  }

  /**
   * Add credits to user balance (Top-up or Subscription Grant)
   */
  static async addCredits(
    clerkUserId: string,
    amount: number,
    type: 'topup' | 'subscription_grant' | 'adjustment' | 'refund' | 'bonus',
    description?: string,
    referenceId?: string
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
        return { success: false, error: `User not found: ${clerkUserId}` };
    }

    if (!user.creditsBalance) {
        user.creditsBalance = {
            subscriptionCredits: 0,
            topupCredits: 0,
            lastSubscriptionGrant: null,
            subscriptionCreditsExpiry: null,
            creditHistory: [],
        };
    }

    const balance = user.creditsBalance;
    
    // Determine where to add credits
    if (type === 'subscription_grant') {
        balance.subscriptionCredits = (balance.subscriptionCredits || 0) + amount;
        balance.lastSubscriptionGrant = new Date();
        // Set expiry to 30 days from now for subscription credits
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        balance.subscriptionCreditsExpiry = expiryDate;
    } else {
        // Top-ups, bonuses, etc. go to topup bucket which doesn't expire
        balance.topupCredits = (balance.topupCredits || 0) + amount;
    }

    // Create transaction
    const transaction: ICreditTransaction = {
        id: `txn_${nanoid(12)}`,
        type: type,
        amount: amount,
        service: 'billing',
        action: type,
        timestamp: new Date(),
        balanceAfter: balance.subscriptionCredits + balance.topupCredits,
        metadata: {
            description,
            referenceId,
        }
    };

    balance.creditHistory.push(transaction);
    if (balance.creditHistory.length > MAX_CREDIT_HISTORY) {
        balance.creditHistory = balance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Added ${amount} credits to user ${clerkUserId} via ${type}`);

    return {
        success: true,
        balance: user.creditsBalance
    };
  }

  /**
   * Refund credits (e.g., when a task fails)
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

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    if (!user.creditsBalance) {
      return { success: false, error: 'User has no credits balance' };
    }

    // Refund to subscription credits (since that's what was likely consumed first)
    user.creditsBalance.subscriptionCredits += amount;

    const newTotal = user.creditsBalance.subscriptionCredits + user.creditsBalance.topupCredits;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'refund',
      amount: amount,
      service: options?.service,
      action: options?.action,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: {
        reason,
        originalTransactionId: options?.originalTransactionId,
      },
    };

    user.creditsBalance.creditHistory.push(transaction);
    if (user.creditsBalance.creditHistory.length > MAX_CREDIT_HISTORY) {
      user.creditsBalance.creditHistory = user.creditsBalance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Refunded ${amount} credits to user ${clerkUserId}: ${reason}`);

    return {
      success: true,
      balance: user.creditsBalance,
    };
  }

  /**
   * Add top-up credits (purchased credits that never expire)
   */
  static async addTopupCredits(
    clerkUserId: string,
    amount: number,
    options?: {
      paymentId?: string;
      packageId?: string;
    }
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    if (!user.creditsBalance) {
      user.creditsBalance = {
        subscriptionCredits: 0,
        topupCredits: 0,
        lastSubscriptionGrant: null,
        subscriptionCreditsExpiry: null,
        creditHistory: [],
      };
    }

    user.creditsBalance.topupCredits += amount;
    const newTotal = user.creditsBalance.subscriptionCredits + user.creditsBalance.topupCredits;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'topup',
      amount: amount,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: {
        paymentId: options?.paymentId,
        packageId: options?.packageId,
      },
    };

    user.creditsBalance.creditHistory.push(transaction);
    if (user.creditsBalance.creditHistory.length > MAX_CREDIT_HISTORY) {
      user.creditsBalance.creditHistory = user.creditsBalance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Added ${amount} top-up credits to user ${clerkUserId}`);

    return {
      success: true,
      balance: user.creditsBalance,
    };
  }

  /**
   * Grant subscription credits (called on subscription activation/renewal)
   * Expires any remaining previous subscription credits and grants new allocation
   */
  static async grantSubscriptionCredits(
    clerkUserId: string,
    planType: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly'
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    if (!user.creditsBalance) {
      user.creditsBalance = {
        subscriptionCredits: 0,
        topupCredits: 0,
        lastSubscriptionGrant: null,
        subscriptionCreditsExpiry: null,
        creditHistory: [],
      };
    }

    const allocation = getPlanCreditAllocation(planType);
    const now = new Date();

    // Calculate expiry (end of billing cycle)
    const expiry = new Date(now);
    if (billingCycle === 'yearly') {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
      expiry.setMonth(expiry.getMonth() + 1);
    }

    // If there were remaining subscription credits, log their expiry
    const expiredCredits = user.creditsBalance.subscriptionCredits;
    if (expiredCredits > 0) {
      const expiryTransaction: ICreditTransaction = {
        id: `txn_${nanoid(12)}`,
        type: 'expiry',
        amount: -expiredCredits,
        timestamp: now,
        balanceAfter: user.creditsBalance.topupCredits, // Only topup remains before grant
        metadata: { reason: 'subscription_renewal' },
      };
      user.creditsBalance.creditHistory.push(expiryTransaction);
    }

    // Grant new credits
    user.creditsBalance.subscriptionCredits = allocation;
    user.creditsBalance.lastSubscriptionGrant = now;
    user.creditsBalance.subscriptionCreditsExpiry = expiry;

    const newTotal = user.creditsBalance.subscriptionCredits + user.creditsBalance.topupCredits;

    const grantTransaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'subscription_grant',
      amount: allocation,
      timestamp: now,
      balanceAfter: newTotal,
      metadata: {
        planType,
        billingCycle,
        expiry: expiry.toISOString(),
      },
    };

    user.creditsBalance.creditHistory.push(grantTransaction);
    if (user.creditsBalance.creditHistory.length > MAX_CREDIT_HISTORY) {
      user.creditsBalance.creditHistory = user.creditsBalance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Granted ${allocation} subscription credits to user ${clerkUserId} (${planType})`);

    return {
      success: true,
      balance: user.creditsBalance,
    };
  }

  /**
   * Expire subscription credits (called by cron job at end of billing cycle)
   */
  static async expireSubscriptionCredits(clerkUserId: string): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user || !user.creditsBalance) {
      return { success: false, error: `User not found or no credits balance: ${clerkUserId}` };
    }

    const expiredAmount = user.creditsBalance.subscriptionCredits;
    if (expiredAmount <= 0) {
      return { success: true, balance: user.creditsBalance };
    }

    user.creditsBalance.subscriptionCredits = 0;
    user.creditsBalance.subscriptionCreditsExpiry = null;

    const newTotal = user.creditsBalance.topupCredits;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'expiry',
      amount: -expiredAmount,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: { reason: 'billing_cycle_end' },
    };

    user.creditsBalance.creditHistory.push(transaction);
    if (user.creditsBalance.creditHistory.length > MAX_CREDIT_HISTORY) {
      user.creditsBalance.creditHistory = user.creditsBalance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Expired ${expiredAmount} subscription credits for user ${clerkUserId}`);

    return {
      success: true,
      balance: user.creditsBalance,
    };
  }

  /**
   * Process adjustment (admin adjustment of credits)
   */
  static async adjustCredits(
    clerkUserId: string,
    amount: number,
    reason: string,
    creditType: 'subscription' | 'topup' = 'topup'
  ): Promise<CreditsPurchaseResult> {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: `User not found: ${clerkUserId}` };
    }

    if (!user.creditsBalance) {
      user.creditsBalance = {
        subscriptionCredits: 0,
        topupCredits: 0,
        lastSubscriptionGrant: null,
        subscriptionCreditsExpiry: null,
        creditHistory: [],
      };
    }

    if (creditType === 'subscription') {
      user.creditsBalance.subscriptionCredits = Math.max(0, user.creditsBalance.subscriptionCredits + amount);
    } else {
      user.creditsBalance.topupCredits = Math.max(0, user.creditsBalance.topupCredits + amount);
    }

    const newTotal = user.creditsBalance.subscriptionCredits + user.creditsBalance.topupCredits;

    const transaction: ICreditTransaction = {
      id: `txn_${nanoid(12)}`,
      type: 'adjustment',
      amount: amount,
      timestamp: new Date(),
      balanceAfter: newTotal,
      metadata: { reason, creditType },
    };

    user.creditsBalance.creditHistory.push(transaction);
    if (user.creditsBalance.creditHistory.length > MAX_CREDIT_HISTORY) {
      user.creditsBalance.creditHistory = user.creditsBalance.creditHistory.slice(-MAX_CREDIT_HISTORY);
    }

    user.markModified('creditsBalance');
    await user.save();

    console.log(`[CreditsService] Adjusted ${amount} ${creditType} credits for user ${clerkUserId}: ${reason}`);

    return {
      success: true,
      balance: user.creditsBalance,
    };
  }
}
