import {
  canonicalizeReferenceVideo,
  type CanonicalizeReferenceOutput,
} from '@/lib/editron/reference-video/canonicalize-reference';
import type { ReferenceMaterializedMediaRegistrationReceiptV1 } from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';
import {
  resolveReferenceVideoSource,
  type ReferenceVideoAssetResolver,
} from '@/lib/editron/reference-video/reference-video-source';

interface StyleReferenceProjectViewV1 {
  overlays?: ReadonlyArray<Readonly<{
    id: unknown;
    type?: unknown;
    assetId?: unknown;
  }>>;
}

export interface StyleReferenceCanonicalSourceV1 {
  referenceAssetId: string;
  videoUrl: string;
  sourceName: string;
  durationSec?: number;
  registration: Readonly<ReferenceMaterializedMediaRegistrationReceiptV1>;
}

export interface StyleReferenceExtractionTargetV1 {
  userId: string;
  orgId?: string;
  projectId?: string;
  assetId?: string;
  videoOverlayId?: string;
  videoUrl?: string;
  sourceName?: string;
  /** Receipt-bearing handoff from a caller that already crossed this boundary. */
  canonicalSource?: Readonly<CanonicalizeReferenceOutput>;
}

export interface StyleReferenceSourceDepsV1 {
  loadProject?: (
    userId: string,
    projectId: string,
  ) => Promise<StyleReferenceProjectViewV1 | null>;
  resolveSource?: typeof resolveReferenceVideoSource;
  canonicalize?: typeof canonicalizeReferenceVideo;
  assetResolver?: ReferenceVideoAssetResolver;
}

export class StyleReferenceSourceErrorV1 extends Error {
  constructor(
    public readonly code:
      | 'invalid_actor'
      | 'invalid_source_name'
      | 'ambiguous_target'
      | 'project_required'
      | 'project_not_found'
      | 'overlay_not_found'
      | 'overlay_not_video'
      | 'overlay_asset_missing'
      | 'source_rejected'
      | 'canonical_identity_invalid',
    message: string,
  ) {
    super(message);
    this.name = 'StyleReferenceSourceErrorV1';
  }
}

/**
 * Sole adapter from legacy style targets to the existing canonical reference
 * owner. It resolves transport/source identity only; it never chooses editing
 * forms or creates a second media registry.
 */
export async function resolveStyleReferenceSourceV1(
  input: Readonly<StyleReferenceExtractionTargetV1>,
  deps: Readonly<StyleReferenceSourceDepsV1> = {},
): Promise<Readonly<StyleReferenceCanonicalSourceV1>> {
  const userId = input.userId.trim();
  if (!userId) {
    throw new StyleReferenceSourceErrorV1('invalid_actor', 'userId is required');
  }
  const sourceName = normalizeSourceName(input.sourceName);
  const targets = [
    clean(input.assetId),
    clean(input.videoOverlayId),
    clean(input.videoUrl),
    input.canonicalSource,
  ].filter(Boolean);
  if (targets.length !== 1) {
    throw new StyleReferenceSourceErrorV1(
      'ambiguous_target',
      'Provide exactly one reference target: assetId, videoOverlayId, videoUrl, or canonicalSource',
    );
  }

  if (input.canonicalSource) {
    return normalizeCanonicalSource(input.canonicalSource, sourceName);
  }

  let referenceAssetId = clean(input.assetId);
  if (clean(input.videoOverlayId)) {
    referenceAssetId = await resolveOverlayAssetId(input, deps);
  }

  const resolveSource = deps.resolveSource ?? resolveReferenceVideoSource;
  const mediaResolver = deps.assetResolver
    ?? (await import('./asset-resolver')).assetResolver;
  const resolved = await resolveSource({
    userId,
    referenceAssetId,
    referenceVideoUrl: clean(input.videoUrl),
    assetResolver: mediaResolver,
  });
  if (!resolved.ok) {
    throw new StyleReferenceSourceErrorV1(
      'source_rejected',
      `${resolved.reason}: ${resolved.diagnostics.join(' ')}`,
    );
  }

  const canonicalize = deps.canonicalize ?? canonicalizeReferenceVideo;
  const canonical = await canonicalize({
    userId,
    ...(clean(input.orgId) ? { orgId: clean(input.orgId) } : {}),
    source: resolved.source,
    audioUsageMode: 'preview-waveform-only',
  });
  return normalizeCanonicalSource(
    canonical,
    sourceName ?? canonical.sourceLabel ?? resolved.source.sourceLabel,
  );
}

async function resolveOverlayAssetId(
  input: Readonly<StyleReferenceExtractionTargetV1>,
  deps: Readonly<StyleReferenceSourceDepsV1>,
): Promise<string> {
  const projectId = clean(input.projectId);
  if (!projectId) {
    throw new StyleReferenceSourceErrorV1(
      'project_required',
      'projectId is required when using videoOverlayId',
    );
  }
  const loadProject = deps.loadProject
    ?? (async (userId: string, id: string) => (
      await import('./project-service')
    ).projectService.loadProject(userId, id));
  const project = await loadProject(input.userId.trim(), projectId);
  if (!project) {
    throw new StyleReferenceSourceErrorV1('project_not_found', 'Project not found');
  }
  const overlayId = clean(input.videoOverlayId)!;
  const overlay = (project.overlays ?? []).find(
    (candidate) => String(candidate.id) === overlayId,
  );
  if (!overlay) {
    throw new StyleReferenceSourceErrorV1(
      'overlay_not_found',
      `Overlay ${overlayId} not found in project`,
    );
  }
  if (overlay.type !== 'video') {
    throw new StyleReferenceSourceErrorV1(
      'overlay_not_video',
      `Overlay ${overlayId} is not a video (type: ${overlay.type})`,
    );
  }
  const assetId = clean(overlay.assetId);
  if (!assetId) {
    throw new StyleReferenceSourceErrorV1(
      'overlay_asset_missing',
      `Video overlay ${overlayId} has no assetId`,
    );
  }
  return assetId;
}

function normalizeCanonicalSource(
  canonical: Readonly<CanonicalizeReferenceOutput>,
  sourceName: string | undefined,
): Readonly<StyleReferenceCanonicalSourceV1> {
  const referenceAssetId = clean(canonical.referenceAssetId);
  const videoUrl = clean(canonical.videoUrl);
  const registration = canonical.sourceRegistration;
  if (!referenceAssetId
    || !videoUrl
    || !registration
    || registration.assetId !== referenceAssetId
    || registration.provenance.role !== 'SOURCE') {
    throw new StyleReferenceSourceErrorV1(
      'canonical_identity_invalid',
      'Canonical style reference is missing a matching source registration receipt',
    );
  }
  return {
    referenceAssetId,
    videoUrl,
    sourceName: sourceName ?? canonical.sourceLabel?.trim() ?? 'Reference Video',
    ...(canonical.durationSec === undefined ? {} : { durationSec: canonical.durationSec }),
    registration,
  };
}

function normalizeSourceName(value: string | undefined): string | undefined {
  const normalized = clean(value);
  if (normalized && normalized.length > 240) {
    throw new StyleReferenceSourceErrorV1(
      'invalid_source_name',
      'sourceName must be 240 characters or fewer',
    );
  }
  return normalized;
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}
