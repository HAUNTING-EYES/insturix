import { describe, expect, it } from "vitest";
import { buildThinkToClickContext } from "@/lib/thinkforge/clickatron-context";
import { buildThinkToClickHandoffState } from "@/lib/thinkforge/clickatron-handoff-state";
import { buildClickatronSessionFormData } from "@/lib/thinkforge/clickatron-session-payload";
import {
  CLICKATRON_CREATIVE_SPEC_VERSION,
  type ClickatronCreativeSpec,
} from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";

function sourceBlocks(): ThinkForgeBlock[] {
  return [
    {
      id: "blk_intro",
      kind: "paragraph",
      content: [{ type: "text", text: "Launch one idea once and keep its context connected.", styles: {} }],
    },
  ];
}

function creativeSpec(): ClickatronCreativeSpec {
  return {
    schemaVersion: CLICKATRON_CREATIVE_SPEC_VERSION,
    kind: "single_post_visual",
    assetIntent: "post_graphic",
    platform: "linkedin",
    aspectRatio: "4:5",
    source: {
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      sourceScriptId: "script_456",
      sourceBlockIds: ["blk_intro"],
      contentHash: "hash_current",
    },
    userIntent: {
      visualMode: "text_forward_graphic",
      textDensity: "medium",
      wantsCarousel: false,
    },
    creativeBrief: {
      objective: "Create a social post graphic.",
      coreMessage: "Context should travel with creative work.",
    },
    renderPlan: {
      textPolicy: "editable_text_layers",
      imagePrompt: "Editorial workflow graphic with connected creative nodes.",
      negativePrompt: "fake logos, misspelled text",
      textLayers: [
        {
          id: "txt_1",
          text: "Context travels",
          role: "headline",
          priority: 100,
          sourceBlockId: "blk_intro",
        },
      ],
    },
    validation: { status: "ready" },
  };
}

describe("ThinkForge to Clickatron session payload", () => {
  it("builds Clickatron FormData from a validated handoff state", () => {
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      projectId: "project_789",
      creativeSpec: creativeSpec(),
      projectLink: {
        universalId: "plink_abc",
        brandId: "brand_current",
        sourceScriptId: "script_456",
      },
      projectMeta: {
        brandId: "brand_current",
      },
    });
    const state = buildThinkToClickHandoffState({
      context,
      blocks: sourceBlocks(),
      userVisualChoices: {
        vibe: "sharp",
        imageStyle: "editorial",
      },
    });

    const formData = buildClickatronSessionFormData(state);
    const metadata = JSON.parse(String(formData.get("metadata")));

    expect(formData.get("prompt")).toContain("Editorial workflow graphic");
    expect(formData.get("prompt")).toContain("User visual choices:");
    expect(formData.get("aspectRatio")).toBe("4:5");
    expect(formData.get("brandId")).toBe("brand_current");
    expect(formData.get("projectId")).toBe("project_789");
    expect(formData.get("universalId")).toBe("plink_abc");
    expect(formData.get("sourceService")).toBe("thinkforge");
    expect(formData.get("sourceSessionId")).toBe("tf_session_123");
    expect(formData.get("sourceScriptId")).toBe("script_456");
    expect(metadata.clickatronHandoff).toMatchObject({
      status: "ready",
      sourceBlockIds: ["blk_intro"],
      contentHash: "hash_current",
    });
    expect(metadata.clickatron.creativeSpec.renderPlan.textPolicy).toBe("editable_text_layers");
  });

  it("keeps visible-content fallback as a draft instead of sendable FormData", () => {
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      blocks: sourceBlocks(),
      userVisualChoices: {
        kind: "single_post_visual",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        vibe: "sharp",
        imageStyle: "editorial",
      },
      projectMeta: {
        brandId: "brand_current",
      },
    });
    const state = buildThinkToClickHandoffState({
      context,
      blocks: sourceBlocks(),
      userVisualChoices: {
        vibe: "sharp",
        imageStyle: "editorial",
      },
    });
    const metadata = state.payloadPreview?.metadata ?? {};
    const spec = (metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(state.status).toBe("needs_user_input");
    expect(state.canSendToClickatron).toBe(false);
    expect(state.payloadPreview?.readyToGenerate).toBe(false);
    expect(state.requiredUserInput).toEqual(["Review and confirm the derived visual brief before sending to Clickatron."]);
    expect(state.payloadPreview?.prompt).toContain("Create a text-free linkedin single-post visual background");
    expect(state.payloadPreview?.prompt).toContain("Do not render any readable words");
    expect(state.payloadPreview?.prompt).toContain("Text rendering policy: do not rasterize readable text");
    expect(state.payloadPreview?.prompt).not.toContain("Launch one idea once");
    expect(spec.renderPlan.textPolicy).toBe("editable_text_layers");
    expect(spec.renderPlan.textLayers?.[0]).toMatchObject({
      text: "Launch one idea once and keep its context connected.",
      sourceBlockId: "blk_intro",
      locked: true,
    });
    expect(spec.validation.issues).toEqual([
      expect.objectContaining({ code: "derived_from_visible_content" }),
    ]);
    expect(() => buildClickatronSessionFormData(state)).toThrow("not ready to send: needs_user_input");
  });

  it("builds Clickatron FormData after a derived carousel plan is approved", () => {
    const carouselBlocks: ThinkForgeBlock[] = [
      ...sourceBlocks(),
      {
        id: "blk_proof",
        kind: "paragraph",
        content: [{ type: "text", text: "Every approved asset keeps its source context attached.", styles: {} }],
      },
    ];
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      blocks: carouselBlocks,
      userVisualChoices: {
        kind: "carousel",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
        imageStyle: "editorial",
      },
      projectMeta: {
        brandId: "brand_current",
      },
    });
    const state = buildThinkToClickHandoffState({
      context,
      blocks: carouselBlocks,
      userVisualChoices: {
        kind: "carousel",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
        imageStyle: "editorial",
        approvedVisualPlan: "true",
      },
    });

    const formData = buildClickatronSessionFormData(state);
    const metadata = JSON.parse(String(formData.get("metadata")));

    expect(state.status).toBe("ready");
    expect(state.canSendToClickatron).toBe(true);
    expect(state.payloadPreview?.readyToGenerate).toBe(true);
    expect(state.requiredUserInput).toEqual([]);
    expect(state.approval).toMatchObject({
      visualPlanRequired: true,
      visualPlanApproved: true,
      reasonCodes: ["derived_from_visible_content"],
    });
    expect(metadata.clickatron.creativeSpec.kind).toBe("carousel");
    expect(metadata.clickatron.creativeSpec.renderPlan.slides).toHaveLength(2);
    expect(metadata.clickatron.creativeSpec.renderPlan.slides.map((slide: { imagePrompt: string }) => slide.imagePrompt)).toEqual([
      expect.stringContaining("Slide 1"),
      expect.stringContaining("Slide 2"),
    ]);
    expect(metadata.clickatron.creativeSpec.validation.status).toBe("ready");
    expect(metadata.clickatron.creativeSpec.validation.needsUserInput).toBeUndefined();
    expect(metadata.clickatronHandoff.visualPlanApproval).toMatchObject({
      visualPlanApproved: true,
      reasonCodes: ["derived_from_visible_content"],
    });
  });

  it("builds Clickatron FormData from post writer output with a real image prompt", () => {
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      blocks: sourceBlocks(),
      writerOutput: {
        writerType: "post",
        visualPrompts: {
          singleImagePrompt: "Editorial workflow graphic with connected creative nodes and exact overlay text: Context travels.",
        },
      },
      userVisualChoices: {
        kind: "single_post_visual",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
      },
      projectMeta: {
        brandId: "brand_current",
      },
    });
    const state = buildThinkToClickHandoffState({
      context,
      blocks: sourceBlocks(),
    });
    const formData = buildClickatronSessionFormData(state);
    const metadata = JSON.parse(String(formData.get("metadata")));

    expect(state.status).toBe("ready");
    expect(state.canSendToClickatron).toBe(true);
    expect(formData.get("prompt")).toContain("Editorial workflow graphic with connected creative nodes");
    expect(formData.get("sourceSessionId")).toBe("tf_session_123");
    expect(formData.get("sourceScriptId")).toBe("script_456");
    expect(metadata.clickatron.creativeSpec.validation.status).toBe("ready");
  });

  it("preserves late prompt constraints instead of silently truncating the handoff", () => {
    const spec = creativeSpec();
    spec.renderPlan.imagePrompt = `${"Layered editorial evidence with deliberate composition. ".repeat(90)}NON_NEGOTIABLE_END_CONSTRAINT`;
    const context = buildThinkToClickContext({
      sessionId: "tf_session_long_prompt",
      scriptId: "script_long_prompt",
      creativeSpec: spec,
      projectMeta: { brandId: "brand_current" },
    });
    const state = buildThinkToClickHandoffState({
      context,
      blocks: sourceBlocks(),
    });

    const formData = buildClickatronSessionFormData(state);
    const prompt = String(formData.get("prompt"));

    expect(prompt.length).toBeGreaterThan(4_000);
    expect(prompt).toContain("NON_NEGOTIABLE_END_CONSTRAINT");
  });

  it("throws instead of building a fallback payload when no session payload exists", () => {
    const state = buildThinkToClickHandoffState({
      context: buildThinkToClickContext({ sessionId: "tf_session_123" }),
      blocks: sourceBlocks(),
    });

    expect(() => buildClickatronSessionFormData(state)).toThrow("missing a session payload");
  });
});
