import { describe, expect, it } from "vitest";

import { shouldResumeActiveRender } from "@/components/editron/editor/version-7.0.0/hooks/use-rendering";

describe("useRendering resume guard", () => {
  it("does not resume a stale active job unless this browser started it", () => {
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
    ).toBe(true);
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
        { projectId: "proj_123", renderId: "chr_old", status: "rendering" },
        { renderId: "chr_old", createdAt: 0 },
        "proj_123",
        13 * 60 * 60 * 1000,
      ),
    ).toBe(false);
  });
});
