import { buildEditedTimelineContext } from './edited-timeline-context';
import type { RawFootageAnalysis } from './signal-registry';
import {
  assessVjepaReliability,
  auditVjepaCoverage,
  resolveVjepaScreenContextPolicy,
  type VjepaCoverageAudit,
  type VjepaCoverageSegment,
} from './vjepa-coverage-audit';
import type { PersistedQualityReviewIssue } from './quality-review-persistence';
import type { Phase0RenderArtifactPack } from './phase0-render-artifact-pack';

export const PHASE0_FIXTURE_VERSION = 'editron-phase0-fixture-v1' as const;

type JsonRecord = Record<string, unknown>;

type Phase0UnifiedDecisionAuthoritySummary = {
  version: string;
  executableProducer: string;
  advisoryProducers: string[];
  signalDecisionRole: string;
  signalDecisionsCanAddExecutable: boolean;
  decisionMode: string | null;
  legacyAuthority?: string;
};

export interface Phase0OverlayLike extends JsonRecord {
  id?: string | number;
  type?: string;
  from?: number;
  durationInFrames?: number;
  sourceStartFrame?: number;
  videoStartTime?: number;
  assetId?: string;
  content?: string;
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
  oldProducerGating: ReturnType<typeof summarizeOldProducerGating>;
  qualityReview: ReturnType<typeof summarizeQualityReview>;
  vjepaCoverage: ReturnType<typeof summarizeVjepaCoverage>;
  overlayFamilies: ReturnType<typeof summarizeOverlayFamilies>;
  renderArtifacts: {
    status: 'not-rendered';
    artifactDir: string | null;
    pendingFamilies: string[];
    artifactPackStatus: 'ready' | 'not-renderable' | null;
    artifactPackIssues: string[];
    renderCommand: string | null;
    auditedVisualCount: number;
    auditedMotionCount: number;
    auditedAudioCount: number;
    presentRequiredFamilies: string[];
    missingRequiredFamilies: string[];
  };
  failureClasses: string[];
  calibrationSafety: {
    renderQualityRequiredBeforeWrites: true;
    learningWritesAllowed: false;
    reason: string;
  };
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
    oldProducerGating: summarizeOldProducerGating(project),
    qualityReview: summarizeQualityReview(project),
    vjepaCoverage: summarizeVjepaCoverage(project, overlays, fps),
    overlayFamilies: summarizeOverlayFamilies(overlays, project.playerDimensions),
    renderArtifacts: {
      status: 'not-rendered',
      artifactDir: options.artifactDir ?? null,
      pendingFamilies: ['motion-graphic', 'caption', 'transition', 'sound', 'zoom'],
      artifactPackStatus: null,
      artifactPackIssues: [],
      renderCommand: null,
      auditedVisualCount: 0,
      auditedMotionCount: 0,
      auditedAudioCount: 0,
      presentRequiredFamilies: [],
      missingRequiredFamilies: ['motion-graphic', 'caption', 'transition', 'sfx', 'zoom'],
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
      pendingFamilies: missingRequiredFamilies,
      artifactPackStatus: artifactPack.status,
      artifactPackIssues: artifactPack.issues.slice(0, 20),
      renderCommand: artifactPack.renderCommand,
      auditedVisualCount: artifactPack.familyCoverage.auditedVisualCount,
      auditedMotionCount: artifactPack.familyCoverage.auditedMotionCount,
      auditedAudioCount: artifactPack.familyCoverage.auditedAudioCount,
      presentRequiredFamilies: artifactPack.familyCoverage.presentRequiredFamilies.slice(),
      missingRequiredFamilies,
    },
  };
}

function summarizeCutContinuity(overlays: Phase0OverlayLike[], durationFrames: number) {
  const clips = videoClips(overlays);
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
    };
  }

  const decisions = Array.isArray(bundle.decisions)
    ? bundle.decisions
    : Array.isArray((bundle.edl as JsonRecord | undefined)?.decisions)
      ? ((bundle.edl as JsonRecord).decisions as unknown[])
      : [];

  return {
    status: 'present' as const,
    source: readString(bundle.source),
    authority: normalizeUnifiedDecisionAuthority(bundle.authority),
    totalDecisions: readPositiveNumber(bundle.totalDecisions, decisions.length),
    counts: (isRecord(bundle.counts) ? bundle.counts : isRecord(bundle.decisionCounts) ? bundle.decisionCounts : countDecisions(decisions)),
    evidence: isRecord(bundle.evidence) ? bundle.evidence : null,
  };
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

  const audit = auditVjepaCoverage({
    fps,
    originalDurationMs: readNullableNumber(project.rawFootageAnalysis?.originalDurationMs) ?? undefined,
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
        semanticAtomCount: readArrayLength(overlay.metadata?.atomicMomentBundle, 'semanticAtoms'),
        relationCount: readArrayLength(overlay.metadata?.atomicMomentBundle, 'relations'),
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
      count: overlays.filter((overlay) => overlay.type === 'sound' || overlay.type === 'audio').length,
      roles: unique(overlays
        .filter((overlay) => overlay.type === 'sound' || overlay.type === 'audio')
        .map((overlay) => readString(overlay.metadata?.role ?? (overlay.metadata?.atomicSfxForm as JsonRecord | undefined)?.role))
        .filter(Boolean)),
      withAtomicForm: overlays.filter((overlay) => (overlay.type === 'sound' || overlay.type === 'audio') && overlay.metadata?.atomicSfxForm).length,
      withTransitionAnchor: overlays.filter((overlay) => (overlay.type === 'sound' || overlay.type === 'audio') && isTransitionAnchoredSfx(overlay)).length,
      withTransitionEvidence: overlays.filter((overlay) => (overlay.type === 'sound' || overlay.type === 'audio') && isTransitionAnchoredSfx(overlay) && hasSfxTransitionEvidence(overlay)).length,
      transitionEvidenceMissing: overlays
        .filter((overlay) => overlay.type === 'sound' || overlay.type === 'audio')
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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
