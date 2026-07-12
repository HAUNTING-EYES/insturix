import { describe, expect, it } from "vitest";
import type { BrandSignal, BrandSignalProfile } from "@/lib/shared/brand-signal-profile";
import {
  buildTrendOpportunitySourceKey,
  evaluateTrendCandidate,
  MIN_TREND_OPPORTUNITY_SCORE,
} from "@/lib/calos/trend-opportunity-service";

function signal<T>(value: T, overrides: Partial<BrandSignal<T>> = {}): BrandSignal<T> {
  return {
    value,
    confidence: 0.9,
    trustLevel: "manual_user_entry",
    authorityClass: "brand_fact",
    evidenceIds: ["e1"],
    ...overrides,
  };
}

function profile(): BrandSignalProfile {
  return {
    generatedAt: "2026-07-12T00:00:00.000Z",
    identity: {
      brandName: signal("Opspace"),
      category: signal("workflow software"),
      industry: signal("B2B SaaS"),
      audience: signal(["operations teams"]),
      productServices: signal(["workflow automation"]),
      proofStyle: signal("metrics"),
      audiencePsychographics: {
        valueDrivers: signal(["predictable operations"]),
        painPoints: signal(["manual handoffs"]),
        jobsToBeDone: signal(["reduce operational bottlenecks"]),
      },
    },
    voice: {
      killList: signal(["get rich quick"]),
    },
  } as unknown as BrandSignalProfile;
}

describe("CalOS Trend Opportunity private matcher", () => {
  it("suggests a high-fit public trend from accepted product and audience signals", () => {
    const decision = evaluateTrendCandidate({
      title: "Workflow automation templates are taking over operations teams",
      summary: "A practical B2B SaaS format for teams tired of manual handoffs.",
      platform: "linkedin",
      score: 0.9,
    }, profile());

    expect(decision.status).toBe("suggested");
    expect(decision.relevanceScore).toBeGreaterThanOrEqual(MIN_TREND_OPPORTUNITY_SCORE);
    expect(decision.reasonCodes).toContain("product_or_service");
    expect(decision.matchedSignalPaths).toContain("identity.productServices");
    expect(JSON.stringify(decision)).not.toContain("workflow automation");
  });

  it("blocks a trend that conflicts with an accepted brand constraint", () => {
    const decision = evaluateTrendCandidate({
      title: "Get rich quick content formats are trending again",
      platform: "instagram",
      score: 0.95,
    }, profile());

    expect(decision).toMatchObject({
      status: "blocked",
      reasonCodes: ["brand_constraint"],
      matchedSignalPaths: ["voice.killList"],
    });
  });

  it("records only the accepted signal path that actually matched", () => {
    const decision = evaluateTrendCandidate({
      title: "Workflow automation templates",
      platform: "linkedin",
      score: 0.9,
    }, profile());

    expect(decision).toMatchObject({ status: "suggested", matchedSignalPaths: ["identity.productServices"] });
  });

  it("rejects unrelated public noise instead of forcing it into a brand calendar", () => {
    const decision = evaluateTrendCandidate({
      title: "Summer streetwear color challenge",
      summary: "Creators compare festival outfits and accessories.",
      platform: "instagram",
      score: 0.95,
    }, profile());

    expect(decision).toMatchObject({ status: "not_relevant", reasonCodes: ["insufficient_brand_fit"] });
  });

  it("blocks matching when the accepted profile has no actionable relevance signals", () => {
    const emptyProfile = profile();
    emptyProfile.identity.industry = signal("", { trustLevel: "fallback_default", authorityClass: "inferred_hint", confidence: 0.1 });
    emptyProfile.identity.category = signal("", { trustLevel: "fallback_default", authorityClass: "inferred_hint", confidence: 0.1 });
    emptyProfile.identity.audience = signal([], { trustLevel: "fallback_default", authorityClass: "inferred_hint", confidence: 0.1 });
    emptyProfile.identity.productServices = signal([], { trustLevel: "fallback_default", authorityClass: "inferred_hint", confidence: 0.1 });
    emptyProfile.identity.audiencePsychographics = undefined;

    const decision = evaluateTrendCandidate({ title: "Workflow automation templates", platform: "linkedin" }, emptyProfile);

    expect(decision).toMatchObject({ status: "blocked", reasonCodes: ["accepted_relevance_signals_required"] });
  });

  it("derives an idempotent source key per scan candidate", () => {
    const candidate = { title: "Workflow automation templates", platform: "linkedin" };
    expect(buildTrendOpportunitySourceKey("scan_1", 0, candidate)).toBe(buildTrendOpportunitySourceKey("scan_1", 0, candidate));
    expect(buildTrendOpportunitySourceKey("scan_1", 0, candidate)).not.toBe(buildTrendOpportunitySourceKey("scan_1", 1, candidate));
  });
});