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
  resolveEffectiveBrandDNA,
  getDataBankEntriesByUser,
  getDataBankEntriesByIds,
  getProjectScopedEntries,
  getRecentInteractionEvents,
  type BrandDNA,
  type DataBankEntry,
  type ThinkForgeEvent,
  type EventType,
} from '../services/db';
import { queryRelevantFacts } from '../services/embedding-service';

// ==================== Types ====================

export interface RetrievedContext {
  brandDNA: BrandDNA;
  projectFacts: SemanticFact[];
  globalFacts: SemanticFact[];
  /** @deprecated Use projectFacts + globalFacts */
  semanticFacts: SemanticFact[];
  interactionPatterns: InteractionPattern[];
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

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIER_TIMEOUT_MS)),
  ]);
}

// ==================== Cold Tier: BrandDNA ====================

async function fetchColdContext(
  userId: string,
  projectId?: string,
): Promise<BrandDNA> {
  try {
    return await resolveEffectiveBrandDNA(userId, projectId);
  } catch (error) {
    console.warn('[fetchContextSources] Cold fetch failed, using empty BrandDNA:', error);
    return {};
  }
}

// ==================== Warm Tier: Semantic Facts ====================

/**
 * Fetch project-scoped facts for the current session (exact match, no semantic search).
 */
async function fetchProjectContext(
  userId: string,
  sessionId: string,
  maxFacts: number,
): Promise<SemanticFact[]> {
  try {
    const entries = await getProjectScopedEntries(userId, sessionId, { limit: maxFacts });
    return entries.map((entry) => ({
      id: entry._id,
      title: entry.title,
      summary: extractSummary(entry),
      tags: entry.tags || [],
      source: entry.sourceUrl,
    }));
  } catch (error) {
    console.warn('[fetchContextSources] Project fetch failed:', error);
    return [];
  }
}

/**
 * Vector-first retrieval with keyword fallback. Searches only global-scoped facts.
 */
async function fetchGlobalContext(
  userId: string,
  keywords: string[],
  maxFacts: number,
  queryText: string,
): Promise<SemanticFact[]> {
  try {
    const vectorResults = await fetchWarmVectorContext(userId, queryText, maxFacts, 'global');
    if (vectorResults.length > 0) return vectorResults;

    return await fetchWarmKeywordContext(userId, keywords, maxFacts);
  } catch (error) {
    console.warn('[fetchContextSources] Global fetch failed:', error);
    return [];
  }
}

async function fetchWarmVectorContext(
  userId: string,
  queryText: string,
  maxFacts: number,
  scope?: 'project' | 'global',
): Promise<SemanticFact[]> {
  if (!queryText.trim()) return [];

  try {
    const vectorResults = await queryRelevantFacts(userId, queryText, maxFacts, scope);
    if (vectorResults.length === 0) return [];

    const matchedIds = vectorResults.map((r) => r.id);
    const entries = await getDataBankEntriesByIds(matchedIds, userId);

    const entryMap = new Map<string, DataBankEntry>();
    for (const e of entries) entryMap.set(e._id.toString(), e);

    const orderedEntries = vectorResults
      .filter((r) => entryMap.has(r.id))
      .map((r) => entryMap.get(r.id)!);

    return orderedEntries.map((entry) => ({
      id: entry._id.toString(),
      title: entry.title,
      summary: extractSummary(entry),
      tags: entry.tags || [],
      source: entry.sourceUrl,
    }));
  } catch (error) {
    console.warn('[fetchContextSources] Upstash Vector query failed:', error);
    return [];
  }
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
  userId: string,
  keywords: string[],
  maxFacts: number,
): Promise<SemanticFact[]> {
  const entries = await getDataBankEntriesByUser(userId, { limit: 200 });
  if (entries.length === 0) return [];

  const scored = entries
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
  try {
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
    for (const [type, evts] of grouped) {
      patterns.push({
        type,
        summary: summarizeEvents(type as EventType, evts),
        count: evts.length,
      });
    }

    return patterns.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.warn('[fetchContextSources] Hot fetch failed:', error);
    return [];
  }
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
    currentPrompt,
    currentScript,
    maxFacts = 5,
    interactionWindowDays = 30,
  } = options;

  const combinedText = [currentPrompt || '', currentScript || ''].join(' ');
  const keywords = extractKeywords(combinedText);

  const [brandDNA, projectFacts, globalFacts, interactionPatterns] = await Promise.all([
    fetchColdContext(userId, projectId),
    withTimeout(
      sessionId ? fetchProjectContext(userId, sessionId, maxFacts) : Promise.resolve([]),
      [],
    ),
    withTimeout(
      fetchGlobalContext(userId, keywords, maxFacts, combinedText),
      [],
    ),
    withTimeout(
      fetchHotContext(userId, interactionWindowDays, projectId),
      [],
    ),
  ]);

  return {
    brandDNA,
    projectFacts,
    globalFacts,
    semanticFacts: [...projectFacts, ...globalFacts],
    interactionPatterns,
  };
}

/**
 * Format retrieved context into a compact string for the System Brief.
 * This is injected at the TOP of the assembled context prompt.
 */
export function formatSystemBrief(ctx: RetrievedContext): string {
  const parts: string[] = [];

  // BrandDNA section
  const dna = ctx.brandDNA;
  const dnaLines: string[] = [];
  if (dna.voiceLock) dnaLines.push(`Voice: ${dna.voiceLock}`);
  if (dna.nicheMap) dnaLines.push(`Audience: ${dna.nicheMap}`);
  if (dna.killList?.length) dnaLines.push(`Never mention: ${dna.killList.join(', ')}`);
  if (dna.hookArchetypes?.length) dnaLines.push(`Hook styles: ${dna.hookArchetypes.join(', ')}`);
  if (dna.structuralHabits?.length) dnaLines.push(`Structure: ${dna.structuralHabits.join(', ')}`);
  if (dnaLines.length > 0) {
    parts.push(`## Brand DNA\n${dnaLines.join('\n')}`);
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
    parts.push(`## Global Knowledge Vault\n${factLines.join('\n')}`);
  }

  // Interaction patterns
  if (ctx.interactionPatterns.length > 0) {
    const patternLines = ctx.interactionPatterns.map((p) => `- ${p.summary}`);
    parts.push(`## User Preferences (learned)\n${patternLines.join('\n')}`);
  }

  return parts.join('\n\n');
}
