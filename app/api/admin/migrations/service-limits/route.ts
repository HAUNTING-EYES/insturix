import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api/middleware/withAdmin';
import { runServiceLimitsMigration } from '@/lib/migrations/serviceLimitsMigration';

async function handler(req: Request) {
  if (req.method !== 'POST') {
    return NextResponse.json({ message: 'Method not allowed' }, { status: 405 });
  }

  const { dryRun } = (await req.json()) as { dryRun?: boolean };

  try {
    const result = await runServiceLimitsMigration({ dryRun: dryRun ?? true });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Service limits migration failed:', error);
    return NextResponse.json({ message: 'Migration failed', error: error.message }, { status: 500 });
  }
}

export const POST = withAdmin(handler);