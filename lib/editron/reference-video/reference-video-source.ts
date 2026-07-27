import { createHash } from 'crypto';

import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import {
  buildCanonicalYoutubeReferenceUrl,
  buildYoutubeReferenceFingerprint,
  importYoutubeReferenceVideo,
  parseYouTubeVideoId,
  YoutubeReferenceImportError,
  type ImportedYoutubeReferenceVideo,
  type ImportYoutubeReferenceVideoInput,
  type YoutubeReferenceImportFailureReason,
} from './youtube-reference-importer';
import {
  assertPublicReferenceDnsResolution,
  isUnsafeReferenceHostname,
  type ReferenceVideoDnsLookup,
} from './reference-video-network-safety';
import {
  buildInstagramReferenceFingerprint,
  importInstagramReferenceVideo,
  InstagramReferenceImportError,
  parseInstagramReferenceUrl,
  type ImportedInstagramReferenceVideo,
  type ImportInstagramReferenceVideoInput,
  type InstagramReferenceImportFailureReason,
} from './instagram-reference-importer';

type ReferenceVideoSourceKind = 'asset' | 'remote-url' | 'youtube-url' | 'instagram-url';

type ReferenceVideoSourceRejectionReason =
  | 'conflicting_reference_video_sources'
  | 'missing_reference_video_source'
  | 'reference_asset_not_found'
  | 'reference_asset_not_video'
  | 'reference_asset_url_unresolved'
  | 'invalid_reference_video_url'
  | 'unsafe_reference_video_url'
  | 'unsupported_reference_video_url'
  | 'youtube_reference_too_long'
  | 'youtube_reference_download_timeout'
  | 'youtube_reference_clip_timeout'
  | 'youtube_reference_ingestion_failed'
  | 'youtube_reference_ingestion_not_supported'
  | InstagramReferenceImportFailureReason
  | 'instagram_reference_ingestion_not_supported';

export interface ReferenceVideoSource {
  kind: Exclude<ReferenceVideoSourceKind, 'youtube-url' | 'instagram-url'>;
  referenceId: string;
  videoUrl: string;
  durationSec?: number;
  sourceLabel: string;
  sourceFingerprint?: string;
  asset?: MediaAsset | null;
}

type ReferenceVideoSourceResult =
  | { ok: true; source: ReferenceVideoSource }
  | {
      ok: false;
      reason: ReferenceVideoSourceRejectionReason;
      diagnostics: string[];
      sourceKind?: ReferenceVideoSourceKind;
    };

export interface ReferenceVideoAssetResolver {
  getAsset(assetId: string, userId: string): Promise<MediaAsset | null>;
  resolveAssetUrl(assetId: string, userId: string): Promise<string | null>;
}

interface ResolveReferenceVideoSourceInput {
  userId: string;
  referenceAssetId?: string;
  referenceVideoUrl?: string;
  assetResolver: ReferenceVideoAssetResolver;
  dnsLookup?: ReferenceVideoDnsLookup;
  youtubeImporter?: ReferenceVideoYoutubeImporter;
  youtubeMode?: 'import' | 'provider-direct';
  instagramImporter?: ReferenceVideoInstagramImporter;
}

interface ReferenceVideoUrlValidationOk {
  ok: true;
  url: URL;
  referenceId: string;
  sourceLabel: string;
  sourceFingerprint: string;
  sourceKind: 'remote-url';
}

interface ReferenceYoutubeVideoUrlValidationOk {
  ok: true;
  url: URL;
  referenceId: string;
  sourceLabel: string;
  sourceFingerprint: string;
  sourceKind: 'youtube-url';
}

interface ReferenceInstagramVideoUrlValidationOk {
  ok: true;
  url: URL;
  referenceId: string;
  sourceLabel: string;
  sourceFingerprint: string;
  sourceKind: 'instagram-url';
}

export type ReferenceVideoYoutubeImporter = (
  input: ImportYoutubeReferenceVideoInput,
) => Promise<ImportedYoutubeReferenceVideo>;

export type ReferenceVideoInstagramImporter = (
  input: ImportInstagramReferenceVideoInput,
) => Promise<ImportedInstagramReferenceVideo>;

type ReferenceVideoUrlValidationResult =
  | ReferenceVideoUrlValidationOk
  | {
      ok: false;
      reason: ReferenceVideoSourceRejectionReason;
      diagnostics: string[];
      sourceKind?: ReferenceVideoSourceKind;
    };

export type ReferenceVideoAutoEditUrlValidationResult =
  | ReferenceVideoUrlValidationOk
  | ReferenceYoutubeVideoUrlValidationOk
  | ReferenceInstagramVideoUrlValidationOk
  | {
      ok: false;
      reason: ReferenceVideoSourceRejectionReason;
      diagnostics: string[];
      sourceKind?: ReferenceVideoSourceKind;
    };

const ALLOWED_DIRECT_REFERENCE_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const AUTH_QUERY_HINTS = [
  'signature',
  'x-amz-signature',
  'x-goog-signature',
  'x-goog-credential',
  'policy',
  'expires',
  'token',
  'access_token',
  'key',
];

export async function resolveReferenceVideoSource(
  input: ResolveReferenceVideoSourceInput,
): Promise<ReferenceVideoSourceResult> {
  const referenceAssetId = input.referenceAssetId?.trim();
  const referenceVideoUrl = input.referenceVideoUrl?.trim();

  if (referenceAssetId && referenceVideoUrl) {
    return {
      ok: false,
      reason: 'conflicting_reference_video_sources',
      diagnostics: ['Provide either referenceAssetId or referenceVideoUrl, not both.'],
    };
  }

  if (referenceAssetId) {
    const asset = await input.assetResolver.getAsset(referenceAssetId, input.userId);
    if (!asset) {
      return {
        ok: false,
        reason: 'reference_asset_not_found',
        diagnostics: [`Reference asset ${referenceAssetId} was not found for this user.`],
        sourceKind: 'asset',
      };
    }
    if (asset.type !== 'video') {
      return {
        ok: false,
        reason: 'reference_asset_not_video',
        diagnostics: [`Reference asset must be a video (got ${asset.type}).`],
        sourceKind: 'asset',
      };
    }
    const videoUrl = await input.assetResolver.resolveAssetUrl(referenceAssetId, input.userId);
    if (!videoUrl) {
      return {
        ok: false,
        reason: 'reference_asset_url_unresolved',
        diagnostics: [`Could not resolve a playable URL for reference asset ${referenceAssetId}.`],
        sourceKind: 'asset',
      };
    }

    return {
      ok: true,
      source: {
        kind: 'asset',
        referenceId: referenceAssetId,
        videoUrl,
        durationSec: asset.duration ?? undefined,
        sourceLabel: asset.filename || 'Reference Video',
        sourceFingerprint: buildReferenceAssetFingerprint(asset),
        asset,
      },
    };
  }

  if (!referenceVideoUrl) {
    return {
      ok: false,
      reason: 'missing_reference_video_source',
      diagnostics: ['No reference video source was provided.'],
    };
  }

  const validation = validateReferenceVideoUrlForAutoEditIntake(referenceVideoUrl);
  if (!validation.ok) return validation;

  if (validation.sourceKind === 'youtube-url') {
    if (input.youtubeMode === 'provider-direct') {
      return {
        ok: true,
        source: {
          kind: 'remote-url',
          referenceId: validation.referenceId,
          videoUrl: validation.url.toString(),
          sourceLabel: validation.sourceLabel,
          sourceFingerprint: validation.sourceFingerprint,
          asset: null,
        },
      };
    }

    try {
      const imported = await (input.youtubeImporter ?? importYoutubeReferenceVideo)({
        userId: input.userId,
        youtubeUrl: validation.url.toString(),
        sourceFingerprint: validation.sourceFingerprint,
      });
      return {
        ok: true,
        source: {
          kind: 'asset',
          referenceId: imported.asset.assetId,
          videoUrl: imported.videoUrl,
          durationSec: imported.durationSec ?? imported.asset.duration ?? undefined,
          sourceLabel: imported.sourceLabel || imported.asset.filename || validation.sourceLabel,
          sourceFingerprint: imported.sourceFingerprint,
          asset: imported.asset,
        },
      };
    } catch (error) {
      const normalized = normalizeYoutubeReferenceImportError(error);
      return {
        ok: false,
        reason: normalized.reason,
        diagnostics: normalized.diagnostics,
        sourceKind: 'youtube-url',
      };
    }
  }

  if (validation.sourceKind === 'instagram-url') {
    try {
      const imported = await (input.instagramImporter ?? importInstagramReferenceVideo)({
        userId: input.userId,
        instagramUrl: validation.url.toString(),
        sourceFingerprint: validation.sourceFingerprint,
      });
      return {
        ok: true,
        source: {
          kind: 'asset',
          referenceId: imported.asset.assetId,
          videoUrl: imported.videoUrl,
          durationSec: imported.durationSec ?? imported.asset.duration ?? undefined,
          sourceLabel: imported.sourceLabel || imported.asset.filename || validation.sourceLabel,
          sourceFingerprint: imported.sourceFingerprint,
          asset: imported.asset,
        },
      };
    } catch (error) {
      const normalized = normalizeInstagramReferenceImportError(error);
      return {
        ok: false,
        reason: normalized.reason,
        diagnostics: normalized.diagnostics,
        sourceKind: 'instagram-url',
      };
    }
  }

  const dnsCheck = await assertPublicReferenceDnsResolution(validation.url.hostname, input.dnsLookup);
  if (!dnsCheck.ok) {
    return {
      ok: false,
      reason: 'unsafe_reference_video_url',
      diagnostics: dnsCheck.diagnostics,
      sourceKind: 'remote-url',
    };
  }

  return {
    ok: true,
    source: {
      kind: 'remote-url',
      referenceId: validation.referenceId,
      videoUrl: validation.url.toString(),
      sourceLabel: validation.sourceLabel,
      sourceFingerprint: validation.sourceFingerprint,
      asset: null,
    },
  };
}

export function validateReferenceVideoUrlForIntake(
  rawUrl?: string,
): ReferenceVideoUrlValidationResult {
  const parsed = parseHttpReferenceVideoUrl(rawUrl);
  if (!parsed.ok) return parsed;
  const { url } = parsed;

  if (isYoutubeReferenceUrl(url)) {
    return {
      ok: false,
      reason: 'youtube_reference_ingestion_not_supported',
      diagnostics: [
        'YouTube reference URLs are recognized, but must be imported to a media asset before GLM video analysis.',
      ],
      sourceKind: 'youtube-url',
    };
  }

  if (isInstagramReferenceHost(url)) {
    return {
      ok: false,
      reason: parseInstagramReferenceUrl(url)
        ? 'instagram_reference_ingestion_not_supported'
        : 'unsupported_reference_video_url',
      diagnostics: ['Instagram references must use a public reel, post, or TV URL with a shortcode.'],
      sourceKind: 'instagram-url',
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      reason: 'unsafe_reference_video_url',
      diagnostics: ['referenceVideoUrl must not contain username or password credentials.'],
      sourceKind: 'remote-url',
    };
  }

  if (isUnsafeReferenceHostname(url.hostname)) {
    return {
      ok: false,
      reason: 'unsafe_reference_video_url',
      diagnostics: ['referenceVideoUrl host is local, private, or otherwise unsafe for server-side fetching.'],
      sourceKind: 'remote-url',
    };
  }

  if (hasSensitiveQuery(url)) {
    return {
      ok: false,
      reason: 'unsafe_reference_video_url',
      diagnostics: ['referenceVideoUrl appears to contain signed or secret-bearing query parameters. Upload the file instead.'],
      sourceKind: 'remote-url',
    };
  }

  if (!hasAllowedVideoExtension(url.pathname)) {
    return {
      ok: false,
      reason: 'unsupported_reference_video_url',
      diagnostics: ['referenceVideoUrl must point directly to a public .mp4, .mov, .webm, or .m4v file.'],
      sourceKind: 'remote-url',
    };
  }

  const canonicalSource = canonicalizeRemoteReferenceUrl(url);
  return {
    ok: true,
    url,
    referenceId: `ref_url_${shortHash(canonicalSource)}`,
    sourceLabel: buildRemoteSourceLabel(url),
    sourceFingerprint: `remote-url|${canonicalSource}`,
    sourceKind: 'remote-url',
  };
}

export function validateReferenceVideoUrlForAutoEditIntake(
  rawUrl?: string,
): ReferenceVideoAutoEditUrlValidationResult {
  const directValidation = validateReferenceVideoUrlForIntake(rawUrl);
  if (directValidation.ok) {
    return directValidation;
  }

  const parsed = parseHttpReferenceVideoUrl(rawUrl);
  if (!parsed.ok) return parsed;
  if (directValidation.sourceKind === 'instagram-url') {
    const instagram = parseInstagramReferenceUrl(parsed.url);
    if (!instagram) return directValidation;
    return {
      ok: true,
      url: new URL(instagram.canonicalUrl),
      referenceId: `ref_instagram_${shortHash(instagram.shortcode)}`,
      sourceLabel: `Instagram reference ${instagram.shortcode}`,
      sourceFingerprint: buildInstagramReferenceFingerprint(instagram.shortcode),
      sourceKind: 'instagram-url',
    };
  }
  if (directValidation.sourceKind !== 'youtube-url') return directValidation;

  const videoId = parseYouTubeVideoId(parsed.url);
  if (!videoId) {
    return {
      ok: false,
      reason: 'unsupported_reference_video_url',
      diagnostics: ['YouTube reference URL must include a supported video id.'],
      sourceKind: 'youtube-url',
    };
  }

  const canonicalUrl = new URL(buildCanonicalYoutubeReferenceUrl(videoId));
  return {
    ok: true,
    url: canonicalUrl,
    referenceId: `ref_youtube_${shortHash(videoId)}`,
    sourceLabel: `YouTube reference ${videoId}`,
    sourceFingerprint: buildYoutubeReferenceFingerprint(videoId),
    sourceKind: 'youtube-url',
  };
}

function isInstagramReferenceHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'instagram.com' || hostname === 'www.instagram.com';
}

function isYoutubeReferenceUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'youtu.be'
    || hostname.endsWith('.youtu.be')
    || hostname === 'youtube.com'
    || hostname.endsWith('.youtube.com')
    || hostname === 'youtube-nocookie.com'
    || hostname.endsWith('.youtube-nocookie.com')
    || hostname === 'googlevideo.com'
    || hostname.endsWith('.googlevideo.com');
}

function parseHttpReferenceVideoUrl(rawUrl?: string): ReferenceVideoUrlValidationResult {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: 'missing_reference_video_source',
      diagnostics: ['referenceVideoUrl is empty.'],
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (_error) {
    return {
      ok: false,
      reason: 'invalid_reference_video_url',
      diagnostics: ['referenceVideoUrl must be an absolute http(s) URL.'],
    };
  }

  url.hash = '';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      ok: false,
      reason: 'invalid_reference_video_url',
      diagnostics: ['referenceVideoUrl must use http or https.'],
    };
  }

  return {
    ok: true,
    url,
    referenceId: '',
    sourceLabel: '',
    sourceFingerprint: '',
    sourceKind: 'remote-url',
  };
}

function normalizeYoutubeReferenceImportError(
  error: unknown,
): { reason: YoutubeReferenceImportFailureReason; diagnostics: string[] } {
  if (error instanceof YoutubeReferenceImportError) {
    return { reason: error.reason, diagnostics: error.diagnostics };
  }
  if (error && typeof error === 'object' && 'reason' in error && 'diagnostics' in error) {
    const reason = String((error as { reason?: unknown }).reason);
    if (
      reason === 'youtube_reference_too_long'
      || reason === 'youtube_reference_download_timeout'
      || reason === 'youtube_reference_clip_timeout'
      || reason === 'youtube_reference_ingestion_failed'
    ) {
      const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
      return {
        reason,
        diagnostics: Array.isArray(diagnostics) ? diagnostics.map(String) : [reason],
      };
    }
  }
  return {
    reason: 'youtube_reference_ingestion_failed',
    diagnostics: [error instanceof Error ? error.message : String(error)],
  };
}

function normalizeInstagramReferenceImportError(
  error: unknown,
): { reason: InstagramReferenceImportFailureReason; diagnostics: string[] } {
  if (error instanceof InstagramReferenceImportError) {
    return { reason: error.reason, diagnostics: error.diagnostics };
  }
  return {
    reason: 'instagram_reference_ingestion_failed',
    diagnostics: [error instanceof Error ? error.message : String(error)],
  };
}

function hasAllowedVideoExtension(pathname: string): boolean {
  const lowerPath = pathname.toLowerCase();
  return Array.from(ALLOWED_DIRECT_REFERENCE_VIDEO_EXTENSIONS).some((extension) => lowerPath.endsWith(extension));
}

function hasSensitiveQuery(url: URL): boolean {
  const keys = Array.from(url.searchParams.keys()).map((key) => key.toLowerCase());
  return AUTH_QUERY_HINTS.some((hint) => keys.includes(hint));
}

function canonicalizeRemoteReferenceUrl(url: URL): string {
  return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${url.pathname}`;
}

function buildRemoteSourceLabel(url: URL): string {
  const filename = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '').trim();
  return filename || `${url.hostname} reference video`;
}

function buildReferenceAssetFingerprint(asset: MediaAsset): string | undefined {
  const uploadedAt = asset.uploadedAt ? normalizeDate(asset.uploadedAt) : '';
  const parts = [
    asset.assetId,
    asset.r2Key,
    asset.originalR2Key,
    asset.gcsPath,
    asset.size,
    asset.duration,
    uploadedAt,
  ].filter((value) => value !== undefined && value !== null && String(value).trim().length > 0);
  return parts.length > 0 ? parts.map(String).join('|') : undefined;
}

function normalizeDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
