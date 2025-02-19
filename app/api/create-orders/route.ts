import { NextResponse } from "next/server";
import Razorpay from "razorpay";


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID as string,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID as string,
});

export async function POST(req: Request) {
  const { amount,currency } = await req.json();
  const options = await razorpay.orders.create({
    amount: amount,
    currency: currency,
    receipt: `receipt_${Math.floor(Math.random() * 100000)}`,
  });
  return NextResponse.json(options);
}
