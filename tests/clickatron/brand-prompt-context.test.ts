import { describe, expect, it } from "vitest";
import {
  buildClickatronGenerationPrompt,
  buildClickatronSourceContextBlock,
  resolveClickatronBrandContextBlock,
  resolveClickatronPromptBrandId,
} from "@/lib/clickatron/brand-prompt-context";
import type { UnifiedBrand } from "@/lib/shared/brand-registry";

const unifiedBrand: UnifiedBrand = {
  brandId: "brand_direct",
  userId: "user_1",
  name: "Signal Supply",
  voice: {
    voiceLock: "Plainspoken, sharp, no hype.",
    nicheMap: "Technical founders",
    killList: ["revolutionary"],
    hookArchetypes: ["contrarian proof"],
    structuralHabits: ["short hook", "specific claim"],
  },
  visual: {
    industry: "B2B software",
    colors: ["#111111", "#F5C542"],
    visualStyle: "editorial contrast",
    typography: "condensed sans",
  },
  learning: {
    banditProjectCount: 0,
  },
};

describe("Clickatron brand prompt context", () => {
  it("enriches generation prompts with safe ThinkForge metadata and BrandVault context", () => {
    const metadata = {
      handoff: "think-to-click",
      sourceContext: {
        sourceService: "thinkforge",
        sourceSessionId: "tf_session_secret",
        sourceScriptId: "script_secret",
        universalId: "plink_secret",
        brandId: "brand_1",
        projectId: "project_secret",
      },
      thinkforge: {
        script: { title: "Launch Story" },
        projectMeta: {
          idea: "Launch the new analytics workflow",
          platform: "YouTube",
          brandBrief: "Use uploaded logo only. Keep copy terse.",
          clientName: "ScaleOps Studio",
          campaignId: "campaign_authority_june",
          campaignName: "June authority sprint",
          seriesId: "founder-proof-series",
          calendarItemId: "calendar_week_2_linkedin",
          contentCardId: "card_linkedin_carousel_01",
          preferences: { doNotLeak: true },
        },
      },
      clickatron: {
        title: "Launch thumbnail",
        aspectRatio: "16:9",
      },
    };

    const prompt = buildClickatronGenerationPrompt({
      prompt: "Create a high-click thumbnail.",
      metadata,
      brandContextBlock:
        "<brand_context>\nBrand: Signal Supply\nVoice: Plainspoken, sharp, no hype.\n</brand_context>",
    });

    expect(prompt).toContain("<clickatron_source_context>");
    expect(prompt).toContain("Source service: thinkforge");
    expect(prompt).toContain("Script title: Launch Story");
    expect(prompt).toContain("Idea: Launch the new analytics workflow");
    expect(prompt).toContain("Platform: YouTube");
    expect(prompt).toContain("Brand brief: Use uploaded logo only. Keep copy terse.");
    expect(prompt).toContain("Client: ScaleOps Studio");
    expect(prompt).toContain("Campaign ID: campaign_authority_june");
    expect(prompt).toContain("Campaign: June authority sprint");
    expect(prompt).toContain("Series: founder-proof-series");
    expect(prompt).toContain("Calendar item: calendar_week_2_linkedin");
    expect(prompt).toContain("Content card: card_linkedin_carousel_01");
    expect(prompt).toContain("Brand: Signal Supply");
    expect(prompt).toContain("<clickatron_thumbnail_request>");
    expect(prompt).toContain("Create a high-click thumbnail.");
    expect(prompt).toContain("Do not invent logos");
    expect(prompt).not.toContain("tf_session_secret");
    expect(prompt).not.toContain("script_secret");
    expect(prompt).not.toContain("plink_secret");
    expect(prompt).not.toContain("project_secret");
    expect(prompt).not.toContain("doNotLeak");
  });

  it("leaves no-context prompts as plain user prompts", () => {
    expect(
      buildClickatronGenerationPrompt({
        prompt: "Create a clean product thumbnail.",
      }),
    ).toBe("Create a clean product thumbnail.");
  });

  it("filters raw handoff IDs and private nested values from source context", () => {
    const block = buildClickatronSourceContextBlock({
      handoff: "think-to-click",
      sourceContext: {
        sourceService: "thinkforge",
        sourceSessionId: "tf_session_secret",
        sourceScriptId: "script_secret",
        universalId: "plink_secret",
        projectId: "project_secret",
      },
      thinkforge: {
        projectMeta: {
          brandBrief: "Minimal yellow-black system.",
          clientName: "Signal Supply",
          campaignName: "Demo day launch",
          preferences: { doNotLeak: true },
        },
      },
    });

    expect(block).toContain("Handoff: think-to-click");
    expect(block).toContain("Brand brief: Minimal yellow-black system.");
    expect(block).toContain("Client: Signal Supply");
    expect(block).toContain("Campaign: Demo day launch");
    expect(block).not.toContain("tf_session_secret");
    expect(block).not.toContain("script_secret");
    expect(block).not.toContain("plink_secret");
    expect(block).not.toContain("project_secret");
    expect(block).not.toContain("doNotLeak");
  });

  it("prefers task brandId and resolves BrandVault context through injected deps", async () => {
    expect(
      resolveClickatronPromptBrandId("brand_direct", {
        sourceContext: { brandId: "brand_source" },
      }),
    ).toBe("brand_direct");
    expect(
      resolveClickatronPromptBrandId(" ", {
        sourceContext: { brandId: "brand_source" },
      }),
    ).toBe("brand_source");

    const brandBlock = await resolveClickatronBrandContextBlock("user_1", "brand_direct", {
      getBrand: async (userId, brandId) => {
        expect(userId).toBe("user_1");
        expect(brandId).toBe("brand_direct");
        return unifiedBrand;
      },
      formatBrand: (brand) => `BrandVault: ${brand?.name}`,
    });

    expect(brandBlock).toBe("BrandVault: Signal Supply");
  });
});
