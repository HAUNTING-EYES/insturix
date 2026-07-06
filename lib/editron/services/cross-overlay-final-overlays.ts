export type CrossOverlayFinalOverlayFamily =
  | 'caption'
  | 'mg'
  | 'camera'
  | 'transition'
  | 'audio'
  | 'other';

export type CrossOverlayFinalOverlayLane =
  | 'text'
  | 'motion'
  | 'audio'
  | 'other';

export type CrossOverlayFinalOverlayProducer =
  | 'canonical-caption-track'
  | 'async-worker-audio'
  | 'post-edl-drift-zoom';

export interface CrossOverlayFinalOverlayBypass {
  overlayId: string | number | null;
  type: string;
  producer: CrossOverlayFinalOverlayProducer;
  family: CrossOverlayFinalOverlayFamily;
  lane: CrossOverlayFinalOverlayLane;
  from: number;
  durationFrames: number;
  reason: string;
  movable: false;
  calibrationStatus: 'invented-needs-calibration';
}

export interface CrossOverlayFinalOverlayReport {
  version: 'cross-overlay-final-overlays-v1';
  overlayCount: number;
  bypassOverlayCount: number;
  countsByProducer: Partial<Record<CrossOverlayFinalOverlayProducer, number>>;
  countsByFamily: Partial<Record<CrossOverlayFinalOverlayFamily, number>>;
  bypasses: CrossOverlayFinalOverlayBypass[];
  calibrationStatus: 'invented-needs-calibration';
}

export function summarizeFinalOverlayChoreographyBypasses(overlays: any[]): CrossOverlayFinalOverlayReport {
  const bypasses = overlays
    .map(finalOverlayBypass)
    .filter((bypass): bypass is CrossOverlayFinalOverlayBypass => bypass !== null);

  return buildFinalOverlayReport(overlays.length, bypasses);
}

export function annotateFinalOverlayChoreographyBypasses(overlays: any[]): CrossOverlayFinalOverlayReport {
  const bypasses: CrossOverlayFinalOverlayBypass[] = [];

  for (const overlay of overlays) {
    const bypass = finalOverlayBypass(overlay);
    if (!bypass) continue;
    overlay.metadata = {
      ...(recordParam(overlay.metadata) ?? {}),
      crossOverlayFinalChoreography: {
        version: 'cross-overlay-final-overlays-v1',
        producer: bypass.producer,
        family: bypass.family,
        lane: bypass.lane,
        reason: bypass.reason,
        movable: false,
        calibrationStatus: 'invented-needs-calibration',
      },
    };
    bypasses.push(bypass);
  }

  return buildFinalOverlayReport(overlays.length, bypasses);
}

function buildFinalOverlayReport(
  overlayCount: number,
  bypasses: CrossOverlayFinalOverlayBypass[],
): CrossOverlayFinalOverlayReport {
  return {
    version: 'cross-overlay-final-overlays-v1',
    overlayCount,
    bypassOverlayCount: bypasses.length,
    countsByProducer: countBy(bypasses, 'producer') as Partial<Record<CrossOverlayFinalOverlayProducer, number>>,
    countsByFamily: countBy(bypasses, 'family') as Partial<Record<CrossOverlayFinalOverlayFamily, number>>,
    bypasses: bypasses.slice(0, 50),
    calibrationStatus: 'invented-needs-calibration',
  };
}

function finalOverlayBypass(overlay: any): CrossOverlayFinalOverlayBypass | null {
  const producer = finalOverlayProducer(overlay);
  if (!producer) return null;
  const family = finalOverlayFamily(overlay, producer);
  return {
    overlayId: overlay?.id ?? null,
    type: typeof overlay?.type === 'string' ? overlay.type : 'unknown',
    producer,
    family,
    lane: laneForFamily(family),
    from: finiteFrame(overlay?.from),
    durationFrames: Math.max(1, finiteFrame(overlay?.durationInFrames)),
    reason: reasonForProducer(producer),
    movable: false,
    calibrationStatus: 'invented-needs-calibration',
  };
}

function finalOverlayProducer(overlay: any): CrossOverlayFinalOverlayProducer | null {
  const metadata = recordParam(overlay?.metadata) ?? {};
  if (overlay?.type === 'caption' && metadata.source === 'canonical-caption-track') {
    return 'canonical-caption-track';
  }
  if (overlay?.type === 'sound' && overlay?._workerAdded === true) {
    return 'async-worker-audio';
  }
  if ((overlay?.type === 'video' || overlay?.type === 'image') && metadata.crossOverlayProducer === 'post-edl-drift-zoom') {
    return 'post-edl-drift-zoom';
  }
  return null;
}

function finalOverlayFamily(
  overlay: any,
  producer: CrossOverlayFinalOverlayProducer,
): CrossOverlayFinalOverlayFamily {
  if (producer === 'canonical-caption-track') return 'caption';
  if (producer === 'async-worker-audio') return 'audio';
  if (producer === 'post-edl-drift-zoom') return 'camera';
  if (overlay?.type === 'html-scene' || overlay?.type === 'sticker') return 'mg';
  if (overlay?.type === 'transition') return 'transition';
  return 'other';
}

function laneForFamily(family: CrossOverlayFinalOverlayFamily): CrossOverlayFinalOverlayLane {
  if (family === 'caption' || family === 'mg') return 'text';
  if (family === 'camera' || family === 'transition') return 'motion';
  if (family === 'audio') return 'audio';
  return 'other';
}

function reasonForProducer(producer: CrossOverlayFinalOverlayProducer): string {
  switch (producer) {
    case 'canonical-caption-track':
      return 'caption-track-overlay-created-outside-decision-scheduler';
    case 'async-worker-audio':
      return 'async-audio-overlay-merged-after-decision-scheduler';
    case 'post-edl-drift-zoom':
      return 'post-edl-drift-zoom-keyframes-created-outside-decision-scheduler';
  }
}

function countBy<T, K extends keyof T>(
  items: T[],
  key: K,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = String(item[key] ?? 'unknown');
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function finiteFrame(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

