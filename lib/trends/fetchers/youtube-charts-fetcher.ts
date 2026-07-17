/**
 * YouTube Charts fetcher (Master v1.1 §7.4) — real TrendFetcher over the YouTube Data API.
 *
 * Pulls the most-popular chart for a region (default IN — YouTube Charts India) and maps each
 * trending video to a TrendCandidate whose single exemplar is the video itself. Grouping many
 * videos into one pattern (by sound/hashtag) is a later refinement; for now each trending video
 * is a candidate that the aggregator can expand exemplars for.
 *
 * Reuses the googleapis youtube client pattern from app/api/services/alyzitron/utils/youtube.ts.
 * Free API (quota-limited). No key ⇒ available() is false ⇒ the composite skips it.
 */

import { google } from 'googleapis';
import type { TrendFetcher, TrendFetchQuery, TrendCandidate } from '../fetcher';

/** YouTube Data API caps a single videos.list page at 50. */
const YT_MAX_RESULTS = 50;

export class YouTubeChartsFetcher implements TrendFetcher {
  readonly name = 'youtube-charts';

  available(): boolean {
    return Boolean(process.env.YOUTUBE_API_KEY);
  }

  async fetchCandidates(query: TrendFetchQuery): Promise<TrendCandidate[]> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return [];

    const regionCode = query.region ?? 'IN'; // §7.4 — YouTube Charts India
    const maxResults = Math.min(query.limit ?? 25, YT_MAX_RESULTS);
    const youtube = google.youtube({ version: 'v3', auth: apiKey });

    const response = await youtube.videos.list({
      part: ['snippet', 'statistics'],
      chart: 'mostPopular',
      regionCode,
      maxResults,
    });

    const items = response.data.items ?? [];
    const nowMs = Date.now();
    return items
      .filter((item) => Boolean(item.id))
      .map((item, index): TrendCandidate => {
        const videoId = item.id as string;
        return {
          key: videoId,
          platform: 'youtube',
          title: item.snippet?.title ?? undefined,
          // The chart is already ranked; use position as the tracker signal (top = ~1).
          trackerScore: items.length ? (items.length - index) / items.length : 0,
          exemplars: [
            { platform: 'youtube', url: `https://www.youtube.com/watch?v=${videoId}`, platformId: videoId },
          ],
          fetchedAtMs: nowMs,
          source: this.name,
        };
      });
  }
}
