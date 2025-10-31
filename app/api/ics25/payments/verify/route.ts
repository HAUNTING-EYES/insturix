import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Player from '@/schemas/ics25/Player';

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
    
    // Check both Player and Attendee models
    const player = await Player.findOne({ clerkUserId: userId });
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    
    // Determine which record has this orderId
    let record: any = null;
    let isPlayer = false;
    
    if (player?.payment?.orderId === orderId) {
      record = player;
      isPlayer = true;
    } else if (attendee?.payment?.orderId === orderId) {
      record = attendee;
      isPlayer = false;
    }
    
    if (!record) {
      return NextResponse.json({ ok: false, message: 'Payment record not found' }, { status: 404 });
    }
    
    if (!record.payment || record.payment.orderId !== orderId) {
      return NextResponse.json({ ok: false, message: 'Order mismatch' }, { status: 400 });
    }
    
    // Update payment status
    record.payment.status = 'paid';
    record.payment.paymentId = paymentId;
    record.payment.signature = signature;
    record.payment.paidAt = new Date();
    
    // Confirm referral attribution on successful payment
    if (record.referredBy?.referrerUserId && record.referredBy.confirmed !== true) {
      if (isPlayer) {
        const referrer = await Player.findOne({ clerkUserId: record.referredBy.referrerUserId });
        if (referrer) {
          const ids = new Set<string>(referrer.cashbacks?.referral?.referredUserIds || []);
          ids.add(record.clerkUserId);
          referrer.cashbacks = referrer.cashbacks || ({} as any);
          referrer.cashbacks.referral = referrer.cashbacks.referral || ({} as any);
          referrer.cashbacks.referral.referredUserIds = Array.from(ids);
          referrer.cashbacks.referral.referredCount = referrer.cashbacks.referral.referredUserIds.length;
          if (referrer.cashbacks.referral.referredCount >= 3) referrer.cashbacks.referral.qualified = true;
          await referrer.save();
          record.referredBy.confirmed = true;
        }
      } else {
        const referrer = await Attendee.findOne({ clerkUserId: record.referredBy.referrerUserId });
        if (referrer) {
          const ids = new Set<string>(referrer.cashback?.referral?.referredUserIds || []);
          ids.add(record.clerkUserId);
          referrer.cashback = referrer.cashback || ({} as any);
          referrer.cashback.referral = referrer.cashback.referral || ({} as any);
          referrer.cashback.referral.referredUserIds = Array.from(ids);
          referrer.cashback.referral.referredCount = referrer.cashback.referral.referredUserIds.length;
          if (referrer.cashback.referral.referredCount >= 3) referrer.cashback.referral.qualified = true;
          await referrer.save();
          record.referredBy.confirmed = true;
        }
      }
    }
    
    await record.save();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('ICS25 verify error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Verification failed' }, { status: 500 });
  }
}
