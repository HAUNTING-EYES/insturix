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

function creativePlatformProfile(): BrandSignalProfile {
  const result = profile();
  result.identity.brandName = signal("Example Creative Platform");
  result.identity.category = signal("automated content production platform");
  result.identity.industry = signal("SaaS software");
  result.identity.audience = signal(["creator houses", "agencies", "filmmakers", "content teams"]);
  result.identity.productServices = signal([
    "scriptwriting",
    "video editing",
    "image design",
    "automated content production",
    "multi-channel distribution",
  ]);
  result.identity.audiencePsychographics = undefined;
  return result;
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

  it("matches brand constraints on phrase boundaries instead of substrings", () => {
    const boundaryProfile = profile();
    boundaryProfile.voice.killList = signal(["war"]);
    const decision = evaluateTrendCandidate({
      title: "Workflow software automation for operations teams",
      platform: "linkedin",
      score: 0.9,
    }, boundaryProfile);

    expect(decision.status).toBe("suggested");
    expect(decision.reasonCodes).not.toContain("brand_constraint");
  });

  it("records every accepted signal path that contributed to the decision", () => {
    const decision = evaluateTrendCandidate({
      title: "Workflow automation templates",
      platform: "linkedin",
      score: 0.9,
    }, profile());

    expect(decision).toMatchObject({
      status: "suggested",
      matchedSignalPaths: ["identity.category", "identity.productServices"],
    });
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

  it("recognizes concept-level fit when a real trend uses different words than the accepted brand profile", () => {
    const decision = evaluateTrendCandidate({
      title: "AI-powered localized video variants at scale",
      summary: "Brands are producing multilingual campaign videos without rebuilding every creative by hand.",
      platform: "instagram",
      score: 0.88,
    }, creativePlatformProfile());

    expect(decision.status).toBe("suggested");
    expect(decision.relevanceScore).toBeGreaterThanOrEqual(MIN_TREND_OPPORTUNITY_SCORE);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(["industry_or_category", "product_or_service"]));
    expect(decision.matchedSignalPaths).toEqual(expect.arrayContaining([
      "identity.category",
      "identity.productServices",
    ]));
  });

  it("recognizes character-consistent AI video as a creative-production opportunity", () => {
    const decision = evaluateTrendCandidate({
      title: "Character-consistent AI video is becoming usable for brands",
      summary: "New generation models keep a presenter visually consistent across campaign scenes.",
      platform: "youtube",
      score: 0.82,
    }, creativePlatformProfile());

    expect(decision.status).toBe("suggested");
    expect(decision.matchedSignalPaths).toContain("identity.productServices");
  });

  it("matches a live Sonar video-generation signal without private context leaving the matcher", () => {
    const decision = evaluateTrendCandidate({
      title: "Gemini and Veo video generation expansion",
      platform: "youtube",
    }, creativePlatformProfile());

    expect(decision).toMatchObject({
      status: "suggested",
      reasonCodes: expect.arrayContaining(["industry_or_category", "product_or_service"]),
      matchedSignalPaths: expect.arrayContaining([
        "identity.category",
        "identity.productServices",
      ]),
    });
    expect(decision.relevanceScore).toBeGreaterThanOrEqual(MIN_TREND_OPPORTUNITY_SCORE);
  });

  it("uses brand fit without inventing momentum when a provider did not supply a score", () => {
    const decision = evaluateTrendCandidate({
      title: "AI-powered localized video variants at scale",
      summary: "Brands produce multilingual video variants without rebuilding every creative.",
      platform: "instagram",
    }, creativePlatformProfile());

    expect(decision.status).toBe("suggested");
    expect(decision.reasonCodes).not.toContain("trend_momentum");
  });

  it("does not treat generic AI momentum as brand fit without a shared business domain", () => {
    const decision = evaluateTrendCandidate({
      title: "AI stock-trading alerts surge among retail investors",
      summary: "Automated portfolios and options signals dominate finance communities this week.",
      platform: "youtube",
      score: 0.98,
    }, creativePlatformProfile());

    expect(decision).toMatchObject({ status: "not_relevant", reasonCodes: ["insufficient_brand_fit"] });
  });

  it("does not force a weak audience-only overlap into the review queue", () => {
    const decision = evaluateTrendCandidate({
      title: "Agency founders share their favorite airport lounges",
      summary: "A travel carousel comparing hospitality perks for business travelers.",
      platform: "instagram",
      score: 0.96,
    }, creativePlatformProfile());

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

  it("deduplicates one canonical trend per brand and seven-day window", () => {
    const first = {
      title: "Workflow automation templates",
      platform: "linkedin",
      url: "https://www.example.com/trend/?utm_source=feed&b=2&a=1",
    };
    const repeated = {
      ...first,
      url: "https://example.com/trend?a=1&b=2#comments",
    };
    const observedAt = new Date("2026-07-12T00:00:00.000Z");

    expect(buildTrendOpportunitySourceKey("user:user_1:brand_1", first, observedAt))
      .toBe(buildTrendOpportunitySourceKey("user:user_1:brand_1", repeated, observedAt));
    expect(buildTrendOpportunitySourceKey("user:user_1:brand_1", first, observedAt))
      .not.toBe(buildTrendOpportunitySourceKey("user:user_2:brand_1", first, observedAt));
    expect(buildTrendOpportunitySourceKey("user:user_1:brand_1", first, observedAt))
      .not.toBe(buildTrendOpportunitySourceKey("user:user_1:brand_1", first, new Date("2026-07-20T00:00:00.000Z")));
  });
});
