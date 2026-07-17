/**
 * Shared exemplar search — turn a query into REAL example video refs via the free YouTube Search
 * API. Used by every discovery-based fetcher (Perplexity, Google Trends): they find WHAT is
 * trending, this returns real videos of it (no hallucinated URLs — they come from the API).
 */

import { google } from 'googleapis';
import type { ExemplarRef } from '../fetcher';

/** YouTube Data API caps a single search page at 50. */
const YT_MAX_RESULTS = 50;

export async function searchYouTubeExemplars(searchQuery: string, limit: number): Promise<ExemplarRef[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !searchQuery.trim()) return [];

  const youtube = google.youtube({ version: 'v3', auth: apiKey });
  const response = await youtube.search.list({
    part: ['id'],
    q: searchQuery,
    type: ['video'],
    order: 'relevance',
    maxResults: Math.min(Math.max(limit, 1), YT_MAX_RESULTS),
  });

  const exemplars: ExemplarRef[] = [];
  for (const item of response.data.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    exemplars.push({ platform: 'youtube', url: `https://www.youtube.com/watch?v=${videoId}`, platformId: videoId });
  }
  return exemplars;
}
