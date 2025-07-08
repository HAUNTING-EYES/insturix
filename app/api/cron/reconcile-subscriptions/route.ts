import { NextRequest, NextResponse } from "next/server";
import { User } from "@/schemas/user";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Razorpay from "razorpay";
import { downgradeUserToFreePlan } from "@/lib/services/planService";
import { UserType } from "@/types/userTypes";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', {
      status: 401,
    });
  }

  await connectToDatabase();

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
  });

  // Find users with active, non-free plans and a Razorpay subscription ID
  const usersToReconcile = await User.find({
    "currentPlan.name": { $ne: UserType.Free },
    "currentPlan.status": "active",
    "currentPlan.subscriptionId.razorpay": { $exists: true },
  });

  let reconciledCount = 0;
  let errorCount = 0;

  for (const user of usersToReconcile) {
    const subscriptionId = user.currentPlan.subscriptionId.razorpay;
    if (!subscriptionId) continue;

    try {
      const subscription = await razorpay.subscriptions.fetch(subscriptionId);

      if (subscription.status === "cancelled" || subscription.status === "completed" || subscription.status === "expired") {
        if (user.currentPlan.status === "active") {
          console.log(`Reconciling user ${user.clerkUserId}: Subscription ${subscriptionId} is ${subscription.status}, but DB plan is active. Downgrading.`);
          await downgradeUserToFreePlan(user.clerkUserId);
          reconciledCount++;
        }
      } else if (subscription.status === "active") {
        if (user.currentPlan.status !== "active") {
            console.log(`Reconciling user ${user.clerkUserId}: Subscription ${subscriptionId} is active, but DB plan is ${user.currentPlan.status}. Reactivating.`);
            user.currentPlan.status = "active";
            user.currentPlan.cancelAtPeriodEnd = false;
            await user.save();
            reconciledCount++;
        }
      }
    } catch (error) {
      console.error(`Error reconciling subscription ${subscriptionId} for user ${user.clerkUserId}:`, error);
      errorCount++;
    }
  }

  return NextResponse.json({ 
    message: "Subscription reconciliation completed.",
    reconciledCount,
    errorCount,
    totalChecked: usersToReconcile.length 
  });
}