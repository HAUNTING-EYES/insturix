import React, { createContext, useContext, useMemo } from "react";
import { OverlayType, type Overlay } from "../types";
import {
  createNativeMediaTimestampPreviewHydrationIndexV1,
  type NativeMediaTimestampPreviewHydrationFrameV1,
  type NativeMediaTimestampPreviewHydrationIndexV1,
  type NativeMediaTimestampPreviewHydrationV1,
} from "../remotion/native-media-timestamp-preview-hydration-v1";

export type RenderMediaMode = "full" | "audio-only";

export type RenderLayerBehavior = "full" | "audio-only" | "omit";

export function resolveRenderLayerBehavior(
  overlayType: OverlayType,
  mediaMode: RenderMediaMode,
): RenderLayerBehavior {
  if (mediaMode !== "full" && mediaMode !== "audio-only") {
    throw new Error(`Unsupported Editron render media mode: ${String(mediaMode)}`);
  }
  if (mediaMode === "full") return "full";
  if (overlayType === OverlayType.VIDEO || overlayType === OverlayType.SOUND) {
    return "audio-only";
  }
  return "omit";
}

/**
 * Context for rendering state and cross-track overlay awareness.
 *
 * - isRendering: true during server-side render (Remotion renderMedia),
 *   false in the interactive editor (Remotion Player).
 * - overlays: full overlay array, needed by sound layers for audio ducking
 *   (BGM needs to know where voiceover overlays are to duck volume).
 */
interface RenderingContextValue {
  isRendering: boolean;
  mediaMode: RenderMediaMode;
  overlays: Overlay[];
  timestampPreviewIndex: NativeMediaTimestampPreviewHydrationIndexV1;
}

const RenderingContext = createContext<RenderingContextValue>({
  isRendering: false,
  mediaMode: "full",
  overlays: [],
  timestampPreviewIndex: createNativeMediaTimestampPreviewHydrationIndexV1(),
});

export const RenderingProvider: React.FC<{
  isRendering: boolean;
  mediaMode?: RenderMediaMode;
  overlays?: Overlay[];
  timestampPreviewHydrations?: readonly NativeMediaTimestampPreviewHydrationV1[];
  children: React.ReactNode;
}> = ({
  isRendering,
  mediaMode = "full",
  overlays = [],
  timestampPreviewHydrations = [],
  children,
}) => {
  const timestampPreviewIndex = useMemo(
    () => createNativeMediaTimestampPreviewHydrationIndexV1(timestampPreviewHydrations),
    [timestampPreviewHydrations],
  );
  return (
    <RenderingContext.Provider value={{
      isRendering,
      mediaMode,
      overlays,
      timestampPreviewIndex,
    }}>
      {children}
    </RenderingContext.Provider>
  );
};

/** Returns `true` when inside a server-side render, `false` in the editor. */
export const useIsRendering = (): boolean => useContext(RenderingContext).isRendering;

/** Returns which media graph the current render must evaluate. */
export const useRenderMediaMode = (): RenderMediaMode =>
  useContext(RenderingContext).mediaMode;

/** Returns all overlays in the project (for cross-track awareness like audio ducking). */
export const useAllOverlays = (): Overlay[] => useContext(RenderingContext).overlays;

/** Returns one exact, receipt-derived picture for an overlay-local frame. */
export const useNativeMediaTimestampPreviewFrame = (
  overlayId: string | number,
  localFrame: number,
): NativeMediaTimestampPreviewHydrationFrameV1 | null =>
  useContext(RenderingContext).timestampPreviewIndex.frameFor(overlayId, localFrame);
