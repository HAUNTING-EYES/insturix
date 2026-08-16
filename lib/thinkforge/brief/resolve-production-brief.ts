import {
  resolveProductionBrief,
  type BrandDefaults,
  type IntakeSignals,
} from '@/lib/editron/production-brief/intake-resolver';
import type {
  AspectRatio,
  Platform,
  ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';
import type { ProjectMeta } from '@/lib/thinkforge/state/types';
import { applyTrendSpecToBrief } from './apply-trend-spec';
import {
  ThinkForgeAuthoringRequestSchema,
  describeThinkForgeAuthoringDeliverable,
  type ThinkForgeAuthoringRequest,
} from '@/lib/thinkforge/schemas/authoring-request';

type ProjectRecord = Record<string, unknown>;

export interface ThinkForgeProductionBriefInput {
  userPrompt: string;
  project?: ProjectMeta | null;
  authoringRequest?: ThinkForgeAuthoringRequest | null;
  requested?: IntakeSignals['requested'];
  documentType?: string | null;
  contentPath?: string | null;
  brandId?: string | null;
  trendSpec?: unknown | null;
}

const PLATFORM_VALUES = new Set<Platform>([
  'tiktok',
  'instagram-reels',
  'youtube-shorts',
  'instagram-feed',
  'youtube',
  'linkedin',
  'x',
  'unspecified',
]);

const PLATFORM_ALIASES: Record<string, Platform> = {
  instagram: 'instagram-feed',
  'instagram post': 'instagram-feed',
  'instagram feed': 'instagram-feed',
  reel: 'instagram-reels',
  reels: 'instagram-reels',
  'instagram reel': 'instagram-reels',
  'instagram reels': 'instagram-reels',
  shorts: 'youtube-shorts',
  'youtube short': 'youtube-shorts',
  'youtube shorts': 'youtube-shorts',
  twitter: 'x',
};

const ASPECT_RATIOS = new Set<AspectRatio>(['16:9', '9:16', '1:1', '4:5']);

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function firstPresent(project: ProjectMeta | null | undefined, keys: readonly string[]): unknown {
  const source = (project ?? {}) as ProjectRecord;
  const preferences = (project?.preferences ?? {}) as ProjectRecord;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  for (const key of keys) {
    if (preferences[key] !== undefined && preferences[key] !== null) return preferences[key];
  }
  return undefined;
}

/**
 * A selected trend becomes generation input only after its authorized reference
 * has been analysed. Browser candidates, queued jobs, and failed jobs remain
 * planning context, not writer instructions.
 */
function completedSelectedTrendSpec(project: ProjectMeta | null | undefined): unknown {
  const analysis = project?.selectedTrend?.analysis;
  return analysis?.status === 'completed' ? analysis.trendSpec : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function resolveThinkForgeAuthoringPrompt(
  effectivePrompt: string,
  project: ProjectMeta | null | undefined,
  isInitialDraft: boolean,
): string {
  const originalPrompt = firstString((project as ProjectRecord | null | undefined)?.originalPrompt);
  return isInitialDraft && originalPrompt ? originalPrompt : effectivePrompt;
}

function normalizePlatform(value: unknown): Platform | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (PLATFORM_VALUES.has(raw as Platform)) return raw as Platform;
  return PLATFORM_ALIASES[normalizedKey(raw)];
}

function normalizePlatformList(value: unknown): Platform[] | undefined {
  const rawValues = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const platforms = rawValues
    .map(normalizePlatform)
    .filter((platform): platform is Platform => Boolean(platform));
  return platforms.length > 0 ? Array.from(new Set(platforms)) : undefined;
}

function normalizeAspectRatio(value: unknown): AspectRatio | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return ASPECT_RATIOS.has(trimmed as AspectRatio) ? (trimmed as AspectRatio) : undefined;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeCount(value: unknown): number | undefined {
  const parsed = normalizePositiveNumber(value);
  return parsed === undefined ? undefined : Math.max(1, Math.floor(parsed));
}

function normalizeStringList(value: unknown): string[] | undefined {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = Array.from(
    new Set(
      rawValues
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function buildRequested(project?: ProjectMeta | null): IntakeSignals['requested'] | undefined {
  const requested: NonNullable<IntakeSignals['requested']> = {};
  const platform = normalizePlatform(firstPresent(project, ['platform', 'outputPlatform', 'targetPlatform']));
  const aspectRatio = normalizeAspectRatio(firstPresent(project, ['aspectRatio', 'ratio', 'outputAspectRatio']));
  const targetDurationSec = normalizePositiveNumber(
    firstPresent(project, ['targetDurationSec', 'durationSec', 'durationSeconds', 'duration']),
  );
  const count = normalizeCount(firstPresent(project, ['count', 'outputCount', 'deliverableCount']));
  const voiceLanguages = normalizeStringList(firstPresent(project, ['voiceLanguages', 'voLanguages', 'voiceLanguage']));
  const captionLanguages = normalizeStringList(
    firstPresent(project, ['captionLanguages', 'subtitleLanguages', 'captionLanguage']),
  );
  const deliverables = normalizeStringList(firstPresent(project, ['deliverables', 'outputs', 'requestedDeliverables']));

  if (platform) requested.platform = platform;
  if (aspectRatio) requested.aspectRatio = aspectRatio;
  if (targetDurationSec !== undefined) requested.targetDurationSec = targetDurationSec;
  if (count !== undefined) requested.count = count;
  if (voiceLanguages) requested.voiceLanguages = voiceLanguages;
  if (captionLanguages) requested.captionLanguages = captionLanguages;
  if (deliverables) requested.deliverables = deliverables;

  const intent = firstString(project?.purpose, project?.idea, project?.title, project?.projectName);
  if (intent) requested.intent = intent;

  return Object.keys(requested).length > 0 ? requested : undefined;
}

function resolveAuthoringRequest(input: ThinkForgeProductionBriefInput): ThinkForgeAuthoringRequest | null {
  const provided = input.authoringRequest
    ? ThinkForgeAuthoringRequestSchema.parse(input.authoringRequest)
    : null;
  const persisted = input.project?.authoringRequest
    ? ThinkForgeAuthoringRequestSchema.parse(input.project.authoringRequest)
    : null;
  if (provided && persisted && JSON.stringify(provided) !== JSON.stringify(persisted)) {
    throw new Error('Production brief received conflicting authoring requests');
  }
  return provided ?? persisted;
}

function productionPlatformForAuthoringRequest(
  request: ThinkForgeAuthoringRequest,
): Platform | undefined {
  switch (request.platformSurface.id) {
    case 'instagram':
      return request.contentContract.outputKind === 'video_script'
        ? 'instagram-reels'
        : 'instagram-feed';
    case 'youtube':
      return 'youtube';
    case 'tiktok':
      return 'tiktok';
    case 'linkedin':
      return 'linkedin';
    case 'x':
      return 'x';
    default:
      return undefined;
  }
}

function buildAuthoringRequested(
  request: ThinkForgeAuthoringRequest,
): IntakeSignals['requested'] {
  const platform = productionPlatformForAuthoringRequest(request);
  return {
    ...(platform ? { platform } : {}),
    ...(request.targetDurationSec !== undefined
      ? { targetDurationSec: request.targetDurationSec }
      : {}),
  };
}

function mergeRequested(
  project?: ProjectMeta | null,
  explicit?: IntakeSignals['requested'],
  authoringRequest?: ThinkForgeAuthoringRequest | null,
): IntakeSignals['requested'] | undefined {
  const requested: NonNullable<IntakeSignals['requested']> = {
    ...(buildRequested(project) ?? {}),
  };

  for (const [key, value] of Object.entries(explicit ?? {})) {
    if (value !== undefined) {
      (requested as Record<string, unknown>)[key] = value;
    }
  }

  if (authoringRequest) {
    delete requested.platform;
    delete requested.targetDurationSec;
    Object.assign(requested, buildAuthoringRequested(authoringRequest));
  }

  return Object.keys(requested).length > 0 ? requested : undefined;
}

function buildBrandDefaults(project?: ProjectMeta | null): BrandDefaults | null {
  const preferredPlatform = normalizePlatform(firstPresent(project, ['preferredPlatform']));
  const preferredAspectRatio = normalizeAspectRatio(firstPresent(project, ['preferredAspectRatio']));
  const defaultDurationSec = normalizePositiveNumber(firstPresent(project, ['defaultDurationSec']));
  const tone = firstString(firstPresent(project, ['tone']));
  const style = firstString(firstPresent(project, ['style']));
  const vibe: Record<string, number | string> = {};
  if (tone) vibe.tone = tone;
  if (style) vibe.style = style;

  if (!preferredPlatform && !preferredAspectRatio && defaultDurationSec === undefined && Object.keys(vibe).length === 0) {
    return null;
  }

  return {
    ...(preferredPlatform ? { preferredPlatform } : {}),
    ...(preferredAspectRatio ? { preferredAspectRatio } : {}),
    ...(defaultDurationSec !== undefined ? { defaultDurationSec } : {}),
    ...(Object.keys(vibe).length > 0 ? { vibe } : {}),
  };
}

export function resolveThinkForgeProductionBrief(input: ThinkForgeProductionBriefInput): ProductionBrief {
  const project = input.project ?? null;
  const authoringRequest = resolveAuthoringRequest(input);
  const brandId = firstString(input.brandId, project?.brandId);
  const brand = buildBrandDefaults(project);
  const brief = resolveProductionBrief({
    entryPoint: 'thinkforge',
    assetCount: 0,
    totalDurationSec: null,
    contentType: authoringRequest
      ? describeThinkForgeAuthoringDeliverable(authoringRequest)
      : firstString(project?.format, input.documentType, input.contentPath) ?? null,
    speechCoverage: null,
    // A brand attachment is a server-authorized Brand Vault identity, never a
    // legacy browser snapshot that happened to contain free-text context.
    hasBrand: Boolean(brandId),
    connectedPlatforms: normalizePlatformList(firstPresent(project, ['connectedPlatforms', 'postingPlatforms'])),
    brand,
    prompt: input.userPrompt,
    requested: mergeRequested(project, input.requested, authoringRequest),
  });

  const resolvedBrief = {
    ...brief,
    brand: brandId ? { brandId } : brief.brand,
  };
  // An explicit caller-supplied spec wins, then the current session's analysed
  // selection. The latter must beat legacy preferences so a stale prior trend
  // cannot silently steer a new request.
  const trendSpec = input.trendSpec
    ?? completedSelectedTrendSpec(project)
    ?? firstPresent(project, ['trendSpec']);

  return trendSpec
    ? applyTrendSpecToBrief({ brief: resolvedBrief, trendSpec })
    : resolvedBrief;
}
