export type LegacyAudioOverlayMigrationPlanV1 =
  | {
      disposition: 'READY';
      overlays: Record<string, unknown>[];
      migratedIdentities: string[];
    }
  | {
      disposition: 'NO_CHANGES';
      overlays: Record<string, unknown>[];
      migratedIdentities: [];
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INVALID_TOP_LEVEL_OVERLAYS'
        | 'MISSING_OVERLAY_IDENTITY'
        | 'DUPLICATE_LEGACY_OVERLAY_IDENTITY';
      overlays: Record<string, unknown>[];
      migratedIdentities: [];
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isLegacyAudioOverlay(value: unknown): value is Record<string, unknown> {
  const overlay = asRecord(value);
  return overlay?.type === 'sound' && (overlay.row === 5 || overlay.row === 6);
}

function overlayIdentity(overlay: Record<string, unknown>): string | null {
  if (typeof overlay.assetId === 'string' && overlay.assetId.trim()) {
    return `asset:${overlay.assetId.trim()}`;
  }
  if (typeof overlay.id === 'string' && overlay.id.trim()) {
    return `overlay:${overlay.id.trim()}`;
  }
  if (typeof overlay.id === 'number' && Number.isSafeInteger(overlay.id)) {
    return `overlay:${overlay.id}`;
  }
  return null;
}

export function planLegacyAudioOverlayMigrationV1(input: {
  topLevelOverlays: unknown;
  legacyStateOverlays: unknown;
}): LegacyAudioOverlayMigrationPlanV1 {
  if (!Array.isArray(input.topLevelOverlays)) {
    return {
      disposition: 'UNVERIFIABLE',
      reason: 'INVALID_TOP_LEVEL_OVERLAYS',
      overlays: [],
      migratedIdentities: [],
    };
  }
  const parsedTopLevelOverlays = input.topLevelOverlays.map(asRecord);
  if (parsedTopLevelOverlays.some((overlay) => overlay === null)) {
    return {
      disposition: 'UNVERIFIABLE',
      reason: 'INVALID_TOP_LEVEL_OVERLAYS',
      overlays: [],
      migratedIdentities: [],
    };
  }
  const topLevelOverlays = parsedTopLevelOverlays as Record<string, unknown>[];
  const legacyAudio = Array.isArray(input.legacyStateOverlays)
    ? input.legacyStateOverlays.filter(isLegacyAudioOverlay)
    : [];
  if (legacyAudio.length === 0) {
    return { disposition: 'NO_CHANGES', overlays: topLevelOverlays, migratedIdentities: [] };
  }

  const legacyIdentities = legacyAudio.map(overlayIdentity);
  if (legacyIdentities.some((identity) => identity === null)) {
    return {
      disposition: 'UNVERIFIABLE',
      reason: 'MISSING_OVERLAY_IDENTITY',
      overlays: topLevelOverlays,
      migratedIdentities: [],
    };
  }
  const uniqueLegacyIdentities = new Set(legacyIdentities as string[]);
  if (uniqueLegacyIdentities.size !== legacyIdentities.length) {
    return {
      disposition: 'UNVERIFIABLE',
      reason: 'DUPLICATE_LEGACY_OVERLAY_IDENTITY',
      overlays: topLevelOverlays,
      migratedIdentities: [],
    };
  }

  const existingIdentities = new Set(
    topLevelOverlays.flatMap((overlay) => {
      const identity = overlayIdentity(overlay);
      return identity ? [identity] : [];
    }),
  );
  const additions = legacyAudio.filter((overlay) => {
    const identity = overlayIdentity(overlay)!;
    return !existingIdentities.has(identity);
  });
  if (additions.length === 0) {
    return { disposition: 'NO_CHANGES', overlays: topLevelOverlays, migratedIdentities: [] };
  }

  return {
    disposition: 'READY',
    overlays: [...topLevelOverlays, ...additions.map((overlay) => structuredClone(overlay))],
    migratedIdentities: additions.map((overlay) => overlayIdentity(overlay)!),
  };
}
