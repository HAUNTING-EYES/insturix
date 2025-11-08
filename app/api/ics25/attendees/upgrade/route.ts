import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Creator from '@/schemas/ics25/Creator';
import Razorpay from 'razorpay';
import { createRefund } from '@/lib/services/paymentService';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';
import { sendTicketConfirmationEmail } from '@/lib/services/email';
import { hasEmailBeenSent, markEmailSent } from '@/lib/services/email/ticket-email-tracking';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_SECRET_KEY_ID || '',
});

const TIER_PRICING: Record<string, number> = {
  bronze: 0,
  silver: 0,
  gold: 2500,
  platinum: 5000,
  creators: 3000,
};

const VALID_UPGRADES: Record<string, string[]> = {
  bronze: ['gold', 'platinum', 'creators'], // Silver upgrade only via bronze creator tasks promotion
  silver: ['gold', 'platinum', 'creators'],
  gold: ['platinum', 'creators'],
  platinum: ['creators'],
};

/**
 * Helper function to send ticket confirmation email after free upgrade
 */
async function sendConfirmationEmailIfNeeded(attendee: any, userId: string): Promise<void> {
  try {
    if (!hasEmailBeenSent(attendee, 'confirmation')) {
      // Connect to production database to get user details
      await connectToDatabase();
      
      // Get user details for email
      const user = await User.findOne({ clerkUserId: userId }).lean();
      const userName = user?.username || attendee.name || 'Valued User';
      const userEmail = user?.email || attendee.email;
      
      if (userEmail) {
        const ticketId = `TICKET-${(attendee._id as any).toString().slice(-8).toUpperCase()}`;
        const eventDetails = "Insturix Creator's Summit 2025";
        
        const emailResult = await sendTicketConfirmationEmail(
          userEmail,
          userName,
          ticketId,
          eventDetails
        );
        
        if (emailResult.success) {
          await markEmailSent(attendee, 'confirmation');
          console.log(`✅ Ticket confirmation email sent to ${userEmail} after free upgrade`);
        } else {
          console.error(`❌ Failed to send ticket confirmation email to ${userEmail}:`, emailResult.error);
        }
      }
    }
  } catch (emailError: any) {
    // Don't fail the upgrade if email fails
    console.error('Error sending ticket confirmation email after free upgrade:', emailError);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    const { targetTier } = await req.json();

    // Validate target tier
    if (!targetTier || !['bronze', 'silver', 'gold', 'platinum', 'creators'].includes(targetTier)) {
      return NextResponse.json({ ok: false, message: 'Invalid target tier' }, { status: 400 });
    }

    // Get current attendee
    const attendee = await Attendee.findOne({ clerkUserId: userId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

    const currentTier = attendee.attendeePassTier;

    // Check if attendee has paid (Bronze and Silver are free, so no payment check needed)
    // Also check for upgradePayments - users who upgraded via upgradePayments should be allowed to upgrade further
    const hasMainPayment = attendee.payment?.status === 'paid';
    const upgradePayments = attendee.upgradePayments;
    const hasUpgradePayments = upgradePayments && Array.isArray(upgradePayments) && upgradePayments.length > 0;
    const hasPaidForCurrentTier = hasMainPayment || hasUpgradePayments;

    if (currentTier !== 'bronze' && currentTier !== 'silver' && !hasPaidForCurrentTier) {
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
    const refundAmount = priceDiff < 0 ? Math.abs(priceDiff) : 0;
    const refundReason = `Upgrade from ${currentTier} to ${targetTier}`;
    const paymentId = attendee.payment?.paymentId;
    const paymentCurrency = attendee.payment?.currency || 'INR';
    const refunds = Array.isArray(attendee.refunds)
      ? attendee.refunds
      : (attendee.refunds = [] as any);
    const alreadyRefunded = refundAmount > 0 && refunds.some((entry: any) => {
      if (!entry) return false;
      const samePayment = entry.paymentId && paymentId && entry.paymentId === paymentId;
      const sameReason = entry.reason === refundReason;
      const processed = entry.status === 'processed';
      return (!!paymentId ? samePayment : sameReason) && processed && entry.amount === refundAmount;
    });

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

    // No additional payment required; handle potential refund flows for downgrades
    attendee.attendeePassTier = targetTier;

    if (refundAmount > 0 && !alreadyRefunded) {
      if (!paymentId) {
        await attendee.save();
        // Send confirmation email for free upgrade
        await sendConfirmationEmailIfNeeded(attendee, userId);
        return NextResponse.json({
          ok: true,
          requiresPayment: false,
          refundInitiated: false,
          requiresManualRefund: true,
          message: 'Upgrade successful, please contact support for manual refund processing',
          refundAmount,
        });
      }

      try {
        const refund = await createRefund({
          paymentId,
          amount: refundAmount * 100,
          currency: paymentCurrency,
          reason: refundReason,
          notes: {
            clerkUserId: userId,
            fromTier: currentTier,
            toTier: targetTier,
            refundAmount: refundAmount.toString(),
          },
        });

        refunds.push({
          paymentId,
          refundId: (refund as any)?.id || 'pending',
          amount: refundAmount,
          reason: refundReason,
          status: 'processed',
          processedAt: new Date(),
        });

        attendee.markModified?.('refunds');

        if (typeof attendee.payment?.amount === 'number') {
          attendee.payment.amount = Math.max(0, attendee.payment.amount - refundAmount);
          attendee.markModified?.('payment');
        }

        await attendee.save();

        // Send confirmation email for free upgrade
        await sendConfirmationEmailIfNeeded(attendee, userId);

        return NextResponse.json({
          ok: true,
          requiresPayment: false,
          refundInitiated: true,
          refundAmount,
          message: 'Upgrade successful and refund initiated',
        });
      } catch (error: any) {
        console.error('Refund processing failed during upgrade:', error);
        refunds.push({
          paymentId,
          amount: refundAmount,
          reason: refundReason,
          status: 'failed',
          processedAt: new Date(),
        });
        attendee.markModified?.('refunds');
        await attendee.save();

        // Send confirmation email for free upgrade
        await sendConfirmationEmailIfNeeded(attendee, userId);

        return NextResponse.json({
          ok: true,
          requiresPayment: false,
          refundInitiated: false,
          requiresManualRefund: true,
          refundAmount,
          message: 'Upgrade successful, but refund could not be processed automatically. Support has been alerted.',
          error: error?.message || 'Refund processing failed',
        });
      }
    }

    await attendee.save();

    // Send confirmation email for free upgrade
    await sendConfirmationEmailIfNeeded(attendee, userId);

    return NextResponse.json({
      ok: true,
      requiresPayment: false,
      message: 'Upgrade successful',
      refundInitiated: alreadyRefunded,
      refundAmount: alreadyRefunded ? refundAmount : undefined,
    });
  } catch (e: any) {
    console.error('Upgrade error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Upgrade failed',
    }, { status: 500 });
  }
}
