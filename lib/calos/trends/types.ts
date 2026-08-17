/**
 * Trends layer for the CalOS AI planner. A trend is a piece of timely, niche-relevant signal
 * (a topic, post, or theme) that the planner can turn into a content idea. Trend text is
 * UNTRUSTED (it comes from scraped/external sources) — the planner must treat it as data,
 * never as instructions (prompt-injection guard).
 */
export interface Trend {
  title: string;
  summary?: string;
  url?: string;
  platform: string; // e.g. 'reddit' | 'twitter' | 'youtube' | 'web'
  score?: number; // optional popularity/relevance
  capturedAt?: string;
}

export interface TrendQuery {
  niche: string; // the brand's niche/industry/audience descriptor
  platforms?: string[];
  limit?: number;
  brandId?: string;
  location?: string; // region/market filter (e.g. "United States", "India")
  /** Request lifetime. Providers should pass this to their underlying fetch/SDK call. */
  abortSignal?: AbortSignal;
}

export interface TrendsProvider {
  readonly name: string;
  /** Whether this provider is configured/usable right now. */
  available(): boolean;
  getTrends(query: TrendQuery): Promise<Trend[]>;
}
