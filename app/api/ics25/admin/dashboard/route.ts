import { NextRequest, NextResponse } from "next/server";
import { verifyAdminForApi } from "@/lib/auth/adminAuth";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Ics25Player from "@/schemas/ics25/Player";
import Ics25Attendee from "@/schemas/ics25/Attendee";
import Ics25Creator from "@/schemas/ics25/Creator";
import Ics25PromoReel from "@/schemas/ics25/PromoReelSubmission";
import Ics25LinkedInPromo from "@/schemas/ics25/LinkedInSubmission";
import Ics25BronzePromotion from "@/schemas/ics25/BronzePromotionSubmission";
import { ICS25_PASS_PRICES, ICS25_GAMEON_PRICE } from "@/lib/ics25/constants";

export async function GET(req: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    await getIcs25Db();

    // Fetch GameOn data
    const allPlayers = await Ics25Player.find({}).lean();
    const gameOnPlayers = allPlayers.filter((p: any) => p.game); // Has selected a game

    const valorantPlayers = gameOnPlayers.filter((p: any) => p.game === 'valorant');
    const bgmiPlayers = gameOnPlayers.filter((p: any) => p.game === 'bgmi');

    const gameOnData = {
      totalPlayers: gameOnPlayers.length,
      byGame: {
        valorant: {
          total: valorantPlayers.length,
          paid: valorantPlayers.filter((p: any) => p.payment?.status === 'paid').length,
          pending: valorantPlayers.filter((p: any) => p.payment?.status === 'pending').length,
        },
        bgmi: {
          total: bgmiPlayers.length,
          paid: bgmiPlayers.filter((p: any) => p.payment?.status === 'paid').length,
          pending: bgmiPlayers.filter((p: any) => p.payment?.status === 'pending').length,
        },
      },
      byPaymentStatus: {
        paid: gameOnPlayers.filter((p: any) => p.payment?.status === 'paid').length,
        pending: gameOnPlayers.filter((p: any) => p.payment?.status === 'pending').length,
      },
      cashbackTasks: {
        // Aggregated across promo reel and LinkedIn submissions
        total:
          (await Ics25PromoReel.countDocuments({})) +
          (await Ics25LinkedInPromo.countDocuments({})),
        pending:
          (await Ics25PromoReel.countDocuments({ status: 'submitted' })) +
          (await Ics25LinkedInPromo.countDocuments({ status: 'submitted' })),
        approved:
          (await Ics25PromoReel.countDocuments({ status: 'verified' })) +
          (await Ics25LinkedInPromo.countDocuments({ status: 'verified' })),
      },
      pricing: { perRegistration: ICS25_GAMEON_PRICE },
    } as const;

    // Fetch Passes data
    const allAttendees = await Ics25Attendee.find({}).lean();

    // Filter out attendees with rejected or failed payment status for total count
    const validAttendees = allAttendees.filter((a: any) => {
      const status = a.payment?.status;
      return status !== 'rejected' && status !== 'failed';
    });

    const tiers: Array<"bronze" | "silver" | "gold" | "platinum" | "creators"> = [
      'bronze',
      'silver',
      'gold',
      'platinum',
      'creators',
    ];

    const byTier = tiers.reduce((acc, t) => {
      const list = validAttendees.filter((a: any) => a.attendeePassTier === t);
      const paid = list.filter((a: any) => a.payment?.status === 'paid').length;
      const pending = list.filter((a: any) => a.payment?.status === 'pending').length;
      (acc as any)[t] = { total: list.length, paid, pending };
      return acc;
    }, {} as Record<string, { total: number; paid: number; pending: number }>);

    const passesData = {
      totalAttendees: validAttendees.length,
      byTier,
      byPaymentStatus: {
        paid: validAttendees.filter((a: any) => a.payment?.status === 'paid').length,
        pending: validAttendees.filter((a: any) => a.payment?.status === 'pending').length,
      },
      pricing: ICS25_PASS_PRICES,
    } as const;

    // Fetch Creator applications data
    const creatorData = {
      total: await Ics25Creator.countDocuments({}),
      pending: await Ics25Creator.countDocuments({ status: 'pending' }),
      approved: await Ics25Creator.countDocuments({ status: 'approved' }),
      rejected: await Ics25Creator.countDocuments({ status: 'rejected' }),
    };

    // Fetch pending approvals
    const promoReelSubmissions = await Ics25PromoReel.find({ status: 'submitted' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    const linkedinSubmissions = await Ics25LinkedInPromo.find({ status: 'submitted' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    const bronzePassSubmissions = await Ics25BronzePromotion.find({ status: 'submitted' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    const creatorApplications = await Ics25Creator.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      ok: true,
      data: {
        gameOn: gameOnData,
        passes: passesData,
        creators: creatorData,
        approvals: {
          bronzePromotionsPending: await Ics25BronzePromotion.countDocuments({ status: 'submitted' }),
          creatorUpgradesPending: await Ics25Creator.countDocuments({ status: 'pending' }),
          // Keep detailed lists available for future expansion if needed
          lists: {
            promoReel: promoReelSubmissions.map((s: any) => ({
              _id: s._id.toString(),
              name: s.name,
              instagram: s.instagram,
              proofUrl: s.proofUrl,
              amount: s.amount,
              createdAt: s.createdAt,
            })),
            linkedin: linkedinSubmissions.map((s: any) => ({
              _id: s._id.toString(),
              name: s.name,
              instagram: s.instagram,
              proofUrl: s.proofUrl,
              amount: s.amount,
              createdAt: s.createdAt,
            })),
            bronzePass: bronzePassSubmissions.map((s: any) => ({
              _id: s._id.toString(),
              name: s.name,
              email: s.email,
              instagramProofUrl: s.instagramProofUrl,
              linkedinProofUrl: s.linkedinProofUrl,
              createdAt: s.createdAt,
            })),
            creators: creatorApplications.map((c: any) => ({
              _id: c._id.toString(),
              name: c.name,
              email: c.email,
              profession: c.profession,
              instagram: c.instagram,
              linkedin: c.linkedin,
              createdAt: c.createdAt,
            })),
          },
        },
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("ICS25 Dashboard API Error:", error);
    return NextResponse.json(
      { ok: false, message: error.message || "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
