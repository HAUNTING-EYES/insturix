import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateIdeas } from '@/lib/thinkforge/agents/ideas-agent';

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

	try {
		const ideas = await generateIdeas(prompt);
		return NextResponse.json({ ideas });
	} catch (error: any) {
		console.error('Error generating ideas:', error);
		return NextResponse.json(
			{ error: 'Failed to generate ideas', details: error?.message },
			{ status: 500 }
		);
	}
}

