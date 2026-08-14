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
  type DataBankEntry,
  type DataBankMemoryScope,
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
    
    await index.upsert({
      id: claimedEntry._id.toString(),
      data: text,
      metadata: {
        userId: claimedEntry.userId,
        type: claimedEntry.type,
        scope: claimedEntry.scope || 'project',
        memoryScope: claimedEntry.memoryScope || 'project',
        brandId: claimedEntry.brandId || '',
        projectId: claimedEntry.projectId || '',
        provenanceStatus: claimedEntry.provenanceStatus || '',
        sourceUrl: claimedEntry.sourceUrl || '',
      }
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

/**
 * Query Upstash Vector for semantically relevant facts.
 * Returns vector IDs + scores above the relevance threshold.
 */
export async function queryRelevantFacts(
  userId: string,
  queryText: string,
  topK: number = 5,
  scope?: 'project' | 'global',
  options?: { brandId?: string; memoryScope?: DataBankMemoryScope },
): Promise<VectorQueryResult[]> {
  if (!queryText.trim()) return [];

  const index = getVectorIndex();
  const filterParts = [`userId = '${escapeVectorFilterValue(userId)}'`];
  if (scope) filterParts.push(`scope = '${scope}'`);
  if (options?.memoryScope) filterParts.push(`memoryScope = '${options.memoryScope}'`);
  if (options?.brandId) filterParts.push(`brandId = '${escapeVectorFilterValue(options.brandId)}'`);
  const filter = filterParts.join(' AND ');

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
