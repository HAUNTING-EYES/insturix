import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const generatedSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string
) => {
  const keySecret = process.env.RAZORPAY_SECRET_ID;
  if (!keySecret) {
    throw new Error("RAZORPAY_SECRET_ID is not defined");
  }

  const sig = crypto
    .createHmac("sha256", keySecret)
    .update(razorpayOrderId + "|" + razorpayPaymentId)
    .digest("hex");
  return sig;
};

export async function POST(request: NextRequest) {
  const { orderId, razorpayPaymentId, razorpaySignature } =
    await request.json();

  try {
    const signature = generatedSignature(orderId, razorpayPaymentId);
    if (signature !== razorpaySignature) {
      return NextResponse.json(
        { message: "Payment verification failed", isOk: false },
        { status: 400 }
      );
    }

    // Probably some database calls here to update order or add premium status to user
    return NextResponse.json(
      { message: "Payment verified successfully", isOk: true },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "An unknown error occurred",
        isOk: false,
      },
      { status: 500 }
    );
  }
}
