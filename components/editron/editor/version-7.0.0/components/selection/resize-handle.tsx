import React, { useCallback, useMemo } from "react";
import { useCurrentScale } from "remotion";
import { Overlay, OverlayType, TextOverlay } from "../../types";
import { MAX_ROWS } from "../../constants";

const HANDLE_SIZE = 12;
const EDGE_HANDLE_LENGTH = 24;

type HandleType = 
  | "top-left" | "top-right" | "bottom-left" | "bottom-right"  // corners
  | "top" | "bottom" | "left" | "right";  // edges

/**
 * ResizeHandle component - Canva-style resize behavior:
 * - Corner handles: Scale proportionally (for text: also scales fontSize)
 * - Edge handles: Change width/height only (text reflows)
 */
export const ResizeHandle: React.FC<{
  type: HandleType;
  setOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  overlay: Overlay;
}> = ({ type, setOverlay, overlay }) => {
  const scale = useCurrentScale();
  const size = Math.round(HANDLE_SIZE / scale);
  const edgeLength = Math.round(EDGE_HANDLE_LENGTH / scale);
  const borderSize = 1 / scale;

  const isCorner = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(type);
  const isHorizontalEdge = type === "left" || type === "right";
  const isVerticalEdge = type === "top" || type === "bottom";

  const sizeStyle: React.CSSProperties = useMemo(() => {
    const zIndex = (MAX_ROWS - (overlay.row || 0)) * 10 + 20000;
    
    if (isCorner) {
      return {
        position: "absolute",
        height: Number.isFinite(size) ? size : HANDLE_SIZE,
        width: Number.isFinite(size) ? size : HANDLE_SIZE,
        backgroundColor: "white",
        border: `${borderSize}px solid #3B8BF2`,
        zIndex,
        pointerEvents: "all",
      };
    } else if (isHorizontalEdge) {
      return {
        position: "absolute",
        height: edgeLength,
        width: size / 2,
        backgroundColor: "white",
        border: `${borderSize}px solid #3B8BF2`,
        borderRadius: 2,
        zIndex,
        pointerEvents: "all",
      };
    } else {
      return {
        position: "absolute",
        height: size / 2,
        width: edgeLength,
        backgroundColor: "white",
        border: `${borderSize}px solid #3B8BF2`,
        borderRadius: 2,
        zIndex,
        pointerEvents: "all",
      };
    }
  }, [borderSize, size, edgeLength, overlay.row, isCorner, isHorizontalEdge]);

  const margin = -size / 2 - borderSize;

  const style: React.CSSProperties = useMemo(() => {
    // Corner handles
    if (type === "top-left") {
      return { ...sizeStyle, marginLeft: margin, marginTop: margin, cursor: "nwse-resize" };
    }
    if (type === "top-right") {
      return { ...sizeStyle, marginTop: margin, marginRight: margin, right: 0, cursor: "nesw-resize" };
    }
    if (type === "bottom-left") {
      return { ...sizeStyle, marginBottom: margin, marginLeft: margin, bottom: 0, cursor: "nesw-resize" };
    }
    if (type === "bottom-right") {
      return { ...sizeStyle, marginBottom: margin, marginRight: margin, right: 0, bottom: 0, cursor: "nwse-resize" };
    }
    // Edge handles
    if (type === "top") {
      return { ...sizeStyle, top: margin / 2, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" };
    }
    if (type === "bottom") {
      return { ...sizeStyle, bottom: margin / 2, left: "50%", transform: "translateX(-50%)", cursor: "ns-resize" };
    }
    if (type === "left") {
      return { ...sizeStyle, left: margin / 2, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" };
    }
    if (type === "right") {
      return { ...sizeStyle, right: margin / 2, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" };
    }
    throw new Error("Unknown type: " + JSON.stringify(type));
  }, [margin, sizeStyle, type]);

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;

      const initialX = e.clientX;
      const initialY = e.clientY;
      const initialWidth = overlay.width;
      const initialHeight = overlay.height;
      const initialFontSize = overlay.type === OverlayType.TEXT 
        ? (parseInt((overlay as TextOverlay).styles.fontSize) || 32) 
        : 0;

      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const offsetY = (pointerMoveEvent.clientY - initialY) / scale;

        setOverlay(overlay.id, (i): Overlay => {
          let newWidth = overlay.width;
          let newHeight = overlay.height;
          let newLeft = overlay.left;
          let newTop = overlay.top;
          let newFontSize = initialFontSize;

          if (isCorner) {
            // Corner: proportional scaling
            const isLeft = type === "top-left" || type === "bottom-left";
            const isTop = type === "top-left" || type === "top-right";
            
            newWidth = initialWidth + (isLeft ? -offsetX : offsetX);
            newHeight = initialHeight + (isTop ? -offsetY : offsetY);
            newLeft = overlay.left + (isLeft ? offsetX : 0);
            newTop = overlay.top + (isTop ? offsetY : 0);
            
            // Scale fontSize proportionally for text overlays
            if (overlay.type === OverlayType.TEXT && initialFontSize > 0) {
              const scaleRatio = Math.max(newWidth / initialWidth, newHeight / initialHeight);
              newFontSize = Math.max(8, Math.round(initialFontSize * scaleRatio));
            }
          } else if (isHorizontalEdge) {
            // Horizontal edge: width only
            const isLeft = type === "left";
            newWidth = initialWidth + (isLeft ? -offsetX : offsetX);
            newLeft = overlay.left + (isLeft ? offsetX : 0);
          } else if (isVerticalEdge) {
            // Vertical edge: height only
            const isTop = type === "top";
            newHeight = initialHeight + (isTop ? -offsetY : offsetY);
            newTop = overlay.top + (isTop ? offsetY : 0);
          }

          const baseUpdates = {
            width: Math.max(20, Math.round(newWidth)),
            height: Math.max(20, Math.round(newHeight)),
            left: Math.round(newLeft),
            top: Math.round(newTop),
            isDragging: true,
          };

          // Update fontSize for text overlays on corner resize
          if (isCorner && overlay.type === OverlayType.TEXT && newFontSize !== initialFontSize) {
            const textOverlay = i as TextOverlay;
            return {
              ...textOverlay,
              ...baseUpdates,
              styles: { ...textOverlay.styles, fontSize: `${newFontSize}` },
            };
          }

          return { ...i, ...baseUpdates } as Overlay;
        });
      };

      const onPointerUp = () => {
        setOverlay(overlay.id, (i) => ({ ...i, isDragging: false }));
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [overlay, scale, setOverlay, type, isCorner, isHorizontalEdge, isVerticalEdge]
  );

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  return <div onPointerDown={onPointerDown} style={style} />;
};
