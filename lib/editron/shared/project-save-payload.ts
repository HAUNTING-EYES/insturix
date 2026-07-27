import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

type EditorSaveStateLike = {
  overlays?: Overlay[];
  [key: string]: unknown;
};

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
): Overlay[] {
  const currentById = new Map(
    (Array.isArray(currentOverlays) ? currentOverlays : [])
      .map((overlay) => [String(overlay.id), overlay]),
  );
  return incomingOverlays.map((incoming) => {
    const current = currentById.get(String(incoming.id));
    return mergeOverlayServerOwnedData(incoming, current);
  });
}

function compactOverlayForSave<T extends Overlay>(overlay: T): T {
  const compact = { ...overlay } as Record<string, unknown>;

  if (typeof compact.assetId === 'string' && compact.assetId) {
    delete compact.src;
  }

  for (const key of SERVER_OWNED_ROOT_KEYS) {
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

function mergeOverlayServerOwnedData<T extends Overlay>(incoming: T, current?: Overlay): T {
  const merged = { ...incoming } as Record<string, unknown>;

  for (const key of SERVER_OWNED_ROOT_KEYS) {
    delete merged[key];
    if (current && (current as Record<string, unknown>)[key] !== undefined) {
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
