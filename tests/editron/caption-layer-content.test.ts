import { describe, expect, it } from "vitest";
import {
  captionUsesActiveWordEmphasis,
  resolveCaptionRenderedFontSize,
  resolveCaptionWordTextShadow,
} from "../../components/editron/editor/version-7.0.0/components/overlays/captions/caption-layer-content";
import { DEFAULT_DISPLAY_CONFIGS } from "../../components/editron/editor/version-7.0.0/types";

describe("caption word render styling", () => {
  it("inherits the canonical readability shadow when the active style omits one", () => {
    expect(resolveCaptionWordTextShadow(
      true,
      undefined,
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 4px 16px rgba(0,0,0,0.9)");
  });

  it("preserves an explicit active-word shadow, including an intentional none value", () => {
    expect(resolveCaptionWordTextShadow(
      true,
      "0 0 8px rgba(255,255,255,0.8)",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 0 8px rgba(255,255,255,0.8)");
    expect(resolveCaptionWordTextShadow(
      true,
      "none",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("none");
  });

  it("uses the base shadow for inactive words", () => {
    expect(resolveCaptionWordTextShadow(
      false,
      "0 0 8px rgba(255,255,255,0.8)",
      "0 4px 16px rgba(0,0,0,0.9)",
    )).toBe("0 4px 16px rgba(0,0,0,0.9)");
  });

  it("renders canonical font sizes as authored instead of shrinking them against the overlay box", () => {
    expect(resolveCaptionRenderedFontSize("36px", 96, "authored")).toBe("36px");
    expect(resolveCaptionRenderedFontSize("36px", 96, "box-relative")).toBe("23px");
  });

  it("keeps subtitle captions plain while retaining active-word behavior for expressive modes", () => {
    expect(captionUsesActiveWordEmphasis({
      ...DEFAULT_DISPLAY_CONFIGS.subtitle,
      emphasisBehavior: "none",
    })).toBe(false);
    expect(captionUsesActiveWordEmphasis({
      ...DEFAULT_DISPLAY_CONFIGS.karaoke,
      emphasisBehavior: "active-word",
    })).toBe(true);
  });
});
