import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import User from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";
import { DEFAULT_FREE_PLAN_LIMITS } from "@/lib/config/serviceLimits";

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment: {
      entity: {
        id: string;
        entity: string;
        amount: number;
        currency: string;
        status: string;
        order_id: string;
        invoice_id?: string;
        international: boolean;
        method: string;
        amount_refunded: number;
        refund_status?: string;
        captured: boolean;
        description?: string;
        card_id?: string;
        bank?: string;
        wallet?: string;
        vpa?: string;
        email: string;
        contact: string;
        notes: {
          userId?: string;
          planName?: string;
          userType?: string;
        };
        fee?: number;
        tax?: number;
        error_code?: string;
        error_description?: string;
        error_source?: string;
        error_step?: string;
        error_reason?: string;
        acquirer_data?: any;
        created_at: number;
      };
    };
  };
  created_at: number;
}

const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string
): boolean => {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

const getServiceLimitsFromPlan = async (planType: string) => {
  try {
    const plan = await Plan.findOne({ type: planType.toLowerCase(), isActive: true });
    if (!plan) {
      console.warn(`Plan not found for type: ${planType}, using fallback limits`);
      return getFallbackServiceLimits(planType);
    }

    return plan.serviceLimits;
  } catch (error) {
    console.error(`Error fetching plan service limits for ${planType}:`, error);
    return getFallbackServiceLimits(planType);
  }
};

const getFallbackServiceLimits = (planType: string) => {
  // Always return the current free plan limits as fallback
  // This ensures consistency with the setupPlans.js configuration
  console.warn(`Using fallback limits for plan type: ${planType}`);
  return DEFAULT_FREE_PLAN_LIMITS;
};

const updateUserPlan = async (
  userId: string,
  planType: string,
  paymentId: string,
  amount: number
) => {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId: userId });
  if (!user) {
    console.error(`User not found for payment: ${paymentId}, userId: ${userId}`);
    return;
  }

  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + 1);

  // Fetch service limits from plans collection
  const planServiceLimits = await getServiceLimitsFromPlan(planType);
  
  // Import and use the conversion utility
  const { UserInitializationService } = await import("@/lib/services/userInitializationService");
  const serviceLimits = UserInitializationService.convertPlanLimitsToUserLimits(planServiceLimits);

  // Get plan ID from plans collection
  const plan = await Plan.findOne({ type: planType.toLowerCase(), isActive: true });
  const planId = plan?._id?.toString() || "";

  user.currentPlan = {
    planId: planId,
    name: planType as UserType,
    startDate: now,
    endDate: endDate,
    price: amount / 100,
    currency: "INR", // Default, should be from payment
    status: "active",
    serviceLimits: serviceLimits,
  };

  user.payments.push({
    paymentId: paymentId,
    orderId: "",
    timestamp: now,
    amount: amount / 100,
    currency: "INR",
    status: "completed",
    paymentMethod: "card", // Should be determined from payment data
    planName: planType,
    razorpayPaymentId: paymentId,
  });

  user.markModified('currentPlan');
  user.markModified('payments');
  await user.save();

  console.log(`Plan updated successfully for user ${userId}, payment ${paymentId}`);
};

const handleFailedPayment = async (
  userId: string,
  paymentId: string,
  amount: number,
  errorReason: string
) => {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId: userId });
  if (!user) {
    console.error(`User not found for failed payment: ${paymentId}, userId: ${userId}`);
    return;
  }

  user.payments.push({
    timestamp: new Date(),
    amount: amount / 100,
    paymentId: paymentId,
    status: "failed",
  });

  user.markModified('payments');
  await user.save();

  console.log(`Failed payment recorded for user ${userId}: ${errorReason}`);
};

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      console.error("Missing Razorpay signature");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    if (!verifyWebhookSignature(body, signature, webhookSecret)) {
      console.error("Invalid Razorpay webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: RazorpayWebhookPayload = JSON.parse(body);
    const { event, payload: webhookPayload } = payload;
    const payment = webhookPayload.payment.entity;

    console.log(`Received Razorpay webhook: ${event} for payment ${payment.id}`);

    switch (event) {
      case "payment.captured":
        if (payment.status === "captured" && payment.notes.userId) {
          await updateUserPlan(
            payment.notes.userId,
            payment.notes.userType || UserType.Plus,
            payment.id,
            payment.amount
          );
        }
        break;

      case "payment.failed":
        if (payment.notes.userId) {
          await handleFailedPayment(
            payment.notes.userId,
            payment.id,
            payment.amount,
            payment.error_reason || "Unknown error"
          );
        }
        break;

      case "payment.authorized":
        console.log(`Payment authorized: ${payment.id}`);
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Razorpay webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}