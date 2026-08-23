import { buildEditedTimelineContext } from './edited-timeline-context';
import type { RawFootageAnalysis } from './signal-registry';
import {
  assessVjepaReliability,
  auditVjepaCoverage,
  resolveVjepaScreenContextPolicy,
  summarizeVideoTimelineDurationMs,
  type VjepaCoverageAudit,
  type VjepaCoverageSegment,
} from './vjepa-coverage-audit';
import type { PersistedQualityReviewIssue } from './quality-review-persistence';
import type { Phase0RenderArtifactPack } from './phase0-render-artifact-pack';
import { summarizeFinalOverlayChoreographyBypasses } from './cross-overlay-final-overlays';
import { ROW } from '@/lib/pipeline/scene-to-editron';

export const PHASE0_FIXTURE_VERSION = 'editron-phase0-fixture-v1' as const;

type JsonRecord = Record<string, unknown>;

type Phase0RenderedAestheticStatus = 'pass' | 'warn' | 'fail';
type Phase0RenderedIssueSeverity = 'info' | 'warn' | 'fail';
type Phase0RenderedArtifactAccess = 'missing' | 'workspace-local' | 'worker-local';

type Phase0UnifiedDecisionAuthoritySummary = {
  version: string;
  executableProducer: string;
  advisoryProducers: string[];
  signalDecisionRole: string;
  signalDecisionsCanAddExecutable: boolean;
  decisionMode: string | null;
  legacyAuthority?: string;
};

type Phase0SignalDecisionHealthStatus =
  | 'missing'
  | 'empty'
  | 'no-executable-signals'
  | 'normalization-incomplete'
  | 'present';

export interface Phase0OverlayLike extends JsonRecord {
  id?: string | number;
  type?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
  assetId?: string;
  content?: unknown;
  text?: string;
  captionText?: string;
  transitionStyle?: string;
  styles?: JsonRecord;
  metadata?: JsonRecord;
}

export interface Phase0FixtureProject extends JsonRecord {
  projectId?: string;
  id?: string;
  durationInFrames?: number;
  fps?: number;
  playerDimensions?: { width?: number; height?: number };
  aspectRatio?: string;
  overlays?: Phase0OverlayLike[];
  rawFootageAnalysis?: RawFootageAnalysis;
  qualityReview?: JsonRecord;
  vjepaAnalysis?: {
    segments?: VjepaCoverageSegment[];
    rawFootageSegments?: VjepaCoverageSegment[];
  };
  intelligence?: {
    unifiedDecisionBundle?: JsonRecord;
    postBundleProfileActionPolicy?: JsonRecord;
    vjepaCoverageAudit?: VjepaCoverageAudit;
  };
}

export interface Phase0RenderedAestheticReportLike {
  outputDir?: string;
  htmlReport?: string;
  jsonReport?: string;
  summary?: {
    status?: Phase0RenderedAestheticStatus;
    score?: number;
    absoluteQualityStatus?: Phase0RenderedAestheticStatus;
    absoluteQualityScore?: number;
    mutationStatus?: 'not-required' | 'pass' | 'fail';
    mutationChangedFrameCount?: number;
    passFrames?: number;
    warnFrames?: number;
    failFrames?: number;
    sampledFrames?: number;
    animationSampleFrames?: number;
  };
  frames?: Array<{
    frame?: number;
    activeOverlayIds?: Array<string | number>;
    activeOverlayTypes?: string[];
    fullStill?: string;
    baselineStill?: string;
    /** Exact sampled-pixel delta retained for operation-specific proof owners. */
    mutationPixelCount?: number;
    sampledPixelCount?: number;
    report?: {
      status?: Phase0RenderedAestheticStatus;
      score?: number;
      issues?: Array<{
        dimension?: string;
        severity?: Phase0RenderedIssueSeverity;
        overlayId?: string | number;
        message?: string;
        evidence?: string;
      }>;
    };
  }>;
}
export interface Phase0RenderedIssueSample {
  frame: number;
  dimension: string;
  severity: 'info' | 'warn' | 'fail';
  overlayId: string | number | null;
  message: string;
  evidence: string | null;
}

export interface BuildPhase0FixtureManifestOptions {
  capturedAt?: string;
  source?: string;
  artifactDir?: string;
  codeProvenance?: Phase0CodeProvenance;
}

export interface Phase0CodeProvenance {
  branch: string | null;
  head: string | null;
  upstreamHead: string | null;
  dirty: boolean;
  dirtyPaths: string[];
  untrackedPaths: string[];
  capturedBy: string;
}

export interface Phase0FixtureManifest {
  version: typeof PHASE0_FIXTURE_VERSION;
  projectId: string;
  capturedAt: string;
  source: string;
  codeProvenance: Phase0CodeProvenance | null;
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  canvas: {
    width: number | null;
    height: number | null;
    aspectRatio: string | null;
  };
  overlayCounts: Record<string, number>;
  cutContinuity: ReturnType<typeof summarizeCutContinuity>;
  cutPlan: ReturnType<typeof summarizeCutPlan>;
  sourceMapping: ReturnType<typeof summarizeSourceMapping>;
  canonicalTimeline: ReturnType<typeof summarizeCanonicalTimeline>;
  unifiedDecisionBundle: ReturnType<typeof summarizeUnifiedDecisionBundle>;
  finalOverlayChoreography: ReturnType<typeof summarizeFinalOverlayChoreography>;
  oldProducerGating: ReturnType<typeof summarizeOldProducerGating>;
  qualityReview: ReturnType<typeof summarizeQualityReview>;
  vjepaCoverage: ReturnType<typeof summarizeVjepaCoverage>;
  overlayFamilies: ReturnType<typeof summarizeOverlayFamilies>;
  renderArtifacts: {
    status: 'not-rendered' | 'rendered';
    artifactDir: string | null;
    renderedAestheticDir: string | null;
    renderedAestheticJson: string | null;
    renderedAestheticHtml: string | null;
    pendingFamilies: string[];
    artifactPackStatus: 'ready' | 'not-renderable' | null;
    artifactPackIssues: string[];
    renderCommand: string | null;
    auditedVisualCount: number;
    auditedMotionCount: number;
    auditedAudioCount: number;
    presentRequiredFamilies: string[];
    missingRequiredFamilies: string[];
    renderedSummary: {
      status: Phase0RenderedAestheticStatus;
      score: number | null;
      passFrames: number;
      warnFrames: number;
      failFrames: number;
      sampledFrames: number;
      animationSampleFrames: number;
    } | null;
    renderedIssueCount: number;
    renderedIssuesBySeverity: Record<Phase0RenderedIssueSeverity, number>;
    renderedIssuesByDimension: Record<string, number>;
    renderedIssueSamples: Phase0RenderedIssueSample[];
    sampledFrames: Array<{
      frame: number;
      status: Phase0RenderedAestheticStatus | null;
      score: number | null;
      issueCount: number;
      activeOverlayIds: Array<string | number>;
      activeOverlayTypes: string[];
      fullStill: string | null;
      baselineStill: string | null;
    }>;
  };
  failureClasses: string[];
  calibrationSafety: {
    renderQualityRequiredBeforeWrites: true;
    learningWritesAllowed: false;
    reason: string;
  };
}

export interface Phase0RenderedQualityEvidencePayload {
  qualityEvidenceSource: 'rendered-aesthetic' | 'metadata-only';
  renderedAestheticStatus: Phase0RenderedAestheticStatus | 'missing';
  renderedQualityStatus: Phase0RenderedAestheticStatus | 'missing';
  artifactStatus: Phase0RenderedAestheticStatus | 'missing';
  qualityScore: number | null;
  renderedAestheticScore: number | null;
  renderedAestheticIssueCount: number;
  renderedAestheticFailFrameCount: number;
  renderedAestheticWarnFrameCount: number;
  renderedAestheticSampledFrames: number;
  renderedAestheticJson: string | null;
  renderedAestheticHtml: string | null;
  renderedAestheticArtifactAccess: Phase0RenderedArtifactAccess;
  renderedAestheticArtifactNote: string | null;
  renderedAestheticIssueSamples: Phase0RenderedIssueSample[];
}

export function buildPhase0FixtureManifest(
  project: Phase0FixtureProject,
  options: BuildPhase0FixtureManifestOptions = {},
): Phase0FixtureManifest {
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const fps = readPositiveNumber(project.fps, 30);
  const durationFrames = resolveDurationFrames(project, overlays);
  const projectId = String(project.projectId ?? project.id ?? 'unknown-project');

  return {
    version: PHASE0_FIXTURE_VERSION,
    projectId,
    capturedAt: options.capturedAt ?? new Date(0).toISOString(),
    source: options.source ?? 'in-memory-project',
    codeProvenance: options.codeProvenance ?? null,
    fps,
    durationFrames,
    durationSeconds: round(durationFrames / fps),
    canvas: {
      width: readNullableNumber(project.playerDimensions?.width),
      height: readNullableNumber(project.playerDimensions?.height),
      aspectRatio: typeof project.aspectRatio === 'string' ? project.aspectRatio : null,
    },
    overlayCounts: countByType(overlays),
    cutContinuity: summarizeCutContinuity(overlays, durationFrames),
    cutPlan: summarizeCutPlan(project),
    sourceMapping: summarizeSourceMapping(overlays),
    canonicalTimeline: summarizeCanonicalTimeline(project, overlays, fps, durationFrames),
    unifiedDecisionBundle: summarizeUnifiedDecisionBundle(project),
    finalOverlayChoreography: summarizeFinalOverlayChoreography(overlays),
    oldProducerGating: summarizeOldProducerGating(project),
    qualityReview: summarizeQualityReview(project),
    vjepaCoverage: summarizeVjepaCoverage(project, overlays, fps),
    overlayFamilies: summarizeOverlayFamilies(overlays, project.playerDimensions),
    renderArtifacts: {
      status: 'not-rendered',
      artifactDir: options.artifactDir ?? null,
      renderedAestheticDir: null,
      renderedAestheticJson: null,
      renderedAestheticHtml: null,
      pendingFamilies: ['motion-graphic', 'caption', 'transition', 'sfx', 'zoom'],
      artifactPackStatus: null,
      artifactPackIssues: [],
      renderCommand: null,
      auditedVisualCount: 0,
      auditedMotionCount: 0,
      auditedAudioCount: 0,
      presentRequiredFamilies: [],
      missingRequiredFamilies: ['motion-graphic', 'caption', 'transition', 'sfx', 'zoom'],
      renderedSummary: null,
      renderedIssueCount: 0,
      renderedIssuesBySeverity: { fail: 0, warn: 0, info: 0 },
      renderedIssuesByDimension: {},
      renderedIssueSamples: [],
      sampledFrames: [],
    },
    failureClasses: [],
    calibrationSafety: {
      renderQualityRequiredBeforeWrites: true,
      learningWritesAllowed: false,
      reason: 'phase0 fixture is evidence-only; calibration writes require rendered aesthetic artifacts',
    },
  };
}

export function withPhase0RenderArtifactPack(
  manifest: Phase0FixtureManifest,
  artifactPack: Phase0RenderArtifactPack,
): Phase0FixtureManifest {
  const missingRequiredFamilies = artifactPack.familyCoverage.missingRequiredFamilies.slice();
  return {
    ...manifest,
    renderArtifacts: {
      status: 'not-rendered',
      artifactDir: artifactPack.artifactDir || manifest.renderArtifacts.artifactDir,
      renderedAestheticDir: artifactPack.paths.renderedAestheticDir,
      renderedAestheticJson: artifactPack.paths.renderedAestheticJson,
      renderedAestheticHtml: artifactPack.paths.renderedAestheticHtml,
      pendingFamilies: missingRequiredFamilies,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues.slice(0, 20),
      renderCommand: artifactPack.renderCommand,
      auditedVisualCount: artifactPack.familyCoverage.auditedVisualCount,
      auditedMotionCount: artifactPack.familyCoverage.auditedMotionCount,
      auditedAudioCount: artifactPack.familyCoverage.auditedAudioCount,
      presentRequiredFamilies: artifactPack.familyCoverage.presentRequiredFamilies.slice(),
      missingRequiredFamilies,
      renderedSummary: null,
      renderedIssueCount: 0,
      renderedIssuesBySeverity: { fail: 0, warn: 0, info: 0 },
      renderedIssuesByDimension: {},
      renderedIssueSamples: [],
      sampledFrames: [],
    },
  };
}

export function withPhase0RenderedAestheticReport(
  manifest: Phase0FixtureManifest,
  report: Phase0RenderedAestheticReportLike,
): Phase0FixtureManifest {
  const evidence = summarizeRenderedAestheticReport(report);
  return {
    ...manifest,
    renderArtifacts: {
      ...manifest.renderArtifacts,
      status: 'rendered',
      renderedAestheticDir: readString(report.outputDir) || manifest.renderArtifacts.renderedAestheticDir,
      renderedAestheticJson: readString(report.jsonReport) || manifest.renderArtifacts.renderedAestheticJson,
      renderedAestheticHtml: readString(report.htmlReport) || manifest.renderArtifacts.renderedAestheticHtml,
      renderedSummary: evidence.summary,
      renderedIssueCount: evidence.issueCount,
      renderedIssuesBySeverity: evidence.issuesBySeverity,
      renderedIssuesByDimension: evidence.issuesByDimension,
      renderedIssueSamples: evidence.issueSamples,
      sampledFrames: evidence.sampledFrames,
    },
  };
}

export function buildPhase0RenderedQualityEvidencePayload(
  manifest: Phase0FixtureManifest,
): Phase0RenderedQualityEvidencePayload {
  const summary = manifest.renderArtifacts.renderedSummary;
  const hasRenderedEvidence = manifest.renderArtifacts.status === 'rendered' && summary != null;
  const status = hasRenderedEvidence ? summary.status : 'missing';
  return {
    qualityEvidenceSource: hasRenderedEvidence ? 'rendered-aesthetic' : 'metadata-only',
    renderedAestheticStatus: status,
    renderedQualityStatus: status,
    artifactStatus: status,
    qualityScore: hasRenderedEvidence ? normalizeRenderedQualityScore(summary.score) : null,
    renderedAestheticScore: hasRenderedEvidence ? summary.score : null,
    renderedAestheticIssueCount: hasRenderedEvidence ? manifest.renderArtifacts.renderedIssueCount : 0,
    renderedAestheticFailFrameCount: hasRenderedEvidence ? summary.failFrames : 0,
    renderedAestheticWarnFrameCount: hasRenderedEvidence ? summary.warnFrames : 0,
    renderedAestheticSampledFrames: hasRenderedEvidence ? summary.sampledFrames : 0,
    renderedAestheticJson: hasRenderedEvidence ? manifest.renderArtifacts.renderedAestheticJson : null,
    renderedAestheticHtml: hasRenderedEvidence ? manifest.renderArtifacts.renderedAestheticHtml : null,
    renderedAestheticArtifactAccess: hasRenderedEvidence ? 'workspace-local' : 'missing',
    renderedAestheticArtifactNote: hasRenderedEvidence
      ? 'Rendered aesthetic report paths are workspace-local artifact paths for the fixture or current process.'
      : 'Rendered aesthetic report artifacts are missing.',
    renderedAestheticIssueSamples: hasRenderedEvidence ? manifest.renderArtifacts.renderedIssueSamples.slice(0, 24) : [],
  };
}

function summarizeCutContinuity(overlays: Phase0OverlayLike[], durationFrames: number) {
  const clips = primaryVisualClips(overlays);
  const transitions = transitionOverlays(overlays);
  const gaps: Array<{ afterClipId: string; beforeClipId: string; startFrame: number; endFrame: number; durationFrames: number }> = [];
  const overlaps: Array<{
    clipId: string;
    previousClipId: string;
    startFrame: number;
    previousEndFrame: number;
    overlapFrames: number;
    classification: 'intentional-transition-handle' | 'unclassified-overlap';
    transitionId: string | null;
    transitionStartFrame: number | null;
    transitionDurationFrames: number | null;
  }> = [];

  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1];
    const current = clips[index];
    const previousEnd = readFrame(previous.from) + readDuration(previous.durationInFrames);
    const currentStart = readFrame(current.from);
    const delta = currentStart - previousEnd;
    if (delta > 1) {
      gaps.push({
        afterClipId: overlayId(previous),
        beforeClipId: overlayId(current),
        startFrame: previousEnd,
        endFrame: currentStart,
        durationFrames: delta,
      });
    } else if (delta < -1) {
      const overlapStartFrame = currentStart;
      const overlapEndFrame = previousEnd;
      const transition = findTransitionHandleForOverlap(transitions, overlapStartFrame, overlapEndFrame);
      overlaps.push({
        clipId: overlayId(current),
        previousClipId: overlayId(previous),
        startFrame: currentStart,
        previousEndFrame: previousEnd,
        overlapFrames: Math.abs(delta),
        classification: transition ? 'intentional-transition-handle' : 'unclassified-overlap',
        transitionId: transition ? overlayId(transition) : null,
        transitionStartFrame: transition ? readFrame(transition.from) : null,
        transitionDurationFrames: transition ? readDuration(transition.durationInFrames) : null,
      });
    }
  }

  const lastClip = clips[clips.length - 1];
  const lastEnd = lastClip ? readFrame(lastClip.from) + readDuration(lastClip.durationInFrames) : 0;
  return {
    clipCount: clips.length,
    firstStartFrame: clips[0] ? readFrame(clips[0].from) : null,
    lastEndFrame: clips.length ? lastEnd : null,
    tailGapFrames: clips.length ? Math.max(0, durationFrames - lastEnd) : durationFrames,
    midTimelineGapCount: gaps.length,
    overlapCount: overlaps.length,
    intentionalTransitionOverlapCount: overlaps.filter((overlap) => overlap.classification === 'intentional-transition-handle').length,
    unclassifiedOverlapCount: overlaps.filter((overlap) => overlap.classification === 'unclassified-overlap').length,
    gaps: gaps.slice(0, 20),
    overlaps: overlaps.slice(0, 20),
    firstClips: clips.slice(0, 12).map((clip) => ({
      id: overlayId(clip),
      from: readFrame(clip.from),
      durationInFrames: readDuration(clip.durationInFrames),
      sourceStartFrame: readNullableNumber(clip.sourceStartFrame ?? clip.videoStartTime),
      assetId: typeof clip.assetId === 'string' ? clip.assetId : null,
    })),
  };
}

function summarizeCutPlan(project: Phase0FixtureProject) {
  const rawFootage = project.rawFootageAnalysis;
  if (!rawFootage) {
    return {
      status: 'missing-raw-footage' as const,
      actionCount: 0,
      countsByAction: {},
      countsByReason: {},
      removalActionCount: 0,
      shortenActionCount: 0,
      splitActionCount: 0,
      pacingSplitCount: 0,
      pacingSplitsMissingEvidenceCount: 0,
      actions: [] as ReturnType<typeof summarizeCutPlanAction>[],
      issue: 'rawFootageAnalysis is not present on the project',
    };
  }

  const plan = Array.isArray(rawFootage.silenceRemovalPlan)
    ? rawFootage.silenceRemovalPlan.filter(isRecord)
    : [];
  const countsByAction = countByField(plan, 'action');
  const countsByReason = countByField(plan, 'reason');
  const actions = plan.slice(0, 80).map(summarizeCutPlanAction);
  const pacingSplitActions = actions.filter((action) => action.reason === 'pacing-split' || action.action === 'split');
  const pacingSplitsMissingEvidenceCount = pacingSplitActions.filter((action) => (
    action.pacingEvidence.boundaryReasons.length === 0 ||
    action.pacingEvidence.speechGapMs == null
  )).length;

  return {
    status: plan.length > 0 ? 'present' as const : 'empty' as const,
    actionCount: plan.length,
    countsByAction,
    countsByReason,
    removalActionCount: countsByAction.remove ?? 0,
    shortenActionCount: countsByAction.shorten ?? 0,
    splitActionCount: countsByAction.split ?? 0,
    pacingSplitCount: pacingSplitActions.length,
    pacingSplitsMissingEvidenceCount,
    actions,
    issue: plan.length > 0 ? null : 'silenceRemovalPlan is empty or missing',
  };
}

function summarizeCutPlanAction(action: JsonRecord) {
  const metadata = isRecord(action.metadata) ? action.metadata : {};
  const boundaryReasons = Array.isArray(metadata.boundaryReasons)
    ? metadata.boundaryReasons.map(readString).filter(Boolean)
    : [];

  return {
    startMs: readPositiveNumber(action.startMs, 0),
    endMs: readPositiveNumber(action.endMs, 0),
    durationMs: Math.max(0, readPositiveNumber(action.endMs, 0) - readPositiveNumber(action.startMs, 0)),
    action: readString(action.action) || 'unknown',
    reason: readString(action.reason) || 'unknown',
    shortenToMs: readNullableNumber(action.shortenToMs),
    pacingEvidence: {
      kind: readString(metadata.kind) || null,
      source: readString(metadata.source) || null,
      calibrationStatus: readString(metadata.calibrationStatus) || null,
      previousSegmentIndex: readNullableNumber(metadata.previousSegmentIndex),
      nextSegmentIndex: readNullableNumber(metadata.nextSegmentIndex),
      boundaryReasons,
      speechGapMs: readNullableNumber(metadata.speechGapMs),
      previousEndedSentence: typeof metadata.previousEndedSentence === 'boolean' ? metadata.previousEndedSentence : null,
      previousWord: readString(metadata.previousWord) || null,
      nextWord: readString(metadata.nextWord) || null,
      previousTextPreview: preview(metadata.previousTextPreview),
      nextTextPreview: preview(metadata.nextTextPreview),
    },
  };
}

function summarizeSourceMapping(overlays: Phase0OverlayLike[]) {
  const clips = videoClips(overlays);
  const mappedClipCount = clips.filter((clip) => Number.isFinite(clip.sourceStartFrame ?? clip.videoStartTime)).length;
  return {
    clipCount: clips.length,
    mappedClipCount,
    missingSourceMappingCount: Math.max(0, clips.length - mappedClipCount),
    hasCompleteSourceMapping: clips.length === 0 || mappedClipCount === clips.length,
  };
}

function summarizeCanonicalTimeline(
  project: Phase0FixtureProject,
  overlays: Phase0OverlayLike[],
  fps: number,
  durationFrames: number,
) {
  if (!project.rawFootageAnalysis) {
    return {
      status: 'missing-raw-footage' as const,
      durationFrames: null,
      durationMs: null,
      transcriptionWordCount: null,
      evidence: null,
      issue: 'rawFootageAnalysis is not present on the project',
    };
  }

  try {
    const context = buildEditedTimelineContext({
      rawFootage: project.rawFootageAnalysis,
      overlays,
      fps,
      projectDurationFrames: durationFrames,
    });
    return {
      status: context.evidence.isCanonicalDecisionTimeline ? 'ok' as const : 'unsafe' as const,
      durationFrames: context.durationFrames,
      durationMs: context.durationMs,
      transcriptionWordCount: context.transcription.length,
      evidence: context.evidence,
      issue: context.evidence.isCanonicalDecisionTimeline ? null : 'edited timeline lacks complete source mapping',
    };
  } catch (error) {
    return {
      status: 'error' as const,
      durationFrames: null,
      durationMs: null,
      transcriptionWordCount: null,
      evidence: null,
      issue: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeUnifiedDecisionBundle(project: Phase0FixtureProject) {
  const bundle = project.intelligence?.unifiedDecisionBundle;
  if (!bundle) {
    return {
      status: 'missing' as const,
      source: null,
      authority: null,
      totalDecisions: 0,
      counts: {},
      evidence: null,
      signalDecisionHealth: summarizeSignalDecisionHealth(null),
      decisionOutputTrace: summarizeDecisionOutputTrace(null),
      crossOverlayChoreography: summarizeCrossOverlayChoreography(null),
    };
  }

  const decisions = Array.isArray(bundle.decisions)
    ? bundle.decisions
    : Array.isArray((bundle.edl as JsonRecord | undefined)?.decisions)
      ? ((bundle.edl as JsonRecord).decisions as unknown[])
      : [];
  const evidence = isRecord(bundle.evidence) ? bundle.evidence : null;

  return {
    status: 'present' as const,
    source: readString(bundle.source),
    authority: normalizeUnifiedDecisionAuthority(bundle.authority),
    totalDecisions: readPositiveNumber(bundle.totalDecisions, decisions.length),
    counts: (isRecord(bundle.counts) ? bundle.counts : isRecord(bundle.decisionCounts) ? bundle.decisionCounts : countDecisions(decisions)),
    evidence,
    signalDecisionHealth: summarizeSignalDecisionHealth(evidence),
    decisionOutputTrace: summarizeDecisionOutputTrace(bundle.executionTrace),
    crossOverlayChoreography: summarizeCrossOverlayChoreography(evidence),
  };
}

function summarizeFinalOverlayChoreography(overlays: Phase0OverlayLike[]) {
  const report = summarizeFinalOverlayChoreographyBypasses(overlays as any[]);
  const overlayCount = readPositiveNumber(report.overlayCount, overlays.length);
  const bypassOverlayCount = readPositiveNumber(report.bypassOverlayCount, 0);
  return {
    version: 'phase0-cross-overlay-final-overlays-v1' as const,
    status: bypassOverlayCount > 0 ? 'present' as const : 'none' as const,
    overlayCount,
    bypassOverlayCount,
    bypassRate: overlayCount > 0 ? round(bypassOverlayCount / overlayCount) : null,
    countsByProducer: normalizeNumberRecord(report.countsByProducer),
    countsByFamily: normalizeNumberRecord(report.countsByFamily),
    topBypasses: report.bypasses.slice(0, 20).map(summarizeFinalOverlayBypass),
    calibrationStatus: readString(report.calibrationStatus) || null,
  };
}

function summarizeFinalOverlayBypass(value: unknown) {
  const item = isRecord(value) ? value : {};
  return {
    overlayId: typeof item.overlayId === 'string' || typeof item.overlayId === 'number' ? item.overlayId : null,
    type: readString(item.type) || 'unknown',
    producer: readString(item.producer) || 'unknown',
    family: readString(item.family) || 'unknown',
    lane: readString(item.lane) || 'unknown',
    from: readNullableNumber(item.from),
    durationFrames: readNullableNumber(item.durationFrames),
    reason: readString(item.reason) || 'unknown',
    movable: item.movable === false ? false : null,
    calibrationStatus: readString(item.calibrationStatus) || null,
  };
}

function summarizeCrossOverlayChoreography(evidence: JsonRecord | null) {
  const report = isRecord(evidence?.crossOverlayChoreography) ? evidence.crossOverlayChoreography : null;
  if (!report) {
    return {
      version: 'phase0-cross-overlay-choreography-v1' as const,
      status: 'missing' as const,
      issue: 'unifiedDecisionBundle.evidence.crossOverlayChoreography is missing',
      inputDecisionCount: 0,
      outputDecisionCount: 0,
      suppressedDecisionCount: 0,
      shapedDecisionCount: 0,
      suppressionRate: null,
      shapeRate: null,
      syncGroupCount: 0,
      laneLoad: {} as Record<string, number>,
      suppressedByReason: {} as Record<string, number>,
      shapedByReason: {} as Record<string, number>,
      suppressedByFamily: {} as Record<string, number>,
      shapedByFamily: {} as Record<string, number>,
      topSuppressions: [] as Array<Record<string, unknown>>,
      topShapes: [] as Array<Record<string, unknown>>,
      syncGroups: [] as Array<Record<string, unknown>>,
      calibrationStatus: null,
    };
  }

  const inputDecisionCount = readPositiveNumber(report.inputDecisionCount, 0);
  const suppressedDecisionCount = readPositiveNumber(report.suppressedDecisionCount, 0);
  const shapedDecisionCount = readPositiveNumber(report.shapedDecisionCount, 0);
  const syncGroups = Array.isArray(report.syncGroups)
    ? report.syncGroups.filter(isRecord).slice(0, 20).map(summarizeCrossOverlaySyncGroup)
    : [];
  return {
    version: 'phase0-cross-overlay-choreography-v1' as const,
    status: 'present' as const,
    issue: null,
    inputDecisionCount,
    outputDecisionCount: readPositiveNumber(report.outputDecisionCount, 0),
    suppressedDecisionCount,
    shapedDecisionCount,
    suppressionRate: inputDecisionCount > 0 ? round(suppressedDecisionCount / inputDecisionCount) : null,
    shapeRate: inputDecisionCount > 0 ? round(shapedDecisionCount / inputDecisionCount) : null,
    syncGroupCount: syncGroups.length,
    laneLoad: normalizeNumberRecord(report.laneLoad),
    suppressedByReason: normalizeNumberRecord(report.suppressedByReason),
    shapedByReason: normalizeNumberRecord(report.shapedByReason),
    suppressedByFamily: normalizeNumberRecord(report.suppressedByFamily),
    shapedByFamily: normalizeNumberRecord(report.shapedByFamily),
    topSuppressions: Array.isArray(report.suppressed)
      ? report.suppressed.filter(isRecord).slice(0, 20).map(summarizeCrossOverlaySuppression)
      : [],
    topShapes: Array.isArray(report.shaped)
      ? report.shaped.filter(isRecord).slice(0, 20).map(summarizeCrossOverlayShape)
      : [],
    syncGroups,
    calibrationStatus: readString(report.calibrationStatus) || null,
  };
}

function summarizeCrossOverlaySuppression(item: JsonRecord) {
  const conflictingWith = isRecord(item.conflictingWith) ? item.conflictingWith : {};
  return {
    reason: readString(item.reason) || 'unknown',
    family: readString(item.family) || 'unknown',
    frame: readNullableNumber(item.frame),
    conflictingWith: {
      type: readString(conflictingWith.type) || null,
      frame: readNullableNumber(conflictingWith.frame),
      family: readString(conflictingWith.family) || null,
      source: preview(conflictingWith.source, 80) || null,
    },
    calibrationStatus: readString(item.calibrationStatus) || null,
  };
}

function summarizeCrossOverlayShape(item: JsonRecord) {
  const conflictingWith = isRecord(item.conflictingWith) ? item.conflictingWith : {};
  return {
    reason: readString(item.reason) || 'unknown',
    family: readString(item.family) || 'unknown',
    originalFrame: readNullableNumber(item.originalFrame),
    frame: readNullableNumber(item.frame),
    shiftFrames: readNullableNumber(item.shiftFrames),
    conflictingWith: {
      type: readString(conflictingWith.type) || null,
      frame: readNullableNumber(conflictingWith.frame),
      family: readString(conflictingWith.family) || null,
      source: preview(conflictingWith.source, 80) || null,
    },
    calibrationStatus: readString(item.calibrationStatus) || null,
  };
}

function summarizeCrossOverlaySyncGroup(item: JsonRecord) {
  return {
    id: readString(item.id) || 'unknown',
    lane: readString(item.lane) || null,
    lanes: readStringArray(item.lanes).slice(0, 8),
    frame: readNullableNumber(item.frame),
    families: readStringArray(item.families).slice(0, 8),
    decisionTypes: readStringArray(item.decisionTypes).slice(0, 8),
    count: readPositiveNumber(item.count, 0),
  };
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    result[key] = readPositiveNumber(count, 0);
  }
  return sortRecordByKey(result);
}
function summarizeDecisionOutputTrace(trace: unknown) {
  if (!isRecord(trace)) {
    return {
      version: 'phase0-decision-output-trace-v1' as const,
      status: 'missing' as const,
      issue: 'unifiedDecisionBundle.executionTrace is missing',
      totalObserved: 0,
      keptEntries: 0,
      truncated: false,
      executed: 0,
      skipped: 0,
      overlaysCreated: 0,
      overlaysModified: 0,
      byOutcome: {},
      createdOverlayLinkCount: 0,
      modifiedOverlayLinkCount: 0,
      executedWithoutOverlayLinkCount: 0,
      samples: [] as Array<Record<string, unknown>>,
    };
  }

  const samples = Array.isArray(trace.samples) ? trace.samples.filter(isRecord) : [];
  const byOutcome = isRecord(trace.byOutcome) ? normalizeOutcomeCounts(trace.byOutcome) : countTraceOutcomes(samples);
  const totalObserved = readPositiveNumber(trace.totalObserved, sumPositiveValues(byOutcome));
  const keptEntries = readPositiveNumber(trace.keptEntries, samples.length);
  const executed = readPositiveNumber(trace.executed, readPositiveNumber(byOutcome.executed, 0));
  const skipped = readPositiveNumber(trace.skipped, readPositiveNumber(byOutcome['budget-rejected'], 0) + readPositiveNumber(byOutcome['guard-rejected'], 0) + readPositiveNumber(byOutcome.error, 0));
  const overlaysCreated = readPositiveNumber(trace.overlaysCreated, 0);
  const overlaysModified = readPositiveNumber(trace.overlaysModified, 0);
  const createdOverlayLinkCount = readPositiveNumber(trace.createdOverlayLinkCount, samples.reduce((sum, sample) => sum + readUnknownArrayLength(sample.createdOverlayIds), 0));
  const modifiedOverlayLinkCount = readPositiveNumber(trace.modifiedOverlayLinkCount, samples.reduce((sum, sample) => sum + readUnknownArrayLength(sample.modifiedOverlayIds), 0));
  const executedWithoutOverlayLinkCount = readPositiveNumber(
    trace.executedWithoutOverlayLinkCount,
    samples.filter((sample) => readString(sample.outcome) === 'executed' && readUnknownArrayLength(sample.createdOverlayIds) === 0 && readUnknownArrayLength(sample.modifiedOverlayIds) === 0).length,
  );
  const status = totalObserved === 0
    ? 'empty' as const
    : executed > 0 && createdOverlayLinkCount + modifiedOverlayLinkCount === 0
      ? 'no-output-links' as const
      : executedWithoutOverlayLinkCount > 0
        ? 'partial-output-links' as const
        : 'present' as const;

  return {
    version: 'phase0-decision-output-trace-v1' as const,
    status,
    issue: null,
    totalObserved,
    keptEntries,
    truncated: trace.truncated === true,
    executed,
    skipped,
    overlaysCreated,
    overlaysModified,
    byOutcome,
    createdOverlayLinkCount,
    modifiedOverlayLinkCount,
    executedWithoutOverlayLinkCount,
    samples: samples.slice(0, 25).map(summarizeDecisionOutputTraceSample),
  };
}

function summarizeDecisionOutputTraceSample(sample: JsonRecord) {
  return {
    decisionIndex: readNullableNumber(sample.decisionIndex),
    type: readString(sample.type),
    frame: readNullableNumber(sample.frame),
    source: readString(sample.source),
    signal: readString(sample.signal),
    confidence: readNullableNumber(sample.confidence),
    outcome: readString(sample.outcome),
    reason: preview(sample.reason, 180),
    ruleId: readString(sample.ruleId),
    createdOverlayIds: readIdArray(sample.createdOverlayIds).slice(0, 10),
    modifiedOverlayIds: readIdArray(sample.modifiedOverlayIds).slice(0, 10),
    beforeOverlayCount: readNullableNumber(sample.beforeOverlayCount),
    afterOverlayCount: readNullableNumber(sample.afterOverlayCount),
    paramsPreview: isRecord(sample.paramsPreview) ? sample.paramsPreview : null,
  };
}

function countTraceOutcomes(samples: JsonRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sample of samples) {
    const outcome = readString(sample.outcome) || 'unknown';
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return sortRecordByKey(counts);
}


function summarizeSignalDecisionHealth(evidence: JsonRecord | null) {
  const audit = isRecord(evidence?.signalDecisionAudit) ? evidence.signalDecisionAudit : null;
  if (!audit) {
    return {
      version: 'phase0-signal-decision-health-v1' as const,
      status: 'missing' as Phase0SignalDecisionHealthStatus,
      issue: 'unifiedDecisionBundle.evidence.signalDecisionAudit is missing',
      totalCount: 0,
      candidateCount: 0,
      sampleCount: 0,
      addedExecutableCount: 0,
      signalPrimaryCount: 0,
      validatedPrimaryCount: 0,
      evidenceOnlyCount: 0,
      executableSignalOutcomeCount: 0,
      normalizedCandidateCount: 0,
      unnormalizedCandidateCount: 0,
      promotionRate: null,
      visualSetupSignalCandidateCount: 0,
      visualSetupSignalCoverageRate: null,
      visualSetupSignalKeys: [],
      outcomes: {},
      topReasons: [],
      candidateSamples: [],
      evidenceSamples: [],
    };
  }

  const outcomes = isRecord(audit.outcomes) ? audit.outcomes : {};
  const candidates = Array.isArray(audit.candidates) ? audit.candidates.filter(isRecord) : [];
  const samples = Array.isArray(audit.samples) ? audit.samples.filter(isRecord) : [];
  const totalCount = readPositiveNumber(audit.totalCount, sumPositiveValues(outcomes));
  const addedExecutableCount = readPositiveNumber(outcomes['added-executable'], 0);
  const signalPrimaryCount = readPositiveNumber(outcomes['signal-primary'], 0);
  const validatedPrimaryCount = readPositiveNumber(outcomes['validated-primary'], 0);
  const evidenceOnlyCount = readPositiveNumber(outcomes['evidence-only'], 0);
  const executableSignalOutcomeCount = addedExecutableCount + signalPrimaryCount + validatedPrimaryCount;
  const normalizedCandidateCount = candidates.filter(hasSignalCandidateScoreFields).length;
  const unnormalizedCandidateCount = Math.max(0, candidates.length - normalizedCandidateCount);
  const visualSetupSignalCandidateCount = candidates.filter(hasVisualSetupSignalEvidence).length;
  const status: Phase0SignalDecisionHealthStatus = totalCount === 0
    ? 'empty'
    : executableSignalOutcomeCount === 0
      ? 'no-executable-signals'
      : unnormalizedCandidateCount > 0
        ? 'normalization-incomplete'
        : 'present';

  return {
    version: 'phase0-signal-decision-health-v1' as const,
    status,
    issue: null,
    totalCount,
    candidateCount: candidates.length,
    sampleCount: samples.length,
    addedExecutableCount,
    signalPrimaryCount,
    validatedPrimaryCount,
    evidenceOnlyCount,
    executableSignalOutcomeCount,
    normalizedCandidateCount,
    unnormalizedCandidateCount,
    promotionRate: totalCount > 0 ? round(executableSignalOutcomeCount / totalCount) : null,
    visualSetupSignalCandidateCount,
    visualSetupSignalCoverageRate: candidates.length > 0 ? round(visualSetupSignalCandidateCount / candidates.length) : null,
    visualSetupSignalKeys: summarizeVisualSetupSignalKeys(candidates),
    outcomes: normalizeOutcomeCounts(outcomes),
    topReasons: summarizeAuditBuckets(audit.byReason).slice(0, 10),
    candidateSamples: candidates.slice(0, 20).map(summarizeSignalCandidateSample),
    evidenceSamples: samples.slice(0, 20).map(summarizeSignalEvidenceSample),
  };
}

function hasSignalCandidateScoreFields(candidate: JsonRecord): boolean {
  return readNullableNumber(candidate.confidence) != null
    && readNullableNumber(candidate.momentImportance) != null
    && readNullableNumber(candidate.evidenceStrength) != null
    && readNullableNumber(candidate.completeness) != null
    && readNullableNumber(candidate.physicalFormReadiness) != null
    && readNullableNumber(candidate.risk) != null;
}

function summarizeSignalCandidateSample(candidate: JsonRecord) {
  const sourcePacket = isRecord(candidate.sourcePacket) ? candidate.sourcePacket : {};
  return {
    family: readString(candidate.family),
    role: readString(candidate.role ?? candidate.job),
    source: readString(candidate.source),
    signal: readString(candidate.signal),
    confidence: readNullableNumber(candidate.confidence),
    momentImportance: readNullableNumber(candidate.momentImportance),
    evidenceStrength: readNullableNumber(candidate.evidenceStrength),
    completeness: readNullableNumber(candidate.completeness),
    physicalFormReadiness: readNullableNumber(candidate.physicalFormReadiness),
    risk: readNullableNumber(candidate.risk),
    riskFlags: readStringArray(candidate.riskFlags).slice(0, 6),
    hasSignals: sourcePacket.hasSignals === true,
    signalKeyCount: Array.isArray(sourcePacket.signalKeys) ? sourcePacket.signalKeys.length : 0,
    hasVisualSetupSignals: hasVisualSetupSignalEvidence(candidate),
    visualSetupSignalKeyCount: summarizeCandidateVisualSetupSignalKeys(candidate).length,
    visualSetupSignalKeys: summarizeCandidateVisualSetupSignalKeys(candidate),
    hasAtomicMomentBundle: sourcePacket.hasAtomicMomentBundle === true,
    hasUnifiedMomentEvidence: sourcePacket.hasUnifiedMomentEvidence === true,
    calibrationStatus: readString(candidate.calibrationStatus),
  };
}

function hasVisualSetupSignalEvidence(candidate: JsonRecord): boolean {
  return summarizeCandidateVisualSetupSignalKeys(candidate).length > 0;
}

function summarizeVisualSetupSignalKeys(candidates: JsonRecord[]): string[] {
  return unique(candidates.flatMap(summarizeCandidateVisualSetupSignalKeys)).slice(0, 24);
}

function summarizeCandidateVisualSetupSignalKeys(candidate: JsonRecord): string[] {
  const sourcePacket = isRecord(candidate.sourcePacket) ? candidate.sourcePacket : {};
  const explicitKeys = readStringArray(sourcePacket.visualSetupSignalKeys).filter(isVisualSetupSignalKey);
  const fallbackKeys = readStringArray(sourcePacket.signalKeys).filter(isVisualSetupSignalKey);
  return unique([...explicitKeys, ...fallbackKeys]).slice(0, 24);
}

function isVisualSetupSignalKey(key: string): boolean {
  return key.startsWith('visual.perception.')
    || key === 'visual_complexity'
    || key === 'enrichment.visual_setup_source'
    || key === 'visual.environment'
    || key === 'visual.scene_type'
    || key === 'visual.shot_scale'
    || key === 'visual.dominant_shot_scale'
    || key === 'visual.has_face'
    || key === 'visual.subject_count'
    || key === 'visual.has_b_roll'
    || key === 'visual.camera_movement'
    || key === 'visual.lighting_quality'
    || key === 'visual.production_quality_label'
    || key === 'visual.production_quality'
    || key === 'visual.color_temperature'
    || key === 'visual.visual_complexity';
}

function summarizeSignalEvidenceSample(sample: JsonRecord) {
  const candidate = isRecord(sample.candidate) ? sample.candidate : {};
  return {
    type: readString(sample.type),
    family: readString(sample.family),
    outcome: readString(sample.outcome),
    frame: readNullableNumber(sample.frame),
    confidence: readNullableNumber(sample.confidence),
    reason: preview(sample.reason, 160),
    source: readString(sample.source),
    signal: readString(sample.signal),
    candidateConfidence: readNullableNumber(candidate.confidence),
    evidenceStrength: readNullableNumber(candidate.evidenceStrength),
    completeness: readNullableNumber(candidate.completeness),
    physicalFormReadiness: readNullableNumber(candidate.physicalFormReadiness),
    risk: readNullableNumber(candidate.risk),
  };
}

function summarizeAuditBuckets(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .map(([reason, bucket]) => {
      const record = isRecord(bucket) ? bucket : {};
      const confidence = isRecord(record.confidence) ? record.confidence : {};
      return {
        reason,
        count: readPositiveNumber(record.count, 0),
        averageConfidence: readNullableNumber(confidence.average),
        minConfidence: readNullableNumber(confidence.min),
        maxConfidence: readNullableNumber(confidence.max),
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function normalizeOutcomeCounts(value: JsonRecord): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    result[key] = readPositiveNumber(count, 0);
  }
  return sortRecordByKey(result);
}

function sumPositiveValues(value: JsonRecord): number {
  return Object.values(value).reduce<number>((sum, count) => sum + readPositiveNumber(count, 0), 0);
}

function normalizeUnifiedDecisionAuthority(authority: unknown): Phase0UnifiedDecisionAuthoritySummary | null {
  if (!authority) return null;

  if (isRecord(authority)) {
    return {
      version: readString(authority.version) || 'unified-decision-authority-v1',
      executableProducer: readString(authority.executableProducer),
      advisoryProducers: Array.isArray(authority.advisoryProducers)
        ? authority.advisoryProducers.map(readString).filter(Boolean)
        : [],
      signalDecisionRole: readString(authority.signalDecisionRole),
      signalDecisionsCanAddExecutable: authority.signalDecisionsCanAddExecutable === true,
      decisionMode: readDecisionMode(authority.decisionMode),
    };
  }

  if (typeof authority === 'string') {
    const decisionMode = inferDecisionModeFromLegacyAuthority(authority);
    if (!decisionMode) return null;
    return {
      version: 'unified-decision-authority-legacy-v0',
      executableProducer: '',
      advisoryProducers: [],
      signalDecisionRole: '',
      signalDecisionsCanAddExecutable: false,
      decisionMode,
      legacyAuthority: authority,
    };
  }

  return null;
}

function readDecisionMode(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;

  if (
    candidate === 'creative-brief-primary' ||
    candidate === 'signal-primary' ||
    candidate === 'merged-supplemental' ||
    candidate === 'unified-planner'
  ) {
    return candidate;
  }
  return null;
}

function inferDecisionModeFromLegacyAuthority(value: string): string | null {
  if (value === 'creative-primary-signal-evidence') return 'creative-brief-primary';
  if (value === 'signal-primary') return 'signal-primary';
  if (value === 'merged-supplemental') return 'merged-supplemental';
  if (value === 'unified-planner') return 'unified-planner';
  return null;
}

function summarizeOldProducerGating(project: Phase0FixtureProject) {
  const bundle = project.intelligence?.unifiedDecisionBundle;
  if (!bundle) {
    return {
      status: 'not-applicable' as const,
      unifiedDecisionBundleExecuted: false,
      skippedLegacyActionCount: 0,
      allowedLegacyActionCount: 0,
      skippedLegacyActions: [],
      unknownReasonCount: 0,
      evidence: null,
      issue: 'unified decision bundle is missing',
    };
  }

  const policy = project.intelligence?.postBundleProfileActionPolicy;
  if (!isRecord(policy)) {
    return {
      status: 'missing' as const,
      unifiedDecisionBundleExecuted: null,
      skippedLegacyActionCount: 0,
      allowedLegacyActionCount: 0,
      skippedLegacyActions: [],
      unknownReasonCount: 0,
      evidence: null,
      issue: 'post-bundle profile action policy evidence is missing',
    };
  }

  const skippedLegacyActions = Array.isArray(policy.skippedActions)
    ? policy.skippedActions
      .filter(isRecord)
      .slice(0, 50)
      .map((item) => ({
        tool: readString(item.tool) || null,
        action: readString(item.action) || null,
        reason: readString(item.reason) || null,
      }))
    : [];
  const allowedTools = Array.isArray(policy.allowedTools)
    ? policy.allowedTools.map(readString).filter(Boolean).slice(0, 50)
    : [];
  const unknownReasonCount = skippedLegacyActions.filter((item) => !item.reason).length;

  return {
    status: 'present' as const,
    unifiedDecisionBundleExecuted: policy.unifiedDecisionBundleExecuted === true,
    skippedLegacyActionCount: readPositiveNumber(policy.skippedActionCount, skippedLegacyActions.length),
    allowedLegacyActionCount: readPositiveNumber(policy.allowedActionCount, allowedTools.length),
    skippedLegacyActions,
    unknownReasonCount,
    evidence: {
      version: readString(policy.version),
      evaluatedAt: readString(policy.evaluatedAt) || null,
      allowedTools,
    },
    issue: null,
  };
}

function summarizeQualityReview(project: Phase0FixtureProject) {
  const qualityReview = project.qualityReview;
  if (!isRecord(qualityReview)) {
    return {
      status: 'missing' as const,
      overallScore: null,
      issueCount: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      autoFixableCount: 0,
      issuesPersistedCount: 0,
      issuesTruncated: false,
      issues: [] as PersistedQualityReviewIssue[],
      suggestions: [] as string[],
      reviewedAt: null,
      issue: 'qualityReview is missing from the project',
    };
  }

  const issues = Array.isArray(qualityReview.issues)
    ? qualityReview.issues.filter(isRecord).slice(0, 50).map(summarizePersistedQualityIssue)
    : [];
  const suggestions = Array.isArray(qualityReview.suggestions)
    ? qualityReview.suggestions.map(readString).filter(Boolean).slice(0, 25)
    : [];

  return {
    status: 'present' as const,
    overallScore: readNullableNumber(qualityReview.overallScore),
    issueCount: readPositiveNumber(qualityReview.issueCount, issues.length),
    criticalCount: readPositiveNumber(qualityReview.criticalCount, issues.filter((issue) => issue.severity === 'critical').length),
    warningCount: readPositiveNumber(qualityReview.warningCount, issues.filter((issue) => issue.severity === 'warning').length),
    infoCount: readPositiveNumber(qualityReview.infoCount, issues.filter((issue) => issue.severity === 'info').length),
    autoFixableCount: readPositiveNumber(qualityReview.autoFixableCount, issues.filter((issue) => issue.autoFixable).length),
    issuesPersistedCount: readPositiveNumber(qualityReview.issuesPersistedCount, issues.length),
    issuesTruncated: qualityReview.issuesTruncated === true,
    issues,
    suggestions,
    reviewedAt: readDateishString(qualityReview.reviewedAt),
    issue: null,
  };
}

function summarizePersistedQualityIssue(issue: JsonRecord): PersistedQualityReviewIssue {
  const frameRange = isRecord(issue.frameRange)
    ? {
      start: readPositiveNumber(issue.frameRange.start, 0),
      end: readPositiveNumber(issue.frameRange.end, 0),
    }
    : null;
  const severity = readString(issue.severity);
  return {
    type: readString(issue.type) || 'unknown',
    severity: severity === 'critical' || severity === 'warning' || severity === 'info' ? severity : 'warning',
    description: preview(issue.description, 240),
    frameRange,
    overlayId: readNullableNumber(issue.overlayId),
    suggestedFix: readString(issue.suggestedFix) || null,
    autoFixable: issue.autoFixable === true,
  };
}

function summarizeVjepaCoverage(project: Phase0FixtureProject, overlays: Phase0OverlayLike[], fps: number) {
  const persisted = project.intelligence?.vjepaCoverageAudit;
  if (persisted) {
    const reliability = persisted.reliability ?? assessVjepaReliability(persisted.segmentCoverage, persisted.overlayHitRate);
    const screenContextPolicy = resolveVjepaScreenContextPolicy({ ...persisted, reliability });
    return {
      source: 'persisted' as const,
      status: persisted.status,
      issues: persisted.issues,
      overlayHitRate: persisted.overlayHitRate,
      segmentCoverage: persisted.segmentCoverage,
      rawFootageCoverage: persisted.rawFootageCoverage ?? null,
      reliability,
      screenContextPolicy,
    };
  }

  const segments = project.vjepaAnalysis?.segments;
  if (!Array.isArray(segments)) {
    const screenContextPolicy = resolveVjepaScreenContextPolicy(null);
    return {
      source: 'missing' as const,
      status: null,
      issues: ['vjepaAnalysis.segments is not present on the project'],
      overlayHitRate: null,
      segmentCoverage: null,
      rawFootageCoverage: null,
      reliability: null,
      screenContextPolicy,
    };
  }

  const rawFootageRecord = isRecord(project.rawFootageAnalysis) ? project.rawFootageAnalysis : null;
  const audit = auditVjepaCoverage({
    fps,
    originalDurationMs: readNullableNumber(project.rawFootageAnalysis?.originalDurationMs) ?? undefined,
    eligibleDurationMs: isRecord(rawFootageRecord?.multiAssetProvenance)
      ? summarizeVideoTimelineDurationMs(overlays, fps)
      : undefined,
    cleanDurationMs: readNullableNumber(project.rawFootageAnalysis?.estimatedCleanDurationMs) ?? undefined,
    vjepaSegments: segments,
    rawFootageSegments: project.vjepaAnalysis?.rawFootageSegments,
    overlays,
  });
  return {
    source: 'computed' as const,
    status: audit.status,
    issues: audit.issues,
    overlayHitRate: audit.overlayHitRate,
    segmentCoverage: audit.segmentCoverage,
    rawFootageCoverage: audit.rawFootageCoverage ?? null,
    reliability: audit.reliability ?? null,
    screenContextPolicy: resolveVjepaScreenContextPolicy(audit),
  };
}

function summarizeOverlayFamilies(overlays: Phase0OverlayLike[], playerDimensions?: { width?: number; height?: number }) {
  const captionOverlays = overlays.filter((overlay) => overlay.type === 'caption' || overlay.type === 'text');
  const sfxOverlays = overlays.filter(isSfxOverlay);
  const captionStats = summarizeCaptionStats(captionOverlays);
  return {
    motionGraphics: overlays
      .filter((overlay) => overlay.type === 'motion-graphic')
      .map((overlay) => ({
        id: overlayId(overlay),
        from: readFrame(overlay.from),
        durationInFrames: readDuration(overlay.durationInFrames),
        contentPreview: preview(overlay.content ?? overlay.text),
        graphicType: readString(overlay.metadata?.graphicType ?? overlay.metadata?.creativeDecisionType),
        hasAtomicPlan: Boolean(overlay.metadata?.atomicOverlayPlan),
        hasAtomicReceipt: Boolean(overlay.metadata?.atomicOverlayReceipt),
        semanticAtomCount: countMotionGraphicSemanticAtoms(overlay),
        relationCount: countMotionGraphicRelations(overlay),
      })),
    captions: {
      count: captionOverlays.length,
      trackCount: captionOverlays.filter((overlay) => overlay.type === 'caption').length,
      textOverlayCount: captionOverlays.filter((overlay) => overlay.type === 'text').length,
      groupCount: captionStats.groupCount,
      wordCount: captionStats.wordCount,
      timedGroupCount: captionStats.timedGroupCount,
      averageGroupDurationMs: captionStats.averageGroupDurationMs,
      maxGroupDurationMs: captionStats.maxGroupDurationMs,
      styleSignatures: unique(captionOverlays
        .map(captionStyleSignature)
        .filter(Boolean)),
      geometryMismatches: captionOverlays
        .map((overlay) => captionGeometryMismatch(overlay, playerDimensions))
        .filter(Boolean),
    },
    transitions: {
      count: overlays.filter((overlay) => overlay.type === 'transition').length,
      types: unique(overlays
        .filter((overlay) => overlay.type === 'transition')
        .map((overlay) => readString(overlay.transitionStyle ?? overlay.metadata?.transitionType ?? overlay.metadata?.atomicTransitionForm))
        .filter(Boolean)),
      withAtomicForm: overlays.filter((overlay) => overlay.type === 'transition' && overlay.metadata?.atomicTransitionForm).length,
      withBoundaryPair: overlays.filter((overlay) => overlay.type === 'transition' && hasTransitionBoundaryPair(overlay)).length,
      withBoundaryReason: overlays.filter((overlay) => overlay.type === 'transition' && hasTransitionBoundaryReason(overlay)).length,
      boundaryEvidenceMissing: overlays
        .filter((overlay) => overlay.type === 'transition')
        .map(transitionBoundaryEvidenceMissing)
        .filter(Boolean),
    },
    sfx: {
      count: sfxOverlays.length,
      roles: unique(sfxOverlays
        .map((overlay) => readString(overlay.metadata?.role ?? (overlay.metadata?.atomicSfxForm as JsonRecord | undefined)?.role))
        .filter(Boolean)),
      withAtomicForm: sfxOverlays.filter((overlay) => overlay.metadata?.atomicSfxForm).length,
      withTransitionAnchor: sfxOverlays.filter((overlay) => isTransitionAnchoredSfx(overlay)).length,
      withTransitionEvidence: sfxOverlays.filter((overlay) => isTransitionAnchoredSfx(overlay) && hasSfxTransitionEvidence(overlay)).length,
      transitionEvidenceMissing: sfxOverlays
        .map(sfxTransitionEvidenceMissing)
        .filter(Boolean),
    },
    zoom: {
      videoOverlayCount: videoClips(overlays).length,
      overlaysWithKeyframes: overlays.filter((overlay) => overlay.type === 'video' && Array.isArray(overlay.metadata?.zoomKeyframes)).length,
    },
  };
}

function summarizeCaptionStats(overlays: Phase0OverlayLike[]) {
  let groupCount = 0;
  let wordCount = 0;
  const groupDurations: number[] = [];

  for (const overlay of overlays) {
    const groups = captionGroups(overlay);
    groupCount += groups.length;
    wordCount += captionWordCount(overlay, groups);
    for (const group of groups) {
      const startMs = readNullableNumber(group.startMs);
      const endMs = readNullableNumber(group.endMs);
      if (startMs != null && endMs != null && endMs > startMs) {
        groupDurations.push(endMs - startMs);
      }
    }
  }

  return {
    groupCount,
    wordCount,
    timedGroupCount: groupDurations.length,
    averageGroupDurationMs: groupDurations.length > 0
      ? Math.round(groupDurations.reduce((sum, duration) => sum + duration, 0) / groupDurations.length)
      : null,
    maxGroupDurationMs: groupDurations.length > 0 ? Math.max(...groupDurations) : null,
  };
}

function captionGroups(overlay: Phase0OverlayLike): JsonRecord[] {
  if (Array.isArray(overlay.captions)) {
    return overlay.captions.filter(isRecord);
  }
  const text = readString(overlay.captionText ?? overlay.text ?? overlay.content);
  return text ? [{ text }] : [];
}

function captionWordCount(overlay: Phase0OverlayLike, groups: JsonRecord[]): number {
  if (Array.isArray(overlay.words)) {
    return overlay.words.filter((word) => isRecord(word) || typeof word === 'string').length;
  }
  return groups.reduce((count, group) => count + splitWords(group.text).length, 0);
}

function splitWords(value: unknown): string[] {
  return typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function transitionBoundaryEvidenceMissing(overlay: Phase0OverlayLike) {
  const missing: string[] = [];
  if (!overlay.metadata?.atomicTransitionForm) missing.push('atomic-form');
  if (!hasTransitionBoundaryPair(overlay)) missing.push('boundary-pair');
  if (!hasTransitionBoundaryReason(overlay)) missing.push('boundary-reason');
  if (missing.length === 0) return null;
  return {
    id: overlayId(overlay),
    from: readFrame(overlay.from),
    style: readString(overlay.transitionStyle ?? overlay.metadata?.transitionType) || 'unknown',
    missing,
  };
}

function hasTransitionBoundaryPair(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const receipt = isRecord(metadata.atomicOverlayReceipt) ? metadata.atomicOverlayReceipt : {};
  const receiptTarget = isRecord(receipt.target) ? receipt.target : {};
  const clipA = overlay.clipAId ?? metadata.clipAId ?? receiptTarget.clipAId;
  const clipB = overlay.clipBId ?? metadata.clipBId ?? receiptTarget.clipBId;
  return hasValue(clipA) && hasValue(clipB);
}

function hasTransitionBoundaryReason(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const form = isRecord(metadata.atomicTransitionForm) ? metadata.atomicTransitionForm : {};
  if (hasValue(form.intent) || hasValue(form.job) || hasValue(metadata.transitionJob)) return true;

  const receipt = isRecord(metadata.atomicOverlayReceipt) ? metadata.atomicOverlayReceipt : {};
  const atoms = Array.isArray(receipt.atoms) ? receipt.atoms.filter(isRecord) : [];
  return atoms.some((atom) => {
    const kind = readString(atom.kind);
    return Boolean(kind && (
      kind.includes('topic')
      || kind.includes('speech')
      || kind.includes('beat')
      || kind.includes('motion')
      || kind.includes('visual')
      || kind.includes('boundary')
    ));
  });
}

function isSfxOverlay(overlay: Phase0OverlayLike): boolean {
  return isAudioOverlay(overlay) && !isVoiceoverOverlay(overlay);
}

function isAudioOverlay(overlay: Phase0OverlayLike): boolean {
  return overlay.type === 'sound' || overlay.type === 'audio';
}

function isVoiceoverOverlay(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  return metadata.isVoiceover === true
    || hasValue(metadata.narrationText)
    || hasValue(metadata.voiceoverSlotId)
    || readString(metadata.kind) === 'voiceover'
    || String(overlay.assetId ?? '').startsWith('voiceover_')
    || String(overlay.content ?? '').startsWith('VO ready:')
    || String(overlay.content ?? '').startsWith('VO pending:');
}

function sfxTransitionEvidenceMissing(overlay: Phase0OverlayLike) {
  if (!isTransitionAnchoredSfx(overlay)) return null;
  const missing: string[] = [];
  if (!hasSfxTransitionOverlayId(overlay)) missing.push('transition-overlay-id');
  if (!hasSfxTransitionReason(overlay)) missing.push('transition-job-or-intent');
  if (!hasSfxTransitionEvidenceSource(overlay)) missing.push('transition-evidence-source');
  if (missing.length === 0) return null;
  return {
    id: overlayId(overlay),
    from: readFrame(overlay.from),
    role: readString(overlay.metadata?.role ?? (overlay.metadata?.atomicSfxForm as JsonRecord | undefined)?.role) || null,
    missing,
  };
}

function isTransitionAnchoredSfx(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const form = isRecord(metadata.atomicSfxForm) ? metadata.atomicSfxForm : {};
  const timing = isRecord(form.timing) ? form.timing : {};
  const receipt = sfxReceipt(overlay);
  const payload = isRecord(receipt.payload) ? receipt.payload : {};
  return metadata.source === 'transition-sfx-placer'
    || hasValue(metadata.transitionOverlayId)
    || readString(timing.anchor) === 'transition'
    || readString(payload.syncAnchor) === 'transition'
    || hasSfxTransitionOverlayId(overlay)
    || hasSfxTransitionReason(overlay)
    || hasSfxTransitionEvidenceSource(overlay);
}

function hasSfxTransitionEvidence(overlay: Phase0OverlayLike): boolean {
  return hasSfxTransitionOverlayId(overlay)
    && hasSfxTransitionReason(overlay)
    && hasSfxTransitionEvidenceSource(overlay);
}

function hasSfxTransitionOverlayId(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const receipt = sfxReceipt(overlay);
  const payload = isRecord(receipt.payload) ? receipt.payload : {};
  const target = isRecord(receipt.target) ? receipt.target : {};
  return hasValue(metadata.transitionOverlayId)
    || hasValue(payload.transitionOverlayId)
    || hasValue(target.transitionOverlayId)
    || sfxReceiptAtoms(overlay).some((atom) => readString(atom.key) === 'transition.overlay_id' && hasValue(atom.value));
}

function hasSfxTransitionReason(overlay: Phase0OverlayLike): boolean {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const receipt = sfxReceipt(overlay);
  const payload = isRecord(receipt.payload) ? receipt.payload : {};
  return hasValue(payload.transitionJob)
    || hasValue(payload.transitionIntent)
    || hasValue(metadata.transitionJob)
    || hasValue(metadata.transitionIntent)
    || sfxReceiptAtoms(overlay).some((atom) => (
      (readString(atom.key) === 'transition.job' || readString(atom.key) === 'transition.intent') &&
      hasValue(atom.value)
    ));
}

function hasSfxTransitionEvidenceSource(overlay: Phase0OverlayLike): boolean {
  const receipt = sfxReceipt(overlay);
  const payload = isRecord(receipt.payload) ? receipt.payload : {};
  return hasValue(payload.transitionEvidenceSource)
    || sfxReceiptAtoms(overlay).some((atom) => readString(atom.key) === 'transition.evidence_source' && hasValue(atom.value));
}

function sfxReceipt(overlay: Phase0OverlayLike): JsonRecord {
  const metadata = isRecord(overlay.metadata) ? overlay.metadata : {};
  const receipts = [
    ...(Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts.filter(isRecord) : []),
    ...(isRecord(metadata.atomicOverlayReceipt) ? [metadata.atomicOverlayReceipt] : []),
  ];
  return receipts.find(isSfxReceipt) ?? receipts[0] ?? {};
}

function isSfxReceipt(receipt: JsonRecord): boolean {
  const payload = isRecord(receipt.payload) ? receipt.payload : {};
  const form = isRecord(receipt.form) ? receipt.form : {};
  return readString(receipt.family) === 'sfx'
    || readString(form.family) === 'sfx'
    || readString(payload.formVersion) === 'atomic-sfx-form-v1';
}

function sfxReceiptAtoms(overlay: Phase0OverlayLike): JsonRecord[] {
  const receipt = sfxReceipt(overlay);
  return Array.isArray(receipt.atoms) ? receipt.atoms.filter(isRecord) : [];
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function countByType(overlays: Phase0OverlayLike[]) {
  return overlays.reduce<Record<string, number>>((counts, overlay) => {
    const type = String(overlay.type ?? 'unknown');
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

function countByField(items: JsonRecord[], key: string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = readString(item[key]) || 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function countDecisions(decisions: unknown[]) {
  return decisions.reduce<Record<string, number>>((counts, decision) => {
    const type = isRecord(decision) ? String(decision.type ?? 'unknown') : 'unknown';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

function resolveDurationFrames(project: Phase0FixtureProject, overlays: Phase0OverlayLike[]) {
  const explicitDuration = readNullableNumber(project.durationInFrames);
  if (explicitDuration != null && explicitDuration > 0) return explicitDuration;
  return overlays.reduce((maxFrame, overlay) => {
    return Math.max(maxFrame, readFrame(overlay.from) + readDuration(overlay.durationInFrames));
  }, 0);
}

function videoClips(overlays: Phase0OverlayLike[]) {
  return overlays
    .filter((overlay) => overlay.type === 'video')
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));
}

function primaryVisualClips(overlays: Phase0OverlayLike[]) {
  return overlays
    .filter((overlay) => overlay.type === 'video' || (overlay.type === 'image' && overlay.row === ROW.VIDEO))
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));
}

function transitionOverlays(overlays: Phase0OverlayLike[]) {
  return overlays
    .filter((overlay) => overlay.type === 'transition')
    .sort((a, b) => readFrame(a.from) - readFrame(b.from));
}

function findTransitionHandleForOverlap(
  transitions: Phase0OverlayLike[],
  overlapStartFrame: number,
  overlapEndFrame: number,
) {
  const overlapDuration = Math.max(0, overlapEndFrame - overlapStartFrame);
  const toleranceFrames = Math.max(2, Math.ceil(overlapDuration / 2));
  return transitions.find((transition) => {
    const transitionStartFrame = readFrame(transition.from);
    const transitionEndFrame = transitionStartFrame + readDuration(transition.durationInFrames);
    const transitionCenterFrame = transitionStartFrame + readDuration(transition.durationInFrames) / 2;
    const overlapsRange = transitionStartFrame < overlapEndFrame && transitionEndFrame > overlapStartFrame;
    const startsNearOverlap = transitionStartFrame >= overlapStartFrame - toleranceFrames && transitionStartFrame <= overlapEndFrame + toleranceFrames;
    const centerNearOverlap = transitionCenterFrame >= overlapStartFrame - toleranceFrames && transitionCenterFrame <= overlapEndFrame + toleranceFrames;
    return overlapsRange || startsNearOverlap || centerNearOverlap;
  });
}

function captionStyleSignature(overlay: Phase0OverlayLike) {
  const styles = overlay.styles ?? {};
  const metadata = overlay.metadata ?? {};
  return [
    readString(styles.fontFamily),
    readString(styles.fontSize),
    readString(styles.color),
    readString(metadata.captionStyle),
    readString(metadata.captionPresentation),
  ].filter(Boolean).join('|');
}

function captionGeometryMismatch(overlay: Phase0OverlayLike, playerDimensions?: { width?: number; height?: number }) {
  const metadata = overlay.metadata ?? {};
  const presentation = isRecord(metadata.captionPresentation) ? metadata.captionPresentation : {};
  const aesthetic = isRecord(presentation.aesthetic) ? presentation.aesthetic : {};
  const layout = readString(aesthetic.layout);
  if (!layout) return null;

  const evidence = isRecord(metadata.evidence) ? metadata.evidence : {};
  const selectedRegion = readString(evidence.selectedRegion);

  const top = readNullableNumber(overlay.top);
  const height = readNullableNumber(overlay.height);
  const resolvedHeight = readNullableNumber(playerDimensions?.height);
  if (top == null || height == null || resolvedHeight == null || resolvedHeight <= 0) return null;

  const normalizedTop = top / resolvedHeight;
  const normalizedCenter = (top + height / 2) / resolvedHeight;
  const normalizedBottom = (top + height) / resolvedHeight;
  const selectedWantsLower = /\b(lower|bottom)\b/i.test(selectedRegion);
  const selectedWantsUpper = /\b(upper|top)\b/i.test(selectedRegion);
  const wantsLower = selectedWantsLower || (!selectedWantsUpper && /\b(subtitle|balanced|lower|bottom)\b/i.test(layout));
  const wantsUpper = selectedWantsUpper || (!selectedWantsLower && /\b(upper|top)\b/i.test(layout));
  const lowerMismatch = wantsLower && normalizedCenter < 0.5;
  const upperMismatch = wantsUpper && normalizedCenter > 0.5;
  if (!lowerMismatch && !upperMismatch) return null;

  return {
    id: overlayId(overlay),
    layout,
    selectedRegion: selectedRegion || null,
    top,
    height,
    normalizedTop: round(normalizedTop),
    normalizedCenter: round(normalizedCenter),
    normalizedBottom: round(normalizedBottom),
    expectedRegion: wantsLower ? 'lower-half' : 'upper-half',
  };
}

function summarizeRenderedAestheticReport(report: Phase0RenderedAestheticReportLike) {
  const summary = report.summary;
  const frames = Array.isArray(report.frames) ? report.frames : [];
  const issuesBySeverity: Record<Phase0RenderedIssueSeverity, number> = { fail: 0, warn: 0, info: 0 };
  const issuesByDimension: Record<string, number> = {};
  const issueSamples: Phase0RenderedIssueSample[] = [];
  let issueCount = 0;

  for (const frame of frames) {
    const frameNumber = readPositiveNumber(frame.frame, 0);
    for (const issue of frame.report?.issues ?? []) {
      const severity = readRenderedIssueSeverity(issue.severity);
      const dimension = readString(issue.dimension) || 'unknown';
      issueCount += 1;
      issuesBySeverity[severity] += 1;
      issuesByDimension[dimension] = (issuesByDimension[dimension] ?? 0) + 1;
      if (issueSamples.length < 24) {
        issueSamples.push({
          frame: frameNumber,
          dimension,
          severity,
          overlayId: readIssueOverlayId(issue.overlayId),
          message: readString(issue.message) || 'Rendered aesthetic issue',
          evidence: readString(issue.evidence) || null,
        });
      }
    }
  }

  return {
    summary: summary ? {
      status: readRenderedStatus(summary.status) ?? 'fail',
      score: readNullableNumber(summary.score),
      passFrames: readPositiveNumber(summary.passFrames, 0),
      warnFrames: readPositiveNumber(summary.warnFrames, 0),
      failFrames: readPositiveNumber(summary.failFrames, 0),
      sampledFrames: readPositiveNumber(summary.sampledFrames, frames.length),
      animationSampleFrames: readPositiveNumber(summary.animationSampleFrames, 0),
    } : null,
    issueCount,
    issuesBySeverity,
    issuesByDimension: sortRecordByKey(issuesByDimension),
    issueSamples,
    sampledFrames: frames.slice(0, 40).map((frame) => ({
      frame: readPositiveNumber(frame.frame, 0),
      status: readRenderedStatus(frame.report?.status),
      score: readNullableNumber(frame.report?.score),
      issueCount: Array.isArray(frame.report?.issues) ? frame.report.issues.length : 0,
      activeOverlayIds: readIdArray(frame.activeOverlayIds).slice(0, 12),
      activeOverlayTypes: readStringArray(frame.activeOverlayTypes).slice(0, 12),
      fullStill: readString(frame.fullStill) || null,
      baselineStill: readString(frame.baselineStill) || null,
    })),
  };
}

function readRenderedStatus(value: unknown): Phase0RenderedAestheticStatus | null {
  return value === 'pass' || value === 'warn' || value === 'fail' ? value : null;
}

function readRenderedIssueSeverity(value: unknown): Phase0RenderedIssueSeverity {
  return value === 'fail' || value === 'warn' || value === 'info' ? value : 'warn';
}

function readIssueOverlayId(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function readIdArray(value: unknown): Array<string | number> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number');
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter(Boolean);
}

function sortRecordByKey(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
function readFrame(value: unknown) {
  return readPositiveNumber(value, 0);
}

function readDuration(value: unknown) {
  return readPositiveNumber(value, 0);
}

function readPositiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readNullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (isRecord(value) && typeof value.version === 'string') return value.version;
  return '';
}

function readDateishString(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return readString(value) || null;
}

function readArrayLength(value: unknown, key: string) {
  if (!isRecord(value)) return 0;
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate.length : 0;
}

function readUnknownArrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function countMotionGraphicSemanticAtoms(overlay: Phase0OverlayLike): number {
  return Math.max(
    readArrayLength(overlay.metadata?.atomicMomentBundle, 'semanticAtoms'),
    readUnknownCollectionLength(overlay.metadata?.semanticAtoms),
    readNestedUnknownCollectionLength(overlay.content, 'semanticAtoms'),
  );
}

function countMotionGraphicRelations(overlay: Phase0OverlayLike): number {
  return Math.max(
    readArrayLength(overlay.metadata?.atomicMomentBundle, 'relations'),
    readUnknownCollectionLength(overlay.metadata?.relations),
    readNestedUnknownCollectionLength(overlay.content, 'relations'),
  );
}

function readUnknownCollectionLength(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

function readNestedUnknownCollectionLength(value: unknown, key: string): number {
  if (!isRecord(value)) return 0;
  return readUnknownCollectionLength(value[key]);
}

function overlayId(overlay: Phase0OverlayLike) {
  return String(overlay.id ?? `${overlay.type ?? 'overlay'}:${readFrame(overlay.from)}`);
}

function preview(value: unknown, limit = 120) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeRenderedQualityScore(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
