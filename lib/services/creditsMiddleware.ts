/**
 * Credits Middleware
 * 
 * Provides wrapper functions for service routes to easily integrate credits.
 * Handles credit checking, deduction, and refund on failure.
 */

import { NextResponse } from "next/server";
import { CreditsService } from "./creditsService";
import { CreditCostConfigurationError, getCreditCost } from "@/lib/config/creditCosts";
import type { WalletRef } from "@/lib/editron/services/project-ownership";

export interface CreditCheckResult {
  allowed: boolean;
  errorResponse?: NextResponse;
  deduct: () => Promise<{ transactionId: string }>;
  refund: (reason: string) => Promise<void>;
}

/**
 * The credit owner explicitly rejected the deduction before writing a usage
 * transaction. Transport/database exceptions intentionally use a plain Error
 * so callers can treat their outcome as ambiguous instead of refunding.
 */
export class CreditDeductionRejectedError extends Error {
  readonly code = 'CREDIT_DEDUCTION_REJECTED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CreditDeductionRejectedError';
  }
}

/**
 * Check and prepare credit deduction for a service action
 * Call deduct() on success, refund() on failure
 */
export async function checkCredits(
  clerkUserId: string,
  service: string,
  action: string,
  options?: {
    model?: string;
    requestType?: string;
    tokenCount?: number;
    durationMinutes?: number;
    durationSeconds?: number;
    taskId?: string;
    /** Stable admission-derived key used to make a repeated deduction a no-op. */
    idempotencyKey?: string;
    /** Batch/fan-out multiplier (e.g. N carousel slides => N image variations). Defaults to 1. */
    quantity?: number;
  },
  /**
   * Optional billing target (plan §3, P2). Omit => the user's personal wallet — today's behavior
   * EXACTLY. An org-owned editron project passes resolveBillingOwner(...) here so the pre-flight
   * check, deduct, AND refund all route to the org wallet together (a charge billed to an org must
   * refund to that org, never the actor's personal wallet).
   */
  wallet?: WalletRef
): Promise<CreditCheckResult> {
  const effectiveWallet: WalletRef = wallet ?? { type: 'user', clerkUserId };

  let cost: number;
  try {
    cost = getCreditCost(service, action, options);
  } catch (error) {
    if (error instanceof CreditCostConfigurationError) {
      return {
        allowed: false,
        errorResponse: NextResponse.json(
          {
            error: error.message,
            service: error.service,
            action: error.action,
            code: "CREDIT_COST_NOT_CONFIGURED",
          },
          { status: 500 }
        ),
        deduct: async () => { throw error; },
        refund: async () => {},
      };
    }
    throw error;
  }

  // If cost is 0, allow without deduction
  if (cost === 0) {
    return {
      allowed: true,
      deduct: async () => ({ transactionId: 'no_charge' }),
      refund: async () => {},
    };
  }

  const check = await CreditsService.hasCreditsForWallet(effectiveWallet, service, action, options);

  if (!check.hasCredits) {
    return {
      allowed: false,
      errorResponse: NextResponse.json(
        {
          error: "Insufficient credits",
          required: check.required,
          available: check.available,
          // Which wallet is short (plan D2): 'org' => the shared org wallet is empty, not the
          // member's personal one, so the UI can say "the team is out of credits".
          walletOwner: effectiveWallet.type,
          code: "INSUFFICIENT_CREDITS",
        },
        { status: 402 } // Payment Required
      ),
      deduct: async () => { throw new Error("Cannot deduct - insufficient credits"); },
      refund: async () => {},
    };
  }

  let transactionId: string | null = null;

  return {
    allowed: true,
    deduct: async () => {
      const result = await CreditsService.deductForWallet(
        effectiveWallet,
        service,
        action,
        options
      );
      if (!result.success) {
        throw new CreditDeductionRejectedError(result.error || "Failed to deduct credits");
      }
      transactionId = typeof result.transactionId === 'string'
        && result.transactionId.trim().length > 0
        ? result.transactionId.trim()
        : null;
      if (!transactionId) {
        throw new Error('Credit owner returned no durable transaction ID');
      }
      return { transactionId };
    },
    refund: async (reason: string) => {
      if (transactionId && transactionId !== 'no_charge') {
        const result = await CreditsService.refundForWallet(
          effectiveWallet,
          cost,
          reason,
          { service, action, originalTransactionId: transactionId }
        );
        if (!result.success) {
          throw new Error(result.error || `Failed to refund credit transaction ${transactionId}`);
        }
      } else {
        // LOUDFAIL: temporary loud logging for testing — remove (docs/SOFT_FAILURE_AUDIT_2026-06-26.md)
        console.error('[LOUDFAIL][checkCredits][REFUND-SKIPPED][MONEY] refund() called but no transactionId — refund did NOT run (caller believes it refunded):', { clerkUserId, service, action, cost, reason, transactionId });
      }
    },
  };
}

/**
 * Wrapper to execute a service action with automatic credit handling
 * Deducts credits before execution, refunds on error
 */
export async function withCredits<T>(
  clerkUserId: string,
  service: string,
  action: string,
  options: {
    model?: string;
    requestType?: string;
    tokenCount?: number;
    durationMinutes?: number;
    durationSeconds?: number;
    taskId?: string;
  },
  executor: () => Promise<T>
): Promise<{ success: true; result: T; transactionId: string } | { success: false; error: string; response?: NextResponse }> {
  const creditCheck = await checkCredits(clerkUserId, service, action, options);

  if (!creditCheck.allowed) {
    return {
      success: false,
      error: "Insufficient credits",
      response: creditCheck.errorResponse,
    };
  }

  let transactionId: string;
  try {
    // Deduct credits first
    const deductResult = await creditCheck.deduct();
    transactionId = deductResult.transactionId;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to deduct credits",
    };
  }

  try {
    // Execute the service action
    const result = await executor();
    return { success: true, result, transactionId };
  } catch (error) {
    // Refund credits on failure
    const reason = error instanceof Error ? error.message : "Unknown error";
    await creditCheck.refund(`Task failed: ${reason}`);
    return {
      success: false,
      error: reason,
    };
  }
}

/**
 * Token-based credit deduction for streaming/token operations (like Editron)
 * Call start() before operation, then update() with token counts during/after
 */
export class TokenCreditTracker {
  private clerkUserId: string;
  private service: string;
  private action: string;
  private taskId?: string;
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private finalized: boolean = false;

  constructor(clerkUserId: string, service: string, action: string = 'ai_operation', taskId?: string) {
    this.clerkUserId = clerkUserId;
    this.service = service;
    this.action = action;
    this.taskId = taskId;
  }

  /**
   * Add token counts from an operation
   */
  addTokens(input: number, output: number): void {
    if (this.finalized) {
      console.warn('[TokenCreditTracker] Cannot add tokens after finalization');
      return;
    }
    this.inputTokens += input;
    this.outputTokens += output;
  }

  /**
   * Get current token counts
   */
  getTokens(): { input: number; output: number; total: number } {
    return {
      input: this.inputTokens,
      output: this.outputTokens,
      total: this.inputTokens + this.outputTokens,
    };
  }

  /**
   * Finalize and deduct credits based on total tokens
   */
  async finalize(): Promise<{ success: boolean; creditsDeducted: number; error?: string }> {
    if (this.finalized) {
      console.warn('[TokenCreditTracker] Already finalized');
      return { success: true, creditsDeducted: 0 };
    }

    this.finalized = true;
    const totalTokens = this.inputTokens + this.outputTokens;

    if (totalTokens === 0) {
      return { success: true, creditsDeducted: 0 };
    }

    const result = await CreditsService.deductCredits(
      this.clerkUserId,
      this.service,
      this.action,
      {
        tokenCount: totalTokens,
        taskId: this.taskId,
      }
    );

    return {
      success: result.success,
      creditsDeducted: result.creditsDeducted,
      error: result.error,
    };
  }
}
