import { describe, expect, it } from "vitest";

import { getCaptionFontFamily } from "@/components/editron/editor/version-7.0.0/components/overlays/captions/caption-layer-content";

describe("caption font rendering", () => {
  it("maps caption font tokens to loaded render font families", () => {
    expect(getCaptionFontFamily("font-league-spartan")).toContain("League Spartan");
    expect(getCaptionFontFamily("font-bungee-inline")).toContain("Bungee Inline");
    expect(getCaptionFontFamily("font-serif")).toContain("Merriweather");
  });

  it("preserves custom font families instead of collapsing them to system-ui", () => {
    expect(getCaptionFontFamily("Acme Display")).toBe("Acme Display");
    expect(getCaptionFontFamily("font-bungee-inline")).not.toContain("system-ui");
  });
});
