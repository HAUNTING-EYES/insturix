import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { User } from "@/schemas/user";
import Plan from "@/schemas/plans";
import { UserType } from "@/types/userTypes";
import { updateUserPlan, downgradeUserToFreePlan, extendUserPlan, cancelUserPlan } from "@/lib/services/planService";
import { CreditsService } from "@/lib/services/creditsService";
import { getPackagePool } from "@/lib/config/creditCosts";
import { normalizePlanKey } from "@/lib/config/plan-limits";

let _razorpay: Razorpay | null = null;
function getRazorpay() {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });
  }
  return _razorpay;
}

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
          dbPlanId?: string;
        };
      };
    };
    payment: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: "captured" | "authorized" | "failed";
        method: "card" | "upi" | "netbanking" | "wallet";
        description?: string;
        order_id?: string;
        invoice_id?: string;
        email?: string;
        contact?: string;
        notes: {
          userId?: string;
          planName?: string;
          userType?: string;
          dbPlanId?: string;
          subscriptionId?: string;
          // Credits topup fields
          type?: string;
          credits?: string;
          packageId?: string;
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

const handleSubscriptionCancelled = async (
  userId: string,
  subscriptionId: string
) => {
  await connectToDatabase();
  
  const user = await User.findOne({ clerkUserId: userId });
  if (!user) {
    console.error(`User not found for cancelled subscription: ${subscriptionId}, userId: ${userId}`);
    return;
  }

  // Mark the plan to be canceled at the end of the period
  await cancelUserPlan(userId);

  // Update subscription record in user's history
  const subscription = user.subscriptions.find((s: any) => s.subscriptionId === subscriptionId);
  if (subscription) {
    subscription.status = "cancelled";
    user.markModified('subscriptions');
    await user.save();
  }

  console.log(`Subscription ${subscriptionId} cancellation initiated for user ${userId}.`);
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
      case "subscription.activated": {
        const subscription = webhookPayload.subscription.entity;
        const payment = webhookPayload.payment.entity;

        await connectToDatabase();

        let user: any;
        if (subscription.notes?.userId) {
          user = await User.findOne({ clerkUserId: subscription.notes.userId });
        }
        if (!user && payment?.email) {
          user = await User.findOne({ email: payment.email });
        }

        if (!user) {
          console.error(`User not found for subscription ${subscription.id}`);
          break;
        }

        // Idempotency guard for webhook REDELIVERY: if a prior subscription.activated
        // already moved this subscription to an active planHistory entry, skip re-activation.
        // (The client verify route is now pending-only and never sets 'active' — the webhook
        // is the sole activation owner. Credit grants are additionally guarded by idempotencyKey.)
        const alreadyActivated = user.planHistory?.some(
          (plan: any) =>
            (plan.subscriptionId === subscription.id ||
             plan.subscriptionId?.razorpay === subscription.id) &&
            plan.status === 'active'
        );

        if (alreadyActivated) {
          console.log(`[Webhook] Subscription ${subscription.id} already activated for user ${user.clerkUserId} (via verify route). Skipping duplicate activation + credit grant.`);
          // Still clear UI messages since verify route may not have done it
          user.uiMessages = user.uiMessages.filter(
            (msg: any) => msg.id !== "plan-activation-pending"
          );
          user.markModified("uiMessages");
          await user.save();
          break;
        }

        // 1. Remove the "pending activation" message
        user.uiMessages = user.uiMessages.filter(
          (msg: any) => msg.id !== "plan-activation-pending"
        );
        user.markModified("uiMessages");
        await user.save();

        // 2. Update the plan status in planHistory
        const pendingPlan = user.planHistory.find(
          (plan: any) => plan.subscriptionId?.razorpay === subscription.id && plan.status === 'pending'
        );

        if (pendingPlan) {
          // The `updateUserPlan` service should handle moving the plan from planHistory to currentPlan
          // and setting the status to 'active'. If not, we need to adjust it here.
        }

        let planDetails: any;
        if (subscription.notes?.dbPlanId) {
          planDetails = await Plan.findById(subscription.notes.dbPlanId);
        }
        if (!planDetails) {
          const currency = webhookPayload.payment.entity.currency;
          if (currency) {
            planDetails = await Plan.findOne({
              $or: [
                { [`pricing.${currency}.monthly.providerPlanIds.razorpay`]: subscription.plan_id },
                { [`pricing.${currency}.yearly.providerPlanIds.razorpay`]: subscription.plan_id },
              ]
            });
          }
        }

        if (!planDetails) {
          console.error(`Plan not found in DB for Razorpay plan ${subscription.plan_id}`);
          break;
        }

        const userType = planDetails.type;
        const dbPlanId = planDetails._id.toString();

        try {
          const plan = await getRazorpay().plans.fetch(subscription.plan_id);
          if (!plan) {
            console.error(`Could not fetch plan details from Razorpay for ${subscription.plan_id}`);
            break;
          }

          await updateUserPlan(
            user.clerkUserId,
            userType as UserType,
            {
              provider: "razorpay",
              subscriptionId: subscription.id,
              planId: dbPlanId,
              amount: Number(plan.item.amount) / 100,
              currency: plan.item.currency,
              paymentMethod: "card", // Placeholder
              latestInvoice: subscription.latest_invoice,
            }
          );
        } catch (error) {
          console.error(`Error processing subscription activation: ${subscription.id}`, error);
        }

        // Grant subscription credits (idempotent: Razorpay redelivers subscription.activated).
        try {
          const plan = await getRazorpay().plans.fetch(subscription.plan_id);
          const planPeriod = (plan as any).period === 'yearly' ? 'yearly' : 'monthly';
          const grantKey = `razorpay:subscription_activated:${subscription.id}:${subscription.latest_invoice || subscription.current_start}`;
          await CreditsService.grantSubscriptionCredits(user.clerkUserId, userType, planPeriod, { idempotencyKey: grantKey });
          console.log(`Granted subscription credits to user ${user.clerkUserId} for ${userType} plan`);
        } catch (creditError) {
          console.error(`Error granting subscription credits: ${subscription.id}`, creditError);
        }
        break;
      }
      case "subscription.charged": {
        const subscription = webhookPayload.subscription.entity;
        const payment = webhookPayload.payment.entity;
        await connectToDatabase();

        let user: any;
        if (subscription.notes?.userId) {
          user = await User.findOne({ clerkUserId: subscription.notes.userId });
        }
        if (!user) {
          user = await User.findOne({ "currentPlan.subscriptionId.razorpay": subscription.id });
        }
        if (!user) {
            user = await User.findOne({ "subscriptions.subscriptionId": subscription.id });
        }

        if (!user) {
          console.error(`User not found for subscription ${subscription.id}`);
          break;
        }

        // If user was downgraded to free, re-upgrade them. Otherwise, extend the plan.
        if (user.currentPlan.name === UserType.Free) {
          console.log(`User ${user.clerkUserId} is on a Free plan. Re-upgrading after successful charge.`);

          let planDetails: any;
          if (subscription.notes?.dbPlanId) {
            planDetails = await Plan.findById(subscription.notes.dbPlanId);
          }
          if (!planDetails) {
            const currency = payment.currency;
            if (currency) {
              planDetails = await Plan.findOne({
                $or: [
                  { [`pricing.${currency}.monthly.providerPlanIds.razorpay`]: subscription.plan_id },
                  { [`pricing.${currency}.yearly.providerPlanIds.razorpay`]: subscription.plan_id },
                ]
              });
            }
          }

          if (!planDetails) {
            console.error(`Plan not found in DB for Razorpay plan ${subscription.plan_id} during re-upgrade.`);
            break;
          }

          const userType = planDetails.type;
          const dbPlanId = planDetails._id.toString();
          
          try {
            const plan = await getRazorpay().plans.fetch(subscription.plan_id);
            if (!plan) {
              console.error(`Could not fetch plan details from Razorpay for ${subscription.plan_id}`);
              break;
            }

            await updateUserPlan(
              user.clerkUserId,
              userType as UserType,
              {
                provider: "razorpay",
                subscriptionId: subscription.id,
                planId: dbPlanId,
                amount: Number(plan.item.amount) / 100,
                currency: payment.currency,
                paymentMethod: payment.method,
                latestInvoice: subscription.latest_invoice,
              }
            );
            console.log(`User ${user.clerkUserId} re-upgraded to ${userType} plan.`);
          } catch (error) {
            console.error(`Error processing re-upgrade for subscription ${subscription.id}`, error);
          }
        } else {
          // A scheduled plan change (e.g. a downgrade) switches subscription.plan_id AT
          // cycle end, so the plan Razorpay just charged for may differ from currentPlan.
          // Resolve the charged plan and, if it changed, SWITCH the plan instead of merely
          // extending it — otherwise the user keeps the old plan + old credit allocation.
          const currency = payment.currency;
          let chargedPlan: any = null;
          if (currency) {
            chargedPlan = await Plan.findOne({
              $or: [
                { [`pricing.${currency}.monthly.providerPlanIds.razorpay`]: subscription.plan_id },
                { [`pricing.${currency}.yearly.providerPlanIds.razorpay`]: subscription.plan_id },
              ],
            });
          }
          const chargedType = chargedPlan?.type ? normalizePlanKey(chargedPlan.type) : null;
          const currentType = normalizePlanKey(user.currentPlan.name);
          const grantKey = `razorpay:subscription_charged:${subscription.id}:${subscription.latest_invoice || subscription.current_start}`;

          if (chargedPlan && chargedType && chargedType !== currentType) {
            console.log(`User ${user.clerkUserId} scheduled plan change applied at renewal: ${currentType} -> ${chargedType}`);
            try {
              const plan = await getRazorpay().plans.fetch(subscription.plan_id);
              await updateUserPlan(user.clerkUserId, chargedType as UserType, {
                provider: "razorpay",
                subscriptionId: subscription.id,
                planId: chargedPlan._id.toString(),
                amount: Number(plan.item.amount) / 100,
                currency: payment.currency,
                paymentMethod: payment.method,
                latestInvoice: subscription.latest_invoice,
              });
              const planPeriod = (plan as any).period === 'yearly' ? 'yearly' : 'monthly';
              await CreditsService.grantSubscriptionCredits(user.clerkUserId, chargedType, planPeriod, { idempotencyKey: grantKey });
              // Clear the pending marker — the change is now live.
              if (user.pendingPlanChange) {
                await User.updateOne({ _id: user._id }, { $set: { pendingPlanChange: null } });
              }
              console.log(`User ${user.clerkUserId} plan switched to ${chargedType} and credits granted.`);
            } catch (error) {
              console.error(`Error applying scheduled plan change for subscription ${subscription.id}`, error);
            }
          } else {
            console.log(`User ${user.clerkUserId} is on a paid plan. Extending plan.`);
            await extendUserPlan(user.clerkUserId, {
              subscriptionId: subscription.id,
              latestInvoice: subscription.latest_invoice,
            });

            // Grant new subscription credits on renewal (idempotent: Razorpay redelivers subscription.charged).
            try {
              const plan = await getRazorpay().plans.fetch(subscription.plan_id);
              const planPeriod = (plan as any).period === 'yearly' ? 'yearly' : 'monthly';
              await CreditsService.grantSubscriptionCredits(user.clerkUserId, user.currentPlan.name, planPeriod, { idempotencyKey: grantKey });
              console.log(`Granted renewal credits to user ${user.clerkUserId}`);
            } catch (creditError) {
              console.error(`Error granting renewal credits for subscription ${subscription.id}:`, creditError);
            }
          }
        }
        break;
      }
      case "subscription.halted": {
        const subscription = webhookPayload.subscription?.entity;
        const payment = webhookPayload.payment?.entity;

        if (subscription && payment) {
            await connectToDatabase();
            let user: any;
            if (subscription.notes?.userId) {
                user = await User.findOne({ clerkUserId: subscription.notes.userId });
            }
            if (!user) {
                user = await User.findOne({ "subscriptions.subscriptionId": subscription.id });
            }

            if(user) {
                await downgradeUserToFreePlan(user.clerkUserId);
                console.log(`User ${user.clerkUserId} downgraded to free plan due to subscription halt.`);
            } else {
                console.error(`Could not find user for halted subscription ${subscription.id}`);
            }
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
      case "payment.captured": {
        const payment = webhookPayload.payment?.entity;
        if (payment) {
          console.log(`Payment event '${event}' received for payment ${payment.id}`);
          
          // Check if this is a credits topup payment
          if (payment.notes?.type === 'credits_topup') {
            const userId = payment.notes.userId;
            const credits = parseInt(payment.notes.credits || '0', 10);
            const packageId = payment.notes.packageId;
            
            if (userId && credits > 0) {
              try {
                await CreditsService.addTopupCredits(userId, credits, {
                  paymentId: payment.id,
                  packageId,
                  pool: getPackagePool(packageId),
                });
                console.log(`[Credits Topup] Added ${credits} credits to user ${userId}`);
              } catch (creditError) {
                console.error(`[Credits Topup] Failed to add credits for payment ${payment.id}:`, creditError);
              }
            }
          }
        }
        break;
      }
      case "subscription.authenticated": {
        const subscription = webhookPayload.subscription?.entity;
        if (subscription) {
            console.log(`Subscription ${subscription.id} has been authenticated.`);
        }
        break;
      }
      case "subscription.cancelled": {
        const subscription = webhookPayload.subscription?.entity;
        if (subscription) {
            await connectToDatabase();
            let user: any;
            if (subscription.notes?.userId) {
                user = await User.findOne({ clerkUserId: subscription.notes.userId });
            }
            if (!user) {
                user = await User.findOne({ "subscriptions.subscriptionId": subscription.id });
            }

            if(user) {
                await handleSubscriptionCancelled(
                    user.clerkUserId,
                    subscription.id
                );
            } else {
                console.error(`Could not find user for cancelled subscription ${subscription.id}`);
            }
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