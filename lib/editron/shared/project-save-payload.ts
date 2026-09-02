import type {
  NamedMarker,
  Overlay,
} from '@/components/editron/editor/version-7.0.0/types';

/**
 * The durable named-marker contract shared by the browser and ProjectService.
 * Keep this validator dependency-free: this module is also imported by the
 * client autosave hook.
 */
export type EditorTimelineMarker = NamedMarker;

export const EDITOR_TIMELINE_MARKER_LIMITS = {
  maxMarkers: 2_048,
  maxIdLength: 128,
  maxLabelLength: 512,
} as const;

export function isValidEditorTimelineMarkers(
  value: unknown,
  durationInFrames?: unknown,
): value is EditorTimelineMarker[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > EDITOR_TIMELINE_MARKER_LIMITS.maxMarkers) {
    return false;
  }

  const ids = new Set<string>();
  const markerFrames: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const marker = value[index];
    if (!isRecord(marker)) return false;

    const keys = Object.keys(marker);
    if (
      keys.length !== 3
      || !keys.includes('id')
      || !keys.includes('frame')
      || !keys.includes('label')
    ) {
      return false;
    }

    const { id, frame, label } = marker;
    if (
      typeof id !== 'string'
      || id.trim().length === 0
      || id.trim() !== id
      || id.length > EDITOR_TIMELINE_MARKER_LIMITS.maxIdLength
      || ids.has(id)
      || typeof frame !== 'number'
      || !Number.isSafeInteger(frame)
      || frame < 0
      || typeof label !== 'string'
      || label.trim().length === 0
      || label.length > EDITOR_TIMELINE_MARKER_LIMITS.maxLabelLength
    ) {
      return false;
    }
    ids.add(id);
    markerFrames.push(frame);
  }

  if (durationInFrames === undefined) return true;
  if (
    typeof durationInFrames !== 'number'
    || !Number.isFinite(durationInFrames)
    || durationInFrames < 0
  ) {
    return false;
  }
  return markerFrames.every((frame) => frame < durationInFrames);
}

export function assertEditorTimelineMarkers(
  value: unknown,
  durationInFrames?: unknown,
): asserts value is EditorTimelineMarker[] | undefined {
  if (!isValidEditorTimelineMarkers(value, durationInFrames)) {
    throw new Error(
      'Invalid editor timeline markers: expected unique canonical IDs, bounded nonempty labels, safe nonnegative integer frames within duration.',
    );
  }
}

type EditorSaveStateLike = {
  overlays?: Overlay[];
  markers?: EditorTimelineMarker[];
  [key: string]: unknown;
};

export type OverlaySaveAuthority = 'client' | 'server';

const PROJECT_SERVICE_OWNED_ROOT_KEYS = [
  'sourceVersionPinV1',
] as const;

const SERVER_OWNED_ROOT_KEYS = [
  'atomicMomentBundle',
  'atomicMomentBundles',
  'audioRights',
  'contentSignals',
  'contentStructure',
  'decisionAuthority',
  'mgExpressionAuthority',
  'musicRights',
  'qualityReview',
  'recipe',
  'resolvedTokens',
  'semanticAtoms',
  'unifiedDecisionBundle',
  'visualExplanationContract',
] as const;

const COMPACT_METADATA_KEYS = new Set([
  'assetId',
  'atomicSfxForm',
  'atomicTransitionForm',
  'audioRole',
  'durationMs',
  'filename',
  'label',
  'originalTitle',
  'providerId',
  'role',
  'sceneIndex',
  'sfxSyncFrame',
  'sfxType',
  'source',
  'title',
  'token',
  'transitionSfxPlacementStatus',
  'transitionSfxPolicy',
  'transitionSfxSkipReason',
  'volume',
]);

export function serializeEditorStateForSave(state: EditorSaveStateLike): string {
  return JSON.stringify(compactEditorStateForSave(state));
}

export function compactEditorStateForSave<T extends EditorSaveStateLike>(state: T): T {
  return {
    ...state,
    overlays: Array.isArray(state.overlays)
      ? state.overlays.map(compactOverlayForSave)
      : state.overlays,
  };
}

export function mergeServerOwnedOverlayDataForSave(
  incomingOverlays: Overlay[],
  currentOverlays: Overlay[] | undefined,
  incomingAuthority: OverlaySaveAuthority = 'client',
): Overlay[] {
  const currentById = new Map(
    (Array.isArray(currentOverlays) ? currentOverlays : [])
      .map((overlay) => [String(overlay.id), overlay]),
  );
  return incomingOverlays.map((incoming) => {
    const current = currentById.get(String(incoming.id));
    return mergeOverlayServerOwnedData(incoming, current, incomingAuthority);
  });
}

function compactOverlayForSave<T extends Overlay>(overlay: T): T {
  const compact = { ...overlay } as Record<string, unknown>;

  if (typeof compact.assetId === 'string' && compact.assetId) {
    delete compact.src;
  }

  for (const key of [
    ...PROJECT_SERVICE_OWNED_ROOT_KEYS,
    ...SERVER_OWNED_ROOT_KEYS,
  ]) {
    delete compact[key];
  }

  if (compact.metadata && typeof compact.metadata === 'object' && !Array.isArray(compact.metadata)) {
    compact.metadata = compactMetadataForSave(compact.metadata as Record<string, unknown>);
  }

  return compact as T;
}

function compactMetadataForSave(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (COMPACT_METADATA_KEYS.has(key) && value !== undefined) {
      compact[key] = value;
    }
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function mergeOverlayServerOwnedData<T extends Overlay>(
  incoming: T,
  current: Overlay | undefined,
  incomingAuthority: OverlaySaveAuthority,
): T {
  const merged = { ...incoming } as Record<string, unknown>;

  // A generic "server" caller may carry licensed/render evidence, but it is
  // not the ProjectService source-cutover owner. Only the dedicated binding
  // and relink CAS commands may add, replace, or remove these fields.
  for (const key of PROJECT_SERVICE_OWNED_ROOT_KEYS) {
    delete merged[key];
    if (current && (current as Record<string, unknown>)[key] !== undefined) {
      merged[key] = (current as Record<string, unknown>)[key];
    }
  }

  for (const key of SERVER_OWNED_ROOT_KEYS) {
    const incomingValue = merged[key];
    delete merged[key];
    if (incomingAuthority === 'server' && incomingValue !== undefined) {
      merged[key] = incomingValue;
    } else if (current && (current as Record<string, unknown>)[key] !== undefined) {
      merged[key] = (current as Record<string, unknown>)[key];
    }
  }

  const incomingMetadata = isRecord(merged.metadata) ? merged.metadata : undefined;
  const currentMetadata = current && isRecord((current as Record<string, unknown>).metadata)
    ? (current as Record<string, unknown>).metadata as Record<string, unknown>
    : undefined;

  if (currentMetadata || incomingMetadata) {
    merged.metadata = {
      ...(currentMetadata ?? {}),
      ...(incomingMetadata ?? {}),
    };
  }

  return merged as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
