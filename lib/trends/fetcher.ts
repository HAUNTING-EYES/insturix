/**
 * Insturix Trends — pluggable exemplar fetchers (Master v1.1 §7.4).
 *
 * ONE interface, many swappable sources: YouTube (Data API + Charts India), Instagram (2-3
 * replaceable tracker feeds). Each fetcher returns candidate trend PATTERNS, each carrying a set
 * of exemplar video refs (the loop later pulls 3-10 per candidate → fingerprints → aggregates →
 * ranks). Mirrors the shipped lib/calos/trends composite: best-effort per source (one failing
 * fetcher never sinks the others).
 *
 * Reuse (Rule 3): platform identity + exemplar dedupe come from the Source Ledger (§5.6.5), so
 * the same video via youtu.be/X and youtube.com/watch?v=X collapses to one exemplar automatically.
 *
 * This module is the STRUCTURE; the real YouTube/Apify fetchers (network) plug in behind it.
 */

import type { LedgerPlatform } from '@/lib/ledger/types';
import { buildDedupeIdentity, dedupeKey } from '@/lib/ledger/dedupe';

/** A single exemplar video for a trend (to be fetched + fingerprinted downstream). */
export interface ExemplarRef {
  platform: LedgerPlatform;
  url: string;
  /** Stable platform id, if the fetcher already has it (else derived from url at dedupe time). */
  platformId?: string;
  /** Per-exemplar popularity (views/likes normalized), optional. */
  trackerScore?: number;
}

/** A candidate trend pattern with its exemplars. */
export interface TrendCandidate {
  /** Stable key for the pattern (sound id / hashtag / fetcher key). Deduped across fetchers. */
  key: string;
  platform: LedgerPlatform;
  title?: string;
  /** Candidate-level popularity; the ranker consumes this as trackerScore. */
  trackerScore: number;
  exemplars: ExemplarRef[];
  /** Epoch ms this candidate was fetched. */
  fetchedAtMs: number;
  /** Which fetcher produced it (provenance). */
  source: string;
}

export interface TrendFetchQuery {
  platforms?: LedgerPlatform[];
  /** Region for platform charts (e.g. 'IN' — YouTube Charts India). */
  region?: string;
  /** Max candidates to return (top by trackerScore). */
  limit?: number;
}

export interface TrendFetcher {
  readonly name: string;
  /** Whether this fetcher is configured/usable right now. */
  available(): boolean;
  fetchCandidates(query: TrendFetchQuery): Promise<TrendCandidate[]>;
}

/** No-op fetcher: when nothing is configured the loop degrades to empty instead of throwing. */
export class NullTrendFetcher implements TrendFetcher {
  readonly name = 'none';
  available(): boolean {
    return false;
  }
  async fetchCandidates(): Promise<TrendCandidate[]> {
    return [];
  }
}

/** Candidate identity: platform + normalized key (same sound/hashtag from two sources = one trend). */
function candidateDedupeKey(candidate: TrendCandidate): string {
  return `${candidate.platform}:${candidate.key.trim().toLowerCase()}`;
}

/** Exemplar identity via the Ledger's two-check dedupe (§5.6.5); falls back to the raw url. */
function exemplarDedupeKey(exemplar: ExemplarRef): string {
  return (
    dedupeKey(buildDedupeIdentity({ url: exemplar.url, platform: exemplar.platform, platformId: exemplar.platformId })) ??
    `url:${exemplar.url.trim()}`
  );
}

function dedupeExemplars(exemplars: ExemplarRef[]): ExemplarRef[] {
  const seen = new Set<string>();
  const out: ExemplarRef[] = [];
  for (const exemplar of exemplars) {
    const key = exemplarDedupeKey(exemplar);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(exemplar);
  }
  return out;
}

/**
 * Runs several fetchers in parallel and merges their candidates. Best-effort per source (a
 * fetcher that throws is dropped; the rest still contribute). Candidates sharing platform+key
 * merge: union of exemplars deduped by Ledger identity, max trackerScore, most-recent fetch.
 */
export class CompositeTrendFetcher implements TrendFetcher {
  readonly name: string;
  constructor(private readonly fetchers: TrendFetcher[]) {
    this.name = fetchers.map((f) => f.name).join('+') || 'none';
  }

  available(): boolean {
    return this.fetchers.some((f) => f.available());
  }

  async fetchCandidates(query: TrendFetchQuery): Promise<TrendCandidate[]> {
    const active = this.fetchers.filter((f) => f.available());
    const settled = await Promise.allSettled(active.map((f) => f.fetchCandidates(query)));

    const byKey = new Map<string, TrendCandidate>();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue; // best-effort: drop the failed source
      for (const candidate of result.value) {
        const key = candidateDedupeKey(candidate);
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { ...candidate, exemplars: dedupeExemplars(candidate.exemplars) });
          continue;
        }
        existing.trackerScore = Math.max(existing.trackerScore, candidate.trackerScore);
        existing.fetchedAtMs = Math.max(existing.fetchedAtMs, candidate.fetchedAtMs);
        existing.title = existing.title ?? candidate.title;
        existing.exemplars = dedupeExemplars([...existing.exemplars, ...candidate.exemplars]);
      }
    }

    const merged = [...byKey.values()].sort((a, b) => b.trackerScore - a.trackerScore);
    return typeof query.limit === 'number' ? merged.slice(0, Math.max(0, query.limit)) : merged;
  }
}
