import React, { useMemo } from "react";
import { Sequence, useCurrentFrame } from "remotion";
import { LayerContent } from "./layer-content";
import { Overlay } from "../../types";
import { evaluateAllTracks } from "../../utils/keyframe-evaluator";

/**
 * Props for the Layer component
 * @interface LayerProps
 * @property {Overlay} overlay - The overlay object containing position, dimensions, and content information
 * @property {number | null} selectedOverlayId - ID of the currently selected overlay, used for interaction states
 * @property {string | undefined} baseUrl - The base URL for the video
 */
export const Layer: React.FC<{
  overlay: Overlay;
  selectedOverlayId: number | null;
  baseUrl?: string;
}> = ({ overlay, selectedOverlayId, baseUrl }) => {
  const globalFrame = useCurrentFrame();
  const hasKeyframes = overlay.keyframeTracks && overlay.keyframeTracks.length > 0;

  /**
   * Style calculations for the layer.
   * If keyframe tracks exist, animated properties are evaluated per frame.
   * Otherwise, static overlay fields are used (no performance cost).
   */
  const style: React.CSSProperties = useMemo(() => {
    // Captions ALWAYS render on top of video (z-index 95) regardless of their timeline row.
    // This lets captions sit on row 4 (CAPTIONS) in the timeline for clarity,
    // while still rendering above video (row 2, z-index 80) in the player.
    const zIndex = overlay.type === 'caption'
      ? 95
      : 100 - (overlay.row || 0) * 10;
    const isSelected = overlay.id === selectedOverlayId;

    // Evaluate keyframe tracks if present
    // localFrame = frames since this overlay started playing (0-based)
    let left = overlay.left;
    let top = overlay.top;
    let scale = 1;
    let opacity = (overlay as any).styles?.opacity ?? 1;
    let rotation = overlay.rotation || 0;

    if (hasKeyframes) {
      const localFrame = globalFrame - overlay.from;
      const kf = evaluateAllTracks(overlay.keyframeTracks!, localFrame);
      // Keyframe values are ABSOLUTE (same coordinate system as overlay.left/top)
      if (kf.x !== undefined) left = kf.x;
      if (kf.y !== undefined) top = kf.y;
      if (kf.scale !== undefined) scale = kf.scale;
      if (kf.opacity !== undefined) opacity = kf.opacity;
      if (kf.rotation !== undefined) rotation = kf.rotation;
    }

    const scaleTransform = scale !== 1 ? ` scale(${scale})` : '';

    return {
      position: "absolute",
      left,
      top,
      width: overlay.width,
      height: overlay.height,
      transform: `rotate(${rotation}deg)${scaleTransform}`,
      transformOrigin: "center center",
      zIndex,
      opacity,
      pointerEvents: isSelected ? "all" : "none",
    };
  }, [
    overlay.height,
    overlay.left,
    overlay.top,
    overlay.width,
    overlay.rotation,
    overlay.row,
    overlay.id,
    overlay.from,
    selectedOverlayId,
    hasKeyframes,
    // Only re-evaluate per frame if keyframes exist
    hasKeyframes ? globalFrame : 0,
  ]);

  /**
   * Special handling for sound overlays
   * Sound overlays don't need positioning or visual representation,
   * they just need to be sequenced correctly
   */
  if (overlay.type === "sound") {
    return (
      <Sequence
        key={overlay.id}
        from={overlay.from}
        durationInFrames={overlay.durationInFrames}
      >
        <LayerContent overlay={overlay} baseUrl={baseUrl} />
      </Sequence>
    );
  }

  /**
   * Standard layer rendering for visual elements
   * Wraps the content in a Sequence for timing control and
   * a positioned div for layout management
   */
  return (
    <Sequence
      key={overlay.id}
      from={overlay.from}
      durationInFrames={overlay.durationInFrames}
      layout="none"
    >
      <div style={style}>
        <LayerContent overlay={overlay} baseUrl={baseUrl} />
      </div>
    </Sequence>
  );
};
