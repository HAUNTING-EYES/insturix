import { NextResponse } from "next/server";
import Razorpay from "razorpay";
// import { auth } from '@clerk/nextjs/server'

let _razorpay: Razorpay | null = null;
function getRazorpay() {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_SECRET_KEY_ID!,
    });
  }
  return _razorpay;
}

export async function POST(req: Request) {
  // const { userId } = await auth()
  const { amount, currency } = await req.json();
  const options = await getRazorpay().orders.create({
    amount: amount * 100,
    currency: currency,
    receipt: `receipt_${Math.floor(Math.random() * 100000)}`,
    notes: {
      note: "This is a Donation",
    },
  });
  return NextResponse.json(options);
}
