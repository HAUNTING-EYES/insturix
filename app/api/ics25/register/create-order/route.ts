import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import Ics25Registration from "@/schemas/Ics25Registration";
import { auth } from "@clerk/nextjs/server";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  throw new Error("Razorpay credentials missing");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
});

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    const body = await req.json();

    const {
      leader,
      teamName,
      game,
      leaderGameInfo,
      teammates,
      numTeammates,
      amountPerPerson = 500,
      currency = "INR",
    } = body;

    const membersCount = 1 + Number(numTeammates || 0);
    const totalAmount = amountPerPerson * membersCount;

    const order = await razorpay.orders.create({
      amount: totalAmount * 100, // smallest unit
      currency,
      receipt: `ics25_${Date.now()}`,
      notes: {
        context: "ICS25 Gaming Registration",
        game,
        teamName,
        leaderName: leader?.name,
        leaderPhone: leader?.phone,
      },
    });

    const registration = await Ics25Registration.create({
      clerkUserId: userId || undefined,
      leader,
      teamName,
      game,
      leaderGameInfo,
      teammates,
      numTeammates,
      amountPerPerson,
      currency,
      totalAmount,
      razorpay: {
        orderId: order.id,
        status: "pending",
      },
    });

    return NextResponse.json(
      {
        isOk: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        registrationId: registration._id,
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("ICS25 create-order error:", error);
    return NextResponse.json(
      { isOk: false, message: error?.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
