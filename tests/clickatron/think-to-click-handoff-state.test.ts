import { describe, expect, it } from "vitest";
import { buildThinkToClickContext, type ThinkToClickContext } from "@/lib/thinkforge/clickatron-context";
import { buildThinkToClickHandoffState } from "@/lib/thinkforge/clickatron-handoff-state";
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
      content: [{ type: "text", text: "Launch one idea once and let every service reuse the context.", styles: {} }],
    },
    {
      id: "blk_cta",
      kind: "action",
      content: [{ type: "text", text: "Send the visual brief to Clickatron when the post is ready.", styles: {} }],
    },
  ];
}

function singlePostSpec(validation: ClickatronCreativeSpec["validation"] = { status: "ready" }): ClickatronCreativeSpec {
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
      sourceBlockIds: ["blk_intro", "blk_cta"],
      contentHash: "hash_current",
    },
    calendar: {
      contentCardId: "card_1",
      campaignId: "campaign_1",
    },
    userIntent: {
      visualMode: "text_forward_graphic",
      textDensity: "medium",
      wantsCarousel: false,
    },
    creativeBrief: {
      objective: "Turn the post into a polished social graphic.",
      coreMessage: "Context should travel with creative work.",
      hook: "Stop rebuilding context for every tool.",
      cta: "Design this in Clickatron",
    },
    brand: {
      brandId: "brand_current",
      brandSnapshotId: "brand_snapshot_1",
      hardConstraints: ["Use uploaded brand colors only"],
      softPreferences: ["High contrast editorial layouts"],
    },
    renderPlan: {
      textPolicy: "editable_text_layers",
      imagePrompt: "Editorial social graphic with connected creative workflow nodes.",
      negativePrompt: "misspelled words, fake logos, cluttered composition",
      layoutIntent: "Strong headline area with a clean supporting visual.",
      textLayers: [
        {
          id: "txt_hook",
          text: "Stop rebuilding context for every tool.",
          role: "headline",
          priority: 100,
          sourceBlockId: "blk_intro",
        },
      ],
    },
    validation,
  };
}

function carouselSpec(): ClickatronCreativeSpec {
  const base = singlePostSpec();
  return {
    ...base,
    kind: "carousel",
    assetIntent: "carousel",
    userIntent: { ...base.userIntent, wantsCarousel: true },
    renderPlan: {
      ...base.renderPlan,
      imagePrompt: "Cohesive two-slide carousel about reusable creative context.",
      slides: [
        {
          id: "slide_hook",
          index: 0,
          title: "Hook",
          sourceBlockIds: ["blk_intro"],
          imagePrompt: "Slide one with a bold hook about reusable context.",
          layoutIntent: "Large headline with simple pipeline motif.",
        },
        {
          id: "slide_cta",
          index: 1,
          title: "CTA",
          sourceBlockIds: ["blk_cta"],
          imagePrompt: "Slide two with a clear CTA to design in Clickatron.",
          layoutIntent: "CTA-forward layout with brand-safe whitespace.",
        },
      ],
    },
  };
}

function contextFor(creativeSpec?: ClickatronCreativeSpec): ThinkToClickContext {
  return buildThinkToClickContext({
    sessionId: "tf_session_123",
    scriptId: "script_456",
    projectId: "project_789",
    title: "Launch Post",
    projectMeta: {
      brandId: "brand_current",
      brandBrief: "Use uploaded brand assets and keep copy terse.",
    },
    projectLink: {
      universalId: "plink_abc",
      brandId: "brand_current",
      sourceScriptId: "script_from_link",
    },
    creativeSpec,
  });
}

describe("ThinkForge to Clickatron handoff state", () => {
  it("marks a validated single-post sidecar as sendable and preserves payload metadata", () => {
    const state = buildThinkToClickHandoffState({
      context: contextFor(singlePostSpec()),
      blocks: sourceBlocks(),
      currentContentHash: "hash_current",
      userVisualChoices: { imageStyle: "editorial collage", vibe: "sharp but warm" },
    });

    expect(state.status).toBe("ready");
    expect(state.canSendToClickatron).toBe(true);
    expect(state.payloadPreview).toMatchObject({
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      sourceScriptId: "script_456",
      brandId: "brand_current",
      projectId: "project_789",
      universalId: "plink_abc",
      aspectRatio: "4:5",
      readyToGenerate: true,
    });
    expect(state.payloadPreview?.prompt).toContain("Editorial social graphic");
    expect(state.payloadPreview?.metadata).toMatchObject({
      handoff: "think-to-click",
      clickatron: {
        creativeSpec: {
          source: { sourceBlockIds: ["blk_intro", "blk_cta"] },
          renderPlan: { textPolicy: "editable_text_layers" },
        },
      },
    });
    expect(state.display.sourceSnippets[0]).toMatchObject({
      label: "Paragraph 1",
      found: true,
      text: expect.stringContaining("Launch one idea"),
    });
    expect(JSON.stringify(state.display)).not.toContain("blk_intro");
    expect(state.debug.sourceBlockIds).toContain("blk_intro");
  });

  it("blocks sending when the hidden sidecar is absent", () => {
    const state = buildThinkToClickHandoffState({ context: contextFor(), blocks: sourceBlocks() });

    expect(state.status).toBe("missing_sidecar");
    expect(state.canSendToClickatron).toBe(false);
    expect(state.payloadPreview).toBeUndefined();
    expect(state.issues[0]?.code).toBe("missing_clickatron_sidecar");
  });

  it("blocks malformed sidecar metadata instead of inventing a fallback prompt", () => {
    const context: ThinkToClickContext = {
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      metadata: {
        clickatron: {
          creativeSpec: {
            ...singlePostSpec(),
            schemaVersion: 999,
          },
        },
      },
    };

    const state = buildThinkToClickHandoffState({ context });

    expect(state.status).toBe("invalid");
    expect(state.canSendToClickatron).toBe(false);
    expect(state.payloadPreview).toBeUndefined();
    expect(state.issues[0]?.code).toBe("invalid_creative_spec");
  });

  it("surfaces required user input without allowing generation", () => {
    const state = buildThinkToClickHandoffState({
      context: contextFor(
        singlePostSpec({
          status: "needs_user_input",
          needsUserInput: ["Choose image style", "Confirm platform"],
        }),
      ),
      blocks: sourceBlocks(),
    });

    expect(state.status).toBe("needs_user_input");
    expect(state.canSendToClickatron).toBe(false);
    expect(state.requiredUserInput).toEqual(["Choose image style", "Confirm platform"]);
    expect(state.payloadPreview?.readyToGenerate).toBe(false);
  });

  it("marks ready sidecars stale when content hash or source links no longer match", () => {
    const state = buildThinkToClickHandoffState({
      context: contextFor(singlePostSpec()),
      blocks: [sourceBlocks()[0]],
      currentContentHash: "hash_changed",
    });

    expect(state.status).toBe("stale");
    expect(state.canSendToClickatron).toBe(false);
    expect(state.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["content_hash_mismatch", "source_blocks_missing"]),
    );
    expect(state.debug.missingSourceBlockIds).toEqual(["blk_cta"]);
    expect(JSON.stringify(state.display)).not.toContain("blk_cta");
  });

  it("summarizes carousel slides as first-class handoff state", () => {
    const state = buildThinkToClickHandoffState({
      context: contextFor(carouselSpec()),
      blocks: sourceBlocks(),
      currentContentHash: "hash_current",
    });

    expect(state.status).toBe("ready");
    expect(state.display.kind).toBe("carousel");
    expect(state.display.slideCount).toBe(2);
    expect(state.display.slides).toEqual([
      expect.objectContaining({
        label: "Slide 1",
        title: "Hook",
        sourceLabels: ["Paragraph 1"],
      }),
      expect.objectContaining({
        label: "Slide 2",
        title: "CTA",
        sourceLabels: ["Action 2"],
      }),
    ]);
    expect(state.payloadPreview?.prompt).toContain("Carousel slide plan");
  });
});
