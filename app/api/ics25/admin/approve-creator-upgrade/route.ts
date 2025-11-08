import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Attendee from '@/schemas/ics25/Attendee';
import Creator from '@/schemas/ics25/Creator';
import { createRefund } from '@/lib/services/paymentService';

const TIER_PRICING: Record<string, number> = {
  bronze: 0,
  silver: 0,
  gold: 2500,
  platinum: 5000,
  creators: 3000,
};

export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
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
      creator.reviewedBy = adminCheck.email || adminCheck.userId!; // Admin who approved
      await creator.save();

      const currentTier = attendee.attendeePassTier;
      const currentPrice = TIER_PRICING[currentTier];
      const creatorPrice = TIER_PRICING.creators;
      const priceDiff = creatorPrice - currentPrice;

      // Update attendee tier to creators - use both updateOne and then reload to ensure persistence
      const updateResult = await Attendee.updateOne(
        { clerkUserId: creatorUserId },
        { $set: { attendeePassTier: 'creators' } }
      );

      if (updateResult.matchedCount === 0) {
        return NextResponse.json({ ok: false, message: 'Attendee not found for update' }, { status: 404 });
      }

      // Reload attendee to get updated data and verify
      const updatedAttendee = await Attendee.findOne({ clerkUserId: creatorUserId });
      if (!updatedAttendee) {
        return NextResponse.json({ ok: false, message: 'Failed to reload attendee after update' }, { status: 500 });
      }

      // Verify the update worked
      if (updatedAttendee.attendeePassTier !== 'creators') {
        return NextResponse.json({ 
          ok: false, 
          message: `Tier update verification failed - tier is still ${updatedAttendee.attendeePassTier}` 
        }, { status: 500 });
      }

      // If upgrading from Platinum (refund scenario) - Platinum costs more than Creators
      if (currentTier === 'platinum' && priceDiff < 0) {
        const refundAmount = Math.abs(priceDiff);
        
        // Get the original payment ID from updatedAttendee (or original attendee for payment ID)
        const originalPaymentId = updatedAttendee.payment?.paymentId || attendee.payment?.paymentId;
        
        if (originalPaymentId) {
          try {
            // Process refund via Razorpay
            const refundResult = await createRefund({
              paymentId: originalPaymentId,
              amount: refundAmount * 100, // Convert to paise
              currency: 'INR',
              reason: 'Upgrade from Platinum to Creators Pass',
              notes: {
                clerkUserId: creatorUserId,
                fromTier: currentTier,
                toTier: 'creators',
                refundAmount: refundAmount.toString(),
              },
            });

            // Store refund information
            if (!updatedAttendee.refunds) {
              updatedAttendee.refunds = [] as any;
            }
            (updatedAttendee.refunds as any[]).push({
              paymentId: originalPaymentId,
              refundId: (refundResult as any).id || 'pending',
              amount: refundAmount,
              reason: 'Upgrade from Platinum to Creators Pass',
              status: 'processed',
              processedAt: new Date(),
            });

            await updatedAttendee.save();

            return NextResponse.json({
              ok: true,
              message: 'Creator approved and refund processed',
              refundAmount,
              refundId: (refundResult as any).id,
              updatedTier: updatedAttendee.attendeePassTier,
            });
          } catch (refundError: any) {
            console.error('Refund processing failed:', refundError);
            
            // Still approve and update tier, but notify about refund failure
            // Tier already updated above, just save refund failure info
            if (!updatedAttendee.refunds) {
              updatedAttendee.refunds = [] as any;
            }
            (updatedAttendee.refunds as any[]).push({
              paymentId: originalPaymentId,
              amount: refundAmount,
              reason: 'Upgrade from Platinum to Creators Pass',
              status: 'failed',
              processedAt: new Date(),
            });
            await updatedAttendee.save();
            
            return NextResponse.json({
              ok: true,
              message: 'Creator approved but refund processing failed. Manual refund required.',
              error: refundError.message,
              requiresManualRefund: true,
              refundAmount,
              updatedTier: updatedAttendee.attendeePassTier,
            });
          }
        } else {
          // No payment ID found, manual refund required
          // Tier already updated above, no additional save needed
          
          return NextResponse.json({
            ok: true,
            message: 'Creator approved but no payment ID found for refund. Manual refund required.',
            requiresManualRefund: true,
            refundAmount,
            updatedTier: updatedAttendee.attendeePassTier,
          });
        }
      } else {
        // For Bronze→Creators, Silver→Creators, or Gold→Creators (no refund needed)
        // Tier already updated above using findOneAndUpdate, no additional save needed
        
        return NextResponse.json({
          ok: true,
          message: 'Creator application approved',
          updatedTier: updatedAttendee.attendeePassTier,
        });
      }
    } else {
      // Reject the creator application
      creator.status = 'rejected';
      creator.reviewedAt = new Date();
      creator.reviewedBy = adminCheck.email || adminCheck.userId!;
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
