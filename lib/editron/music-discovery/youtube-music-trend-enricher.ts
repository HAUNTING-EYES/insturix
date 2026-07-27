import { randomUUID } from 'node:crypto';

import type { TrendCandidate, TrendFetcher } from '@/lib/trends/fetcher';
import { YouTubeChartsFetcher } from '@/lib/trends/fetchers/youtube-charts-fetcher';
import type {
  MusicDiscoveryIdentity,
  MusicDiscoverySearchResult,
  MusicTrendCoverage,
  MusicTrendEvidence,
} from './types';

const SOURCE = 'youtube-most-popular-music' as const;
const CHART = 'youtube:mostPopular:music';
const MUSIC_VIDEO_CATEGORY_ID = '10';
const SNAPSHOT_COLLECTION = 'editron_music_trend_snapshots';
const DEFAULT_REFRESH_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_CHART_LIMIT = 50;

export interface MusicTrendSnapshotEntry {
  providerId: string;
  title?: string;
  rank: number;
  trackerScore: number;
}

export interface MusicTrendSnapshot {
  source: typeof SOURCE;
  territory: string;
  chart: typeof CHART;
  observedAt: string;
  entries: MusicTrendSnapshotEntry[];
}

export interface MusicTrendSnapshotState {
  _id: string;
  current?: MusicTrendSnapshot;
  previous?: MusicTrendSnapshot;
  lease?: {
    token: string;
    expiresAt: string;
  };
}

export interface MusicTrendSnapshotClaim {
  claimed: boolean;
  state: MusicTrendSnapshotState | null;
}

export interface MusicTrendSnapshotStore {
  read(key: string): Promise<MusicTrendSnapshotState | null>;
  claim(input: {
    key: string;
    token: string;
    now: string;
    staleBefore: string;
    leaseExpiresAt: string;
  }): Promise<MusicTrendSnapshotClaim>;
  commit(input: {
    key: string;
    token: string;
    snapshot: MusicTrendSnapshot;
    previous?: MusicTrendSnapshot;
  }): Promise<void>;
  release(key: string, token: string): Promise<void>;
}

interface TrendFetcherContext {
  territory: string;
  language?: string;
}

export interface YouTubeMusicTrendEnricherOptions {
  store?: MusicTrendSnapshotStore;
  fetcherFactory?: (context: TrendFetcherContext) => TrendFetcher;
  now?: () => number;
  refreshMs?: number;
  leaseMs?: number;
  chartLimit?: number;
}

export class YouTubeMusicTrendEnricher {
  private readonly store: MusicTrendSnapshotStore;
  private readonly fetcherFactory: (context: TrendFetcherContext) => TrendFetcher;
  private readonly now: () => number;
  private readonly refreshMs: number;
  private readonly leaseMs: number;
  private readonly chartLimit: number;

  constructor(options: YouTubeMusicTrendEnricherOptions = {}) {
    this.store = options.store ?? mongoSnapshotStore;
    this.fetcherFactory = options.fetcherFactory ?? ((context) => (
      new YouTubeChartsFetcher({
        videoCategoryId: MUSIC_VIDEO_CATEGORY_ID,
        language: context.language,
      })
    ));
    this.now = options.now ?? Date.now;
    this.refreshMs = positiveInteger(options.refreshMs, DEFAULT_REFRESH_MS);
    this.leaseMs = positiveInteger(options.leaseMs, DEFAULT_LEASE_MS);
    this.chartLimit = Math.min(positiveInteger(options.chartLimit, DEFAULT_CHART_LIMIT), 50);
  }

  async enrich(result: MusicDiscoverySearchResult): Promise<MusicDiscoverySearchResult> {
    const requestedLanguages = [...result.query.languages];
    if (result.query.territory === 'GLOBAL') {
      return withCoverage(result, {
        status: 'requires-territory',
        source: SOURCE,
        territory: null,
        requestedLanguages,
        matchedIdentityCount: 0,
        reasonCode: 'TERRITORY_REQUIRED',
      });
    }

    const territory = result.query.territory.toUpperCase();
    const fetcher = this.fetcherFactory({
      territory,
      ...(requestedLanguages[0] ? { language: requestedLanguages[0] } : {}),
    });
    if (!fetcher.available()) {
      return withCoverage(result, coverage(
        'not-configured',
        territory,
        requestedLanguages,
        'PROVIDER_NOT_CONFIGURED',
      ));
    }

    let state: MusicTrendSnapshotState | null;
    try {
      state = await this.store.read(snapshotKey(territory));
    } catch {
      return withCoverage(result, coverage(
        'unavailable',
        territory,
        requestedLanguages,
        'STORE_UNAVAILABLE',
      ));
    }

    const nowMs = this.now();
    if (state?.current && isFresh(state.current, nowMs, this.refreshMs)) {
      return attachSnapshot(result, state.current, state.previous, 'fresh');
    }

    const key = snapshotKey(territory);
    const token = randomUUID();
    let claim: MusicTrendSnapshotClaim;
    try {
      claim = await this.store.claim({
        key,
        token,
        now: new Date(nowMs).toISOString(),
        staleBefore: new Date(nowMs - this.refreshMs).toISOString(),
        leaseExpiresAt: new Date(nowMs + this.leaseMs).toISOString(),
      });
    } catch {
      return state?.current
        ? attachSnapshot(result, state.current, state.previous, 'stale', 'STORE_UNAVAILABLE')
        : withCoverage(result, coverage(
          'unavailable',
          territory,
          requestedLanguages,
          'STORE_UNAVAILABLE',
        ));
    }

    if (!claim.claimed) {
      const latest = claim.state?.current ?? state?.current;
      const previous = claim.state?.previous ?? state?.previous;
      if (latest && isFresh(latest, nowMs, this.refreshMs)) {
        return attachSnapshot(result, latest, previous, 'fresh');
      }
      return latest
        ? attachSnapshot(result, latest, previous, 'stale', 'REFRESH_IN_PROGRESS')
        : withCoverage(result, coverage(
          'refreshing',
          territory,
          requestedLanguages,
          'REFRESH_IN_PROGRESS',
        ));
    }

    const previous = claim.state?.current ?? state?.current;
    let snapshot: MusicTrendSnapshot;
    try {
      const candidates = await fetcher.fetchCandidates({
        region: territory,
        limit: this.chartLimit,
      });
      snapshot = snapshotFromCandidates(candidates, territory, nowMs);
    } catch {
      await releaseQuietly(this.store, key, token);
      return previous
        ? attachSnapshot(result, previous, claim.state?.previous, 'stale', 'UPSTREAM_UNAVAILABLE')
        : withCoverage(result, coverage(
          'unavailable',
          territory,
          requestedLanguages,
          'UPSTREAM_UNAVAILABLE',
        ));
    }

    try {
      await this.store.commit({
        key,
        token,
        snapshot,
        ...(previous ? { previous } : {}),
      });
      return attachSnapshot(result, snapshot, previous, 'fresh');
    } catch {
      await releaseQuietly(this.store, key, token);
      return previous
        ? attachSnapshot(result, previous, claim.state?.previous, 'stale', 'STORE_UNAVAILABLE')
        : withCoverage(result, coverage(
          'unavailable',
          territory,
          requestedLanguages,
          'STORE_UNAVAILABLE',
        ));
    }
  }
}

function snapshotFromCandidates(
  candidates: TrendCandidate[],
  territory: string,
  nowMs: number,
): MusicTrendSnapshot {
  const seen = new Set<string>();
  const entries = candidates.flatMap((candidate, index): MusicTrendSnapshotEntry[] => {
    const providerId = candidate.exemplars.find(
      (exemplar) => exemplar.platform === 'youtube' && exemplar.platformId,
    )?.platformId ?? candidate.key;
    if (!providerId || seen.has(providerId)) return [];
    seen.add(providerId);
    return [{
      providerId,
      ...(candidate.title ? { title: candidate.title } : {}),
      rank: index + 1,
      trackerScore: candidate.trackerScore,
    }];
  });
  return {
    source: SOURCE,
    territory,
    chart: CHART,
    observedAt: new Date(nowMs).toISOString(),
    entries,
  };
}

function attachSnapshot(
  result: MusicDiscoverySearchResult,
  current: MusicTrendSnapshot,
  previous: MusicTrendSnapshot | undefined,
  status: 'fresh' | 'stale',
  reasonCode?: MusicTrendCoverage['reasonCode'],
): MusicDiscoverySearchResult {
  const currentEntries = new Map(current.entries.map((entry) => [entry.providerId, entry]));
  const previousEntries = new Map(
    (previous?.entries ?? []).map((entry) => [entry.providerId, entry]),
  );
  const elapsedHours = previous
    ? (Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / 3_600_000
    : 0;
  let matchedIdentityCount = 0;
  const identities = result.identities.map((identity) => {
    const entry = findMatchingEntry(identity, currentEntries);
    if (!entry) return identity;
    matchedIdentityCount += 1;
    const previousEntry = previousEntries.get(entry.providerId);
    const evidence: MusicTrendEvidence = {
      source: SOURCE,
      territory: current.territory,
      chart: current.chart,
      rank: entry.rank,
      observedAt: current.observedAt,
      ...(previousEntry ? {
        previousRank: previousEntry.rank,
        rankDelta: previousEntry.rank - entry.rank,
      } : {}),
      ...(previousEntry && elapsedHours > 0 ? {
        velocity: roundVelocity((previousEntry.rank - entry.rank) / elapsedHours),
        velocityUnit: 'rank-positions-per-hour' as const,
      } : {}),
    };
    return {
      ...identity,
      trendEvidence: [
        ...identity.trendEvidence.filter((item) => (
          item.source !== SOURCE
          || item.territory !== current.territory
          || item.chart !== current.chart
        )),
        evidence,
      ],
    };
  });

  return {
    ...result,
    identities,
    trendCoverage: {
      status,
      source: SOURCE,
      territory: current.territory,
      requestedLanguages: [...result.query.languages],
      matchedIdentityCount,
      observedAt: current.observedAt,
      ...(previous ? { previousObservedAt: previous.observedAt } : {}),
      ...(reasonCode ? { reasonCode } : {}),
    },
  };
}

function findMatchingEntry(
  identity: MusicDiscoveryIdentity,
  entries: Map<string, MusicTrendSnapshotEntry>,
): MusicTrendSnapshotEntry | undefined {
  for (const source of identity.sources) {
    if (source.provider !== 'youtube') continue;
    const entry = entries.get(source.providerId);
    if (entry) return entry;
  }
  return undefined;
}

function coverage(
  status: MusicTrendCoverage['status'],
  territory: string,
  requestedLanguages: string[],
  reasonCode: MusicTrendCoverage['reasonCode'],
): MusicTrendCoverage {
  return {
    status,
    source: SOURCE,
    territory,
    requestedLanguages,
    matchedIdentityCount: 0,
    reasonCode,
  };
}

function withCoverage(
  result: MusicDiscoverySearchResult,
  trendCoverage: MusicTrendCoverage,
): MusicDiscoverySearchResult {
  return { ...result, trendCoverage };
}

function snapshotKey(territory: string): string {
  return `${SOURCE}:${territory}`;
}

function isFresh(snapshot: MusicTrendSnapshot, nowMs: number, refreshMs: number): boolean {
  const observedAt = Date.parse(snapshot.observedAt);
  return Number.isFinite(observedAt) && observedAt > nowMs - refreshMs;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function roundVelocity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function releaseQuietly(
  store: MusicTrendSnapshotStore,
  key: string,
  token: string,
): Promise<void> {
  try {
    await store.release(key, token);
  } catch {
    // The lease expires automatically; search already carries an unavailable/stale receipt.
  }
}

async function snapshotCollection() {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return db.collection<MusicTrendSnapshotState>(SNAPSHOT_COLLECTION);
}

const mongoSnapshotStore: MusicTrendSnapshotStore = {
  async read(key) {
    return (await snapshotCollection()).findOne({ _id: key });
  },
  async claim(input) {
    const collection = await snapshotCollection();
    try {
      const state = await collection.findOneAndUpdate(
        {
          _id: input.key,
          $and: [
            {
              $or: [
                { lease: { $exists: false } },
                { 'lease.expiresAt': { $lte: input.now } },
              ],
            },
            {
              $or: [
                { current: { $exists: false } },
                { 'current.observedAt': { $lte: input.staleBefore } },
              ],
            },
          ],
        },
        {
          $set: {
            lease: {
              token: input.token,
              expiresAt: input.leaseExpiresAt,
            },
          },
        },
        { upsert: true, returnDocument: 'before' },
      );
      return { claimed: true, state };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      return { claimed: false, state: await collection.findOne({ _id: input.key }) };
    }
  },
  async commit(input) {
    const collection = await snapshotCollection();
    const result = input.previous
      ? await collection.updateOne(
        { _id: input.key, 'lease.token': input.token },
        {
          $set: {
            current: input.snapshot,
            previous: input.previous,
          },
          $unset: { lease: '' },
        },
      )
      : await collection.updateOne(
        { _id: input.key, 'lease.token': input.token },
        {
          $set: { current: input.snapshot },
          $unset: { lease: '', previous: '' },
        },
      );
    if (result.modifiedCount !== 1) {
      throw new Error('Music trend snapshot lease was lost before commit');
    }
  },
  async release(key, token) {
    await (await snapshotCollection()).updateOne(
      { _id: key, 'lease.token': token },
      { $unset: { lease: '' } },
    );
  },
};
