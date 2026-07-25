import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  MusicCatalogProviderError,
  musicCatalogSearchQuerySchema,
  type MusicCatalogProvider,
  type MusicCatalogSearchQuery,
} from '@/lib/editron/music-catalog/types';

export const runtime = 'nodejs';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const MAX_RECOMMENDATION_TERM_LENGTH = 200;

interface MusicCatalogSearchDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  provider: MusicCatalogProvider;
  loadProject?: (userId: string, projectId: string) => Promise<unknown | null>;
}

export interface ProjectMusicDirection {
  term: string;
  evidenceSources: string[];
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

  const discoveryMode = optionalText(request.nextUrl.searchParams.get('mode')) ?? 'search';
  const projectId = optionalText(request.nextUrl.searchParams.get('projectId'));
  if (
    !['search', 'recommend'].includes(discoveryMode)
    || (
      discoveryMode === 'recommend'
      && (!projectId || !PROJECT_ID_PATTERN.test(projectId))
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'Recommendation mode requires a valid projectId',
        code: 'INVALID_QUERY',
      },
      { status: 400 },
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
    let searchQuery: MusicCatalogSearchQuery = parsedQuery.data;
    let direction: ProjectMusicDirection | null = null;

    if (discoveryMode === 'recommend') {
      if (!dependencies.loadProject) {
        throw new Error('Project-aware music recommendation is not configured');
      }
      const project = await dependencies.loadProject(userId, projectId as string);
      if (!project) {
        return NextResponse.json(
          {
            success: false,
            error: 'Project not found or access denied',
            code: 'PROJECT_NOT_FOUND',
          },
          { status: 404 },
        );
      }
      direction = deriveProjectMusicDirection(project);
      if (!direction) {
        return NextResponse.json(
          {
            success: false,
            error: 'This project has no stored music direction to recommend from',
            code: 'MUSIC_DIRECTION_UNAVAILABLE',
          },
          { status: 422 },
        );
      }
      searchQuery = {
        ...parsedQuery.data,
        term: direction.term,
        offset: 0,
        sort: 'Relevance',
        order: 'asc',
      };
    }

    const result = await dependencies.provider.search(searchQuery);
    return NextResponse.json(
      {
        success: true,
        ...result,
        ...(direction
          ? {
              recommendation: {
                providerTrackId: result.tracks[0]?.providerTrackId ?? null,
                query: direction.term,
                evidenceSources: direction.evidenceSources,
                selectionAuthority: 'SUGGESTS',
                licensingAuthority: 'NEVER_AUTOMATED',
                requiresExplicitUse: true,
              },
            }
          : {}),
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
    loadProject: async (userId, projectId) => {
      const { projectService } = await import('@/lib/editron/services/project-service');
      return projectService.loadProject(userId, projectId);
    },
  });
}

export function deriveProjectMusicDirection(project: unknown): ProjectMusicDirection | null {
  const candidates: Array<{ path: string; value: unknown }> = [
    {
      path: 'project.editorialPreferences.musicPrompt',
      value: valueAtPath(project, ['editorialPreferences', 'musicPrompt']),
    },
    {
      path: 'project.productionBrief.editorialPreferences.musicPrompt',
      value: valueAtPath(project, ['productionBrief', 'editorialPreferences', 'musicPrompt']),
    },
    {
      path: 'project.productionBriefIntake.editorialPreferences.musicPrompt',
      value: valueAtPath(project, ['productionBriefIntake', 'editorialPreferences', 'musicPrompt']),
    },
    {
      path: 'project.creativeBrief.editorialPreferences.musicPrompt',
      value: valueAtPath(project, ['creativeBrief', 'editorialPreferences', 'musicPrompt']),
    },
    {
      path: 'project.syntheticStoryboard.overallMusicPrompt',
      value: valueAtPath(project, ['syntheticStoryboard', 'overallMusicPrompt']),
    },
    {
      path: 'project.referenceEditDNA.musicStyle.genre',
      value: valueAtPath(project, ['referenceEditDNA', 'musicStyle', 'genre']),
    },
    {
      path: 'project.referenceEditDNA.musicStyle.tempo',
      value: valueAtPath(project, ['referenceEditDNA', 'musicStyle', 'tempo']),
    },
    {
      path: 'project.referenceEditDNA.musicStyle.energyLevel',
      value: valueAtPath(project, ['referenceEditDNA', 'musicStyle', 'energyLevel']),
    },
  ];
  const parts: string[] = [];
  const evidenceSources: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const text = cleanRecommendationText(candidate.value);
    if (!text || seen.has(text.toLowerCase())) continue;
    const separator = parts.length > 0 ? ', ' : '';
    const remaining = MAX_RECOMMENDATION_TERM_LENGTH
      - parts.join(', ').length
      - separator.length;
    if (remaining <= 0) break;
    parts.push(text.slice(0, remaining));
    evidenceSources.push(candidate.path);
    seen.add(text.toLowerCase());
  }

  const term = parts.join(', ').trim();
  return term ? { term, evidenceSources } : null;
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

function cleanRecommendationText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

function valueAtPath(value: unknown, path: string[]): unknown {
  let cursor = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
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
