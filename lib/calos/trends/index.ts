import type { TrendsProvider } from "./types";
import { AgentReachTrendsProvider } from "./agent-reach";

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
 * The active trends provider: Agent-Reach if AGENT_REACH_URL is configured, otherwise the
 * no-op provider. Swappable — add other providers here without touching the planner.
 */
export function getTrendsProvider(): TrendsProvider {
  const agentReach = new AgentReachTrendsProvider();
  return agentReach.available() ? agentReach : new NullTrendsProvider();
}

export type { Trend, TrendQuery, TrendsProvider } from "./types";
