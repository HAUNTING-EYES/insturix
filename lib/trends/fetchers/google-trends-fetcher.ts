/**
 * Google Trends fetcher (Master v1.1 §7.4) — the rising-SEARCH-interest signal.
 *
 * A leading indicator: what people are searching for right now (Google Trends daily trending
 * searches, keyless) → then the free YouTube Search API returns real example videos for each term.
 * Complements the convergence signal (PerplexityYouTube); together they replace the low-taste
 * "top viral video" chart.
 *
 * getTrendingSearches + searchExemplars are injected (testable). The default hits the unofficial
 * daily-trends endpoint, so it is best-effort — a failure is dropped by the composite. Needs
 * YOUTUBE_API_KEY (for exemplars); Google Trends itself is keyless.
 */

import type { TrendFetcher, TrendFetchQuery, TrendCandidate, ExemplarRef } from '../fetcher';
import { searchYouTubeExemplars } from './youtube-search';

const EXEMPLARS_PER_TERM = 5;
const MAX_TERMS = 10;

export type GetTrendingSearches = (geo: string) => Promise<string[]>;
export type SearchExemplars = (searchQuery: string, limit: number) => Promise<ExemplarRef[]>;

/** Map a region label to a Google Trends geo code (2-letter). Defaults to US. */
function regionToGeo(region?: string): string {
  const r = (region ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(r)) return r;
  const map: Record<string, string> = {
    INDIA: 'IN',
    'UNITED STATES': 'US',
    USA: 'US',
    UK: 'GB',
    'UNITED KINGDOM': 'GB',
  };
  return map[r] ?? 'US';
}

export class GoogleTrendsFetcher implements TrendFetcher {
  readonly name = 'google-trends';
  private readonly getTrendingSearches: GetTrendingSearches;
  private readonly searchExemplars: SearchExemplars;

  constructor(options: { getTrendingSearches?: GetTrendingSearches; searchExemplars?: SearchExemplars } = {}) {
    this.getTrendingSearches = options.getTrendingSearches ?? defaultGetTrendingSearches;
    this.searchExemplars = options.searchExemplars ?? searchYouTubeExemplars;
  }

  available(): boolean {
    return Boolean(process.env.YOUTUBE_API_KEY); // Google Trends is keyless; exemplars need YouTube
  }

  async fetchCandidates(query: TrendFetchQuery): Promise<TrendCandidate[]> {
    const geo = regionToGeo(query.region);
    const limit = Math.min(Math.max(query.limit ?? 8, 1), MAX_TERMS);
    const terms = (await this.getTrendingSearches(geo)).slice(0, limit);
    const nowMs = Date.now();
    const candidates: TrendCandidate[] = [];

    for (let index = 0; index < terms.length; index += 1) {
      const term = terms[index];
      const exemplars = await this.searchExemplars(term, EXEMPLARS_PER_TERM);
      if (exemplars.length === 0) continue;

      candidates.push({
        key: slugify(term),
        platform: 'youtube',
        title: term,
        trackerScore: terms.length ? (terms.length - index) / terms.length : 0,
        exemplars,
        fetchedAtMs: nowMs,
        source: this.name,
      });
    }
    return candidates;
  }
}

/** Google Trends "Trending Now" RSS feed → today's trending search terms for a geo (keyless). */
async function defaultGetTrendingSearches(geo: string): Promise<string[]> {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`Google Trends request failed (${response.status})`);

  const xml = await response.text();
  const terms: string[] = [];
  // Each <item> holds one trending search in its <title> (the channel-level <title> has no <item>).
  const itemTitle = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
  let match: RegExpExecArray | null;
  while ((match = itemTitle.exec(xml)) !== null) {
    const term = decodeXmlEntities(match[1]).trim();
    if (term) terms.push(term);
  }
  return terms;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'trend'
  );
}
