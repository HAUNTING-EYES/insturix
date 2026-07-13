import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { COMP_NAME } from '../components/editron/editor/version-7.0.0/constants';
import type { Overlay } from '../components/editron/editor/version-7.0.0/types';
import { OverlayType } from '../components/editron/editor/version-7.0.0/types';
import { evaluateAllTracks } from '../components/editron/editor/version-7.0.0/utils/keyframe-evaluator';
import { ensureLiveAtomicOverlayReceipt } from '../lib/editron/engine/overlay-atomic-receipts';
import { ROW } from '../lib/pipeline/scene-to-editron';
import {
  scoreRenderedFrameAesthetic,
  type RenderedAestheticIssue,
  type RenderedFrameAestheticReport,
  type RenderedOverlayBox,
  type RenderedOverlayEvidence,
} from '../lib/editron/motion-graphics/engine/eval/rendered-aesthetic';
import { classifyPhase0Fixture } from '../lib/editron/services/phase0-failure-taxonomy';
import type { Phase0FixtureManifest } from '../lib/editron/services/phase0-fixture-manifest';
import type {
  Phase0RenderArtifactPack,
  Phase0RenderInput,
} from '../lib/editron/services/phase0-render-artifact-pack';
import type {
  RenderImageStats,
  RenderLogEntry,
} from '../lib/editron/motion-graphics/engine/eval/render-validity';

const COMPOSITOR_FALLBACKS = {
  '@remotion/compositor': false,
  '@remotion/compositor-darwin-arm64': false,
  '@remotion/compositor-darwin-x64': false,
  '@remotion/compositor-linux-x64': false,
  '@remotion/compositor-linux-arm64': false,
  '@remotion/compositor-win32-x64-msvc': false,
  '@remotion/compositor-windows-x64': false,
} as const;

const AUDITED_VISUAL_TYPES = new Set<string>([
  'motion-graphic',
  'text',
  'caption',
  'shape',
  'sticker',
  'image',
  'html-scene',
  OverlayType.GENERATED_SCENE,
  'html-sticker',
  'transition',
]);

const AUDITED_TIMING_TYPES = new Set<string>([
  'zoom',
  'sound',
  'audio',
]);

export interface RenderedAestheticProjectInput {
  projectId?: string;
  tag?: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  baseUrl?: string;
  overlays: Overlay[];
  sampleFrames?: number[];
  samplePlan?: RenderedAestheticSample[];
}

export interface RenderedAestheticHarnessOptions {
  inputFile?: string;
  outDir?: string;
  tag?: string;
  maxSamples?: number;
  sampleFrames?: number[];
  selfTest?: boolean;
  overlayOnly?: boolean;
}

export type RenderedAestheticSampleRole =
  | 'manual'
  | 'entry-settle'
  | 'hold'
  | 'exit-prep'
  | 'keyframe'
  | 'zoom-anchor'
  | 'zoom-motion'
  | 'sfx-sync'
  | 'transition-boundary';

export interface RenderedAestheticSample {
  frame: number;
  roles: RenderedAestheticSampleRole[];
  sourceOverlayIds: Array<number | string>;
  sourceOverlayTypes: string[];
}

export interface RenderedAestheticFrameReport {
  frame: number;
  sample: RenderedAestheticSample;
  activeOverlayIds: Array<number | string>;
  activeOverlayTypes: string[];
  timelineEvidence: RenderedTimelineOverlayEvidence[];
  fullStill: string;
  baselineStill: string;
  motionProbeStill?: string;
  motionDelta?: MotionDeltaEvidence;
  report: RenderedFrameAestheticReport;
}

export interface RenderedAestheticProjectIssue extends RenderedAestheticIssue {
  gateId: 'G8_motion_variety';
}

export interface RenderedTimelineOverlayEvidence {
  id?: string | number;
  type: string;
  family: 'zoom' | 'sfx';
  frame: number;
  localFrame: number;
  durationFrames: number;
  role: string | null;
  assetId: string | null;
  volume: number | null;
  hasAtomicForm: boolean;
}

export interface RenderedAestheticHarnessReport {
  tag: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  inputFile?: string;
  outputDir: string;
  htmlReport: string;
  jsonReport: string;
  project: {
    projectId?: string;
    inputFile?: string;
    overlayCounts: Record<string, number>;
    auditedOverlayCount: number;
  };
  summary: {
    status: 'pass' | 'warn' | 'fail';
    score: number;
    passFrames: number;
    warnFrames: number;
    failFrames: number;
    sampledFrames: number;
    animationSampleFrames: number;
    projectIssueCount: number;
  };
  projectIssues: RenderedAestheticProjectIssue[];
  frames: RenderedAestheticFrameReport[];
}

interface CliArgs extends RenderedAestheticHarnessOptions {
  help?: boolean;
}

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

type RemotionComposition = Awaited<ReturnType<typeof selectComposition>>;

export interface MotionDeltaEvidence {
  fromFrame: number;
  toFrame: number;
  changedPixelRatio: number;
  meanAbsoluteLumaDelta: number;
  sampledPixels: number;
}

interface MotionProbeResult {
  still?: string;
  delta?: MotionDeltaEvidence;
  error?: string;
}

const MOTION_DELTA_PROBE_GAP_FRAMES = 6;
const MOTION_DELTA_CHANGED_RATIO_FLOOR = 0.001;
const MOTION_DELTA_LUMA_FLOOR = 0.0015;
interface OverlayPixelEvidence {
  visiblePixelRatio?: number;
  foregroundLuma?: number;
  localBackgroundLuma?: number;
  contrastRatio?: number;
}

interface FrameAwareCaptionWord {
  word: string;
  startMs: number;
  endMs: number;
  emphasis?: unknown;
  active?: boolean;
}

interface FrameAwareCaptionDisplayConfig {
  mode: string;
  wordsPerGroup: number;
  maxWordsPerLine: number;
}

export async function runRenderedAestheticHarness(
  options: RenderedAestheticHarnessOptions,
): Promise<RenderedAestheticHarnessReport> {
  const input = options.selfTest
    ? selfTestProjectInput()
    : readProjectInput(requiredInputFile(options.inputFile));
  const tag = slugify(options.tag ?? input.tag ?? input.projectId ?? path.basename(options.inputFile ?? 'self-test', path.extname(options.inputFile ?? '')));
  const outputDir = path.resolve(options.outDir ?? path.join(process.cwd(), '.calibration-temp', 'rendered-aesthetic', tag));
  resetOutputDir(outputDir);

  const overlays = input.overlays.map((overlay) => ensureLiveAtomicOverlayReceipt(overlay));
  const renderOverlays = options.overlayOnly ? buildOverlayOnlyRenderOverlays(overlays, input.width, input.height) : overlays;
  const baselineOverlays = buildBaselineOverlays(overlays, input.width, input.height);
  const samplePlan = resolveRenderedAestheticSamplePlan(input, overlays, options);

  const serveUrl = await bundle(
    path.resolve(process.cwd(), 'components', 'editron', 'editor', 'version-7.0.0', 'remotion', 'index.ts'),
    undefined,
    {
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: { ...config.resolve?.alias, '@': path.resolve(process.cwd()) },
          fallback: { ...config.resolve?.fallback, ...COMPOSITOR_FALLBACKS },
        },
      }),
    },
  );

  const fullProps = compositionProps(input, renderOverlays);
  const baselineProps = compositionProps(input, baselineOverlays);
  const fullComposition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: fullProps });
  const baselineComposition = await selectComposition({ serveUrl, id: COMP_NAME, inputProps: baselineProps });
  const frames: RenderedAestheticFrameReport[] = [];

  for (const sample of samplePlan) {
    const frame = sample.frame;
    const frameDir = path.join(outputDir, `f${String(frame).padStart(5, '0')}`);
    fs.mkdirSync(frameDir, { recursive: true });
    const fullStill = path.join(frameDir, 'full.png');
    const baselineStill = path.join(frameDir, 'baseline.png');
    const logs: RenderLogEntry[] = [];
    let renderError: unknown;

    try {
      await renderStill({
        composition: baselineComposition,
        serveUrl,
        output: baselineStill,
        frame,
        inputProps: baselineProps,
        imageFormat: 'png',
        chromiumOptions: { headless: true },
        overwrite: true,
      });
      await renderStill({
        composition: fullComposition,
        serveUrl,
        output: fullStill,
        frame,
        inputProps: fullProps,
        imageFormat: 'png',
        chromiumOptions: { headless: true },
        overwrite: true,
        onBrowserLog: (log) => logs.push({ type: log.type, text: log.text }),
      });
    } catch (error) {
      renderError = error;
    }

    const fullImage = fs.existsSync(fullStill) ? await readRawImage(fullStill) : undefined;
    const baselineImage = fs.existsSync(baselineStill) ? await readRawImage(baselineStill) : undefined;
    const activeAuditedVisualOverlays = overlays.filter((overlay) => isAuditedOverlay(overlay) && isActiveAtFrame(overlay, frame));
    const isolatedImages = baselineImage
      ? await renderIsolatedOverlayImages({
        activeOverlays: activeAuditedVisualOverlays,
        baselineOverlays,
        frame,
        frameDir,
        input,
        serveUrl,
      })
      : new Map<string, RawImage>();
    const image = fullImage ? imageStats(fullImage) : undefined;
    const motionProbeOverlays = motionProbeVisualOverlays(sample, activeAuditedVisualOverlays);
    const motionProbe = fullImage && motionProbeOverlays.length > 0
      ? await renderMotionProbe({
        fullImage,
        sample,
        activeVisualOverlays: motionProbeOverlays,
        durationInFrames: input.durationInFrames,
        frameDir,
        composition: fullComposition,
        serveUrl,
        inputProps: fullProps,
      })
      : undefined;
    const evidence = fullImage && baselineImage
      ? activeRenderedOverlayEvidence(overlays, frame, {
        baselineImage,
        fallbackImage: fullImage,
        fps: input.fps,
        isolatedImages,
        sample,
      })
      : activeRenderedOverlayEvidence(overlays, frame, { fps: input.fps, sample });
    const timelineEvidence = activeTimelineOverlayEvidence(overlays, frame);

    let report = scoreRenderedFrameAesthetic({
      width: input.width,
      height: input.height,
      fps: input.fps,
      frame,
      logs,
      image,
      blankImageJustification: overlayOnlyBlankImageJustification({
        overlayOnly: Boolean(options.overlayOnly),
        sample,
        sourceOverlays: overlays,
        renderOverlays,
        activeAuditedVisualTypes: activeAuditedVisualOverlays.map((overlay) => String(overlay.type)),
        activeVisualEvidenceCount: evidence.length,
        activeTimelineEvidenceCount: timelineEvidence.length,
      }),
      renderError,
      overlays: evidence,
    });
    report = applyMotionDeltaGate(report, motionProbe);

    const activeIds = uniqueIds([
      ...evidence.map((overlay) => overlay.id).filter((id): id is number | string => id !== undefined),
      ...timelineEvidence.map((overlay) => overlay.id).filter((id): id is number | string => id !== undefined),
    ]);
    const activeTypes = uniqueStrings([
      ...evidence.map((overlay) => overlay.type).filter((type): type is string => !!type),
      ...timelineEvidence.map((overlay) => overlay.type),
    ]);

    frames.push({
      frame,
      sample,
      activeOverlayIds: activeIds,
      activeOverlayTypes: activeTypes,
      timelineEvidence,
      fullStill,
      baselineStill,
      ...(motionProbe?.still ? { motionProbeStill: motionProbe.still } : {}),
      ...(motionProbe?.delta ? { motionDelta: motionProbe.delta } : {}),
      report,
    });
  }

  const harnessReport = buildHarnessReport({
    tag,
    input,
    inputFile: options.inputFile,
    outputDir,
    frames,
  });
  fs.writeFileSync(harnessReport.jsonReport, JSON.stringify(harnessReport, null, 2), 'utf8');
  fs.writeFileSync(harnessReport.htmlReport, renderRenderedAestheticHtmlReport(harnessReport), 'utf8');
  writePhase0FailureTaxonomyIfPresent(harnessReport);
  return harnessReport;
}

function writePhase0FailureTaxonomyIfPresent(report: RenderedAestheticHarnessReport): void {
  if (!report.inputFile || path.basename(report.inputFile) !== 'render-input.json') return;

  const runDir = path.dirname(path.resolve(process.cwd(), report.inputFile));
  const manifestPath = path.join(runDir, 'manifest.json');
  const artifactPackPath = path.join(runDir, 'render-artifact-pack.json');
  const taxonomyPath = path.join(runDir, 'failure-taxonomy.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(artifactPackPath)) return;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Phase0FixtureManifest;
    const artifactPack = hydratePhase0RenderArtifactPackForTaxonomy(
      JSON.parse(fs.readFileSync(artifactPackPath, 'utf8')) as Phase0RenderArtifactPack,
      runDir,
    );
    const taxonomy = classifyPhase0Fixture(manifest, artifactPack, report);
    fs.writeFileSync(taxonomyPath, `${JSON.stringify(taxonomy, null, 2)}\n`, 'utf8');
    console.log(`Phase 0 rendered failure taxonomy updated -> ${taxonomyPath}`);
  } catch (error) {
    console.warn(
      'Phase 0 rendered failure taxonomy update skipped:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function hydratePhase0RenderArtifactPackForTaxonomy(
  artifactPack: Phase0RenderArtifactPack,
  runDir: string,
): Phase0RenderArtifactPack {
  const existingRenderInput = (artifactPack as { renderInput?: unknown }).renderInput;
  if (
    existingRenderInput &&
    typeof existingRenderInput === 'object' &&
    Array.isArray((existingRenderInput as { overlays?: unknown }).overlays)
  ) {
    return artifactPack;
  }

  const renderInputPath = typeof artifactPack.paths?.renderInput === 'string' && artifactPack.paths.renderInput.trim()
    ? artifactPack.paths.renderInput
    : path.join(runDir, 'render-input.json');
  const resolvedRenderInputPath = resolvePhase0RenderInputPath(renderInputPath, runDir);

  const renderInput = JSON.parse(fs.readFileSync(resolvedRenderInputPath, 'utf8')) as Phase0RenderInput;
  if (!Array.isArray(renderInput.overlays)) {
    throw new Error(`Phase 0 render input has no overlays array: ${resolvedRenderInputPath}`);
  }

  return {
    ...artifactPack,
    renderInput,
  };
}


function resolvePhase0RenderInputPath(renderInputPath: string, runDir: string): string {
  const candidates = uniqueStrings([
    path.isAbsolute(renderInputPath)
      ? renderInputPath
      : path.resolve(process.cwd(), renderInputPath),
    path.resolve(runDir, renderInputPath),
    path.join(runDir, 'render-input.json'),
  ]);
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing) return existing;

  throw new Error(`Phase 0 render input missing for taxonomy update. Checked: ${candidates.join(', ')}`);
}

export function planRenderedAestheticSamples(
  overlays: Overlay[],
  durationInFrames: number,
  maxSamples = 18,
): RenderedAestheticSample[] {
  const samples = new Map<number, RenderedAestheticSample>();
  for (const overlay of overlays) {
    if (!isSampledOverlay(overlay)) continue;
    const duration = Math.max(1, overlay.durationInFrames);
    const entryFrame = overlay.from + Math.min(duration - 1, Math.max(1, Math.min(8, Math.floor(duration * 0.22))));
    const holdFrame = overlay.from + Math.floor(duration * 0.55);
    const exitFrame = overlay.from + Math.max(0, duration - Math.max(2, Math.min(8, Math.floor(duration * 0.18))));

    addSample(samples, entryFrame, durationInFrames, 'entry-settle', overlay);
    addSample(samples, holdFrame, durationInFrames, 'hold', overlay);
    addSample(samples, exitFrame, durationInFrames, 'exit-prep', overlay);

    for (const track of overlay.keyframeTracks ?? []) {
      for (const keyframe of track.keyframes) {
        if (keyframe.frame <= 0 || keyframe.frame >= duration - 1) continue;
        addSample(samples, overlay.from + keyframe.frame, durationInFrames, 'keyframe', overlay);
      }
    }
  }

  const sorted = [...samples.values()].sort((a, b) => a.frame - b.frame);
  if (sorted.length <= maxSamples) return sorted;
  const selected = new Set<number>();
  for (let i = 0; i < maxSamples; i += 1) {
    const index = Math.round((i * (sorted.length - 1)) / Math.max(1, maxSamples - 1));
    selected.add(sorted[index].frame);
  }
  return sorted.filter((sample) => selected.has(sample.frame));
}

function manualSamples(
  frames: number[],
  overlays: Overlay[],
  durationInFrames: number,
): RenderedAestheticSample[] {
  return uniqueNumbers(frames.map((frame) => clampFrame(frame, durationInFrames)))
    .map((frame) => {
      const active = overlays.filter((overlay) => isSampledOverlay(overlay) && isActiveAtFrame(overlay, frame));
      return {
        frame,
        roles: ['manual'],
        sourceOverlayIds: active.map((overlay) => overlay.id),
        sourceOverlayTypes: uniqueStrings(active.map((overlay) => String(overlay.type))),
      };
    });
}

function mergeManualSamplesWithPlannedCoverage(
  manual: RenderedAestheticSample[],
  planned: RenderedAestheticSample[],
  maxSamples: number,
): RenderedAestheticSample[] {
  if (manual.length === 0) return planned;

  const merged = new Map<number, RenderedAestheticSample>();
  for (const sample of manual) mergeSample(merged, sample);
  for (const sample of planned) mergeSample(merged, sample);

  const sorted = [...merged.values()].sort((a, b) => a.frame - b.frame);
  const manualSamples = sorted.filter((sample) => sample.roles.includes('manual'));
  const cap = Math.max(manualSamples.length, Math.floor(maxSamples));
  if (sorted.length <= cap) return sorted;

  const plannedOnly = sorted.filter((sample) => !sample.roles.includes('manual'));
  const selectedPlanned = selectEvenly(plannedOnly, cap - manualSamples.length);
  return [...manualSamples, ...selectedPlanned].sort((a, b) => a.frame - b.frame);
}

function mergeSample(samples: Map<number, RenderedAestheticSample>, sample: RenderedAestheticSample): void {
  const existing = samples.get(sample.frame);
  if (existing) {
    existing.roles = uniqueSampleRoles([...existing.roles, ...sample.roles]);
    existing.sourceOverlayIds = uniqueIds([...existing.sourceOverlayIds, ...sample.sourceOverlayIds]);
    existing.sourceOverlayTypes = uniqueStrings([...existing.sourceOverlayTypes, ...sample.sourceOverlayTypes]);
    return;
  }

  samples.set(sample.frame, {
    frame: sample.frame,
    roles: uniqueSampleRoles(sample.roles),
    sourceOverlayIds: uniqueIds(sample.sourceOverlayIds),
    sourceOverlayTypes: uniqueStrings(sample.sourceOverlayTypes),
  });
}

function selectEvenly<T>(items: T[], count: number): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return items;
  const selected = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / Math.max(1, count - 1));
    selected.add(index);
  }
  return [...selected].sort((a, b) => a - b).map((index) => items[index]);
}

export function resolveRenderedAestheticSamplePlan(
  input: Pick<RenderedAestheticProjectInput, 'durationInFrames' | 'sampleFrames' | 'samplePlan'>,
  overlays: Overlay[],
  options: Pick<RenderedAestheticHarnessOptions, 'maxSamples' | 'sampleFrames'> = {},
): RenderedAestheticSample[] {
  const maxSamples = options.maxSamples ?? 18;
  if (options.sampleFrames?.length) {
    return mergeManualSamplesWithPlannedCoverage(
      manualSamples(options.sampleFrames, overlays, input.durationInFrames),
      planRenderedAestheticSamples(overlays, input.durationInFrames, maxSamples),
      maxSamples,
    );
  }
  if (input.samplePlan?.length) return input.samplePlan;
  if (input.sampleFrames?.length) {
    return mergeManualSamplesWithPlannedCoverage(
      manualSamples(input.sampleFrames, overlays, input.durationInFrames),
      planRenderedAestheticSamples(overlays, input.durationInFrames, maxSamples),
      maxSamples,
    );
  }
  return planRenderedAestheticSamples(overlays, input.durationInFrames, maxSamples);
}

export function normalizeRenderedAestheticSamplePlan(value: unknown, durationInFrames: number): RenderedAestheticSample[] | undefined {
  const rawSamples = isRecord(value) && Array.isArray(value.samples)
    ? value.samples
    : undefined;
  if (!rawSamples?.length) return undefined;

  const samples = rawSamples
    .map((sample) => {
      if (!isRecord(sample)) return undefined;
      const frame = numericValue(sample.frame);
      if (frame === undefined) return undefined;
      const roles = Array.isArray(sample.roles)
        ? sample.roles.map(readSampleRole).filter((role): role is RenderedAestheticSampleRole => Boolean(role))
        : [];
      const sourceOverlayIds = Array.isArray(sample.sourceOverlayIds)
        ? sample.sourceOverlayIds.filter((id): id is number | string => typeof id === 'number' || typeof id === 'string')
        : [];
      const sourceOverlayTypes = Array.isArray(sample.sourceOverlayTypes)
        ? sample.sourceOverlayTypes.map((type) => String(type)).filter(Boolean)
        : [];

      return {
        frame: clampFrame(frame, durationInFrames),
        roles: roles.length ? uniqueSampleRoles(roles) : ['manual'],
        sourceOverlayIds: uniqueIds(sourceOverlayIds),
        sourceOverlayTypes: uniqueStrings(sourceOverlayTypes),
      };
    })
    .filter((sample): sample is RenderedAestheticSample => Boolean(sample));

  return samples.length ? samples : undefined;
}

export function evaluateProjectLevelRenderedGates(overlays: Overlay[]): RenderedAestheticProjectIssue[] {
  return evaluateSaasMotionVarietyGate(overlays);
}

export function evaluateSaasMotionVarietyGate(overlays: Overlay[]): RenderedAestheticProjectIssue[] {
  const scenes = overlays
    .filter(isSaasGeneratedSceneOverlay)
    .map((overlay): { id: string | number; from: number; varietyKey: string | undefined } => ({
      id: overlay.id,
      from: overlay.from,
      varietyKey: readSaasSceneVarietyKey(overlay),
    }))
    .filter((scene): scene is { id: string | number; from: number; varietyKey: string } => Boolean(scene.varietyKey))
    .sort((a, b) => a.from - b.from);

  if (scenes.length < 2) return [];

  const issues: RenderedAestheticProjectIssue[] = [];
  const sequence = scenes.map((scene) => scene.varietyKey).join(' > ');
  for (let index = 1; index < scenes.length; index += 1) {
    const previous = scenes[index - 1];
    const current = scenes[index];
    if (!previous || !current || previous.varietyKey !== current.varietyKey) continue;
    issues.push({
      gateId: 'G8_motion_variety',
      dimension: 'motion',
      severity: 'fail',
      penalty: 1,
      message: `SaaS scene variety repeats ${current.varietyKey} consecutively`,
      overlayId: current.id,
      relatedOverlayId: previous.id,
      evidence: `sequence=${sequence}`,
    });
  }

  const counts = new Map<string, number>();
  for (const scene of scenes) counts.set(scene.varietyKey, (counts.get(scene.varietyKey) ?? 0) + 1);
  for (const [varietyKey, count] of counts) {
    const share = count / scenes.length;
    if (share <= 0.4) continue;
    issues.push({
      gateId: 'G8_motion_variety',
      dimension: 'motion',
      severity: 'fail',
      penalty: 1,
      message: `SaaS scene variety overuses ${varietyKey}`,
      evidence: `count=${count}/${scenes.length}; share=${round3(share)}; sequence=${sequence}`,
    });
  }

  return issues;
}

function isSaasGeneratedSceneOverlay(overlay: Overlay): boolean {
  if (overlay.type !== OverlayType.GENERATED_SCENE) return false;
  const record = overlay as Overlay & { sceneModel?: unknown; metadata?: unknown };
  const sceneModel = isRecord(record.sceneModel) ? record.sceneModel : undefined;
  const metadata = isRecord(record.metadata) ? record.metadata : undefined;
  return stringProp(sceneModel, 'schemaVersion') === 'saas-generated-scene/v1'
    || stringProp(metadata, 'sourceType') === 'saas-explainer-generated-scene';
}

function readSaasSceneVarietyKey(overlay: Overlay): string | undefined {
  const record = overlay as Overlay & { sceneModel?: unknown };
  const sceneModel = isRecord(record.sceneModel) ? record.sceneModel : undefined;
  const familyPlan = isRecord(sceneModel?.familyPlan) ? sceneModel.familyPlan : undefined;
  return normalizeVarietyKey(
    stringProp(familyPlan, 'visualArchetype')
    ?? stringProp(sceneModel, 'visualArchetype')
    ?? stringProp(familyPlan, 'family'),
  );
}

function normalizeVarietyKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized || undefined;
}
function readSampleRole(value: unknown): RenderedAestheticSampleRole | undefined {
  if (
    value === 'manual' ||
    value === 'entry-settle' ||
    value === 'hold' ||
    value === 'exit-prep' ||
    value === 'keyframe' ||
    value === 'zoom-anchor' ||
    value === 'zoom-motion' ||
    value === 'sfx-sync' ||
    value === 'transition-boundary'
  ) {
    return value;
  }
  return undefined;
}

function addSample(
  samples: Map<number, RenderedAestheticSample>,
  frame: number,
  durationInFrames: number,
  role: RenderedAestheticSampleRole,
  overlay: Overlay,
): void {
  const clampedFrame = clampFrame(frame, durationInFrames);
  const existing = samples.get(clampedFrame);
  if (existing) {
    existing.roles = uniqueSampleRoles([...existing.roles, role]);
    existing.sourceOverlayIds = uniqueIds([...existing.sourceOverlayIds, overlay.id]);
    existing.sourceOverlayTypes = uniqueStrings([...existing.sourceOverlayTypes, String(overlay.type)]);
    return;
  }

  samples.set(clampedFrame, {
    frame: clampedFrame,
    roles: [role],
    sourceOverlayIds: [overlay.id],
    sourceOverlayTypes: [String(overlay.type)],
  });
}

export function pickRenderedAestheticSampleFrames(
  overlays: Overlay[],
  durationInFrames: number,
  maxSamples = 18,
): number[] {
  const candidates = new Set<number>();
  for (const overlay of overlays) {
    if (!isSampledOverlay(overlay)) continue;
    const start = clampFrame(overlay.from, durationInFrames);
    const mid = clampFrame(overlay.from + Math.floor(Math.max(1, overlay.durationInFrames) * 0.55), durationInFrames);
    candidates.add(start);
    candidates.add(mid);
  }

  const sorted = [...candidates].sort((a, b) => a - b);
  if (sorted.length <= maxSamples) return sorted;
  const selected = new Set<number>();
  for (let i = 0; i < maxSamples; i += 1) {
    const index = Math.round((i * (sorted.length - 1)) / Math.max(1, maxSamples - 1));
    selected.add(sorted[index]);
  }
  return [...selected].sort((a, b) => a - b);
}

export function buildBaselineOverlays(overlays: Overlay[], width: number, height: number): Overlay[] {
  return overlays.filter((overlay) => {
    if (overlay.type === OverlayType.VIDEO || overlay.type === OverlayType.SOUND) return false;
    return isLikelyBackgroundOverlay(overlay, width, height);
  });
}

export function buildOverlayOnlyRenderOverlays(overlays: Overlay[], width: number, height: number): Overlay[] {
  return overlays.filter((overlay) => (
    overlay.type !== OverlayType.VIDEO &&
    overlay.type !== OverlayType.SOUND &&
    (isAuditedOverlay(overlay) || isLikelyBackgroundOverlay(overlay, width, height))
  ));
}

export function sourceDependentTransitionBlankJustification(input: {
  overlayOnly: boolean;
  sample: RenderedAestheticSample;
  sourceOverlays: Overlay[];
  renderOverlays: Overlay[];
}): string | undefined {
  if (!input.overlayOnly) return undefined;
  const sampledTransitionIds = input.sample.sourceOverlayIds
    .filter((id) => {
      const overlay = input.sourceOverlays.find((candidate) => String(candidate.id) === String(id));
      return overlay?.type === OverlayType.TRANSITION;
    })
    .map(String);
  if (sampledTransitionIds.length === 0) return undefined;
  const sampledNonTransition = input.sample.sourceOverlayIds.some((id) => {
    const overlay = input.sourceOverlays.find((candidate) => String(candidate.id) === String(id));
    return overlay && overlay.type !== OverlayType.TRANSITION;
  });
  if (sampledNonTransition) return undefined;

  const renderOverlayIds = new Set(input.renderOverlays.map((overlay) => String(overlay.id)));
  const sourceVideoIds = new Set(
    input.sourceOverlays
      .filter((overlay) => overlay.type === OverlayType.VIDEO)
      .map((overlay) => String(overlay.id)),
  );
  const transitionHasRemovedSourceClip = sampledTransitionIds.some((id) => {
    const transition = input.sourceOverlays.find((overlay) => String(overlay.id) === id);
    const clipAId = stringProp(transition, 'clipAId');
    const clipBId = stringProp(transition, 'clipBId');
    const linkedSourceIds = [clipAId, clipBId].filter((value): value is string => Boolean(value));
    return linkedSourceIds.length > 0 && linkedSourceIds.some((clipId) => sourceVideoIds.has(clipId) && !renderOverlayIds.has(clipId));
  });
  if (!transitionHasRemovedSourceClip) return undefined;
  return 'overlay-only transition sample omitted linked source video clips; blank transition pixels are source-dependent and not a renderer failure';
}

export function overlayOnlyBlankImageJustification(input: {
  overlayOnly: boolean;
  sample: RenderedAestheticSample;
  sourceOverlays: Overlay[];
  renderOverlays: Overlay[];
  activeAuditedVisualTypes?: string[];
  activeVisualEvidenceCount?: number;
  activeTimelineEvidenceCount?: number;
}): string | undefined {
  const transitionJustification = sourceDependentTransitionBlankJustification(input);
  if (transitionJustification) return transitionJustification;
  if (!input.overlayOnly) return undefined;
  if ((input.activeVisualEvidenceCount ?? 0) > 0) return undefined;

  const activeVisualTypes = uniqueStrings((input.activeAuditedVisualTypes ?? []).map(String));
  if (activeVisualTypes.every((type) => type === String(OverlayType.CAPTION)) && activeVisualTypes.length > 0) {
    return 'overlay-only caption sample has no active caption words at this frame; blank pixels are a speech-gap sample, not a renderer failure';
  }

  if (activeVisualTypes.length > 0) return undefined;

  const sampledTypes = uniqueStrings(input.sample.sourceOverlayTypes.map(String));
  const hasTimingOnlySignal = sampledTypes.some((type) => (
    type === String(OverlayType.VIDEO) ||
    AUDITED_TIMING_TYPES.has(type)
  )) || (input.activeTimelineEvidenceCount ?? 0) > 0;
  if (!hasTimingOnlySignal) return undefined;

  return `overlay-only sample has no active visual overlays; ${sampledTypes.join(', ') || 'timing'} evidence is source/timing-only and not a renderer failure`;
}

export function renderedOverlayBoxAtFrame(overlay: Overlay, frame: number): RenderedOverlayBox {
  const localFrame = Math.max(0, frame - overlay.from);
  const keyframes = overlay.keyframeTracks?.length ? evaluateAllTracks(overlay.keyframeTracks, localFrame) : {};
  let x = keyframes.x ?? overlay.left;
  let y = keyframes.y ?? overlay.top;
  let width = overlay.width;
  let height = overlay.height;
  const scale = keyframes.scale ?? 1;
  const opacity = keyframes.opacity ?? numericValue(overlayStyles(overlay).opacity) ?? 1;

  if (scale !== 1) {
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    x -= (scaledWidth - width) / 2;
    y -= (scaledHeight - height) / 2;
    width = scaledWidth;
    height = scaledHeight;
  }

  return {
    x,
    y,
    width,
    height,
    opacity,
    textPixelHeight: fontSizePx(overlayStyles(overlay).fontSize),
  };
}

async function renderIsolatedOverlayImages(input: {
  activeOverlays: Overlay[];
  baselineOverlays: Overlay[];
  frame: number;
  frameDir: string;
  input: RenderedAestheticProjectInput;
  serveUrl: string;
}): Promise<Map<string, RawImage>> {
  const images = new Map<string, RawImage>();
  for (const overlay of input.activeOverlays) {
    if (overlay.id === undefined) continue;
    const output = path.join(input.frameDir, `overlay-${safeFilename(String(overlay.id))}.png`);
    try {
      const isolatedProps = compositionProps(input.input, [...input.baselineOverlays, overlay]);
      const isolatedComposition = await selectComposition({
        serveUrl: input.serveUrl,
        id: COMP_NAME,
        inputProps: isolatedProps,
      });
      await renderStill({
        composition: isolatedComposition,
        serveUrl: input.serveUrl,
        output,
        frame: input.frame,
        inputProps: isolatedProps,
        imageFormat: 'png',
        chromiumOptions: { headless: true },
        overwrite: true,
      });
      if (fs.existsSync(output)) {
        images.set(String(overlay.id), await readRawImage(output));
      }
    } catch {
      // Main full-frame render remains the source of truth for render failure.
      // Isolated overlays only tighten evidence boxes when they are available.
    }
  }
  return images;
}

function activeRenderedOverlayEvidence(
  overlays: Overlay[],
  frame: number,
  renderEvidence: {
    baselineImage?: RawImage;
    fallbackImage?: RawImage;
    fps?: number;
    isolatedImages?: Map<string, RawImage>;
    sample?: RenderedAestheticSample;
  } = {},
): RenderedOverlayEvidence[] {
  return overlays
    .filter((overlay) => isAuditedOverlay(overlay) && isActiveAtFrame(overlay, frame))
    .flatMap((overlay) => {
      const fallbackBox = renderedOverlayBoxAtFrame(overlay, frame);
      const isolatedImage = overlay.id !== undefined ? renderEvidence.isolatedImages?.get(String(overlay.id)) : undefined;
      const paintedBox = isolatedImage && renderEvidence.baselineImage ? changedPixelBounds(isolatedImage, renderEvidence.baselineImage) : undefined;
      const box = paintedBox ? { ...fallbackBox, ...paintedBox } : fallbackBox;
      const receipt = buildFrameAwareOverlayReceipt(overlayAtomicReceipt(overlay), overlay, frame, renderEvidence.fps);
      if (!receipt && String(overlay.type) === String(OverlayType.CAPTION)) return [];
      const family = auditedOverlayEvidenceFamily(overlay, receipt);
      const pixelImage = isolatedImage ?? renderEvidence.fallbackImage;
      const pixels = pixelImage && renderEvidence.baselineImage ? overlayPixelEvidence(pixelImage, renderEvidence.baselineImage, box) : {};
      return [{
        id: overlay.id,
        type: String(overlay.type),
        family,
        receipt,
        sampleRoles: sampleRolesForOverlay(renderEvidence.sample, overlay),
        visualIntentStageMode: overlayVisualIntentStageMode(overlay) ?? fallbackVisualIntentStageMode(overlay),
        box: {
          ...box,
          ...pixels,
        },
      }];
    });
}

function activeTimelineOverlayEvidence(overlays: Overlay[], frame: number): RenderedTimelineOverlayEvidence[] {
  return overlays
    .filter((overlay) => isTimelineEvidenceOverlay(overlay) && isActiveAtFrame(overlay, frame))
    .map((overlay) => {
      const metadata = isRecord((overlay as Overlay & { metadata?: unknown }).metadata)
        ? (overlay as Overlay & { metadata: Record<string, unknown> }).metadata
        : {};
      const type = String(overlay.type);
      const sfxForm = isRecord(metadata.atomicSfxForm) ? metadata.atomicSfxForm : undefined;
      const zoomForm = isRecord(metadata.atomicZoomForm) ? metadata.atomicZoomForm : undefined;
      const role = stringValue(sfxForm?.role)
        ?? stringValue(zoomForm?.intent)
        ?? stringValue(metadata.role)
        ?? null;
      const styles = overlayStyles(overlay);

      return {
        id: overlay.id,
        type,
        family: type === 'zoom' ? 'zoom' : 'sfx',
        frame,
        localFrame: Math.max(0, frame - overlay.from),
        durationFrames: Math.max(1, overlay.durationInFrames),
        role,
        assetId: stringValue((overlay as Overlay & { assetId?: unknown }).assetId)
          ?? stringValue(metadata.providerAssetId)
          ?? null,
        volume: numericValue(styles.volume) ?? numericValue(metadata.volume) ?? null,
        hasAtomicForm: type === 'zoom' ? Boolean(zoomForm) : Boolean(sfxForm),
      };
    });
}

function sampleRolesForOverlay(sample: RenderedAestheticSample | undefined, overlay: Overlay): string[] | undefined {
  if (!sample || overlay.id === undefined) return undefined;
  const overlayId = String(overlay.id);
  const matchesSample = sample.sourceOverlayIds.some((id) => String(id) === overlayId);
  return matchesSample ? sample.roles : undefined;
}

function overlayVisualIntentStageMode(overlay: Overlay): string | undefined {
  const metadata = (overlay as Overlay & { metadata?: Record<string, unknown> }).metadata;
  const plan = isRecord(metadata?.atomicOverlayPlan) ? metadata.atomicOverlayPlan : undefined;
  const planIntent = isRecord(plan?.visualIntent) ? plan.visualIntent : undefined;
  const recipe = isRecord((overlay as Overlay & { recipe?: unknown }).recipe)
    ? (overlay as Overlay & { recipe: Record<string, unknown> }).recipe
    : undefined;
  const recipeIntent = isRecord(recipe?.visualIntent) ? recipe.visualIntent : undefined;
  return stringValue(planIntent?.stageMode) ?? stringValue(recipeIntent?.stageMode);
}

function auditedOverlayEvidenceFamily(
  overlay: Overlay,
  receipt: RenderedOverlayEvidence['receipt'],
): RenderedOverlayEvidence['family'] {
  if (overlay.type === OverlayType.GENERATED_SCENE) return 'motion-graphic';
  return receipt?.family;
}

function fallbackVisualIntentStageMode(overlay: Overlay): string | undefined {
  if (overlay.type === OverlayType.GENERATED_SCENE) return 'full-frame-graphic-scene';
  return undefined;
}

export function changedPixelBounds(fullImage: RawImage, baselineImage: RawImage): RenderedOverlayBox | undefined {
  if (
    fullImage.width !== baselineImage.width ||
    fullImage.height !== baselineImage.height ||
    fullImage.channels !== baselineImage.channels
  ) {
    return undefined;
  }

  let left = fullImage.width;
  let top = fullImage.height;
  let right = -1;
  let bottom = -1;
  const step = samplingStep(fullImage.width * fullImage.height, 250000);
  for (let y = 0; y < fullImage.height; y += step) {
    for (let x = 0; x < fullImage.width; x += step) {
      const offset = pixelOffset(fullImage, x, y);
      if (!pixelChanged(fullImage.data, baselineImage.data, offset)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return undefined;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left + step),
    height: Math.max(1, bottom - top + step),
  };
}

export function buildFrameAwareOverlayReceipt(
  receipt: RenderedOverlayEvidence['receipt'],
  overlay: Overlay,
  frame: number,
  fps = 30,
): RenderedOverlayEvidence['receipt'] {
  if (receipt?.family === 'motion-graphic') {
    return buildVisibleMotionGraphicOverlayReceipt(receipt, overlay);
  }
  if (!receipt || receipt.family !== 'caption') return receipt;
  const textForm = receipt.form.text;
  if (!textForm) return receipt;
  const captions = Array.isArray((overlay as { captions?: unknown }).captions)
    ? (overlay as { captions: Array<Record<string, unknown>> }).captions
    : [];
  if (captions.length === 0) return receipt;

  const frameMs = ((frame - overlay.from) / Math.max(1, fps)) * 1000;
  const activeCaption = captions.find((caption) => {
    const startMs = numericValue(caption.startMs) ?? 0;
    const endMs = numericValue(caption.endMs) ?? startMs;
    return frameMs >= startMs && frameMs <= endMs;
  });
  if (!activeCaption) return undefined;

  const displayConfig = captionDisplayConfig(overlay);
  const words = captionWords(activeCaption);
  const displayWords = wordsToDisplayAtFrame(words, frameMs, displayConfig);
  const rawText = displayWords.map((word) => word.word).join(' ').trim() || stringValue(activeCaption.text) || '';
  if (!rawText) return undefined;

  const maxWordsPerLine = Math.max(1, displayConfig.maxWordsPerLine ?? displayWords.length ?? 1);
  const targetRowCount = Math.max(1, Math.ceil(Math.max(1, displayWords.length) / maxWordsPerLine));
  const durationFrames = Math.max(
    1,
    Math.round(((numericValue(activeCaption.endMs) ?? frameMs) - (numericValue(activeCaption.startMs) ?? frameMs)) * Math.max(1, fps) / 1000),
  );

  return {
    ...receipt,
    durationFrames,
    form: {
      ...receipt.form,
      timing: {
        ...receipt.form.timing,
        durationFrames,
      },
      text: {
        ...textForm,
        rawText,
        glyphs: displayWords.map((word, index) => ({
          index,
          text: word.word,
          role: word.emphasis ? 'keyword' : 'word',
          lineIndex: Math.floor(index / maxWordsPerLine),
          visual: {
            scale: word.active ? 1.16 : 1,
            fontRole: 'primary',
            colorRole: word.active ? 'accent' : 'primary',
            highlightMode: word.active ? 'scale' : 'none',
          },
        })),
        composition: {
          ...textForm.composition,
          rowCapacity: maxWordsPerLine,
          targetRowCount,
        },
        display: {
          ...textForm.display,
          wordsPerGroup: displayConfig.wordsPerGroup,
          maxWordsPerLine,
        },
      },
    },
  };
}

function buildVisibleMotionGraphicOverlayReceipt(
  receipt: NonNullable<RenderedOverlayEvidence['receipt']>,
  overlay: Overlay,
): RenderedOverlayEvidence['receipt'] {
  const textForm = receipt.form.text;
  if (!textForm) return receipt;
  const visibleLines = visibleMotionGraphicTextLines(overlay);
  if (visibleLines.length === 0) return receipt;

  let glyphIndex = 0;
  const glyphs = visibleLines.flatMap((line, lineIndex) => {
    return line.split(/\s+/).filter(Boolean).map((word) => ({
      index: glyphIndex++,
      text: word,
      role: lineIndex === 0 ? 'entity' as const : 'word' as const,
      lineIndex,
      visual: {
        scale: lineIndex === 0 ? 1.08 : 1,
        fontRole: lineIndex === 0 ? 'primary' as const : 'secondary' as const,
        colorRole: lineIndex === 0 ? 'primary' as const : 'muted' as const,
        highlightMode: 'none' as const,
      },
    }));
  });
  if (glyphs.length === 0) return receipt;

  const lines = visibleLines.map((line, index) => {
    const lineGlyphs = glyphs.filter((glyph) => glyph.lineIndex === index);
    return {
      index,
      text: line,
      startGlyph: lineGlyphs[0]?.index ?? 0,
      endGlyph: lineGlyphs.at(-1)?.index ?? 0,
      wordCount: lineGlyphs.length,
      charCount: line.length,
    };
  });

  return {
    ...receipt,
    form: {
      ...receipt.form,
      text: {
        ...textForm,
        rawText: visibleLines.join(' '),
        glyphs,
        lines,
        lineBreaks: lines.slice(1).map((line) => line.startGlyph),
        composition: {
          ...textForm.composition,
          rowCapacity: Math.max(...lines.map((line) => line.wordCount), 1),
          targetRowCount: lines.length,
        },
      },
    },
  };
}

function visibleMotionGraphicTextLines(overlay: Overlay): string[] {
  const recipe = (overlay as { recipe?: unknown }).recipe;
  const content = (overlay as { content?: unknown }).content;
  if (!isRecord(recipe) || !Array.isArray(recipe.elements) || !isRecord(content)) return [];

  const lines: string[] = [];
  for (const element of recipe.elements) {
    if (!isRecord(element) || element.primitive !== 'text') continue;
    const bind = isRecord(element.bind) ? element.bind : {};
    const text = resolveMotionGraphicTextBinding(bind.text, content);
    if (text) lines.push(text);
  }
  return lines.filter((line, index, all) => all.indexOf(line) === index);
}

function resolveMotionGraphicTextBinding(binding: unknown, content: Record<string, unknown>): string | undefined {
  if (typeof binding !== 'string' || !binding.trim()) return undefined;
  if (binding.startsWith('content:')) {
    const value = content[binding.slice('content:'.length)];
    return stringValue(value)?.trim() || undefined;
  }
  if (binding.startsWith('token:')) return undefined;
  return binding.trim();
}

function captionDisplayConfig(overlay: Overlay): FrameAwareCaptionDisplayConfig {
  const raw = (overlay as { displayConfig?: Record<string, unknown> }).displayConfig ?? {};
  const mode = stringValue(raw.mode) ?? 'phrase';
  return {
    mode,
    wordsPerGroup: Math.max(1, Math.round(numericValue(raw.wordsPerGroup) ?? (mode === 'word-by-word' ? 1 : 4))),
    maxWordsPerLine: Math.max(1, Math.round(numericValue(raw.maxWordsPerLine) ?? (mode === 'word-by-word' ? 1 : 4))),
  };
}

function captionWords(caption: Record<string, unknown>): FrameAwareCaptionWord[] {
  const words = Array.isArray(caption.words) ? caption.words : [];
  if (words.length > 0) {
    return words
      .map<FrameAwareCaptionWord | undefined>((item) => {
        const record = isRecord(item) ? item : {};
        const word = stringValue(record.word);
        if (!word) return undefined;
        return {
          word,
          startMs: numericValue(record.startMs) ?? numericValue(caption.startMs) ?? 0,
          endMs: numericValue(record.endMs) ?? numericValue(caption.endMs) ?? numericValue(caption.startMs) ?? 0,
          emphasis: record.emphasis,
        };
      })
      .filter((item): item is FrameAwareCaptionWord => Boolean(item));
  }

  const text = stringValue(caption.text) ?? '';
  return text.split(/\s+/).filter(Boolean).map((word) => ({
    word,
    startMs: numericValue(caption.startMs) ?? 0,
    endMs: numericValue(caption.endMs) ?? numericValue(caption.startMs) ?? 0,
  }));
}

function wordsToDisplayAtFrame(
  words: FrameAwareCaptionWord[],
  frameMs: number,
  config: FrameAwareCaptionDisplayConfig,
): FrameAwareCaptionWord[] {
  if (words.length === 0) return [];
  const matchingIndex = words.findIndex((word) => frameMs >= word.startMs && frameMs <= word.endMs);
  const activeIndex = matchingIndex >= 0 ? matchingIndex : 0;

  if (config.mode === 'word-by-word') {
    return [{ ...words[activeIndex], active: true }];
  }

  if (config.mode === 'phrase' || config.mode === 'instagram' || config.mode === 'hormozi') {
    const halfWindow = Math.floor(config.wordsPerGroup / 2);
    const start = Math.max(0, Math.min(activeIndex - halfWindow, words.length - config.wordsPerGroup));
    const end = Math.min(words.length, start + config.wordsPerGroup);
    return words.slice(start, end).map((word, index) => ({
      ...word,
      active: start + index === activeIndex,
    }));
  }

  return words.map((word, index) => ({
    ...word,
    active: index === activeIndex,
  }));
}

function readProjectInput(inputFile: string): RenderedAestheticProjectInput {
  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8')) as Record<string, unknown>;
  const overlays = Array.isArray(raw.overlays) ? raw.overlays as Overlay[] : [];
  const durationInFrames = numberOr(raw.durationInFrames, maxOverlayEnd(overlays), 90);
  return {
    projectId: stringValue(raw.projectId),
    tag: stringValue(raw.tag),
    width: numberOr(raw.width, raw.compositionWidth, raw.canvasWidth, 1080),
    height: numberOr(raw.height, raw.compositionHeight, raw.canvasHeight, 1920),
    fps: numberOr(raw.fps, 30),
    durationInFrames,
    baseUrl: stringValue(raw.baseUrl),
    overlays,
    sampleFrames: Array.isArray(raw.sampleFrames)
      ? raw.sampleFrames.map((value) => Number(value)).filter(Number.isFinite)
      : undefined,
    samplePlan: normalizeRenderedAestheticSamplePlan(raw.samplePlan, durationInFrames),
  };
}

function selfTestProjectInput(): RenderedAestheticProjectInput {
  return {
    projectId: 'rendered-aesthetic-self-test',
    tag: 'self-test',
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 72,
    overlays: [{
      id: 1,
      type: OverlayType.TEXT,
      content: 'Readable check',
      from: 0,
      durationInFrames: 72,
      row: 0,
      left: 240,
      top: 720,
      width: 600,
      height: 160,
      isDragging: false,
      rotation: 0,
      styles: {
        fontSize: '72px',
        fontWeight: '800',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.64)',
        fontFamily: 'Inter',
        fontStyle: 'normal',
        textDecoration: 'none',
        lineHeight: '1.1',
        opacity: 1,
        padding: '16px',
        borderRadius: '8px',
      },
    }],
  };
}

function compositionProps(input: RenderedAestheticProjectInput, overlays: Overlay[]): Record<string, unknown> {
  return {
    overlays,
    durationInFrames: input.durationInFrames,
    fps: input.fps,
    width: input.width,
    height: input.height,
    baseUrl: input.baseUrl,
    isRendering: true,
  };
}

async function readRawImage(file: string): Promise<RawImage> {
  const result = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
    channels: result.info.channels,
  };
}

function imageStats(image: RawImage): RenderImageStats {
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let alphaSum = 0;
  let sampled = 0;
  const step = samplingStep(image.width * image.height, 60000);
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const offset = pixelOffset(image, x, y);
      const luma = luma255(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
      lumaSum += luma;
      lumaSquareSum += luma * luma;
      alphaSum += image.data[offset + 3] / 255;
      sampled += 1;
    }
  }
  const mean = sampled > 0 ? lumaSum / sampled : 0;
  const variance = sampled > 0 ? Math.max(0, lumaSquareSum / sampled - mean * mean) : 0;
  return {
    lumaStdDev: Math.sqrt(variance),
    alphaMean: sampled > 0 ? alphaSum / sampled : undefined,
  };
}

function motionProbeVisualOverlays(sample: RenderedAestheticSample, activeVisualOverlays: Overlay[]): Overlay[] {
  if (!sample.roles.some((role) => role !== 'manual' && role !== 'hold' && role !== 'sfx-sync')) return [];
  return activeVisualOverlays.filter(isMotionProbeEligibleOverlay);
}

function isMotionProbeEligibleOverlay(overlay: Overlay): boolean {
  if (overlay.type === OverlayType.GENERATED_SCENE) return true;
  return Array.isArray(overlay.keyframeTracks) && overlay.keyframeTracks.some((track) => track.keyframes.length > 1);
}

async function renderMotionProbe(input: {
  fullImage: RawImage;
  sample: RenderedAestheticSample;
  activeVisualOverlays: Overlay[];
  durationInFrames: number;
  frameDir: string;
  composition: RemotionComposition;
  serveUrl: string;
  inputProps: Record<string, unknown>;
}): Promise<MotionProbeResult> {
  const probeFrame = chooseMotionProbeFrame(input.sample, input.activeVisualOverlays, input.durationInFrames);
  if (probeFrame === undefined) {
    return { error: `no active visual overlay near frame ${input.sample.frame} for motion probe` };
  }

  const still = path.join(input.frameDir, `motion-probe-${String(probeFrame).padStart(5, '0')}.png`);
  try {
    await renderStill({
      composition: input.composition,
      serveUrl: input.serveUrl,
      output: still,
      frame: probeFrame,
      inputProps: input.inputProps,
      imageFormat: 'png',
      chromiumOptions: { headless: true },
      overwrite: true,
    });
    const probeImage = await readRawImage(still);
    return {
      still,
      delta: imageMotionDelta(input.fullImage, probeImage, input.sample.frame, probeFrame),
    };
  } catch (error) {
    return {
      still,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function chooseMotionProbeFrame(
  sample: RenderedAestheticSample,
  activeVisualOverlays: Overlay[],
  durationInFrames: number,
): number | undefined {
  const gap = MOTION_DELTA_PROBE_GAP_FRAMES;
  const direction = sample.roles.includes('exit-prep') ? -1 : 1;
  const seen = new Set<number>();
  const candidates = [
    sample.frame + direction * gap,
    sample.frame - direction * gap,
    sample.frame + direction,
    sample.frame - direction,
  ]
    .map((frame) => clampFrame(frame, durationInFrames))
    .filter((frame) => {
      if (frame === sample.frame || seen.has(frame)) return false;
      seen.add(frame);
      return true;
    });

  return candidates.find((frame) => activeVisualOverlays.some((overlay) => isActiveAtFrame(overlay, frame)));
}

export function imageMotionDelta(fromImage: RawImage, toImage: RawImage, fromFrame = 0, toFrame = 0): MotionDeltaEvidence {
  const width = Math.min(fromImage.width, toImage.width);
  const height = Math.min(fromImage.height, toImage.height);
  let changed = 0;
  let lumaDeltaSum = 0;
  let sampled = 0;
  const step = samplingStep(width * height, 60000);

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const fromOffset = pixelOffset(fromImage, x, y);
      const toOffset = pixelOffset(toImage, x, y);
      if (pixelChanged(fromImage.data, toImage.data, fromOffset, toOffset)) changed += 1;
      const fromLuma = luma01(fromImage.data[fromOffset], fromImage.data[fromOffset + 1], fromImage.data[fromOffset + 2]);
      const toLuma = luma01(toImage.data[toOffset], toImage.data[toOffset + 1], toImage.data[toOffset + 2]);
      lumaDeltaSum += Math.abs(fromLuma - toLuma);
      sampled += 1;
    }
  }

  return {
    fromFrame,
    toFrame,
    changedPixelRatio: sampled > 0 ? changed / sampled : 0,
    meanAbsoluteLumaDelta: sampled > 0 ? lumaDeltaSum / sampled : 0,
    sampledPixels: sampled,
  };
}

function applyMotionDeltaGate(report: RenderedFrameAestheticReport, motionProbe: MotionProbeResult | undefined): RenderedFrameAestheticReport {
  const issue = motionDeltaIssue(motionProbe);
  if (!issue) return report;

  return {
    ...report,
    score: 0,
    status: 'fail',
    issues: [...report.issues, issue],
    subscores: {
      ...report.subscores,
      motion: 0,
    },
  };
}

function motionDeltaIssue(motionProbe: MotionProbeResult | undefined): RenderedAestheticIssue | undefined {
  if (!motionProbe) return undefined;
  if (motionProbe.error) {
    return {
      dimension: 'motion',
      severity: 'fail',
      penalty: 1,
      message: 'motion probe could not be rendered',
      evidence: motionProbe.error,
    };
  }
  const delta = motionProbe.delta;
  if (!delta) return undefined;
  if (
    delta.changedPixelRatio <= MOTION_DELTA_CHANGED_RATIO_FLOOR
    && delta.meanAbsoluteLumaDelta <= MOTION_DELTA_LUMA_FLOOR
  ) {
    return {
      dimension: 'motion',
      severity: 'fail',
      penalty: 1,
      message: 'animation-state sample has near-zero rendered motion delta',
      evidence: `frames=${delta.fromFrame}->${delta.toFrame}; changedPixelRatio=${round3(delta.changedPixelRatio)}; meanAbsLumaDelta=${round3(delta.meanAbsoluteLumaDelta)}; sampledPixels=${delta.sampledPixels}`,
    };
  }
  return undefined;
}

function overlayPixelEvidence(
  fullImage: RawImage,
  baselineImage: RawImage,
  box: RenderedOverlayBox,
): OverlayPixelEvidence {
  const crop = clampCrop(box, fullImage.width, fullImage.height);
  if (!crop) return {};

  let sampled = 0;
  let changed = 0;
  const changedLumas: number[] = [];
  let backgroundLumaSum = 0;
  const step = samplingStep(crop.width * crop.height, 30000);
  for (let y = crop.y; y < crop.y + crop.height; y += step) {
    for (let x = crop.x; x < crop.x + crop.width; x += step) {
      const offset = pixelOffset(fullImage, x, y);
      const fullLuma = luma01(fullImage.data[offset], fullImage.data[offset + 1], fullImage.data[offset + 2]);
      const baseLuma = luma01(baselineImage.data[offset], baselineImage.data[offset + 1], baselineImage.data[offset + 2]);
      backgroundLumaSum += baseLuma;
      sampled += 1;

      if (pixelChanged(fullImage.data, baselineImage.data, offset)) {
        changed += 1;
        changedLumas.push(fullLuma);
      }
    }
  }

  const localBackgroundLuma = sampled > 0 ? backgroundLumaSum / sampled : undefined;
  const foregroundLuma = localBackgroundLuma !== undefined
    ? representativeForegroundLuma(changedLumas, localBackgroundLuma)
    : undefined;
  return {
    visiblePixelRatio: sampled > 0 ? changed / sampled : undefined,
    foregroundLuma,
    localBackgroundLuma,
    contrastRatio: foregroundLuma !== undefined && localBackgroundLuma !== undefined
      ? contrastRatio(foregroundLuma, localBackgroundLuma)
      : undefined,
  };
}

function representativeForegroundLuma(lumas: number[], backgroundLuma: number): number | undefined {
  if (lumas.length === 0) return undefined;
  const sorted = [...lumas].sort((a, b) => a - b);
  const dark = percentile(sorted, 0.1);
  const bright = percentile(sorted, 0.9);
  return contrastRatio(bright, backgroundLuma) >= contrastRatio(dark, backgroundLuma) ? bright : dark;
}

function buildHarnessReport(input: {
  tag: string;
  input: RenderedAestheticProjectInput;
  inputFile?: string;
  outputDir: string;
  frames: RenderedAestheticFrameReport[];
}): RenderedAestheticHarnessReport {
  const passFrames = input.frames.filter((frame) => frame.report.status === 'pass').length;
  const warnFrames = input.frames.filter((frame) => frame.report.status === 'warn').length;
  const failFrames = input.frames.filter((frame) => frame.report.status === 'fail').length;
  const frameScore = round3(input.frames.length
    ? Math.min(...input.frames.map((frame) => frame.report.score))
    : 0);
  const projectIssues = evaluateProjectLevelRenderedGates(input.input.overlays);
  const projectFail = projectIssues.some((issue) => issue.severity === 'fail');
  const projectWarn = projectIssues.some((issue) => issue.severity === 'warn');
  const score = projectFail ? 0 : frameScore;
  const jsonReport = path.join(input.outputDir, 'rendered-aesthetic.json');
  const htmlReport = path.join(input.outputDir, 'report.html');

  return {
    tag: input.tag,
    width: input.input.width,
    height: input.input.height,
    fps: input.input.fps,
    durationInFrames: input.input.durationInFrames,
    ...(input.inputFile ? { inputFile: input.inputFile } : {}),
    outputDir: input.outputDir,
    htmlReport,
    jsonReport,
    project: {
      ...(input.input.projectId ? { projectId: input.input.projectId } : {}),
      ...(input.inputFile ? { inputFile: input.inputFile } : {}),
      overlayCounts: countOverlayTypes(input.input.overlays),
      auditedOverlayCount: input.input.overlays.filter(isSampledOverlay).length,
    },
    summary: {
      status: projectFail || failFrames > 0 ? 'fail' : projectWarn || warnFrames > 0 ? 'warn' : 'pass',
      score,
      passFrames,
      warnFrames,
      failFrames,
      sampledFrames: input.frames.length,
      animationSampleFrames: input.frames.filter((frame) => frame.sample.roles.some((role) => role !== 'manual' && role !== 'hold')).length,
      projectIssueCount: projectIssues.length,
    },
    projectIssues,
    frames: input.frames,
  };
}

export function renderRenderedAestheticHtmlReport(report: RenderedAestheticHarnessReport): string {
  const projectIssueCards = report.projectIssues.length > 0
    ? `<section class="frame-card fail"><h2>Project gates</h2><ul class="issues">${report.projectIssues.map((issue) => (
      `<li><strong>${escapeHtml(issue.gateId)}</strong> ${escapeHtml(issue.severity)}: ${escapeHtml(issue.message)}${issue.evidence ? `<small>${escapeHtml(issue.evidence)}</small>` : ''}</li>`
    )).join('')}</ul></section>`
    : '';
  const frameCards = report.frames.map((frame) => {
    const issues = frame.report.issues.length > 0
      ? frame.report.issues.map((issue) => (
        `<li><strong>${escapeHtml(issue.dimension)}</strong> ${escapeHtml(issue.severity)}: ${escapeHtml(issue.message)}${issue.overlayId !== undefined ? ` <span>overlay ${escapeHtml(String(issue.overlayId))}</span>` : ''}${issue.evidence ? `<small>${escapeHtml(issue.evidence)}</small>` : ''}</li>`
      )).join('')
      : '<li class="ok">No issues on this sampled frame.</li>';
    const overlaySummary = frame.report.overlayReports.map((overlay) => (
      `<span class="pill">${escapeHtml(String(overlay.type ?? overlay.family ?? 'overlay'))} ${overlay.id !== undefined ? `#${escapeHtml(String(overlay.id))}` : ''}</span>`
    )).join('');
    const timelineEvidence = frame.timelineEvidence.length > 0
      ? frame.timelineEvidence.map((item) => (
        `<li><strong>${escapeHtml(item.family)}</strong> ${escapeHtml(item.type)}${item.id !== undefined ? ` <span>overlay ${escapeHtml(String(item.id))}</span>` : ''}<small>localFrame=${item.localFrame}/${item.durationFrames}; role=${escapeHtml(item.role ?? 'none')}; asset=${escapeHtml(item.assetId ?? 'none')}; volume=${item.volume ?? 'n/a'}; atomicForm=${item.hasAtomicForm ? 'yes' : 'no'}</small></li>`
      )).join('')
      : '<li class="ok">No active timing/audio evidence on this sampled frame.</li>';

    return `
      <section class="frame-card ${escapeHtml(frame.report.status)}">
        <div class="frame-head">
          <div>
            <h2>Frame ${frame.frame}</h2>
            <p>${escapeHtml(frame.sample.roles.join(', '))} | active overlays: ${escapeHtml(frame.activeOverlayIds.join(', ') || 'none')}</p>
          </div>
          <strong>${escapeHtml(frame.report.status)} | score ${frame.report.score}</strong>
        </div>
        <div class="media-grid">
          <figure>
            <figcaption>Full render</figcaption>
            <img src="${escapeHtml(toReportAssetPath(report.outputDir, frame.fullStill))}" alt="Full render frame ${frame.frame}">
          </figure>
          <figure>
            <figcaption>Baseline render</figcaption>
            <img src="${escapeHtml(toReportAssetPath(report.outputDir, frame.baselineStill))}" alt="Baseline render frame ${frame.frame}">
          </figure>
        </div>
        <div class="overlay-row">${overlaySummary || '<span class="pill">No active audited overlays</span>'}</div>
        <ul class="issues">${timelineEvidence}</ul>
        <ul class="issues">${issues}</ul>
      </section>
    `;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rendered aesthetic report - ${escapeHtml(report.tag)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f141d; color: #eef2ff; }
    body { margin: 0; padding: 32px; }
    header { max-width: 1180px; margin: 0 auto 24px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 28px; line-height: 1.1; }
    h2 { font-size: 18px; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 18px; }
    .box { background: #161d29; border: 1px solid #2a3446; border-radius: 8px; padding: 12px; }
    .box span { display: block; color: #96a3b8; font-size: 12px; margin-bottom: 4px; }
    main { max-width: 1180px; margin: 0 auto; display: grid; gap: 18px; }
    .frame-card { background: #151c28; border: 1px solid #2c384c; border-radius: 8px; padding: 16px; }
    .frame-card.fail { border-color: #ef4444; }
    .frame-card.warn { border-color: #f59e0b; }
    .frame-card.pass { border-color: #22c55e; }
    .frame-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .frame-head p { color: #9ca8ba; font-size: 13px; margin-top: 4px; }
    .media-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    figure { margin: 0; background: #0b1018; border: 1px solid #273246; border-radius: 8px; overflow: hidden; }
    figcaption { padding: 8px 10px; color: #aeb9ca; font-size: 12px; border-bottom: 1px solid #273246; }
    img { display: block; width: 100%; height: auto; }
    .overlay-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .pill { display: inline-flex; border: 1px solid #3a465a; border-radius: 999px; padding: 4px 8px; color: #cbd5e1; font-size: 12px; }
    .issues { margin: 0; padding-left: 18px; color: #e5e7eb; }
    .issues li { margin: 6px 0; }
    .issues small { display: block; color: #9ca3af; margin-top: 2px; }
    .ok { color: #86efac; }
  </style>
</head>
<body>
  <header>
    <h1>Rendered aesthetic report: ${escapeHtml(report.tag)}</h1>
    <div class="meta">
      <div class="box"><span>Status</span>${escapeHtml(report.summary.status)} | score ${report.summary.score}</div>
      <div class="box"><span>Project</span>${escapeHtml(report.project.projectId ?? 'local-json')}</div>
      <div class="box"><span>Canvas</span>${report.width} x ${report.height} @ ${report.fps}fps</div>
      <div class="box"><span>Duration</span>${report.durationInFrames} frames</div>
      <div class="box"><span>Samples</span>${report.summary.sampledFrames} frames, ${report.summary.animationSampleFrames} animation-state frames</div>
      <div class="box"><span>Project gates</span>${report.summary.projectIssueCount} issue(s)</div>
      <div class="box"><span>Overlays</span>${report.project.auditedOverlayCount} audited | ${escapeHtml(formatOverlayCounts(report.project.overlayCounts))}</div>
      <div class="box"><span>Input</span>${escapeHtml(report.project.inputFile ?? report.inputFile ?? 'self-test')}</div>
    </div>
  </header>
  <main>
    ${projectIssueCards}
    ${frameCards}
  </main>
</body>
</html>`;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else if (arg.startsWith('--out=')) args.outDir = arg.slice('--out='.length);
    else if (arg.startsWith('--max-samples=')) args.maxSamples = Number(arg.slice('--max-samples='.length));
    else if (arg.startsWith('--frames=')) args.sampleFrames = arg.slice('--frames='.length).split(',').map(Number).filter(Number.isFinite);
    else if (arg === '--overlay-only') args.overlayOnly = true;
    else if (!args.inputFile) args.inputFile = arg;
  }
  return args;
}

function printUsage(): void {
  console.log([
    'Usage:',
    '  npx tsx scripts/render-editron-aesthetic.ts <project-overlays.json> [--max-samples=18] [--frames=30,90] [--tag=name] [--overlay-only]',
    '  npx tsx scripts/render-editron-aesthetic.ts --self-test',
    '',
    '--overlay-only skips source video/audio while rendering overlays, so Phase 0 evidence is not blocked by remote asset fetches.',
    'Input JSON shape: { width, height, fps, durationInFrames, overlays, sampleFrames? }',
  ].join('\n'));
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help || (!args.selfTest && !args.inputFile)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }
  const report = await runRenderedAestheticHarness(args);
  console.log(`Rendered aesthetic JSON -> ${report.jsonReport}`);
  console.log(`Rendered aesthetic HTML -> ${report.htmlReport}`);
  console.log(`summary: ${report.summary.status} score=${report.summary.score} pass=${report.summary.passFrames} warn=${report.summary.warnFrames} fail=${report.summary.failFrames}`);
  if (report.summary.status === 'fail') process.exitCode = 1;
}

function requiredInputFile(inputFile: string | undefined): string {
  if (!inputFile) throw new Error('input file is required unless --self-test is used');
  return path.resolve(process.cwd(), inputFile);
}

function resetOutputDir(outputDir: string): void {
  const allowedRoots = [
    path.resolve(process.cwd(), '.calibration-temp', 'rendered-aesthetic'),
    path.resolve(process.cwd(), '.calibration-temp', 'phase0-fixtures'),
    path.resolve(process.cwd(), '.calibration-temp', 'phase0-live'),
  ];
  const resolved = path.resolve(outputDir);
  if (!allowedRoots.some((root) => isInsideAllowedRoot(resolved, root))) {
    throw new Error(`refusing to reset output outside allowed render roots: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function isInsideAllowedRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isAuditedOverlay(overlay: Overlay): boolean {
  if (overlay.type === OverlayType.IMAGE && overlay.row === ROW.VIDEO) return false;
  return AUDITED_VISUAL_TYPES.has(String(overlay.type));
}

function isSampledOverlay(overlay: Overlay): boolean {
  return isAuditedOverlay(overlay) || isTimelineEvidenceOverlay(overlay);
}

function isTimelineEvidenceOverlay(overlay: Overlay): boolean {
  return AUDITED_TIMING_TYPES.has(String(overlay.type));
}

function isActiveAtFrame(overlay: Overlay, frame: number): boolean {
  return frame >= overlay.from && frame < overlay.from + overlay.durationInFrames;
}

function isLikelyBackgroundOverlay(overlay: Overlay, width: number, height: number): boolean {
  if (overlay.type !== OverlayType.IMAGE && overlay.type !== OverlayType.HTML_SCENE) return false;
  const area = overlay.width * overlay.height;
  const frameArea = width * height;
  return overlay.left <= width * 0.05
    && overlay.top <= height * 0.05
    && area >= frameArea * 0.72;
}

function countOverlayTypes(overlays: Overlay[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const overlay of overlays) {
    const type = String(overlay.type);
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function formatOverlayCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return 'none';
  return entries.map(([type, count]) => `${type}:${count}`).join(', ');
}

function toReportAssetPath(outputDir: string, file: string): string {
  return path.relative(outputDir, file).replace(/\\/g, '/');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function overlayAtomicReceipt(overlay: Overlay): RenderedOverlayEvidence['receipt'] {
  const metadata = (overlay as Overlay & { metadata?: { atomicOverlayReceipt?: unknown } }).metadata;
  const receipt = metadata?.atomicOverlayReceipt;
  return isAtomicReceipt(receipt) ? receipt : undefined;
}

function isAtomicReceipt(value: unknown): value is NonNullable<RenderedOverlayEvidence['receipt']> {
  return typeof value === 'object'
    && value !== null
    && (value as { version?: unknown }).version === 'overlay-atoms-v1';
}

function overlayStyles(overlay: Overlay): Record<string, unknown> {
  const styles = (overlay as Overlay & { styles?: unknown }).styles;
  return typeof styles === 'object' && styles !== null && !Array.isArray(styles) ? styles as Record<string, unknown> : {};
}

function maxOverlayEnd(overlays: Overlay[]): number {
  return overlays.reduce((max, overlay) => Math.max(max, overlay.from + overlay.durationInFrames), 0);
}

function clampFrame(frame: number, durationInFrames: number): number {
  return Math.max(0, Math.min(Math.max(0, durationInFrames - 1), Math.round(frame)));
}

function clampCrop(box: RenderedOverlayBox, width: number, height: number): { x: number; y: number; width: number; height: number } | undefined {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(width, Math.ceil(box.x + box.width));
  const bottom = Math.min(height, Math.ceil(box.y + box.height));
  if (right <= x || bottom <= y) return undefined;
  return { x, y, width: right - x, height: bottom - y };
}

function pixelOffset(image: RawImage, x: number, y: number): number {
  return (y * image.width + x) * image.channels;
}

function pixelChanged(full: Buffer, baseline: Buffer, fullOffset: number, baselineOffset = fullOffset): boolean {
  return Math.max(
    Math.abs(full[fullOffset] - baseline[baselineOffset]),
    Math.abs(full[fullOffset + 1] - baseline[baselineOffset + 1]),
    Math.abs(full[fullOffset + 2] - baseline[baselineOffset + 2]),
    Math.abs(full[fullOffset + 3] - baseline[baselineOffset + 3]),
  ) > 10;
}

function luma255(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function luma01(r: number, g: number, b: number): number {
  return luma255(r, g, b) / 255;
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b) + 0.05;
  const darker = Math.min(a, b) + 0.05;
  return darker > 0 ? lighter / darker : 1;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
}

function samplingStep(area: number, maxSamples: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(area / maxSamples)));
}

function fontSizePx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^\s*(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : undefined;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function numberOr(...values: unknown[]): number {
  for (const value of values) {
    const parsed = numericValue(value);
    if (parsed !== undefined) return parsed;
  }
  return 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase() || 'run';
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'overlay';
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueIds(values: Array<number | string>): Array<number | string> {
  return [...new Set(values)];
}

function uniqueSampleRoles(values: RenderedAestheticSampleRole[]): RenderedAestheticSampleRole[] {
  const order: RenderedAestheticSampleRole[] = [
    'manual',
    'entry-settle',
    'hold',
    'exit-prep',
    'keyframe',
    'zoom-anchor',
    'zoom-motion',
    'transition-boundary',
    'sfx-sync',
  ];
  const set = new Set(values);
  return order.filter((role) => set.has(role));
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  main().catch((error) => {
    console.error('RENDERED AESTHETIC ERROR:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
