/**
 * Insturix Trends — demand signal store (Master v1.1 §7.4).
 *
 * Counts DISTINCT user requests per trend (the demand signal the ranker weights, gated at ≥100
 * in rank.ts). One row per (trendKey, userId); the unique {trendKey,userId} index means a user
 * requesting the same trend twice cannot inflate demand — countDocuments({trendKey}) is a
 * distinct-user count.
 *
 * Demand is a GLOBAL signal (platform-wide interest = what to curate for everyone), so it is NOT
 * owner/org-scoped — unlike the Source Ledger ("what YOU looked at"). Mirrors the repository
 * conventions in lib/ledger/store.ts + lib/shared/project-links.ts.
 */

import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';

export const TREND_REQUESTS_COLLECTION = COLLECTIONS.TREND_REQUESTS;

interface TrendRequestDoc {
  trendKey: string;
  userId: string;
  firstRequestedAt: Date;
  lastRequestedAt: Date;
}

async function getCollection() {
  const db = await getDatabase();
  return db.collection<TrendRequestDoc>(TREND_REQUESTS_COLLECTION);
}

/**
 * Record one user's request for a trend. Idempotent per (trendKey, userId): a repeat request
 * refreshes lastRequestedAt but does not double-count demand (the unique index dedupes).
 */
export async function recordTrendRequest(trendKey: string, userId: string): Promise<void> {
  const col = await getCollection();
  const now = new Date();
  // trendKey/userId are set from the filter on insert — do NOT repeat them in $setOnInsert (conflict).
  await col.updateOne(
    { trendKey, userId },
    { $setOnInsert: { firstRequestedAt: now }, $set: { lastRequestedAt: now } },
    { upsert: true },
  );
}

/** Distinct-user demand count for one trend. */
export async function getDemandCount(trendKey: string): Promise<number> {
  const col = await getCollection();
  return col.countDocuments({ trendKey });
}

/**
 * Batch distinct-user demand counts for many trends → Map(trendKey → count). Trends with zero
 * requests are simply absent from the map (caller treats missing as 0). Used to enrich a page of
 * candidates before ranking, in one query.
 */
export async function getDemandCounts(trendKeys: string[]): Promise<Map<string, number>> {
  if (trendKeys.length === 0) return new Map();
  const col = await getCollection();
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $match: { trendKey: { $in: trendKeys } } },
      { $group: { _id: '$trendKey', count: { $sum: 1 } } },
    ])
    .toArray();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row._id, row.count);
  return counts;
}
