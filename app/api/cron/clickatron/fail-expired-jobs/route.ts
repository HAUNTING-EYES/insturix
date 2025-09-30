import { NextResponse } from 'next/server';
import { failExpiredJobs } from '@/lib/clickatron-jobs';

// This should be called by a cron service (Vercel Cron, GitHub Actions, etc.)
export async function GET(request: Request) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fail expired jobs
    const result = await failExpiredJobs();
    
    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Failed to process expired jobs:', error);
    return NextResponse.json(
      { error: 'Failed to process expired jobs', details: (error as Error).message },
      { status: 500 }
    );
  }
}