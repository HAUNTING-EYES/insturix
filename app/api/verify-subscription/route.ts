import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@clerk/nextjs/server";
import { updateUserPlan } from "@/lib/services/planService";
import { UserType } from "@/types/userTypes";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      planType,
    }: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
      planType: UserType;
    } = await request.json();

    const keySecret = process.env.RAZORPAY_SECRET_KEY_ID!;
    const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // The webhook will handle the plan update.
    // This endpoint just confirms the subscription was created successfully on the client-side.

    return NextResponse.json({ isOk: true, message: "Subscription initiated successfully. Your plan will be updated shortly." });
  } catch (error: any) {
    console.error("Error verifying Razorpay subscription:", error);
    return NextResponse.json(
      {
        error: "Failed to verify subscription",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
