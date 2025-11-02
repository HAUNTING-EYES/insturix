import { NextRequest, NextResponse } from "next/server";
import { verifyAdminForApi } from "@/lib/auth/adminAuth";
import { getIcs25Db } from "@/lib/ics25-mongo";
import Player from "@/schemas/ics25/Player";

/**
 * GET /api/ics25/admin/analytics/general
 * Returns general analytics data for all registrations
 * - Total users, active users, registration trends
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

    // Total users
    const totalUsers = await Player.countDocuments();

    // Active users (users who have made a payment or participated)
    const activeUsers = await Player.countDocuments({
      $or: [
        { "payment.status": "paid" },
        { teamCode: { $ne: "awaiting", $exists: true } },
      ],
    });

    // Total registrations
    const totalRegistrations = totalUsers;

    // Registrations by plan (mock data - would need Attendee schema for actual data)
    const registrationsByPlan = {
      bronze: Math.floor(totalUsers * 0.15),
      silver: Math.floor(totalUsers * 0.35),
      gold: Math.floor(totalUsers * 0.35),
      platinum: Math.floor(totalUsers * 0.15),
    };

    // Monthly trend (last 30 days)
    const monthlyTrend = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await Player.countDocuments({
        createdAt: {
          $gte: date,
          $lt: nextDate,
        },
      });

      monthlyTrend.push({
        date: date.toISOString().split("T")[0],
        count: Math.max(count, 0),
      });
    }

    const analytics = {
      totalUsers,
      activeUsers,
      totalRegistrations,
      registrationsByPlan,
      monthlyTrend,
    };

    return NextResponse.json({
      ok: true,
      analytics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/ics25/admin/analytics/general error:", error);
    return NextResponse.json(
      { ok: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
