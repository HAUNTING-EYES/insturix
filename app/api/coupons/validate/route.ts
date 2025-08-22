import { NextRequest, NextResponse } from "next/server";
import { validateCoupon } from "@/lib/services/couponService";

export async function POST(request: NextRequest) {
  try {
    const { code, amount, currency } = await request.json();

    // Validate required fields
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: "Coupon code is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );
    }

    if (!currency || typeof currency !== 'string') {
      return NextResponse.json(
        { error: "Currency is required" },
        { status: 400 }
      );
    }

    // Validate coupon
    const result = validateCoupon(code.trim(), amount, currency);

    if (!result.isValid) {
      return NextResponse.json(
        { 
          success: false,
          error: result.error 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      coupon: result.coupon,
    });

  } catch (error) {
    console.error("Error validating coupon:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to validate coupon" 
      },
      { status: 500 }
    );
  }
}