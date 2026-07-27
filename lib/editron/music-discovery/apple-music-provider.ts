import { z } from 'zod';
import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryIdentity,
  type MusicDiscoveryProvider,
  type MusicDiscoverySearchQuery,
} from './types';

type FetchAppleMusic = (input: URL, init?: RequestInit) => Promise<Response>;

const appleSongSchema = z.object({
  id: z.string().min(1),
  attributes: z.object({
    name: z.string().min(1),
    artistName: z.string().min(1),
    durationInMillis: z.number().int().nonnegative().nullable().optional(),
    artwork: z.object({
      url: z.string().min(1),
    }).optional(),
    previews: z.array(z.object({
      url: z.string().url(),
    })).optional(),
    url: z.string().url().optional(),
    isrc: z.string().optional(),
    contentRating: z.enum(['clean', 'explicit']).optional(),
  }),
});

const appleSearchResponseSchema = z.object({
  results: z.object({
    songs: z.object({
      data: z.array(appleSongSchema),
    }).optional(),
  }),
});

export interface AppleMusicDiscoveryProviderOptions {
  developerToken?: string;
  defaultStorefront?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchAppleMusic;
}

export class AppleMusicDiscoveryProvider implements MusicDiscoveryProvider {
  readonly name = 'apple-music' as const;

  private readonly developerToken?: string;
  private readonly defaultStorefront: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchAppleMusic;

  constructor(options: AppleMusicDiscoveryProviderOptions = {}) {
    this.developerToken = (
      options.developerToken ?? process.env.APPLE_MUSIC_DEVELOPER_TOKEN
    )?.trim() || undefined;
    this.defaultStorefront = (
      options.defaultStorefront
      ?? process.env.APPLE_MUSIC_DEFAULT_STOREFRONT
      ?? 'US'
    ).trim().toUpperCase();
    this.baseUrl = (
      options.baseUrl
      ?? process.env.APPLE_MUSIC_API_BASE_URL
      ?? 'https://api.music.apple.com'
    ).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  available(): boolean {
    return Boolean(this.developerToken);
  }

  async search(input: MusicDiscoverySearchQuery): Promise<MusicDiscoveryIdentity[]> {
    if (!this.developerToken) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'Apple Music discovery is not configured',
      );
    }
    if (!/^[A-Z]{2}$/.test(this.defaultStorefront)) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'Apple Music discovery has an invalid default storefront',
      );
    }

    const parsed = musicDiscoverySearchQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new MusicDiscoveryProviderError(
        'INVALID_QUERY',
        'The music discovery query is invalid',
        undefined,
        undefined,
        { cause: parsed.error },
      );
    }

    const query = parsed.data;
    const storefront = query.territory === 'GLOBAL'
      ? this.defaultStorefront
      : query.territory.toUpperCase();
    const url = new URL(
      `${this.baseUrl}/v1/catalog/${encodeURIComponent(storefront.toLowerCase())}/search`,
    );
    url.searchParams.set('term', query.term);
    url.searchParams.set('types', 'songs');
    url.searchParams.set('limit', String(Math.min(query.limit, 25)));
    if (query.languages[0]) url.searchParams.set('l', query.languages[0]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.developerToken}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw errorForResponse(response);

      const payload = await readJson(response, 'Apple Music');
      const validated = appleSearchResponseSchema.safeParse(payload);
      if (!validated.success) {
        throw new MusicDiscoveryProviderError(
          'UPSTREAM_UNAVAILABLE',
          'Apple Music returned an invalid discovery response',
          response.status,
          undefined,
          {
            cause: validated.error,
            detailCode: 'INVALID_UPSTREAM_RESPONSE',
          },
        );
      }

      return (validated.data.results.songs?.data ?? []).map((song) => toIdentity(song));
    } catch (error) {
      if (error instanceof MusicDiscoveryProviderError) throw error;
      if (isAbortError(error)) {
        throw new MusicDiscoveryProviderError(
          'UPSTREAM_TIMEOUT',
          'Apple Music discovery timed out',
          undefined,
          undefined,
          { cause: error },
        );
      }
      throw new MusicDiscoveryProviderError(
        'UPSTREAM_UNAVAILABLE',
        'Apple Music discovery is unavailable',
        undefined,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

type AppleSong = z.infer<typeof appleSongSchema>;

function toIdentity(song: AppleSong): MusicDiscoveryIdentity {
  const isrc = normalizeIsrc(song.attributes.isrc);
  const previewUrl = song.attributes.previews?.[0]?.url;
  return {
    identityId: isrc ? `isrc:${isrc}` : `apple-music:${song.id}`,
    identityConfidence: isrc ? 'canonical' : 'provider-only',
    title: song.attributes.name,
    artists: [song.attributes.artistName],
    durationMs: song.attributes.durationInMillis ?? null,
    artworkUrl: formatArtworkUrl(song.attributes.artwork?.url),
    explicit: song.attributes.contentRating
      ? song.attributes.contentRating === 'explicit'
      : null,
    isrcs: isrc ? [isrc] : [],
    languages: [],
    sources: [{
      provider: 'apple-music',
      providerId: song.id,
      url: song.attributes.url
        ?? `https://music.apple.com/song/${encodeURIComponent(song.id)}`,
      ...(previewUrl ? { previewUrl } : {}),
      attribution: song.attributes.artistName,
      previewCapability: previewUrl ? 'provider-preview' : 'link-out',
    }],
    trendEvidence: [],
    availability: {
      audioAcquisition: 'not-provided',
      renderEligibility: 'requires-user-reference-upload',
    },
    actions: [
      ...(previewUrl ? ['official-preview' as const] : []),
      'provider-link-out',
      'supply-reference-audio',
      'add-on-platform',
    ],
  };
}

function formatArtworkUrl(value?: string): string | null {
  if (!value) return null;
  return value
    .replaceAll('{w}', '512')
    .replaceAll('{h}', '512')
    .replaceAll('{c}', 'bb')
    .replaceAll('{f}', 'jpg');
}

function normalizeIsrc(value?: string): string | null {
  const normalized = value?.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return normalized && /^[A-Z0-9]{12}$/.test(normalized) ? normalized : null;
}

function errorForResponse(response: Response): MusicDiscoveryProviderError {
  const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
  if (response.status === 401 || response.status === 403) {
    return new MusicDiscoveryProviderError(
      'UPSTREAM_UNAVAILABLE',
      'Apple Music discovery authentication failed',
      response.status,
      undefined,
      { detailCode: 'UPSTREAM_AUTH_FAILED' },
    );
  }
  if (response.status === 429) {
    return new MusicDiscoveryProviderError(
      'UPSTREAM_RATE_LIMITED',
      'Apple Music discovery is rate limited',
      response.status,
      retryAfter,
    );
  }
  return new MusicDiscoveryProviderError(
    'UPSTREAM_UNAVAILABLE',
    'Apple Music discovery is unavailable',
    response.status,
    retryAfter,
  );
}

async function readJson(response: Response, provider: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new MusicDiscoveryProviderError(
      'UPSTREAM_UNAVAILABLE',
      `${provider} returned invalid JSON`,
      response.status,
      undefined,
      {
        cause: error,
        detailCode: 'INVALID_UPSTREAM_RESPONSE',
      },
    );
  }
}

function retryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1_000)) : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
