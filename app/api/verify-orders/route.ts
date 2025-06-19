import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import crypto from "crypto";
import { updateUserPlan } from "@/lib/services/planService";
import { UserInitializationService } from "@/lib/services/userInitializationService";
import { UserType } from "@/types/userTypes";

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
      planDetails
    } = await request.json();

    // Verify payment signature
    const signature = generatedSignature(orderId, razorpayPaymentId);
    if (signature !== razorpaySignature) {
      return NextResponse.json(
        { message: "Payment verification failed", isOk: false },
        { status: 400 }
      );
    }

    // Ensure user exists (create if webhook failed)
    try {
      // Try to update user plan - if user doesn't exist, create them first
      try {
        const updatedUser = await updateUserPlan(userId, planDetails.userType as UserType, {
          paymentId: razorpayPaymentId,
          orderId: orderId,
          amount: planDetails.price,
          currency: planDetails.currency || "USD",
          paymentMethod: planDetails.paymentMethod || "card",
          razorpayPaymentId: razorpayPaymentId,
          razorpayOrderId: orderId,
        });

        return NextResponse.json(
          {
            message: "Payment verified and plan upgraded successfully",
            isOk: true,
            currentPlan: updatedUser.currentPlan
          },
          { status: 200 }
        );
      } catch (userError: any) {
        if (userError.message === "User not found") {
          // User doesn't exist, create them first
          console.log(`User not found during payment verification for Clerk ID: ${userId}, creating user...`);
          
          const clerkUser = await (await clerkClient()).users.getUser(userId);
          const email = clerkUser.emailAddresses?.[0]?.emailAddress || "";
          
          if (!email) {
            return NextResponse.json(
              { message: "User email not found", isOk: false },
              { status: 400 }
            );
          }
          
          // Create user with free plan first
          await UserInitializationService.ensureUserExists(userId, email);
          
          // Now update to paid plan
          const updatedUser = await updateUserPlan(userId, planDetails.userType as UserType, {
            paymentId: razorpayPaymentId,
            orderId: orderId,
            amount: planDetails.price,
            currency: planDetails.currency || "USD",
            paymentMethod: planDetails.paymentMethod || "card",
            razorpayPaymentId: razorpayPaymentId,
            razorpayOrderId: orderId,
          });

          return NextResponse.json(
            {
              message: "Payment verified and plan upgraded successfully",
              isOk: true,
              currentPlan: updatedUser.currentPlan
            },
            { status: 200 }
          );
        } else {
          throw userError;
        }
      }
    } catch (error) {
      console.error("Failed to create/update user during payment:", error);
      return NextResponse.json(
        { message: "User creation/update failed", isOk: false },
        { status: 500 }
      );
    }
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
