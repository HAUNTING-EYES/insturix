import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoverySearchQuery,
  type MusicDiscoverySearchResult,
} from '@/lib/editron/music-discovery/types';
import {
  MusicDiscoveryAggregateError,
  MusicDiscoveryAggregator,
} from '@/lib/editron/music-discovery/aggregate-provider';
import { AppleMusicDiscoveryProvider } from '@/lib/editron/music-discovery/apple-music-provider';
import { MusicBrainzDiscoveryProvider } from '@/lib/editron/music-discovery/musicbrainz-provider';
import { YouTubeMusicDiscoveryProvider } from '@/lib/editron/music-discovery/youtube-provider';
import { YouTubeMusicTrendEnricher } from '@/lib/editron/music-discovery/youtube-music-trend-enricher';

export const runtime = 'nodejs';

interface MusicDiscoverySearcher {
  search(query: MusicDiscoverySearchQuery): Promise<MusicDiscoverySearchResult>;
}

interface MusicDiscoverySearchDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  searcher: MusicDiscoverySearcher;
  enrichTrends: (result: MusicDiscoverySearchResult) => Promise<MusicDiscoverySearchResult>;
}

export async function handleMusicDiscoverySearch(
  request: NextRequest,
  dependencies: MusicDiscoverySearchDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const parsed = musicDiscoverySearchQuerySchema.safeParse(
    readSearchQuery(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid music discovery query',
        code: 'INVALID_QUERY',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const discovery = await dependencies.searcher.search(parsed.data);
    const result = await enrichTrendsSafely(discovery, dependencies.enrichTrends);
    return NextResponse.json(
      {
        success: true,
        ...result,
        acquisitionNotice:
          'Discovery results do not provide downloadable audio. Use an export-cleared provider or supply reference audio.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof MusicDiscoveryProviderError) {
      const mapped = routeErrorFor(error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: mapped.code,
          ...(error instanceof MusicDiscoveryAggregateError
            ? { failures: error.failures }
            : {}),
        },
        {
          status: mapped.status,
          headers: error.retryAfterSeconds !== undefined
            ? { 'retry-after': String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }

    console.error('[MusicDiscoverySearch] Unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { success: false, error: 'Music discovery failed', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const searcher = new MusicDiscoveryAggregator([
    new AppleMusicDiscoveryProvider(),
    new YouTubeMusicDiscoveryProvider(),
    new MusicBrainzDiscoveryProvider(),
  ]);
  const trendEnricher = new YouTubeMusicTrendEnricher();
  return handleMusicDiscoverySearch(request, {
    authenticate: auth,
    searcher,
    enrichTrends: (result) => trendEnricher.enrich(result),
  });
}

async function enrichTrendsSafely(
  result: MusicDiscoverySearchResult,
  enrichTrends: MusicDiscoverySearchDependencies['enrichTrends'],
): Promise<MusicDiscoverySearchResult> {
  try {
    return await enrichTrends(result);
  } catch (error) {
    console.error('[MusicDiscoverySearch] Trend enrichment failed', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return {
      ...result,
      trendCoverage: {
        status: 'unavailable',
        source: 'youtube-most-popular-music',
        territory: result.query.territory === 'GLOBAL' ? null : result.query.territory,
        requestedLanguages: [...result.query.languages],
        matchedIdentityCount: 0,
        reasonCode: 'ENRICHMENT_FAILED',
      },
    };
  }
}

function readSearchQuery(searchParams: URLSearchParams): Record<string, unknown> {
  const territory = optionalText(
    searchParams.get('territory') ?? searchParams.get('region'),
  )?.toUpperCase() ?? 'GLOBAL';
  return {
    term: optionalText(searchParams.get('term') ?? searchParams.get('q')),
    territory,
    languages: searchParams
      .getAll('language')
      .map((language) => language.trim())
      .filter(Boolean),
    limit: optionalNumber(searchParams.get('limit')) ?? 20,
  };
}

function optionalText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  return Number(value);
}

function routeErrorFor(error: MusicDiscoveryProviderError): {
  status: number;
  code: string;
} {
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return { status: 503, code: 'MUSIC_DISCOVERY_NOT_CONFIGURED' };
    case 'INVALID_QUERY':
      return { status: 400, code: 'INVALID_QUERY' };
    case 'UPSTREAM_RATE_LIMITED':
      return { status: 503, code: 'MUSIC_DISCOVERY_RATE_LIMITED' };
    case 'UPSTREAM_TIMEOUT':
      return { status: 504, code: 'MUSIC_DISCOVERY_TIMEOUT' };
    case 'UPSTREAM_UNAVAILABLE':
      return { status: 502, code: 'MUSIC_DISCOVERY_UNAVAILABLE' };
  }
}
