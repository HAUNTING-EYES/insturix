/**
 * GET /api/services/thinkforge/script/list-all
 * All of the current user's scripts across every session — for the unified
 * "My Content" library. (The per-session list requires a sessionId.)
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { listScriptsByUser } from '@/lib/thinkforge/services/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
    const scripts = await listScriptsByUser(userId, limit);
    return NextResponse.json({ success: true, scripts });
  } catch (error: any) {
    console.error('Error listing all scripts:', error);
    return NextResponse.json({ error: 'Failed to list scripts', details: error?.message }, { status: 500 });
  }
}
