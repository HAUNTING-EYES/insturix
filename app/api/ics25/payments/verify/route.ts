import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
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
    const player = await Player.findOne({ clerkUserId: userId });
    if (!player) return NextResponse.json({ ok: false, message: 'Player not found' }, { status: 404 });
    if (!player.payment || player.payment.orderId !== orderId) {
      return NextResponse.json({ ok: false, message: 'Order mismatch' }, { status: 400 });
    }
    player.payment.status = 'paid';
    player.payment.paymentId = paymentId;
    player.payment.signature = signature;
    player.payment.paidAt = new Date();
    // Confirm referral attribution on successful payment
    if (player.referredBy?.referrerUserId && player.referredBy.confirmed !== true) {
      const referrer = await Player.findOne({ clerkUserId: player.referredBy.referrerUserId });
      if (referrer) {
        const ids = new Set<string>(referrer.cashbacks?.referral?.referredUserIds || []);
        ids.add(player.clerkUserId);
        referrer.cashbacks = referrer.cashbacks || ({} as any);
        referrer.cashbacks.referral = referrer.cashbacks.referral || ({} as any);
        referrer.cashbacks.referral.referredUserIds = Array.from(ids);
        referrer.cashbacks.referral.referredCount = referrer.cashbacks.referral.referredUserIds.length;
        if (referrer.cashbacks.referral.referredCount >= 3) referrer.cashbacks.referral.qualified = true;
        await referrer.save();
        player.referredBy.confirmed = true;
      }
    }
    await player.save();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('ICS25 verify error:', e);
    return NextResponse.json({ ok: false, message: e.message || 'Verification failed' }, { status: 500 });
  }
}
