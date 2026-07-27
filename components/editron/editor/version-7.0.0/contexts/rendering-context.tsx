import React, { createContext, useContext } from "react";
import { OverlayType, type Overlay } from "../types";

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
}

const RenderingContext = createContext<RenderingContextValue>({
  isRendering: false,
  mediaMode: "full",
  overlays: [],
});

export const RenderingProvider: React.FC<{
  isRendering: boolean;
  mediaMode?: RenderMediaMode;
  overlays?: Overlay[];
  children: React.ReactNode;
}> = ({ isRendering, mediaMode = "full", overlays = [], children }) => (
  <RenderingContext.Provider value={{ isRendering, mediaMode, overlays }}>
    {children}
  </RenderingContext.Provider>
);

/** Returns `true` when inside a server-side render, `false` in the editor. */
export const useIsRendering = (): boolean => useContext(RenderingContext).isRendering;

/** Returns which media graph the current render must evaluate. */
export const useRenderMediaMode = (): RenderMediaMode =>
  useContext(RenderingContext).mediaMode;

/** Returns all overlays in the project (for cross-track awareness like audio ducking). */
export const useAllOverlays = (): Overlay[] => useContext(RenderingContext).overlays;
