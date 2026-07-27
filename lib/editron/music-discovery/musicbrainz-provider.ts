import { z } from 'zod';
import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryIdentity,
  type MusicDiscoveryProvider,
  type MusicDiscoverySearchQuery,
} from './types';

type FetchMusicBrainz = (input: URL, init?: RequestInit) => Promise<Response>;

const recordingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  length: z.number().int().nonnegative().nullable().optional(),
  isrcs: z.array(z.string()).optional(),
  'artist-credit': z.array(z.object({
    name: z.string().optional(),
    artist: z.object({
      name: z.string().optional(),
    }).optional(),
  })).optional(),
});

const musicBrainzSearchResponseSchema = z.object({
  recordings: z.array(recordingSchema).optional(),
});

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

export interface MusicBrainzDiscoveryProviderOptions {
  userAgent?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchMusicBrainz;
}

export class MusicBrainzDiscoveryProvider implements MusicDiscoveryProvider {
  readonly name = 'musicbrainz' as const;

  private readonly userAgent?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchMusicBrainz;

  constructor(options: MusicBrainzDiscoveryProviderOptions = {}) {
    this.userAgent = (
      options.userAgent ?? process.env.MUSICBRAINZ_USER_AGENT
    )?.trim() || undefined;
    this.baseUrl = (
      options.baseUrl
      ?? process.env.MUSICBRAINZ_API_BASE_URL
      ?? 'https://musicbrainz.org/ws/2'
    ).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  available(): boolean {
    return Boolean(this.userAgent);
  }

  async search(input: MusicDiscoverySearchQuery): Promise<MusicDiscoveryIdentity[]> {
    if (!this.userAgent) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'MusicBrainz discovery is not configured',
      );
    }
    if (!isMeaningfulUserAgent(this.userAgent)) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'MusicBrainz discovery requires an identifying User-Agent with contact information',
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
    const userAgent = this.userAgent;
    const url = new URL('recording', `${this.baseUrl}/`);
    url.searchParams.set('query', query.term);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', String(query.limit));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await scheduleRequest(() => this.fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': userAgent,
          },
          signal: controller.signal,
        }));
      if (!response.ok) throw errorForResponse(response);

      const payload = await readJson(response);
      const validated = musicBrainzSearchResponseSchema.safeParse(payload);
      if (!validated.success) {
        throw new MusicDiscoveryProviderError(
          'UPSTREAM_UNAVAILABLE',
          'MusicBrainz returned an invalid discovery response',
          response.status,
          undefined,
          {
            cause: validated.error,
            detailCode: 'INVALID_UPSTREAM_RESPONSE',
          },
        );
      }

      return (validated.data.recordings ?? []).map(toIdentity);
    } catch (error) {
      if (error instanceof MusicDiscoveryProviderError) throw error;
      if (isAbortError(error)) {
        throw new MusicDiscoveryProviderError(
          'UPSTREAM_TIMEOUT',
          'MusicBrainz discovery timed out',
          undefined,
          undefined,
          { cause: error },
        );
      }
      throw new MusicDiscoveryProviderError(
        'UPSTREAM_UNAVAILABLE',
        'MusicBrainz discovery is unavailable',
        undefined,
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

type MusicBrainzRecording = z.infer<typeof recordingSchema>;

function toIdentity(recording: MusicBrainzRecording): MusicDiscoveryIdentity {
  const isrcs = [...new Set(
    (recording.isrcs ?? [])
      .map(normalizeIsrc)
      .filter((value): value is string => Boolean(value)),
  )].sort();
  const artists = [...new Set(
    (recording['artist-credit'] ?? [])
      .map((credit) => credit.name ?? credit.artist?.name)
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => value.trim()),
  )];

  return {
    identityId: isrcs[0] ? `isrc:${isrcs[0]}` : `musicbrainz:${recording.id}`,
    identityConfidence: 'canonical',
    title: recording.title,
    artists,
    durationMs: recording.length ?? null,
    artworkUrl: null,
    explicit: null,
    isrcs,
    languages: [],
    sources: [{
      provider: 'musicbrainz',
      providerId: recording.id,
      url: `https://musicbrainz.org/recording/${encodeURIComponent(recording.id)}`,
      ...(artists[0] ? { attribution: artists.join(', ') } : {}),
      previewCapability: 'link-out',
    }],
    trendEvidence: [],
    availability: {
      audioAcquisition: 'not-provided',
      renderEligibility: 'requires-user-reference-upload',
    },
    actions: [
      'provider-link-out',
      'supply-reference-audio',
      'add-on-platform',
    ],
  };
}

function normalizeIsrc(value: string): string | null {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{12}$/.test(normalized) ? normalized : null;
}

function isMeaningfulUserAgent(value: string): boolean {
  return /^[^/\s]+\/[^\s]+\s+\((?:https?:\/\/|mailto:|[^@\s]+@)[^)]+\)$/i.test(value);
}

async function scheduleRequest<T>(request: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextRequestAt = Date.now() + 1_000;
    return request();
  });
  requestQueue = run.then(() => undefined, () => undefined);
  return run;
}

function errorForResponse(response: Response): MusicDiscoveryProviderError {
  const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
  if (response.status === 401 || response.status === 403) {
    return new MusicDiscoveryProviderError(
      'UPSTREAM_UNAVAILABLE',
      'MusicBrainz discovery authentication failed',
      response.status,
      undefined,
      { detailCode: 'UPSTREAM_AUTH_FAILED' },
    );
  }
  if (response.status === 429 || response.status === 503) {
    return new MusicDiscoveryProviderError(
      'UPSTREAM_RATE_LIMITED',
      'MusicBrainz discovery is rate limited',
      response.status,
      retryAfter,
    );
  }
  return new MusicDiscoveryProviderError(
    'UPSTREAM_UNAVAILABLE',
    'MusicBrainz discovery is unavailable',
    response.status,
    retryAfter,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new MusicDiscoveryProviderError(
      'UPSTREAM_UNAVAILABLE',
      'MusicBrainz returned invalid JSON',
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
