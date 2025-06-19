import connectToDatabase from "@/schemas/ConnectToDatabase";
import User from "@/schemas/user";
import { UserType } from "@/types/userTypes";
import Razorpay from "razorpay";

// Initialize Razorpay instance once
const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
  });
};

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

const planFeatures: { [key: string]: string[] } = {
  [UserType.Free]: ["Basic access", "Limited storage", "Community support"],
  [UserType.Plus]: [
    "Plus access",
    "10GB storage",
    "Priority support",
    "Advanced features",
  ],
  [UserType.Pro]: [
    "Premium access",
    "50GB storage",
    "24/7 support",
    "All features",
    "Custom branding",
  ],
  [UserType.Premium]: [
    "Ultra access",
    "100GB storage",
    "Dedicated support",
    "All features",
    "Custom branding",
    "API access",
  ],
};

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

    const payment = user.payments.find((p: any) => p.paymentId === options.paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    if (payment.status === "refunded") {
      return { success: false, error: "Payment already refunded" };
    }

    const razorpay = getRazorpayInstance();

    const refundAmount = options.amount || payment.amount * 100;
    
    const refund = await razorpay.payments.refund(options.paymentId, {
      amount: refundAmount,
      notes: options.notes || {},
      receipt: `refund_${Date.now()}_${clerkUserId}`,
    });

    payment.status = "refunded";
    user.markModified('payments');

    if (user.currentPlan.status === "active") {
      user.currentPlan.status = "canceled";
      user.currentPlan.endDate = new Date();

      const freePlan = {
        name: UserType.Free,
        startDate: new Date(),
        endDate: null,
        price: 0,
        status: "active" as const,
        features: planFeatures[UserType.Free],
      };

      user.currentPlan = freePlan;
      user.markModified('currentPlan');
    }

    await user.save();

    console.log(`Refund processed for user ${clerkUserId}, payment ${options.paymentId}`);

    return {
      success: true,
      refundId: refund.id,
      amount: (refund.amount || 0) / 100,
      status: refund.status,
    };
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
  refunds?: any[];
  error?: string;
}> {
  try {
    const razorpay = getRazorpayInstance();

    const refunds = await razorpay.payments.fetchMultipleRefund(paymentId);

    return {
      success: true,
      refunds: refunds.items,
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

    const payment = user.payments.find((p: any) => p.paymentId === paymentId);
    if (!payment) {
      return { success: false, error: "Payment not found" };
    }

    const razorpay = getRazorpayInstance();

    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(refundAmount * 100),
      notes: { reason, type: "partial_refund" },
      receipt: `partial_refund_${Date.now()}_${clerkUserId}`,
    });

    user.payments.push({
      timestamp: new Date(),
      amount: -refundAmount,
      paymentId: refund.id,
      status: "completed",
    });

    user.markModified('payments');
    await user.save();

    console.log(`Partial refund processed for user ${clerkUserId}: ₹${refundAmount}`);

    return {
      success: true,
      refundId: refund.id,
      amount: refundAmount,
      status: refund.status,
    };
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