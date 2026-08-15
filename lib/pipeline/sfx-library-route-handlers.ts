import { NextRequest, NextResponse } from 'next/server';

import { SfxLibraryIngestError, type SFXLibraryResult } from '@/lib/pipeline/sfx-library-service';

const MAX_REQUEST_BODY_BYTES = 4 * 1024;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;
const MAX_QUERY_LENGTH = 120;
const SPOT_SFX_MAX_DURATION_SEC = 12;
const AMBIENT_SFX_MAX_DURATION_SEC = 30;
const FREESOUND_TIMEOUT_MS = 8_000;
const CC0_LICENSE_ID = 'CC0-1.0';
const CC0_LICENSE_URL = 'https://creativecommons.org/publicdomain/zero/1.0/';
const AMBIENT_QUERY =
  /\b(ambient|ambience|atmosphere|background|city|crowd|fire|forest|nature|ocean|rain|river|room tone|traffic|water|waves|wind)\b/i;

export interface SfxLibraryIngestRouteDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  ingest: (providerAssetId: string, userId: string) => Promise<SFXLibraryResult>;
}

export interface SfxLibrarySearchRouteDependencies {
  authenticate: () => Promise<{ userId: string | null }>;
  apiKey?: string;
  fetchImpl: typeof fetch;
}

interface FreesoundSearchItem {
  id?: unknown;
  name?: unknown;
  duration?: unknown;
  previews?: unknown;
  license?: unknown;
  tags?: unknown;
}
export interface SfxLibraryBrowseResult {
  providerAssetId: string;
  title: string;
  url: string;
  duration: number;
  source: 'Freesound';
  tags: string[];
  license: typeof CC0_LICENSE_ID;
  licenseUrl: typeof CC0_LICENSE_URL;
  attributionRequired: false;
  renderEligibility: 'requires-controlled-ingest';
}

export async function handleSfxLibraryIngest(
  request: NextRequest,
  dependencies: SfxLibraryIngestRouteDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: 'Request body is too large',
          code: 'REQUEST_TOO_LARGE',
        },
        { status: 413 },
      );
    }
    const parsed: unknown = text.trim() ? JSON.parse(text) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('Request body must be a JSON object');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Request body must be a valid JSON object',
        code: 'INVALID_REQUEST',
      },
      { status: 400 },
    );
  }
  if (typeof body.providerAssetId !== 'string' || !body.providerAssetId.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: 'A provider asset ID is required',
        code: 'SFX_INVALID_PROVIDER_ASSET_ID',
      },
      { status: 400 },
    );
  }
  try {
    const result = await dependencies.ingest(body.providerAssetId, userId);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof SfxLibraryIngestError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    console.error('[SFXLibraryIngestRoute] Unexpected failure', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Sound ingest failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    );
  }
}

export async function handleSfxLibrarySearch(
  request: NextRequest,
  dependencies: SfxLibrarySearchRouteDependencies,
) {
  const { userId } = await dependencies.authenticate();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = parsePositiveInteger(request.nextUrl.searchParams.get('limit'));
  if (!query || query.length > MAX_QUERY_LENGTH || limit === null || limit > MAX_LIMIT) {
    return NextResponse.json(
      { success: false, error: 'Invalid SFX search query', code: 'INVALID_QUERY' },
      { status: 400 },
    );
  }

  if (!dependencies.apiKey?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: 'The SFX catalog is not configured',
        code: 'SFX_CATALOG_NOT_CONFIGURED',
      },
      { status: 503 },
    );
  }

  const maxDurationSec = resolveBrowseMaxDurationSec(query);
  const params = new URLSearchParams({
    query,
    token: dependencies.apiKey.trim(),
    fields: 'id,name,duration,previews,license,tags,avg_rating',
    filter: `license:"Creative Commons 0" duration:[0 TO ${maxDurationSec}]`,
    page_size: String(Math.min(limit * 2, 40)),
    sort: 'rating_desc',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FREESOUND_TIMEOUT_MS);

  try {
    const response = await dependencies.fetchImpl(
      `https://freesound.org/apiv2/search/text/?${params}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      console.warn('[SFXLibrarySearch] Freesound request failed', {
        status: response.status,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'The SFX catalog is temporarily unavailable',
          code: 'SFX_PROVIDER_UNAVAILABLE',
        },
        { status: 502 },
      );
    }

    const payload = await response.json() as { results?: unknown };
    const rawResults = Array.isArray(payload.results) ? payload.results : [];
    const results = rawResults
      .map((item) => normalizeFreesoundResult(item, query, maxDurationSec))
      .filter((item): item is SfxLibraryBrowseResult => item !== null)
      .slice(0, limit);

    return NextResponse.json(
      {
        success: true,
        results,
        policy: {
          license: CC0_LICENSE_ID,
          attributionRequired: false,
          maxDurationSec,
          renderEligibility: 'requires-controlled-ingest',
        },
        rightsNotice:
          'Search results are verified CC0 previews. Export requires controlled server-side ingest.',
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    console.warn('[SFXLibrarySearch] Freesound request failed', {
      reason: timedOut ? 'timeout' : 'network-error',
    });
    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? 'The SFX catalog timed out'
          : 'The SFX catalog is temporarily unavailable',
        code: timedOut ? 'SFX_PROVIDER_TIMEOUT' : 'SFX_PROVIDER_UNAVAILABLE',
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveBrowseMaxDurationSec(query: string): number {
  return AMBIENT_QUERY.test(query)
    ? AMBIENT_SFX_MAX_DURATION_SEC
    : SPOT_SFX_MAX_DURATION_SEC;
}

function normalizeFreesoundResult(
  value: unknown,
  query: string,
  maxDurationSec: number,
): SfxLibraryBrowseResult | null {
  if (!isRecord(value) || !isVerifiedCc0(value.license)) return null;

  const item = value as FreesoundSearchItem;
  const providerAssetId = stringValue(item.id);
  const previews = isRecord(item.previews) ? item.previews : {};
  const url =
    stringValue(previews['preview-hq-mp3'])
    ?? stringValue(previews['preview-lq-mp3']);
  const duration = finitePositiveNumber(item.duration);
  if (!providerAssetId || !url || duration === null || duration > maxDurationSec) {
    return null;
  }

  return {
    providerAssetId,
    title: stringValue(item.name) ?? query,
    url,
    duration: Math.round(duration * 10) / 10,
    source: 'Freesound',
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
    license: CC0_LICENSE_ID,
    licenseUrl: CC0_LICENSE_URL,
    attributionRequired: false,
    renderEligibility: 'requires-controlled-ingest',
  };
}

function isVerifiedCc0(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'creative commons 0'
    || normalized === 'cc0'
    || normalized.includes('publicdomain/zero/1.0');
}

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finitePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}
