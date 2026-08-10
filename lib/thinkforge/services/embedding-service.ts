/**
 * Embedding Service (Upstash Vector)
 *
 * Uses Upstash Vector with Native Embeddings to store and query semantic facts.
 * Ensure the Upstash Vector Index is configured with an embedding model (e.g. bge-m3).
 */

import { Index } from '@upstash/vector';
import {
  updateDataBankEmbeddingStatus,
  getDataBankEntriesPendingEmbedding,
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
 */
export async function embedDataBankEntry(entry: DataBankEntry): Promise<void> {
  try {
    const index = getVectorIndex();
    const text = entryToText(entry);
    
    await index.upsert({
      id: entry._id.toString(),
      data: text,
      metadata: {
        userId: entry.userId,
        type: entry.type,
        scope: entry.scope || 'project',
        memoryScope: entry.memoryScope || 'project',
        brandId: entry.brandId || '',
        projectId: entry.projectId || '',
        sourceUrl: entry.sourceUrl || '',
      }
    });
    
    await updateDataBankEmbeddingStatus(entry._id.toString(), 'success');
  } catch (err) {
    console.error(`[EmbeddingService] Failed to embed entry ${entry._id}:`, err);
    await updateDataBankEmbeddingStatus(entry._id.toString(), 'failed');
    throw err;
  }
}

/**
 * Process all pending DataBank entries: generate embeddings and store them in Upstash.
 */
export async function processPendingEmbeddings(limit: number = 50): Promise<number> {
  const entries = await getDataBankEntriesPendingEmbedding(limit);
  if (entries.length === 0) return 0;

  let stored = 0;
  for (let i = 0; i < entries.length; i++) {
    try {
      await embedDataBankEntry(entries[i]);
      stored++;
    } catch {
      // errors handled in embedDataBankEntry
    }
  }
  return stored;
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
