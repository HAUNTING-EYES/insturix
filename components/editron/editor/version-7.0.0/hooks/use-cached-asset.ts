/**
 * React hook for cache-aware asset loading.
 *
 * Given an assetId and URL, returns a blob URL:
 * - Cache hit → instant blob URL (zero network)
 * - Cache miss → fetch from CDN/GCS → store in IndexedDB → blob URL
 *
 * Blob URLs are revoked on unmount to prevent memory leaks.
 *
 * Phase D W2: Browser-side caching for instant second loads.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getCachedAsset, cacheAsset } from '../utils/asset-cache';

interface UseCachedAssetResult {
  /** Blob URL to use as src (or the original URL if caching unavailable) */
  blobUrl: string;
  /** Whether the asset is currently being fetched */
  isLoading: boolean;
  /** Whether the asset was served from cache */
  isCached: boolean;
}

/**
 * Load an asset with IndexedDB caching.
 *
 * @param assetId - Stable asset identifier (survives URL refreshes)
 * @param remoteUrl - The current valid URL (CDN, GCS signed, or proxy)
 * @param enabled - Set false to skip caching (e.g., for tiny assets)
 */
export function useCachedAsset(
  assetId: string | undefined,
  remoteUrl: string | undefined,
  enabled: boolean = true,
): UseCachedAssetResult {
  const [blobUrl, setBlobUrl] = useState<string>(remoteUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup blob URL on unmount or when asset changes
  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!assetId || !remoteUrl || !enabled) {
      setBlobUrl(remoteUrl || '');
      setIsCached(false);
      return;
    }

    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      // Step 1: Check IndexedDB cache
      try {
        const cachedBlob = await getCachedAsset(assetId);
        if (cachedBlob && !cancelled) {
          revokeBlobUrl();
          const url = URL.createObjectURL(cachedBlob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          setIsCached(true);
          setIsLoading(false);
          return;
        }
      } catch {
        // IndexedDB unavailable — fall through to network
      }

      // Step 2: Fetch from network
      if (cancelled) return;
      setIsLoading(true);
      setBlobUrl(remoteUrl); // Use remote URL while fetching

      try {
        const response = await fetch(remoteUrl, {
          signal: controller.signal,
          // Don't send cookies to CDN — they're public URLs
          credentials: 'omit',
        });

        if (!response.ok || cancelled) {
          setIsLoading(false);
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        // Step 3: Store in IndexedDB for next time
        try {
          await cacheAsset(assetId, blob, blob.type);
        } catch {
          // Cache write failed — still use the blob for this session
        }

        // Step 4: Create blob URL
        if (!cancelled) {
          revokeBlobUrl();
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
          setIsCached(true);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn(`[AssetCache] Fetch failed for ${assetId}: ${err.message}`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      revokeBlobUrl();
    };
  }, [assetId, remoteUrl, enabled, revokeBlobUrl]);

  return { blobUrl, isLoading, isCached };
}
