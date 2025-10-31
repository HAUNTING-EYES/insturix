import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
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
    
    const { amount = 500, currency = 'INR', referralCode } = await req.json();
    
    // Check if this is a Player (GameOn) or Attendee (Event Pass)
    const player = await Player.findOne({ clerkUserId: userId });
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    
    if (!player && !attendee) {
      return NextResponse.json({ ok: false, message: 'User not found' }, { status: 404 });
    }

    // Determine which model to use (Player takes priority for GameOn payments)
    const isPlayerPayment = !!player && amount === 500;
    const record = isPlayerPayment ? player : attendee;
    
    if (!record) {
      return NextResponse.json({ ok: false, message: isPlayerPayment ? 'Player not found' : 'Attendee not found' }, { status: 404 });
    }
    
    // Handle referral code for both Players and Attendees
    if (referralCode && (!record.referredBy || record.referredBy.confirmed !== true)) {
      const normCode = String(referralCode).trim().toLowerCase();
      if (isPlayerPayment) {
        const referrer = await Player.findOne({ 'cashbacks.referral.code': normCode });
        if (referrer && referrer.clerkUserId !== record.clerkUserId) {
          record.referredBy = { code: normCode, referrerUserId: referrer.clerkUserId, confirmed: false } as any;
          await record.save();
        }
      } else {
        const referrer = await Attendee.findOne({ 'cashback.referral.code': normCode });
        if (referrer && referrer.clerkUserId !== record.clerkUserId) {
          record.referredBy = { code: normCode, referrerUserId: referrer.clerkUserId, confirmed: false } as any;
          await record.save();
        }
      }
    }
    
    const order = await razorpay.orders.create({ 
      amount: amount * 100, 
      currency, 
      receipt: `ics25_${isPlayerPayment ? 'player' : 'attendee'}_${Date.now()}`, 
      notes: { 
        clerkUserId: userId, 
        referralCode: record?.referredBy?.code || '',
        type: isPlayerPayment ? 'player' : 'attendee'
      } 
    } as any);

    record.payment = {
      status: 'pending',
      orderId: order.id,
      amount,
      currency,
    } as any;
    await record.save();

    return NextResponse.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (e: any) {
    console.error('ICS25 create-order error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to create order' }, { status: 500 });
  }
}
