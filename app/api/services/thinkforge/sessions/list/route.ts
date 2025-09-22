import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  const url = new URL(req.url);
  const limit = url.searchParams.get('limit') || '50';
  const offset = url.searchParams.get('offset') || '0';
  const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/sessions/list?userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`, {
    method: 'GET', cache: 'no-store', headers: {
      'Authorization': `Bearer ${secret}`, 'Accept': 'application/json', 'Accept-Encoding': 'identity',
    }
  });
  if (!upstream.ok) { const text = await upstream.text().catch(()=> ''); return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0,800) }, { status: 502 }); }
  return NextResponse.json(await upstream.json());
}