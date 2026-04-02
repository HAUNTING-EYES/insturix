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

  // Phase D W2: Cache-aware prefetch.
  // First checks IndexedDB for cached blobs (instant, zero network).
  // On cache miss, fetches from CDN/GCS, caches in IndexedDB for next time.
  // Falls back to Remotion's media-tag prefetch if IndexedDB unavailable.
  useEffect(() => {
    const handles = prefetchHandlesRef.current;
    const blobUrls = new Map<string, string>(); // assetId → blob URL (for cleanup)

    const allMedia = mediaOverlays.map((o) => ({
      assetId: (o as any).assetId || '',
      url: (o as any).src || (o as any).content || '',
    })).filter(m => m.url);

    const allUrls = new Set(allMedia.map(m => m.url));

    // Free handles for removed overlays
    for (const [url, handle] of handles) {
      if (!allUrls.has(url)) {
        handle.free();
        handles.delete(url);
      }
    }

    // Cache-aware prefetch for each media overlay
    let cancelled = false;
    (async () => {
      const { getCachedAsset, cacheAsset } = await import('../utils/asset-cache').catch(() => ({
        getCachedAsset: async () => null,
        cacheAsset: async () => {},
      }));

      for (const { assetId, url } of allMedia) {
        if (cancelled || handles.has(url)) continue;

        // Try IndexedDB cache first
        if (assetId) {
          try {
            const cachedBlob = await getCachedAsset(assetId);
            if (cachedBlob) {
              // Cache hit — create blob URL, skip network entirely
              const blobUrl = URL.createObjectURL(cachedBlob);
              blobUrls.set(assetId, blobUrl);
              // Create a fake handle for cleanup tracking
              handles.set(url, { free: () => URL.revokeObjectURL(blobUrl) });
              continue;
            }
          } catch {
            // IndexedDB unavailable — fall through to network
          }
        }

        // Cache miss — use Remotion's media-tag prefetch (no CORS issues)
        try {
          const handle = prefetch(url, { method: 'blob-url' });
          handles.set(url, handle);

          // Background: fetch blob and cache in IndexedDB for next time
          if (assetId) {
            fetch(url, { credentials: 'omit' })
              .then(res => res.ok ? res.blob() : null)
              .then(blob => { if (blob && !cancelled) cacheAsset(assetId, blob, blob.type); })
              .catch(() => {}); // Non-fatal background caching
          }
        } catch {
          // Prefetch failed — video will stream directly
        }
      }
    })();

    return () => {
      cancelled = true;
      // Cleanup all handles + blob URLs
      for (const handle of handles.values()) handle.free();
      handles.clear();
      for (const blobUrl of blobUrls.values()) URL.revokeObjectURL(blobUrl);
      blobUrls.clear();
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
    <RenderingProvider isRendering={isRendering ?? false} overlays={overlays}>
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
