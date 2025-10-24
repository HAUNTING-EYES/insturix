import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';

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
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });

  const { amount = 500, currency = 'INR', referralCode } = await req.json();
    // Attach/override referral code from payment section if provided (only if not confirmed yet)
    if (referralCode && (!attendee.referredBy || attendee.referredBy.confirmed !== true)) {
      const normCode = String(referralCode).trim().toLowerCase();
      const referrer = await Attendee.findOne({ 'cashback.referral.code': normCode });
      if (referrer && referrer.clerkUserId !== attendee.clerkUserId) {
        attendee.referredBy = { code: normCode, referrerUserId: referrer.clerkUserId, confirmed: false } as any;
        await attendee.save();
      }
    }
    const order = await razorpay.orders.create({ amount: amount * 100, currency, receipt: `ics25_${Date.now()}`, notes: { clerkUserId: userId, referralCode: attendee?.referredBy?.code || '' } } as any);

    attendee.payment = {
      status: 'pending',
      orderId: order.id,
      amount,
      currency,
    } as any;
    await attendee.save();

    return NextResponse.json({ ok: true, orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID });
  } catch (e: any) {
    console.error('ICS25 create-order error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Failed to create order' }, { status: 500 });
  }
}
