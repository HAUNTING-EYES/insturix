import { z } from 'zod';

export const musicCatalogVocalTypeSchema = z.enum(['lead', 'presence', 'none']);
export const musicCatalogSortSchema = z.enum([
  'Title',
  'Relevance',
  'Date',
  'Popularity',
  'Duration',
  'BPM',
]);
export const musicCatalogOrderSchema = z.enum(['asc', 'desc']);

const catalogFilterSchema = z.string().trim().min(1).max(100);

export const musicCatalogSearchQuerySchema = z
  .object({
    term: z.string().trim().min(1).max(200).optional(),
    genres: z.array(catalogFilterSchema).max(10).default([]),
    moods: z.array(catalogFilterSchema).max(10).default([]),
    vocalTypes: z.array(musicCatalogVocalTypeSchema).max(3).default([]),
    bpmMin: z.number().int().min(20).max(300).optional(),
    bpmMax: z.number().int().min(20).max(300).optional(),
    limit: z.number().int().min(1).max(60).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
    sort: musicCatalogSortSchema.default('Relevance'),
    order: musicCatalogOrderSchema.default('asc'),
  })
  .superRefine((query, context) => {
    if (
      query.bpmMin !== undefined
      && query.bpmMax !== undefined
      && query.bpmMin > query.bpmMax
    ) {
      context.addIssue({
        code: 'custom',
        message: 'bpmMin must be less than or equal to bpmMax',
        path: ['bpmMin'],
      });
    }
  });

export type MusicCatalogSearchQuery = z.infer<typeof musicCatalogSearchQuerySchema>;
export type MusicCatalogVocalType = z.infer<typeof musicCatalogVocalTypeSchema>;
export type MusicCatalogProviderName = 'epidemic-sound' | 'soundstripe';

export interface MusicCatalogTaxonomyTag {
  id: string;
  name: string;
}

export interface MusicCatalogTrack {
  provider: MusicCatalogProviderName;
  providerTrackId: string;
  title: string;
  artists: string[];
  featuredArtists: string[];
  durationMs: number;
  bpm: number | null;
  moods: MusicCatalogTaxonomyTag[];
  genres: MusicCatalogTaxonomyTag[];
  artworkUrl?: string;
  waveformUrl?: string;
  vocalType: MusicCatalogVocalType | 'unknown';
  hasVocals: boolean | null;
  explicit: boolean | null;
  isrc?: string;
  providerTier?: 'free' | 'paid' | 'unknown';
  catalogAvailability: 'preview-only' | 'download-candidate';
  rightsStatus: 'unverified';
  renderEligibility: 'requires-entitlement-and-ingest';
}

export interface MusicCatalogSearchResult {
  provider: MusicCatalogProviderName;
  tracks: MusicCatalogTrack[];
  pagination: {
    limit: number;
    offset: number;
    nextOffset: number | null;
  };
}

export interface MusicCatalogProvider {
  readonly name: MusicCatalogProviderName;
  available(): boolean;
  search(query: MusicCatalogSearchQuery): Promise<MusicCatalogSearchResult>;
}

export type MusicCatalogProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_QUERY'
  | 'UPSTREAM_UNAUTHORIZED'
  | 'UPSTREAM_FORBIDDEN'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'INVALID_UPSTREAM_RESPONSE';

export class MusicCatalogProviderError extends Error {
  constructor(
    readonly code: MusicCatalogProviderErrorCode,
    message: string,
    readonly providerStatus?: number,
    readonly retryAfterSeconds?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MusicCatalogProviderError';
  }
}
