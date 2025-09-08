import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
	const { userId } = await auth();
	if (!userId) return new NextResponse('Unauthorized', { status: 401 });

	let prompt: string = '';
	try {
		const body = await req.json();
		prompt = String(body?.prompt || '');
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (!prompt.trim()) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

	const base = process.env.MONOLITHIC_BACKEND_URL;
	const secret = process.env.MONOLITHIC_BACKEND_SECRET;
	if (!base || !secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

	const upstream = await fetch(`${base.replace(/\/$/, '')}/thinkforge/ideas`, {
		method: 'POST',
		cache: 'no-store',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${secret}`,
			'Accept': 'application/json',
			'Accept-Encoding': 'identity',
		},
		body: JSON.stringify({ prompt })
	});
	if (!upstream.ok) {
		const text = await upstream.text().catch(()=> '');
		return NextResponse.json({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 500) }, { status: 502 });
	}
	const ideas = await upstream.json();
	return NextResponse.json(ideas);
}

