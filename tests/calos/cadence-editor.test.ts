import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("CadenceEditor", () => {
  it("renders create campaign as a real, viewport-safe submit form", async () => {
    vi.stubGlobal("React", React);
    const { default: CadenceEditor } = await import("@/app/dashboard/calos/CadenceEditor");

    const html = renderToStaticMarkup(
      React.createElement(CadenceEditor, {
        campaignId: "",
        brandId: "brand_1",
        campaignName: "",
        initialRules: [{ platform: "linkedin", perWeek: 3, preferredDays: [1, 3, 5] }],
        isCreate: true,
        onClose: () => undefined,
        onSaved: () => undefined,
      })
    );

    expect(html).toContain("<form");
    expect(html).toContain("max-h-[calc(100vh-2rem)]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('type="submit"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Create campaign");
  });
});