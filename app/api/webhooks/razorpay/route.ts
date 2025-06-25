import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";
import { DEFAULT_FREE_PLAN_LIMITS } from "@/lib/config/serviceLimits";
import { updateUserPlan } from "@/lib/services/planService";

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    subscription: {
      entity: {
        id: string;
        plan_id: string;
        status: "active" | "pending" | "halted" | "cancelled" | "completed" | "expired";
        current_start: number;
        current_end: number;
        latest_invoice: string;
        notes?: {
          userId?: string;
          planName?: string;
          userType?: string;
        };
      };
    };
    payment: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        method: "card" | "upi" | "netbanking" | "wallet";
        notes: {
          userId?: string;
          planName?: string;
          userType?: string;
        };
        error_reason?: string;
      };
    };
  };
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
  console.warn(`Using fallback limits for plan type: ${planType}`);
  return DEFAULT_FREE_PLAN_LIMITS;
};

const handleFailedSubscription = async (
  userId: string,
  subscriptionId: string,
  planId: string,
  errorReason: string
) => {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId: userId });
  if (!user) {
    console.error(`User not found for failed subscription: ${subscriptionId}, userId: ${userId}`);
    return;
  }

  user.subscriptions.push({
    provider: "razorpay",
    subscriptionId,
    planId,
    status: "halted", // Or another appropriate status
    startDate: new Date(),
  });

  user.markModified('subscriptions');
  await user.save();

  console.log(`Failed subscription recorded for user ${userId}: ${errorReason}`);
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
    console.log(`Received Razorpay webhook: ${event}`);

    switch (event) {
      case "payment.captured":
      case "subscription.charged":
      case "subscription.activated":
      case "subscription.updated": {
        const subscription = webhookPayload.subscription?.entity;
        const payment = webhookPayload.payment?.entity;

        if (subscription && payment && subscription.status === "active" && subscription.notes?.userId) {
          await updateUserPlan(
            subscription.notes.userId,
            (subscription.notes.userType as UserType) || UserType.Plus,
            {
              provider: "razorpay",
              subscriptionId: subscription.id,
              planId: subscription.plan_id,
              amount: payment.amount / 100,
              currency: payment.currency,
              paymentMethod: payment.method,
              latestInvoice: subscription.latest_invoice,
            }
          );
        }
        break;
      }
      case "subscription.halted": {
        const subscription = webhookPayload.subscription?.entity;
        const payment = webhookPayload.payment?.entity;

        if (subscription && payment && subscription.notes?.userId) {
          await handleFailedSubscription(
            subscription.notes.userId,
            subscription.id,
            subscription.plan_id,
            payment.error_reason || "Subscription halted"
          );
        }
        break;
      }
      case "payment.authorized": {
        const payment = webhookPayload.payment?.entity;
        if (payment) {
          console.log(`Payment event '${event}' received for payment ${payment.id}`);
        }
        break;
      }
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