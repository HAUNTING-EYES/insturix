import React, { useMemo } from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { LayerContent } from "./layer-content";
import { Overlay, OverlayType } from "../../types";
import { evaluateAllTracks } from "../../utils/keyframe-evaluator";
import { constrainFinalOverlayGeometry } from "./final-overlay-geometry";

/**
 * Current compositor stacking rule.  This is intentionally a small pure seam
 * so the known MG-sequence ordering defect is reproducible until the canonical
 * visual stacking contract replaces row-derived ordering.
 */
export function resolveLayerZIndex(type: OverlayType, row: number | undefined): number {
  if (type === OverlayType.CAPTION) return 95;
  if (type === OverlayType.TRANSITION) return 85;
  return 100 - (row || 0) * 10;
}

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
  const videoConfig = useVideoConfig();
  const isMgSequence = overlay.type === OverlayType.MG_SEQUENCE;
  const hasKeyframes = !isMgSequence && overlay.keyframeTracks && overlay.keyframeTracks.length > 0;

  if (isMgSequence && overlay.sequence) {
    if (overlay.sequence.width !== videoConfig.width || overlay.sequence.height !== videoConfig.height || overlay.sequence.fps !== videoConfig.fps) {
      throw new Error(
        `MG sequence ${overlay.assetId} does not match composition ${videoConfig.width}x${videoConfig.height}@${videoConfig.fps}`,
      );
    }
  }

  /**
   * Style calculations for the layer.
   * If keyframe tracks exist, animated properties are evaluated per frame.
   * Otherwise, static overlay fields are used (no performance cost).
   */
  const style: React.CSSProperties = useMemo(() => {
    // Z-index overrides by type ensure correct render order regardless of row:
    // - Captions (95): always on top for readability
    // - Transitions (85): above video clips (80) they bridge, below captions
    // - All others: 100 - (row * 10), e.g., SFX row 0 = 100, video row 2 = 80
    const zIndex = resolveLayerZIndex(overlay.type, overlay.row);
    const isSelected = overlay.id === selectedOverlayId;

    // Evaluate keyframe tracks if present
    // localFrame = frames since this overlay started playing (0-based)
    let left = isMgSequence ? 0 : overlay.left;
    let top = isMgSequence ? 0 : overlay.top;
    let scale = 1;
    let opacity = (overlay as any).styles?.opacity ?? 1;
    let rotation = isMgSequence ? 0 : (overlay.rotation || 0);
    const transformOrigin = (overlay as any).styles?.transformOrigin || "center center";

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

    const geometry = overlay.type === 'text' || overlay.type === 'caption'
      ? constrainFinalOverlayGeometry({
          overlayType: overlay.type,
          left,
          top,
          width: overlay.width,
          height: overlay.height,
          scale,
          rotationDegrees: rotation,
          transformOrigin,
          canvasWidth: videoConfig.width,
          canvasHeight: videoConfig.height,
        })
      : { left, top, scale };
    const scaleTransform = geometry.scale !== 1 ? ` scale(${geometry.scale})` : '';

    return {
      position: "absolute",
      left: geometry.left,
      top: geometry.top,
      width: isMgSequence ? videoConfig.width : overlay.width,
      height: isMgSequence ? videoConfig.height : overlay.height,
      transform: `rotate(${rotation}deg)${scaleTransform}`,
      transformOrigin,
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
    overlay.type,
    (overlay as any).styles?.opacity,
    (overlay as any).styles?.transformOrigin,
    selectedOverlayId,
    hasKeyframes,
    isMgSequence,
    videoConfig.width,
    videoConfig.height,
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
