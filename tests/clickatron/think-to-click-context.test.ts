import { describe, expect, it } from "vitest";
import { buildThinkToClickContext, pickThinkForgeProjectMeta } from "@/lib/thinkforge/clickatron-context";
import { mergeThinkForgeProjectMetadata } from "@/lib/thinkforge/state/types";
import type { ClickatronCreativeSpec } from "@/lib/thinkforge/schemas/clickatron-creative-contract";
import type { ThinkForgeBlock } from "@/lib/thinkforge/schemas/thinkforge-block";

describe("ThinkForge to Clickatron context", () => {
  it("preserves BrandVault and project-link provenance for Clickatron", () => {
    const context = buildThinkToClickContext({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      projectId: "editron_project_789",
      title: "Launch Video",
      aspectRatio: "16:9",
      scenesCount: 4,
      projectMeta: {
        brandId: "brand_current",
        brandBrief: "Use the uploaded logo only. Keep copy terse.",
        campaignId: "campaign_launch",
        calendarItemId: "calendar_launch",
        contentCardId: "card_launch",
        idea: "Launch the new product",
        platform: "YouTube",
        preferences: { doNotLeak: true },
      },
      projectLink: {
        universalId: "plink_abc",
        brandId: "brand_stale",
        sourceScriptId: "script_from_link",
      },
    });

    expect(context).toMatchObject({
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      sourceScriptId: "script_456",
      universalId: "plink_abc",
      brandId: "brand_current",
      projectId: "editron_project_789",
    });
    expect(context.metadata.sourceContext).toMatchObject({
      sourceService: "thinkforge",
      universalId: "plink_abc",
      brandId: "brand_current",
    });
    expect(context.metadata.thinkforge).toMatchObject({
      sessionId: "tf_session_123",
      scriptId: "script_456",
      projectMeta: {
        brandId: "brand_current",
        brandBrief: "Use the uploaded logo only. Keep copy terse.",
        campaignId: "campaign_launch",
        calendarItemId: "calendar_launch",
        contentCardId: "card_launch",
        idea: "Launch the new product",
        platform: "YouTube",
      },
    });
    expect(JSON.stringify(context.metadata)).not.toContain("doNotLeak");
  });

  it("fails loudly when session context is missing", () => {
    expect(() => buildThinkToClickContext({ sessionId: "   " })).toThrow(
      "ThinkForge sessionId is required",
    );
  });

  it("picks only the project metadata that should cross service boundaries", () => {
    expect(
      pickThinkForgeProjectMeta({
        brandId: "brand_1",
        brandBrief: "Brand rules",
        clientId: "client_1",
        clientName: "Acme",
        campaignId: "campaign_1",
        campaignName: "Launch Month",
        seriesId: "series_1",
        calendarItemId: "calendar_1",
        contentCardId: "card_1",
        preferences: { internal: true },
      }),
    ).toEqual({
      brandId: "brand_1",
      brandBrief: "Brand rules",
      clientId: "client_1",
      clientName: "Acme",
      campaignId: "campaign_1",
      campaignName: "Launch Month",
      seriesId: "series_1",
      calendarItemId: "calendar_1",
      contentCardId: "card_1",
    });
  });

  it("preserves ThinkForge source metadata when chat sends a thin project payload", () => {
    const merged = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        brandBrief: "Use the yellow-black visual system. Avoid hype words.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        seriesId: "series_1",
        idea: "Original idea",
        platform: "LinkedIn",
      },
      {
        idea: "Updated idea for the current generation",
        platform: "Instagram",
        brandId: "   ",
      },
      { density: "compact" },
    );

    expect(merged).toMatchObject({
      brandId: "brand_session",
      brandBrief: "Use the yellow-black visual system. Avoid hype words.",
      campaignId: "campaign_1",
      calendarItemId: "calendar_1",
      seriesId: "series_1",
      idea: "Updated idea for the current generation",
      platform: "Instagram",
      preferences: { density: "compact" },
    });
  });

  it("allows explicit non-empty request metadata to override stored source metadata", () => {
    const merged = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        campaignId: "campaign_old",
      },
      {
        brandId: "brand_request",
        campaignId: "campaign_new",
      },
    );

    expect(merged.brandId).toBe("brand_request");
    expect(merged.campaignId).toBe("campaign_new");
  });

  it("feeds preserved chat metadata into Clickatron handoff context", () => {
    const projectMeta = mergeThinkForgeProjectMetadata(
      {
        brandId: "brand_session",
        brandBrief: "Use approved product marks only.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        idea: "Approval ops carousel",
        platform: "LinkedIn",
      },
      {
        idea: "Approval ops carousel v2",
      },
    );

    const context = buildThinkToClickContext({
      sessionId: "tf_session_1",
      projectMeta,
      creativeSpec: {
        schemaVersion: 1,
        kind: "single_post_visual",
        assetIntent: "post_graphic",
        platform: "linkedin",
        aspectRatio: "1.91:1",
        source: {
          sourceService: "thinkforge",
          sourceBlockIds: ["block_1"],
        },
        userIntent: {
          visualMode: "text_forward_graphic",
          wantsCarousel: false,
        },
        creativeBrief: {
          objective: "educate agency founders",
          coreMessage: "one approval owner reduces drag",
        },
        renderPlan: {
          textPolicy: "editable_text_layers",
          imagePrompt: "A clean LinkedIn graphic showing three approval lanes converging into one owner lane.",
          textLayers: [
            {
              id: "headline",
              text: "One owner cuts approval drag",
              role: "headline",
              priority: 90,
              sourceBlockId: "block_1",
            },
          ],
        },
        validation: {
          status: "ready",
        },
      },
    });

    expect(context.brandId).toBe("brand_session");
    expect(context.metadata.thinkforge).toMatchObject({
      projectMeta: {
        brandId: "brand_session",
        brandBrief: "Use approved product marks only.",
        campaignId: "campaign_1",
        calendarItemId: "calendar_1",
        idea: "Approval ops carousel v2",
      },
    });
  });

  it("does NOT leak ThinkForge signalTrace into the client handoff metadata", () => {
    const signalTrace = {
      outputFormat: "linkedin_carousel",
      platform: "linkedin",
      selectedIntent: {
        goal: "turn market news into a brand-safe carousel",
        forbiddenTerms: ["game-changing"],
      },
      enforcedConstraints: ["Use editable text layers for visible copy"],
    };

    const context = buildThinkToClickContext({
      sessionId: "tf_session_trace",
      scriptId: "script_trace",
      projectMeta: {
        brandId: "brand_trace",
        platform: "LinkedIn",
      },
      signalTrace,
      creativeSpec: {
        schemaVersion: 1,
        kind: "carousel",
        assetIntent: "carousel",
        platform: "linkedin",
        aspectRatio: "1:1",
        source: {
          sourceService: "thinkforge",
          sourceBlockIds: ["block_trace"],
        },
        userIntent: {
          visualMode: "text_forward_graphic",
          wantsCarousel: true,
        },
        creativeBrief: {
          objective: "educate agency founders",
          coreMessage: "market events can become planned content",
        },
        renderPlan: {
          textPolicy: "editable_text_layers",
          imagePrompt: "Carousel cover about turning market events into scheduled brand content.",
          slides: [
            {
              id: "slide_1",
              index: 0,
              title: "Market moment",
              imagePrompt: "Slide one introduces the market event and why agencies should react.",
            },
          ],
        },
        validation: {
          status: "ready",
        },
      },
    });

    // signalTrace is internal signal-profile reasoning. It is intentionally NOT echoed to the
    // client handoff (65059c7e) — Clickatron consumes the distilled creativeSpec/keyClaims/
    // hardConstraints (persisted server-side) instead. Assert the raw trace does not leak.
    expect((context.metadata.thinkforge as Record<string, unknown>).signalTrace).toBeUndefined();
    expect((context.sessionDraft?.metadata.thinkforge as Record<string, unknown> | undefined)?.signalTrace).toBeUndefined();
    expect(JSON.stringify(context.metadata)).not.toContain("turn market news into a brand-safe carousel");
  });

  it("derives carousel fallback from visible blocks without putting exact copy in the raster prompt", () => {
    const blocks: ThinkForgeBlock[] = [
      {
        id: "blk_hook",
        kind: "paragraph",
        content: [{ type: "text", text: "Your brand team just hit 500 video requests for Q3.", styles: {} }],
      },
      {
        id: "blk_link",
        kind: "paragraph",
        content: [
          {
            type: "link",
            href: "https://example.com",
            content: [{ type: "text", text: "Bridge the 10x production gap without burnout.", styles: {} }],
          },
        ],
      },
    ];
    const signalTrace = {
      outputFormat: "linkedin_carousel",
      platform: "linkedin",
      selectedIntent: { goal: "turn a post into a Clickatron carousel" },
    };

    const context = buildThinkToClickContext({
      sessionId: "tf_session_visible",
      scriptId: "script_visible",
      title: "Scaling Video Post",
      blocks,
      signalTrace,
      projectMeta: {
        brandId: "brand_visible",
        campaignId: "campaign_visible",
      },
      userVisualChoices: {
        kind: "carousel",
        platform: "linkedin",
        aspectRatio: "4:5",
        visualMode: "text_forward_graphic",
        textDensity: "medium",
        vibe: "urgent but sober",
        imageStyle: "editorial collage",
      },
    });

    const spec = (context.metadata.clickatron as { creativeSpec: ClickatronCreativeSpec }).creativeSpec;

    expect(spec.kind).toBe("carousel");
    expect(spec.platform).toBe("linkedin");
    expect(spec.aspectRatio).toBe("4:5");
    expect(spec.renderPlan.textPolicy).toBe("editable_text_layers");
    expect(spec.renderPlan.imagePrompt).toContain("Image style: editorial collage");
    expect(spec.renderPlan.imagePrompt).toContain("Concept keywords to interpret, not draw as text");
    expect(spec.renderPlan.slides).toHaveLength(2);
    expect(spec.renderPlan.slides?.[0].textLayers?.[0]).toMatchObject({
      text: "Your brand team just hit 500 video requests for Q3.",
      sourceBlockId: "blk_hook",
      locked: true,
    });
    expect(spec.renderPlan.slides?.[1].textLayers?.[0]?.text).toBe("Bridge the 10x production gap without burnout.");
    expect(context.sessionDraft?.prompt).toContain("Text rendering policy: do not rasterize readable text");
    expect(context.sessionDraft?.prompt).not.toContain("Your brand team just hit 500 video requests for Q3.");
    expect(context.sessionDraft?.prompt).not.toContain("Bridge the 10x production gap without burnout.");
    // signalTrace intentionally not echoed to the client handoff (65059c7e).
    expect((context.metadata.thinkforge as Record<string, unknown>).signalTrace).toBeUndefined();
  });
});
