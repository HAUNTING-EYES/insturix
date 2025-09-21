import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { sessionId: string } }) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });
  const sessionId = params?.sessionId;
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const upstreamUrl = `${base.replace(/\/$/, '')}/thinkforge/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`;
  const upstream = await fetch(upstreamUrl, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Accept': 'application/json',
      'Accept-Encoding': 'identity',
    },
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    // Preserve upstream status to surface 404 vs 500 correctly
    return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 800) }, { status: upstream.status });
  }
  const data = await upstream.json().catch(() => ({ ok: true }));
  return NextResponse.json(data);
}