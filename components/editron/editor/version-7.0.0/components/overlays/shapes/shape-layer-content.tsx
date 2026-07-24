import React from "react";

import { ShapeOverlay } from "../../../types";

interface ShapeLayerContentProps {
  overlay: ShapeOverlay;
}

export function shapeLayerStyle(overlay: ShapeOverlay): React.CSSProperties {
  const styles = overlay.styles ?? {};
  const shape = String(overlay.content || "rectangle").toLowerCase();
  const strokeWidth = Number.isFinite(styles.strokeWidth)
    ? Math.max(0, Number(styles.strokeWidth))
    : 0;
  const stroke = styles.stroke?.trim();

  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    background: styles.gradient || styles.fill || "#3b82f6",
    border: stroke && strokeWidth > 0
      ? `${strokeWidth}px solid ${stroke}`
      : undefined,
    borderRadius: shape === "circle" ? "50%" : styles.borderRadius,
    boxShadow: styles.boxShadow,
  };
}

export const ShapeLayerContent: React.FC<ShapeLayerContentProps> = ({ overlay }) => (
  <div
    data-editron-shape={String(overlay.content || "rectangle").toLowerCase()}
    style={shapeLayerStyle(overlay)}
  />
);
