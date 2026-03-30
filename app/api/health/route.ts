import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/editron/db/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { mongodb: 'connected' },
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      services: { mongodb: err.message },
    }, { status: 503 });
  }
}
