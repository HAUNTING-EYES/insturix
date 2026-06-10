import { describe, expect, it } from "vitest";
import { buildClickatronThumbnailCommitContext } from "@/lib/clickatron/thumbnail-commit-context";

describe("Clickatron thumbnail commit context", () => {
  it("builds deterministic project-link and brand-event payloads for committed thumbnails", () => {
    const context = buildClickatronThumbnailCommitContext(
      {
        brandId: "brand_current",
        projectId: "project_from_task",
        universalId: "plink_123",
        sourceService: "thinkforge",
        sourceSessionId: "tf_session_123",
        sourceScriptId: "script_456",
        metadata: {
          sourceContext: {
            brandId: "brand_from_metadata",
            projectId: "project_from_metadata",
            universalId: "plink_from_metadata",
          },
        },
      },
      {
        id: "variation_789",
        prompt: "Create a launch thumbnail",
        imageRef: "r2://image.jpg",
        thumbnailRef: "r2://thumb.webp",
        aspectRatio: "16:9",
        modelId: "fal-ai/flux-kontext/dev",
        metadata: { promptContextApplied: true },
      },
      {
        sessionId: "64f000000000000000000001",
        variationId: "variation_789",
        thumbnailUrl: "gs://thumbs/final.png",
        editronProjectId: "project_from_request",
        metadata: {
          fileSize: 1024,
          contentType: "image/png",
          aspectRatio: "16:9",
          dimensions: "1280x720",
        },
      },
      new Date("2026-06-08T12:00:00.000Z"),
    );

    expect(context.thumbnailId).toBe("clickatron:64f000000000000000000001:variation_789");
    expect(context.brandId).toBe("brand_current");
    expect(context.projectId).toBe("project_from_request");
    expect(context.universalId).toBe("plink_123");
    expect(context.linkRecord).toMatchObject({
      thumbnailId: "clickatron:64f000000000000000000001:variation_789",
      sessionId: "64f000000000000000000001",
      variationId: "variation_789",
      thumbnailUrl: "gs://thumbs/final.png",
      sourceService: "thinkforge",
      sourceSessionId: "tf_session_123",
      sourceScriptId: "script_456",
      projectId: "project_from_request",
      brandId: "brand_current",
      committedAt: "2026-06-08T12:00:00.000Z",
    });
    expect(context.brandEventPayload).toMatchObject({
      thumbnailId: "clickatron:64f000000000000000000001:variation_789",
      sessionId: "64f000000000000000000001",
      variationId: "variation_789",
      thumbnailUrl: "gs://thumbs/final.png",
      contentType: "image/png",
      dimensions: "1280x720",
      sourceContext: {
        sourceService: "thinkforge",
        sourceSessionId: "tf_session_123",
        sourceScriptId: "script_456",
        universalId: "plink_123",
        projectId: "project_from_request",
        brandId: "brand_current",
      },
    });
    expect(JSON.stringify(context.brandEventPayload)).not.toContain("promptContextApplied");
  });

  it("falls back to stored source context when top-level task fields are absent", () => {
    const context = buildClickatronThumbnailCommitContext(
      {
        metadata: {
          sourceContext: {
            sourceService: "thinkforge",
            sourceSessionId: "tf_session_123",
            sourceScriptId: "script_456",
            universalId: "plink_from_metadata",
            projectId: "project_from_metadata",
            brandId: "brand_from_metadata",
          },
        },
      },
      {
        id: "variation_789",
        prompt: "Create a thumbnail",
      },
      {
        sessionId: "64f000000000000000000001",
        variationId: "variation_789",
        thumbnailUrl: "gs://thumbs/final.png",
      },
      new Date("2026-06-08T12:00:00.000Z"),
    );

    expect(context.brandId).toBe("brand_from_metadata");
    expect(context.projectId).toBe("project_from_metadata");
    expect(context.universalId).toBe("plink_from_metadata");
    expect(context.linkRecord.sourceSessionId).toBe("tf_session_123");
  });
});
