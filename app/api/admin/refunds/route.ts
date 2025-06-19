import { NextRequest, NextResponse } from "next/server";
import {
  initiateRefund,
  getRefundStatus,
  handlePartialRefund,
  getUserRefundHistory
} from "@/lib/services/refundService";
import { validateAdminAuth, createUnauthorizedResponse } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    const { action, paymentId, amount, reason, targetUserId } = await request.json();

    switch (action) {
      case "full_refund":
        if (!paymentId) {
          return NextResponse.json(
            { error: "Payment ID is required" },
            { status: 400 }
          );
        }

        if (!targetUserId) {
          return NextResponse.json(
            { error: "Target user ID is required for admin refunds" },
            { status: 400 }
          );
        }

        const fullRefundResult = await initiateRefund(targetUserId, {
          paymentId,
          reason,
        });

        return NextResponse.json(fullRefundResult);

      case "partial_refund":
        if (!paymentId || !amount || !targetUserId) {
          return NextResponse.json(
            { error: "Payment ID, amount, and target user ID are required" },
            { status: 400 }
          );
        }

        const partialRefundResult = await handlePartialRefund(
          targetUserId,
          paymentId,
          amount,
          reason || "Partial refund requested"
        );

        return NextResponse.json(partialRefundResult);

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Refund API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!validateAdminAuth(request)) {
      return createUnauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const paymentId = searchParams.get("paymentId");
    const targetUserId = searchParams.get("userId");

    switch (action) {
      case "status":
        if (!paymentId) {
          return NextResponse.json(
            { error: "Payment ID is required" },
            { status: 400 }
          );
        }

        const statusResult = await getRefundStatus(paymentId);
        return NextResponse.json(statusResult);

      case "history":
        if (!targetUserId) {
          return NextResponse.json(
            { error: "User ID is required for admin refund history" },
            { status: 400 }
          );
        }

        const historyResult = await getUserRefundHistory(targetUserId);
        return NextResponse.json(historyResult);

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Refund status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}