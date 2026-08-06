import { z } from 'zod';

import { isCanonicalMusicOverlay } from '@/lib/editron/shared/render-request-payload';

const OverlayIdSchema = z.union([z.string(), z.number()]);

const PlatformNativeMusicHandoffSchema = z.object({
  version: z.literal('editron-platform-native-music-handoff-v1'),
  destinationPlatform: z.string().nullable(),
  attachmentOwner: z.literal('destination-platform'),
  track: z.object({
    status: z.enum(['reference-ready', 'manual-selection-required']),
    provider: z.string().nullable(),
    providerTrackId: z.string().nullable(),
    title: z.string().nullable(),
    artists: z.array(z.string()),
    sourceAssetId: z.string().nullable(),
    bpm: z.number().positive().nullable().optional(),
    usage: z.literal('reference-only'),
  }),
  timing: z.object({
    timelineStartFrame: z.number().int().nonnegative(),
    timelineEndFrame: z.number().int().nonnegative(),
    timelineStartMs: z.number().int().nonnegative(),
    timelineEndMs: z.number().int().nonnegative(),
    timelineBeatEntryFrame: z.number().int().nonnegative().nullable(),
    timelineBeatEntryMs: z.number().int().nonnegative().nullable(),
    platformTrackSourceOffsetMs: z.null(),
    cueStatus: z.literal('manual-cue-required'),
  }),
});

export const RenderDeliveryManifestSchema = z.object({
  version: z.literal('editron-render-delivery-manifest-v1'),
  mode: z.enum(['embedded', 'platform-native']),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  primaryArtifact: z.object({
    kind: z.enum(['mixed-master', 'clean-master']),
    renderId: z.string().min(1),
    status: z.enum(['rendering', 'ready']),
    url: z.string().min(1).nullable(),
  }),
  music: z.object({
    embedded: z.boolean(),
    removedOverlayIds: z.array(OverlayIdSchema),
    handoff: PlatformNativeMusicHandoffSchema.nullable(),
  }),
}).superRefine((manifest, context) => {
  const embeddedIsConsistent = (
    manifest.primaryArtifact.kind === 'mixed-master'
    && manifest.music.embedded
    && manifest.music.removedOverlayIds.length === 0
    && manifest.music.handoff === null
  );
  const platformNativeIsConsistent = (
    manifest.primaryArtifact.kind === 'clean-master'
    && !manifest.music.embedded
    && manifest.music.handoff !== null
  );
  if (
    (manifest.mode === 'embedded' && !embeddedIsConsistent)
    || (manifest.mode === 'platform-native' && !platformNativeIsConsistent)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Render delivery mode, artifact kind, and music handoff are inconsistent.',
    });
  }
});

export type RenderDeliveryManifest = z.infer<typeof RenderDeliveryManifestSchema>;
export type RenderMusicDeliveryMode = RenderDeliveryManifest['mode'];

export interface RenderDeliveryPlan {
  mode: RenderMusicDeliveryMode;
  overlays: unknown[];
  music: RenderDeliveryManifest['music'];
}

export class RenderDeliveryContractError extends Error {
  readonly code = 'INVALID_RENDER_DELIVERY_MODE';

  constructor(message: string) {
    super(message);
    this.name = 'RenderDeliveryContractError';
  }
}

export function resolveRenderDeliveryPlan(input: {
  requestedMode?: unknown;
  overlays?: unknown[];
  fps?: unknown;
  durationInFrames?: unknown;
  destinationPlatform?: unknown;
}): RenderDeliveryPlan {
  const overlays = Array.isArray(input.overlays) ? input.overlays : [];
  const musicOverlays = overlays.filter(isCanonicalMusicOverlay);
  const mode = musicOverlays.some(isReferenceOnlyMusicOverlay)
    ? 'platform-native'
    : resolveMode(input.requestedMode);
  if (mode === 'embedded') {
    return {
      mode,
      overlays,
      music: {
        embedded: true,
        removedOverlayIds: [],
        handoff: null,
      },
    };
  }

  const removedOverlayIds = musicOverlays.flatMap((overlay) => {
    const id = asRecord(overlay)?.id;
    return typeof id === 'string' || typeof id === 'number' ? [id] : [];
  });
  const fps = positiveNumber(input.fps) ?? 30;
  const durationInFrames = nonNegativeInteger(input.durationInFrames)
    ?? inferTimelineEndFrame(overlays);
  const timing = resolveHandoffTiming(musicOverlays, fps, durationInFrames);

  return {
    mode,
    overlays: overlays.filter((overlay) => !isCanonicalMusicOverlay(overlay)),
    music: {
      embedded: false,
      removedOverlayIds,
      handoff: {
        version: 'editron-platform-native-music-handoff-v1',
        destinationPlatform: nonEmptyString(input.destinationPlatform),
        attachmentOwner: 'destination-platform',
        track: resolveTrackReference(musicOverlays[0]),
        timing,
      },
    },
  };
}

function isReferenceOnlyMusicOverlay(overlay: unknown): boolean {
  const record = asRecord(overlay);
  const metadata = asRecord(record?.metadata);
  const assignment = asRecord(metadata?.assignment);
  const rights = asRecord(record?.musicRights ?? record?.audioRights);
  return (
    rights?.source === 'preview-only'
    || assignment?.usageMode === 'reference-only'
  );
}

export function buildRenderDeliveryManifest(input: {
  plan: RenderDeliveryPlan;
  renderId: string;
  createdAt?: string;
}): RenderDeliveryManifest {
  return RenderDeliveryManifestSchema.parse({
    version: 'editron-render-delivery-manifest-v1',
    mode: input.plan.mode,
    createdAt: input.createdAt ?? new Date().toISOString(),
    completedAt: null,
    primaryArtifact: {
      kind: input.plan.mode === 'platform-native' ? 'clean-master' : 'mixed-master',
      renderId: input.renderId,
      status: 'rendering',
      url: null,
    },
    music: input.plan.music,
  });
}

export function completeRenderDeliveryManifest(
  manifest: RenderDeliveryManifest,
  outputUrl: string,
  completedAt?: string,
): RenderDeliveryManifest {
  const url = nonEmptyString(outputUrl);
  if (!url) {
    throw new RenderDeliveryContractError('A completed render delivery requires an output URL.');
  }
  return RenderDeliveryManifestSchema.parse({
    ...manifest,
    completedAt: completedAt ?? new Date().toISOString(),
    primaryArtifact: {
      ...manifest.primaryArtifact,
      status: 'ready',
      url,
    },
  });
}

function resolveMode(value: unknown): RenderMusicDeliveryMode {
  if (value === undefined || value === null || value === '') return 'embedded';
  if (value === 'embedded' || value === 'platform-native') return value;
  throw new RenderDeliveryContractError(
    'musicDeliveryMode must be either embedded or platform-native.',
  );
}

function resolveTrackReference(
  overlay: unknown,
): NonNullable<RenderDeliveryManifest['music']['handoff']>['track'] {
  const record = asRecord(overlay);
  const metadata = asRecord(record?.metadata);
  const referenceTrack = asRecord(metadata?.referenceTrack);
  const catalog = asRecord(metadata?.catalogMetadata);
  const beatGrid = asRecord(metadata?.beatGrid);
  const rights = asRecord(record?.musicRights ?? record?.audioRights);
  const evidence = asRecord(rights?.evidence);
  const title = firstString(
    referenceTrack?.title,
    catalog?.title,
    metadata?.originalTitle,
    metadata?.title,
    record?.title,
  );
  const providerTrackId = firstString(
    referenceTrack?.providerTrackId,
    catalog?.providerTrackId,
    metadata?.providerTrackId,
  );
  const provider = firstString(
    referenceTrack?.provider,
    catalog?.provider,
    metadata?.providerId,
    rights?.source,
  );
  const sourceAssetId = firstString(
    referenceTrack?.sourceAssetId,
    evidence?.sourceAssetId,
    metadata?.sourceAssetId,
  );
  const artistCandidates = Array.isArray(referenceTrack?.artists)
    ? referenceTrack.artists
    : Array.isArray(catalog?.artists) ? catalog.artists : [];
  const artists = artistCandidates.flatMap((artist) => {
        const value = nonEmptyString(artist);
        return value ? [value] : [];
      });
  const bpm = positiveNumber(referenceTrack?.bpm) ?? positiveNumber(beatGrid?.bpm);

  return {
    status: title || providerTrackId ? 'reference-ready' : 'manual-selection-required',
    provider,
    providerTrackId,
    title,
    artists,
    sourceAssetId,
    bpm,
    usage: 'reference-only',
  };
}

function resolveHandoffTiming(
  musicOverlays: unknown[],
  fps: number,
  durationInFrames: number,
): NonNullable<RenderDeliveryManifest['music']['handoff']>['timing'] {
  const ranges = musicOverlays.flatMap((overlay) => {
    const record = asRecord(overlay);
    if (!record) return [];
    const from = nonNegativeInteger(record.from) ?? 0;
    const duration = nonNegativeInteger(record.durationInFrames) ?? 0;
    return [{ start: from, end: Math.max(from, from + duration) }];
  });
  const timelineStartFrame = ranges.length > 0
    ? Math.min(...ranges.map((range) => range.start))
    : 0;
  const inferredEnd = ranges.length > 0
    ? Math.max(...ranges.map((range) => range.end))
    : durationInFrames;
  const timelineEndFrame = Math.max(
    timelineStartFrame,
    durationInFrames > 0 ? Math.min(inferredEnd, durationInFrames) : inferredEnd,
  );
  const rawBeatEntryFrame = resolveTimelineBeatEntryFrame(musicOverlays);
  const timelineBeatEntryFrame = (
    rawBeatEntryFrame !== null
    && rawBeatEntryFrame >= timelineStartFrame
    && rawBeatEntryFrame <= timelineEndFrame
  ) ? rawBeatEntryFrame : null;

  return {
    timelineStartFrame,
    timelineEndFrame,
    timelineStartMs: frameToMs(timelineStartFrame, fps),
    timelineEndMs: frameToMs(timelineEndFrame, fps),
    timelineBeatEntryFrame,
    timelineBeatEntryMs: timelineBeatEntryFrame === null
      ? null
      : frameToMs(timelineBeatEntryFrame, fps),
    platformTrackSourceOffsetMs: null,
    cueStatus: 'manual-cue-required',
  };
}

function resolveTimelineBeatEntryFrame(musicOverlays: unknown[]): number | null {
  const entries = musicOverlays.flatMap((overlay) => {
    const record = asRecord(overlay);
    const metadata = asRecord(record?.metadata);
    const beatGrid = asRecord(metadata?.beatGrid);
    const beats = Array.isArray(beatGrid?.beats) ? beatGrid.beats : [];
    const firstBeat = beats
      .map((beat) => nonNegativeInteger(asRecord(beat)?.frame))
      .find((frame): frame is number => frame !== null);
    if (firstBeat === undefined || firstBeat === null) return [];
    return [(nonNegativeInteger(record?.from) ?? 0) + firstBeat];
  });
  return entries.length > 0 ? Math.min(...entries) : null;
}

function inferTimelineEndFrame(overlays: unknown[]): number {
  return overlays.reduce<number>((end, overlay) => {
    const record = asRecord(overlay);
    const from = nonNegativeInteger(record?.from) ?? 0;
    const duration = nonNegativeInteger(record?.durationInFrames) ?? 0;
    return Math.max(end, from + duration);
  }, 0);
}

function frameToMs(frame: number, fps: number): number {
  return Math.max(0, Math.round((frame / fps) * 1_000));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = nonEmptyString(value);
    if (candidate) return candidate;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
