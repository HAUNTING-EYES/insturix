import React, { useCallback, useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { Layer } from "../components/core/layer";
import { SortedOutlines } from "../components/selection/sorted-outlines";
import {
  RenderingProvider,
  resolveRenderLayerBehavior,
  type RenderMediaMode,
} from "../contexts/rendering-context";
import { Overlay } from "../types";
import {
  PreviewMediaWarmup,
  selectPreviewWarmSources,
} from "./preview-media-warmup";
import type { NativeMediaTimestampPreviewHydrationV1 } from "./native-media-timestamp-preview-hydration-v1";
import type { NativeMediaTimestampPreviewWindowV2 } from "./native-media-timestamp-preview-window-v2";

export type MainProps = {
  readonly overlays: Overlay[];
  readonly setSelectedOverlayId: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  readonly selectedOverlayId: number | null;
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  readonly durationInFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly baseUrl?: string;
  readonly isRendering?: boolean;
  readonly renderMediaMode?: RenderMediaMode;
  readonly timestampPreviewHydrations?: readonly NativeMediaTimestampPreviewHydrationV1[];
  readonly timestampPreviewWindows?: readonly NativeMediaTimestampPreviewWindowV2[];
};

const outer: React.CSSProperties = {
  backgroundColor: "#111827",
};

const layerContainer: React.CSSProperties = {
  maxWidth: "3000px",
  overflow: "hidden",
};

export const Main: React.FC<MainProps> = ({
  overlays,
  setSelectedOverlayId,
  selectedOverlayId,
  changeOverlay,
  baseUrl,
  isRendering,
  renderMediaMode = "full",
  timestampPreviewHydrations = [],
  timestampPreviewWindows = [],
  fps,
}) => {
  if (isRendering
    && (timestampPreviewHydrations.length > 0 || timestampPreviewWindows.length > 0)) {
    throw new Error("Timestamp preview inputs are not a final-render media source");
  }
  const currentFrame = useCurrentFrame();
  const renderedOverlays = useMemo(
    () => overlays.filter(
      (overlay) => resolveRenderLayerBehavior(overlay.type, renderMediaMode) !== "omit",
    ),
    [overlays, renderMediaMode],
  );

  // Updating once per second retains nearby HTTP media elements without
  // rebuilding the warmup set on every rendered frame.
  const previewEpoch = Math.floor(currentFrame / Math.max(1, fps));
  const previewWarmSources = useMemo(
    () => isRendering
      ? []
      : selectPreviewWarmSources({
          currentFrame: previewEpoch * fps,
          fps,
          overlays: renderedOverlays,
        }),
    [fps, isRendering, previewEpoch, renderedOverlays],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button === 0) {
        setSelectedOverlayId(null);
      }
    },
    [setSelectedOverlayId],
  );

  return (
    <RenderingProvider
      isRendering={isRendering ?? false}
      mediaMode={renderMediaMode}
      overlays={overlays}
      timestampPreviewHydrations={timestampPreviewHydrations}
      timestampPreviewWindows={timestampPreviewWindows}
    >
      <AbsoluteFill style={outer} onPointerDown={onPointerDown}>
        <PreviewMediaWarmup sources={previewWarmSources} />
        <AbsoluteFill style={layerContainer}>
          {renderedOverlays.map((overlay, index) => (
            <Layer
              key={`${overlay.id}-${index}`}
              overlay={overlay}
              selectedOverlayId={selectedOverlayId}
              baseUrl={baseUrl}
            />
          ))}
        </AbsoluteFill>
        {renderMediaMode === "full" ? (
          <SortedOutlines
            selectedOverlayId={selectedOverlayId}
            overlays={overlays}
            setSelectedOverlayId={setSelectedOverlayId}
            changeOverlay={changeOverlay}
          />
        ) : null}
      </AbsoluteFill>
    </RenderingProvider>
  );
};
