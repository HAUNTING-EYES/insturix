import sharp from 'sharp';

import { ensureLiveAtomicOverlayReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import type { AtomicOverlayReceipt } from '@/lib/editron/engine/atomic-overlay-core';
import { evaluateAllTracks } from '@/components/editron/editor/version-7.0.0/utils/keyframe-evaluator';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  scoreRenderedFrameAesthetic,
  type RenderedFrameAestheticReport,
  type RenderedOverlayBox,
  type RenderedOverlayEvidence,
} from '@/lib/editron/motion-graphics/engine/eval/rendered-aesthetic';
import type { RenderImageStats } from '@/lib/editron/motion-graphics/engine/eval/render-validity';
import {
  buildPhase0RenderedQualityEvidencePayload,
  withPhase0RenderedAestheticReport,
  withPhase0RenderArtifactPack,
  type Phase0FixtureManifest,
  type Phase0OverlayLike,
  type Phase0RenderedAestheticReportLike,
  type Phase0RenderedQualityEvidencePayload,
} from './phase0-fixture-manifest';
import type { Phase0RenderArtifactPack, Phase0RenderSample } from './phase0-render-artifact-pack';

export interface Phase0RenderedStillFrameForScoring {
  frame: number;
  url: string;
  baselineUrl?: string;
}

export interface Phase0RenderedStillEvidenceForScoring {
  renderedFrames: Phase0RenderedStillFrameForScoring[];
}

export interface Phase0RenderedAestheticScoringResult {
  report: Phase0RenderedAestheticReportLike;
  qualityEvidence: Phase0RenderedQualityEvidencePayload;
  manifest: Phase0FixtureManifest;
}

export interface RawRenderedStillImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

export type ReadRenderedStillImage = (url: string) => Promise<RawRenderedStillImage>;

interface BuildRenderedAestheticEvidenceOptions {
  readImage?: ReadRenderedStillImage;
}

interface FrameReportLike {
  frame: number;
  activeOverlayIds: Array<string | number>;
  activeOverlayTypes: string[];
  fullStill: string;
  baselineStill: string;
  sample: Phase0RenderSample;
  report: RenderedFrameAestheticReport;
}

export async function buildPhase0RenderedAestheticEvidence(
  manifest: Phase0FixtureManifest,
  artifactPack: Phase0RenderArtifactPack,
  stillEvidence: Phase0RenderedStillEvidenceForScoring,
  options: BuildRenderedAestheticEvidenceOptions = {},
): Promise<Phase0RenderedAestheticScoringResult | null> {
  if (!stillEvidence.renderedFrames.length) return null;

  const packedManifest = withPhase0RenderArtifactPack(manifest, artifactPack);
  const readImage = options.readImage ?? readRenderedStillImage;
  const samplesByFrame = new Map(artifactPack.samplePlan.samples.map((sample) => [sample.frame, sample]));
  const frames: FrameReportLike[] = [];

  for (const still of stillEvidence.renderedFrames) {
    const sample = samplesByFrame.get(still.frame) ?? fallbackSample(still.frame);
    frames.push(await scoreRenderedStillFrame({
      artifactPack,
      still,
      sample,
      readImage,
    }));
  }

  const report = buildRenderedAestheticReport({
    artifactPack,
    frames,
  });
  const renderedManifest = withPhase0RenderedAestheticReport(packedManifest, report);
  return {
    report,
    manifest: renderedManifest,
    qualityEvidence: buildPhase0RenderedQualityEvidencePayload(renderedManifest),
  };
}

export async function readRenderedStillImage(url: string): Promise<RawRenderedStillImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch rendered still ${response.status} ${response.statusText}`.trim());
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return decodeRenderedStillImage(bytes);
}

export async function decodeRenderedStillImage(bytes: Buffer): Promise<RawRenderedStillImage> {
  const output = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
    channels: output.info.channels,
  };
}

async function scoreRenderedStillFrame(input: {
  artifactPack: Phase0RenderArtifactPack;
  still: Phase0RenderedStillFrameForScoring;
  sample: Phase0RenderSample;
  readImage: ReadRenderedStillImage;
}): Promise<FrameReportLike> {
  const { artifactPack, still, sample } = input;
  let fullImage: RawRenderedStillImage | undefined;
  let baselineImage: RawRenderedStillImage | undefined;
  let renderError: unknown;

  try {
    fullImage = await input.readImage(still.url);
  } catch (err: unknown) {
    renderError = err;
  }

  if (fullImage && still.baselineUrl) {
    try {
      baselineImage = await input.readImage(still.baselineUrl);
    } catch (err: unknown) {
      renderError = err;
    }
  } else if (fullImage && !still.baselineUrl) {
    renderError = new Error('baseline rendered still missing; cannot score overlay pixels against control frame');
  }

  const activeOverlays = activeRenderedOverlayEvidence(
    artifactPack.renderInput.overlays,
    still.frame,
    artifactPack.renderInput.fps,
    artifactPack.renderInput.width,
    artifactPack.renderInput.height,
    sample,
    fullImage,
    baselineImage,
  );
  const image = fullImage ? imageStats(fullImage, baselineImage) : undefined;
  const report = scoreRenderedFrameAesthetic({
    width: artifactPack.renderInput.width,
    height: artifactPack.renderInput.height,
    fps: artifactPack.renderInput.fps,
    frame: still.frame,
    image,
    renderError,
    blankImageJustification: blankImageJustification(sample, activeOverlays),
    overlays: activeOverlays,
  });

  return {
    frame: still.frame,
    sample,
    activeOverlayIds: activeOverlays.map((overlay) => overlay.id).filter((id): id is string | number => id !== undefined),
    activeOverlayTypes: activeOverlays.map((overlay) => String(overlay.type ?? 'unknown')),
    fullStill: still.url,
    baselineStill: still.baselineUrl ?? '',
    report,
  };
}

function activeRenderedOverlayEvidence(
  overlays: Phase0OverlayLike[],
  frame: number,
  fps: number,
  width: number,
  height: number,
  sample: Phase0RenderSample,
  fullImage?: RawRenderedStillImage,
  baselineImage?: RawRenderedStillImage,
): RenderedOverlayEvidence[] {
  return overlays
    .filter((overlay) => isAuditedVisualOverlay(String(overlay.type ?? '')) && isActiveAtFrame(overlay, frame))
    .flatMap((overlay) => {
      const frameOverlay = frameAwareOverlay(overlay, frame, fps);
      if (!frameOverlay) return [];
      const withReceipt = ensureLiveAtomicOverlayReceipt(frameOverlay as Overlay, {
        source: 'phase0-rendered-aesthetic-scoring',
        reason: 'rendered Phase 0 evidence sampled this overlay at frame',
      }) as Overlay & { metadata?: Record<string, unknown> };
      const metadata = withReceipt.metadata as { atomicOverlayReceipt?: AtomicOverlayReceipt } | undefined;
      const receipt = metadata?.atomicOverlayReceipt;
      if (!receipt && String(overlay.type) === 'caption') return [];

      const box = renderedOverlayBoxAtFrame(frameOverlay, frame);
      const pixelEvidence = fullImage && baselineImage
        ? overlayPixelEvidence(fullImage, baselineImage, box, width, height)
        : {};
      return [{
        id: overlay.id,
        type: String(overlay.type ?? 'unknown'),
        family: receipt?.family,
        receipt,
        sampleRoles: sample.roles,
        visualIntentStageMode: readString((overlay.metadata as Record<string, unknown> | undefined)?.visualIntentStageMode),
        box: {
          ...box,
          ...pixelEvidence,
        },
      }];
    });
}

function frameAwareOverlay(
  overlay: Phase0OverlayLike,
  frame: number,
  fps: number,
): Phase0OverlayLike | null {
  if (String(overlay.type ?? '') !== 'caption') return overlay;
  const captionText = activeCaptionTextAtFrame(overlay, frame, fps);
  if (!captionText) return null;
  return {
    ...overlay,
    from: frame,
    durationInFrames: captionText.durationFrames,
    content: captionText.text,
    text: captionText.text,
    captionText: captionText.text,
  };
}

function activeCaptionTextAtFrame(
  overlay: Phase0OverlayLike,
  frame: number,
  fps: number,
): { text: string; durationFrames: number } | null {
  const captions = Array.isArray((overlay as Record<string, unknown>).captions)
    ? (overlay as Record<string, unknown>).captions as unknown[]
    : [];
  if (!captions.length) {
    const text = firstNonEmptyString(overlay.captionText, overlay.text, overlay.content);
    return text ? { text, durationFrames: Math.max(1, readNumber(overlay.durationInFrames, 1)) } : null;
  }

  const timeMs = (frame / Math.max(1, fps)) * 1000;
  for (const item of captions) {
    const record = asRecord(item);
    const startMs = readTimestampMs({
      explicitMs: record.startMs,
      secondsOrMs: [record.start, record.startTime],
      fallback: 0,
    });
    const endMs = readTimestampMs({
      explicitMs: record.endMs,
      secondsOrMs: [record.end, record.endTime],
      fallback: startMs + 1000,
    });
    if (timeMs < startMs || timeMs > endMs) continue;

    const wordText = activeCaptionWords(record.words, timeMs);
    const text = wordText || firstNonEmptyString(record.text, record.content, record.word);
    if (!text) return null;
    return {
      text,
      durationFrames: Math.max(1, Math.round(((endMs - startMs) / 1000) * fps)),
    };
  }

  return null;
}

function activeCaptionWords(words: unknown, timeMs: number): string {
  if (!Array.isArray(words)) return '';
  const active = words
    .map(asRecord)
    .filter((word) => {
      const startMs = readTimestampMs({
        explicitMs: word.startMs,
        secondsOrMs: [word.start, word.startTime],
        fallback: 0,
      });
      const endMs = readTimestampMs({
        explicitMs: word.endMs,
        secondsOrMs: [word.end, word.endTime],
        fallback: startMs + 350,
      });
      return timeMs >= startMs && timeMs <= endMs;
    })
    .map((word) => firstNonEmptyString(word.word, word.text, word.content))
    .filter((word): word is string => Boolean(word));
  return active.join(' ').trim();
}

function renderedOverlayBoxAtFrame(
  overlay: Phase0OverlayLike,
  frame: number,
): RenderedOverlayBox {
  const localFrame = Math.max(0, frame - readNumber(overlay.from, 0));
  const keyframes = Array.isArray((overlay as Record<string, unknown>).keyframeTracks)
    ? evaluateAllTracks((overlay as Record<string, unknown>).keyframeTracks as any, localFrame)
    : {};
  let x = readNumber(keyframes.x, readNumber(overlay.left, 0));
  let y = readNumber(keyframes.y, readNumber(overlay.top, 0));
  let boxWidth = readNumber(overlay.width, 1);
  let boxHeight = readNumber(overlay.height, 1);
  const scale = readNumber(keyframes.scale, 1);
  const opacity = readNumber(keyframes.opacity, readOpacity(overlay), 1);

  if (scale !== 1) {
    const scaledWidth = boxWidth * scale;
    const scaledHeight = boxHeight * scale;
    x -= (scaledWidth - boxWidth) / 2;
    y -= (scaledHeight - boxHeight) / 2;
    boxWidth = scaledWidth;
    boxHeight = scaledHeight;
  }

  return {
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    opacity,
    textPixelHeight: fontSizePx(asRecord(overlay.styles).fontSize),
  };
}

function imageStats(fullImage: RawRenderedStillImage, baselineImage?: RawRenderedStillImage): RenderImageStats {
  const sample = sampledPixels(fullImage);
  let alphaTotal = 0;
  let lumaTotal = 0;
  const lumas: number[] = [];
  let changed = 0;

  for (const offset of sample.offsets) {
    const alpha = fullImage.data[offset + 3] ?? 255;
    const luma = pixelLuma(fullImage.data, offset);
    alphaTotal += alpha / 255;
    lumaTotal += luma;
    lumas.push(luma);
    if (baselineImage && sameDimensions(fullImage, baselineImage) && pixelsDiffer(fullImage.data, baselineImage.data, offset)) {
      changed += 1;
    }
  }

  const mean = lumaTotal / Math.max(1, lumas.length);
  const variance = lumas.reduce((sum, luma) => sum + ((luma - mean) ** 2), 0) / Math.max(1, lumas.length);
  return {
    lumaStdDev: round3(Math.sqrt(variance)),
    alphaMean: round3(alphaTotal / Math.max(1, lumas.length)),
    ...(baselineImage && sameDimensions(fullImage, baselineImage)
      ? { visiblePixelRatio: round4(changed / Math.max(1, sample.offsets.length)) }
      : {}),
  };
}

function overlayPixelEvidence(
  fullImage: RawRenderedStillImage,
  baselineImage: RawRenderedStillImage,
  box: RenderedOverlayBox,
  width: number,
  height: number,
): Pick<RenderedOverlayBox, 'visiblePixelRatio' | 'localBackgroundLuma' | 'foregroundLuma' | 'contrastRatio'> {
  if (!sameDimensions(fullImage, baselineImage)) return {};
  const bounds = clampBox(box, width, height);
  if (!bounds) return { visiblePixelRatio: 0 };

  const offsets = sampledOffsetsInBox(fullImage, bounds);
  let changed = 0;
  const foreground: number[] = [];
  const background: number[] = [];
  for (const offset of offsets) {
    const baseLuma = pixelLuma(baselineImage.data, offset);
    background.push(baseLuma);
    if (pixelsDiffer(fullImage.data, baselineImage.data, offset)) {
      changed += 1;
      foreground.push(pixelLuma(fullImage.data, offset));
    }
  }

  const localBackgroundLuma = average(background);
  const foregroundLuma = average(foreground);
  return {
    visiblePixelRatio: round4(changed / Math.max(1, offsets.length)),
    ...(localBackgroundLuma !== undefined ? { localBackgroundLuma: round3(localBackgroundLuma) } : {}),
    ...(foregroundLuma !== undefined ? { foregroundLuma: round3(foregroundLuma) } : {}),
    ...(localBackgroundLuma !== undefined && foregroundLuma !== undefined
      ? { contrastRatio: round3(contrastRatio(localBackgroundLuma, foregroundLuma)) }
      : {}),
  };
}

function buildRenderedAestheticReport(input: {
  artifactPack: Phase0RenderArtifactPack;
  frames: FrameReportLike[];
}): Phase0RenderedAestheticReportLike {
  const passFrames = input.frames.filter((frame) => frame.report.status === 'pass').length;
  const warnFrames = input.frames.filter((frame) => frame.report.status === 'warn').length;
  const failFrames = input.frames.filter((frame) => frame.report.status === 'fail').length;
  const score = round3(input.frames.length
    ? Math.min(...input.frames.map((frame) => frame.report.score))
    : 0);

  return {
    outputDir: `lambda://${input.artifactPack.projectId}/phase0-rendered-evidence`,
    summary: {
      status: failFrames > 0 ? 'fail' : warnFrames > 0 ? 'warn' : 'pass',
      score,
      passFrames,
      warnFrames,
      failFrames,
      sampledFrames: input.frames.length,
      animationSampleFrames: input.frames.filter((frame) => frame.sample.roles.some((role) => role !== 'manual' && role !== 'hold')).length,
    },
    frames: input.frames.map((frame) => ({
      frame: frame.frame,
      activeOverlayIds: frame.activeOverlayIds,
      activeOverlayTypes: frame.activeOverlayTypes,
      fullStill: frame.fullStill,
      baselineStill: frame.baselineStill,
      report: {
        status: frame.report.status,
        score: frame.report.score,
        issues: frame.report.issues.slice(0, 24).map((issue) => ({
          dimension: issue.dimension,
          severity: issue.severity,
          overlayId: issue.overlayId,
          message: issue.message,
          evidence: issue.evidence,
        })),
      },
    })),
  };
}

function blankImageJustification(
  sample: Phase0RenderSample,
  activeOverlays: RenderedOverlayEvidence[],
): string | undefined {
  if (activeOverlays.length > 0) return undefined;
  const sourceTypes = sample.sourceOverlayTypes.map(String);
  if (sourceTypes.length > 0 && sourceTypes.every((type) => type === 'caption')) {
    return 'overlay-only caption sample has no active caption words at this frame; blank pixels are a speech-gap sample, not a renderer failure';
  }
  const hasVisualEvidence = sample.evidenceKinds.includes('visual');
  if (!hasVisualEvidence) {
    return 'overlay-only sample has no active visual overlays; timing or audio evidence is source/timing-only and not a renderer failure';
  }
  return undefined;
}

function fallbackSample(frame: number): Phase0RenderSample {
  return {
    frame,
    roles: ['manual'],
    sourceOverlayIds: [],
    sourceOverlayTypes: [],
    sourceFamilies: [],
    evidenceKinds: [],
  };
}

function sampledPixels(image: RawRenderedStillImage) {
  const total = image.width * image.height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 120_000)));
  const offsets: number[] = [];
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      offsets.push(((y * image.width) + x) * image.channels);
    }
  }
  return { offsets, step };
}

function sampledOffsetsInBox(image: RawRenderedStillImage, box: { x: number; y: number; width: number; height: number }) {
  const area = box.width * box.height;
  const step = Math.max(1, Math.floor(Math.sqrt(area / 30_000)));
  const offsets: number[] = [];
  const endY = Math.min(image.height, box.y + box.height);
  const endX = Math.min(image.width, box.x + box.width);
  for (let y = box.y; y < endY; y += step) {
    for (let x = box.x; x < endX; x += step) {
      offsets.push(((y * image.width) + x) * image.channels);
    }
  }
  return offsets;
}

function clampBox(box: RenderedOverlayBox, width: number, height: number) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(width, Math.ceil(box.x + box.width));
  const bottom = Math.min(height, Math.ceil(box.y + box.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function pixelsDiffer(a: Buffer, b: Buffer, offset: number): boolean {
  const dr = Math.abs((a[offset] ?? 0) - (b[offset] ?? 0));
  const dg = Math.abs((a[offset + 1] ?? 0) - (b[offset + 1] ?? 0));
  const db = Math.abs((a[offset + 2] ?? 0) - (b[offset + 2] ?? 0));
  const da = Math.abs((a[offset + 3] ?? 255) - (b[offset + 3] ?? 255));
  return dr + dg + db + da > 36;
}

function sameDimensions(a: RawRenderedStillImage, b: RawRenderedStillImage): boolean {
  return a.width === b.width && a.height === b.height && a.channels === b.channels;
}

function pixelLuma(data: Buffer, offset: number): number {
  return ((data[offset] ?? 0) * 0.2126) + ((data[offset + 1] ?? 0) * 0.7152) + ((data[offset + 2] ?? 0) * 0.0722);
}

function isActiveAtFrame(overlay: Phase0OverlayLike, frame: number): boolean {
  const from = readNumber(overlay.from, 0);
  const duration = Math.max(1, readNumber(overlay.durationInFrames, 1));
  return frame >= from && frame < from + duration;
}

function isAuditedVisualOverlay(type: string): boolean {
  return [
    'motion-graphic',
    'text',
    'caption',
    'shape',
    'sticker',
    'image',
    'html-scene',
    'html-sticker',
    'transition',
  ].includes(type);
}

function readOpacity(overlay: Phase0OverlayLike): number | undefined {
  const styles = asRecord(overlay.styles);
  return numberValue(styles.opacity);
}

function fontSizePx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  return Number(match[0]);
}

function readTimestampMs(input: {
  explicitMs?: unknown;
  secondsOrMs?: unknown[];
  fallback: number;
}): number {
  const explicitMs = numberValue(input.explicitMs);
  if (explicitMs !== undefined) return explicitMs;

  const value = (input.secondsOrMs ?? [])
    .map(numberValue)
    .find((item): item is number => item !== undefined);
  if (value === undefined) return input.fallback;

  return value < 1000 ? value * 1000 : value;
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return 0;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function firstNonEmptyString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function contrastRatio(a: number, b: number): number {
  const bright = Math.max(a, b) / 255;
  const dark = Math.min(a, b) / 255;
  return (bright + 0.05) / (dark + 0.05);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
