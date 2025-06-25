import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { POST as razorpayWebhook } from "./razorpay/route";
import { POST as lemonsqueezyWebhook } from "./lemonsqueezy/route";

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");

  if (userAgent?.includes("Razorpay-Webhook")) {
    return razorpayWebhook(request);
  } else if (userAgent?.includes("Lemon-Squeezy-Webhook")) {
    return lemonsqueezyWebhook(request);
  } else {
    return NextResponse.json({ error: "Unknown webhook source" }, { status: 400 });
  }
}