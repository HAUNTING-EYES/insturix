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

  it("builds Clickatron FormData from visible ThinkForge content when no hidden sidecar exists", () => {
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
    const formData = buildClickatronSessionFormData(state);
    const metadata = JSON.parse(String(formData.get("metadata")));

    expect(state.status).toBe("ready");
    expect(state.canSendToClickatron).toBe(true);
    expect(formData.get("prompt")).toContain("Create a text-free linkedin single-post visual background");
    expect(formData.get("prompt")).toContain("Do not render any readable words");
    expect(formData.get("prompt")).toContain("Text rendering policy: do not rasterize readable text");
    expect(formData.get("prompt")).not.toContain("Launch one idea once");
    expect(formData.get("sourceSessionId")).toBe("tf_session_123");
    expect(formData.get("sourceScriptId")).toBe("script_456");
    expect(metadata.clickatronHandoff.sourceBlockIds).toEqual(["blk_intro"]);
    expect(metadata.clickatron.creativeSpec.renderPlan.textPolicy).toBe("editable_text_layers");
    expect(metadata.clickatron.creativeSpec.renderPlan.textLayers[0]).toMatchObject({
      text: "Launch one idea once and keep its context connected.",
      sourceBlockId: "blk_intro",
      locked: true,
    });
    expect(metadata.clickatron.creativeSpec.validation.issues).toEqual([
      expect.objectContaining({ code: "derived_from_visible_content" }),
    ]);
  });

  it("throws instead of building a fallback payload when no session payload exists", () => {
    const state = buildThinkToClickHandoffState({
      context: buildThinkToClickContext({ sessionId: "tf_session_123" }),
      blocks: sourceBlocks(),
    });

    expect(() => buildClickatronSessionFormData(state)).toThrow("missing a session payload");
  });
});
