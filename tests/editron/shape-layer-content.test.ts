import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LayerContent } from "@/components/editron/editor/version-7.0.0/components/core/layer-content";
import {
  ShapeLayerContent,
  shapeLayerStyle,
} from "@/components/editron/editor/version-7.0.0/components/overlays/shapes/shape-layer-content";
import {
  OverlayType,
  type ShapeOverlay,
} from "@/components/editron/editor/version-7.0.0/types";

function shapeOverlay(overrides: Partial<ShapeOverlay> = {}): ShapeOverlay {
  return {
    id: 1,
    type: OverlayType.SHAPE,
    from: 10,
    durationInFrames: 45,
    row: 2,
    left: 100,
    top: 200,
    width: 500,
    height: 400,
    rotation: 0,
    isDragging: false,
    content: "rectangle",
    styles: {
      fill: "transparent",
      stroke: "#ffcc00",
      strokeWidth: 4,
      borderRadius: "10px",
      opacity: 0.95,
    },
    ...overrides,
  };
}

describe("ShapeLayerContent", () => {
  it("renders transparent highlight rectangles with an inset-safe visible stroke", () => {
    const overlay = shapeOverlay();
    const style = shapeLayerStyle(overlay);
    const markup = renderToStaticMarkup(React.createElement(LayerContent, { overlay }));

    expect(style).toMatchObject({
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      background: "transparent",
      border: "4px solid #ffcc00",
      borderRadius: "10px",
    });
    expect(markup).toContain('data-editron-shape="rectangle"');
    expect(markup).toContain("border:4px solid #ffcc00");
  });

  it("uses circular geometry without requiring a template or renderer key", () => {
    const overlay = shapeOverlay({
      content: "circle",
      styles: { fill: "#3b82f6", opacity: 1 },
    });
    const markup = renderToStaticMarkup(React.createElement(ShapeLayerContent, { overlay }));

    expect(shapeLayerStyle(overlay).borderRadius).toBe("50%");
    expect(markup).toContain('data-editron-shape="circle"');
  });
});
