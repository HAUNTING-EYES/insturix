/**
 * Embedding Service (Upstash Vector)
 *
 * Uses Upstash Vector with Native Embeddings to store and query semantic facts.
 * Ensure the Upstash Vector Index is configured with an embedding model (e.g. bge-m3).
 */

import { Index } from '@upstash/vector';
import {
  claimDataBankEntriesForEmbedding,
  claimDataBankEntryForEmbedding,
  completeDataBankEmbedding,
  failDataBankEmbedding,
  updateDataBankEmbeddingStatus,
  DATA_BANK_EMBEDDING_METADATA_VERSION,
  type DataBankEntry,
  type DataBankMemoryScope,
  type DataBankPrincipal,
} from './db';

export function getVectorIndex() {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  
  if (!url || !token) {
    throw new Error('UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN must be set in .env.local');
  }

  return new Index({ url, token });
}

/**
 * Vector retrieval is an optional enhancement for ThinkForge context. Callers
 * use this to distinguish an intentionally unconfigured provider from a
 * configured provider that has actually failed.
 */
export function isVectorRetrievalConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_VECTOR_REST_URL?.trim()
    && process.env.UPSTASH_VECTOR_REST_TOKEN?.trim(),
  );
}

function entryToText(entry: DataBankEntry): string {
  const parts = [entry.title];
  if (entry.tags?.length) parts.push(entry.tags.join(', '));
  const content = entry.content as unknown;
  if (typeof content === 'string') {
    parts.push(content.slice(0, 1000));
  } else if (content && typeof content === 'object') {
    const c = content as Partial<Record<'claim' | 'summary' | 'text', unknown>>;
    if (c.claim) parts.push(String(c.claim));
    if (c.summary) parts.push(String(c.summary).slice(0, 800));
    if (c.text) parts.push(String(c.text).slice(0, 800));
  }
  return parts.join(' — ');
}

export class DataBankEmbeddingAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataBankEmbeddingAuthorityError';
  }
}

export function buildDataBankVectorMetadata(
  entry: DataBankEntry,
  now = new Date(),
): Record<string, string | number> {
  const userId = entry.userId?.trim();
  if (!userId || entry.provenanceStatus !== 'verified') {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding requires verified owner provenance.');
  }
  const ownerType = entry.ownerType;
  const orgId = entry.orgId?.trim();
  if (ownerType !== 'user' && ownerType !== 'organization') {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding requires exact owner authority.');
  }
  if ((ownerType === 'organization' && !orgId) || (ownerType === 'user' && Boolean(orgId))) {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding requires exact owner authority.');
  }
  if (entry.lifecycleStatus !== 'active') {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding requires active lifecycle state.');
  }
  if (entry.classification === 'child_data' || !entry.classification) {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding classification is not allowed.');
  }
  if (entry.consentStatus === 'withdrawn' || !entry.consentStatus
    || (entry.classification === 'personal' && entry.consentStatus !== 'granted')) {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding consent is not valid.');
  }
  if (!Number.isFinite(now.getTime())
    || isDataBankDateElapsed(entry.freshUntil, now)
    || isDataBankDateElapsed(entry.expiresAt, now)) {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding retention window is not current.');
  }

  const scope = entry.scope;
  const memoryScope = entry.memoryScope;
  const brandId = entry.brandId?.trim();
  if (scope === 'project') {
    if (memoryScope !== 'project' || (!entry.sessionId?.trim() && !entry.projectId?.trim())) {
      throw new DataBankEmbeddingAuthorityError('Project memory requires exact project ownership.');
    }
  } else if (scope === 'global' && memoryScope === 'brand') {
    if (!brandId) throw new DataBankEmbeddingAuthorityError('Brand memory requires a brandId.');
  } else if (scope === 'global' && memoryScope === 'universal') {
    if (brandId) throw new DataBankEmbeddingAuthorityError('Universal memory cannot carry a brandId.');
  } else {
    throw new DataBankEmbeddingAuthorityError('DataBank embedding scope is invalid.');
  }

  return {
    userId,
    ownerType,
    ...(orgId ? { orgId } : {}),
    type: entry.type,
    scope,
    memoryScope,
    provenanceStatus: 'verified',
    classification: entry.classification,
    consentStatus: entry.consentStatus,
    lifecycleStatus: 'active',
    metadataVersion: DATA_BANK_EMBEDDING_METADATA_VERSION,
    ...(brandId ? { brandId } : {}),
    ...(entry.sessionId?.trim() ? { sessionId: entry.sessionId.trim() } : {}),
    ...(entry.projectId?.trim() ? { projectId: entry.projectId.trim() } : {}),
  };
}

function isDataBankDateElapsed(value: Date | undefined, now: Date): boolean {
  return value !== undefined && (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value <= now);
}

/**
 * Generate and store an embedding for a single DataBank entry in Upstash Vector.
 * Immediate writers and background sweeps use the same atomic claim path.
 */
export async function embedDataBankEntry(
  entry: DataBankEntry,
  options?: { alreadyClaimed?: boolean },
): Promise<boolean> {
  const claimedEntry = options?.alreadyClaimed
    ? entry
    : await claimDataBankEntryForEmbedding(entry._id.toString());
  if (!claimedEntry) return false;

  try {
    const index = getVectorIndex();
    const text = entryToText(claimedEntry);
    const metadata = buildDataBankVectorMetadata(claimedEntry);
    
    await index.upsert({
      id: claimedEntry._id.toString(),
      data: text,
      metadata,
    });
    
    await completeDataBankEmbedding(claimedEntry._id.toString(), claimedEntry._id.toString());
    return true;
  } catch (err) {
    try {
      await failDataBankEmbedding(claimedEntry._id.toString(), claimedEntry.embeddingAttempts ?? 1);
    } catch (statusError) {
      console.error(`[EmbeddingService] Failed to record embedding failure for ${claimedEntry._id}:`, statusError);
    }
    console.error(`[EmbeddingService] Failed to embed entry ${claimedEntry._id}:`, err);
    throw err;
  }
}

export interface EmbeddingProcessingResult {
  stored: number;
  failed: number;
}

/**
 * Claim and process pending/retryable DataBank entries without duplicate work.
 */
export async function processPendingEmbeddings(limit: number = 50): Promise<EmbeddingProcessingResult> {
  const entries = await claimDataBankEntriesForEmbedding(limit);
  if (entries.length === 0) return { stored: 0, failed: 0 };

  let stored = 0;
  let failed = 0;
  for (let i = 0; i < entries.length; i++) {
    try {
      if (await embedDataBankEntry(entries[i], { alreadyClaimed: true })) stored++;
    } catch {
      failed++;
    }
  }
  return { stored, failed };
}

const RELEVANCE_THRESHOLD = 0.35;

export interface VectorQueryResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export function buildDataBankVectorFilter(input: {
  userId: string;
  orgId?: string | null;
  scope?: 'project' | 'global';
  brandId?: string;
  memoryScope?: DataBankMemoryScope;
}): string {
  const userId = input.userId.trim();
  if (!userId) throw new DataBankEmbeddingAuthorityError('Vector retrieval requires a user owner.');
  const orgId = input.orgId?.trim();
  if (!input.scope && (input.memoryScope || input.brandId)) {
    throw new DataBankEmbeddingAuthorityError('Vector memory authority requires an explicit data scope.');
  }
  if (input.scope === 'project' && input.memoryScope && input.memoryScope !== 'project') {
    throw new DataBankEmbeddingAuthorityError('Project vector retrieval requires project memory scope.');
  }
  if (input.scope === 'global') {
    if (input.memoryScope !== 'brand' && input.memoryScope !== 'universal') {
      throw new DataBankEmbeddingAuthorityError('Global vector retrieval requires brand or universal memory scope.');
    }
    if (input.memoryScope === 'brand' && !input.brandId?.trim()) {
      throw new DataBankEmbeddingAuthorityError('Brand vector retrieval requires a brandId.');
    }
    if (input.memoryScope === 'universal' && input.brandId?.trim()) {
      throw new DataBankEmbeddingAuthorityError('Universal vector retrieval cannot carry a brandId.');
    }
  }

  const filterParts = [
    orgId ? "ownerType = 'organization'" : "ownerType = 'user'",
    orgId
      ? `orgId = '${escapeVectorFilterValue(orgId)}'`
      : `userId = '${escapeVectorFilterValue(userId)}'`,
    "provenanceStatus = 'verified'",
    "lifecycleStatus = 'active'",
    `metadataVersion = ${DATA_BANK_EMBEDDING_METADATA_VERSION}`,
  ];
  if (input.scope) filterParts.push(`scope = '${input.scope}'`);
  if (input.scope === 'project') filterParts.push("memoryScope = 'project'");
  if (input.memoryScope && input.scope !== 'project') {
    filterParts.push(`memoryScope = '${input.memoryScope}'`);
  }
  if (input.brandId?.trim()) {
    filterParts.push(`brandId = '${escapeVectorFilterValue(input.brandId.trim())}'`);
  }
  return filterParts.join(' AND ');
}

/**
 * Query Upstash Vector for semantically relevant facts.
 * Returns vector IDs + scores above the relevance threshold.
 */
export async function queryRelevantFacts(
  principal: DataBankPrincipal,
  queryText: string,
  topK: number = 5,
  scope?: 'project' | 'global',
  options?: { brandId?: string; memoryScope?: DataBankMemoryScope },
): Promise<VectorQueryResult[]> {
  if (!queryText.trim()) return [];

  const index = getVectorIndex();
  const filter = buildDataBankVectorFilter({
    userId: principal.userId,
    orgId: principal.orgId,
    scope,
    memoryScope: options?.memoryScope,
    brandId: options?.brandId,
  });

  const results = await index.query({
    data: queryText,
    topK,
    filter,
    includeMetadata: true,
  });

  return results
    .filter((r) => r.score >= RELEVANCE_THRESHOLD)
    .map((r) => ({
      id: r.id.toString(),
      score: r.score,
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));
}

function escapeVectorFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const DEDUP_THRESHOLD = 0.95;

/**
 * Check if a fact is a near-duplicate of existing entries before saving.
 * Returns true if a semantically similar entry already exists.
 * If a duplicate is found, refreshes its updatedAt timestamp instead.
 */
export async function checkDuplicateBeforeSave(
  userId: string,
  text: string,
  scope?: 'project' | 'global',
): Promise<boolean> {
  try {
    const index = getVectorIndex();
    
    const filter = scope ? `userId = '${userId}' AND scope = '${scope}'` : `userId = '${userId}'`;
    
    const results = await index.query({
      data: text,
      topK: 1,
      includeMetadata: true,
      filter,
    });

    if (results.length > 0 && results[0].score >= DEDUP_THRESHOLD) {
      await refreshEntryTimestamp(results[0].id.toString());
      return true;
    }
    
    return false;
  } catch (err) {
    console.warn('[EmbeddingService] Dedup check failed, allowing save:', err);
    return false;
  }
}

async function refreshEntryTimestamp(entryId: string): Promise<void> {
  try {
    await updateDataBankEmbeddingStatus(entryId, 'success');
  } catch {
    // non-critical
  }
}
