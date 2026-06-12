import { describe, expect, it } from "vitest";
import {
  buildClickatronGenerationPrompt,
  buildClickatronSourceContextBlock,
  resolveClickatronBrandContextBlock,
  resolveClickatronPromptBrandId,
} from "@/lib/clickatron/brand-prompt-context";
import { CLICKATRON_CREATIVE_SPEC_VERSION } from "@/lib/thinkforge/schemas/clickatron-creative-contract";
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

function creativeSpec() {
  return {
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind: "carousel",
    assetIntent: "carousel",
    platform: "linkedin",
    aspectRatio: "4:5",
    source: {
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_secret",
      sourceScriptId: "script_secret",
      sourceBlockIds: ["blk_secret"],
    },
    userIntent: {
      visualMode: "text_forward_graphic",
      textDensity: "medium",
      wantsCarousel: true,
    },
    creativeBrief: {
      objective: "Turn the post into a carousel.",
      coreMessage: "Context should travel with creative work.",
      hook: "Stop rebuilding context for every tool.",
      cta: "Design this in Clickatron",
    },
    renderPlan: {
      textPolicy: "editable_text_layers",
      imagePrompt: "Editorial carousel system with connected creative workflow nodes.",
      layoutIntent: "Use generous headline-safe space.",
      textLayers: [
        {
          id: "txt_hook",
          text: "Stop rebuilding context for every tool.",
          role: "headline",
          priority: 100,
          sourceBlockId: "blk_secret",
        },
      ],
      slides: [
        {
          id: "slide_1",
          index: 0,
          title: "Hook",
          imagePrompt: "Bold opening slide with workflow nodes.",
        },
      ],
    },
    validation: {
      status: "ready",
    },
  };
}

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
    expect(prompt).toContain("Do not render readable words");
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

  it("enriches prompts with the ThinkForge-authored Clickatron creative plan without leaking IDs", () => {
    const prompt = buildClickatronGenerationPrompt({
      prompt: "Create the Clickatron graphic.",
      metadata: {
        handoff: "think-to-click",
        sourceContext: {
          sourceService: "thinkforge",
          sourceSessionId: "tf_session_secret",
          sourceScriptId: "script_secret",
        },
        clickatron: {
          title: "Carousel handoff",
          creativeSpec: creativeSpec(),
        },
      },
    });

    expect(prompt).toContain("Creative kind: carousel");
    expect(prompt).toContain("Asset intent: carousel");
    expect(prompt).toContain("Image prompt: Editorial carousel system");
    expect(prompt).toContain("Core message concepts:");
    expect(prompt).toContain("Text layers: headline layer planned");
    expect(prompt).toContain("exact copy withheld from raster prompt");
    expect(prompt).toContain("Text-layer copy handling: exact copy is metadata only");
    expect(prompt).toContain("Carousel slides: Slide 1 (Hook): Bold opening slide");
    expect(prompt).toContain("Generate the raster image as a text-free visual/background");
    expect(prompt).toContain("Use Clickatron text-layer summaries only to reserve safe zones");
    expect(prompt).not.toContain("Stop rebuilding context for every tool.");
    expect(prompt).not.toContain("Design this in Clickatron");
    expect(prompt).not.toContain("tf_session_secret");
    expect(prompt).not.toContain("script_secret");
    expect(prompt).not.toContain("blk_secret");
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
