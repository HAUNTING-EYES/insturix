import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Ics25Registration from "@/schemas/Ics25Registration";
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    await connectToDatabase();
    const { registrationId, orderId, razorpayPaymentId, razorpaySignature } = await request.json();

    if (!process.env.RAZORPAY_SECRET_KEY_ID) {
      throw new Error("RAZORPAY_SECRET_KEY_ID is not defined");
    }

    const sig = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY_ID)
      .update(orderId + "|" + razorpayPaymentId)
      .digest("hex");

    if (sig !== razorpaySignature) {
      return NextResponse.json(
        { isOk: false, message: "Payment verification failed" },
        { status: 400 }
      );
    }

    const registration = await Ics25Registration.findById(registrationId);
    if (!registration) {
      return NextResponse.json(
        { isOk: false, message: "Registration not found" },
        { status: 404 }
      );
    }

    // Optional: ensure the order IDs match
    if (registration.razorpay?.orderId !== orderId) {
      return NextResponse.json(
        { isOk: false, message: "Order mismatch" },
        { status: 400 }
      );
    }

    registration.razorpay = {
      orderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      status: "paid",
    } as any;
    if (userId && !registration.clerkUserId) {
      registration.clerkUserId = userId;
    }
    await registration.save();

    return NextResponse.json(
      { isOk: true, message: "Payment verified and registration confirmed" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("ICS25 verify-order error:", error);
    return NextResponse.json(
      { isOk: false, message: error?.message || "Verification failed" },
      { status: 500 }
    );
  }
}
