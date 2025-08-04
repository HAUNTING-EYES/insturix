import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";

const generatedSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string
) => {
  const keySecret = process.env.RAZORPAY_SECRET_KEY_ID;
  if (!keySecret) {
    throw new Error("RAZORPAY_SECRET_KEY_ID is not defined");
  }

  const sig = crypto
    .createHmac("sha256", keySecret)
    .update(razorpayOrderId + "|" + razorpayPaymentId)
    .digest("hex");
  return sig;
};

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { message: "Unauthorized", isOk: false },
        { status: 401 }
      );
    }

    const {
      orderId,
      razorpayPaymentId,
      razorpaySignature,
    } = await request.json();

    // Verify payment signature
    const signature = generatedSignature(orderId, razorpayPaymentId);
    if (signature !== razorpaySignature) {
      return NextResponse.json(
        { message: "Payment verification failed", isOk: false },
        { status: 400 }
      );
    }

    // The webhook will handle the plan upgrade.
    // This endpoint just confirms the payment signature.
    return NextResponse.json(
      {
        message: "Payment verification successful. Your plan will be updated shortly.",
        isOk: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "An unknown error occurred",
        isOk: false,
      },
      { status: 500 }
    );
  }
}
