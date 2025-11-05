import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { auth } from '@clerk/nextjs/server';
import { getUserData } from '@/lib/services/getUserData';

// Unified chat endpoint proxy - backend automatically determines workflow
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  let prompt: string | undefined;
  let sessionId: string | undefined;
  let script: any | undefined;
  let project: any | undefined;
  let selection: string | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? '').toString();
    if (body?.sessionId) sessionId = String(body.sessionId);
    if (body?.script) script = body.script;
    if (body?.project) project = body.project;
    if (body?.selection) selection = String(body.selection);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const base = process.env.MONOLITHIC_BACKEND_URL;
  const secret = process.env.MONOLITHIC_BACKEND_SECRET;
  if (!base || !secret) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  try {
    const user = await getUserData();
    const planName = (user?.currentPlan?.name || 'Free');
    const upstreamBody: any = { prompt, sessionId, userId, planName };
    if (script) upstreamBody.script = script;
    if (project) upstreamBody.project = project;
    if (selection) upstreamBody.selection = selection;
    
    const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/chat`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'Accept-Encoding': 'identity'
      },
      body: JSON.stringify(upstreamBody)
    });

    if (upstream.status === 429) {
      let body: any = null;
      try { body = await upstream.json(); } catch { body = { error: 'Rate limit' }; }
      return NextResponse.json(body, { status: 429 });
    }

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(()=> '');
      return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0,500) }, { status: 502 });
    }

    return new Response(upstream.body, { headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }});
  } catch (e: any) {
    return NextResponse.json({ error: 'Proxy failure', details: e?.message }, { status: 500 });
  }
}

