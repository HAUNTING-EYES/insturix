"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Lightbulb, FileText, Calendar, Brain, Library } from "lucide-react";
import { toast } from '@/hooks/use-toast';
import {
	resolveProjectMetaEditorialAngle,
	synchronizeThinkForgeIdeaEditorialAngle,
	type IdeaCardData,
} from "@/lib/thinkforge/state/types";
import type { SelectedTrend } from "@/lib/thinkforge/trends/selected-trend";
import type { TrendCandidate } from "@/lib/thinkforge/trends/trend-evidence";
import type { TrendTarget } from "@/components/dashboard/ThinkForge/TrendWorkflowPanel";
import { LibraryPanel, SessionMeta } from "@/components/dashboard/ThinkForge/LibraryPanel";
import { BackgroundDecor } from "@/components/dashboard/ThinkForge/BackgroundDecor";
import { Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeSession } from "./hooks/useThinkForgeSession";
import { useThinkForgeScript } from "./hooks/useThinkForgeScript";
import {
	scriptModelToUiScript,
	uiScriptToScriptModel,
} from "./client-script-conversion";
import Dock from "@/components/dashboard/ThinkForge/Dock";
import { WorkspaceMode } from "@/components/dashboard/ThinkForge/ModeSwitcher";
import IdeationMode from "@/components/dashboard/ThinkForge/IdeationMode";
import StoryboardingMode from "@/components/dashboard/ThinkForge/StoryboardingMode";
import PlanningMode from "@/components/dashboard/ThinkForge/PlanningMode";
import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";

import {
	normalizeThinkForgeDocumentContract,
} from "@/lib/thinkforge/schemas/document-contract";
import {
	buildThinkForgeAuthoringCompatibilityMetadata,
	describeThinkForgeAuthoringDeliverable,
	describeThinkForgePlatformSurface,
	ThinkForgeAuthoringRequestSchema,
	type ThinkForgeAuthoringRequest,
} from "@/lib/thinkforge/schemas/authoring-request";
import { matchesThinkForgeDocumentIdentity } from "@/lib/thinkforge/client-document-identity";
import { resolveThinkForgeSessionOpenAction } from "@/lib/thinkforge/session-open-policy";
import { getActiveBrandIdFromStorage } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import { useActiveBrand } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import {
	createThinkForgeIdeaGenerationRequest,
	resolveThinkForgeIdeaBrandScope,
} from "@/lib/thinkforge/schemas/idea-generation-request";
const PROJECT_META_PASSTHROUGH_KEYS = [
	'brandId',
	'brandBrief',
	'clientId',
	'clientName',
	'campaignId',
	'campaignName',
	'seriesId',
	'calendarItemId',
	'contentCardId',
] as const;

const toNonEmptyString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const pickProjectMetaPassthrough = (source: unknown): Record<string, string> => {
	if (!source || typeof source !== 'object') return {};
	const input = source as Record<string, unknown>;
	return PROJECT_META_PASSTHROUGH_KEYS.reduce<Record<string, string>>((acc, key) => {
		const value = toNonEmptyString(input[key]);
		if (value) acc[key] = value;
		return acc;
	}, {});
};

const hasMissingProjectMetaPassthrough = (target: unknown, source: unknown): boolean => {
	if (!source || typeof source !== 'object') return false;
	const targetRecord = target && typeof target === 'object' ? target as Record<string, unknown> : {};
	const sourceRecord = source as Record<string, unknown>;
	return PROJECT_META_PASSTHROUGH_KEYS.some((key) => {
		return !toNonEmptyString(targetRecord[key]) && Boolean(toNonEmptyString(sourceRecord[key]));
	});
};

const resolveIdeaDocumentContract = (idea: IdeaCardData | null | undefined) => {
	if (idea?.authoringRequest !== undefined) {
		return ThinkForgeAuthoringRequestSchema.parse(idea.authoringRequest).contentContract;
	}
	return normalizeThinkForgeDocumentContract(idea?.format);
};

const buildProjectMetaPayload = (
	idea: IdeaCardData | null | undefined,
	initialDraftIntent?: Record<string, unknown>,
): Record<string, unknown> => {
	const authoringRequest = idea?.authoringRequest === undefined
		? undefined
		: ThinkForgeAuthoringRequestSchema.parse(idea.authoringRequest);
	const authoringMetadata = authoringRequest
		? buildThinkForgeAuthoringCompatibilityMetadata(authoringRequest)
		: undefined;
	const contentContract = authoringMetadata?.contentContract ?? resolveIdeaDocumentContract(idea);
	const editorialAngle = synchronizeThinkForgeIdeaEditorialAngle(idea || {});
	return {
		idea: idea?.idea || '',
		purpose: idea?.purpose || '',
		style: idea?.style || '',
		format: idea?.format || '',
		...(contentContract ? { contentContract } : {}),
		platform: idea?.platform || '',
		durationSec: idea?.durationSec,
		...(authoringMetadata || {}),
		...(editorialAngle ? { editorialAngle } : {}),
		tone: idea?.tone || 'blue',
		sessionName: idea?.sessionName || '',
		originalPrompt: idea?.originalPrompt || '',
		brandBrief: idea?.brandBrief || '',
		...pickProjectMetaPassthrough(idea),
		...(initialDraftIntent ? { initialDraftIntent } : {}),
	};
};
const buildIdeaFromSessionMeta = (
  sessionId: string,
  projectMeta: Record<string, unknown>,
): IdeaCardData => {
	const authoringRequest = projectMeta.authoringRequest === undefined
		? undefined
		: ThinkForgeAuthoringRequestSchema.parse(projectMeta.authoringRequest);
	const editorialAngle = resolveProjectMetaEditorialAngle(projectMeta);
	return {
		id: sessionId,
		idea: toNonEmptyString(projectMeta.idea) || 'Untitled',
		purpose: toNonEmptyString(projectMeta.purpose) || '',
		style: toNonEmptyString(projectMeta.style) || '',
		format: toNonEmptyString(projectMeta.format) || '',
		platform: toNonEmptyString(projectMeta.platform) || '',
		durationSec: typeof projectMeta.durationSec === 'number' ? projectMeta.durationSec : undefined,
		...(authoringRequest ? buildThinkForgeAuthoringCompatibilityMetadata(authoringRequest) : {}),
		...(editorialAngle ? { editorialAngle } : {}),
		tone: toNonEmptyString(projectMeta.tone) || 'blue',
		sessionName: toNonEmptyString(projectMeta.sessionName),
		originalPrompt: toNonEmptyString(projectMeta.originalPrompt),
		brandBrief: toNonEmptyString(projectMeta.brandBrief),
		...pickProjectMetaPassthrough(projectMeta),
	};
};

const bindActiveBrandToNewSession = (projectMeta: Record<string, unknown>): Record<string, unknown> => {
	if (toNonEmptyString(projectMeta.brandId)) return projectMeta;
	const brandId = getActiveBrandIdFromStorage();
	return brandId ? { ...projectMeta, brandId } : projectMeta;
};


export default function ThinkForgeLanding() {
	const { activeBrand, brands: availableBrands, isLoading: isBrandListLoading } = useActiveBrand();
	// Mode state
	const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ideation');

	const [prompt, setPrompt] = useState("");
	const [authoringRequest, setAuthoringRequest] = useState<ThinkForgeAuthoringRequest | null>(null);
	const [ideas, setIdeas] = useState<IdeaCardData[]>([]);
	const [loading, setLoading] = useState(false);
	// Overlay while opening an existing session from Library
	const [openingSession, setOpeningSession] = useState(false);
	// Bridge potential hydrate->state race by retaining the just-opened session id locally
	const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
	const [activeScriptId, setActiveScriptId] = useState<string>('default');
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	// URL-to-Brief state (multi-URL)
	const [briefLoading, setBriefLoading] = useState(false);
	const [briefResults, setBriefResults] = useState<Array<{ title: string; summary: string; keyTopics?: string[]; targetAudience?: string; suggestedAngles?: string[]; platform?: string; contentType?: string }> | null>(null);

	const [selectedIdea, setSelectedIdea] = useState<IdeaCardData | null>(null);
	// Internal phase for Ideation mode
	const [ideationPhase, setIdeationPhase] = useState<'PROMPT' | 'IDEAS'>('PROMPT');

	const [sessions, setSessions] = useState<SessionMeta[]>([]);
	const initialDraftRequestedRef = useRef(false);
	const successfulIdeaVariationRef = useRef(-1);
	const rejectedIdeasRef = useRef<Array<{ title: string; purpose: string; style: string }>>([]);
	const resumedSessionIdRef = useRef<string | null>(null);

	// Modular hooks
	const session = useThinkForgeSession();
	const activeSessionId = pendingSessionId || session.sessionId;
	const [tabsRefreshCounter, setTabsRefreshCounter] = useState(0);
	const scriptHook = useThinkForgeScript(activeSessionId, activeScriptId, session.hydratedScriptSnapshot);

	useEffect(() => {
		if (activeSessionId) {
			setActiveScriptId('default');
		}
	}, [activeSessionId]);

	useEffect(() => {
		if (workspaceMode !== 'scripting' || !selectedIdea) return;
		const pm = session.projectMeta || {};
		const projectAuthoringRequest = pm.authoringRequest === undefined
			? undefined
			: ThinkForgeAuthoringRequestSchema.parse(pm.authoringRequest);
		const projectEditorialAngle = resolveProjectMetaEditorialAngle(pm);
		const shouldPatch = (
			(!selectedIdea.sessionName && pm.sessionName) ||
			(!selectedIdea.idea && pm.idea) ||
			(!selectedIdea.purpose && pm.purpose) ||
			(!selectedIdea.style && pm.style) ||
			(!selectedIdea.format && pm.format) ||
			(!selectedIdea.platform && pm.platform) ||
			(!selectedIdea.tone && pm.tone) ||
			hasMissingProjectMetaPassthrough(selectedIdea, pm) ||
			(projectAuthoringRequest !== undefined
				&& JSON.stringify(selectedIdea.authoringRequest) !== JSON.stringify(projectAuthoringRequest)) ||
			(projectEditorialAngle !== undefined
				&& JSON.stringify(selectedIdea.editorialAngle) !== JSON.stringify(projectEditorialAngle))
		);
		if (!shouldPatch) return;
		setSelectedIdea({
			...selectedIdea,
			...pickProjectMetaPassthrough(pm),
			sessionName: selectedIdea.sessionName || pm.sessionName,
			idea: selectedIdea.idea || pm.idea || '',
			purpose: selectedIdea.purpose || pm.purpose || '',
			style: selectedIdea.style || pm.style || '',
			format: selectedIdea.format || pm.format || '',
			platform: selectedIdea.platform || pm.platform || '',
			...(projectAuthoringRequest
				? buildThinkForgeAuthoringCompatibilityMetadata(projectAuthoringRequest)
				: {}),
			...(projectEditorialAngle ? { editorialAngle: projectEditorialAngle } : {}),
			tone: (selectedIdea.tone || pm.tone || 'blue') as any,
		});
		if (projectAuthoringRequest) setAuthoringRequest(projectAuthoringRequest);
	}, [workspaceMode, selectedIdea, session.projectMeta]);

	useEffect(() => {
		const restoredSessionId = session.restoredSessionId;
		if (!restoredSessionId || session.isRestoringCurrentSession) return;
		if (session.sessionId !== restoredSessionId) return;
		if (resumedSessionIdRef.current === restoredSessionId) return;

		resumedSessionIdRef.current = restoredSessionId;
		setActiveScriptId('default');
		const restoredIdea = buildIdeaFromSessionMeta(restoredSessionId, session.projectMeta || {});
		setSelectedIdea(restoredIdea);
		setAuthoringRequest(restoredIdea.authoringRequest || null);
		setWorkspaceMode('scripting');
	}, [session.restoredSessionId, session.isRestoringCurrentSession, session.sessionId, session.projectMeta]);

	const panelRef = useRef<HTMLElement | null>(null);

	const generateIdeas = useCallback(async (
		promptOverride?: string,
		options?: {
			variationIndex?: number;
			rejectedIdeas?: Array<{ title: string; purpose: string; style: string }>;
			authoringRequest?: ThinkForgeAuthoringRequest;
		},
	) => {
		const ideaPrompt = promptOverride || prompt;
		if (!ideaPrompt.trim()) return;
		const request = options?.authoringRequest ?? authoringRequest;
		if (!request) {
			toast({
				title: 'Output type required',
				description: 'Choose an output type and platform before generating ideas.',
				variant: 'destructive',
			});
			return;
		}
		const validatedRequest = ThinkForgeAuthoringRequestSchema.parse(request);
		const brandScopeResolution = resolveThinkForgeIdeaBrandScope({
			activeBrandId: activeBrand?.brandId,
			availableBrandCount: availableBrands.length,
			brandListSettled: !isBrandListLoading,
		});
		if (brandScopeResolution.status !== 'ready') {
			toast({
				title: brandScopeResolution.status === 'pending' ? 'Brands are loading' : 'Brand selection required',
				description: brandScopeResolution.status === 'pending'
					? 'Wait for Brand Vault to finish loading, then try again.'
					: 'Select the brand this content belongs to before generating ideas.',
				variant: 'destructive',
			});
			return;
		}
		setAuthoringRequest(validatedRequest);
		const variationIndex = options?.variationIndex ?? 0;
		const rejectedIdeas = options?.rejectedIdeas || [];
		if (variationIndex === 0 && rejectedIdeas.length === 0) {
			successfulIdeaVariationRef.current = -1;
			rejectedIdeasRef.current = [];
		}
		setIdeas([]);
		setSelectedIdea(null);
		setIdeationPhase('IDEAS');
		setLoading(true);
		setHasSubmitted(true);
		try {
			const res = await fetch('/api/services/thinkforge/ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(createThinkForgeIdeaGenerationRequest({
					prompt: ideaPrompt,
					authoringRequest: validatedRequest,
					brandScope: brandScopeResolution.scope,
					variationIndex,
					rejectedIdeas,
				})),
			});
			// Handle insufficient credits (new credits system)
			if (res.status === 402) {
				const errData = await res.json().catch(() => ({}));
				toast({
					title: 'Insufficient Credits',
					description: `You need ${errData.required || 1} credits, but have ${errData.available || 0}.`,
					variant: 'destructive'
				});
				return; // do not proceed to IDEAS phase
			}
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				if (res.status === 409 && ['brand_context_required', 'brand_selection_required'].includes(errData?.code)) {
					const names = Array.isArray(errData.availableBrands)
						? errData.availableBrands.map((brand: any) => brand?.name).filter(Boolean).slice(0, 3).join(', ')
						: '';
					toast({
						title: 'Brand context needed',
						description: names ? `${errData.message} Available: ${names}.` : (errData.message || 'Select a brand before generating brand-specific ideas.'),
						variant: 'destructive',
					});
					return;
				}
				throw new Error(errData?.error || errData?.message || 'Idea generation failed');
			}
			const data = await res.json();
			const rawList: unknown[] = Array.isArray(data?.ideas) ? data.ideas : (Array.isArray(data) ? data : []);
			const list = rawList.map((rawIdea) => {
				if (!rawIdea || typeof rawIdea !== 'object') throw new Error('Idea generation returned an invalid idea');
				const idea = rawIdea as IdeaCardData;
				const returnedRequest = ThinkForgeAuthoringRequestSchema.parse(idea.authoringRequest);
				const returnedEditorialAngle = resolveProjectMetaEditorialAngle(idea);
				if (JSON.stringify(returnedRequest) !== JSON.stringify(validatedRequest)) {
					throw new Error('Idea generation returned a conflicting authoring request');
				}
				if (!returnedEditorialAngle) {
					throw new Error('Idea generation returned no editorial angle');
				}
				return {
					...idea,
					authoringRequest: returnedRequest,
					editorialAngle: returnedEditorialAngle,
				};
			});
			if (list.length !== 4) throw new Error('Idea generation returned an invalid idea set');
			successfulIdeaVariationRef.current = variationIndex;
			setIdeas(list.map((idea) => ({ ...idea, originalPrompt: ideaPrompt })));
			setIdeationPhase('IDEAS');
		} catch (error: any) {
			toast({
				title: 'Idea generation failed',
				description: error?.message || 'ThinkForge could not generate grounded ideas. Please try again.',
				variant: 'destructive',
			});
		} finally {
			setLoading(false);
		}
	}, [prompt, authoringRequest, activeBrand?.brandId, availableBrands.length, isBrandListLoading]);


	const onSubmit = (e: React.FormEvent, request: ThinkForgeAuthoringRequest) => {
		e.preventDefault();
		generateIdeas(undefined, { authoringRequest: request });
	};

	const regenerate = () => {
		if (loading) return;
		const rejectedIdeasByTitle = new Map(
			[...rejectedIdeasRef.current, ...ideas.map((idea) => ({
				title: idea.idea,
				purpose: idea.purpose,
				style: idea.style,
			}))].map((idea) => [idea.title.trim().toLowerCase(), idea]),
		);
		const rejectedIdeas = [...rejectedIdeasByTitle.values()].slice(-12);
		rejectedIdeasRef.current = rejectedIdeas;
		generateIdeas(undefined, {
			variationIndex: successfulIdeaVariationRef.current + 1,
			rejectedIdeas,
		});
	};

	/**
	 * Handle URL submission — analyze ALL URLs first, rebuild prompt, then generate ideas.
	 * 
	 * Flow:
	 * 1. Extract all URLs from the prompt
	 * 2. Analyze ALL URLs in parallel (wait for all to complete)
	 * 3. Rebuild the prompt: replace each URL with its brief inline, keeping user text
	 * 4. Update the prompt textarea with the enriched version
	 * 5. Generate ideas using the enriched prompt directly (no stale state)
	 */
	const handleUrlSubmit = useCallback(async (
		urls: string[],
		originalPrompt: string,
		request: ThinkForgeAuthoringRequest,
	) => {
		if (briefLoading || urls.length === 0) return;
		setBriefLoading(true);
		setBriefResults(null);
		try {
			// Step 1: Analyze ALL URLs in parallel — wait for ALL to complete
			const results = await Promise.allSettled(
				urls.map(async (url) => {
					const res = await fetch('/api/services/thinkforge/url-brief', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ url }),
					});
					if (res.status === 402) {
						const errData = await res.json().catch(() => ({}));
						throw new Error(`Insufficient credits: need ${errData.required || 1}, have ${errData.available || 0}`);
					}
					if (!res.ok) {
						const errData = await res.json().catch(() => ({ error: 'Failed' }));
						throw new Error(errData.error || 'Failed to extract brief');
					}
					const data = await res.json();
					return { url, brief: data.brief };
				})
			);

			// Step 2: Collect all successful briefs
			const successfulBriefs: Array<{ url: string; brief: any }> = [];
			const failedUrls: string[] = [];
			for (const result of results) {
				if (result.status === 'fulfilled' && result.value.brief) {
					successfulBriefs.push(result.value);
				} else {
					const reason = result.status === 'rejected' ? result.reason?.message : 'No brief returned';
					failedUrls.push(reason);
				}
			}

			if (successfulBriefs.length === 0) {
				toast({
					title: 'Brief extraction failed',
					description: failedUrls[0] || 'Could not extract content from any URL.',
					variant: 'destructive'
				});
				return;
			}

			if (failedUrls.length > 0) {
				toast({
					title: `${failedUrls.length} URL${failedUrls.length > 1 ? 's' : ''} failed`,
					description: 'Some URLs could not be analyzed. Proceeding with available briefs.',
				});
			}

			// Step 3: Store brief results for UI display
			setBriefResults(successfulBriefs.map(b => b.brief));

			// Step 4: Rebuild prompt — replace each URL with its brief inline
			let enrichedPrompt = originalPrompt;
			for (const { url, brief } of successfulBriefs) {
				const briefBlock = [
					`[Brief from ${brief.platform || 'Web'}: "${brief.title}"]`,
					brief.summary,
					`Key topics: ${(brief.keyTopics || []).join(', ')}`,
					`Angles: ${(brief.suggestedAngles || []).join(' | ')}`,
					`Audience: ${brief.targetAudience || 'General'}`,
				].join('\n');
				// Replace both the normalized URL and the bare domain form
				enrichedPrompt = enrichedPrompt.replace(url, briefBlock);
				const bareDomain = url.replace(/^https?:\/\//, '');
				if (enrichedPrompt.includes(bareDomain)) {
					enrichedPrompt = enrichedPrompt.replace(bareDomain, briefBlock);
				}
			}

			// Step 5: Update the textarea with the enriched prompt
			setPrompt(enrichedPrompt);

			// Step 6: Generate ideas with the enriched prompt DIRECTLY (bypasses stale state)
			await generateIdeas(enrichedPrompt, { authoringRequest: request });
		} catch (error) {
			console.error('[ThinkForge] URL brief extraction failed:', error);
			toast({
				title: 'URL extraction failed',
				description: 'Could not process URLs. Try pasting the content directly.',
				variant: 'destructive'
			});
		} finally {
			setBriefLoading(false);
		}
	}, [briefLoading, generateIdeas]);

	// Edge hover library trigger REMOVED — Library now only opens via the Dock button.
	// (The old code auto-opened the library when hovering near the right edge of the screen)

	const handleSelectIdea = async (idea: IdeaCardData) => {
		if (!resolveIdeaDocumentContract(idea)) {
			toast({
				title: 'Content format required',
				description: 'Choose a post, carousel, or video-script format before starting the draft.',
				variant: 'destructive',
			});
			return;
		}
		initialDraftRequestedRef.current = true;
		// Auto-generate a session name from the idea if not present
		const sessionName = idea.sessionName || (idea.idea || 'New Session').split('–')[0].trim().slice(0, 40);
		// Persist URL brief data into the idea so it survives the ideation→scripting transition
		const brandBrief = briefResults?.map(b => `${b.title}: ${b.summary}${b.keyTopics?.length ? ` | Topics: ${b.keyTopics.join(', ')}` : ''}${b.targetAudience ? ` | Audience: ${b.targetAudience}` : ''}`).join('\n') || undefined;
		const ideaWithName = { ...idea, sessionName, originalPrompt: idea.originalPrompt || prompt, brandBrief };
		setSelectedIdea(ideaWithName);
		// SKIP the session settings screen — go directly to the script editor
		try { await session.closeSession(); } catch (err) { console.warn('[ThinkForge] closeSession warning:', err); }
		scriptHook.resetSessionState();
		setPendingSessionId(null);
		setWorkspaceMode('scripting');
		setIdeationPhase('PROMPT');
		setIdeas([]);
		setHasSubmitted(false);
		setPrompt("");
		setAuthoringRequest(null);
	};

	const handleEnsureTrendSession = useCallback(async (candidate: TrendCandidate, authoringRequestInput: ThinkForgeAuthoringRequest): Promise<string | null> => {
		const authoringRequest = ThinkForgeAuthoringRequestSchema.parse(authoringRequestInput);
		const title = candidate.title.trim().slice(0, 80);
		const deliverable = describeThinkForgeAuthoringDeliverable(authoringRequest);
		const created = await session.hydrate({
			projectMeta: bindActiveBrandToNewSession({
				idea: 'Create the requested ' + deliverable + ' using the analyzed trend: ' + title,
				purpose: 'Apply an analyzed public trend format to a brand-specific original draft.',
				style: 'Original, brand-safe adaptation of the analyzed trend mechanics.',
				format: deliverable,
				contentContract: authoringRequest.contentContract,
				authoringRequest,
				platform: describeThinkForgePlatformSurface(authoringRequest.platformSurface),
				...(authoringRequest.targetDurationSec !== undefined ? { durationSec: authoringRequest.targetDurationSec } : {}),
				sessionName: ('Trend - ' + title).slice(0, 100),
				originalPrompt: 'Use the selected trend for the requested ' + deliverable + ': ' + title,
				initialDraftIntent: { status: 'pending', requestedAt: new Date().toISOString() },
			}),
		});
		if (created?.sessionId) {
			setPendingSessionId(created.sessionId);
			return created.sessionId;
		}
		return null;
	}, [session]);

	const handleTrendDraft = useCallback((input: { prompt: string; sessionId: string; target: TrendTarget; selectedTrend: SelectedTrend; authoringRequest: ThinkForgeAuthoringRequest }) => {
		const authoringRequest = ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest);
		const title = input.selectedTrend.candidate.title.trim();
		const analyzed = input.selectedTrend.analysis?.status === 'completed';
		const deliverable = describeThinkForgeAuthoringDeliverable(authoringRequest);
		setSelectedIdea({
			id: 'trend-' + input.selectedTrend.candidate.candidateId,
			idea: analyzed
				? 'Create the requested ' + deliverable + ' using the analyzed trend: ' + title
				: 'Create the requested ' + deliverable + ' inspired by the trend: ' + title,
			purpose: input.prompt,
			style: analyzed
				? 'Original, brand-safe adaptation of the analyzed trend mechanics.'
				: 'Original, brand-safe draft inspired by the trend topic and audience angle (no timing analysis was run).',
			format: deliverable,
			platform: describeThinkForgePlatformSurface(authoringRequest.platformSurface),
			tone: '',
			durationSec: authoringRequest.targetDurationSec,
			authoringRequest,
			sessionName: ('Trend - ' + title).slice(0, 100),
			originalPrompt: input.prompt,
		});
		initialDraftRequestedRef.current = false;
		setPendingSessionId(input.sessionId);
		setActiveScriptId('default');
		setIdeationPhase('PROMPT');
		setIdeas([]);
		setHasSubmitted(false);
		setPrompt('');
		setAuthoringRequest(authoringRequest);
		setWorkspaceMode('scripting');
	}, []);

	const handleUpdateIdea = async (updated: any) => {
		try {
			const trimmedName = (updated.sessionName || '').trim().slice(0, 100);
			const editorialAngle = synchronizeThinkForgeIdeaEditorialAngle(updated);
			updated = {
				...updated,
				sessionName: trimmedName,
				...(editorialAngle ? { editorialAngle } : {}),
			};
			if (!trimmedName) {
				toast({ title: 'Session name required', description: 'Please enter a Session name (max 100 chars).' });
				return;
			}
			// Update local state immediately for optimistic UI
			setSelectedIdea(updated);
			setIdeas((prev: IdeaCardData[]) => prev.map(i => i.id === updated.id ? updated : i));
			setSessions((prev) => prev.map((s) => s.id === updated.id ? { ...s, name: updated.sessionName || updated.idea || s.name, tone: updated.tone as any, lastEdited: Date.now() } : s));

			// Persist to localStorage for client-side persistence
			try {
				const stored = localStorage.getItem('thinkforge_ideas') || '[]';
				const parsed = JSON.parse(stored);
				const idx = parsed.findIndex((i: any) => i.id === updated.id);
				if (idx >= 0) {
					parsed[idx] = updated;
				} else {
					parsed.push(updated);
				}
				localStorage.setItem('thinkforge_ideas', JSON.stringify(parsed));
			} catch (e) {
				console.error('Failed to persist idea to localStorage:', e);
			}

			// Persist project meta (including sessionName) to the active session when available
			// Skip if we're still in ideation phase (no active session yet)
			const activeSessionId = session.sessionId || pendingSessionId;
			if (activeSessionId && workspaceMode === 'scripting') {
				const projectMetaPayload = buildProjectMetaPayload(
					updated,
					session.projectMeta?.initialDraftIntent as Record<string, unknown> | undefined,
				);

				try {
					const res = await fetch('/api/services/thinkforge/session/update', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							sessionId: activeSessionId,
							projectMeta: projectMetaPayload
						})
					});
					if (!res.ok) {
						console.error('Failed to persist session meta:', res.status, res.statusText);
					} else {
						// Keep hook state in sync so projectMeta consumers
						// (patch effect, StoryboardingMode, etc.) see the update
						// without waiting for a full re-hydrate.
						session.setProjectMeta(projectMetaPayload);
					}

					// Update local session cache so subsequent hydrations reflect the change
					try {
						const key = `thinkforge_session_${activeSessionId}`;
						const cached = JSON.parse(localStorage.getItem(key) || '{}');
						localStorage.setItem(key, JSON.stringify({ ...cached, projectMeta: projectMetaPayload }));
					} catch (cacheErr) { console.warn('[ThinkForge] localStorage cache warning:', cacheErr); }
				} catch (err) {
					console.error('Error saving session meta:', err);
				}
			}
		} catch (error) {
			console.error('Error updating idea:', error);
			// Optionally show error toast here
		}
	};

	// Create a session when entering SCRIPTING mode first time for selected idea
	useEffect(() => {
		if (workspaceMode === 'scripting' && selectedIdea) {
			setSessions(prev => {
				const existing = prev.find(s => s.id === selectedIdea.id);
				if (existing) return prev.map(s => s.id === existing.id ? { ...s, lastEdited: Date.now() } : s);
				// Prefer explicit Session name; fall back to idea text
				const base = (selectedIdea.sessionName || selectedIdea.idea || 'New Session').split('–')[0].trim();
				const name = base.length > 40 ? base.slice(0, 40) + '…' : base || 'New Session';
				return [...prev, { id: selectedIdea.id, name, tone: selectedIdea.tone, lastEdited: Date.now() }];
			});
		}
	}, [workspaceMode, selectedIdea]);

	// Hydrate backend session when entering SCRIPTING mode
	const hasHydratedRef = useRef(false);
	const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
	const isMountedRef = useRef(true);
	const hydratingRef = useRef(false);

	// Track mounted state for cleanup
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			// Clear any pending timers on unmount
			if (creationTimerRef.current) {
				clearTimeout(creationTimerRef.current);
				creationTimerRef.current = null;
			}
		};
	}, []);

	const currentSessionId = session.sessionId;
	const selectedIdeaId = selectedIdea?.id;

	useEffect(() => {
		if (workspaceMode !== 'scripting') return;
		if (!selectedIdea) return;
		if (currentSessionId || pendingSessionId) return;
		if (hasHydratedRef.current) return;
		if (hydratingRef.current) return;

		// Debounce creation slightly and cancel if user navigates away
		if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
		creationTimerRef.current = setTimeout(async () => {
			// Early exit if component unmounted during debounce window
			if (!isMountedRef.current) {
				console.warn('[ThinkForge] Hydration aborted - component unmounted');
				return;
			}
			if (workspaceMode !== 'scripting' || !selectedIdea) return;
			if (currentSessionId || pendingSessionId) return;
			if (hasHydratedRef.current) return;
			if (hydratingRef.current) return;

			hydratingRef.current = true;

			try {
				if (!isMountedRef.current) return;
				setOpeningSession(true);
				await session.closeSession();
				// Ensure UI is cleared before creating a fresh session
				scriptHook.resetSessionState();
				const initialDraftIntent = initialDraftRequestedRef.current
					? { status: 'pending', requestedAt: new Date().toISOString() }
					: undefined;
				const created = await session.hydrate({
					projectMeta: buildProjectMetaPayload(selectedIdea, initialDraftIntent),
				});
				// Check mount state after async operations
				if (!isMountedRef.current) {
					console.warn('[ThinkForge] Hydration completed but component unmounted - skipping state update');
					return;
				}
				if (created?.sessionId) {
					hasHydratedRef.current = true;
					initialDraftRequestedRef.current = false;
					setPendingSessionId(created.sessionId);
					scriptHook.resetSessionState();
				} else {
					// Hydration returned null - allow retry by NOT setting hasHydratedRef
					console.error('[ThinkForge] Hydration returned null, allowing retry');
					toast({
						title: 'Session creation failed',
						description: 'Could not create session. Please try again.',
						variant: 'destructive',
					});
				}
			} catch (err) {
				// Do NOT set hasHydratedRef on failure - allow retry
				console.error('[ThinkForge] Hydration failed:', err);
				if (isMountedRef.current) {
					toast({
						title: 'Session error',
						description: 'Failed to initialize session. Please try again.',
						variant: 'destructive',
					});
				}
			}
			finally {
				hydratingRef.current = false;
				if (isMountedRef.current) {
					setOpeningSession(false);
				}
			}
		}, 220);
	}, [workspaceMode, selectedIdeaId, currentSessionId, pendingSessionId]);

	// Clear temporary pendingSessionId once the hook has the active sessionId
	useEffect(() => {
		if (!openingSession && pendingSessionId && session.sessionId === pendingSessionId) {
			setPendingSessionId(null);
		}
	}, [openingSession, pendingSessionId, session.sessionId]);

	// Reset hydrate flag when idea changes
	useEffect(() => {
		hasHydratedRef.current = false;
		hydratingRef.current = false; // Also reset mutex on idea change
	}, [selectedIdeaId]);
	// Reset hydrate flag when leaving SCRIPTING
	useEffect(() => {
		if (workspaceMode !== 'scripting') {
			hasHydratedRef.current = false;
			hydratingRef.current = false; // Also reset mutex
			if (creationTimerRef.current) {
				clearTimeout(creationTimerRef.current);
				creationTimerRef.current = null;
			}
		}
	}, [workspaceMode]);

	const scriptFromHook: Script | null = useMemo(
		() => scriptModelToUiScript(scriptHook.script),
		[scriptHook.script],
	);

	// Handlers using autosave hook
	const handleApplyEdit = useCallback((updated: Script) => {
		const model = uiScriptToScriptModel(updated);
		if (!model) return;
		const metadata = ((updated as any).metadata || {}) as Record<string, unknown>;
		const isRemoteAiUpdate = metadata.source === 'ai';
		if (isRemoteAiUpdate) {
			scriptHook.setScriptWithoutSave(model);
			return;
		}
		scriptHook.setScriptAndQueueSave(model);
	}, [scriptHook]);

	// Handle script updates from ScriptEditor
	// NOTE: ScriptEditor already saves to backend via /script/blocks endpoint
	// We only update local state here - NO server save (to avoid double-saving)
	const handleUpdateScript = useCallback((updated: Script | null) => {
		if (!updated) return;
		// Use setScriptWithoutSave to update state without triggering another save
		// ScriptEditor handles all persistence directly
		const model = uiScriptToScriptModel(updated);
		if (!model) return;
		scriptHook.setScriptWithoutSave(model);
	}, [scriptHook]);

	// Dock items for ThinkForge features
	const dockItems = [
		{
			icon: FolderOpen,
			label: 'Projects',
			onClick: () => {
				toast({ title: 'Projects', description: 'Project management coming soon!' });
			}
		},
		{
			icon: Lightbulb,
			label: 'Ideation',
			onClick: () => {
				setWorkspaceMode('ideation');
			},
			active: workspaceMode === 'ideation'
		},
		{
			icon: FileText,
			label: 'Storyboarding',
			onClick: () => {
				if (!selectedIdea && workspaceMode !== 'scripting') {
					toast({ title: 'Storyboarding', description: 'Select an idea from Ideation to create a storyboard, or open one from Library.' });
				}
				setWorkspaceMode('scripting');
			},
			active: workspaceMode === 'scripting'
		},
		{
			icon: Calendar,
			label: 'Planning',
			onClick: () => {
				setWorkspaceMode('planning');
			},
			active: workspaceMode === 'planning'
		},
		{
			icon: Library,
			label: 'Library',
			onClick: () => setLibraryOpen(true)
		}
	];

	return (
		<div className="thinkforge-app">
			<PipelineBreadcrumb currentStep="script" />
			<BackgroundDecor />

			<LibraryPanel
				open={libraryOpen}
				onClose={() => setLibraryOpen(false)}
				panelRef={panelRef}
				activeSessionId={workspaceMode === 'scripting' ? (pendingSessionId || session.sessionId) : null}
				onDeleteSession={async (id) => {
					const active = (pendingSessionId || session.sessionId);
					if (active && id === active) {
						// If the deleted session is currently active, close it and reset UI
						await session.closeSession();
						setPendingSessionId(null);
						scriptHook.resetSessionState();
						setSelectedIdea(null);
						setIdeas([]);
						setHasSubmitted(false);
						setPrompt("");
						setAuthoringRequest(null);
						setIdeationPhase('PROMPT');
						setWorkspaceMode('ideation');
					}
				}}
				// When sessions prop is omitted, component fetches via hook
				onOpenSession={async (id) => {
					try {
						const openAction = resolveThinkForgeSessionOpenAction({
							targetSessionId: id,
							activeSessionId,
							workspaceMode,
							hasHydratedWorkspace: Boolean(
								selectedIdea
								&& matchesThinkForgeDocumentIdentity(scriptHook.script, {
									sessionId: id,
									scriptId: activeScriptId || 'default',
								}),
							),
						});
						if (openAction === 'focus_current') {
							setLibraryOpen(false);
							setWorkspaceMode('scripting');
							return;
						}

						// Ensure current script is saved before switching sessions
						if (scriptHook.script) {
							await scriptHook.autosave(scriptHook.script);
						}
						// Clear UI while switching to prevent stale hydration
						scriptHook.resetSessionState();
						setLibraryOpen(false);
						setOpeningSession(true);
						// Hydrate backend with target session and immediately use returned data
						const data = await session.hydrate({ sessionId: id, scriptId: 'default' });
						if (!data) { setOpeningSession(false); return; }
						const sid = data.sessionId;
						setPendingSessionId(sid);
						scriptHook.resetSessionState();
						const restoredIdea = buildIdeaFromSessionMeta(sid, data.projectMeta || {});
						setSelectedIdea(restoredIdea);
						setAuthoringRequest(restoredIdea.authoringRequest || null);
						// Switch to Script mode so ChatPanel mounts and loads recent chats
						setWorkspaceMode('scripting');
					} catch (err) {
						console.error('[ThinkForge] Failed to open session:', err);
						toast({
							title: 'Failed to open session',
							description: 'Could not load the selected session.',
							variant: 'destructive',
						});
					} finally {
						// Immediately clear overlay - no setTimeout for correctness
						setOpeningSession(false);
					}
				}}
			/>
			<AnimatePresence>
				{libraryOpen && (
					<motion.div
						className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => setLibraryOpen(false)}
					/>
				)}
			</AnimatePresence>

			<IdeationMode
				phase={ideationPhase}
				prompt={prompt}
				setPrompt={setPrompt}
				loading={loading}
				hasSubmitted={hasSubmitted}
				ideas={ideas}
				authoringRequest={authoringRequest}
				onSubmit={onSubmit}
				onRegenerate={regenerate}
				onSelectIdea={handleSelectIdea}
				sessionId={activeSessionId}
				onEnsureTrendSession={handleEnsureTrendSession}
				onTrendDraft={handleTrendDraft}
				isVisible={workspaceMode === 'ideation'}
				onUrlSubmit={handleUrlSubmit}
				briefLoading={briefLoading}
			/>

			<StoryboardingMode
				isVisible={workspaceMode === 'scripting'}
				selectedIdea={selectedIdea}
				sessionId={pendingSessionId || session.sessionId}
				scriptId={activeScriptId}
				tabsRefreshTrigger={tabsRefreshCounter}
				script={scriptFromHook}
				isScriptLoading={scriptHook.isLoading}
				initialChatMessages={
					session.hydratedChatSnapshot?.sessionId === activeSessionId
						? session.hydratedChatSnapshot.messages
						: undefined
				}
				isSaving={scriptHook.isSaving}
				onApplyEdit={handleApplyEdit}
				onUpdateScript={handleUpdateScript}
				onScriptCreated={(scriptId) => {
					setActiveScriptId(scriptId);
					setTabsRefreshCounter(c => c + 1);
					scriptHook.resetSessionState();
				}}
				onSwitchScript={async (scriptId) => {
					if (!activeSessionId) return;
					try {
						setOpeningSession(true);
						if (scriptHook.script) {
							await scriptHook.autosave(scriptHook.script);
						}
						setActiveScriptId(scriptId);
						scriptHook.resetSessionState();
					} catch (err) {
						console.error('[ThinkForge] Failed to switch script:', err);
					} finally {
						setOpeningSession(false);
					}
				}}
				onTabClose={(scriptId) => {
					if (!activeSessionId) return;
					if (activeScriptId === scriptId) {
						setActiveScriptId('default');
						scriptHook.resetSessionState();
					}
				}}
				onImportScript={async (data) => {
					try {
						const res = scriptHook.importScript(data);
						return res;
					} catch (e: any) {
						return { ok: false, error: e?.message || 'Import failed' };
					}
				}}
				onGoToIdeation={() => setWorkspaceMode('ideation')}
				onUpdateIdea={(updatedIdea) => {
					setSelectedIdea(updatedIdea);
					handleUpdateIdea({ ...updatedIdea, id: String(updatedIdea.id) });
				}}
			/>

			<PlanningMode
				isVisible={workspaceMode === 'planning'}
				onOpenScript={async (sessionId) => {
					try {
						// Close any existing session
						await session.closeSession();
						setPendingSessionId(null);
						scriptHook.resetSessionState();

						// Hydrate the session from content card
						const data = await session.hydrate({ sessionId, scriptId: 'default' });
						if (data?.sessionId) {
							setPendingSessionId(data.sessionId);
							scriptHook.resetSessionState();

							// Reconstruct idea from the same canonical metadata path used by Library.
							const pm = data.projectMeta || {};
							if (pm.idea) {
								const restoredIdea = buildIdeaFromSessionMeta(String(data.sessionId), pm);
								setSelectedIdea(restoredIdea);
								setAuthoringRequest(restoredIdea.authoringRequest || null);
							} else {
								setAuthoringRequest(null);
							}

							// Switch to SCRIPT mode
							setWorkspaceMode('scripting');
						}
					} catch (err) {
						toast({
							title: 'Failed to open script',
							description: 'Could not load the script session.',
							variant: 'destructive',
						});
					}
				}}
			/>

			{/* Full-screen loading overlay while opening a session from Library */}
			{openingSession && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
					<div className="flex flex-col items-center gap-4 text-white">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
						<p className="text-sm tracking-wide text-white/80">Script is loading...</p>
					</div>
				</div>
			)}

			{/* ThinkForge Dock */}
			<Dock items={dockItems} />
		</div>
	);
}
