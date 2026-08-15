/**
 * Multi-Hop Context Retrieval
 *
 * Fetches context from three memory tiers before prompt assembly:
 *   1. Cold  – BrandDNA (Voice Lock, Kill List, habits) from MongoDB
 *   2. Warm  – Semantically relevant DataBank facts via tag/keyword matching
 *   3. Hot   – Recent interaction events (rejections, corrections)
 *
 * The output is a `RetrievedContext` object consumed by `assembleContext`.
 */

import { serializeFingerprint, serializeExemplars } from '../data/voice-signature';
import {
  getAuthorizedDataBankEntries,
  getAuthorizedDataBankEntriesByIds,
  getAuthorizedProjectScopedEntries,
  getRecentInteractionEvents,
  type BrandDNA,
  type DataBankEntry,
  type DataBankPrincipal,
  type ThinkForgeEvent,
  type EventType,
} from '../services/db';
import { isVectorRetrievalConfigured, queryRelevantFacts } from '../services/embedding-service';
import type { BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import { brandSignalProfileToBrandDNA } from '@/lib/shared/brand-signal-profile-adapter';
import { buildRichBrandContextBlock } from '@/lib/shared/brand-context-block';
import {
  resolveThinkForgeBrandAuthority,
  type ThinkForgeBrandAuthority,
} from './brand-authoring-context';

// ==================== Types ====================

export interface RetrievedContext {
  brandDNA: BrandDNA;
  brandSignalProfile?: BrandSignalProfile | null;
  /** Current, ACL-authorized Brand Vault record used for this authoring request. */
  brandAuthority?: ThinkForgeBrandAuthority | null;
  projectFacts: SemanticFact[];
  globalFacts: SemanticFact[];
  /** @deprecated Use projectFacts + globalFacts */
  semanticFacts: SemanticFact[];
  interactionPatterns: InteractionPattern[];
  /** Privacy-safe operational truth for every optional retrieval channel. */
  retrievalDiagnostics?: ContextRetrievalDiagnostics;
}

export type ContextRetrievalStatus =
  | 'succeeded'
  | 'empty'
  | 'skipped'
  | 'timed_out'
  | 'failed'
  | 'unknown';

export type ContextRetrievalReason =
  | 'session_not_provided'
  | 'query_not_provided'
  | 'provider_not_configured'
  | 'deadline_exceeded'
  | 'dependency_error'
  | 'diagnostics_unavailable';

export interface ContextRetrievalDiagnostic {
  status: ContextRetrievalStatus;
  itemCount: number;
  durationMs: number;
  reason?: ContextRetrievalReason;
}

export interface ContextRetrievalDiagnostics {
  version: 1;
  projectFacts: ContextRetrievalDiagnostic;
  globalVector: ContextRetrievalDiagnostic;
  globalKeyword: ContextRetrievalDiagnostic;
  interactionPatterns: ContextRetrievalDiagnostic;
}

export interface SemanticFact {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  source?: string;
}

export interface InteractionPattern {
  type: string;
  summary: string;
  count: number;
}

export interface FetchContextOptions {
  userId: string;
  projectId?: string;
  sessionId?: string;
  /** Current brand scope. Brand-scoped global memory is visible only when this matches. */
  brandId?: string;
  /** Active org for Brand Vault scoping; null/undefined keeps personal behavior. */
  orgId?: string | null;
  /** Agency admins may author from restricted brands in their active organization. */
  isOrgAdmin?: boolean;
  /** The current user prompt – used to match relevant facts by keyword overlap */
  currentPrompt?: string;
  /** Current script content – used for keyword extraction */
  currentScript?: string;
  /** Max facts to retrieve from the Warm tier */
  maxFacts?: number;
  /** How far back to look for interaction events */
  interactionWindowDays?: number;
}

// ==================== Keyword Extraction ====================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'or', 'if', 'while', 'because', 'until', 'about', 'it',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'she', 'they', 'them', 'what', 'which', 'who', 'whom',
  'make', 'write', 'script', 'add', 'change', 'update', 'create', 'use',
]);

function extractKeywords(text: string, maxKeywords: number = 15): string[] {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ==================== Timeout Helper ====================

const TIER_TIMEOUT_MS = 3000;

class ContextRetrievalDeadlineError extends Error {
  constructor() {
    super('Context retrieval deadline exceeded.');
    this.name = 'ContextRetrievalDeadlineError';
  }
}

type ContextRetrievalExecution<T> = {
  items: T[];
  diagnostic: ContextRetrievalDiagnostic;
};

function skippedRetrieval<T>(reason: ContextRetrievalReason): ContextRetrievalExecution<T> {
  return {
    items: [],
    diagnostic: { status: 'skipped', itemCount: 0, durationMs: 0, reason },
  };
}

async function executeRetrieval<T>(operation: () => Promise<T[]>): Promise<ContextRetrievalExecution<T>> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const items = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new ContextRetrievalDeadlineError()), TIER_TIMEOUT_MS);
      }),
    ]);
    return {
      items,
      diagnostic: {
        status: items.length > 0 ? 'succeeded' : 'empty',
        itemCount: items.length,
        durationMs: Math.max(0, Date.now() - startedAt),
      },
    };
  } catch (error) {
    const timedOut = error instanceof ContextRetrievalDeadlineError;
    return {
      items: [],
      diagnostic: {
        status: timedOut ? 'timed_out' : 'failed',
        itemCount: 0,
        durationMs: Math.max(0, Date.now() - startedAt),
        reason: timedOut ? 'deadline_exceeded' : 'dependency_error',
      },
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// ==================== Cold Tier: BrandDNA ====================

async function fetchColdContext(
  userId: string,
  brandId?: string,
  orgId?: string | null,
  isOrgAdmin?: boolean,
): Promise<{
  brandDNA: BrandDNA;
  brandSignalProfile: BrandSignalProfile | null;
  brandAuthority: ThinkForgeBrandAuthority | null;
}> {
  if (brandId) {
    const brandAuthority = await resolveThinkForgeBrandAuthority({
      userId,
      orgId: orgId ?? null,
      isOrgAdmin,
      brandId,
    });
    if (!brandAuthority) {
      throw new Error('A selected Brand Vault profile could not be resolved.');
    }
    return {
      brandDNA: brandSignalProfileToBrandDNA<BrandDNA>(brandAuthority.profile, {}),
      brandSignalProfile: brandAuthority.profile,
      brandAuthority,
    };
  }

  // A brand is an explicit session decision. The legacy BrandDNA projection can
  // describe a past scan and must never be guessed into a new, unbound request.
  return { brandDNA: {}, brandSignalProfile: null, brandAuthority: null };
}

// ==================== Warm Tier: Semantic Facts ====================

/**
 * Fetch project-scoped facts for the current session (exact match, no semantic search).
 */
async function fetchProjectContext(
  principal: DataBankPrincipal,
  sessionId: string,
  maxFacts: number,
): Promise<SemanticFact[]> {
  const entries = await getAuthorizedProjectScopedEntries(principal, sessionId, { limit: maxFacts });
  return entries.map((entry) => ({
    id: entry._id,
    title: entry.title,
    summary: extractSummary(entry),
    tags: entry.tags || [],
    source: entry.sourceUrl,
  }));
}

async function fetchWarmVectorContext(
  principal: DataBankPrincipal,
  queryText: string,
  maxFacts: number,
  scope?: 'project' | 'global',
  brandId?: string,
): Promise<SemanticFact[]> {
  const normalizedQueryText = queryText.trim();
  if (!normalizedQueryText) return [];

  const vectorPlans = scope === 'global'
    ? [
        ...(brandId ? [{ brandId, memoryScope: 'brand' as const }] : []),
        { memoryScope: 'universal' as const },
      ]
    : [undefined];
  const vectorResults = dedupeVectorResults(
    (await Promise.all(
      vectorPlans.map((plan) => queryRelevantFacts(principal, normalizedQueryText, maxFacts, scope, plan)),
    )).flat(),
  );
  if (vectorResults.length === 0) return [];

  const matchedIds = vectorResults.map((result) => result.id);
  const entries = await getAuthorizedDataBankEntriesByIds(matchedIds, principal);
  const entryMap = new Map<string, DataBankEntry>();
  for (const entry of entries) entryMap.set(entry._id.toString(), entry);

  const orderedEntries = vectorResults
    .filter((result) => entryMap.has(result.id))
    .map((result) => entryMap.get(result.id)!);
  const visibleEntries = scope === 'global'
    ? orderedEntries.filter((entry) => isVisibleGlobalEntry(entry, brandId))
    : orderedEntries;

  return visibleEntries.slice(0, maxFacts).map((entry) => ({
    id: entry._id.toString(),
    title: entry.title,
    summary: extractSummary(entry),
    tags: entry.tags || [],
    source: entry.sourceUrl,
  }));
}

function dedupeVectorResults<T extends { id: string; score: number }>(results: T[]): T[] {
  const highestById = new Map<string, T>();
  for (const result of results) {
    const existing = highestById.get(result.id);
    if (!existing || result.score > existing.score) highestById.set(result.id, result);
  }
  return [...highestById.values()].sort((a, b) => b.score - a.score);
}

function dedupeSemanticFacts(facts: SemanticFact[]): SemanticFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

function prioritizeGlobalFacts(
  facts: SemanticFact[],
  brandId: string | undefined,
  maxFacts: number,
): SemanticFact[] {
  if (!brandId) return facts.slice(0, maxFacts);
  const activeBrandFacts = facts.filter((fact) => fact.tags.includes(`brand:${brandId}`));
  const universalFacts = facts.filter((fact) => !fact.tags.includes(`brand:${brandId}`));
  return [...activeBrandFacts, ...universalFacts].slice(0, maxFacts);
}

function scoreEntryByKeywords(entry: DataBankEntry, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const entryText = [
    entry.title,
    ...(entry.tags || []),
    typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const kw of keywords) {
    if (entryText.includes(kw)) score++;
  }
  return score / keywords.length;
}

async function fetchWarmKeywordContext(
  principal: DataBankPrincipal,
  keywords: string[],
  maxFacts: number,
  brandId?: string,
): Promise<SemanticFact[]> {
  const entries = await getAuthorizedDataBankEntries(principal, { limit: 200, scope: 'global' });
  if (entries.length === 0) return [];

  const scored = entries
    .filter((entry) => isVisibleGlobalEntry(entry, brandId))
    .map((e) => ({ entry: e, score: scoreEntryByKeywords(e, keywords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFacts);

  return scored.map(({ entry }) => ({
    id: entry._id,
    title: entry.title,
    summary: extractSummary(entry),
    tags: entry.tags || [],
    source: entry.sourceUrl,
  }));
}

function extractSummary(entry: DataBankEntry): string {
  const c: any = entry.content;
  if (typeof c === 'string') return (c as string).slice(0, 300);
  if (c?.summary) return String(c.summary).slice(0, 300);
  if (c?.text) return String(c.text).slice(0, 300);
  if (c?.claim) return String(c.claim).slice(0, 300);
  return entry.title;
}

function isVisibleGlobalEntry(entry: DataBankEntry, brandId?: string): boolean {
  if (entry.scope !== 'global') return false;
  if (entry.provenanceStatus === 'quarantined') return false;
  const memoryScope = getEntryMemoryScope(entry);
  const entryBrandId = getEntryBrandId(entry);
  if (memoryScope === 'universal') return !entryBrandId;
  if (memoryScope !== 'brand') return false;
  return Boolean(brandId && entryBrandId === brandId);
}

function getEntryMemoryScope(entry: DataBankEntry): 'brand' | 'universal' | undefined {
  const firstClassScope = entry.memoryScope === 'brand' || entry.memoryScope === 'universal'
    ? entry.memoryScope
    : undefined;
  const taggedScopes = new Set(
    (entry.tags ?? [])
      .filter((tag) => tag === 'memory:brand' || tag === 'memory:universal')
      .map((tag) => tag.slice('memory:'.length)),
  );
  if (taggedScopes.size > 1) return undefined;
  const taggedScope = taggedScopes.size === 1
    ? [...taggedScopes][0] as 'brand' | 'universal'
    : undefined;
  const postMortemScope = trustedLegacyPostMortemMetadata(entry)?.memoryScope;
  const scopes = new Set(
    [firstClassScope, taggedScope, postMortemScope]
      .filter((scope): scope is 'brand' | 'universal' => scope === 'brand' || scope === 'universal'),
  );
  if (scopes.size !== 1) return undefined;
  return [...scopes][0];
}

function trustedLegacyPostMortemMetadata(entry: DataBankEntry): {
  memoryScope: 'brand' | 'universal';
  brandId?: string;
} | undefined {
  const content = entry.content as Record<string, unknown> | undefined;
  if (content?.source !== 'post-mortem') return undefined;
  const memoryScope = content.memoryScope;
  const brandId = typeof content.brandId === 'string' && content.brandId.trim()
    ? content.brandId.trim()
    : undefined;
  if (memoryScope === 'brand' && brandId) return { memoryScope, brandId };
  if (memoryScope === 'universal' && !brandId) return { memoryScope };
  return undefined;
}

function getEntryBrandId(entry: DataBankEntry): string | undefined {
  const taggedBrandIds = (entry.tags ?? [])
    .filter((tag) => tag.startsWith('brand:'))
    .map((tag) => tag.slice('brand:'.length).trim())
    .filter(Boolean);
  const brandIds = new Set([
    typeof entry.brandId === 'string' && entry.brandId.trim() ? entry.brandId.trim() : undefined,
    ...taggedBrandIds,
    trustedLegacyPostMortemMetadata(entry)?.brandId,
  ].filter((brandId): brandId is string => Boolean(brandId)));
  return brandIds.size === 1 ? [...brandIds][0] : undefined;
}

// ==================== Hot Tier: Interaction Patterns ====================

const INTERACTION_TYPES: EventType[] = [
  'content_deleted',
  'hook_rejected',
  'style_corrected',
  'regeneration_requested',
  'feedback_given',
];

async function fetchHotContext(
  userId: string,
  windowDays: number,
  projectId?: string,
): Promise<InteractionPattern[]> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const events = await getRecentInteractionEvents(userId, {
    projectId,
    types: INTERACTION_TYPES,
    limit: 200,
    since,
  });
  if (events.length === 0) return [];

  const grouped = new Map<string, ThinkForgeEvent[]>();
  for (const event of events) {
    const existing = grouped.get(event.type) || [];
    existing.push(event);
    grouped.set(event.type, existing);
  }

  const patterns: InteractionPattern[] = [];
  for (const [type, eventsForType] of grouped) {
    patterns.push({
      type,
      summary: summarizeEvents(type as EventType, eventsForType),
      count: eventsForType.length,
    });
  }
  return patterns.sort((a, b) => b.count - a.count);
}

function summarizeEvents(type: EventType, events: ThinkForgeEvent[]): string {
  const payloads = events
    .slice(0, 5)
    .map((e) => e.payload?.reason || e.payload?.feedback || e.payload?.deletedText || '')
    .filter(Boolean);

  switch (type) {
    case 'hook_rejected':
      return `User rejected ${events.length} hook(s). Recent reasons: ${payloads.join('; ') || 'none given'}`;
    case 'content_deleted':
      return `User deleted content ${events.length} time(s). Patterns: ${payloads.join('; ') || 'various'}`;
    case 'style_corrected':
      return `User gave ${events.length} style correction(s): ${payloads.join('; ') || 'various'}`;
    case 'regeneration_requested':
      return `User requested regeneration ${events.length} time(s)`;
    case 'feedback_given':
      return `User feedback (${events.length}): ${payloads.join('; ') || 'various'}`;
    default:
      return `${events.length} event(s) of type ${type}`;
  }
}

// ==================== Main Entry Point ====================

/**
 * Perform Multi-Hop Retrieval across all memory tiers.
 *
 * Call this BEFORE `assembleContext()` to enrich the context with
 * the user's BrandDNA, relevant semantic facts, and interaction patterns.
 */
export async function fetchContextSources(
  options: FetchContextOptions,
): Promise<RetrievedContext> {
  const {
    userId,
    projectId,
    sessionId,
    brandId,
    orgId,
    isOrgAdmin,
    currentPrompt,
    currentScript,
    maxFacts = 5,
    interactionWindowDays = 30,
  } = options;

  const combinedText = [currentPrompt || '', currentScript || ''].join(' ').trim();
  const keywords = extractKeywords(combinedText);
  const hasRetrievalQuery = combinedText.length > 0;
  const vectorConfigured = isVectorRetrievalConfigured();
  const principal: DataBankPrincipal = { userId, orgId: orgId ?? null };

  const [brandResolution, projectResult, vectorResult, keywordResult, interactionResult] = await Promise.all([
    fetchColdContext(userId, brandId, orgId, isOrgAdmin),
    sessionId
      ? executeRetrieval(() => fetchProjectContext(principal, sessionId, maxFacts))
      : Promise.resolve(skippedRetrieval<SemanticFact>('session_not_provided')),
    !hasRetrievalQuery
      ? Promise.resolve(skippedRetrieval<SemanticFact>('query_not_provided'))
      : !vectorConfigured
        ? Promise.resolve(skippedRetrieval<SemanticFact>('provider_not_configured'))
        : executeRetrieval(() => fetchWarmVectorContext(principal, combinedText, maxFacts, 'global', brandId)),
    hasRetrievalQuery
      ? executeRetrieval(() => fetchWarmKeywordContext(principal, keywords, maxFacts, brandId))
      : Promise.resolve(skippedRetrieval<SemanticFact>('query_not_provided')),
    executeRetrieval(() => fetchHotContext(userId, interactionWindowDays, projectId)),
  ]);
  const projectFacts = projectResult.items;
  const globalFacts = prioritizeGlobalFacts(
    dedupeSemanticFacts([...vectorResult.items, ...keywordResult.items]),
    brandId,
    maxFacts,
  );
  const interactionPatterns = interactionResult.items;

  return {
    brandDNA: brandResolution.brandDNA,
    brandSignalProfile: brandResolution.brandSignalProfile,
    brandAuthority: brandResolution.brandAuthority,
    projectFacts,
    globalFacts,
    semanticFacts: [...projectFacts, ...globalFacts],
    interactionPatterns,
    retrievalDiagnostics: {
      version: 1,
      projectFacts: projectResult.diagnostic,
      globalVector: vectorResult.diagnostic,
      globalKeyword: keywordResult.diagnostic,
      interactionPatterns: interactionResult.diagnostic,
    },
  };
}

/**
 * Format retrieved context into a compact string for the System Brief.
 * This is injected at the TOP of the assembled context prompt.
 */
export function formatSystemBrief(ctx: RetrievedContext): string {
  const parts: string[] = [];

  // A selected brand always comes from its current accepted Brand Vault record.
  // Unbound authoring intentionally has no inferred brand context.
  const dna = ctx.brandDNA;
  if (ctx.brandAuthority) {
    parts.push(
      [
        '## Accepted Brand Vault Profile',
        buildRichBrandContextBlock(ctx.brandAuthority.profile),
        `Profile provenance: ${ctx.brandAuthority.recordId}; current as of ${ctx.brandAuthority.profileUpdatedAt}.`,
      ].join('\n'),
    );
  } else {
    const dnaLines: string[] = [];
    if (dna.voiceLock) dnaLines.push(`Voice: ${dna.voiceLock}`);
    if (dna.nicheMap) dnaLines.push(`Audience: ${dna.nicheMap}`);
    if (dna.killList?.length) dnaLines.push(`Never mention: ${dna.killList.join(', ')}`);
    if (dna.hookArchetypes?.length) dnaLines.push(`Hook styles: ${dna.hookArchetypes.join(', ')}`);
    if (dna.structuralHabits?.length) dnaLines.push(`Structure: ${dna.structuralHabits.join(', ')}`);
    if (dnaLines.length > 0) {
      parts.push(`## Brand DNA\n${dnaLines.join('\n')}`);
    }
  }

  // Layer 2: Voice Fingerprint (statistical patterns from reference samples)
  if (dna.voiceFingerprint) {
    parts.push(serializeFingerprint(dna.voiceFingerprint));
  }

  // Layer 3: Voice Exemplars (signal-aware few-shot)
  if (dna.voiceExemplars?.length) {
    parts.push(serializeExemplars(dna.voiceExemplars));
  }

  if (ctx.projectFacts.length > 0) {
    const factLines = ctx.projectFacts.map(
      (f) => `- ${f.title}: ${f.summary}${f.source ? ` [source](${f.source})` : ''}`,
    );
    parts.push(`## Current Project Knowledge\n${factLines.join('\n')}`);
  }

  if (ctx.globalFacts.length > 0) {
    const factLines = ctx.globalFacts.map(
      (f) => `- ${f.title}: ${f.summary}${f.source ? ` [source](${f.source})` : ''}`,
    );
    parts.push(`## Relevant Saved Facts\n${factLines.join('\n')}`);
  }

  // Interaction patterns
  if (ctx.interactionPatterns.length > 0) {
    const patternLines = ctx.interactionPatterns.map((p) => `- ${p.summary}`);
    parts.push(`## User Preferences (learned)\n${patternLines.join('\n')}`);
  }

  return parts.join('\n\n');
}
