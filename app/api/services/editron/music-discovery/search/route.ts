import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryProvider,
} from '@/lib/editron/music-discovery/types';
import { YouTubeMusicDiscoveryProvider } from '@/lib/editron/music-discovery/youtube-provider';

export const runtime = 'nodejs';

interface MusicDiscoverySearchDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  provider: MusicDiscoveryProvider;
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

  if (!dependencies.provider.available()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Music discovery is not configured',
        code: 'MUSIC_DISCOVERY_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  try {
    const identities = await dependencies.provider.search(parsed.data);
    return NextResponse.json(
      {
        success: true,
        providers: [dependencies.provider.name],
        identities,
        query: parsed.data,
        acquisitionNotice:
          'Discovery results do not provide downloadable audio. Use an export-cleared provider or supply reference audio.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof MusicDiscoveryProviderError) {
      const mapped = routeErrorFor(error);
      return NextResponse.json(
        { success: false, error: error.message, code: mapped.code },
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
  return handleMusicDiscoverySearch(request, {
    authenticate: auth,
    provider: new YouTubeMusicDiscoveryProvider(),
  });
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
