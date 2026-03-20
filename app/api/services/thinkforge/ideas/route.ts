import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateIdeas } from '@/lib/thinkforge/agents/ideas-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';

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

	// Ensure user exists and is migrated
	await CreditsMigrationService.ensureMigrated(userId);

	// Check and prepare credit deduction (cost: 1 for chat_message)
	const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message');

	if (!creditCheck.allowed) {
		return creditCheck.errorResponse;
	}

	try {
		// Deduct credits before processing
		await creditCheck.deduct();

		const ideas = await generateIdeas(prompt);
		return NextResponse.json({ ideas });
	} catch (error: any) {
		// Refund on failure
		await creditCheck.refund(error?.message || 'Idea generation failed');

		console.error('Error generating ideas:', error);
		return NextResponse.json(
			{ error: 'Failed to generate ideas', details: error?.message },
			{ status: 500 }
		);
	}
}
