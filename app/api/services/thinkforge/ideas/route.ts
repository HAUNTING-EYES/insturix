import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createIdeasAgent } from '@/lib/thinkforge/agents/ideas-agent';
import { checkCredits } from '@/lib/services/creditsMiddleware';
import { CreditsMigrationService } from '@/lib/services/creditsMigrationService';
import { fetchContextSources, formatSystemBrief } from '@/lib/thinkforge/context';
import { listUnifiedBrands, type UnifiedBrand } from '@/lib/shared/brand-registry';
import {
	getDefaultBrandVaultRefineryStore,
	type BrandVaultAcceptedBrandSummary,
} from '@/lib/shared/brand-vault-refinery-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BrandCandidate = {
	brandId: string;
	name: string;
	source: 'registry' | 'brand_vault';
	updatedAt?: string;
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

function candidateFromRegistry(brand: UnifiedBrand): BrandCandidate {
	return {
		brandId: brand.brandId,
		name: brand.name || brand.brandId,
		source: 'registry',
		updatedAt: brand.updatedAt?.toISOString(),
	};
}

function candidateFromVault(brand: BrandVaultAcceptedBrandSummary): BrandCandidate {
	return {
		brandId: brand.brandId,
		name: brand.name || brand.brandId,
		source: 'brand_vault',
		updatedAt: brand.updatedAt,
	};
}

function mergeCandidates(...groups: BrandCandidate[][]): BrandCandidate[] {
	const byId = new Map<string, BrandCandidate>();
	for (const group of groups) {
		for (const candidate of group) {
			const id = candidate.brandId.trim();
			if (!id) continue;
			const existing = byId.get(id);
			if (!existing || existing.source !== 'brand_vault') {
				byId.set(id, { ...candidate, brandId: id });
			}
		}
	}
	return [...byId.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
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
	const registryBrands = (await listUnifiedBrands(userId)).map(candidateFromRegistry);

	let vaultBrands: BrandCandidate[] = [];
	const store = getDefaultBrandVaultRefineryStore();
	if (store.listAcceptedBrands) {
		const accepted = await store.listAcceptedBrands(
			orgId ? { orgId, userId, isOrgAdmin } : { orgId: null, userId },
		);
		vaultBrands = accepted.map(candidateFromVault);
	}

	return mergeCandidates(vaultBrands, registryBrands);
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

	let prompt: string = '';
	let requestedBrandId: string | undefined;
	let brandBrief: string | undefined;
	try {
		const body = await req.json();
		prompt = String(body?.prompt || '');
		const projectMeta = toProjectMeta(body?.projectMeta);
		requestedBrandId = toNonEmptyString(body?.brandId) || toNonEmptyString(projectMeta.brandId);
		brandBrief = toNonEmptyString(body?.brandBrief) || toNonEmptyString(projectMeta.brandBrief);
	} catch {
		return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (!prompt.trim()) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

	await CreditsMigrationService.ensureMigrated(userId);

	const creditCheck = await checkCredits(userId, 'thinkforge', 'chat_message');

	if (!creditCheck.allowed) {
		return creditCheck.errorResponse;
	}

	const requiresBrandContext = BRAND_GROUNDED_INTENT.test(prompt) || Boolean(requestedBrandId);
	let deducted = false;
	try {
		let candidates: BrandCandidate[] = [];
		try {
			candidates = await listBrandCandidates(userId, orgId ?? null, orgId ? has({ role: 'org:admin' }) : false);
		} catch (brandListError) {
			if (requiresBrandContext) {
				throw new Error(`Brand context lookup failed: ${brandListError instanceof Error ? brandListError.message : String(brandListError)}`);
			}
			console.warn('[ThinkForge ideas] Brand list lookup failed for unbranded request:', brandListError);
		}

		const brandScope = resolveBrandScope(prompt, requestedBrandId, candidates);
		if (brandScope.error) {
			return NextResponse.json(brandScope.error.body, { status: brandScope.error.status });
		}

		await creditCheck.deduct();
		deducted = true;

		let systemBrief = '';
		try {
			const ctx = await fetchContextSources({
				userId,
				brandId: brandScope.brandId,
				orgId: orgId ?? null,
				currentPrompt: prompt,
				maxFacts: 6,
			});
			systemBrief = formatSystemBrief(ctx);
		} catch (contextError) {
			if (brandScope.brandId || requiresBrandContext) {
				throw new Error(`Brand context retrieval failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
			}
			console.warn('[ThinkForge ideas] Context fetch failed for unbranded request:', contextError);
		}

		if (brandScope.brandName || brandScope.brandId) {
			systemBrief = [
				`## Active Brand Scope\nBrand: ${brandScope.brandName || brandScope.brandId}\nOnly use this brand identity for brand-specific ideas.`,
				systemBrief,
			].filter(Boolean).join('\n\n');
		}

		if (brandBrief) {
			systemBrief = [
				systemBrief,
				`## User-Supplied Source Brief\n${brandBrief}`,
			].filter(Boolean).join('\n\n');
		}

		const agent = createIdeasAgent();
		const ideas = await agent.generateIdeas(prompt, {
			systemBrief: systemBrief || undefined,
			brandId: brandScope.brandId,
			brandName: brandScope.brandName,
			requireBrandGrounding: requiresBrandContext,
		});
		const scopedIdeas = ideas.map((idea) => ({
			...idea,
			...(brandScope.brandId ? { brandId: brandScope.brandId } : {}),
			...(brandBrief ? { brandBrief } : {}),
		}));
		return NextResponse.json({
			ideas: scopedIdeas,
			grounding: {
				brandId: brandScope.brandId ?? null,
				brandName: brandScope.brandName ?? null,
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