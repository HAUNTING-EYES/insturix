/**
 * Pixabay Stock Footage Service
 *
 * Searches Pixabay for context-aware stock videos and images.
 * Used for rapid-cut montage sequences where AI generation is overkill,
 * or to supplement AI-generated content with real footage.
 *
 * Free tier: 5000 requests/day. API key required.
 * Videos: HD quality, various durations.
 * Images: Up to 1920px, various orientations.
 *
 * All Pixabay content is free for commercial use (Pixabay License).
 */

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

export interface PixabayVideoResult {
  id: number;
  pageUrl: string;
  /** Medium quality video URL (MP4, ~720p) */
  videoUrl: string;
  /** HD video URL if available */
  videoUrlHD?: string;
  /** Video duration in seconds */
  duration: number;
  /** Preview thumbnail */
  thumbnailUrl: string;
  tags: string[];
  /** Pixabay downloads (popularity signal) */
  downloads: number;
}

export interface PixabayImageResult {
  id: number;
  pageUrl: string;
  /** Large image URL (~1280px) */
  imageUrl: string;
  /** Web-format URL (~640px, faster) */
  previewUrl: string;
  /** Original dimensions */
  width: number;
  height: number;
  tags: string[];
  downloads: number;
}

/**
 * Check if Pixabay API is available
 */
export function isPixabayAvailable(): boolean {
  return !!PIXABAY_API_KEY;
}

/**
 * Search for stock videos on Pixabay.
 * Returns video clips sorted by relevance/popularity.
 */
export async function searchStockVideos(
  query: string,
  options: {
    minDuration?: number;
    maxDuration?: number;
    category?: string;
    orientation?: 'horizontal' | 'vertical';
    limit?: number;
  } = {},
): Promise<PixabayVideoResult[]> {
  if (!PIXABAY_API_KEY) {
    console.warn('[Pixabay] API key not set');
    return [];
  }

  const { minDuration, maxDuration, category, orientation, limit = 10 } = options;

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    video_type: 'film', // film = real footage, animation = motion graphics
    per_page: String(Math.min(limit, 50)),
    safesearch: 'true',
    order: 'popular',
  });

  if (category) params.set('category', category);

  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
    if (!res.ok) {
      console.warn(`[Pixabay] Video search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const hits = data.hits || [];

    return hits
      .filter((h: any) => {
        if (minDuration && h.duration < minDuration) return false;
        if (maxDuration && h.duration > maxDuration) return false;
        if (orientation === 'vertical' && h.videos?.medium?.width > h.videos?.medium?.height) return false;
        if (orientation === 'horizontal' && h.videos?.medium?.width < h.videos?.medium?.height) return false;
        return true;
      })
      .map((h: any) => ({
        id: h.id,
        pageUrl: h.pageURL,
        videoUrl: h.videos?.medium?.url || h.videos?.small?.url,
        videoUrlHD: h.videos?.large?.url,
        duration: h.duration,
        thumbnailUrl: `https://i.vimeocdn.com/video/${h.picture_id}_295x166.jpg`,
        tags: (h.tags || '').split(', ').filter(Boolean),
        downloads: h.downloads || 0,
      }))
      .filter((v: PixabayVideoResult) => v.videoUrl); // Must have a playable URL
  } catch (err: any) {
    console.error(`[Pixabay] Video search error: ${err.message}`);
    return [];
  }
}

/**
 * Search for stock images on Pixabay.
 * Useful for storyboard alternatives or rapid-cut still frames with Ken Burns.
 */
export async function searchStockImages(
  query: string,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'all';
    category?: string;
    imageType?: 'photo' | 'illustration' | 'vector';
    limit?: number;
  } = {},
): Promise<PixabayImageResult[]> {
  if (!PIXABAY_API_KEY) {
    console.warn('[Pixabay] API key not set');
    return [];
  }

  const { orientation = 'all', category, imageType = 'photo', limit = 10 } = options;

  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    image_type: imageType,
    orientation,
    per_page: String(Math.min(limit, 50)),
    safesearch: 'true',
    order: 'popular',
  });

  if (category) params.set('category', category);

  try {
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) {
      console.warn(`[Pixabay] Image search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const hits = data.hits || [];

    return hits.map((h: any) => ({
      id: h.id,
      pageUrl: h.pageURL,
      imageUrl: h.largeImageURL || h.webformatURL,
      previewUrl: h.webformatURL || h.previewURL,
      width: h.imageWidth,
      height: h.imageHeight,
      tags: (h.tags || '').split(', ').filter(Boolean),
      downloads: h.downloads || 0,
    }));
  } catch (err: any) {
    console.error(`[Pixabay] Image search error: ${err.message}`);
    return [];
  }
}
