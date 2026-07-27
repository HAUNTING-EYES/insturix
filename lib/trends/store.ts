/**
 * Insturix Trends — ranked-trend store (Master v1.1 §7.4).
 *
 * Persists the ranked trend list the cron produces (one row per trend, keyed platform:key) and
 * reads the top for the UI. Mirrors the repository conventions in lib/ledger/store.ts. Called by
 * the cron pipeline (saveRankedTrends) and the read API (getTopTrends).
 */

import type { Filter } from 'mongodb';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import type { RankedTrendCandidate } from './pipeline';

export const TRENDS_COLLECTION = COLLECTIONS.TRENDS;

export interface StoredTrend extends RankedTrendCandidate {
  /** `${platform}:${key}` — the unique persistence key. */
  trendKey: string;
  /** ISO timestamp of the ranking run that produced this row. */
  rankedAt: string;
}

async function getCollection() {
  const db = await getDatabase();
  return db.collection<StoredTrend>(TRENDS_COLLECTION);
}

function trendKeyOf(trend: RankedTrendCandidate): string {
  return `${trend.platform}:${trend.key}`;
}

/** Upsert the ranked trends by trendKey. Idempotent — a re-run replaces the prior row. */
export async function saveRankedTrends(ranked: RankedTrendCandidate[]): Promise<void> {
  if (ranked.length === 0) return;
  const col = await getCollection();
  const rankedAt = new Date().toISOString();
  await col.bulkWrite(
    ranked.map((trend) => {
      const trendKey = trendKeyOf(trend);
      return {
        replaceOne: {
          filter: { trendKey } as Filter<StoredTrend>,
          replacement: { ...trend, trendKey, rankedAt },
          upsert: true,
        },
      };
    }),
  );
}

/** Top ranked trends for the UI (highest rankScore first). */
export async function getTopTrends(limit = 20): Promise<StoredTrend[]> {
  const col = await getCollection();
  return col.find({}, { projection: { _id: 0 } }).sort({ rankScore: -1 }).limit(limit).toArray() as Promise<StoredTrend[]>;
}
