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

    const { type, id, action } = await req.json();

    if (!type || !id || !action) {
      return NextResponse.json(
        { ok: false, message: "Missing required fields" },
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
        const submission = await Ics25BronzePromotion.findByIdAndUpdate(
          id,
          { 
            status: newStatus, 
            reviewedAt: new Date(),
            reviewedBy: adminCheck.email || adminCheck.userId!
          },
          { new: true }
        );

        if (!submission) {
          return NextResponse.json(
            { ok: false, message: "Submission not found" },
            { status: 404 }
          );
        }

        // Update attendee's bronze promotion status if approved
        if (action === 'approve' && submission.clerkUserId) {
          await Ics25Attendee.findOneAndUpdate(
            { clerkUserId: submission.clerkUserId },
            {
              'bronzePromotion.status': 'verified',
              'bronzePromotion.submittedAt': submission.createdAt,
            }
          );
        }

        break;
      }

      case 'creator': {
        const creator = await Ics25Creator.findByIdAndUpdate(
          id,
          {
            status: action === 'approve' ? 'approved' : 'rejected',
            reviewedAt: new Date(),
            reviewedBy: adminCheck.email || adminCheck.userId!,
          },
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
