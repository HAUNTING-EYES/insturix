type OverlayId = string | number;

export interface ChatEditClientContext {
  currentFrame?: number;
  selectedOverlayId?: OverlayId | null;
  selectedRange?: {
    startFrame?: number;
    endFrame?: number;
  } | null;
  visibleTimeline?: {
    startFrame?: number;
    endFrame?: number;
  } | null;
  durationInFrames?: number;
  overlayCount?: number;
  canvas?: {
    width?: number;
    height?: number;
  } | null;
  playerDimensions?: {
    width?: number;
    height?: number;
  } | null;
}

export interface ChatEditContextOptions {
  clientContext?: ChatEditClientContext | null;
  selectedOverlayId?: OverlayId | null;
}

export interface ChatEditRangeSummary {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface ChatEditOverlaySummary {
  id: OverlayId;
  type: string;
  from: number;
  durationInFrames: number;
  endFrame: number;
  row?: number;
  sourceStartFrame?: number;
  content?: string;
  src?: string;
  assetId?: string;
}

export interface ChatEditContextBundle {
  project: {
    projectId?: string;
    fps: number;
    durationInFrames: number;
    durationSeconds: number;
    canvas: { width: number; height: number };
    overlayCount: number;
  };
  playhead: {
    frame: number;
    seconds: number;
    timecode: string;
    activeOverlayIds: OverlayId[];
  };
  selectedOverlay?: ChatEditOverlaySummary & {
    sceneIndex?: number;
  };
  selectedRange?: ChatEditRangeSummary;
  visibleTimeline?: ChatEditRangeSummary;
  overlayCountsByType: Record<string, number>;
  overlays: ChatEditOverlaySummary[];
  transcript: {
    captionOverlayCount: number;
    captionSegmentCount: number;
    captionWordCount: number;
    rawSegmentCount: number;
    rawWordCount: number;
    hasWordTimestamps: boolean;
  };
  audio: {
    soundOverlayCount: number;
    nativeAudioVideoCount: number;
  };
  mediaRefs: Array<{
    assetId: string;
    types: string[];
    overlayIds: OverlayId[];
  }>;
  resolverStatus: {
    userMediaSearchAvailableToChat: boolean;
    missingMomentResolvers: string[];
  };
}

const DEFAULT_FPS = 30;
const DEFAULT_CANVAS = { width: 1920, height: 1080 };
const OVERLAY_PROMPT_LIMIT = 18;

export function buildChatEditContextBundle(
  project: any,
  options: ChatEditContextOptions = {}
): ChatEditContextBundle {
  const overlays = Array.isArray(project?.overlays) ? project.overlays : [];
  const fps = positiveNumber(project?.fps) ?? DEFAULT_FPS;
  const durationInFrames = resolveDurationInFrames(project, overlays, options.clientContext);
  const canvas = resolveCanvas(project, options.clientContext);
  const currentFrame = clampFrame(
    integer(options.clientContext?.currentFrame) ?? 0,
    durationInFrames
  );
  const selectedOverlayId = options.clientContext?.selectedOverlayId ?? options.selectedOverlayId ?? null;
  const overlaySummaries = overlays
    .map((overlay: any) => summarizeOverlay(overlay))
    .sort((a: ChatEditOverlaySummary, b: ChatEditOverlaySummary) => a.from - b.from || String(a.id).localeCompare(String(b.id)));
  const selectedOverlay = resolveSelectedOverlay(overlaySummaries, selectedOverlayId);
  const selectedSceneIndex = selectedOverlay ? resolveVideoSceneIndex(overlaySummaries, selectedOverlay.id) : undefined;

  return {
    project: {
      projectId: stringValue(project?.projectId ?? project?.id),
      fps,
      durationInFrames,
      durationSeconds: round(durationInFrames / fps, 3),
      canvas,
      overlayCount: overlays.length,
    },
    playhead: {
      frame: currentFrame,
      seconds: round(currentFrame / fps, 3),
      timecode: formatTimecode(currentFrame, fps),
      activeOverlayIds: overlaySummaries
        .filter((overlay: ChatEditOverlaySummary) => currentFrame >= overlay.from && currentFrame < overlay.endFrame)
        .map((overlay: ChatEditOverlaySummary) => overlay.id),
    },
    selectedOverlay: selectedOverlay
      ? {
          ...selectedOverlay,
          sceneIndex: selectedSceneIndex,
        }
      : undefined,
    selectedRange: summarizeRange(options.clientContext?.selectedRange, durationInFrames),
    visibleTimeline: summarizeRange(options.clientContext?.visibleTimeline, durationInFrames),
    overlayCountsByType: countByType(overlaySummaries),
    overlays: overlaySummaries.slice(0, OVERLAY_PROMPT_LIMIT),
    transcript: summarizeTranscript(project, overlays),
    audio: summarizeAudio(overlays),
    mediaRefs: summarizeMediaRefs(overlays),
    resolverStatus: {
      userMediaSearchAvailableToChat: true,
      missingMomentResolvers: [
        'find_transcript_moment',
        'find_visual_moment',
        'find_audio_moment',
      ],
    },
  };
}

export function formatChatEditContextForPrompt(bundle: ChatEditContextBundle): string {
  const selected = bundle.selectedOverlay
    ? `Selected overlay: id=${bundle.selectedOverlay.id}, type=${bundle.selectedOverlay.type}, row=${bundle.selectedOverlay.row ?? 'n/a'}, frames=${bundle.selectedOverlay.from}-${bundle.selectedOverlay.endFrame}, duration=${bundle.selectedOverlay.durationInFrames}${typeof bundle.selectedOverlay.sceneIndex === 'number' ? `, scene=${bundle.selectedOverlay.sceneIndex + 1}` : ''}.`
    : 'Selected overlay: none.';
  const overlays = bundle.overlays
    .map((overlay) => `- id=${overlay.id}, type=${overlay.type}, row=${overlay.row ?? 'n/a'}, frames=${overlay.from}-${overlay.endFrame}${overlay.content ? `, text="${truncate(overlay.content, 70)}"` : ''}${overlay.assetId ? `, asset=${overlay.assetId}` : ''}`)
    .join('\n');

  return [
    'CHAT EDIT CONTEXT BUNDLE',
    `Project: fps=${bundle.project.fps}, duration=${bundle.project.durationInFrames} frames (${bundle.project.durationSeconds}s), canvas=${bundle.project.canvas.width}x${bundle.project.canvas.height}, overlays=${bundle.project.overlayCount}.`,
    `Playhead: frame=${bundle.playhead.frame}, time=${bundle.playhead.timecode}, activeOverlayIds=${bundle.playhead.activeOverlayIds.join(', ') || 'none'}.`,
    selected,
    'Reference rule: when the user says "this", "the selected", "this clip", "this scene", "here", or "regenerate this", resolve it to the selected overlay if present; otherwise resolve it from playhead and active overlays. Do not ask for a timeframe when this context is enough.',
    `Overlay counts: ${formatCounts(bundle.overlayCountsByType)}.`,
    bundle.selectedRange ? `Selected range: frames=${bundle.selectedRange.startFrame}-${bundle.selectedRange.endFrame}, duration=${bundle.selectedRange.durationInFrames}.` : 'Selected range: none.',
    bundle.visibleTimeline ? `Visible timeline: frames=${bundle.visibleTimeline.startFrame}-${bundle.visibleTimeline.endFrame}, duration=${bundle.visibleTimeline.durationInFrames}.` : 'Visible timeline: unavailable.',
    `Transcript: captionOverlays=${bundle.transcript.captionOverlayCount}, captionSegments=${bundle.transcript.captionSegmentCount}, captionWords=${bundle.transcript.captionWordCount}, rawSegments=${bundle.transcript.rawSegmentCount}, rawWords=${bundle.transcript.rawWordCount}, hasWordTimestamps=${bundle.transcript.hasWordTimestamps}.`,
    `Audio: soundOverlays=${bundle.audio.soundOverlayCount}, nativeAudioVideoOverlays=${bundle.audio.nativeAudioVideoCount}.`,
    `Media refs: ${bundle.mediaRefs.length ? bundle.mediaRefs.map((ref) => `${ref.assetId}(${ref.types.join('+')}: overlays ${ref.overlayIds.join(',')})`).join('; ') : 'none from timeline overlays'}.`,
    `User media search: ${bundle.resolverStatus.userMediaSearchAvailableToChat ? 'available via list_user_assets, search_user_assets, and inspect_user_asset' : 'unavailable'}.`,
    `Missing semantic resolvers: ${bundle.resolverStatus.missingMomentResolvers.join(', ')}. Until those are built, do not pretend you can search arbitrary transcript, frame, or audio moments beyond the supplied project state.`,
    'Visible overlays:',
    overlays || '- none',
  ].join('\n');
}

function resolveDurationInFrames(project: any, overlays: any[], clientContext?: ChatEditClientContext | null): number {
  const explicit = positiveNumber(clientContext?.durationInFrames)
    ?? positiveNumber(project?.durationInFrames)
    ?? positiveNumber(project?.duration);
  if (explicit) return Math.round(explicit);
  const overlayEnd = overlays.reduce((max, overlay) => Math.max(max, frame(overlay?.from) + duration(overlay?.durationInFrames)), 0);
  return overlayEnd || DEFAULT_FPS;
}

function resolveCanvas(project: any, clientContext?: ChatEditClientContext | null): { width: number; height: number } {
  const candidates = [
    clientContext?.canvas,
    clientContext?.playerDimensions,
    project?.canvas,
    project?.dimensions,
    project?.playerDimensions,
    project?.settings?.canvas,
  ];
  for (const candidate of candidates) {
    const width = positiveNumber(candidate?.width);
    const height = positiveNumber(candidate?.height);
    if (width && height) {
      return { width: Math.round(width), height: Math.round(height) };
    }
  }
  return DEFAULT_CANVAS;
}

function summarizeOverlay(overlay: any): ChatEditOverlaySummary {
  const from = frame(overlay?.from);
  const durationInFrames = duration(overlay?.durationInFrames);
  return {
    id: overlay?.id ?? 'unknown',
    type: stringValue(overlay?.type) ?? 'unknown',
    from,
    durationInFrames,
    endFrame: from + durationInFrames,
    row: integer(overlay?.row),
    sourceStartFrame: integer(overlay?.sourceStartFrame),
    content: firstText(overlay),
    src: stringValue(overlay?.src ?? overlay?.url),
    assetId: stringValue(overlay?.assetId ?? overlay?.sourceAssetId ?? overlay?.mediaId ?? overlay?.metadata?.assetId),
  };
}

function resolveSelectedOverlay(overlays: ChatEditOverlaySummary[], selectedOverlayId: OverlayId | null): ChatEditOverlaySummary | undefined {
  if (selectedOverlayId == null) return undefined;
  return overlays.find((overlay) => String(overlay.id) === String(selectedOverlayId));
}

function resolveVideoSceneIndex(overlays: ChatEditOverlaySummary[], selectedId: OverlayId): number | undefined {
  const videos = overlays.filter((overlay) => overlay.type === 'video').sort((a, b) => a.from - b.from);
  const index = videos.findIndex((overlay) => String(overlay.id) === String(selectedId));
  return index >= 0 ? index : undefined;
}

function countByType(overlays: ChatEditOverlaySummary[]): Record<string, number> {
  return overlays.reduce<Record<string, number>>((counts, overlay) => {
    counts[overlay.type] = (counts[overlay.type] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeRange(rangeValue: ChatEditClientContext['selectedRange'], durationInFrames: number): ChatEditRangeSummary | undefined {
  if (!rangeValue) return undefined;
  const startFrame = clampFrame(integer(rangeValue.startFrame) ?? 0, durationInFrames);
  const endFrame = clampFrame(integer(rangeValue.endFrame) ?? startFrame, durationInFrames);
  if (endFrame <= startFrame) return undefined;
  return { startFrame, endFrame, durationInFrames: endFrame - startFrame };
}

function summarizeTranscript(project: any, overlays: any[]): ChatEditContextBundle['transcript'] {
  const captionOverlays = overlays.filter((overlay) => overlay?.type === 'caption' || overlay?.type === 'captions');
  const captionSegmentCount = captionOverlays.reduce((total, overlay) => total + arrayLength(overlay?.segments ?? overlay?.captions), 0);
  const captionWordCount = captionOverlays.reduce((total, overlay) => total + countOverlayWords(overlay), 0);
  const rawContainers = [project?.rawFootageAnalysis, project?.analysis, project?.transcription, project?.transcript].filter(Boolean);
  const rawSegmentCount = rawContainers.reduce((total, item) => total + countNestedArrays(item, ['segments', 'utterances']), 0);
  const rawWordCount = rawContainers.reduce((total, item) => total + countNestedArrays(item, ['words']) + countTextWords(item?.text ?? item?.transcript), 0);

  return {
    captionOverlayCount: captionOverlays.length,
    captionSegmentCount,
    captionWordCount,
    rawSegmentCount,
    rawWordCount,
    hasWordTimestamps: rawContainers.some(hasWordTimestamps) || captionOverlays.some(hasWordTimestamps),
  };
}

function summarizeAudio(overlays: any[]): ChatEditContextBundle['audio'] {
  return {
    soundOverlayCount: overlays.filter((overlay) => overlay?.type === 'sound' || overlay?.type === 'audio').length,
    nativeAudioVideoCount: overlays.filter((overlay) => overlay?.type === 'video' && overlay?.muted !== true && overlay?.volume !== 0).length,
  };
}

function summarizeMediaRefs(overlays: any[]): ChatEditContextBundle['mediaRefs'] {
  const refs = new Map<string, { assetId: string; types: Set<string>; overlayIds: OverlayId[] }>();
  for (const overlay of overlays) {
    const assetId = stringValue(overlay?.assetId ?? overlay?.sourceAssetId ?? overlay?.mediaId ?? overlay?.metadata?.assetId);
    if (!assetId) continue;
    const existing = refs.get(assetId) ?? { assetId, types: new Set<string>(), overlayIds: [] };
    existing.types.add(stringValue(overlay?.type) ?? 'unknown');
    existing.overlayIds.push(overlay?.id ?? 'unknown');
    refs.set(assetId, existing);
  }
  return Array.from(refs.values()).map((ref) => ({
    assetId: ref.assetId,
    types: Array.from(ref.types).sort(),
    overlayIds: ref.overlayIds,
  }));
}

function firstText(overlay: any): string | undefined {
  return stringValue(
    overlay?.content
    ?? overlay?.text
    ?? overlay?.title
    ?? overlay?.label
    ?? overlay?.captions?.[0]?.text
    ?? overlay?.segments?.[0]?.text
  );
}

function countOverlayWords(overlay: any): number {
  const words = arrayLength(overlay?.words);
  if (words > 0) return words;
  return countTextWords(overlay?.content ?? overlay?.text)
    + countNestedArrays(overlay, ['words'])
    + countNestedTextWords(overlay, ['segments', 'captions']);
}

function countNestedTextWords(value: any, keys: string[]): number {
  let count = 0;
  visitLimited(value, (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of keys) {
      if (Array.isArray(node[key])) {
        count += node[key].reduce((total: number, item: any) => total + countTextWords(item?.text ?? item?.content), 0);
      }
    }
  });
  return count;
}

function countNestedArrays(value: any, keys: string[]): number {
  let count = 0;
  visitLimited(value, (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of keys) {
      if (Array.isArray(node[key])) count += node[key].length;
    }
  });
  return count;
}

function hasWordTimestamps(value: any): boolean {
  let found = false;
  visitLimited(value, (node) => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node.words) && node.words.some((word: any) => word?.start != null || word?.startFrame != null || word?.from != null)) {
      found = true;
    }
  });
  return found;
}

function visitLimited(value: any, visit: (node: any) => void): void {
  const queue = [value];
  let visited = 0;
  while (queue.length > 0 && visited < 300) {
    const node = queue.shift();
    visited += 1;
    visit(node);
    if (!node || typeof node !== 'object') continue;
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') queue.push(child);
    }
  }
}

function formatTimecode(frameNumber: number, fps: number): string {
  const totalSeconds = Math.floor(frameNumber / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor(frameNumber % fps);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([type, count]) => `${type}=${count}`).join(', ') : 'none';
}

function clampFrame(value: number, durationInFrames: number): number {
  return Math.max(0, Math.min(value, Math.max(durationInFrames, 0)));
}

function frame(value: unknown): number {
  return Math.max(0, integer(value) ?? 0);
}

function duration(value: unknown): number {
  return Math.max(1, integer(value) ?? 1);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function countTextWords(value: unknown): number {
  if (typeof value !== 'string') return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function round(value: number, places: number): number {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
