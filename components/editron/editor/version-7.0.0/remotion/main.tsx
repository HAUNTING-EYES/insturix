import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, prefetch, useCurrentFrame } from "remotion";

import { Overlay } from "../types";
import { SortedOutlines } from "../components/selection/sorted-outlines";
import { Layer } from "../components/core/layer";

/**
 * Props for the Main component
 */
export type MainProps = {
  /** Array of overlay objects to be rendered */
  readonly overlays: Overlay[];
  /** Function to set the currently selected overlay ID */
  readonly setSelectedOverlayId: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  /** Currently selected overlay ID, or null if none selected */
  readonly selectedOverlayId: number | null;
  /**
   * Function to update an overlay
   * @param overlayId - The ID of the overlay to update
   * @param updater - Function that receives the current overlay and returns an updated version
   */
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  /** Duration in frames of the composition */
  readonly durationInFrames: number;
  /** Frames per second of the composition */
  readonly fps: number;
  /** Width of the composition */
  readonly width: number;
  /** Height of the composition */
  readonly height: number;
  /** Base URL for media assets (optional) */
  readonly baseUrl?: string;
  /** Render mode — when true, use original quality. When false (editing), use proxy. */
  readonly isRendering?: boolean;
};

const outer: React.CSSProperties = {
  backgroundColor: "#111827",
};

const layerContainer: React.CSSProperties = {
  overflow: "hidden",
  maxWidth: "3000px",
};

/**
 * Main component that renders a canvas-like area with overlays and their outlines.
 * Handles selection of overlays and provides a container for editing them.
 *
 * @param props - Component props of type MainProps
 * @returns React component that displays overlays and their interactive outlines
 */
export const Main: React.FC<MainProps> = ({
  overlays,
  setSelectedOverlayId,
  selectedOverlayId,
  changeOverlay,
  baseUrl,
  isRendering,
}) => {
  const frame = useCurrentFrame();
  const prefetchHandlesRef = useRef<Map<string, { free: () => void }>>(new Map());

  // Sort media overlays by start frame for proximity-based prefetching
  const mediaOverlays = useMemo(() => {
    return overlays
      .filter((o) => (o.type === 'video' || o.type === 'sound') && (o.src || o.content))
      .sort((a, b) => a.from - b.from);
  }, [overlays]);

  // Smart prefetch: only load nearby media (current + next 2 clips)
  // This prevents loading ALL videos at once which causes lag and memory pressure.
  // During rendering, prefetch everything for smooth output.
  useEffect(() => {
    const PREFETCH_WINDOW = isRendering ? Infinity : 2; // In editor: 2 clips ahead. In render: all.
    const handles = prefetchHandlesRef.current;

    // Find overlays that are currently playing or upcoming
    const relevantOverlays = isRendering
      ? mediaOverlays
      : mediaOverlays.filter((o) => {
          const endFrame = o.from + o.durationInFrames;
          // Currently playing OR within next N clips from current frame
          if (endFrame <= frame) return false; // Already passed
          // Count how many are ahead of current frame
          const aheadIndex = mediaOverlays.filter(
            (m) => m.from >= frame && m.from < o.from,
          ).length;
          return aheadIndex <= PREFETCH_WINDOW || (o.from <= frame && endFrame > frame);
        });

    const relevantUrls = new Set(
      relevantOverlays.map((o) => (o as any).src || (o as any).content).filter(Boolean),
    );

    // Free handles for overlays no longer relevant (already passed)
    for (const [url, handle] of handles) {
      if (!relevantUrls.has(url)) {
        handle.free();
        handles.delete(url);
      }
    }

    // Prefetch new relevant overlays
    for (const url of relevantUrls) {
      if (!handles.has(url)) {
        try {
          const handle = prefetch(url, { method: 'blob-url' });
          handles.set(url, handle);
        } catch {
          // Ignore prefetch errors
        }
      }
    }

    return () => {
      // Cleanup all on unmount
      for (const handle of handles.values()) handle.free();
      handles.clear();
    };
  }, [mediaOverlays, frame, isRendering]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }

      setSelectedOverlayId(null);
    },
    [setSelectedOverlayId]
  );

  return (
    <AbsoluteFill
      style={{
        ...outer,
      }}
      onPointerDown={onPointerDown}
    >
      <AbsoluteFill style={layerContainer}>
        {overlays.map((overlay, index) => {
          return (
            <Layer
              key={`${overlay.id}-${index}`}
              overlay={overlay}
              selectedOverlayId={selectedOverlayId}
              baseUrl={baseUrl}
            />
          );
        })}
      </AbsoluteFill>
      <SortedOutlines
        selectedOverlayId={selectedOverlayId}
        overlays={overlays}
        setSelectedOverlayId={setSelectedOverlayId}
        changeOverlay={changeOverlay}
      />
    </AbsoluteFill>
  );
};
