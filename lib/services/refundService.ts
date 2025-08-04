import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import { createRefund, getRefundStatus as getPaymentRefundStatus } from "./paymentService";

type RazorpayRefundLike = {
  id?: string;
  amount?: number;
  status?: string;
  items?: unknown;
  error?: string;
} | Record<string, unknown>;

function asRefund(obj: unknown): RazorpayRefundLike {
  return (obj ?? {}) as RazorpayRefundLike;
}

interface RefundOptions {
  paymentId: string;
  amount?: number;
  reason?: string;
  notes?: Record<string, string>;
}

interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  status?: string;
  error?: string;
}


export async function initiateRefund(
  clerkUserId: string,
  options: RefundOptions
): Promise<RefundResult> {
  try {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    type PaymentRecord = {
      paymentId?: string;
      currency?: string;
      status?: string;
    };
    const payment = user.payments.find((p: PaymentRecord) => p.paymentId === options.paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    if (payment.status === "refunded") {
      return { success: false, error: "Payment already refunded" };
    }

    const refund = await createRefund({
      paymentId: options.paymentId,
      amount: options.amount,
      reason: options.reason,
      notes: options.notes,
      currency: payment.currency,
    });

    if (!refund.success) {
      const r = asRefund(refund);
      return { success: false, error: typeof r.error === "string" ? r.error : "Refund failed" };
    }

    payment.status = "refunded";
    user.markModified('payments');

    if (user.currentPlan.status === "active") {
      user.currentPlan.status = "canceled";
      user.currentPlan.endDate = new Date();
      user.markModified('currentPlan');
    }

    await user.save();

    console.log(`Refund processed for user ${clerkUserId}, payment ${options.paymentId}`);

    {
      const r = asRefund(refund);
      const refundId = typeof r.id === "string" ? r.id : undefined;
      const amountNum = typeof r.amount === "number" ? r.amount : 0;
      const status = typeof r.status === "string" ? r.status : undefined;

      return {
        success: true,
        refundId,
        amount: amountNum / 100,
        status,
      };
    }
  } catch (error) {
    console.error("Refund failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Refund processing failed",
    };
  }
}

export async function getRefundStatus(
  paymentId: string
): Promise<{
  success: boolean;
  refunds?: Array<Record<string, unknown>>;
  error?: string;
}> {
  try {
    const refunds = await getPaymentRefundStatus(paymentId);
    const r = asRefund(refunds);
    const items = Array.isArray((r as { items?: unknown }).items) ? (r.items as Array<Record<string, unknown>>) : [];

    return {
      success: true,
      refunds: items,
    };
  } catch (error) {
    console.error("Failed to fetch refund status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch refund status",
    };
  }
}

export async function handlePartialRefund(
  clerkUserId: string,
  paymentId: string,
  refundAmount: number,
  reason: string
): Promise<RefundResult> {
  try {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const payment = user.payments.find((p: { paymentId?: string; currency?: string }) => p.paymentId === paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    const refund = await createRefund({
      paymentId,
      amount: refundAmount,
      reason,
      notes: { type: "partial_refund" },
      currency: payment.currency,
    });

    if (!refund.success) {
      const r = asRefund(refund);
      return { success: false, error: typeof r.error === "string" ? r.error : "Refund failed" };
    }

    user.payments.push({
      timestamp: new Date(),
      amount: -refundAmount,
      paymentId: refund.id,
      status: "completed",
    });

    user.markModified('payments');
    await user.save();

    console.log(`Partial refund processed for user ${clerkUserId}: ₹${refundAmount}`);

    {
      const r = asRefund(refund);
      const refundId = typeof r.id === "string" ? r.id : undefined;
      const status = typeof r.status === "string" ? r.status : undefined;

      return {
        success: true,
        refundId,
        amount: refundAmount,
        status,
      };
    }
  } catch (error) {
    console.error("Partial refund failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Partial refund processing failed",
    };
  }
}

export async function getUserRefundHistory(
  clerkUserId: string
): Promise<{
  success: boolean;
  refunds?: any[];
  error?: string;
}> {
  try {
    await connectToDatabase();

    const user = await User.findOne({ clerkUserId });
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const refundedPayments = user.payments.filter((p: any) => p.status === "refunded");
    const negativeAmountPayments = user.payments.filter((p: any) => p.amount < 0);

    const refunds = [...refundedPayments, ...negativeAmountPayments].map(payment => ({
      paymentId: payment.paymentId,
      amount: Math.abs(payment.amount),
      timestamp: payment.timestamp,
      status: payment.status,
      type: payment.amount < 0 ? "partial" : "full",
    }));

    return {
      success: true,
      refunds,
    };
  } catch (error) {
    console.error("Failed to fetch refund history:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch refund history",
    };
  }
}