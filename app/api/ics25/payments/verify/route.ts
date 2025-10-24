import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    await getIcs25Db();
    const { orderId, paymentId, signature } = await req.json();
    if (!process.env.RAZORPAY_SECRET_KEY_ID) return NextResponse.json({ ok: false, message: 'Secret missing' }, { status: 500 });
    const computed = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET_KEY_ID)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (computed !== signature) {
      return NextResponse.json({ ok: false, message: 'Payment verification failed' }, { status: 400 });
    }
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    if (!attendee.payment || attendee.payment.orderId !== orderId) {
      return NextResponse.json({ ok: false, message: 'Order mismatch' }, { status: 400 });
    }
    attendee.payment.status = 'paid';
    attendee.payment.paymentId = paymentId;
    attendee.payment.signature = signature;
    attendee.payment.paidAt = new Date();
    // Confirm referral attribution on successful payment
    if (attendee.referredBy?.referrerUserId && attendee.referredBy.confirmed !== true) {
      const referrer = await Attendee.findOne({ clerkUserId: attendee.referredBy.referrerUserId });
      if (referrer) {
        const ids = new Set<string>(referrer.cashback?.referral?.referredUserIds || []);
        ids.add(attendee.clerkUserId);
        referrer.cashback = referrer.cashback || ({} as any);
        referrer.cashback.referral = referrer.cashback.referral || ({} as any);
        referrer.cashback.referral.referredUserIds = Array.from(ids);
        referrer.cashback.referral.referredCount = referrer.cashback.referral.referredUserIds.length;
        if (referrer.cashback.referral.referredCount >= 3) referrer.cashback.referral.qualified = true;
        await referrer.save();
        attendee.referredBy.confirmed = true;
      }
    }
    await attendee.save();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('ICS25 verify error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Verification failed' }, { status: 500 });
  }
}
