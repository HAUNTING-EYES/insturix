import { z } from 'zod';

export const musicDiscoveryProviderNameSchema = z.enum([
  'youtube',
  'apple-music',
  'musicbrainz',
  'spotify',
  'epidemic-sound',
  'soundstripe',
]);

const languageTagSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/, 'Expected an ISO language tag');

export const musicDiscoverySearchQuerySchema = z.object({
  term: z.string().trim().min(1).max(200),
  territory: z.union([
    z.literal('GLOBAL'),
    z.string().trim().regex(/^[A-Za-z]{2}$/, 'Expected an ISO country code'),
  ]).default('GLOBAL'),
  languages: z.array(languageTagSchema).max(10).default([]),
  limit: z.number().int().min(1).max(50).default(20),
});

export type MusicDiscoveryProviderName = z.infer<typeof musicDiscoveryProviderNameSchema>;
export type MusicDiscoverySearchQuery = z.infer<typeof musicDiscoverySearchQuerySchema>;

export type MusicDiscoveryAction =
  | 'official-preview'
  | 'provider-link-out'
  | 'supply-reference-audio'
  | 'add-on-platform'
  | 'ingest-export-cleared';

export interface MusicDiscoverySource {
  provider: MusicDiscoveryProviderName;
  providerId: string;
  url: string;
  embedUrl?: string;
  previewUrl?: string;
  attribution?: string;
  previewCapability: 'official-embed' | 'provider-preview' | 'link-out';
}

export interface MusicTrendEvidence {
  source: string;
  territory: string;
  language?: string;
  chart?: string;
  rank?: number;
  previousRank?: number;
  rankDelta?: number;
  velocity?: number;
  observedAt: string;
}

export interface MusicDiscoveryIdentity {
  identityId: string;
  identityConfidence: 'provider-only' | 'matched' | 'canonical';
  title: string;
  artists: string[];
  durationMs: number | null;
  artworkUrl: string | null;
  explicit: boolean | null;
  isrcs: string[];
  languages: string[];
  sources: MusicDiscoverySource[];
  trendEvidence: MusicTrendEvidence[];
  availability: {
    audioAcquisition: 'not-provided' | 'user-supplied-reference' | 'export-cleared';
    renderEligibility:
      | 'not-renderable'
      | 'requires-user-reference-upload'
      | 'requires-entitlement-and-ingest';
  };
  actions: MusicDiscoveryAction[];
}

export interface MusicDiscoverySearchResult {
  providers: MusicDiscoveryProviderName[];
  identities: MusicDiscoveryIdentity[];
  query: MusicDiscoverySearchQuery;
  failures: MusicDiscoveryProviderFailure[];
}

export interface MusicDiscoveryProvider {
  readonly name: MusicDiscoveryProviderName;
  available(): boolean;
  search(query: MusicDiscoverySearchQuery): Promise<MusicDiscoveryIdentity[]>;
}

export type MusicDiscoveryProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_QUERY'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT';

export type MusicDiscoveryProviderFailureDetail =
  | 'UPSTREAM_AUTH_FAILED'
  | 'INVALID_UPSTREAM_RESPONSE';

export interface MusicDiscoveryProviderFailure {
  provider: MusicDiscoveryProviderName;
  code: MusicDiscoveryProviderErrorCode;
  detailCode?: MusicDiscoveryProviderFailureDetail;
  message: string;
  providerStatus?: number;
  retryAfterSeconds?: number;
}

export interface MusicDiscoveryProviderErrorOptions extends ErrorOptions {
  detailCode?: MusicDiscoveryProviderFailureDetail;
}

export class MusicDiscoveryProviderError extends Error {
  readonly detailCode?: MusicDiscoveryProviderFailureDetail;

  constructor(
    readonly code: MusicDiscoveryProviderErrorCode,
    message: string,
    readonly providerStatus?: number,
    readonly retryAfterSeconds?: number,
    options?: MusicDiscoveryProviderErrorOptions,
  ) {
    super(message, options);
    this.name = 'MusicDiscoveryProviderError';
    this.detailCode = options?.detailCode;
  }
}
