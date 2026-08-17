import type { Trend, TrendQuery, TrendsProvider } from "./types";

/**
 * Agent-Reach (github.com/Panniantong/Agent-Reach) is a CLI/MCP scraper, NOT a hosted REST
 * API — it can't execute inside a Vercel serverless route, so it must run as a separate
 * service (the way the Modal browser-render worker does). This provider calls that service,
 * configured via AGENT_REACH_URL (+ optional AGENT_REACH_API_KEY).
 *
 * Returned trend text is UNTRUSTED — the planner treats it as data, never instructions.
 * Agent-Reach scrapes walled-garden platforms; confirm each platform's ToS before production.
 *
 * Expected service contract:
 *   POST {AGENT_REACH_URL}/trends  { niche, platforms, limit }
 *     -> { trends: [{ title, summary?, url?, platform, score? }] }
 */
export class AgentReachTrendsProvider implements TrendsProvider {
  readonly name = "agent-reach";
  private readonly baseUrl = process.env.AGENT_REACH_URL || "";

  available(): boolean {
    return !!this.baseUrl;
  }

  async getTrends(query: TrendQuery): Promise<Trend[]> {
    query.abortSignal?.throwIfAborted();
    if (!this.baseUrl) return [];

    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/trends`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AGENT_REACH_API_KEY
          ? { Authorization: `Bearer ${process.env.AGENT_REACH_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        niche: query.niche,
        platforms: query.platforms ?? ["reddit", "twitter", "youtube"],
        limit: query.limit ?? 10,
      }),
      signal: query.abortSignal,
    });
    query.abortSignal?.throwIfAborted();

    if (!res.ok) {
      throw new Error(`Agent-Reach trends request failed (${res.status})`);
    }

    const data = await res.json();
    query.abortSignal?.throwIfAborted();
    const raw: unknown[] = Array.isArray(data?.trends) ? data.trends : [];

    // Normalize + clamp. Trend strings are untrusted; cap length so a hostile source can't
    // balloon the planner prompt.
    return raw.map((item): Trend => {
      const t = (item ?? {}) as {
        title?: unknown;
        summary?: unknown;
        url?: unknown;
        platform?: unknown;
        score?: unknown;
      };
      return {
        title: String(t.title ?? "").slice(0, 200),
        summary: typeof t.summary === "string" ? t.summary.slice(0, 500) : undefined,
        url: typeof t.url === "string" ? t.url : undefined,
        platform: String(t.platform ?? "web"),
        score: typeof t.score === "number" ? t.score : undefined,
      };
    });
  }
}
