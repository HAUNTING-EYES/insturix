import { NextRequest, NextResponse } from "next/server";
import { verifyAdminForApi } from "@/lib/auth/adminAuth";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Ics25Player from "@/schemas/ics25/Player";
import Ics25Attendee from "@/schemas/ics25/Attendee";
import Ics25Creator from "@/schemas/ics25/Creator";
import Ics25PromoReel from "@/schemas/ics25/PromoReelSubmission";
import Ics25LinkedInPromo from "@/schemas/ics25/LinkedInSubmission";
import Ics25BronzePromotion from "@/schemas/ics25/BronzePromotionSubmission";

export async function POST(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await getIcs25Db();

    const { type, id, action, rejectionReason } = await req.json();
    const trimmedReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : undefined;

    if (!type || !id || !action) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { ok: false, message: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'reject' && !trimmedReason) {
      return NextResponse.json(
        { ok: false, message: 'rejectionReason is required when rejecting' },
        { status: 400 }
      );
    }

    const newStatus = action === 'approve' ? 'verified' : 'rejected';

    switch (type) {
      case 'promoReel': {
        const submission = await Ics25PromoReel.findByIdAndUpdate(
          id,
          { status: newStatus, reviewedAt: new Date() },
          { new: true }
        );

        if (!submission) {
          return NextResponse.json(
            { ok: false, message: "Submission not found" },
            { status: 404 }
          );
        }

        // Update player's cashback status if approved
        if (action === 'approve' && submission.playerId) {
          await Ics25Player.findByIdAndUpdate(submission.playerId, {
            'cashbacks.promoReel.status': 'verified',
            'cashbacks.promoReel.verifiedAt': new Date(),
          });
        }

        break;
      }

      case 'linkedin': {
        const submission = await Ics25LinkedInPromo.findByIdAndUpdate(
          id,
          { status: newStatus, reviewedAt: new Date() },
          { new: true }
        );

        if (!submission) {
          return NextResponse.json(
            { ok: false, message: "Submission not found" },
            { status: 404 }
          );
        }

        // Update player's cashback status if approved
        if (action === 'approve' && submission.playerId) {
          await Ics25Player.findByIdAndUpdate(submission.playerId, {
            'cashbacks.linkedinPost.status': 'verified',
            'cashbacks.linkedinPost.verifiedAt': new Date(),
          });
        }

        break;
      }

      case 'bronzePass': {
        const reviewerId = adminCheck.email || adminCheck.userId!;
        const reviewTimestamp = new Date();
        const submission = await Ics25BronzePromotion.findByIdAndUpdate(
          id,
          { 
            status: newStatus, 
            reviewedAt: reviewTimestamp,
            reviewedBy: reviewerId,
            rejectionReason: action === 'approve' ? undefined : trimmedReason,
          },
          { new: true }
        );

        if (!submission) {
          return NextResponse.json(
            { ok: false, message: "Submission not found" },
            { status: 404 }
          );
        }

        if (submission.clerkUserId) {
          const attendeeSet: Record<string, any> = {
            'bronzePromotion.status': newStatus,
            'bronzePromotion.reviewedAt': reviewTimestamp,
            'bronzePromotion.reviewedBy': reviewerId,
          };

          if (submission.instagramProofUrl) {
            attendeeSet['bronzePromotion.instagramProofUrl'] = submission.instagramProofUrl;
          }
          if (submission.linkedinProofUrl) {
            attendeeSet['bronzePromotion.linkedinProofUrl'] = submission.linkedinProofUrl;
          }
          if (submission.createdAt) {
            attendeeSet['bronzePromotion.submittedAt'] = submission.createdAt;
          }

          const attendeeUpdateQuery: Record<string, any> = { $set: attendeeSet };

          if (action === 'reject') {
            attendeeUpdateQuery.$set['bronzePromotion.rejectionReason'] = trimmedReason ?? 'Rejected by admin';
          } else {
            attendeeUpdateQuery.$unset = { 'bronzePromotion.rejectionReason': '' };
          }

          await Ics25Attendee.findOneAndUpdate(
            { clerkUserId: submission.clerkUserId },
            attendeeUpdateQuery
          );
        }

        break;
      }

      case 'creator': {
        const reviewerId = adminCheck.email || adminCheck.userId!;
        const reviewTimestamp = new Date();
        const creatorSet: Record<string, any> = {
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewedAt: reviewTimestamp,
          reviewedBy: reviewerId,
        };
        const creatorUpdate: Record<string, any> = { $set: creatorSet };

        if (action === 'approve') {
          creatorUpdate.$unset = { rejectionReason: '' };
        } else {
          creatorUpdate.$set.rejectionReason = trimmedReason ?? 'Application rejected by admin';
        }

        const creator = await Ics25Creator.findByIdAndUpdate(
          id,
          creatorUpdate,
          { new: true }
        );

        if (!creator) {
          return NextResponse.json(
            { ok: false, message: "Creator not found" },
            { status: 404 }
          );
        }

        break;
      }

      default:
        return NextResponse.json(
          { ok: false, message: "Invalid approval type" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully ${action === 'approve' ? 'approved' : 'rejected'}`,
    });

  } catch (error: any) {
    console.error("Approval API Error:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "Failed to process approval" },
      { status: 500 }
    );
  }
}
