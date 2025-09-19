import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/sessions/count?userId=${encodeURIComponent(userId)}`, {
    method: 'GET', cache: 'no-store', headers: {
      'Authorization': `Bearer ${secret}`, 'Accept': 'application/json', 'Accept-Encoding': 'identity',
    }
  });
  if (!upstream.ok) { const text = await upstream.text().catch(()=> ''); return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0,800) }, { status: 502 }); }
  return NextResponse.json(await upstream.json());
}
