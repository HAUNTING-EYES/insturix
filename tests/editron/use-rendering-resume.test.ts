import { describe, expect, it } from "vitest";

import { shouldResumeActiveRender } from "@/components/editron/editor/version-7.0.0/hooks/use-rendering";
import { CHAPTER_ORCHESTRATION_EXECUTION_KIND } from "@/lib/editron/shared/render-request-payload";

describe("useRendering resume guard", () => {
  it("rejects legacy bucket-only chapter claims", () => {
    const activeRender = {
      projectId: "proj_123",
      renderId: "chr_old",
      status: "rendering",
      bucketName: "chapter-render",
      region: "ap-south-1",
    };

    expect(shouldResumeActiveRender(activeRender, null, "proj_123", 1_000)).toBe(false);
    expect(
      shouldResumeActiveRender(
        activeRender,
        { renderId: "chr_other", createdAt: 500 },
        "proj_123",
        1_000,
      ),
    ).toBe(false);
    expect(
      shouldResumeActiveRender(
        activeRender,
        {
          renderId: "chr_old",
          bucketName: "chapter-render",
          region: "ap-south-1",
          createdAt: 500,
        },
        "proj_123",
        1_000,
      ),
    ).toBe(false);
  });

  it("requires the chapter discriminant and exact orchestration identity", () => {
    const activeRender = {
      projectId: "proj_123",
      renderId: "ui_render_123",
      status: "rendering",
      executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
      orchestrationId: "orch_123",
      region: "ap-south-1",
    };

    expect(shouldResumeActiveRender(
      activeRender,
      {
        renderId: "ui_render_123",
        bucketName: "render-bucket",
        region: "ap-south-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(false);
    expect(shouldResumeActiveRender(
      activeRender,
      {
        executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
        orchestrationId: "orch_other",
        renderId: "ui_render_123",
        region: "ap-south-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(false);
    expect(shouldResumeActiveRender(
      activeRender,
      {
        executionKind: CHAPTER_ORCHESTRATION_EXECUTION_KIND,
        orchestrationId: "orch_123",
        renderId: "ui_render_123",
        region: "ap-south-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(true);
  });

  it("requires the browser claim to match persisted bucket and region", () => {
    const activeRender = {
      projectId: "proj_123",
      renderId: "rnd_123",
      status: "rendering",
      bucketName: "render-bucket",
      region: "ap-south-1",
    };

    expect(shouldResumeActiveRender(
      activeRender,
      {
        renderId: "rnd_123",
        bucketName: "other-bucket",
        region: "ap-south-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(false);
    expect(shouldResumeActiveRender(
      activeRender,
      {
        renderId: "rnd_123",
        bucketName: "render-bucket",
        region: "ap-south-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(true);
    expect(shouldResumeActiveRender(
      activeRender,
      {
        renderId: "rnd_123",
        bucketName: "render-bucket",
        region: "us-east-1",
        createdAt: 500,
      },
      "proj_123",
      1_000,
    )).toBe(false);
  });

  it("rejects future and non-finite claim timestamps", () => {
    const activeRender = {
      projectId: "proj_123",
      renderId: "rnd_123",
      status: "rendering",
    };

    expect(shouldResumeActiveRender(
      activeRender,
      { renderId: "rnd_123", createdAt: 1_001 },
      "proj_123",
      1_000,
    )).toBe(false);
    expect(shouldResumeActiveRender(
      activeRender,
      { renderId: "rnd_123", createdAt: Number.NaN },
      "proj_123",
      1_000,
    )).toBe(false);
  });

  it("does not resume expired local render claims", () => {
    expect(
      shouldResumeActiveRender(
        { projectId: "proj_123", renderId: "rnd_old", status: "rendering" },
        { renderId: "rnd_old", createdAt: 0 },
        "proj_123",
        13 * 60 * 60 * 1000,
      ),
    ).toBe(false);
  });
});
