import type { Trend, TrendQuery, TrendsProvider } from "./types";
import { AgentReachTrendsProvider } from "./agent-reach";
import { ApifyTrendsProvider } from "./apify";
import { GeminiTrendsProvider } from "./gemini";

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
    const settled = await Promise.allSettled(this.providers.map((p) => p.getTrends(query)));
    const seen = new Set<string>();
    const merged: Trend[] = [];
    for (const r of settled) {
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
 * The active trends provider. Every configured source contributes — Agent-Reach, Apify (maintained
 * scrapers for hard sites like TikTok), and Gemini (web-grounded general trends). One source -> use
 * it directly; many -> merge via the composite; none -> Null (cadence-only). Add providers here
 * without touching the planner.
 */
export function getTrendsProvider(): TrendsProvider {
  const providers = [
    new AgentReachTrendsProvider(),
    new ApifyTrendsProvider(),
    new GeminiTrendsProvider(),
  ].filter((p) => p.available());

  if (providers.length === 0) return new NullTrendsProvider();
  if (providers.length === 1) return providers[0];
  return new CompositeTrendsProvider(providers);
}

export type { Trend, TrendQuery, TrendsProvider } from "./types";
