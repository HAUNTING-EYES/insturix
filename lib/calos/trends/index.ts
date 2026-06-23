import type { TrendsProvider } from "./types";
import { AgentReachTrendsProvider } from "./agent-reach";
import { GeminiTrendsProvider } from "./gemini";

/** No-op provider: when no trends source is configured, the AI planner degrades to
 * cadence-only rather than failing. Deliberate graceful degradation, not a bug mask. */
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
 * The active trends provider, in preference order:
 *   1. Agent-Reach — when AGENT_REACH_URL is set (real multi-platform scraping service).
 *   2. Gemini — when a GEMINI/GOOGLE key is set (inline, web-grounded; no service to deploy).
 *   3. Null — degrade to cadence-only.
 * Swappable — add/reorder providers here without touching the planner.
 */
export function getTrendsProvider(): TrendsProvider {
  const agentReach = new AgentReachTrendsProvider();
  if (agentReach.available()) return agentReach;

  const gemini = new GeminiTrendsProvider();
  if (gemini.available()) return gemini;

  return new NullTrendsProvider();
}

export type { Trend, TrendQuery, TrendsProvider } from "./types";
