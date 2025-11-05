import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    const { orderId, paymentId, signature, targetTier } = await req.json();

    if (!orderId || !paymentId || !signature || !targetTier) {
      return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 });
    }

    // Get attendee
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

    // Verify Razorpay signature
    const razorpayKeySecret = process.env.RAZORPAY_SECRET_KEY_ID;
    if (!razorpayKeySecret) {
      return NextResponse.json({ ok: false, message: 'Payment service not configured' }, { status: 500 });
    }
    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (generatedSignature !== signature) {
      return NextResponse.json({ ok: false, message: 'Invalid signature' }, { status: 400 });
    }

    const intent = attendee.upgradeIntent;

    // Verify order matches the upgrade intent
    if (intent?.orderId !== orderId) {
      return NextResponse.json({ ok: false, message: 'Order mismatch' }, { status: 400 });
    }

    const intentAmount = intent?.amount ?? 0;
    const intentTargetTier = intent?.targetTier ?? targetTier;

    // Update attendee tier
    attendee.attendeePassTier = intentTargetTier;
    attendee.upgradeIntent = undefined as any; // Clear upgrade intent
    
    // Add upgrade payment to history if needed
    if (!attendee.upgradePayments) {
      attendee.upgradePayments = [] as any;
    }
    (attendee.upgradePayments as any[]).push({
      orderId,
      paymentId,
      signature,
      amount: intentAmount,
      targetTier: intentTargetTier,
      paidAt: new Date(),
    });

    await attendee.save();

    return NextResponse.json({
      ok: true,
      message: 'Upgrade verified and completed',
    });
  } catch (e: any) {
    console.error('Verify upgrade error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Verification failed',
    }, { status: 500 });
  }
}
