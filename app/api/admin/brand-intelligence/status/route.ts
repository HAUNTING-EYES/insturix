/**
 * GET /api/admin/brand-intelligence/status
 *
 * Admin endpoint: brand health metrics, learning system status,
 * and per-service event counts.
 *
 * Sections:
 *   1. Brand overview — total brands, avg facts per brand
 *   2. Event bus stats — events per service (7d + 30d), consumption rate
 *   3. Learning status — bandit state, vector count
 *   4. Project pipeline — status distribution
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

    const [
      brandCount,
      eventsByService7d,
      eventsByService30d,
      eventsByType7d,
      consumptionStats,
      projectStatusDist,
      recentEvents,
    ] = await Promise.all([
      db.collection('brands').countDocuments(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),

      db.collection('brand_events').aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            consumed: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$consumedBy' }, 0] }, 1, 0],
              },
            },
          },
        },
      ]).toArray(),

      db.collection('projects').aggregate([
        { $group: { _id: { $ifNull: ['$status', 'draft'] }, count: { $sum: 1 } } },
        { $project: { _id: 0, status: '$_id', count: 1 } },
        { $sort: { count: -1 } },
      ]).toArray(),

      db.collection('brand_events')
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .project({ eventId: 1, type: 1, service: 1, userId: 1, createdAt: 1, _id: 0 })
        .toArray(),
    ]);

    const consumption = consumptionStats[0] || { total: 0, consumed: 0 };
    const consumptionRate = consumption.total > 0
      ? Math.round((consumption.consumed / consumption.total) * 100)
      : 0;

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      brands: {
        total: brandCount,
      },
      eventBus: {
        last7d: {
          byService: Object.fromEntries(eventsByService7d.map((r) => [r._id, r.count])),
          byType: Object.fromEntries(eventsByType7d.map((r) => [r._id, r.count])),
          total: eventsByService7d.reduce((s, r) => s + r.count, 0),
          consumed: consumption.consumed,
          consumptionRate,
        },
        last30d: {
          byService: Object.fromEntries(eventsByService30d.map((r) => [r._id, r.count])),
          total: eventsByService30d.reduce((s, r) => s + r.count, 0),
        },
      },
      projectPipeline: {
        statusDistribution: Object.fromEntries(
          projectStatusDist.map((r) => [r.status, r.count]),
        ),
        total: projectStatusDist.reduce((s, r) => s + r.count, 0),
      },
      recentEvents,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[BrandIntelligence] Status error:', msg);
    return NextResponse.json(
      { ok: false, message: 'Failed to load brand intelligence status' },
      { status: 500 },
    );
  }
}
