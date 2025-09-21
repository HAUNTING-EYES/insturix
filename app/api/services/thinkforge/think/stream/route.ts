import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/think/stream`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
      'Accept': 'text/plain',
      'Accept-Encoding': 'identity',
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(()=> '');
    return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 800) }, { status: 502 });
  }

  return new Response(upstream.body, { headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no'
  }});
}
