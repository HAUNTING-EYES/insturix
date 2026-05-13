/**
 * GET /api/admin/projects/status-board
 *
 * Admin endpoint: projects grouped by status with optional filters.
 * Returns counts per status + recent projects per status bucket.
 *
 * Query params:
 *   status  — filter to a single status (e.g. ?status=rendering)
 *   brandId — filter by brand
 *   userId  — filter by user
 *   limit   — max projects per status bucket (default 10, max 50)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { ProjectStatus } from '@/lib/shared/project-status';

export const runtime = 'nodejs';

const ALL_STATUSES: ProjectStatus[] = [
  'draft',
  'scripting',
  'storyboarding',
  'generating',
  'editing',
  'reviewing',
  'rendering',
  'rendered',
  'published',
  'archived',
  'failed',
];

export async function GET(req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status') as ProjectStatus | null;
    const brandIdFilter = url.searchParams.get('brandId');
    const userIdFilter = url.searchParams.get('userId');
    const limitParam = parseInt(url.searchParams.get('limit') || '10', 10);
    const perStatusLimit = Math.min(Math.max(limitParam, 1), 50);

    const db = await getDatabase();
    const col = db.collection(COLLECTIONS.PROJECTS);

    // Build match filter
    const matchFilter: Record<string, unknown> = {};
    if (statusFilter && ALL_STATUSES.includes(statusFilter)) {
      matchFilter.status = statusFilter;
    }
    if (brandIdFilter) matchFilter.brandId = brandIdFilter;
    if (userIdFilter) matchFilter.userId = userIdFilter;

    // Aggregation: count per status
    const countPipeline: Record<string, unknown>[] = [
      ...(Object.keys(matchFilter).length > 0
        ? [{ $match: matchFilter }]
        : []),
      {
        $group: {
          _id: { $ifNull: ['$status', 'draft'] },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ];

    const statusCounts = await col.aggregate(countPipeline).toArray();

    // Build a map for easy lookup
    const countsMap = new Map<string, number>();
    let totalProjects = 0;
    for (const row of statusCounts) {
      countsMap.set(row.status, row.count);
      totalProjects += row.count;
    }

    // Fetch recent projects per status bucket
    const targetStatuses = statusFilter
      ? [statusFilter]
      : ALL_STATUSES.filter((s) => countsMap.has(s));

    const bucketPromises = targetStatuses.map(async (status) => {
      const filter: Record<string, unknown> = {};
      if (brandIdFilter) filter.brandId = brandIdFilter;
      if (userIdFilter) filter.userId = userIdFilter;

      if (status === 'draft') {
        // Existing projects may have no status field — treat null/missing as draft
        filter.$or = [
          { status: 'draft' },
          { status: { $exists: false } },
          { status: null },
        ];
      } else {
        filter.status = status;
      }

      const projects = await col
        .find(filter)
        .project({
          projectId: 1,
          userId: 1,
          name: 1,
          status: 1,
          brandId: 1,
          updatedAt: 1,
          lastError: 1,
          _id: 0,
        })
        .sort({ updatedAt: -1 })
        .limit(perStatusLimit)
        .toArray();

      return { status, count: countsMap.get(status) || 0, projects };
    });

    const buckets = await Promise.all(bucketPromises);

    return NextResponse.json({
      ok: true,
      totalProjects,
      statusCounts: Object.fromEntries(countsMap),
      buckets,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[StatusBoard] Error:', msg);
    return NextResponse.json(
      { ok: false, message: 'Failed to load status board' },
      { status: 500 },
    );
  }
}
