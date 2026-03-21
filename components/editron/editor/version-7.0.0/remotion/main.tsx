import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, prefetch } from "remotion";

import { Overlay } from "../types";
import { SortedOutlines } from "../components/selection/sorted-outlines";
import { Layer } from "../components/core/layer";
import { RenderingProvider } from "../contexts/rendering-context";

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
  const prefetchHandlesRef = useRef<Map<string, { free: () => void }>>(new Map());

  // Sort media overlays by start frame for proximity-based prefetching
  const mediaOverlays = useMemo(() => {
    return overlays
      .filter((o) => (o.type === 'video' || o.type === 'sound') && (o.src || o.content))
      .sort((a, b) => a.from - b.from);
  }, [overlays]);

  // Aggressive prefetch: download ALL media clips as blob URLs at project load.
  // This converts remote GCS signed URLs into local blob URLs, eliminating
  // network latency on seek/play and allowing the browser's native video
  // decoder to work from local data. The blob URLs are kept alive for the
  // lifetime of the component and freed on unmount.
  //
  // Previous approach only prefetched 2 clips ahead, which still caused
  // buffering/lag when scrubbing or jumping around the timeline.
  useEffect(() => {
    const handles = prefetchHandlesRef.current;

    const allUrls = new Set(
      mediaOverlays.map((o) => (o as any).src || (o as any).content).filter(Boolean),
    );

    // Free handles for overlays that were removed from the project
    for (const [url, handle] of handles) {
      if (!allUrls.has(url)) {
        handle.free();
        handles.delete(url);
      }
    }

    // Prefetch all media clips that aren't already cached.
    // Use 'media-tag' method instead of 'blob-url' to avoid CORS issues
    // with GCS signed URLs (fetch() requires CORS headers, <video> doesn't).
    for (const url of allUrls) {
      if (!handles.has(url)) {
        try {
          const handle = prefetch(url, { method: 'media-tag' });
          handles.set(url, handle);
        } catch {
          // Ignore prefetch errors — the video will fall back to streaming
        }
      }
    }

    return () => {
      // Cleanup all on unmount
      for (const handle of handles.values()) handle.free();
      handles.clear();
    };
  }, [mediaOverlays]);

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
    <RenderingProvider isRendering={isRendering ?? false}>
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
    </RenderingProvider>
  );
};
