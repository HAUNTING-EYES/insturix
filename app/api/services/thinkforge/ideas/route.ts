import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createIdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { fetchContextSources, formatSystemBrief } from '@/lib/thinkforge/context';
import { listUnifiedBrands } from '@/lib/shared/brand-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
	const { userId, orgId } = await auth();
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

		// Fetch brand context so ideas are grounded in the user's brand.
		// Ideation is pre-session (no brand chosen yet), so ground in the user's brand ONLY
		// when it is unambiguous — exactly one brand — to avoid cross-brand contamination for
		// multi-brand accounts. Drafting later scopes to the session's brandId.
		let systemBrief = '';
		try {
			let brandId: string | undefined;
			const brands = await listUnifiedBrands(userId);
			if (brands.length === 1) brandId = brands[0].brandId;

			const ctx = await fetchContextSources({
				userId,
				brandId,
				orgId: orgId ?? null,
				currentPrompt: prompt,
				maxFacts: 6,
			});
			systemBrief = formatSystemBrief(ctx);
		} catch { /* ideas still work without brand context */ }

		const agent = createIdeasAgent();
		const ideas = await agent.generateIdeas(prompt, systemBrief || undefined);
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
