import { useMemo } from "react";
import { Overlay } from "../types";
import { FPS } from "../constants";

export const useCompositionDuration = (overlays: Overlay[]) => {
  // Calculate the total duration in frames based on overlays
  const durationInFrames = useMemo(() => {
    if (!overlays.length) return FPS * 1; // Default minimum duration (1 second)

    const maxEndFrame = overlays.reduce((maxEnd, overlay) => {
      const from = Number.isFinite(overlay.from) ? overlay.from : 0;
      const duration = Number.isFinite(overlay.durationInFrames) ? overlay.durationInFrames : FPS;
      const endFrame = from + duration;
      return Math.max(maxEnd, endFrame);
    }, 0);

    // Just use the exact frame count or minimum duration
    return Math.max(maxEndFrame, FPS * 1);
  }, [overlays]);

  // Utility functions for duration conversions
  const getDurationInSeconds = () => durationInFrames / FPS;
  const getDurationInFrames = () => durationInFrames;

  return {
    durationInFrames,
    durationInSeconds: durationInFrames / FPS,
    getDurationInSeconds,
    getDurationInFrames,
    fps: FPS,
  };
};
