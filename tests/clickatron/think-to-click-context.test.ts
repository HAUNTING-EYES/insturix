import { describe, expect, it } from "vitest";
import { buildThinkToClickContext, pickThinkForgeProjectMeta } from "@/lib/thinkforge/clickatron-context";

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
});
