import { describe, expect, it } from "vitest";

import { shouldResumeActiveRender } from "@/components/editron/editor/version-7.0.0/hooks/use-rendering";

describe("useRendering resume guard", () => {
  it("does not resume a stale active job unless this browser started it", () => {
    const activeRender = {
      projectId: "proj_123",
      renderId: "chr_old",
      status: "rendering",
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
        { renderId: "chr_old", createdAt: 500 },
        "proj_123",
        1_000,
      ),
    ).toBe(true);
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
