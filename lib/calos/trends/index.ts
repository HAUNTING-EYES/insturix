import type { Trend, TrendQuery, TrendsProvider } from "./types";
import { AgentReachTrendsProvider } from "./agent-reach";
import { ApifyTrendsProvider } from "./apify";
import { GeminiTrendsProvider } from "./gemini";
import { PerplexityTrendsProvider } from "./perplexity";

/** No-op provider: when no trends source is configured, the AI planner degrades to cadence-only
 * rather than failing. Deliberate graceful degradation, not a bug mask. */
class NullTrendsProvider implements TrendsProvider {
  readonly name = "none";
  available(): boolean {
    return false;
  }
  async getTrends() {
    return [];
  }
}

/**
 * Runs several trend sources in parallel and merges/dedups their results. Best-effort per source:
 * if one provider throws (Apify timeout, grounding error), the others still contribute.
 */
class CompositeTrendsProvider implements TrendsProvider {
  readonly name: string;
  constructor(private readonly providers: TrendsProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
  }
  available(): boolean {
    return this.providers.length > 0;
  }
  async getTrends(query: TrendQuery): Promise<Trend[]> {
    query.abortSignal?.throwIfAborted();
    const settled = await Promise.allSettled(this.providers.map((p) => p.getTrends(query)));
    query.abortSignal?.throwIfAborted();
    const seen = new Set<string>();
    const merged: Trend[] = [];
    for (const r of settled) {
      query.abortSignal?.throwIfAborted();
      if (r.status !== "fulfilled") continue;
      for (const t of r.value) {
        const key = t.title.toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(t);
      }
    }
    return merged.slice(0, query.limit ?? 12);
  }
}

/**
 * The active trends provider. Perplexity Sonar is preferred when configured because it is
 * search-native and avoids spending the ai-plan budget on Gemini grounding. Set
 * CALOS_TRENDS_PROVIDER=composite to merge every configured source.
 */
export function getTrendsProvider(): TrendsProvider {
  const providerMode = (process.env.CALOS_TRENDS_PROVIDER ?? "").trim().toLowerCase();
  const perplexity = new PerplexityTrendsProvider();
  const providersByName: Record<string, TrendsProvider> = {
    perplexity,
    sonar: perplexity,
    "agent-reach": new AgentReachTrendsProvider(),
    apify: new ApifyTrendsProvider(),
    gemini: new GeminiTrendsProvider(),
    none: new NullTrendsProvider(),
  };

  if (providerMode && providerMode !== "composite") {
    const selected = providersByName[providerMode];
    return selected?.available() ? selected : new NullTrendsProvider();
  }

  if (!providerMode && perplexity.available()) return perplexity;

  const providers = Object.entries(providersByName)
    .filter(([name]) => name !== "none" && name !== "sonar")
    .map(([, provider]) => provider)
    .filter((p) => p.available());

  if (providers.length === 0) return new NullTrendsProvider();
  if (providers.length === 1) return providers[0];
  return new CompositeTrendsProvider(providers);
}

export type { Trend, TrendQuery, TrendsProvider } from "./types";
