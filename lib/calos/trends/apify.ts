import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from "@/lib/financials/provider-cost-events";
import type { Trend, TrendQuery, TrendsProvider } from "./types";

/**
 * Apify trends provider. Runs a configured Apify actor (e.g. a TikTok Creative Center / trends
 * scraper) and normalizes its dataset into Trend[]. Maintained actors handle the anti-bot work our
 * own Modal renderer can't (TikTok, etc.) — that's what the Apify subscription buys.
 *
 * Config: APIFY_TOKEN + APIFY_TRENDS_ACTOR (actor id/slug, e.g. "clockworks~tiktok-trends-scraper").
 * Optional APIFY_TRENDS_INPUT (JSON) is merged into the actor input for actor-specific fields.
 *
 * Returned text is UNTRUSTED (scraped) — the planner treats it as data, never instructions.
 * NOTE: runs the actor synchronously with a tight timeout. For production, trends are better
 * pre-fetched/cached by a cron than run live per plan; this is the lazy v1.
 */
export class ApifyTrendsProvider implements TrendsProvider {
  readonly name = "apify";
  private readonly token = process.env.APIFY_TOKEN || "";
  private readonly actor = process.env.APIFY_TRENDS_ACTOR || "";

  available(): boolean {
    return !!this.token && !!this.actor;
  }

  async getTrends(query: TrendQuery): Promise<Trend[]> {
    query.abortSignal?.throwIfAborted();
    if (!this.available()) return [];
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);

    // run-sync-get-dataset-items: run the actor, wait, return its dataset in one call. The 45s
    // server-side timeout keeps it inside the ai-plan route budget; on timeout the fetch throws and
    // the composite provider simply drops this source.
    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(this.actor)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(this.token)}&timeout=45`;

    const input: Record<string, unknown> = {
      ...parseInputTemplate(process.env.APIFY_TRENDS_INPUT),
      // Generic hints — the chosen actor uses whichever keys it understands. Tune via APIFY_TRENDS_INPUT.
      niche: query.niche,
      keyword: query.niche,
      search: query.niche,
      countryCode: query.location,
      region: query.location,
      maxItems: limit,
      limit,
    };

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(query.abortSignal?.reason);
    query.abortSignal?.addEventListener("abort", abortFromCaller, { once: true });
    if (query.abortSignal?.aborted) abortFromCaller();
    const timer = setTimeout(
      () => controller.abort(new DOMException("Apify trends request timed out.", "TimeoutError")),
      50_000,
    );
    const startedAt = Date.now();
    let responseStatus: number | undefined;
    try {
      const body = JSON.stringify(input);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      responseStatus = res.status;
      if (!res.ok) throw new Error(`Apify trends actor failed (${res.status})`);
      const items = await res.json();
      const raw: unknown[] = Array.isArray(items) ? items : [];
      const trends = raw
        .slice(0, limit)
        .map((item) => normalizeApifyTrend(item, query))
        .filter((t): t is Trend => t !== null && t.title.length > 0);

      await recordApifyTrendsCost(query, {
        status: "success",
        limit,
        responseStatus,
        resultCount: trends.length,
        rawItemCount: raw.length,
        bytesIn: byteLength(body),
        functionMs: Date.now() - startedAt,
      });
      query.abortSignal?.throwIfAborted();

      return trends;
    } catch (error) {
      await recordApifyTrendsCost(query, {
        status: "failed",
        limit,
        responseStatus,
        functionMs: Date.now() - startedAt,
        error,
      });
      if (query.abortSignal?.aborted) {
        query.abortSignal.throwIfAborted();
      }
      throw error;
    } finally {
      clearTimeout(timer);
      query.abortSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

async function recordApifyTrendsCost(
  query: TrendQuery,
  input: {
    status: ProviderCostEventStatus;
    limit: number;
    responseStatus?: number;
    resultCount?: number;
    rawItemCount?: number;
    bytesIn?: number;
    functionMs?: number;
    error?: unknown;
  },
) {
  await recordProviderCostEvent({
    status: input.status,
    projectId: query.brandId,
    service: "calos",
    action: "trend_discovery",
    route: "lib/calos/trends/apify",
    provider: "apify",
    model: "actor-run",
    operation: "actor_run",
    units: {
      requestCount: 1,
      bytesIn: input.bytesIn,
      functionMs: input.functionMs,
    },
    metadata: {
      providerName: "apify",
      limit: input.limit,
      platformCount: query.platforms?.length,
      hasBrandId: Boolean(query.brandId),
      hasLocation: Boolean(query.location),
      responseStatus: input.responseStatus,
      resultCount: input.resultCount,
      rawItemCount: input.rawItemCount,
      errorClass: input.error instanceof Error ? input.error.name : input.error ? typeof input.error : undefined,
    },
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function parseInputTemplate(json?: string): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Map a heterogeneous Apify dataset item to a Trend (actor shapes vary; read common fields, clamp). */
function normalizeApifyTrend(item: unknown, query: TrendQuery): Trend | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

  const title = (
    str(o.title) ||
    str(o.name) ||
    str(o.hashtag) ||
    str(o.keyword) ||
    str(o.text) ||
    str(o.query)
  )
    .trim()
    .slice(0, 200);
  if (!title) return null;

  const summary =
    (str(o.summary) || str(o.description) || str(o.desc)).trim().slice(0, 500) || undefined;
  const url = (str(o.url) || str(o.link) || str(o.postUrl)).trim() || undefined;
  const platform = (str(o.platform) || query.platforms?.[0] || "tiktok").trim().slice(0, 40);
  const scoreRaw = o.score ?? o.views ?? o.viewCount ?? o.rank ?? o.popularity;
  const score = typeof scoreRaw === "number" ? scoreRaw : undefined;

  return { title, summary, url, platform, score };
}
