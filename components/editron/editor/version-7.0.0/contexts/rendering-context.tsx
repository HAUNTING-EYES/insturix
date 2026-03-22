import React, { createContext, useContext } from "react";
import type { Overlay } from "../types";

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
  overlays: Overlay[];
}

const RenderingContext = createContext<RenderingContextValue>({
  isRendering: false,
  overlays: [],
});

export const RenderingProvider: React.FC<{
  isRendering: boolean;
  overlays?: Overlay[];
  children: React.ReactNode;
}> = ({ isRendering, overlays = [], children }) => (
  <RenderingContext.Provider value={{ isRendering, overlays }}>
    {children}
  </RenderingContext.Provider>
);

/** Returns `true` when inside a server-side render, `false` in the editor. */
export const useIsRendering = (): boolean => useContext(RenderingContext).isRendering;

/** Returns all overlays in the project (for cross-track awareness like audio ducking). */
export const useAllOverlays = (): Overlay[] => useContext(RenderingContext).overlays;
