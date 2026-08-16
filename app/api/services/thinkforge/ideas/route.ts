import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createIdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { resolveThinkForgeAuthoringContext } from '@/lib/thinkforge/context';
import type { ThinkForgeAuthoringContextSnapshot } from '@/lib/thinkforge/context/brand-authoring-context';
import { resolveContextBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import {
	authorizeBrandScope,
	BrandScopeAuthorizationError,
	listAuthorizedBrandScopes,
} from '@/lib/shared/brand-scope';
import {
	ThinkForgeIdeaGenerationRequestSchema,
	type ThinkForgeIdeaGenerationRequest,
} from '@/lib/thinkforge/schemas/idea-generation-request';
import { toThinkForgeErrorResponse } from '@/lib/thinkforge/errors/thinkforge-error';
import { assertThinkForgePublishingRequestFeasible } from '@/lib/thinkforge/signals/publishing-constraints';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
	const { userId, orgId, has } = await auth();
	if (!userId) return new NextResponse('Unauthorized', { status: 401 });
	const isOrgAdmin = Boolean(orgId && has({ role: 'org:admin' }));

	let request: ThinkForgeIdeaGenerationRequest;
	try {
		const body = await req.json();
		const parsedRequest = ThinkForgeIdeaGenerationRequestSchema.safeParse(body);
		if (!parsedRequest.success) {
			return NextResponse.json(
				{
					error: 'Invalid idea generation request',
					code: 'invalid_idea_generation_request',
					details: parsedRequest.error.flatten(),
				},
				{ status: 422 },
			);
		}
		request = parsedRequest.data;
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
	}
	const { prompt, authoringRequest, brandScope, variationIndex, rejectedIdeas } = request;
	try {
		assertThinkForgePublishingRequestFeasible(authoringRequest);
	} catch (error) {
		const normalized = toThinkForgeErrorResponse(error);
		return NextResponse.json(normalized.body, { status: normalized.status });
	}

	let resolvedBrandScope: { brandId?: string; brandName?: string } = {};
	try {
		if (brandScope.mode === 'brand') {
			const authorized = await authorizeBrandScope({
				userId,
				orgId: orgId ?? null,
				isOrgAdmin,
				brandId: brandScope.brandId,
			});
			resolvedBrandScope = { brandId: authorized.brandId, brandName: authorized.brandName };
		} else {
			const availableBrands = await listAuthorizedBrandScopes({ userId, orgId: orgId ?? null, isOrgAdmin });
			if (availableBrands.length > 0) {
				return NextResponse.json({
					error: 'Brand selection required',
					code: 'brand_selection_required',
					message: 'Select the brand this content belongs to before generating ideas.',
					availableBrands: availableBrands.map(({ brandId, brandName }) => ({ brandId, name: brandName })),
				}, { status: 409 });
			}
		}
	} catch (error) {
		if (error instanceof BrandScopeAuthorizationError) {
			return NextResponse.json({
				error: error.code === 'brand_not_found' ? 'Brand not found' : 'Brand Vault unavailable',
				code: error.code,
				message: error.message,
			}, { status: error.code === 'brand_not_found' ? 404 : 503 });
		}
		console.error('[ThinkForge ideas] Brand authority resolution failed:', error);
		return NextResponse.json({
			error: 'Brand Vault unavailable',
			code: 'brand_scope_unavailable',
			message: 'ThinkForge could not verify the selected brand scope. No credits were used.',
		}, { status: 503 });
	}

	await CreditsMigrationService.ensureMigrated(userId);
	const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());
	const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', undefined, billingWallet);
	if (!creditCheck.allowed) return creditCheck.errorResponse;

	const requiresBrandContext = brandScope.mode === 'brand';
	let deducted = false;
	try {
		let systemBrief = '';
		let authoringContextSnapshot: ThinkForgeAuthoringContextSnapshot | undefined;
		try {
			const authoringContext = await resolveThinkForgeAuthoringContext({
				userId,
				orgId: orgId ?? null,
				isOrgAdmin,
				providedProject: {
					...(resolvedBrandScope.brandId ? { brandId: resolvedBrandScope.brandId } : {}),
					authoringRequest,
				},
				currentPrompt: prompt,
				maxFacts: 6,
			});
			systemBrief = authoringContext.systemBrief;
			authoringContextSnapshot = authoringContext.snapshot;
		} catch (contextError) {
			if (resolvedBrandScope.brandId || requiresBrandContext) {
				throw new Error(`Brand context retrieval failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
			}
			console.warn('[ThinkForge ideas] Context fetch failed for unbranded request:', contextError);
		}

		await creditCheck.deduct();
		deducted = true;

		if (resolvedBrandScope.brandName || resolvedBrandScope.brandId) {
			systemBrief = [
				`## Active Brand Scope\nBrand: ${resolvedBrandScope.brandName || resolvedBrandScope.brandId}\nOnly use this brand identity for brand-specific ideas.`,
				systemBrief,
			].filter(Boolean).join('\n\n');
		}

		const agent = createIdeasAgent();
		const ideas = await agent.generateIdeas(prompt, {
			systemBrief: systemBrief || undefined,
			brandId: resolvedBrandScope.brandId,
			brandName: resolvedBrandScope.brandName,
			variationIndex,
			rejectedIdeas,
			authoringRequest,
		});
		const scopedIdeas = ideas.map((idea) => ({
			...idea,
			...(resolvedBrandScope.brandId ? { brandId: resolvedBrandScope.brandId } : {}),
		}));
		return NextResponse.json({
			ideas: scopedIdeas,
			grounding: {
				brandId: resolvedBrandScope.brandId ?? null,
				brandName: resolvedBrandScope.brandName ?? null,
			},
			generation: {
				variationIndex,
				rejectedIdeaCount: rejectedIdeas.length,
				authoringRequest,
				authoringContextSnapshot,
			},
		});
	} catch (error: any) {
		if (deducted) {
			await creditCheck.refund(error?.message || 'Idea generation failed');
		}

		console.error('Error generating ideas:', error);
		return NextResponse.json(
			{ error: 'Failed to generate ideas', details: error?.message },
			{ status: 500 }
		);
	}
}
