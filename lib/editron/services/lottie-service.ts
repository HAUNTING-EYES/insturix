/**
 * LottieFiles Integration Service
 *
 * Searches and retrieves motion graphics from LottieFiles for use
 * as animated overlays in Editron projects.
 *
 * LottieFiles provides:
 * - Free animated illustrations, icons, and motion graphics
 * - JSON-based Lottie format (lightweight, scalable, loopable)
 * - Categories: transitions, lower thirds, UI elements, icons, decorative
 *
 * Usage in Editron:
 *   1. Search for animations by keyword
 *   2. Get Lottie JSON URL
 *   3. Render as overlay using @lottiefiles/react-lottie-player or dotlottie
 *
 * API docs: https://developers.lottiefiles.com/
 */

export interface LottieAnimation {
  id: string;
  name: string;
  description?: string;
  /** Direct URL to the Lottie JSON file */
  lottieUrl: string;
  /** Preview image URL */
  previewUrl?: string;
  /** Background color suggestion */
  bgColor?: string;
  /** Duration in seconds (if available) */
  durationSec?: number;
  /** Tags for categorization */
  tags: string[];
  /** Source attribution */
  createdBy?: string;
}

export interface LottieSearchResult {
  animations: LottieAnimation[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ─── LottieFiles Public API ──────────────────────────────────────

/**
 * Search LottieFiles for animations.
 *
 * Uses the public LottieFiles API (no key required for basic search).
 * For production, consider using the official API with an API key for
 * higher rate limits and additional features.
 */
export async function searchLottieAnimations(
  query: string,
  options: {
    page?: number;
    perPage?: number;
    category?: string;
  } = {},
): Promise<LottieSearchResult> {
  const { page = 1, perPage = 12, category } = options;

  console.log(`[Lottie] Searching: "${query}" (page=${page}, perPage=${perPage})`);

  try {
    // LottieFiles public search endpoint
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
    });
    if (category) params.set('category', category);

    // Use the LottieFiles public API
    const apiKey = process.env.LOTTIEFILES_API_KEY;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(
      `https://lottiefiles.com/api/v2/search?${params}`,
      { headers },
    );

    if (!res.ok) {
      // Fallback: try the public graphql endpoint
      return await searchLottieViaGraphQL(query, page, perPage);
    }

    const data = await res.json();
    const items = data.data || data.results || data.items || [];

    return {
      animations: items.map((item: any) => ({
        id: item.id || item.hash,
        name: item.name || item.title || 'Untitled',
        description: item.description,
        lottieUrl: item.lottieUrl || item.jsonUrl || item.lottie_url || `https://assets.lottiefiles.com/${item.hash || item.id}.json`,
        previewUrl: item.previewUrl || item.gifUrl || item.preview_url,
        bgColor: item.bgColor || item.bg_color,
        tags: item.tags || [],
        createdBy: item.createdBy?.name || item.author?.name,
      })),
      total: data.total || data.totalResults || items.length,
      page,
      hasMore: items.length >= perPage,
    };
  } catch (err: any) {
    console.error(`[Lottie] Search error: ${err.message}`);
    return { animations: [], total: 0, page, hasMore: false };
  }
}

/**
 * Fallback: Search via LottieFiles GraphQL API
 */
async function searchLottieViaGraphQL(
  query: string,
  page: number,
  perPage: number,
): Promise<LottieSearchResult> {
  try {
    const res = await fetch('https://graphql.lottiefiles.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query SearchPublicAnimations($query: String!, $page: Int!, $limit: Int!) {
            searchPublicAnimations(query: $query, first: $limit, page: $page) {
              data {
                id
                name
                description
                jsonUrl
                gifUrl
                bgColor
                tags
                createdBy { name }
              }
              paginatorInfo { total currentPage hasMorePages }
            }
          }
        `,
        variables: { query, page, limit: perPage },
      }),
    });

    if (!res.ok) {
      console.warn(`[Lottie] GraphQL search failed: ${res.status}`);
      return { animations: [], total: 0, page, hasMore: false };
    }

    const data = await res.json();
    const results = data?.data?.searchPublicAnimations;
    const items = results?.data || [];

    return {
      animations: items.map((item: any) => ({
        id: String(item.id),
        name: item.name || 'Untitled',
        description: item.description,
        lottieUrl: item.jsonUrl,
        previewUrl: item.gifUrl,
        bgColor: item.bgColor,
        tags: item.tags || [],
        createdBy: item.createdBy?.name,
      })),
      total: results?.paginatorInfo?.total || items.length,
      page,
      hasMore: results?.paginatorInfo?.hasMorePages || false,
    };
  } catch (err: any) {
    console.error(`[Lottie] GraphQL error: ${err.message}`);
    return { animations: [], total: 0, page, hasMore: false };
  }
}

/**
 * Get a specific Lottie animation by ID.
 */
export async function getLottieAnimation(id: string): Promise<LottieAnimation | null> {
  try {
    const res = await fetch(`https://lottiefiles.com/api/v2/animations/${id}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return null;

    const item = await res.json();
    return {
      id: String(item.id || item.hash),
      name: item.name || 'Untitled',
      description: item.description,
      lottieUrl: item.lottieUrl || item.jsonUrl,
      previewUrl: item.previewUrl || item.gifUrl,
      bgColor: item.bgColor,
      tags: item.tags || [],
      createdBy: item.createdBy?.name,
    };
  } catch (err: unknown) { console.warn('[Lottie] Failed to get animation by ID:', err instanceof Error ? err.message : err); return null; }
}

// ─── Preset Categories for Edit Profiles ─────────────────────────

/**
 * Curated search queries for common motion graphic needs.
 * Used by edit profiles to automatically add appropriate animations.
 */
export const LOTTIE_PRESETS = {
  // Transitions
  'transition-wipe': 'wipe transition',
  'transition-dissolve': 'dissolve fade transition',
  'transition-glitch': 'glitch transition effect',
  'transition-zoom': 'zoom transition',

  // Lower thirds
  'lower-third-clean': 'lower third clean minimal',
  'lower-third-news': 'lower third news broadcast',
  'lower-third-social': 'lower third social media',

  // UI Elements
  'subscribe-button': 'subscribe button animation',
  'like-button': 'like heart animation',
  'notification-bell': 'notification bell animation',
  'loading-spinner': 'loading spinner',

  // Decorative
  'particles': 'particles floating',
  'confetti': 'confetti celebration',
  'sparkle': 'sparkle shine effect',
  'smoke': 'smoke fog effect',

  // Icons
  'arrow-indicator': 'arrow pointer animation',
  'checkmark': 'checkmark success animation',
  'play-button': 'play button animation',

  // Overlays
  'film-grain': 'film grain noise overlay',
  'light-leak': 'light leak lens flare',
  'vignette': 'vignette dark edges',
} as const;

export type LottiePresetKey = keyof typeof LOTTIE_PRESETS;
