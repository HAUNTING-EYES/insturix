import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Creator from '@/schemas/ics25/Creator';
import { createRefund } from '@/lib/services/paymentService';

const TIER_PRICING: Record<string, number> = {
  bronze: 0,
  silver: 2500,
  gold: 5000,
  creators: 3000,
};

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    
    // TODO: Add admin role check here
    // For now, any authenticated user can approve (should be restricted to admins)
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    const { creatorUserId, approved, rejectionReason } = await req.json();

    if (!creatorUserId) {
      return NextResponse.json({ ok: false, message: 'Missing creatorUserId' }, { status: 400 });
    }

    // Get creator application
    const creator = await Creator.findOne({ clerkUserId: creatorUserId });
    if (!creator) {
      return NextResponse.json({ ok: false, message: 'Creator application not found' }, { status: 404 });
    }

    // Get attendee
    const attendee = await Attendee.findOne({ clerkUserId: creatorUserId });
    if (!attendee) {
      return NextResponse.json({ ok: false, message: 'Attendee not found' }, { status: 404 });
    }

    if (approved) {
      // Approve the creator application
      creator.status = 'approved';
      creator.reviewedAt = new Date();
      creator.reviewedBy = userId; // Admin who approved
      await creator.save();

      const currentTier = attendee.attendeePassTier;
      const currentPrice = TIER_PRICING[currentTier];
      const creatorPrice = TIER_PRICING.creators;
      const priceDiff = creatorPrice - currentPrice;

      // Update attendee tier to creators
      attendee.attendeePassTier = 'creators';

      // If upgrading from Gold (refund scenario)
      if (currentTier === 'gold' && priceDiff < 0) {
        const refundAmount = Math.abs(priceDiff);
        
        // Get the original payment ID from attendee
        const originalPaymentId = attendee.payment?.paymentId;
        
        if (originalPaymentId) {
          try {
            // Process refund via Razorpay
            const refundResult = await createRefund({
              paymentId: originalPaymentId,
              amount: refundAmount * 100, // Convert to paise
              currency: 'INR',
              reason: 'Upgrade from Gold to Creators Pass',
              notes: {
                clerkUserId: creatorUserId,
                fromTier: currentTier,
                toTier: 'creators',
                refundAmount: refundAmount.toString(),
              },
            });

            // Store refund information
            if (!attendee.refunds) {
              attendee.refunds = [] as any;
            }
            (attendee.refunds as any[]).push({
              paymentId: originalPaymentId,
              refundId: (refundResult as any).id || 'pending',
              amount: refundAmount,
              reason: 'Upgrade from Gold to Creators Pass',
              status: 'processed',
              processedAt: new Date(),
            });

            await attendee.save();

            return NextResponse.json({
              ok: true,
              message: 'Creator approved and refund processed',
              refundAmount,
              refundId: (refundResult as any).id,
            });
          } catch (refundError: any) {
            console.error('Refund processing failed:', refundError);
            
            // Still approve and update tier, but notify about refund failure
            await attendee.save();
            
            return NextResponse.json({
              ok: true,
              message: 'Creator approved but refund processing failed. Manual refund required.',
              error: refundError.message,
              requiresManualRefund: true,
              refundAmount,
            });
          }
        } else {
          // No payment ID found, manual refund required
          await attendee.save();
          
          return NextResponse.json({
            ok: true,
            message: 'Creator approved but no payment ID found for refund. Manual refund required.',
            requiresManualRefund: true,
            refundAmount,
          });
        }
      } else {
        // For Bronze→Creators or Silver→Creators (no refund needed)
        await attendee.save();
        
        return NextResponse.json({
          ok: true,
          message: 'Creator application approved',
        });
      }
    } else {
      // Reject the creator application
      creator.status = 'rejected';
      creator.reviewedAt = new Date();
      creator.reviewedBy = userId;
      creator.rejectionReason = rejectionReason || 'Did not meet eligibility requirements';
      await creator.save();

      return NextResponse.json({
        ok: true,
        message: 'Creator application rejected',
      });
    }
  } catch (e: any) {
    console.error('Approve creator upgrade error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Approval failed',
    }, { status: 500 });
  }
}
