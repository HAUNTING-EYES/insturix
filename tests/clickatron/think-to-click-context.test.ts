import { describe, expect, it } from "vitest";
import { buildThinkToClickContext, pickThinkForgeProjectMeta } from "@/lib/thinkforge/clickatron-context";
import { mergeThinkForgeProjectMetadata } from "@/lib/thinkforge/state/types";

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
        preferences: { internal: true },
      }),
    ).toEqual({
      brandId: "brand_1",
      brandBrief: "Brand rules",
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
        idea: "Approval ops carousel v2",
      },
    });
  });
});
