import { NextRequest, NextResponse } from "next/server";
import { verifyAdminForApi } from "@/lib/auth/adminAuth";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Player from "@/schemas/ics25/Player";
import Team from "@/schemas/ics25/Team";

/**
 * GET /api/ics25/admin/analytics
 * Returns ICS'25 event analytics data
 * - Requires admin authentication
 */
export async function GET(request: NextRequest) {
  // Verify admin access
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) {
    return adminCheck.response;
  }

  try {
    // Connect to database
    await getIcs25Db();

    // Fetch analytics data
    const totalRegistrations = await Player.countDocuments();

    const paidRegistrations = await Player.countDocuments({
      "payment.status": "paid",
    });

    const pendingRegistrations = totalRegistrations - paidRegistrations;

    // Count by game type
    const valorantCount = await Player.countDocuments({ game: "valorant" });
    const bgmiCount = await Player.countDocuments({ game: "bgmi" });

    // Count pass registrations from Attendee model if available
    let passRegistrations = 0;
    try {
      const Attendee = (await import("@/schemas/ics25/Attendee")).default;
      // Only count attendees with valid payment status (exclude rejected and failed)
      passRegistrations = await Attendee.countDocuments({
        'payment.status': { $nin: ['rejected', 'failed'] }
      });
    } catch {
      // Attendee schema not available, set to 0
      passRegistrations = 0;
    }

    const gameOnRegistrations = totalRegistrations;

    const stats = {
      totalRegistrations,
      passRegistrations,
      gameOnRegistrations,
      byGame: {
        valorant: valorantCount,
        bgmi: bgmiCount,
      },
      byStatus: {
        paid: paidRegistrations,
        pending: pendingRegistrations,
      },
    };

    return NextResponse.json({
      ok: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/ics25/admin/analytics error:", error);
    return NextResponse.json(
      { ok: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
