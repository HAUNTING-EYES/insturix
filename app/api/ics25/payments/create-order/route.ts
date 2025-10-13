import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Player from '@/schemas/ics25/Player';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET_KEY_ID) {
  console.warn('Razorpay credentials missing; payments will not work correctly');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID || '',
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    await getIcs25Db();
    const player = await Player.findOne({ clerkUserId: userId });
    if (!player) return NextResponse.json({ ok: false, message: 'Player not found' }, { status: 404 });

    const { amount = 500, currency = 'INR' } = await req.json();
    const order = await razorpay.orders.create({ amount: amount * 100, currency, receipt: `ics25_${Date.now()}`, notes: { clerkUserId: userId } } as any);

    player.payment = {
      status: 'pending',
      orderId: order.id,
      amount,
      currency,
    } as any;
    await player.save();

    return NextResponse.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (e: any) {
    console.error('ICS25 create-order error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to create order' }, { status: 500 });
  }
}
