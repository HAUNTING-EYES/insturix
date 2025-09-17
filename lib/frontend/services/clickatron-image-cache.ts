// lib/frontend/services/clickatron-image-cache.ts
// Client-side image caching utility for Clickatron

const CACHE_NAME = 'clickatron-image-cache-v2'; // Updated version
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// In-memory cache for faster access
const memoryCache = new Map<string, { data: string; timestamp: number }>();

/**
 * Opens the cache for image storage
 * @returns The cache object or null if caching is not supported
 */
async function openImageCache(): Promise<Cache | null> {
  if (!('caches' in window)) {
    console.warn('Cache API not supported in this browser');
    return null;
  }

  try {
    return await caches.open(CACHE_NAME);
  } catch (error) {
    console.error('Failed to open image cache:', error);
    return null;
  }
}

/**
 * Checks if an image is cached in memory and returns it if found and not expired
 * @param url The image URL to check in memory cache
 * @returns The cached data or null if not found or expired
 */
function getMemoryCachedImage(url: string): string | null {
  const cached = memoryCache.get(url);
  if (!cached) return null;
  
  // Check if cache is expired
  if (Date.now() - cached.timestamp > MEMORY_CACHE_TTL) {
    memoryCache.delete(url);
    return null;
  }
  
  return cached.data;
}

/**
 * Stores an image in memory cache
 * @param url The image URL to cache
 * @param data The base64 data to cache
 */
function cacheImageInMemory(url: string, data: string): void {
  memoryCache.set(url, { data, timestamp: Date.now() });
}

/**
 * Checks if an image is cached and returns it if found
 * @param url The image URL to check in cache
 * @returns The cached response or null if not found
 */
export async function getCachedImage(url: string): Promise<Response | null> {
  // First check memory cache
  const memoryCached = getMemoryCachedImage(url);
  if (memoryCached) {
    console.log(`Image loaded from memory cache: ${url}`);
    const blob = await (await fetch(memoryCached)).blob();
    return new Response(blob);
  }
  
  const cache = await openImageCache();
  if (!cache) return null;

  try {
    const cachedResponse = await cache.match(url);
    return cachedResponse || null;
  } catch (error) {
    console.error('Error retrieving cached image:', error);
    return null;
  }
}

/**
 * Stores an image response in the cache
 * @param url The image URL to cache
 * @param response The response to cache
 */
export async function cacheImage(url: string, response: Response): Promise<void> {
  const cache = await openImageCache();
  if (!cache) return;

  try {
    // Clone the response as it can only be consumed once
    const clonedResponse = response.clone();
    await cache.put(url, clonedResponse);
    
    // Also cache in memory for faster access
    const blob = await response.clone().blob();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        cacheImageInMemory(url, reader.result);
      }
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error('Error caching image:', error);
  }
}

/**
 * Fetches an image with caching support
 * First checks cache, if not found fetches from network and caches the result
 * @param url The image URL to fetch
 * @returns The image response (from cache or network)
 */
export async function fetchImageWithCache(url: string): Promise<Response> {
  // First check if we have the image in cache
  const cachedResponse = await getCachedImage(url);
  if (cachedResponse) {
    console.log(`Image loaded from cache: ${url}`);
    return cachedResponse;
  }

  // If not in cache, fetch from network
  console.log(`Fetching image from network: ${url}`);
  const networkResponse = await fetch(url);
  
  // Cache the response for future use
  if (networkResponse.ok) {
    await cacheImage(url, networkResponse);
  }
  
  return networkResponse;
}

/**
 * Clears all cached images
 */
export async function clearImageCache(): Promise<void> {
  if (!('caches' in window)) return;
  
  try {
    await caches.delete(CACHE_NAME);
    memoryCache.clear(); // Clear memory cache as well
  } catch (error) {
    console.error('Error clearing image cache:', error);
  }
}

/**
 * Gets the current size of the image cache
 * @returns The number of cached entries or null if not supported
 */
export async function getCacheSize(): Promise<number | null> {
  if (!('caches' in window)) return null;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.length;
  } catch (error) {
    console.error('Error getting cache size:', error);
    return null;
  }
}

/**
 * Gets cache statistics for debugging
 * @returns Object containing cache statistics
 */
export function getCacheStats(): { memoryCacheSize: number; memoryCacheKeys: string[] } {
  return {
    memoryCacheSize: memoryCache.size,
    memoryCacheKeys: Array.from(memoryCache.keys())
  };
}