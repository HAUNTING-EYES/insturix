import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildClickatronGenerationPrompt,
  buildClickatronSourceContextBlock,
  resolveClickatronBrandContextBlock,
  resolveClickatronPromptBrandId,
} from "@/lib/clickatron/brand-prompt-context";
import {
  DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
  generateModelPayload,
} from "@/lib/config/clickatron-models";
import { ClickatronPromptBudgetError } from "@/lib/clickatron/generation-prompt-compiler";
import { CLICKATRON_CREATIVE_SPEC_VERSION } from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { UnifiedBrand } from "@/lib/shared/brand-registry";
import { resolveEffectiveBrandWithProfile } from "@/lib/shared/brand-effective-resolver";
import { buildBrandContextBlock } from "@/lib/shared/brand-context-block";
import { deriveBrandSignalProfile, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";

vi.mock("@/lib/shared/brand-effective-resolver", () => ({
  resolveEffectiveBrandWithProfile: vi.fn(),
}));

vi.mock("@/lib/shared/brand-context-block", () => ({
  buildBrandContextBlock: vi.fn((brand: UnifiedBrand | null) => (brand ? `BrandVault: ${brand.name}` : "")),
}));

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

function acceptedVaultProfile(): BrandSignalProfile {
  const profile = deriveBrandSignalProfile(unifiedBrand, {
    generatedAt: "2026-06-24T00:00:00.000Z",
  });

  setSignal(profile.visual.densityTolerance, 0.86, 0.9);
  setSignal(profile.visual.dataVizAffinity, 0.82, 0.88);
  setSignal(profile.visual.cornerRadiusBias, 0.2, 0.92);
  setSignal(profile.visual.layoutSymmetry, 0.84, 0.91);
  setSignal(profile.visual.contrastPreference, 0.88, 0.93);
  setSignal(profile.voice.hookArchetypes, ["contrarian proof", "metric-led before/after"], 0.86);
  setSignal(profile.voice.killList, ["revolutionary", "game-changing"], 0.95);

  return profile;
}

function setSignal<T>(signal: BrandSignal<T>, value: T, confidence: number): void {
  signal.value = value;
  signal.confidence = confidence;
  signal.trustLevel = "manual_user_entry";
  signal.authorityClass = "brand_preference";
  delete signal.fallbackReason;
}

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
          brandId: "brand_1",
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
    expect(prompt).toContain("Create a high-click thumbnail.");
    expect(prompt).toContain("Brand integrity: Never invent, redraw, or spell a logo from text.");
    expect(prompt).toContain("Use accepted Brand Vault logo evidence only");
    expect(prompt).not.toContain("tf_session_secret");
    expect(prompt).not.toContain("script_secret");
    expect(prompt).not.toContain("plink_secret");
    expect(prompt).not.toContain("brand_1");
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
    // Copy (coreMessage/hook/cta) must NOT be injected as a keyword bag — a text-capable
    // model bakes it into the image as word-salad. [R6]
    expect(prompt).not.toContain("Core message concepts:");
    expect(prompt).not.toContain("Hook concepts:");
    expect(prompt).not.toContain("CTA concepts:");
    expect(prompt).toContain("Text layers: headline layer planned");
    expect(prompt).toContain("exact copy withheld from raster prompt");
    expect(prompt).toContain("Text-layer copy handling: exact copy is metadata only");
    expect(prompt).toContain("Carousel slides: Slide 1 (Hook): Bold opening slide");
    expect(prompt).toContain("Raster text policy: Do not render readable text");
    expect(prompt).toContain("Generate a text-free raster background");
    expect(prompt).toContain("reserve clear safe zones for editable overlays");
    expect(prompt).not.toContain("Stop rebuilding context for every tool.");
    expect(prompt).not.toContain("Design this in Clickatron");
    expect(prompt).not.toContain("tf_session_secret");
    expect(prompt).not.toContain("script_secret");
    expect(prompt).not.toContain("blk_secret");
  });

  it("keeps editable text out of the raster prompt even when the model can render text", () => {
    const base = {
      prompt: "A cluttered agency workstation with four monitors. Text Overlay: 'THE FRAGMENTATION TRAP'.",
      metadata: { clickatron: { title: "Carousel handoff", creativeSpec: creativeSpec() } },
    };
    const prompt = buildClickatronGenerationPrompt({ ...base, modelId: "fal-ai/nano-banana-pro" });

    expect(prompt).toContain("Generate a text-free raster background");
    expect(prompt).toContain("Raster text policy: Do not render readable text");
    expect(prompt).toContain("Generate a text-free raster background");
    expect(prompt).not.toContain("THE FRAGMENTATION TRAP");
    expect(prompt).not.toContain("Stop rebuilding context for every tool.");
  });

  it("renders exact text only when minimal raster text is explicit and the model supports it", () => {
    const rasterTextSpec = creativeSpec();
    rasterTextSpec.renderPlan.textPolicy = "minimal_generated_text";
    const prompt = buildClickatronGenerationPrompt({
      prompt: "Create the Clickatron graphic.",
      metadata: { clickatron: { title: "Carousel handoff", creativeSpec: rasterTextSpec } },
      modelId: "fal-ai/nano-banana-pro",
    });

    expect(prompt).toContain("Raster text policy: Render only the exact supplied text hierarchy");
    expect(prompt).toContain("Text hierarchy: LEVEL 2");
    expect(prompt).toContain("Stop rebuilding context for every tool.");
  });

  it("fails closed when minimal raster text targets a model without text support", () => {
    const rasterTextSpec = creativeSpec();
    rasterTextSpec.renderPlan.textPolicy = "minimal_generated_text";
    const prompt = buildClickatronGenerationPrompt({
      prompt: "Create the Clickatron graphic.",
      metadata: { clickatron: { title: "Carousel handoff", creativeSpec: rasterTextSpec } },
      modelId: "fal-ai/imagen4/preview",
    });

    expect(prompt).toContain("Raster text policy: Do not render readable text");
    expect(prompt).not.toContain("Stop rebuilding context for every tool.");
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

  it("uses the Vault-aware effective brand resolver by default", async () => {
    vi.mocked(resolveEffectiveBrandWithProfile).mockResolvedValueOnce({
      brand: unifiedBrand,
      acceptedProfile: null,
      source: "legacy",
    });
    vi.mocked(buildBrandContextBlock).mockClear();

    const brandBlock = await resolveClickatronBrandContextBlock("user_1", "brand_direct");

    expect(resolveEffectiveBrandWithProfile).toHaveBeenCalledWith("user_1", "brand_direct", { service: "clickatron" });
    expect(buildBrandContextBlock).toHaveBeenCalledWith(unifiedBrand);
    expect(brandBlock).toBe("BrandVault: Signal Supply");
  });

  it("uses accepted Brand Vault profile visual signals in the final model payload prompt", async () => {
    vi.mocked(resolveEffectiveBrandWithProfile).mockResolvedValueOnce({
      brand: unifiedBrand,
      acceptedProfile: acceptedVaultProfile(),
      source: "brand_vault",
    });
    vi.mocked(buildBrandContextBlock).mockClear();

    const brandContextBlock = await resolveClickatronBrandContextBlock("user_1", "brand_direct");

    expect(resolveEffectiveBrandWithProfile).toHaveBeenCalledWith("user_1", "brand_direct", { service: "clickatron" });
    expect(buildBrandContextBlock).not.toHaveBeenCalled();
    expect(brandContextBlock).toContain("Brand source: accepted Brand Vault profile");
    expect(brandContextBlock).toContain("Brand colors: primary #111111; accent #f5c542");
    expect(brandContextBlock).toContain("high information density is allowed");
    expect(brandContextBlock).toContain("data, diagram, or dashboard metaphors are on-brand");
    expect(brandContextBlock).toContain("sharp or squared shape language");
    expect(brandContextBlock).toContain("structured symmetrical layout");
    expect(brandContextBlock).toContain("high-contrast composition");
    expect(brandContextBlock).toContain("Never use words/phrases: revolutionary, game-changing");

    const payload = generateModelPayload(
      DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
      { num_images: 1 },
      {
        prompt: buildClickatronGenerationPrompt({
          prompt: "Create a Clickatron visual.",
          metadata: { sourceContext: { sourceService: "thinkforge", brandId: "brand_direct" } },
          brandContextBlock,
          modelId: DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
        }),
      },
      "1:1",
      1024,
      1024,
    );

    expect(payload.prompt).toContain("Brand source: accepted Brand Vault profile");
    expect(payload.prompt).toContain("Brand colors: primary #111111; accent #f5c542");
    expect(payload.prompt).toContain("Visual direction:");
    expect(payload.prompt).toContain("sharp or squared shape language");
    expect(payload.prompt).toContain("Brand integrity: Never invent, redraw, or spell a logo from text.");
  });

  it("carries resolved BrandVault context into the final model payload prompt", async () => {
    const brandContextBlock = await resolveClickatronBrandContextBlock("user_1", "brand_direct", {
      getBrand: async () => unifiedBrand,
      formatBrand: (brand) => [
        "<brand_context>",
        `Brand: ${brand?.name}`,
        `Voice: ${brand?.voice.voiceLock}`,
        "</brand_context>",
      ].join("\n"),
    });
    const enrichedPrompt = buildClickatronGenerationPrompt({
      prompt: "Create a Clickatron visual.",
      metadata: {
        sourceContext: {
          sourceService: "thinkforge",
          brandId: "brand_direct",
        },
      },
      brandContextBlock,
      modelId: DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
    });
    const payload = generateModelPayload(
      DEFAULT_CLICKATRON_TEXT_TO_IMAGE_MODEL_ID,
      { num_images: 1 },
      { prompt: enrichedPrompt },
      "1:1",
      1024,
      1024,
    );

    expect(payload.prompt).toContain("Brand: Signal Supply");
    expect(payload.prompt).toContain("Voice: Plainspoken, sharp, no hype.");
    expect(payload.prompt).toContain("Brand integrity: Never invent, redraw, or spell a logo from text.");
  });

  it("preserves required ThinkForge visual and brand intent inside the actual image-edit provider limit", () => {
    const baseSpec = creativeSpec();
    const spec = {
      ...baseSpec,
      creativeBrief: {
        ...baseSpec.creativeBrief,
        keyClaims: ["Production context must remain traceable."],
      },
      brand: { hardConstraints: ["Never render invented logos."] },
    };
    const prompt = buildClickatronGenerationPrompt({
      prompt: "Create a high-contrast editorial carousel cover.",
      metadata: { clickatron: { creativeSpec: spec } },
      brandContextBlock: [
        "<brand_context>",
        "Brand: Signal Supply",
        "Brand colors: primary #111111; accent #f5c542",
        "Visual direction: structured symmetrical layout; high-contrast composition",
        "Never use words/phrases: revolutionary",
        "</brand_context>",
      ].join("\n"),
      modelId: "fal-ai/flux-kontext/dev",
      aspectRatio: "4:5",
      logoEvidenceAvailable: true,
      generationMode: "image-to-image",
    });
    const payload = generateModelPayload(
      "fal-ai/flux-kontext/dev",
      { image_urls: ["https://example.test/reference.png"], num_images: 1 },
      { prompt },
      "4:5",
      1024,
      1280,
    );

    expect(prompt).toContain("User request: Create a high-contrast editorial carousel cover.");
    expect(prompt).toContain("Visual brief: Editorial carousel system with connected creative workflow nodes.");
    expect(prompt).toContain("Brand hard constraints: Never render invented logos.");
    expect(prompt).toContain("Brand colors: primary #111111; accent #f5c542");
    expect(prompt).toContain("Visual direction: structured symmetrical layout; high-contrast composition");
    expect(prompt).toContain("Canvas aspect ratio: 4:5");
    expect(prompt).toContain("Use accepted Brand Vault logo evidence only");
    expect(payload.prompt.length).toBeLessThanOrEqual(1024);
  });

  it("rejects an oversized required contract for a 512-character image-edit model instead of truncating it", () => {
    const baseSpec = creativeSpec();
    const spec = {
      ...baseSpec,
      brand: { hardConstraints: ["Never render invented logos."] },
    };

    expect(() => buildClickatronGenerationPrompt({
      prompt: "Create a high-contrast editorial carousel cover.",
      metadata: { clickatron: { creativeSpec: spec } },
      brandContextBlock: [
        "<brand_context>",
        "Brand: Signal Supply",
        "Brand colors: primary #111111; accent #f5c542",
        "Visual direction: structured symmetrical layout; high-contrast composition",
        "Never use words/phrases: revolutionary",
        "</brand_context>",
      ].join("\n"),
      modelId: "fal-ai/bytedance/seedream/v5/lite/edit",
      aspectRatio: "4:5",
      logoEvidenceAvailable: true,
      generationMode: "image-to-image",
    })).toThrow(ClickatronPromptBudgetError);
  });

  it("uses the full model budget for text-to-image jobs without an edit preamble", () => {
    expect(() => buildClickatronGenerationPrompt({
      prompt: "x".repeat(800),
      modelId: "fal-ai/flux-kontext/dev",
      generationMode: "text-to-image",
    })).not.toThrow();
  });

  it("uses the semantic compiler in the worker and never applies a second positional prompt cut", () => {
    const worker = readFileSync(
      new URL("../../app/api/internal/workers/clickatron/variation/route.ts", import.meta.url),
      "utf8",
    );

    expect(worker).toContain("logoEvidenceAvailable: brandReferenceEvidence.some");
    expect(worker).toContain("generationMode: maskUrl");
    expect(worker).toContain("CLICKATRON_PROMPT_COMPILER_LIMIT_VIOLATION");
    expect(worker).not.toContain("fitClickatronPromptToModelLimit");
  });
});
