import { useMemo } from "react";
import { Overlay } from "../types";
import { FPS } from "../constants";

export const useCompositionDuration = (
  overlays: Overlay[],
  persistedDurationInFrames?: number | null,
) => {
  // A loaded positive project duration is the timeline authority. Overlay
  // extents are only a bootstrap fallback for new or legacy projects whose
  // persisted duration is unavailable or invalid.
  const validPersistedDuration = typeof persistedDurationInFrames === "number"
    && Number.isSafeInteger(persistedDurationInFrames)
    && persistedDurationInFrames > 0
    ? persistedDurationInFrames
    : null;

  const durationInFrames = useMemo(() => {
    if (validPersistedDuration !== null) return validPersistedDuration;
    if (!overlays.length) return FPS * 1; // Default minimum duration (1 second)

    const maxEndFrame = overlays.reduce((maxEnd, overlay) => {
      const from = Number.isFinite(overlay.from) ? overlay.from : 0;
      const duration = Number.isFinite(overlay.durationInFrames) ? overlay.durationInFrames : FPS;
      const endFrame = from + duration;
      return Math.max(maxEnd, endFrame);
    }, 0);

    // Just use the exact frame count or minimum duration
    return Math.max(maxEndFrame, FPS * 1);
  }, [overlays, validPersistedDuration]);

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
