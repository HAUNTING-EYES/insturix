import { describe, expect, it } from "vitest";
import { CalosTrendWatchScan } from "@/schemas/calos-trend-watch";
import {
  buildPublicTrendWatchQuery,
  isReusableTrendWatchScan,
  nextTrendWatchScanAt,
  normalizeTrendWatchIntervalHours,
  sanitizeTrendWatchCandidates,
} from "@/lib/calos/trend-watch-service";

describe("CalOS Trend Watcher public scan contract", () => {
  it("keeps public trend queries safe and produces a stable fingerprint", () => {
    const first = buildPublicTrendWatchQuery({
      publicNiche: "B2B workflow software https://private.example admin@example.com",
      platforms: ["linkedin", "instagram", "linkedin"],
      location: "India",
    } as never);
    const second = buildPublicTrendWatchQuery({
      publicNiche: "B2B workflow software",
      platforms: ["instagram", "linkedin"],
      location: "India",
    } as never);

    expect(first.niche).toBe("B2B workflow software");
    expect(first.platforms).toEqual(["instagram", "linkedin"]);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("enforces a two-to-three-day default cadence inside a bounded policy range", () => {
    const now = new Date("2026-07-12T00:00:00.000Z");

    expect(normalizeTrendWatchIntervalHours(undefined)).toBe(72);
    expect(normalizeTrendWatchIntervalHours(1)).toBe(24);
    expect(normalizeTrendWatchIntervalHours(500)).toBe(168);
    expect(nextTrendWatchScanAt(now, 48).toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(nextTrendWatchScanAt(now, undefined).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("keeps only safe, deduplicated public evidence", () => {
    const candidates = sanitizeTrendWatchCandidates([
      { title: "Workflow meme", summary: "A current format.", platform: "linkedin", url: "https://example.com/trend", score: 1.2 },
      { title: "Workflow meme", summary: "Duplicate", platform: "linkedin", url: "javascript:alert(1)" },
      { title: "", platform: "instagram" },
      null,
      "not a trend record",
    ]);

    expect(candidates).toEqual([{
      title: "Workflow meme",
      summary: "A current format.",
      platform: "linkedin",
      url: "https://example.com/trend",
      score: 1,
    }]);
  });

  it("records an invalid policy using a schema-valid sentinel query", () => {
    const scan = new CalosTrendWatchScan({
      scanId: "trend_scan_invalid",
      policyId: "policy_invalid",
      scopeKey: "user:user_1:brand:brand_1",
      ownerUserId: "user_1",
      brandId: "brand_1",
      queryFingerprint: "invalid_public_query",
      query: { niche: "invalid_public_query", platforms: [] },
      status: "failed",
      provider: "none",
      resultSource: "live",
      candidates: [],
      candidateCount: 0,
      startedAt: new Date("2026-07-12T00:00:00.000Z"),
      completedAt: new Date("2026-07-12T00:00:00.000Z"),
      failureCode: "invalid_public_query",
    });

    expect(scan.validateSync()).toBeUndefined();
  });
  it("reuses only fresh completed scans for the same public query", () => {
    const query = buildPublicTrendWatchQuery({ publicNiche: "creator economy", platforms: ["instagram"] } as never);
    const now = new Date("2026-07-12T12:00:00.000Z");
    const matching = {
      status: "completed",
      queryFingerprint: query.fingerprint,
      completedAt: new Date("2026-07-12T02:00:00.000Z"),
      candidates: [{ title: "Trend", platform: "instagram" }],
    };

    expect(isReusableTrendWatchScan(matching, query, now)).toBe(true);
    expect(isReusableTrendWatchScan({ ...matching, completedAt: new Date("2026-07-11T00:00:00.000Z") }, query, now)).toBe(false);
    expect(isReusableTrendWatchScan({ ...matching, queryFingerprint: "different" }, query, now)).toBe(false);
  });
});
