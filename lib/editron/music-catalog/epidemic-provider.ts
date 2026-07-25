import { z } from 'zod';

import {
  MusicCatalogProviderError,
  musicCatalogSearchQuerySchema,
  type MusicCatalogProvider,
  type MusicCatalogSearchQuery,
  type MusicCatalogSearchResult,
  type MusicCatalogTrack,
  type MusicCatalogVocalType,
} from '@/lib/editron/music-catalog/types';

type FetchLike = typeof fetch;

export interface EpidemicMusicCatalogProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const DEFAULT_BASE_URL = 'https://partner-content-api.epidemicsound.com';
const DEFAULT_TIMEOUT_MS = 8_000;

const taxonomySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const trackSchema = z.object({
  id: z.string().min(1),
  mainArtists: z.array(z.string()).default([]),
  featuredArtists: z.array(z.string()).default([]),
  title: z.string().min(1),
  bpm: z.number().int().positive().nullable().optional(),
  length: z.number().int().nonnegative(),
  moods: z.array(taxonomySchema).default([]),
  genres: z.array(taxonomySchema).default([]),
  images: z.object({
    default: z.string().url().optional(),
    L: z.string().url().optional(),
    M: z.string().url().optional(),
    S: z.string().url().optional(),
    XS: z.string().url().optional(),
  }).passthrough().optional(),
  waveformUrl: z.string().url().optional(),
  hasVocals: z.boolean().nullable().optional(),
  tierOption: z.enum(['PAID', 'FREE']).nullable().optional(),
  isrc: z.string().nullable().optional(),
  vocalType: z.enum(['LEAD', 'PRESENCE', 'NONE']).nullable().optional(),
  isExplicit: z.boolean().nullable().optional(),
  isPreviewOnly: z.boolean().optional(),
}).passthrough();

const tracksResponseSchema = z.object({
  tracks: z.array(trackSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).passthrough(),
  links: z.object({
    next: z.string().optional(),
    prev: z.string().optional(),
  }).passthrough(),
}).passthrough();

export class EpidemicMusicCatalogProvider implements MusicCatalogProvider {
  readonly name = 'epidemic-sound' as const;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: EpidemicMusicCatalogProviderOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.EPIDEMIC_SOUND_API_KEY)?.trim() || undefined;
    this.baseUrl = options.baseUrl ?? process.env.EPIDEMIC_SOUND_API_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  available(): boolean {
    return Boolean(this.apiKey);
  }

  async search(input: MusicCatalogSearchQuery): Promise<MusicCatalogSearchResult> {
    if (!this.apiKey) {
      throw new MusicCatalogProviderError(
        'NOT_CONFIGURED',
        'The Epidemic Sound catalog is not configured',
      );
    }

    const parsedQuery = musicCatalogSearchQuerySchema.safeParse(input);
    if (!parsedQuery.success) {
      throw new MusicCatalogProviderError(
        'INVALID_QUERY',
        'The music catalog query is invalid',
        undefined,
        undefined,
        { cause: parsedQuery.error },
      );
    }

    const url = buildSearchUrl(this.baseUrl, parsedQuery.data);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw providerResponseError(response);
      }

      const payload: unknown = await response.json().catch((error: unknown) => {
        throw new MusicCatalogProviderError(
          'INVALID_UPSTREAM_RESPONSE',
          'The music catalog returned invalid JSON',
          response.status,
          undefined,
          { cause: error },
        );
      });
      const parsedResponse = tracksResponseSchema.safeParse(payload);
      if (!parsedResponse.success) {
        throw new MusicCatalogProviderError(
          'INVALID_UPSTREAM_RESPONSE',
          'The music catalog response did not match its contract',
          response.status,
          undefined,
          { cause: parsedResponse.error },
        );
      }

      const { tracks, pagination, links } = parsedResponse.data;
      return {
        provider: this.name,
        tracks: tracks.map(normalizeTrack),
        pagination: {
          limit: pagination.limit,
          offset: pagination.offset,
          nextOffset: links.next ? pagination.offset + pagination.limit : null,
        },
      };
    } catch (error) {
      if (error instanceof MusicCatalogProviderError) throw error;
      if (isAbortError(error)) {
        throw new MusicCatalogProviderError(
          'UPSTREAM_TIMEOUT',
          'The music catalog request timed out',
          undefined,
          undefined,
          { cause: error },
        );
      }
      throw new MusicCatalogProviderError(
        'UPSTREAM_UNAVAILABLE',
        'The music catalog is unavailable',
        undefined,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildSearchUrl(baseUrl: string, query: MusicCatalogSearchQuery): URL {
  const url = new URL('/v0/tracks/search', `${baseUrl.replace(/\/+$/, '')}/`);
  if (query.term) url.searchParams.set('term', query.term);
  query.genres.forEach((genre) => url.searchParams.append('genre', genre));
  query.moods.forEach((mood) => url.searchParams.append('mood', mood));
  query.vocalTypes.forEach((vocalType) => {
    url.searchParams.append('vocalType', vocalType.toUpperCase());
  });
  if (query.bpmMin !== undefined) url.searchParams.set('bpmMin', String(query.bpmMin));
  if (query.bpmMax !== undefined) url.searchParams.set('bpmMax', String(query.bpmMax));
  url.searchParams.set('limit', String(query.limit));
  url.searchParams.set('offset', String(query.offset));
  url.searchParams.set('sort', query.sort);
  url.searchParams.set('order', query.order);
  return url;
}

function normalizeTrack(track: z.infer<typeof trackSchema>): MusicCatalogTrack {
  const previewOnly = track.isPreviewOnly !== false;
  return {
    provider: 'epidemic-sound',
    providerTrackId: track.id,
    title: track.title,
    artists: track.mainArtists,
    featuredArtists: track.featuredArtists,
    durationMs: track.length * 1_000,
    bpm: track.bpm ?? null,
    moods: track.moods.map(({ id, name }) => ({ id, name })),
    genres: track.genres.map(({ id, name }) => ({ id, name })),
    artworkUrl: track.images?.M ?? track.images?.default ?? track.images?.S,
    waveformUrl: track.waveformUrl,
    vocalType: normalizeVocalType(track.vocalType),
    hasVocals: track.hasVocals ?? null,
    explicit: track.isExplicit ?? null,
    isrc: track.isrc ?? undefined,
    providerTier:
      track.tierOption === 'FREE'
        ? 'free'
        : track.tierOption === 'PAID'
          ? 'paid'
          : 'unknown',
    catalogAvailability: previewOnly ? 'preview-only' : 'download-candidate',
    rightsStatus: 'unverified',
    renderEligibility: 'requires-entitlement-and-ingest',
  };
}

function normalizeVocalType(
  vocalType: 'LEAD' | 'PRESENCE' | 'NONE' | null | undefined,
): MusicCatalogVocalType | 'unknown' {
  return vocalType ? vocalType.toLowerCase() as MusicCatalogVocalType : 'unknown';
}

function providerResponseError(response: Response): MusicCatalogProviderError {
  const retryAfter = readRetryAfter(response.headers.get('retry-after'));
  if (response.status === 401) {
    return new MusicCatalogProviderError(
      'UPSTREAM_UNAUTHORIZED',
      'The music catalog rejected its server credentials',
      response.status,
    );
  }
  if (response.status === 403) {
    return new MusicCatalogProviderError(
      'UPSTREAM_FORBIDDEN',
      'The music catalog denied this operation',
      response.status,
    );
  }
  if (response.status === 429) {
    return new MusicCatalogProviderError(
      'UPSTREAM_RATE_LIMITED',
      'The music catalog rate limit was reached',
      response.status,
      retryAfter,
    );
  }
  return new MusicCatalogProviderError(
    'UPSTREAM_UNAVAILABLE',
    'The music catalog request failed',
    response.status,
    retryAfter,
  );
}

function readRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
