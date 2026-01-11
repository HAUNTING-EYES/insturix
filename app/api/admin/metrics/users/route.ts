import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminForApi } from '@/lib/auth/adminAuth';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { User } from '@/schemas/user';

/**
 * GET /api/admin/metrics/users
 * Returns last 30 days registrations per day and totals
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

    const series = await User.aggregate([
      { $match: { signUpDate: { $gte: start } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$signUpDate' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const total = await User.countDocuments({ signUpDate: { $gte: start } });

    return NextResponse.json({ ok: true, start, total, series });
  } catch (e) {
    console.error('users metrics error', e);
    return NextResponse.json({ ok: false, message: 'Failed to load user metrics' }, { status: 500 });
  }
}
