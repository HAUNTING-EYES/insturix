import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ServiceUsageService } from '@/lib/services/serviceUsageService';
// We now use the unified usage endpoint to increment/check

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Ensure userId is set from auth if missing
  payload.userId = payload.userId || userId;

  // If this is a create-new (no sessionId), increment ThinkForge usage first (reserve a session)
  if (!payload.sessionId) {
    try {
      await ServiceUsageService.useService(userId, 'thinkforge' as any, 'maxSessions', 1);
    } catch (e: any) {
      const msg = e?.message || 'Weekly sessions limit exceeded';
      return NextResponse.json({ success: false, error: msg }, { status: 429 });
    }
  }

  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/hydrate`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
      'Accept': 'application/json',
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify(payload)
  });
  if (!upstream.ok) {
    // Roll back usage reservation if this was a create-new request that failed upstream
    if (!payload.sessionId) {
      try {
        await ServiceUsageService.useService(userId, 'thinkforge' as any, 'maxSessions', -1);
      } catch (rollbackErr) {
        console.error('[ThinkForge Hydrate] Failed to rollback usage after upstream error:', rollbackErr);
      }
    }
    const text = await upstream.text().catch(()=> '');
    // Preserve upstream status (e.g., 404 for session not found)
    return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 800) }, { status: upstream.status });
  }
  const data = await upstream.json();
  return NextResponse.json(data);
}
