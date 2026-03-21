import React, { createContext, useContext } from "react";

/**
 * Context to indicate whether we are in a server-side render (Remotion renderMedia)
 * vs the interactive editor (Remotion Player).
 *
 * In the editor we favour <Video> (native HTML5 decoder) for snappier preview playback.
 * During rendering we use <OffthreadVideo> for frame-perfect output.
 */
const RenderingContext = createContext<boolean>(false);

export const RenderingProvider: React.FC<{
  isRendering: boolean;
  children: React.ReactNode;
}> = ({ isRendering, children }) => (
  <RenderingContext.Provider value={isRendering}>
    {children}
  </RenderingContext.Provider>
);

/** Returns `true` when inside a server-side render, `false` in the editor. */
export const useIsRendering = (): boolean => useContext(RenderingContext);
