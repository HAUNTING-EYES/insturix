import sharp from 'sharp';

import { ensureLiveAtomicOverlayReceipt } from '@/lib/editron/engine/overlay-atomic-receipts';
import type { AtomicOverlayReceipt } from '@/lib/editron/engine/atomic-overlay-core';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { constrainFinalOverlayGeometry } from '@/lib/editron/shared/final-overlay-geometry';
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
  aestheticBaselineUrl?: string;
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
type RenderedComparisonMode =
  | 'overlay-visibility'
  | 'mutation-delta'
  | 'continuity-preserved';

interface BuildRenderedAestheticEvidenceOptions {
  readImage?: ReadRenderedStillImage;
  auditedOverlayIds?: Array<string | number>;
  comparisonMode?: RenderedComparisonMode;
}

interface FrameReportLike {
  frame: number;
  activeOverlayIds: Array<string | number>;
  activeOverlayTypes: string[];
  fullStill: string;
  baselineStill: string;
  sample: Phase0RenderSample;
  report: RenderedFrameAestheticReport;
  mutationPixelCount?: number;
  sampledPixelCount?: number;
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
      auditedOverlayIds: options.auditedOverlayIds,
      comparisonMode: options.comparisonMode ?? 'overlay-visibility',
    }));
  }

  const report = buildRenderedAestheticReport({
    artifactPack,
    frames,
    comparisonMode: options.comparisonMode ?? 'overlay-visibility',
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
  auditedOverlayIds?: Array<string | number>;
  comparisonMode: RenderedComparisonMode;
}): Promise<FrameReportLike> {
  const { artifactPack, still, sample } = input;
  let fullImage: RawRenderedStillImage | undefined;
  let baselineImage: RawRenderedStillImage | undefined;
  let aestheticBaselineImage: RawRenderedStillImage | undefined;
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
  if (fullImage && still.aestheticBaselineUrl) {
    try {
      aestheticBaselineImage = await input.readImage(still.aestheticBaselineUrl);
    } catch (err: unknown) {
      renderError = err;
    }
  } else {
    aestheticBaselineImage = baselineImage;
  }

  const activeOverlays = activeRenderedOverlayEvidence(
    artifactPack.renderInput.overlays,
    still.frame,
    artifactPack.renderInput.fps,
    artifactPack.renderInput.width,
    artifactPack.renderInput.height,
    sample,
    fullImage,
    aestheticBaselineImage,
    input.auditedOverlayIds,
    input.comparisonMode,
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
    ...(image?.mutationPixelCount !== undefined
      ? {
          mutationPixelCount: image.mutationPixelCount,
          sampledPixelCount: image.sampledPixelCount,
        }
      : {}),
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
  auditedOverlayIds?: Array<string | number>,
  comparisonMode: RenderedComparisonMode = 'overlay-visibility',
): RenderedOverlayEvidence[] {
  const auditedIds = auditedOverlayIds === undefined
    ? null
    : new Set(auditedOverlayIds.map(String));
  return overlays
    .filter((overlay) => (
      isAuditedVisualOverlay(String(overlay.type ?? ''))
      && isActiveAtFrame(overlay, frame)
      && (auditedIds === null || auditedIds.has(String(overlay.id)))
    ))
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

      const box = renderedOverlayBoxAtFrame(frameOverlay, frame, width, height);
      const plannedVisibilityPhase = plannedVisibilityPhaseAtFrame(frameOverlay, frame);
      const pixelEvidence = fullImage && baselineImage
        ? measureRenderedOverlayPixelEvidence(fullImage, baselineImage, box, width, height, {
            allowLayeredForegroundContrast: isLayeredTextContrastOverlay(String(frameOverlay.type)),
          })
        : {};
      const visiblePixelEvidence = comparisonMode === 'overlay-visibility'
        ? pixelEvidence
        : {
            ...(pixelEvidence.localBackgroundLuma !== undefined
              ? { localBackgroundLuma: pixelEvidence.localBackgroundLuma }
              : {}),
            ...(pixelEvidence.foregroundLuma !== undefined
              ? { foregroundLuma: pixelEvidence.foregroundLuma }
              : {}),
            ...(pixelEvidence.contrastRatio !== undefined
              ? { contrastRatio: pixelEvidence.contrastRatio }
              : {}),
          };
      return [{
        id: overlay.id,
        type: String(overlay.type ?? 'unknown'),
        family: receipt?.family,
        receipt,
        sampleRoles: [...new Set([
          ...sample.roles,
          ...(plannedVisibilityPhase === 'entry' ? ['entry-transition'] : []),
          ...(plannedVisibilityPhase === 'exit' ? ['exit-prep'] : []),
        ])],
        plannedVisibilityPhase,
        visualIntentStageMode: readString((overlay.metadata as Record<string, unknown> | undefined)?.visualIntentStageMode),
        box: {
          ...box,
          ...visiblePixelEvidence,
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
  const metadata = withoutAtomicReceiptMetadata(asRecord(overlay.metadata));
  return {
    ...overlay,
    from: frame,
    durationInFrames: captionText.durationFrames,
    content: captionText.text,
    text: captionText.text,
    captionText: captionText.text,
    captions: [{
      text: captionText.text,
      startMs: captionText.startMs,
      endMs: captionText.endMs,
      words: captionText.words.map((word) => ({ ...word })),
    }],
    metadata,
  };
}

function activeCaptionTextAtFrame(
  overlay: Phase0OverlayLike,
  frame: number,
  fps: number,
): { text: string; durationFrames: number; startMs: number; endMs: number; words: Record<string, unknown>[] } | null {
  const captions = Array.isArray((overlay as Record<string, unknown>).captions)
    ? (overlay as Record<string, unknown>).captions as unknown[]
    : [];
  if (!captions.length) {
    const text = firstNonEmptyString(overlay.captionText, overlay.text, overlay.content);
    if (!text) return null;
    const startMs = (frame / Math.max(1, fps)) * 1000;
    const durationFrames = Math.max(1, readNumber(overlay.durationInFrames, 1));
    return {
      text,
      durationFrames,
      startMs,
      endMs: startMs + (durationFrames / Math.max(1, fps)) * 1000,
      words: [],
    };
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

    const visibleWords = visibleCaptionWordsAtFrame(record.words, timeMs, overlay);
    const wordText = visibleWords
      .map((word) => firstNonEmptyString(word.word, word.text, word.content))
      .filter((word): word is string => Boolean(word))
      .join(' ')
      .trim();
    const text = wordText || firstNonEmptyString(record.text, record.content, record.word);
    if (!text) return null;
    return {
      text,
      durationFrames: Math.max(1, Math.round(((endMs - startMs) / 1000) * fps)),
      startMs,
      endMs,
      words: visibleWords.length ? visibleWords : [{ word: text, text, startMs, endMs }],
    };
  }

  return null;
}

function visibleCaptionWordsAtFrame(
  words: unknown,
  timeMs: number,
  overlay: Phase0OverlayLike,
): Record<string, unknown>[] {
  if (!Array.isArray(words)) return [];
  const normalized = words.map(asRecord);
  if (!normalized.length) return [];

  let activeIndex = normalized.findIndex((word) => {
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
  });
  if (activeIndex === -1) {
    for (let index = 0; index < normalized.length; index += 1) {
      const startMs = readTimestampMs({
        explicitMs: normalized[index]?.startMs,
        secondsOrMs: [normalized[index]?.start, normalized[index]?.startTime],
        fallback: 0,
      });
      if (startMs <= timeMs) activeIndex = index;
    }
  }
  if (activeIndex === -1) activeIndex = 0;

  const display = asRecord((overlay as Record<string, unknown>).displayConfig);
  const mode = String(display.mode ?? 'phrase');
  const wordsPerGroup = Math.max(1, Math.floor(readNumber(display.wordsPerGroup, 1)));
  if (mode === 'word-by-word') return [normalized[activeIndex]].filter((word): word is Record<string, unknown> => Boolean(word));
  if (mode === 'phrase' || mode === 'instagram' || mode === 'hormozi') {
    const halfWindow = Math.floor(wordsPerGroup / 2);
    const start = Math.max(0, activeIndex - halfWindow);
    const end = Math.min(normalized.length, start + wordsPerGroup);
    return normalized.slice(start, end);
  }
  return normalized;
}

function withoutAtomicReceiptMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next.atomicOverlayReceipt;
  delete next.atomicOverlayReceipts;
  delete next.atomicOverlayForm;
  delete next.atomicOverlayForms;
  return next;
}
export function renderedOverlayBoxAtFrame(
  overlay: Phase0OverlayLike,
  frame: number,
  canvasWidth: number,
  canvasHeight: number,
): RenderedOverlayBox {
  const localFrame = Math.max(0, frame - readNumber(overlay.from, 0));
  const keyframes = Array.isArray((overlay as Record<string, unknown>).keyframeTracks)
    ? evaluateScoringKeyframeTracks((overlay as Record<string, unknown>).keyframeTracks as unknown[], localFrame)
    : {};
  const x = readNumber(keyframes.x, readNumber(overlay.left, 0));
  const y = readNumber(keyframes.y, readNumber(overlay.top, 0));
  const boxWidth = readNumber(overlay.width, 1);
  const boxHeight = readNumber(overlay.height, 1);
  const scale = readNumber(keyframes.scale, 1);
  const opacity = readNumber(keyframes.opacity, readOpacity(overlay), 1);
  const rotation = readNumber(
    keyframes.rotation,
    readNumber((overlay as Record<string, unknown>).rotation, 0),
  );
  const transformOrigin = readString(
    asRecord(overlay.styles).transformOrigin,
  ) || 'center center';
  const geometry = constrainFinalOverlayGeometry({
    overlayType: String(overlay.type ?? ''),
    left: x,
    top: y,
    width: boxWidth,
    height: boxHeight,
    scale,
    rotationDegrees: rotation,
    transformOrigin,
    canvasWidth,
    canvasHeight,
  });

  return {
    x: geometry.bounds.left,
    y: geometry.bounds.top,
    width: geometry.bounds.right - geometry.bounds.left,
    height: geometry.bounds.bottom - geometry.bounds.top,
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
    ...(baselineImage
      ? sameDimensions(fullImage, baselineImage)
        ? {
            mutationPixelRatio: round4(changed / Math.max(1, sample.offsets.length)),
            mutationPixelCount: changed,
            sampledPixelCount: sample.offsets.length,
          }
        : {
            mutationPixelRatio: 1,
            mutationPixelCount: sample.offsets.length,
            sampledPixelCount: sample.offsets.length,
          }
      : {}),
  };
}

export function measureRenderedOverlayPixelEvidence(
  fullImage: RawRenderedStillImage,
  baselineImage: RawRenderedStillImage,
  box: RenderedOverlayBox,
  width: number,
  height: number,
  options: { allowLayeredForegroundContrast?: boolean } = {},
): Pick<RenderedOverlayBox, 'visiblePixelRatio' | 'localBackgroundLuma' | 'foregroundLuma' | 'contrastRatio'> {
  if (!sameDimensions(fullImage, baselineImage)) return {};
  const bounds = clampBox(box, width, height);
  if (!bounds) return { visiblePixelRatio: 0 };

  const offsets = sampledOffsetsInBox(fullImage, bounds);
  let changed = 0;
  const foreground: number[] = [];
  const background: number[] = [];
  const localContrasts: number[] = [];
  const brightenedForeground: number[] = [];
  const darkenedForeground: number[] = [];
  for (const offset of offsets) {
    const baseLuma = pixelLuma(baselineImage.data, offset);
    background.push(baseLuma);
    if (pixelsDiffer(fullImage.data, baselineImage.data, offset)) {
      changed += 1;
      const renderedLuma = pixelLuma(fullImage.data, offset);
      foreground.push(renderedLuma);
      localContrasts.push(contrastRatio(baseLuma, renderedLuma));
      const lumaDelta = renderedLuma - baseLuma;
      if (lumaDelta >= 6) brightenedForeground.push(renderedLuma);
      if (lumaDelta <= -6) darkenedForeground.push(renderedLuma);
    }
  }

  const localBackgroundLuma = average(background);
  const foregroundLuma = average(foreground);
  const localContrastRatio = median(localContrasts);
  const minimumLayerSupport = Math.max(4, Math.ceil(foreground.length * 0.05));
  const layeredForegroundContrast = options.allowLayeredForegroundContrast
    && brightenedForeground.length >= minimumLayerSupport
    && darkenedForeground.length >= minimumLayerSupport
    ? contrastRatio(
        percentile(brightenedForeground, 0.85) ?? 0,
        percentile(darkenedForeground, 0.15) ?? 0,
      )
    : undefined;
  const measuredContrastRatio = localContrastRatio === undefined
    ? layeredForegroundContrast
    : layeredForegroundContrast === undefined
      ? localContrastRatio
      : Math.max(localContrastRatio, layeredForegroundContrast);
  return {
    visiblePixelRatio: round4(changed / Math.max(1, offsets.length)),
    ...(localBackgroundLuma !== undefined ? { localBackgroundLuma: round3(localBackgroundLuma) } : {}),
    ...(foregroundLuma !== undefined ? { foregroundLuma: round3(foregroundLuma) } : {}),
    ...(measuredContrastRatio !== undefined
      ? { contrastRatio: round3(measuredContrastRatio) }
      : {}),
  };
}

function buildRenderedAestheticReport(input: {
  artifactPack: Phase0RenderArtifactPack;
  frames: FrameReportLike[];
  comparisonMode: RenderedComparisonMode;
}): Phase0RenderedAestheticReportLike {
  const absoluteWarnFrames = input.frames.filter((frame) => frame.report.status === 'warn').length;
  const absoluteFailFrames = input.frames.filter((frame) => frame.report.status === 'fail').length;
  const absoluteQualityStatus = absoluteFailFrames > 0
    ? 'fail'
    : absoluteWarnFrames > 0
      ? 'warn'
      : 'pass';
  const absoluteQualityScore = round3(input.frames.length
    ? Math.min(...input.frames.map((frame) => frame.report.score))
    : 0);
  const mutationChangedFrameCount = input.frames.filter(
    (frame) => (frame.mutationPixelCount ?? 0) > 0,
  ).length;
  const mutationStatus = input.comparisonMode === 'mutation-delta'
    ? mutationChangedFrameCount > 0 ? 'pass' : 'fail'
    : input.comparisonMode === 'continuity-preserved'
      ? mutationChangedFrameCount === 0 ? 'pass' : 'fail'
      : 'not-required';
  const sampledPixelCount = input.frames.reduce(
    (sum, frame) => sum + (frame.sampledPixelCount ?? 0),
    0,
  );
  const reportedFrames = input.frames.map((frame, index) => {
    const mutationFailed = mutationStatus === 'fail' && index === 0;
    const mutationIssues = mutationFailed
      ? [{
          dimension: 'mutation',
          severity: 'fail' as const,
          message: input.comparisonMode === 'continuity-preserved'
            ? 'continuity-preserving edit changed rendered pixels inside the seam window'
            : 'rendered before/after samples are pixel-identical inside the requested mutation window',
          evidence: `changedPixels=${input.frames.reduce((sum, frame) => sum + (frame.mutationPixelCount ?? 0), 0)}; sampledPixels=${sampledPixelCount}`,
        }]
      : [];
    return {
      frame: frame.frame,
      activeOverlayIds: frame.activeOverlayIds,
      activeOverlayTypes: frame.activeOverlayTypes,
      fullStill: frame.fullStill,
      baselineStill: frame.baselineStill,
      ...(frame.mutationPixelCount !== undefined
        ? {
            mutationPixelCount: frame.mutationPixelCount,
            sampledPixelCount: frame.sampledPixelCount,
          }
        : {}),
      report: {
        status: mutationFailed ? 'fail' as const : frame.report.status,
        score: mutationFailed ? 0 : frame.report.score,
        issues: [
          ...frame.report.issues.slice(0, Math.max(0, 24 - mutationIssues.length)).map((issue) => ({
            dimension: issue.dimension,
            severity: issue.severity,
            overlayId: issue.overlayId,
            message: issue.message,
            evidence: issue.evidence,
          })),
          ...mutationIssues,
        ],
      },
    };
  });
  const passFrames = reportedFrames.filter((frame) => frame.report.status === 'pass').length;
  const warnFrames = reportedFrames.filter((frame) => frame.report.status === 'warn').length;
  const failFrames = reportedFrames.filter((frame) => frame.report.status === 'fail').length;
  const score = mutationStatus === 'fail' ? 0 : absoluteQualityScore;

  return {
    outputDir: `lambda://${input.artifactPack.projectId}/phase0-rendered-evidence`,
    summary: {
      status: failFrames > 0 ? 'fail' : warnFrames > 0 ? 'warn' : 'pass',
      score,
      absoluteQualityStatus,
      absoluteQualityScore,
      mutationStatus,
      mutationChangedFrameCount,
      passFrames,
      warnFrames,
      failFrames,
      sampledFrames: input.frames.length,
      animationSampleFrames: input.frames.filter((frame) => frame.sample.roles.some((role) => role !== 'manual' && role !== 'hold')).length,
    },
    frames: reportedFrames,
  };
}

function blankImageJustification(
  sample: Phase0RenderSample,
  activeOverlays: RenderedOverlayEvidence[],
): string | undefined {
  if (
    activeOverlays.length > 0
    && activeOverlays.every((overlay) => (
      overlay.plannedVisibilityPhase === 'entry'
      || overlay.plannedVisibilityPhase === 'exit'
    ))
  ) {
    return 'all audited overlays are inside an explicitly licensed entrance or exit phase; blank pixels at this edge are intentional';
  }
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

function evaluateScoringKeyframeTracks(tracks: unknown[], localFrame: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of tracks) {
    const track = asRecord(value);
    const property = readString(track.property);
    const keyframes = Array.isArray(track.keyframes)
      ? track.keyframes.map(normalizeScoringKeyframe).filter((item): item is ScoringKeyframe => Boolean(item))
      : [];
    if (!property || keyframes.length === 0) continue;
    result[property] = evaluateScoringKeyframeTrack(keyframes, localFrame);
  }
  return result;
}

interface ScoringKeyframe {
  frame: number;
  value: number;
  easing: string;
}

function normalizeScoringKeyframe(value: unknown): ScoringKeyframe | null {
  const record = asRecord(value);
  const frame = numberValue(record.frame);
  const keyframeValue = numberValue(record.value);
  if (frame === undefined || keyframeValue === undefined) return null;
  return {
    frame,
    value: keyframeValue,
    easing: readString(record.easing) ?? 'linear',
  };
}

function evaluateScoringKeyframeTrack(keyframes: ScoringKeyframe[], localFrame: number): number {
  if (keyframes.length === 1) return keyframes[0].value;
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (localFrame <= sorted[0].frame) return sorted[0].value;
  if (localFrame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (localFrame < from.frame || localFrame > to.frame) continue;
    const span = Math.max(1, to.frame - from.frame);
    const progress = applyScoringEasing((localFrame - from.frame) / span, from.easing);
    return from.value + ((to.value - from.value) * progress);
  }

  return sorted[sorted.length - 1].value;
}

function applyScoringEasing(rawProgress: number, easing: string): number {
  const progress = Math.max(0, Math.min(1, rawProgress));
  switch (easing) {
    case 'ease-in':
      return progress * progress;
    case 'ease-out':
      return 1 - ((1 - progress) * (1 - progress));
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - (((-2 * progress) + 2) ** 2) / 2;
    case 'snap-out':
      return 1 - ((1 - progress) ** 4);
    default:
      return progress;
  }
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

function plannedVisibilityPhaseAtFrame(
  overlay: Phase0OverlayLike,
  frame: number,
): RenderedOverlayEvidence['plannedVisibilityPhase'] {
  const from = readNumber(overlay.from, 0);
  const duration = Math.max(1, readNumber(overlay.durationInFrames, 1));
  const localFrame = Math.max(0, frame - from);
  const tracks = Array.isArray((overlay as Record<string, unknown>).keyframeTracks)
    ? (overlay as Record<string, unknown>).keyframeTracks as unknown[]
    : [];

  for (const value of tracks) {
    const track = asRecord(value);
    const metadata = asRecord(track.metadata);
    const isLicensedFade =
      readString(track.property) === 'opacity'
      && (
        readString(track.family) === 'fade'
        || readString(track.source) === 'apply_fade'
        || readString(metadata.family) === 'fade'
        || readString(metadata.source) === 'apply_fade'
      );
    if (!isLicensedFade || !Array.isArray(track.keyframes)) continue;
    const keyframes = track.keyframes
      .map(normalizeScoringKeyframe)
      .filter((item): item is ScoringKeyframe => Boolean(item))
      .sort((a, b) => a.frame - b.frame);
    if (keyframes.length < 2) continue;
    const direction = readString(metadata.direction) ?? readString(track.direction);
    const entryEnd = keyframes[1]?.frame;
    const exitStart = keyframes.at(-2)?.frame;
    if (
      (direction === 'out' || direction === 'both')
      && exitStart !== undefined
      && localFrame >= exitStart
    ) return 'exit';
    if (
      (direction === 'in' || direction === 'both')
      && entryEnd !== undefined
      && localFrame <= entryEnd
    ) return 'entry';
  }

  const animation = asRecord(asRecord(overlay.styles).animation);
  const rendererEdgeFrames = Math.min(15, duration);
  if (readString(animation.exit) && localFrame >= duration - rendererEdgeFrames) return 'exit';
  if (readString(animation.enter) && localFrame < rendererEdgeFrames) return 'entry';
  return undefined;
}

function isLayeredTextContrastOverlay(type: string): boolean {
  return type === 'text' || type === 'caption';
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];
  return ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
}

function percentile(values: number[], fraction: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * Math.max(0, Math.min(1, fraction)));
  return sorted[index];
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
