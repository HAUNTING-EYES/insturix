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
	BrandScopeAuthorizationError,
	listAuthorizedBrandScopes,
} from '@/lib/shared/brand-scope';
import {
	ThinkForgeAuthoringRequestSchema,
	type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BrandCandidate = {
	brandId: string;
	name: string;
};

type RejectedIdeaEvidence = {
	title: string;
	purpose?: string;
	style?: string;
};

const BRAND_GROUNDED_INTENT = /\b(my brand|our brand|brand'?s|brand voice|brand context|brand icp|icp)\b/i;

function toNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function toProjectMeta(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function promptMentionsBrandName(prompt: string, name: string): boolean {
	const trimmed = name.trim();
	if (trimmed.length < 3) return false;
	const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(prompt);
}

async function listBrandCandidates(
	userId: string,
	orgId: string | null,
	isOrgAdmin: boolean,
): Promise<BrandCandidate[]> {
	const scopes = await listAuthorizedBrandScopes({ userId, orgId, isOrgAdmin });
	return scopes.map((scope) => ({ brandId: scope.brandId, name: scope.brandName }));
}

function resolveBrandScope(
	prompt: string,
	requestedBrandId: string | undefined,
	candidates: BrandCandidate[],
): { brandId?: string; brandName?: string; error?: { status: number; body: Record<string, unknown> } } {
	if (requestedBrandId) {
		const matched = candidates.find((candidate) => candidate.brandId === requestedBrandId);
		if (!matched) {
			return {
				error: {
					status: 404,
					body: {
						error: 'Brand not found',
						code: 'brand_not_found',
						message: 'The selected brand is not available to this workspace. Re-select the brand and try again.',
					},
				},
			};
		}
		return { brandId: matched.brandId, brandName: matched.name };
	}

	if (candidates.length === 1) {
		return { brandId: candidates[0].brandId, brandName: candidates[0].name };
	}

	const namedMatches = candidates.filter((candidate) => promptMentionsBrandName(prompt, candidate.name));
	if (namedMatches.length === 1) {
		return { brandId: namedMatches[0].brandId, brandName: namedMatches[0].name };
	}

	if (BRAND_GROUNDED_INTENT.test(prompt)) {
		return {
			error: {
				status: 409,
				body: {
					error: 'Brand context required',
					code: 'brand_context_required',
					message: candidates.length > 1
						? 'This request references your brand, but multiple brands are available. Select a brand before generating ideas.'
						: 'This request references your brand, but ThinkForge could not find an accepted brand context.',
					availableBrands: candidates.map(({ brandId, name }) => ({ brandId, name })),
				},
			},
		};
	}

	return {};
}

export async function POST(req: Request) {
	const { userId, orgId, has } = await auth();
	if (!userId) return new NextResponse('Unauthorized', { status: 401 });
	const isOrgAdmin = Boolean(orgId && has({ role: 'org:admin' }));

	let prompt: string = '';
	let requestedBrandId: string | undefined;
	let variationIndex = 0;
	let rejectedIdeas: RejectedIdeaEvidence[] = [];
	let authoringRequest: ThinkForgeAuthoringRequest;
	try {
		const body = await req.json();
		prompt = String(body?.prompt || '');
		const parsedAuthoringRequest = ThinkForgeAuthoringRequestSchema.safeParse(body?.authoringRequest);
		if (!parsedAuthoringRequest.success) {
			return NextResponse.json(
				{
					error: 'Invalid authoring request',
					code: 'invalid_authoring_request',
					details: parsedAuthoringRequest.error.flatten(),
				},
				{ status: 422 },
			);
		}
		authoringRequest = parsedAuthoringRequest.data;
		const projectMeta = toProjectMeta(body?.projectMeta);
		requestedBrandId = toNonEmptyString(body?.brandId) || toNonEmptyString(projectMeta.brandId);
		if (Number.isInteger(body?.variationIndex) && body.variationIndex >= 0 && body.variationIndex <= 1000) {
			variationIndex = body.variationIndex;
		}
		if (Array.isArray(body?.rejectedIdeas)) {
			rejectedIdeas = body.rejectedIdeas
				.map((value: unknown): RejectedIdeaEvidence | null => {
					const item = toProjectMeta(value);
					const title = toNonEmptyString(item.title)?.slice(0, 120);
					if (!title) return null;
					return {
						title,
						purpose: toNonEmptyString(item.purpose)?.slice(0, 240),
						style: toNonEmptyString(item.style)?.slice(0, 120),
					};
				})
				.filter((idea: RejectedIdeaEvidence | null): idea is RejectedIdeaEvidence => Boolean(idea))
				.slice(0, 12);
		}
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (!prompt.trim()) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

	await CreditsMigrationService.ensureMigrated(userId);

	// P3.1: the active context at WORK-START decides who pays (stamped surfaces).
	const billingWallet = resolveContextBillingOwner(userId, orgId ?? null, isOrgWalletBillingEnabled());

	const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message', undefined, billingWallet);

	if (!creditCheck.allowed) {
		return creditCheck.errorResponse;
	}

	const requiresBrandContext = BRAND_GROUNDED_INTENT.test(prompt) || Boolean(requestedBrandId);
	let deducted = false;
	try {
		let candidates: BrandCandidate[] = [];
		try {
			candidates = await listBrandCandidates(userId, orgId ?? null, isOrgAdmin);
		} catch (brandListError) {
			if (brandListError instanceof BrandScopeAuthorizationError && requiresBrandContext) {
				return NextResponse.json(
					{
						error: 'Brand Vault unavailable',
						code: brandListError.code,
						message: brandListError.message,
					},
					{ status: 503 },
				);
			}
			if (requiresBrandContext) {
				throw new Error(`Brand context lookup failed: ${brandListError instanceof Error ? brandListError.message : String(brandListError)}`);
			}
			console.warn('[ThinkForge ideas] Brand list lookup failed for unbranded request:', brandListError);
		}

		const brandScope = resolveBrandScope(prompt, requestedBrandId, candidates);
		if (brandScope.error) {
			return NextResponse.json(brandScope.error.body, { status: brandScope.error.status });
		}

		let systemBrief = '';
		let authoringContextSnapshot: ThinkForgeAuthoringContextSnapshot | undefined;
		try {
			const authoringContext = await resolveThinkForgeAuthoringContext({
				userId,
				orgId: orgId ?? null,
				isOrgAdmin,
				providedProject: {
					...(brandScope.brandId ? { brandId: brandScope.brandId } : {}),
					authoringRequest,
				},
				currentPrompt: prompt,
				maxFacts: 6,
			});
			systemBrief = authoringContext.systemBrief;
			authoringContextSnapshot = authoringContext.snapshot;
		} catch (contextError) {
			if (brandScope.brandId || requiresBrandContext) {
				throw new Error(`Brand context retrieval failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
			}
			console.warn('[ThinkForge ideas] Context fetch failed for unbranded request:', contextError);
		}

		await creditCheck.deduct();
		deducted = true;

		if (brandScope.brandName || brandScope.brandId) {
			systemBrief = [
				`## Active Brand Scope\nBrand: ${brandScope.brandName || brandScope.brandId}\nOnly use this brand identity for brand-specific ideas.`,
				systemBrief,
			].filter(Boolean).join('\n\n');
		}

		const agent = createIdeasAgent();
		const ideas = await agent.generateIdeas(prompt, {
			systemBrief: systemBrief || undefined,
			brandId: brandScope.brandId,
			brandName: brandScope.brandName,
			requireBrandGrounding: requiresBrandContext,
			variationIndex,
			rejectedIdeas,
			authoringRequest,
		});
		const scopedIdeas = ideas.map((idea) => ({
			...idea,
			...(brandScope.brandId ? { brandId: brandScope.brandId } : {}),
		}));
		return NextResponse.json({
			ideas: scopedIdeas,
			grounding: {
				brandId: brandScope.brandId ?? null,
				brandName: brandScope.brandName ?? null,
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
