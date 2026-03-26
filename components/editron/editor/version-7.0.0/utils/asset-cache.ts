/**
 * Browser-side asset cache using IndexedDB.
 *
 * Phase D W2: Caches video/image/audio blobs locally so the second
 * load of a project has ZERO network requests for media assets.
 *
 * - Max cache size: 2GB (configurable)
 * - LRU eviction when limit exceeded
 * - Assets keyed by assetId (stable across URL refreshes)
 * - Blob URLs created for Remotion/HTML5 media elements
 */

const DB_NAME = 'EditronAssetCache';
const DB_VERSION = 1;
const STORE_NAME = 'assetBlobs';
const MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

interface CachedAsset {
  assetId: string;
  blob: Blob;
  contentType: string;
  size: number;
  cachedAt: number;
  lastAccessed: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
        store.createIndex('lastAccessed', 'lastAccessed');
        store.createIndex('cachedAt', 'cachedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Get a cached asset blob by assetId.
 * Updates lastAccessed timestamp for LRU tracking.
 */
export async function getCachedAsset(assetId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const request = store.get(assetId);
      request.onsuccess = () => {
        const result = request.result as CachedAsset | undefined;
        if (result) {
          // Update lastAccessed for LRU
          result.lastAccessed = Date.now();
          store.put(result);
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Cache an asset blob. Evicts LRU entries if cache exceeds size limit.
 */
export async function cacheAsset(
  assetId: string,
  blob: Blob,
  contentType: string = 'application/octet-stream',
): Promise<void> {
  try {
    const db = await openDB();

    // Check current cache size
    const currentSize = await getCacheSize();
    if (currentSize + blob.size > MAX_CACHE_SIZE_BYTES) {
      await evictLRU(blob.size);
    }

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry: CachedAsset = {
      assetId,
      blob,
      contentType,
      size: blob.size,
      cachedAt: Date.now(),
      lastAccessed: Date.now(),
    };

    store.put(entry);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[AssetCache] Failed to cache asset:', err);
  }
}

/**
 * Get total cache size in bytes.
 */
export async function getCacheSize(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      let totalSize = 0;
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          totalSize += (cursor.value as CachedAsset).size;
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Evict least-recently-used entries until `bytesNeeded` is free.
 */
async function evictLRU(bytesNeeded: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('lastAccessed');

    let freed = 0;
    const request = index.openCursor(); // Oldest accessed first

    await new Promise<void>((resolve) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && freed < bytesNeeded) {
          freed += (cursor.value as CachedAsset).size;
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => resolve();
    });

    console.log(`[AssetCache] Evicted ${Math.round(freed / 1024)}KB to make room`);
  } catch {
    // Non-fatal
  }
}

/**
 * Clear entire cache.
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Get cache stats for UI display.
 */
export async function getCacheStats(): Promise<{
  totalSize: number;
  entryCount: number;
  maxSize: number;
}> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const countReq = store.count();
      let totalSize = 0;

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          totalSize += (cursor.value as CachedAsset).size;
          cursor.continue();
        }
      };

      countReq.onsuccess = () => {
        // Wait for cursor to finish too
        tx.oncomplete = () => {
          resolve({
            totalSize,
            entryCount: countReq.result,
            maxSize: MAX_CACHE_SIZE_BYTES,
          });
        };
      };

      countReq.onerror = () => resolve({ totalSize: 0, entryCount: 0, maxSize: MAX_CACHE_SIZE_BYTES });
    });
  } catch {
    return { totalSize: 0, entryCount: 0, maxSize: MAX_CACHE_SIZE_BYTES };
  }
}
