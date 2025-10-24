import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Creator from '@/schemas/ics25/Creator';
import Razorpay from 'razorpay';
import { createRefund } from '@/lib/services/paymentService';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID || '',
});

const TIER_PRICING: Record<string, number> = {
  bronze: 0,
  silver: 2500,
  gold: 5000,
  creators: 3000,
};

const VALID_UPGRADES: Record<string, string[]> = {
  bronze: ['silver', 'gold', 'creators'],
  silver: ['gold', 'creators'],
  gold: ['creators'],
};

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    const { targetTier } = await req.json();

    // Validate target tier
    if (!targetTier || !['bronze', 'silver', 'gold', 'creators'].includes(targetTier)) {
      return NextResponse.json({ ok: false, message: 'Invalid target tier' }, { status: 400 });
    }

    // Get current attendee
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

    const currentTier = attendee.attendeePassTier;

    // Check if attendee has paid (Bronze is free, so no payment check needed)
    if (currentTier !== 'bronze' && attendee.payment?.status !== 'paid') {
      return NextResponse.json({ ok: false, message: 'Payment required before upgrading' }, { status: 400 });
    }

    // Validate upgrade path
    if (!VALID_UPGRADES[currentTier]?.includes(targetTier)) {
      return NextResponse.json({ ok: false, message: 'Invalid upgrade path' }, { status: 400 });
    }

    // Check if trying to upgrade to creators - must have approved application
    if (targetTier === 'creators') {
      // Check if they have an approved creator application
      const creatorApp = await Creator.findOne({ clerkUserId: userId });
      
      if (!creatorApp || creatorApp.status !== 'approved') {
        return NextResponse.json({ 
          ok: false, 
          message: 'Please use the creator application form to upgrade to Creators Pass' 
        }, { status: 400 });
      }
    }

    const currentPrice = TIER_PRICING[currentTier];
    const targetPrice = TIER_PRICING[targetTier];
    const priceDiff = targetPrice - currentPrice;

    // If upgrade requires additional payment
    if (priceDiff > 0) {
      // Create Razorpay order for the difference
      const receipt = `upgrade_${currentTier}_to_${targetTier}_${Date.now()}`;
      
      try {
        const razorpayOrder = await razorpay.orders.create({
          amount: priceDiff * 100, // Convert to paise
          currency: 'INR',
          receipt,
          notes: {
            clerkUserId: userId,
            type: 'upgrade',
            fromTier: currentTier,
            toTier: targetTier,
          },
        } as any);

        // Store upgrade intent
        attendee.upgradeIntent = {
          targetTier,
          orderId: razorpayOrder.id,
          amount: priceDiff,
          status: 'pending',
        } as any;
        await attendee.save();

        return NextResponse.json({
          ok: true,
          requiresPayment: true,
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        });
      } catch (e: any) {
        console.error('Razorpay order creation failed:', e);
        return NextResponse.json({
          ok: false,
          message: 'Failed to create payment order',
        }, { status: 500 });
      }
    }

    // If no additional payment required (shouldn't happen for valid upgrades, but handle it)
    attendee.attendeePassTier = targetTier;
    await attendee.save();

    return NextResponse.json({
      ok: true,
      requiresPayment: false,
      message: 'Upgrade successful',
    });
  } catch (e: any) {
    console.error('Upgrade error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Upgrade failed',
    }, { status: 500 });
  }
}
