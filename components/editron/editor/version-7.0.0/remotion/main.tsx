import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, prefetch, useCurrentFrame } from "remotion";

import { Overlay } from "../types";
import { SortedOutlines } from "../components/selection/sorted-outlines";
import { Layer } from "../components/core/layer";
import {
  RenderingProvider,
  resolveRenderLayerBehavior,
  type RenderMediaMode,
} from "../contexts/rendering-context";

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
  /** Restricts evidence renders to the media graph they actually verify. */
  readonly renderMediaMode?: RenderMediaMode;
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
  renderMediaMode = "full",
}) => {
  const prefetchHandlesRef = useRef<Map<string, { free: () => void }>>(new Map());
  const blobUrlsRef = useRef<Map<string, string>>(new Map()); // assetId → blob URL

  // Current playhead frame — used for proximity-based prefetch window.
  const currentFrame = useCurrentFrame();

  // Sort media overlays by start frame for proximity-based prefetching
  const mediaOverlays = useMemo(() => {
    if (isRendering) return [];
    return overlays
      .filter((o) => (o.type === 'video' || o.type === 'sound') && (o.src || o.content))
      .sort((a, b) => a.from - b.from);
  }, [isRendering, overlays]);

  const renderedOverlays = useMemo(
    () => overlays.filter(
      (overlay) => resolveRenderLayerBehavior(overlay.type, renderMediaMode) !== "omit",
    ),
    [overlays, renderMediaMode],
  );

  // Throttle: re-evaluate prefetch window every 300 frames (10s at 30fps).
  // Without this, useCurrentFrame triggers 30 re-renders/sec.
  const windowEpoch = useMemo(() => Math.floor(currentFrame / 300), [currentFrame]);

  // Proximity-aware prefetch window: ±900 frames (30s) around playhead.
  // Clips within this window get blob URLs (instant playback).
  // Clips outside get their blob URLs freed (memory released).
  // When user seeks past the window, clips stream directly from CDN
  // (brief buffer, then plays) until the window catches up on next epoch.
  //
  // Why 900 frames: user scrubs ±30s comfortably. Beyond that, a brief
  // buffer delay is acceptable. 900f × ~15MB avg clip = ~6-8 clips in memory
  // at any time (vs ALL clips before this fix).
  const PREFETCH_WINDOW_FRAMES = 900;

  // Phase D W2: Cache-aware prefetch with proximity window.
  // Only prefetch clips near the playhead. Free distant clips.
  useEffect(() => {
    const handles = prefetchHandlesRef.current;
    const blobUrls = blobUrlsRef.current;

    const allMedia = mediaOverlays.map((o) => ({
      assetId: (o as any).assetId || '',
      url: (o as any).src || (o as any).content || '',
      from: o.from,
      end: o.from + o.durationInFrames,
    })).filter(m => m.url);

    // Determine which media are within the proximity window
    const windowStart = Math.max(0, currentFrame - PREFETCH_WINDOW_FRAMES);
    const windowEnd = currentFrame + PREFETCH_WINDOW_FRAMES;
    const inWindow = new Set<string>();
    for (const m of allMedia) {
      // Clip overlaps with window if clip.end > windowStart AND clip.from < windowEnd
      if (m.end > windowStart && m.from < windowEnd) {
        inWindow.add(m.url);
      }
    }

    // Free handles for clips OUTSIDE the window (memory release)
    for (const [url, handle] of handles) {
      if (!inWindow.has(url)) {
        handle.free();
        handles.delete(url);
        // Also revoke associated blob URL if any
        const assetId = allMedia.find(m => m.url === url)?.assetId;
        if (assetId && blobUrls.has(assetId)) {
          URL.revokeObjectURL(blobUrls.get(assetId)!);
          blobUrls.delete(assetId);
        }
      }
    }

    // Also free handles for overlays removed from the project entirely
    const allUrls = new Set(allMedia.map(m => m.url));
    for (const [url, handle] of handles) {
      if (!allUrls.has(url)) {
        handle.free();
        handles.delete(url);
      }
    }

    // Cache-aware prefetch for media IN the window that aren't already prefetched
    let cancelled = false;
    (async () => {
      const { getCachedAsset, cacheAsset } = await import('../utils/asset-cache').catch(() => ({
        getCachedAsset: async () => null,
        cacheAsset: async () => {},
      }));

      for (const { assetId, url } of allMedia) {
        if (cancelled || handles.has(url) || !inWindow.has(url)) continue;

        // Try IndexedDB cache first
        if (assetId) {
          try {
            const cachedBlob = await getCachedAsset(assetId);
            if (cachedBlob) {
              const blobUrl = URL.createObjectURL(cachedBlob);
              blobUrls.set(assetId, blobUrl);
              handles.set(url, { free: () => URL.revokeObjectURL(blobUrl) });
              continue;
            }
          } catch {
            // IndexedDB unavailable — fall through to network
          }
        }

        // Cache miss — use Remotion's media-tag prefetch
        try {
          const handle = prefetch(url, { method: 'blob-url' });
          handles.set(url, handle);

          // Background: cache in IndexedDB for next time
          if (assetId) {
            fetch(url, { credentials: 'omit' })
              .then(res => res.ok ? res.blob() : null)
              .then(blob => { if (blob && !cancelled) cacheAsset(assetId, blob, blob.type); })
              .catch(() => {});
          }
        } catch {
          // Prefetch failed — video will stream directly from CDN
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaOverlays, windowEpoch]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      const handles = prefetchHandlesRef.current;
      const blobUrls = blobUrlsRef.current;
      for (const handle of handles.values()) handle.free();
      handles.clear();
      for (const blobUrl of blobUrls.values()) URL.revokeObjectURL(blobUrl);
      blobUrls.clear();
    };
  }, []);

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
    <RenderingProvider
      isRendering={isRendering ?? false}
      mediaMode={renderMediaMode}
      overlays={overlays}
    >
      <AbsoluteFill
        style={{
          ...outer,
        }}
        onPointerDown={onPointerDown}
      >
        <AbsoluteFill style={layerContainer}>
          {renderedOverlays.map((overlay, index) => {
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
