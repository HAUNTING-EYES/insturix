import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AlyzitronBrandContextError,
  buildAlyzitronAnalysisContext,
  resolveAlyzitronBrandContext,
} from "../../lib/alyzitron/services/brand-vault-context";
import { deriveBrandSignalProfile } from "../../lib/shared/brand-signal-profile";
import type { BrandSignalProfile } from "../../lib/shared/brand-signal-profile";
import type { UnifiedBrand } from "../../lib/shared/brand-registry";
import type { AlyzitronIntentResolution } from "../../app/api/services/alyzitron/types";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function brand(overrides: Partial<UnifiedBrand> = {}): UnifiedBrand {
  return {
    brandId: "brand_alyzi",
    userId: "user_alyzi",
    name: "Legacy Brand",
    voice: {
      voiceLock: "Measured, credible, practical.",
      nicheMap: "founder-led teams",
      killList: ["revolutionary"],
      hookArchetypes: ["proof-led"],
      structuralHabits: ["show the before and after"],
    },
    visual: {
      industry: "content operations",
      colors: ["#111111", "#f5c542"],
      visualStyle: "minimal high contrast",
      typography: "Space Grotesk",
    },
    learning: { banditProjectCount: 4 },
    ...overrides,
  };
}

function vaultProfile(): BrandSignalProfile {
  return deriveBrandSignalProfile(
    brand({
      name: "Vault Brand",
      visual: {
        industry: "AI video operations",
        colors: ["#123456", "#ffcc33"],
        visualStyle: "premium editorial contrast",
        typography: "Inter",
      },
      voice: {
        voiceLock: "Direct, specific, no fluff.",
        nicheMap: "agency operators",
        killList: ["cheap"],
        hookArchetypes: ["system-led"],
        structuralHabits: ["name the broken workflow first"],
      },
    }),
    { generatedAt: "2026-06-24T00:00:00.000Z" },
  );
}

describe("Alyzitron Brand Vault context", () => {
  it("returns empty context when no brand was selected", async () => {
    const result = await resolveAlyzitronBrandContext({ userId: "user_alyzi" }, {
      getLegacyBrand: async () => {
        throw new Error("should not read legacy without a brandId");
      },
      getAcceptedProfile: async () => {
        throw new Error("should not read Vault without a brandId");
      },
    });

    expect(result).toEqual({
      brand: null,
      profile: null,
      source: "none",
      brandContextBlock: "",
    });
  });

  it("prefers accepted Brand Vault profiles and keeps a formatted prompt block", async () => {
    const result = await resolveAlyzitronBrandContext({ userId: "user_alyzi", brandId: "brand_alyzi" }, {
      getLegacyBrand: async () => brand(),
      getAcceptedProfile: async (filter) => {
        expect(filter).toEqual({ userId: "user_alyzi", brandId: "brand_alyzi", orgId: null });
        return vaultProfile();
      },
      formatBrand: (resolved) => `Brand block: ${resolved?.name} / ${resolved?.visual.colors.join(", ")}`,
    });

    expect(result.source).toBe("brand_vault");
    expect(result.brand?.name).toBe("Vault Brand");
    expect(result.brandContextBlock).toContain("Vault Brand");
    expect(result.brandContextBlock).toContain("#123456");
  });

  it("uses the organization scope for an accepted Brand Vault profile", async () => {
    const result = await resolveAlyzitronBrandContext({
      userId: "user_alyzi",
      orgId: "org_agency",
      brandId: "brand_alyzi",
    }, {
      getLegacyBrand: async () => null,
      getAcceptedProfile: async (filter) => {
        expect(filter).toEqual({
          userId: "user_alyzi",
          orgId: "org_agency",
          brandId: "brand_alyzi",
        });
        return vaultProfile();
      },
    });

    expect(result.source).toBe("brand_vault");
    expect(result.brand?.name).toBe("Vault Brand");
  });

  it("throws loudly when a requested brand cannot resolve from Vault or legacy stores", async () => {
    await expect(
      resolveAlyzitronBrandContext({ userId: "user_alyzi", brandId: "missing_brand" }, {
        getLegacyBrand: async () => null,
        getAcceptedProfile: async () => null,
      }),
    ).rejects.toBeInstanceOf(AlyzitronBrandContextError);
  });

  it("adds brand context without replacing existing analysis context", () => {
    const context = buildAlyzitronAnalysisContext(
      { platform: "YouTube", additionalDetails: "Audit the pacing." },
      {
        brandId: "brand_alyzi",
        brand: brand({ name: "Vault Brand" }),
        profile: null,
        source: "brand_vault",
        brandContextBlock: "Brand: Vault Brand\nVoice: Direct.",
      },
    );

    expect(context.platform).toBe("YouTube");
    expect(context.brandId).toBe("brand_alyzi");
    expect(context.brandContextSource).toBe("brand_vault");
    expect(context.additionalDetails).toContain("Audit the pacing.");
    expect(context.additionalDetails).toContain("BRAND-AWARE ANALYSIS CONTEXT:");
  });


  it("adds content intent as an idempotent analysis lens", () => {
    const intentResolution: AlyzitronIntentResolution = {
      contentIntent: "competitor_content",
      source: "system_inferred",
      confidence: 0.75,
      rationale: ["User context mentions competitor language."],
      userConfirmed: false,
    };
    const brandResolution = {
      brandId: "brand_alyzi",
      brand: brand({ name: "Vault Brand" }),
      profile: null,
      source: "brand_vault" as const,
      brandContextBlock: "Brand: Vault Brand\nVoice: Direct.",
    };

    const context = buildAlyzitronAnalysisContext(
      { platform: "YouTube", additionalDetails: "Compare this to a rival." },
      brandResolution,
      intentResolution,
    );
    const rebuilt = buildAlyzitronAnalysisContext(context, brandResolution, intentResolution);

    expect(context.contentIntent).toBe("competitor_content");
    expect(context.intentSource).toBe("system_inferred");
    expect(context.intentResolution).toEqual(intentResolution);
    expect(String(context.additionalDetails).match(/BRAND-AWARE ANALYSIS CONTEXT:/g)).toHaveLength(1);
    expect(String(context.additionalDetails).match(/ALYZITRON CONTENT INTENT:/g)).toHaveLength(1);
    expect(context.additionalDetails).toContain("what the user can adapt without copying");
    expect(rebuilt.additionalDetails).toBe(context.additionalDetails);
  });

  it("keeps the processor and Gemini prompt wired to brand and intent context", () => {
    const processorRoute = readRepoFile("app/api/services/alyzitron/processor/route.ts");
    const analyzeRoute = readRepoFile("app/api/services/alyzitron/analyze/route.ts");
    const vertexService = readRepoFile("lib/services/vertexAiService.ts");

    expect(analyzeRoute).toContain("resolveAlyzitronTaskBrandId");
    expect(analyzeRoute).toContain("resolveAlyzitronBrandContext({ userId, orgId: orgId ?? null, brandId: taskBrandId })");
    expect(analyzeRoute).toContain("resolveAlyzitronContentIntent");
    expect(analyzeRoute).toContain("contentIntent: intentResolution.contentIntent");
    expect(analyzeRoute).toContain("context: analysisContext");
    expect(processorRoute).toContain("resolveAlyzitronBrandContext");
    expect(processorRoute).toContain("orgId: cleanString(task.orgId) ?? null,");
    expect(processorRoute).toContain("resolveAlyzitronContentIntent");
    expect(processorRoute).toContain("buildAlyzitronAnalysisContext(task.context || {}, brandContext, intentResolution)");
    expect(processorRoute).toContain("...intentMetadata");
    expect(processorRoute).toContain("...intentCompletionFields");
    expect(processorRoute).not.toContain("buildAlyzitronAnalysisContext(analysisContext");
    expect(processorRoute).not.toContain("...(analysisMetadata)");
    expect(processorRoute).toContain("runGeminiAnalysis(task.videoUrl, analysisContext, analysisMetadata)");
    expect(vertexService).toContain("BRAND ALIGNMENT:");
    expect(vertexService).toContain("Separate observed media facts from brand-fit judgments");
    expect(vertexService).toContain("CONTENT INTENT LENS:");
    expect(vertexService).toContain("applicable_takeaways");
    expect(vertexService).toContain("brand_fit_summary");
    expect(vertexService).toContain("BRAND CONTEXT:");
  });
});
