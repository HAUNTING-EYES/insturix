/**
 * Perplexity→YouTube trend fetcher (Master v1.1 §7.4) — the convergence-based IG/short-form signal.
 *
 * A trend worth replicating is NOT the single #1 viral video (that's low-taste chart junk) — it's a
 * pattern MANY creators are converging on: a viral SOUND, a repeatable FORMAT, a CHALLENGE. So
 * Perplexity Sonar (search-native) discovers those convergent trends (its strength; the live test
 * proved it won't hand over reel URLs, so we don't ask it to), then the free YouTube Search API
 * returns REAL example videos for each. No hallucinated URLs; no Apify credits.
 *
 * discoverTopics + searchExemplars are injected so the orchestration is unit-testable; the real
 * defaults call Perplexity + YouTube. No key(s) ⇒ available() is false ⇒ the composite skips it.
 */

import type { TrendFetcher, TrendFetchQuery, TrendCandidate } from '../fetcher';
import { searchYouTubeExemplars } from './youtube-search';
import { extractJsonArray } from '@/lib/calos/llm-json';

const SONAR_URL = 'https://api.perplexity.ai/chat/completions';
const SONAR_MODEL = 'sonar';
const EXEMPLARS_PER_TOPIC = 5;
const MAX_TOPICS = 10;

/** A convergent trend + the query that will surface its example videos on YouTube. */
export interface TrendTopic {
  title: string;
  searchQuery: string;
}

export type DiscoverTopics = (query: TrendFetchQuery) => Promise<TrendTopic[]>;
export type SearchExemplars = (searchQuery: string, limit: number) => Promise<import('../fetcher').ExemplarRef[]>;

export interface PerplexityYouTubeFetcherOptions {
  discoverTopics?: DiscoverTopics;
  searchExemplars?: SearchExemplars;
}

export class PerplexityYouTubeTrendFetcher implements TrendFetcher {
  readonly name = 'perplexity-youtube';
  private readonly discoverTopics: DiscoverTopics;
  private readonly searchExemplars: SearchExemplars;

  constructor(options: PerplexityYouTubeFetcherOptions = {}) {
    this.discoverTopics = options.discoverTopics ?? defaultDiscoverTopics;
    this.searchExemplars = options.searchExemplars ?? searchYouTubeExemplars;
  }

  available(): boolean {
    return Boolean(process.env.PERPLEXITY_API_KEY && process.env.YOUTUBE_API_KEY);
  }

  async fetchCandidates(query: TrendFetchQuery): Promise<TrendCandidate[]> {
    const topics = (await this.discoverTopics(query)).slice(0, MAX_TOPICS);
    const nowMs = Date.now();
    const candidates: TrendCandidate[] = [];

    for (let index = 0; index < topics.length; index += 1) {
      const topic = topics[index];
      const exemplars = await this.searchExemplars(topic.searchQuery, EXEMPLARS_PER_TOPIC);
      if (exemplars.length === 0) continue; // discovery found a topic YouTube can't back — skip it

      candidates.push({
        key: slugify(topic.title),
        platform: 'youtube',
        title: topic.title,
        trackerScore: topics.length ? (topics.length - index) / topics.length : 0,
        exemplars,
        fetchedAtMs: nowMs,
        source: this.name,
      });
    }
    return candidates;
  }
}

/** Perplexity Sonar → CONVERGENT trend topics (formats/sounds/challenges) + a YouTube search query each. */
async function defaultDiscoverTopics(query: TrendFetchQuery): Promise<TrendTopic[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return [];
  const region = (query.region ?? '').trim();
  const limit = Math.min(Math.max(query.limit ?? 8, 1), MAX_TOPICS);

  const response = await fetch(SONAR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: SONAR_MODEL,
      temperature: 0,
      max_tokens: 1200,
      web_search_options: { search_context_size: 'medium' },
      messages: [
        { role: 'system', content: 'You are a short-form video trend researcher. Use current web search. Return only valid JSON.' },
        { role: 'user', content: buildTopicPrompt({ region, limit }) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Perplexity topic discovery failed (${response.status})`);
  const raw = (await response.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = typeof raw.choices?.[0]?.message?.content === 'string' ? (raw.choices[0].message!.content as string) : '';

  return extractJsonArray(content)
    .map((item): TrendTopic | null => {
      const it = (item ?? {}) as { title?: unknown; searchQuery?: unknown };
      const title = typeof it.title === 'string' ? it.title.slice(0, 200).trim() : '';
      const searchQuery = typeof it.searchQuery === 'string' ? it.searchQuery.slice(0, 120).trim() : '';
      return title && searchQuery ? { title, searchQuery } : null;
    })
    .filter((t): t is TrendTopic => t !== null);
}

function buildTopicPrompt(input: { region: string; limit: number }): string {
  return [
    '<task>Find CURRENT short-form video TRENDS that MANY creators are actively making their own',
    'videos to right now (last 1-3 weeks): a viral SOUND/song, a repeatable FORMAT, or a CHALLENGE.',
    'NOT one-off viral clips or news. For each, give a short title and a YouTube search query to find',
    'real examples creators have made.</task>',
    '<rules>',
    `- Return at most ${input.limit} trends.`,
    '- Prefer HIGH CREATOR VOLUME (many people making their own version) over a single popular video.',
    '- Each must be something a brand could replicate with its own content (a format/sound/challenge).',
    '- Each item: {"title": string, "searchQuery": string}.',
    '- searchQuery: 2-6 words a person would type to find examples on YouTube.',
    '- Output ONLY a JSON array. No markdown, no prose.',
    '- If nothing genuinely fits, return [].',
    input.region ? '- Prefer trends relevant to the region in <region>.' : '',
    '</rules>',
    input.region ? `<region>${input.region}</region>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'trend'
  );
}
