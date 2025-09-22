import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserData } from '@/lib/services/getUserData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  let payload: any; try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const user = await getUserData();
  payload.userId = userId;
  payload.planName = (user?.currentPlan?.name || 'Free');
  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/chat/append`, {
    method: 'POST', cache: 'no-store', headers: {
      'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}`, 'Accept': 'application/json', 'Accept-Encoding': 'identity',
    }, body: JSON.stringify(payload)
  });
  if (upstream.status === 429) { let body: any = null; try { body = await upstream.json(); } catch { body = { error: 'Rate limit' }; } return NextResponse.json(body, { status: 429 }); }
  if (!upstream.ok) { const text = await upstream.text().catch(()=> ''); return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0,800) }, { status: 502 }); }
  return NextResponse.json(await upstream.json());
}
