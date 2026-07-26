import { z } from 'zod';

import {
  musicDiscoveryProviderNameSchema,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryIdentity,
  type MusicDiscoverySearchQuery,
  type MusicDiscoverySearchResult,
} from '@/lib/editron/music-discovery/types';

const discoveryActionSchema = z.enum([
  'official-preview',
  'provider-link-out',
  'supply-reference-audio',
  'add-on-platform',
  'ingest-export-cleared',
]);

const discoverySourceSchema = z.object({
  provider: musicDiscoveryProviderNameSchema,
  providerId: z.string().min(1),
  url: z.string().url(),
  embedUrl: z.string().url().optional(),
  previewUrl: z.string().url().optional(),
  attribution: z.string().optional(),
  previewCapability: z.enum(['official-embed', 'provider-preview', 'link-out']),
});

const trendEvidenceSchema = z.object({
  source: z.string().min(1),
  territory: z.string().min(1),
  language: z.string().optional(),
  chart: z.string().optional(),
  rank: z.number().int().positive().optional(),
  previousRank: z.number().int().positive().optional(),
  rankDelta: z.number().int().optional(),
  velocity: z.number().finite().optional(),
  velocityUnit: z.literal('rank-positions-per-hour').optional(),
  observedAt: z.string().datetime(),
});

const discoveryIdentitySchema = z.object({
  identityId: z.string().min(1),
  identityConfidence: z.enum(['provider-only', 'matched', 'canonical']),
  title: z.string().min(1),
  artists: z.array(z.string()),
  durationMs: z.number().int().nonnegative().nullable(),
  artworkUrl: z.string().url().nullable(),
  explicit: z.boolean().nullable(),
  isrcs: z.array(z.string()),
  languages: z.array(z.string()),
  sources: z.array(discoverySourceSchema).min(1),
  trendEvidence: z.array(trendEvidenceSchema),
  availability: z.object({
    audioAcquisition: z.enum([
      'not-provided',
      'user-supplied-reference',
      'export-cleared',
    ]),
    renderEligibility: z.enum([
      'not-renderable',
      'requires-user-reference-upload',
      'requires-entitlement-and-ingest',
    ]),
  }),
  actions: z.array(discoveryActionSchema),
});

const providerFailureSchema = z.object({
  provider: musicDiscoveryProviderNameSchema,
  code: z.enum([
    'NOT_CONFIGURED',
    'INVALID_QUERY',
    'UPSTREAM_RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
    'UPSTREAM_TIMEOUT',
  ]),
  detailCode: z.enum(['UPSTREAM_AUTH_FAILED', 'INVALID_UPSTREAM_RESPONSE']).optional(),
  message: z.string(),
  providerStatus: z.number().int().optional(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});

const trendCoverageSchema = z.object({
  status: z.enum([
    'fresh',
    'stale',
    'refreshing',
    'not-configured',
    'requires-territory',
    'unavailable',
  ]),
  source: z.literal('youtube-most-popular-music'),
  territory: z.string().nullable(),
  requestedLanguages: z.array(z.string()),
  matchedIdentityCount: z.number().int().nonnegative(),
  observedAt: z.string().datetime().optional(),
  previousObservedAt: z.string().datetime().optional(),
  reasonCode: z.enum([
    'TERRITORY_REQUIRED',
    'PROVIDER_NOT_CONFIGURED',
    'REFRESH_IN_PROGRESS',
    'STORE_UNAVAILABLE',
    'UPSTREAM_UNAVAILABLE',
    'ENRICHMENT_FAILED',
  ]).optional(),
});

const discoveryResponseSchema = z.object({
  success: z.literal(true),
  providers: z.array(musicDiscoveryProviderNameSchema),
  identities: z.array(discoveryIdentitySchema),
  query: musicDiscoverySearchQuerySchema,
  failures: z.array(providerFailureSchema),
  trendCoverage: trendCoverageSchema.optional(),
  acquisitionNotice: z.string().min(1),
});

export class MusicDiscoveryClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MusicDiscoveryClientError';
  }
}

export interface SearchMusicDiscoveryInput extends MusicDiscoverySearchQuery {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface SearchMusicDiscoveryResult extends MusicDiscoverySearchResult {
  acquisitionNotice: string;
}

export async function searchMusicDiscovery({
  signal,
  fetchImpl = fetch,
  ...rawQuery
}: SearchMusicDiscoveryInput): Promise<SearchMusicDiscoveryResult> {
  const parsedQuery = musicDiscoverySearchQuerySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    throw new MusicDiscoveryClientError(
      'INVALID_QUERY',
      parsedQuery.error.issues[0]?.message ?? 'Music discovery query is invalid',
    );
  }

  const searchParams = new URLSearchParams({
    q: parsedQuery.data.term,
    region: parsedQuery.data.territory,
    limit: String(parsedQuery.data.limit),
  });
  for (const language of parsedQuery.data.languages) {
    searchParams.append('language', language);
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `/api/services/editron/music-discovery/search?${searchParams.toString()}`,
      { method: 'GET', signal },
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new MusicDiscoveryClientError(
      aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      aborted ? 'Music search was interrupted' : 'Could not reach music discovery',
      null,
      { cause: error },
    );
  }

  const payload = await readJsonRecord(response);
  if (!response.ok || payload.success !== true) {
    throw new MusicDiscoveryClientError(
      text(payload.code) ?? `HTTP_${response.status}`,
      text(payload.error) ?? `Music discovery failed (${response.status})`,
      response.status,
    );
  }

  const parsedResponse = discoveryResponseSchema.safeParse(payload);
  if (!parsedResponse.success) {
    throw new MusicDiscoveryClientError(
      'INVALID_RESPONSE',
      'Music discovery returned incomplete provider metadata',
      response.status,
      { cause: parsedResponse.error },
    );
  }
  return parsedResponse.data as SearchMusicDiscoveryResult;
}

export function officialPreviewSource(identity: MusicDiscoveryIdentity) {
  return identity.sources.find((source) => source.previewUrl)
    ?? identity.sources.find((source) => source.embedUrl)
    ?? identity.sources[0]
    ?? null;
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
