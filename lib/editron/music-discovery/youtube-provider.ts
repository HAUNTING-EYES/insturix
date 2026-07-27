import {
  searchYouTubeVideos,
  type YouTubeVideoSearchQuery,
  type YouTubeVideoSearchResult,
} from '@/lib/trends/fetchers/youtube-search';
import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryIdentity,
  type MusicDiscoveryProvider,
  type MusicDiscoverySearchQuery,
} from './types';

type SearchVideos = (query: YouTubeVideoSearchQuery) => Promise<YouTubeVideoSearchResult[]>;

export interface YouTubeMusicDiscoveryProviderOptions {
  apiKey?: string;
  searchVideos?: SearchVideos;
}

export class YouTubeMusicDiscoveryProvider implements MusicDiscoveryProvider {
  readonly name = 'youtube' as const;

  private readonly apiKey?: string;
  private readonly searchVideos: SearchVideos;

  constructor(options: YouTubeMusicDiscoveryProviderOptions = {}) {
    this.apiKey = (options.apiKey ?? process.env.YOUTUBE_API_KEY)?.trim() || undefined;
    this.searchVideos = options.searchVideos ?? searchYouTubeVideos;
  }

  available(): boolean {
    return Boolean(this.apiKey);
  }

  async search(input: MusicDiscoverySearchQuery): Promise<MusicDiscoveryIdentity[]> {
    if (!this.apiKey) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'YouTube music discovery is not configured',
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

    try {
      const query = parsed.data;
      const results = await this.searchVideos({
        query: query.term,
        limit: query.limit,
        apiKey: this.apiKey,
        videoCategoryId: '10',
        includeContentDetails: true,
        ...(query.territory !== 'GLOBAL' ? { regionCode: query.territory.toUpperCase() } : {}),
        ...(query.languages[0] ? { relevanceLanguage: query.languages[0] } : {}),
      });
      return results.map(toMusicIdentity);
    } catch (error) {
      if (error instanceof MusicDiscoveryProviderError) throw error;
      const status = providerStatus(error);
      if (status === 429) {
        throw new MusicDiscoveryProviderError(
          'UPSTREAM_RATE_LIMITED',
          'YouTube music discovery is rate limited',
          status,
          undefined,
          { cause: error },
        );
      }
      throw new MusicDiscoveryProviderError(
        'UPSTREAM_UNAVAILABLE',
        'YouTube music discovery is unavailable',
        status,
        undefined,
        { cause: error },
      );
    }
  }
}

function toMusicIdentity(video: YouTubeVideoSearchResult): MusicDiscoveryIdentity {
  const canEmbed = video.embeddable !== false;
  return {
    identityId: `youtube:${video.videoId}`,
    identityConfidence: 'provider-only',
    title: video.title,
    artists: video.channelTitle ? [video.channelTitle] : [],
    durationMs: video.durationMs,
    artworkUrl: video.thumbnailUrl,
    explicit: null,
    isrcs: [],
    languages: [],
    sources: [{
      provider: 'youtube',
      providerId: video.videoId,
      url: video.url,
      ...(canEmbed ? { embedUrl: video.embedUrl } : {}),
      ...(video.channelTitle ? { attribution: video.channelTitle } : {}),
      previewCapability: canEmbed ? 'official-embed' : 'link-out',
    }],
    trendEvidence: [],
    availability: {
      audioAcquisition: 'not-provided',
      renderEligibility: 'requires-user-reference-upload',
    },
    actions: [
      ...(canEmbed ? ['official-preview' as const] : []),
      'provider-link-out',
      'supply-reference-audio',
      'add-on-platform',
    ],
  };
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === 'number' ? response.status : undefined;
}
