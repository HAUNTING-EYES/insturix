import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getIcs25Db } from '@/lib/ics25-mongo';
import Creator from '@/schemas/ics25/Creator';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    await getIcs25Db();

    // Check if user has a creator application
    const application = await Creator.findOne({ clerkUserId: userId });

    if (!application) {
      return NextResponse.json({
        ok: true,
        status: 'none',
      });
    }

    return NextResponse.json({
      ok: true,
      status: application.status || 'none', // 'pending', 'approved', 'rejected'
    });
  } catch (e: any) {
    console.error('Creator status error:', e);
    return NextResponse.json({
      ok: false,
      message: e.message || 'Failed to fetch status',
    }, { status: 500 });
  }
}
