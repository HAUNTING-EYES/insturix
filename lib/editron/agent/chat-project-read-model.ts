const READ_MODEL_VERSION = 'chat-project-read.v1';
const DEFAULT_MAX_OUTPUT_CHARS = 120_000;
const MAX_DETAILED_OVERLAYS = 320;
const MAX_TEXT_CHARS = 800;
const MAX_HTML_CHARS = 2_000;
const MAX_LABEL_CHARS = 240;
const MAX_SAMPLE_ITEMS = 6;

type UnknownRecord = Record<string, unknown>;

export interface ChatProjectReadOptions {
  overlayIds?: string[];
  maxOutputChars?: number;
}

export interface ChatProjectReadModel {
  schemaVersion: typeof READ_MODEL_VERSION;
  project: UnknownRecord;
  overlays: UnknownRecord[];
  summary: {
    sourceOverlayCount: number;
    selectedOverlayCount: number;
    includedOverlayCount: number;
    countsByType: Record<string, number>;
  };
  omissions: {
    rawProjectFields: string[];
    rawOverlayMetadata: true;
    embeddedMedia: true;
    signedUrlQueries: true;
    detailedOverlayLimit: number;
    outputBudgetChars: number;
    truncated: boolean;
    omittedOverlayCount: number;
    nextAction?: string;
  };
}

export function buildChatProjectReadModel(
  projectValue: unknown,
  options: ChatProjectReadOptions = {},
): ChatProjectReadModel {
  const project = asRecord(projectValue);
  const allOverlays = Array.isArray(project.overlays) ? project.overlays.filter(isRecord) : [];
  const requestedIds = new Set((options.overlayIds ?? []).map(String));
  const selectedOverlays = requestedIds.size > 0
    ? allOverlays.filter((overlay) => requestedIds.has(String(overlay.id)))
    : allOverlays;
  const outputBudgetChars = positiveInteger(options.maxOutputChars) ?? DEFAULT_MAX_OUTPUT_CHARS;
  const detailed = selectedOverlays
    .slice(0, MAX_DETAILED_OVERLAYS)
    .map((overlay) => summarizeOverlay(overlay, false));
  const countsByType = countByType(selectedOverlays);

  let model = makeModel(project, allOverlays.length, selectedOverlays.length, detailed, countsByType, {
    outputBudgetChars,
    truncated: selectedOverlays.length > detailed.length,
  });

  if (serializedLength(model) > outputBudgetChars) {
    model = makeModel(
      project,
      allOverlays.length,
      selectedOverlays.length,
      selectedOverlays.slice(0, MAX_DETAILED_OVERLAYS).map((overlay) => summarizeOverlay(overlay, true)),
      countsByType,
      { outputBudgetChars, truncated: selectedOverlays.length > MAX_DETAILED_OVERLAYS },
    );
  }

  while (model.overlays.length > 1 && serializedLength(model) > outputBudgetChars) {
    model.overlays = model.overlays.slice(0, Math.max(1, Math.floor(model.overlays.length * 0.75)));
    updateTruncation(model, selectedOverlays.length);
  }

  if (serializedLength(model) > outputBudgetChars) {
    model.overlays = [];
    updateTruncation(model, selectedOverlays.length);
  }

  return model;
}

function makeModel(
  project: UnknownRecord,
  sourceOverlayCount: number,
  selectedOverlayCount: number,
  overlays: UnknownRecord[],
  countsByType: Record<string, number>,
  options: { outputBudgetChars: number; truncated: boolean },
): ChatProjectReadModel {
  const durationInFrames = resolveDuration(project, overlays);
  const fps = finiteNumber(project.fps) ?? 30;
  const canvas = firstDimensions(
    project.playerDimensions,
    project.dimensions,
    project.canvas,
    asRecord(project.settings).canvas,
  );

  const model: ChatProjectReadModel = {
    schemaVersion: READ_MODEL_VERSION,
    project: compactDefined({
      id: text(project.projectId ?? project.id, MAX_LABEL_CHARS),
      name: text(project.name ?? project.title, MAX_LABEL_CHARS),
      status: text(project.status, MAX_LABEL_CHARS),
      editMethod: text(project.editMethod, MAX_LABEL_CHARS),
      fps,
      durationInFrames,
      durationSeconds: round(durationInFrames / Math.max(1, fps), 3),
      canvas,
      aspectRatio: text(project.aspectRatio, MAX_LABEL_CHARS),
      sourceAssetIds: stringList(project.sourceAssetIds, 100),
      primaryAssetId: text(project.primaryAssetId, MAX_LABEL_CHARS),
    }),
    overlays,
    summary: {
      sourceOverlayCount,
      selectedOverlayCount,
      includedOverlayCount: overlays.length,
      countsByType,
    },
    omissions: {
      rawProjectFields: [
        'analysis',
        'intelligence',
        'rawFootageAnalysis',
        'segmentAnalysis',
        'vjepaAnalysis',
        'wav2vecAnalysis',
        'musicStructure',
        'momentMap',
        'productionBrief',
      ],
      rawOverlayMetadata: true,
      embeddedMedia: true,
      signedUrlQueries: true,
      detailedOverlayLimit: MAX_DETAILED_OVERLAYS,
      outputBudgetChars: options.outputBudgetChars,
      truncated: options.truncated,
      omittedOverlayCount: Math.max(0, selectedOverlayCount - overlays.length),
      ...(options.truncated
        ? { nextAction: 'Call read_project_file with mode=byTrackIds for exact overlay ids that need deeper inspection.' }
        : {}),
    },
  };

  return model;
}

function summarizeOverlay(overlay: UnknownRecord, minimal: boolean): UnknownRecord {
  const from = frame(overlay.from);
  const durationInFrames = duration(overlay.durationInFrames);
  const type = text(overlay.type, 80) ?? 'unknown';
  const common = compactDefined({
    id: overlay.id ?? 'unknown',
    type,
    name: text(overlay.name ?? overlay.label, MAX_LABEL_CHARS),
    from,
    durationInFrames,
    endFrame: from + durationInFrames,
    row: integer(overlay.row),
    visible: booleanValue(overlay.visible),
    locked: booleanValue(overlay.locked),
    assetId: text(
      overlay.assetId ?? overlay.sourceAssetId ?? overlay.mediaId ?? asRecord(overlay.metadata).assetId,
      MAX_LABEL_CHARS,
    ),
  });
  const content = extractOverlayText(overlay, minimal ? 140 : textLimitForType(type));

  if (minimal) {
    return compactDefined({ ...common, content });
  }

  const position = firstPosition(overlay.position, overlay);
  const size = firstDimensions(overlay.size, overlay);
  const metadata = asRecord(overlay.metadata);
  const source = compactDefined({
    sourceStartFrame: integer(overlay.sourceStartFrame),
    sourceEndFrame: integer(overlay.sourceEndFrame),
    startFromSound: integer(overlay.startFromSound),
    trimStart: finiteNumber(overlay.trimStart),
    trimEnd: finiteNumber(overlay.trimEnd),
    playbackRate: finiteNumber(overlay.playbackRate ?? overlay.speed),
    volume: finiteNumber(overlay.volume),
    muted: booleanValue(overlay.muted),
  });
  const media = compactDefined({
    src: mediaReference(overlay.src ?? overlay.url ?? overlay.assetUrl),
    poster: mediaReference(overlay.poster ?? overlay.thumbnailUrl),
    sequenceId: text(overlay.sequenceId ?? metadata.sequenceId, MAX_LABEL_CHARS),
    frameCount: integer(overlay.frameCount ?? metadata.frameCount),
    frameFormat: text(overlay.frameFormat ?? metadata.frameFormat, 40),
  });
  const family = compactDefined({
    role: text(overlay.role ?? metadata.role, MAX_LABEL_CHARS),
    intent: text(overlay.intent ?? metadata.intent, MAX_LABEL_CHARS),
    reason: text(overlay.reason ?? metadata.reason, MAX_TEXT_CHARS),
    transitionType: text(overlay.transitionType ?? overlay.transitionStyle, MAX_LABEL_CHARS),
    direction: text(overlay.direction, MAX_LABEL_CHARS),
    clipAId: overlay.clipAId,
    clipBId: overlay.clipBId,
    shapeType: text(overlay.shapeType, MAX_LABEL_CHARS),
    stickerType: text(overlay.stickerType, MAX_LABEL_CHARS),
    provider: text(overlay.provider ?? metadata.provider, MAX_LABEL_CHARS),
  });
  const counts = compactDefined({
    wordCount: arrayLength(overlay.words) ?? arrayLength(metadata.words),
    segmentCount: arrayLength(overlay.segments) ?? arrayLength(metadata.segments),
    keyframeCount: totalArrayLength(overlay.keyframes, metadata.keyframes),
  });

  return compactDefined({
    ...common,
    content,
    position,
    size,
    rotation: finiteNumber(overlay.rotation),
    opacity: finiteNumber(overlay.opacity),
    source: hasKeys(source) ? source : undefined,
    media: hasKeys(media) ? media : undefined,
    styles: summarizeStyles(overlay.styles ?? overlay.style),
    family: hasKeys(family) ? family : undefined,
    counts: hasKeys(counts) ? counts : undefined,
    samples: summarizeOverlaySamples(overlay),
  });
}

function summarizeStyles(value: unknown): UnknownRecord | undefined {
  const styles = asRecord(value);
  const result = compactDefined({
    fontFamily: text(styles.fontFamily, MAX_LABEL_CHARS),
    fontSize: finiteNumber(styles.fontSize) ?? text(styles.fontSize, 40),
    fontWeight: finiteNumber(styles.fontWeight) ?? text(styles.fontWeight, 40),
    fontStyle: text(styles.fontStyle, 40),
    color: text(styles.color, 80),
    backgroundColor: text(styles.backgroundColor, 80),
    textAlign: text(styles.textAlign, 40),
    lineHeight: finiteNumber(styles.lineHeight) ?? text(styles.lineHeight, 40),
    letterSpacing: finiteNumber(styles.letterSpacing) ?? text(styles.letterSpacing, 40),
    borderRadius: finiteNumber(styles.borderRadius) ?? text(styles.borderRadius, 40),
    animation: summarizeAnimation(styles.animation),
  });
  return hasKeys(result) ? result : undefined;
}

function summarizeAnimation(value: unknown): UnknownRecord | undefined {
  const animation = asRecord(value);
  const result = compactDefined({
    type: text(animation.type ?? animation.name, 80),
    duration: finiteNumber(animation.duration),
    delay: finiteNumber(animation.delay),
    easing: text(animation.easing, 100),
  });
  return hasKeys(result) ? result : undefined;
}

function summarizeOverlaySamples(overlay: UnknownRecord): UnknownRecord | undefined {
  const words = arrayRecords(overlay.words ?? asRecord(overlay.metadata).words)
    .slice(0, MAX_SAMPLE_ITEMS)
    .map((word) => compactDefined({
      text: text(word.word ?? word.text, 100),
      startFrame: integer(word.startFrame),
      endFrame: integer(word.endFrame),
      startMs: finiteNumber(word.startMs ?? word.start),
      endMs: finiteNumber(word.endMs ?? word.end),
    }));
  const segments = arrayRecords(overlay.segments ?? asRecord(overlay.metadata).segments)
    .slice(0, MAX_SAMPLE_ITEMS)
    .map((segment) => compactDefined({
      text: text(segment.text ?? segment.content, 180),
      startFrame: integer(segment.startFrame),
      endFrame: integer(segment.endFrame),
      startMs: finiteNumber(segment.startMs ?? segment.start),
      endMs: finiteNumber(segment.endMs ?? segment.end),
    }));
  const result = compactDefined({
    words: words.length > 0 ? words : undefined,
    segments: segments.length > 0 ? segments : undefined,
  });
  return hasKeys(result) ? result : undefined;
}

function extractOverlayText(overlay: UnknownRecord, limit: number): string | undefined {
  const candidates = [
    overlay.content,
    overlay.text,
    overlay.title,
    overlay.label,
    overlay.html,
    asRecord(overlay.content).text,
    asRecord(overlay.content).primary,
    asRecord(overlay.content).secondary,
  ];
  for (const candidate of candidates) {
    const value = text(candidate, limit);
    if (value) return value;
  }
  const segmentText = arrayRecords(overlay.segments)
    .slice(0, MAX_SAMPLE_ITEMS)
    .map((segment) => text(segment.text ?? segment.content, 180))
    .filter((value): value is string => Boolean(value))
    .join(' ');
  return text(segmentText, limit);
}

function textLimitForType(type: string): number {
  return type === 'html' || type === 'html-scene' ? MAX_HTML_CHARS : MAX_TEXT_CHARS;
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  let result = value
    .replace(/data:[^,;\s]+(?:;[^,\s]+)*,[A-Za-z0-9+/=_-]{40,}/gi, (match) => `[embedded-media-omitted:${match.length}-chars]`)
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => mediaReference(match) ?? '[external-url-omitted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim();
  if (!result) return undefined;
  if (looksLikeOpaquePayload(result)) {
    return `[opaque-payload-omitted:${result.length}-chars]`;
  }
  if (result.length > limit) result = `${result.slice(0, Math.max(0, limit - 18))}[...truncated]`;
  return result;
}

function mediaReference(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const source = value.trim();
  if (source.startsWith('data:')) return `[embedded-media-omitted:${source.length}-chars]`;
  if (source.startsWith('blob:')) return '[browser-blob-omitted]';
  try {
    const url = new URL(source);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return boundedPlainText(url.toString(), 500);
  } catch {
    return boundedPlainText(source, 500);
  }
}

function boundedPlainText(value: string, limit: number): string | undefined {
  const result = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim();
  if (!result) return undefined;
  if (result.length <= limit) return result;
  return `${result.slice(0, Math.max(0, limit - 18))}[...truncated]`;
}

function looksLikeOpaquePayload(value: string): boolean {
  if (value.length < 512) return false;
  const sample = value.slice(0, 2_000).replace(/\s/g, '');
  if (!sample) return false;
  const opaqueChars = sample.match(/[A-Za-z0-9+/=_-]/g)?.length ?? 0;
  return opaqueChars / sample.length > 0.96;
}

function resolveDuration(project: UnknownRecord, overlays: UnknownRecord[]): number {
  const explicit = positiveInteger(project.durationInFrames);
  if (explicit != null) return explicit;
  return overlays.reduce((maximum, overlay) => {
    return Math.max(maximum, frame(overlay.from) + duration(overlay.durationInFrames));
  }, 0);
}

function firstDimensions(...candidates: unknown[]): UnknownRecord | undefined {
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const width = positiveInteger(record.width);
    const height = positiveInteger(record.height);
    if (width != null && height != null) return { width, height };
  }
  return undefined;
}

function firstPosition(...candidates: unknown[]): UnknownRecord | undefined {
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const x = finiteNumber(record.x ?? record.left);
    const y = finiteNumber(record.y ?? record.top);
    if (x != null || y != null) return compactDefined({ x, y });
  }
  return undefined;
}

function countByType(overlays: UnknownRecord[]): Record<string, number> {
  return overlays.reduce<Record<string, number>>((counts, overlay) => {
    const type = text(overlay.type, 80) ?? 'unknown';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

function updateTruncation(model: ChatProjectReadModel, selectedOverlayCount: number): void {
  model.summary.includedOverlayCount = model.overlays.length;
  model.omissions.truncated = selectedOverlayCount > model.overlays.length;
  model.omissions.omittedOverlayCount = Math.max(0, selectedOverlayCount - model.overlays.length);
  if (model.omissions.truncated) {
    model.omissions.nextAction = 'Call read_project_file with mode=byTrackIds for exact overlay ids that need deeper inspection.';
  }
}

function compactDefined(value: UnknownRecord): UnknownRecord {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function hasKeys(value: UnknownRecord): boolean {
  return Object.keys(value).length > 0;
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arrayRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function totalArrayLength(...values: unknown[]): number | undefined {
  const total = values.reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
  return total > 0 ? total : undefined;
}

function stringList(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .slice(0, limit)
    .map((item) => text(item, MAX_LABEL_CHARS))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function integer(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number == null ? undefined : Math.round(number);
}

function positiveInteger(value: unknown): number | undefined {
  const number = integer(value);
  return number != null && number > 0 ? number : undefined;
}

function frame(value: unknown): number {
  return Math.max(0, integer(value) ?? 0);
}

function duration(value: unknown): number {
  return Math.max(0, integer(value) ?? 0);
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function serializedLength(value: unknown): number {
  return JSON.stringify(value).length;
}

function round(value: number, decimals: number): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
