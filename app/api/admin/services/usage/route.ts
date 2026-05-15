/**
 * GET /api/admin/services/usage
 *
 * Admin endpoint: per-service event counts, active users,
 * and activity over 7d and 30d time windows.
 */

import { NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    const db = await getDatabase();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [serviceUsage7d, serviceUsage30d, activeUsers7d, dailyActivity] = await Promise.all([
      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: '$service',
            events: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
            lastEvent: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            service: '$_id',
            events: 1,
            activeUsers: { $size: '$uniqueUsers' },
            lastEvent: 1,
          },
        },
        { $sort: { events: -1 } },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: '$service',
            events: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' },
          },
        },
        {
          $project: {
            _id: 0,
            service: '$_id',
            events: 1,
            activeUsers: { $size: '$uniqueUsers' },
          },
        },
        { $sort: { events: -1 } },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$userId' } },
        { $count: 'total' },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      last7d: {
        byService: serviceUsage7d,
        totalEvents: serviceUsage7d.reduce((s, r) => s + r.events, 0),
        activeUsers: activeUsers7d[0]?.total ?? 0,
        dailyActivity: dailyActivity.map((d) => ({
          date: d._id,
          events: d.count,
        })),
      },
      last30d: {
        byService: serviceUsage30d,
        totalEvents: serviceUsage30d.reduce((s, r) => s + r.events, 0),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ServiceUsage] Error:', msg);
    return NextResponse.json(
      { ok: false, message: 'Failed to load service usage' },
      { status: 500 },
    );
  }
}
