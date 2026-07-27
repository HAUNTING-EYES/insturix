type OverlayId = string | number;

export type ChatEditRangeSource =
  | 'selected-overlay'
  | 'explicit-selection'
  | 'timeline-viewport';

export interface ChatEditClientRange {
  startFrame?: number;
  endFrame?: number;
  source?: ChatEditRangeSource;
}

export interface ChatEditSpatialCursor {
  surface: 'preview' | 'timeline';
  frame?: number;
  normalizedX?: number;
  normalizedY?: number;
  canvasX?: number;
  canvasY?: number;
  capturedAtMs: number;
  source: 'last-editor-pointer';
}

export interface ChatEditClientContext {
  currentFrame?: number;
  selectedOverlayId?: OverlayId | null;
  selectedRange?: ChatEditClientRange | null;
  visibleTimeline?: ChatEditClientRange | null;
  durationInFrames?: number;
  overlayCount?: number;
  activePanel?: string | null;
  spatialCursor?: ChatEditSpatialCursor | null;
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
  contextNowMs?: number;
}

export interface ChatEditRangeSummary {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  source?: ChatEditRangeSource;
}

export interface ChatEditClientContextInput {
  currentFrame?: number;
  selectedOverlayId?: OverlayId | null;
  selectedOverlay?: {
    id?: OverlayId;
    from?: number;
    durationInFrames?: number;
  } | null;
  durationInFrames?: number;
  overlayCount?: number;
  activePanel?: string | null;
  canvas?: ChatEditClientContext['canvas'];
  playerDimensions?: ChatEditClientContext['playerDimensions'];
  timelineViewport?: {
    scrollLeft?: number;
    viewportWidth?: number;
    contentWidth?: number;
    zoomScale?: number;
  } | null;
  spatialCursor?: ChatEditSpatialCursor | null;
  nowMs?: number;
}

export interface ChatProjectResponseGuardInput {
  expectedProjectId: string;
  activeProjectId: string;
  aborted?: boolean;
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
  activePanel?: string;
  spatialCursor?: ChatEditSpatialCursor & {
    ageMs: number;
  };
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
    visualMomentSearchAvailableToChat: boolean;
    audioMomentSearchAvailableToChat: boolean;
    missingMomentResolvers: string[];
  };
}

const DEFAULT_FPS = 30;
const DEFAULT_CANVAS = { width: 1920, height: 1080 };
const OVERLAY_PROMPT_LIMIT = 18;
export const CHAT_SPATIAL_CURSOR_MAX_AGE_MS = 30_000;

export function buildChatEditClientContext(
  input: ChatEditClientContextInput,
): ChatEditClientContext {
  const durationInFrames = Math.max(0, integer(input.durationInFrames) ?? 0);
  const selectedOverlayId = input.selectedOverlayId ?? input.selectedOverlay?.id ?? null;
  const selectedOverlayMatches = Boolean(
    input.selectedOverlay
      && selectedOverlayId != null
      && String(input.selectedOverlay.id) === String(selectedOverlayId),
  );
  const selectedStart = selectedOverlayMatches
    ? clampFrame(integer(input.selectedOverlay?.from) ?? 0, durationInFrames)
    : undefined;
  const selectedDuration = selectedOverlayMatches
    ? Math.max(0, integer(input.selectedOverlay?.durationInFrames) ?? 0)
    : 0;
  const selectedEnd = selectedStart == null
    ? undefined
    : clampFrame(selectedStart + selectedDuration, durationInFrames);
  const selectedRange = selectedStart != null && selectedEnd != null && selectedEnd > selectedStart
    ? {
        startFrame: selectedStart,
        endFrame: selectedEnd,
        source: 'selected-overlay' as const,
      }
    : null;
  const nowMs = finiteNumber(input.nowMs) ?? Date.now();

  return {
    currentFrame: clampFrame(integer(input.currentFrame) ?? 0, durationInFrames),
    selectedOverlayId,
    selectedRange,
    visibleTimeline: deriveVisibleTimelineRange(input.timelineViewport, durationInFrames),
    durationInFrames,
    overlayCount: Math.max(0, integer(input.overlayCount) ?? 0),
    activePanel: sanitizeLabel(input.activePanel),
    spatialCursor: sanitizeSpatialCursor(
      input.spatialCursor,
      durationInFrames,
      input.canvas,
      nowMs,
    ),
    canvas: sanitizeDimensions(input.canvas),
    playerDimensions: sanitizeDimensions(input.playerDimensions),
  };
}

export function canApplyChatProjectResponse(
  input: ChatProjectResponseGuardInput,
): boolean {
  if (input.aborted) return false;
  const expectedProjectId = input.expectedProjectId.trim();
  const activeProjectId = input.activeProjectId.trim();
  return Boolean(expectedProjectId) && expectedProjectId === activeProjectId;
}

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
    activePanel: sanitizeLabel(options.clientContext?.activePanel),
    spatialCursor: summarizeSpatialCursor(
      options.clientContext?.spatialCursor,
      durationInFrames,
      canvas,
      finiteNumber(options.contextNowMs) ?? Date.now(),
    ),
    overlayCountsByType: countByType(overlaySummaries),
    overlays: overlaySummaries.slice(0, OVERLAY_PROMPT_LIMIT),
    transcript: summarizeTranscript(project, overlays),
    audio: summarizeAudio(overlays),
    mediaRefs: summarizeMediaRefs(overlays),
    resolverStatus: {
      userMediaSearchAvailableToChat: true,
      visualMomentSearchAvailableToChat: true,
      audioMomentSearchAvailableToChat: true,
      missingMomentResolvers: [],
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
    `Active editor panel: ${bundle.activePanel ?? 'unknown'}.`,
    bundle.spatialCursor
      ? `Last editor pointer: surface=${bundle.spatialCursor.surface}, frame=${bundle.spatialCursor.frame ?? 'n/a'}, normalized=(${bundle.spatialCursor.normalizedX ?? 'n/a'}, ${bundle.spatialCursor.normalizedY ?? 'n/a'}), canvas=(${bundle.spatialCursor.canvasX ?? 'n/a'}, ${bundle.spatialCursor.canvasY ?? 'n/a'}), ageMs=${bundle.spatialCursor.ageMs}.`
      : 'Last editor pointer: unavailable or stale.',
    selected,
    'Reference rule: when the user says "this", "the selected", "this clip", "this scene", "here", or "regenerate this", resolve it to the selected overlay if present; otherwise resolve it from playhead and active overlays. Do not ask for a timeframe when this context is enough.',
    `Overlay counts: ${formatCounts(bundle.overlayCountsByType)}.`,
    bundle.selectedRange ? `Selected range: frames=${bundle.selectedRange.startFrame}-${bundle.selectedRange.endFrame}, duration=${bundle.selectedRange.durationInFrames}, source=${bundle.selectedRange.source ?? 'unspecified'}.` : 'Selected range: none.',
    bundle.visibleTimeline ? `Visible timeline: frames=${bundle.visibleTimeline.startFrame}-${bundle.visibleTimeline.endFrame}, duration=${bundle.visibleTimeline.durationInFrames}, source=${bundle.visibleTimeline.source ?? 'unspecified'}.` : 'Visible timeline: unavailable.',
    `Transcript: captionOverlays=${bundle.transcript.captionOverlayCount}, captionSegments=${bundle.transcript.captionSegmentCount}, captionWords=${bundle.transcript.captionWordCount}, rawSegments=${bundle.transcript.rawSegmentCount}, rawWords=${bundle.transcript.rawWordCount}, hasWordTimestamps=${bundle.transcript.hasWordTimestamps}.`,
    `Audio: soundOverlays=${bundle.audio.soundOverlayCount}, nativeAudioVideoOverlays=${bundle.audio.nativeAudioVideoCount}.`,
    `Media refs: ${bundle.mediaRefs.length ? bundle.mediaRefs.map((ref) => `${ref.assetId}(${ref.types.join('+')}: overlays ${ref.overlayIds.join(',')})`).join('; ') : 'none from timeline overlays'}.`,
    `User media search: ${bundle.resolverStatus.userMediaSearchAvailableToChat ? 'available via list_user_assets, search_user_assets, and inspect_user_asset' : 'unavailable'}.`,
    'Transcript moment search: available via find_transcript_moment for spoken phrase, word-range, and frame candidates.',
    `Visual moment search: ${bundle.resolverStatus.visualMomentSearchAvailableToChat ? 'available via find_visual_moment for stored visual analysis, overlay metadata, object/action/scene text, OCR text, and frame candidates' : 'unavailable'}.`,
    `Audio moment search: ${bundle.resolverStatus.audioMomentSearchAvailableToChat ? 'available via find_audio_moment for stored beat, silence, filler, music-section, energy, and sound-overlay frame candidates' : 'unavailable'}.`,
    `Missing semantic resolvers: ${bundle.resolverStatus.missingMomentResolvers.join(', ') || 'none'}. Do not pretend you can search moments beyond the supplied project state.`,
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
  const source = sanitizeRangeSource(rangeValue.source);
  return {
    startFrame,
    endFrame,
    durationInFrames: endFrame - startFrame,
    ...(source ? { source } : {}),
  };
}

function deriveVisibleTimelineRange(
  viewport: ChatEditClientContextInput['timelineViewport'],
  durationInFrames: number,
): ChatEditClientRange | null {
  if (!viewport || durationInFrames <= 0) return null;
  const viewportWidth = positiveNumber(viewport.viewportWidth);
  if (!viewportWidth) return null;
  const zoomScale = positiveNumber(viewport.zoomScale) ?? 1;
  const contentWidth = Math.max(
    positiveNumber(viewport.contentWidth) ?? 0,
    viewportWidth * zoomScale,
    viewportWidth,
  );
  const maxScrollLeft = Math.max(0, contentWidth - viewportWidth);
  const scrollLeft = Math.min(
    Math.max(0, finiteNumber(viewport.scrollLeft) ?? 0),
    maxScrollLeft,
  );
  const startFrame = clampFrame(
    Math.floor((scrollLeft / contentWidth) * durationInFrames),
    durationInFrames,
  );
  const endFrame = clampFrame(
    Math.ceil(((scrollLeft + viewportWidth) / contentWidth) * durationInFrames),
    durationInFrames,
  );
  if (endFrame <= startFrame) return null;
  return { startFrame, endFrame, source: 'timeline-viewport' };
}

function summarizeSpatialCursor(
  cursor: ChatEditSpatialCursor | null | undefined,
  durationInFrames: number,
  canvas: ChatEditClientContext['canvas'],
  nowMs: number,
): ChatEditContextBundle['spatialCursor'] {
  const sanitized = sanitizeSpatialCursor(cursor, durationInFrames, canvas, nowMs);
  if (!sanitized) return undefined;
  return {
    ...sanitized,
    ageMs: Math.max(0, Math.round(nowMs - sanitized.capturedAtMs)),
  };
}

function sanitizeSpatialCursor(
  cursor: ChatEditSpatialCursor | null | undefined,
  durationInFrames: number,
  canvas: ChatEditClientContext['canvas'],
  nowMs: number,
): ChatEditSpatialCursor | undefined {
  if (!cursor || (cursor.surface !== 'preview' && cursor.surface !== 'timeline')) return undefined;
  const capturedAtMs = finiteNumber(cursor.capturedAtMs);
  if (capturedAtMs == null) return undefined;
  const ageMs = nowMs - capturedAtMs;
  if (ageMs < -5_000 || ageMs > CHAT_SPATIAL_CURSOR_MAX_AGE_MS) return undefined;
  const dimensions = sanitizeDimensions(canvas);
  const frameValue = integer(cursor.frame);
  const normalizedX = unitNumber(cursor.normalizedX);
  const normalizedY = unitNumber(cursor.normalizedY);
  const canvasX = dimensions ? boundedNumber(cursor.canvasX, 0, dimensions.width) : undefined;
  const canvasY = dimensions ? boundedNumber(cursor.canvasY, 0, dimensions.height) : undefined;

  return {
    surface: cursor.surface,
    ...(frameValue == null ? {} : { frame: clampFrame(frameValue, durationInFrames) }),
    ...(normalizedX == null ? {} : { normalizedX }),
    ...(normalizedY == null ? {} : { normalizedY }),
    ...(canvasX == null ? {} : { canvasX: Math.round(canvasX) }),
    ...(canvasY == null ? {} : { canvasY: Math.round(canvasY) }),
    capturedAtMs: Math.round(capturedAtMs),
    source: 'last-editor-pointer',
  };
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

function sanitizeRangeSource(value: unknown): ChatEditRangeSource | undefined {
  return value === 'selected-overlay'
    || value === 'explicit-selection'
    || value === 'timeline-viewport'
    ? value
    : undefined;
}

function sanitizeDimensions(
  value: ChatEditClientContext['canvas'] | ChatEditClientContext['playerDimensions'],
): { width: number; height: number } | null {
  const width = positiveNumber(value?.width);
  const height = positiveNumber(value?.height);
  return width && height
    ? { width: Math.round(width), height: Math.round(height) }
    : null;
}

function sanitizeLabel(value: unknown): string | undefined {
  const label = stringValue(value);
  return label ? truncate(label, 64) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function unitNumber(value: unknown): number | undefined {
  return boundedNumber(value, 0, 1);
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  const number = finiteNumber(value);
  return number == null ? undefined : Math.max(minimum, Math.min(number, maximum));
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
