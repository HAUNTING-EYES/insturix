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

  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/script/inspect`, {
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
    const text = await upstream.text().catch(()=> '');
    return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 800) }, { status: 502 });
  }
  const data = await upstream.json();
  return NextResponse.json(data);
}
