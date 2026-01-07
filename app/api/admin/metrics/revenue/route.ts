import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';

/**
 * GET /api/admin/metrics/revenue
 * Best-effort revenue metrics derived from user.planHistory
 * Returns last 30 days daily sums and total in USD-equivalent count of records
 */
export async function GET(_req: NextRequest) {
  const adminCheck = await verifyAdminForApi();
  if (!adminCheck.isAdmin) return adminCheck.response;

  try {
    await connectToDatabase();
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 29);
    start.setHours(0,0,0,0);

    // Unwind planHistory and sum by startDate as approximation
    const series = await User.aggregate([
      { $unwind: '$planHistory' },
      { $match: { 'planHistory.startDate': { $gte: start }, 'planHistory.status': { $in: ['active','completed','expired'] } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$planHistory.startDate' } },
          totalAmount: { $sum: '$planHistory.price' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totals = await User.aggregate([
      { $unwind: '$planHistory' },
      { $match: { 'planHistory.startDate': { $gte: start }, 'planHistory.status': { $in: ['active','completed','expired'] } } },
      { $group: { _id: null, totalAmount: { $sum: '$planHistory.price' }, count: { $sum: 1 } } }
    ]);

    const totalAmount = totals[0]?.totalAmount || 0;
    const count = totals[0]?.count || 0;

    return NextResponse.json({ ok: true, start, totalAmount, count, series });
  } catch (e) {
    console.error('revenue metrics error', e);
    return NextResponse.json({ ok: false, message: 'Failed to load revenue metrics' }, { status: 500 });
  }
}
