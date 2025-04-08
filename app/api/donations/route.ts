import { NextResponse } from "next/server"
import Razorpay from "razorpay"
// import { auth } from '@clerk/nextjs/server'

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  throw new Error('Razorpay credentials are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET_KEY_ID in your environment variables.');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID
})

export async function POST(req: Request) {
  // const { userId } = await auth()
  const { amount, currency } = await req.json()
  const options = await razorpay.orders.create({
    amount: amount * 100,
    currency: currency,
    receipt: `receipt_${Math.floor(Math.random() * 100000)}`,
    notes:{
      note:"This is a Donation"
    }
  })
  return NextResponse.json(options)
}

