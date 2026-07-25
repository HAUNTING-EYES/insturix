import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  MusicCatalogProviderError,
  musicCatalogSearchQuerySchema,
  type MusicCatalogProvider,
} from '@/lib/editron/music-catalog/types';

export const runtime = 'nodejs';

interface MusicCatalogSearchDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  provider: MusicCatalogProvider;
}

export async function handleMusicCatalogSearch(
  request: NextRequest,
  dependencies: MusicCatalogSearchDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const parsedQuery = musicCatalogSearchQuerySchema.safeParse(
    readSearchQuery(request.nextUrl.searchParams),
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid music catalog query',
        code: 'INVALID_QUERY',
        issues: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (!dependencies.provider.available()) {
    return NextResponse.json(
      {
        success: false,
        error: 'The music catalog is not configured',
        code: 'MUSIC_CATALOG_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  try {
    const result = await dependencies.provider.search(parsedQuery.data);
    return NextResponse.json(
      {
        success: true,
        ...result,
        rightsNotice:
          'Catalog results are previews only until provider entitlement, controlled ingest, and a library-license receipt succeed.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof MusicCatalogProviderError) {
      const { status, code } = routeErrorFor(error);
      console.warn('[MusicCatalogSearch] Provider request failed', {
        code: error.code,
        providerStatus: error.providerStatus,
      });
      return NextResponse.json(
        { success: false, error: error.message, code },
        {
          status,
          headers:
            error.retryAfterSeconds !== undefined
              ? { 'retry-after': String(error.retryAfterSeconds) }
              : undefined,
        },
      );
    }

    console.error('[MusicCatalogSearch] Unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Music catalog search failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleMusicCatalogSearch(request, {
    authenticate: auth,
    provider: new EpidemicMusicCatalogProvider(),
  });
}

function readSearchQuery(searchParams: URLSearchParams): Record<string, unknown> {
  return {
    term: optionalText(searchParams.get('term') ?? searchParams.get('q')),
    genres: searchParams.getAll('genre'),
    moods: searchParams.getAll('mood'),
    vocalTypes: searchParams.getAll('vocalType').map((value) => value.toLowerCase()),
    bpmMin: optionalNumber(searchParams.get('bpmMin')),
    bpmMax: optionalNumber(searchParams.get('bpmMax')),
    limit: optionalNumber(searchParams.get('limit')) ?? 20,
    offset: optionalNumber(searchParams.get('offset')) ?? 0,
    sort: optionalText(searchParams.get('sort')) ?? 'Relevance',
    order: optionalText(searchParams.get('order')) ?? 'asc',
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

function routeErrorFor(error: MusicCatalogProviderError): {
  status: number;
  code: string;
} {
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return { status: 503, code: 'MUSIC_CATALOG_NOT_CONFIGURED' };
    case 'INVALID_QUERY':
      return { status: 400, code: 'INVALID_QUERY' };
    case 'UPSTREAM_TIMEOUT':
      return { status: 504, code: 'MUSIC_CATALOG_TIMEOUT' };
    case 'UPSTREAM_RATE_LIMITED':
      return { status: 503, code: 'MUSIC_CATALOG_RATE_LIMITED' };
    case 'UPSTREAM_UNAUTHORIZED':
    case 'UPSTREAM_FORBIDDEN':
      return { status: 502, code: 'MUSIC_CATALOG_AUTH_FAILED' };
    case 'INVALID_UPSTREAM_RESPONSE':
      return { status: 502, code: 'MUSIC_CATALOG_INVALID_RESPONSE' };
    case 'UPSTREAM_UNAVAILABLE':
      return { status: 502, code: 'MUSIC_CATALOG_UNAVAILABLE' };
  }
}
