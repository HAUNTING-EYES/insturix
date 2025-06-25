import { NextRequest, NextResponse } from "next/server";
import { updateUserPlan } from "@/lib/services/planService";
import { UserType } from "@/types/userTypes";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!secret) {
    return new Response("Webhook secret not configured.", { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  if (!signature) {
    return new Response("No signature found in request.", { status: 401 });
  }

  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (!crypto.timingSafeEqual(digest, signatureBuffer)) {
    return new Response("Invalid signature.", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { event_name, data } = body;

  if (event_name === "subscription_created") {
    const { customer_id, plan_id, status, ends_at } = data.attributes;
    const { user_id } = data.meta.custom_data;

    await updateUserPlan(user_id, plan_id as UserType, {
      provider: "lemonsqueezy",
      subscriptionId: data.id,
      planId: plan_id,
      amount: 0, // This will be updated by a separate invoice webhook
      currency: "USD", // This will be updated by a separate invoice webhook
    });
  }

  return NextResponse.json({ status: 200 });
}