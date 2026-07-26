/**
 * Shared exemplar search — turn a query into REAL example video refs via the free YouTube Search
 * API. Used by every discovery-based fetcher (Perplexity, Google Trends): they find WHAT is
 * trending, this returns real videos of it (no hallucinated URLs — they come from the API).
 */

import { google } from 'googleapis';
import type { ExemplarRef } from '../fetcher';

/** YouTube Data API caps a single search page at 50. */
const YT_MAX_RESULTS = 50;

export interface YouTubeVideoSearchQuery {
  query: string;
  limit: number;
  apiKey: string;
  regionCode?: string;
  relevanceLanguage?: string;
  videoCategoryId?: string;
  includeContentDetails?: boolean;
}

export interface YouTubeVideoSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationMs: number | null;
  embeddable: boolean | null;
  url: string;
  embedUrl: string;
}

export async function searchYouTubeVideos(
  input: YouTubeVideoSearchQuery,
): Promise<YouTubeVideoSearchResult[]> {
  const query = input.query.trim();
  if (!query || !input.apiKey.trim()) return [];

  const youtube = google.youtube({ version: 'v3', auth: input.apiKey });
  const response = await youtube.search.list({
    part: ['snippet'],
    q: query,
    type: ['video'],
    order: 'relevance',
    maxResults: Math.min(Math.max(input.limit, 1), YT_MAX_RESULTS),
    ...(input.regionCode ? { regionCode: input.regionCode } : {}),
    ...(input.relevanceLanguage ? { relevanceLanguage: input.relevanceLanguage } : {}),
    ...(input.videoCategoryId ? { videoCategoryId: input.videoCategoryId } : {}),
  });

  const searchItems = (response.data.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId;
    if (!videoId) return [];
    return [{
      videoId,
      snippet: item.snippet,
    }];
  });
  if (searchItems.length === 0) return [];

  const detailsById = new Map<string, {
    durationMs: number | null;
    embeddable: boolean | null;
  }>();
  if (input.includeContentDetails) {
    const detailResponse = await youtube.videos.list({
      part: ['contentDetails', 'status'],
      id: searchItems.map((item) => item.videoId),
      maxResults: searchItems.length,
    });
    for (const item of detailResponse.data.items ?? []) {
      if (!item.id) continue;
      detailsById.set(item.id, {
        durationMs: parseIso8601DurationMs(item.contentDetails?.duration),
        embeddable: typeof item.status?.embeddable === 'boolean'
          ? item.status.embeddable
          : null,
      });
    }
  }

  return searchItems.map(({ videoId, snippet }) => {
    const details = detailsById.get(videoId);
    return {
      videoId,
      title: snippet?.title?.trim() || 'Untitled YouTube video',
      channelTitle: snippet?.channelTitle?.trim() || '',
      description: snippet?.description?.trim() || '',
      publishedAt: snippet?.publishedAt ?? null,
      thumbnailUrl: bestThumbnailUrl(snippet?.thumbnails),
      durationMs: details?.durationMs ?? null,
      embeddable: details?.embeddable ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  });
}

export async function searchYouTubeExemplars(searchQuery: string, limit: number): Promise<ExemplarRef[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !searchQuery.trim()) return [];

  const results = await searchYouTubeVideos({
    query: searchQuery,
    limit,
    apiKey,
  });

  return results.map((result) => ({
    platform: 'youtube',
    url: result.url,
    platformId: result.videoId,
  }));
}

function parseIso8601DurationMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const totalSeconds = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
  return Number.isFinite(totalSeconds) ? Math.round(totalSeconds * 1_000) : null;
}

interface YouTubeThumbnailSet {
  maxres?: { url?: string | null } | null;
  standard?: { url?: string | null } | null;
  high?: { url?: string | null } | null;
  medium?: { url?: string | null } | null;
  default?: { url?: string | null } | null;
}

function bestThumbnailUrl(thumbnails: YouTubeThumbnailSet | null | undefined): string | null {
  if (!thumbnails) return null;
  const keys: Array<keyof YouTubeThumbnailSet> = [
    'maxres',
    'standard',
    'high',
    'medium',
    'default',
  ];
  for (const key of keys) {
    const url = thumbnails[key]?.url?.trim();
    if (url) return url;
  }
  return null;
}
