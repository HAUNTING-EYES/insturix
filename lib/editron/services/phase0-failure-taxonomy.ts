import type { Phase0FixtureManifest } from './phase0-fixture-manifest';
import type { Phase0RenderArtifactPack } from './phase0-render-artifact-pack';

export const PHASE0_FAILURE_TAXONOMY_VERSION = 'editron-phase0-failure-taxonomy-v1' as const;

export type Phase0FailureSeverity = 'info' | 'warn' | 'fail';

export interface Phase0FailureClass {
  id: string;
  severity: Phase0FailureSeverity;
  source: 'cut' | 'timeline' | 'decision' | 'vjepa' | 'render' | 'overlay' | 'calibration';
  message: string;
  evidence?: Record<string, unknown>;
}

export interface Phase0FailureTaxonomy {
  version: typeof PHASE0_FAILURE_TAXONOMY_VERSION;
  projectId: string;
  status: 'pass' | 'warn' | 'fail';
  summary: {
    total: number;
    fail: number;
    warn: number;
    info: number;
  };
  classes: Phase0FailureClass[];
}

export interface Phase0RenderedAestheticReportLike {
  summary?: {
    status?: 'pass' | 'warn' | 'fail';
    score?: number;
    passFrames?: number;
    warnFrames?: number;
    failFrames?: number;
    sampledFrames?: number;
    animationSampleFrames?: number;
  };
  frames?: Array<{
    frame?: number;
    report?: {
      issues?: Array<{
        dimension?: string;
        severity?: Phase0FailureSeverity;
        message?: string;
        overlayId?: string | number;
        evidence?: string;
      }>;
    };
  }>;
}

export function classifyPhase0Fixture(
  manifest: Phase0FixtureManifest,
  artifactPack?: Phase0RenderArtifactPack,
  renderedReport?: Phase0RenderedAestheticReportLike,
): Phase0FailureTaxonomy {
  const classes: Phase0FailureClass[] = [];

  addCutClasses(classes, manifest);
  addTimelineClasses(classes, manifest);
  addDecisionClasses(classes, manifest);
  addVjepaClasses(classes, manifest);
  addOverlayClasses(classes, manifest);
  addRenderClasses(classes, manifest, artifactPack, renderedReport);
  addCalibrationClasses(classes, manifest);

  const summary = summarize(classes);
  return {
    version: PHASE0_FAILURE_TAXONOMY_VERSION,
    projectId: manifest.projectId,
    status: summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass',
    summary,
    classes,
  };
}

function addCutClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  const cut = manifest.cutContinuity;
  if (cut.clipCount === 0) {
    classes.push({
      id: 'cut.no_video_clips',
      severity: 'fail',
      source: 'cut',
      message: 'No video clips exist in the edited timeline.',
    });
  }
  if (cut.midTimelineGapCount > 0) {
    classes.push({
      id: 'cut.mid_timeline_gaps',
      severity: 'warn',
      source: 'cut',
      message: 'Edited timeline contains gaps between kept video clips.',
      evidence: { count: cut.midTimelineGapCount, samples: cut.gaps },
    });
  }
  const unclassifiedOverlapCount = cut.unclassifiedOverlapCount ?? cut.overlapCount;
  const intentionalTransitionOverlapCount = cut.intentionalTransitionOverlapCount ?? 0;
  if (unclassifiedOverlapCount > 0) {
    classes.push({
      id: 'cut.overlapping_video_clips',
      severity: 'fail',
      source: 'cut',
      message: 'Edited timeline contains overlapping source video clips without transition-handle evidence.',
      evidence: {
        count: unclassifiedOverlapCount,
        samples: cut.overlaps.filter((overlap) => overlap.classification !== 'intentional-transition-handle'),
      },
    });
  }
  if (intentionalTransitionOverlapCount > 0) {
    classes.push({
      id: 'cut.transition_overlap_handles',
      severity: 'info',
      source: 'cut',
      message: 'Edited timeline contains video overlaps covered by transition handles.',
      evidence: {
        count: intentionalTransitionOverlapCount,
        samples: cut.overlaps.filter((overlap) => overlap.classification === 'intentional-transition-handle'),
      },
    });
  }
  if (cut.tailGapFrames > manifest.fps) {
    classes.push({
      id: 'cut.tail_gap',
      severity: 'warn',
      source: 'cut',
      message: 'Edited timeline has a trailing empty gap longer than one second.',
      evidence: { tailGapFrames: cut.tailGapFrames, fps: manifest.fps },
    });
  }
}

function addTimelineClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  if (!manifest.sourceMapping.hasCompleteSourceMapping) {
    classes.push({
      id: 'timeline.source_mapping_incomplete',
      severity: 'fail',
      source: 'timeline',
      message: 'Not every kept video clip has raw-to-cut source mapping.',
      evidence: manifest.sourceMapping,
    });
  }
  if (manifest.canonicalTimeline.status !== 'ok') {
    classes.push({
      id: 'timeline.canonical_context_not_safe',
      severity: 'fail',
      source: 'timeline',
      message: 'Canonical edited timeline context is missing, unsafe, or errored.',
      evidence: {
        status: manifest.canonicalTimeline.status,
        issue: manifest.canonicalTimeline.issue,
        evidence: manifest.canonicalTimeline.evidence,
      },
    });
  }
}

function addDecisionClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  if (manifest.unifiedDecisionBundle.status !== 'present') {
    classes.push({
      id: 'decision.unified_bundle_missing',
      severity: 'warn',
      source: 'decision',
      message: 'Unified decision bundle summary is missing from the project.',
    });
    return;
  }

  if (manifest.oldProducerGating.status === 'missing') {
    classes.push({
      id: 'decision.old_producer_gating_missing',
      severity: 'warn',
      source: 'decision',
      message: 'Unified bundle exists, but Phase 0 has no evidence that old profile producers were gated afterward.',
      evidence: { issue: manifest.oldProducerGating.issue },
    });
  }
  if (manifest.oldProducerGating.status === 'present' && !manifest.oldProducerGating.unifiedDecisionBundleExecuted) {
    classes.push({
      id: 'decision.old_producer_gating_not_executed',
      severity: 'warn',
      source: 'decision',
      message: 'Post-bundle profile action policy exists, but it does not confirm unified bundle execution.',
      evidence: manifest.oldProducerGating,
    });
  }
  if (manifest.oldProducerGating.status === 'present' && manifest.oldProducerGating.unknownReasonCount > 0) {
    classes.push({
      id: 'decision.old_producer_gating_unknown_reason',
      severity: 'warn',
      source: 'decision',
      message: 'One or more skipped legacy profile actions are missing explicit reasons.',
      evidence: {
        unknownReasonCount: manifest.oldProducerGating.unknownReasonCount,
        samples: manifest.oldProducerGating.skippedLegacyActions,
      },
    });
  }
}

function addVjepaClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  if (manifest.vjepaCoverage.source === 'missing') {
    classes.push({
      id: 'vjepa.coverage_missing',
      severity: 'warn',
      source: 'vjepa',
      message: 'V-JEPA coverage data is missing from the project.',
      evidence: { issues: manifest.vjepaCoverage.issues },
    });
    return;
  }
  if (manifest.vjepaCoverage.status === 'warn' || manifest.vjepaCoverage.status === 'fail') {
    classes.push({
      id: `vjepa.coverage_${manifest.vjepaCoverage.status}`,
      severity: manifest.vjepaCoverage.status,
      source: 'vjepa',
      message: 'V-JEPA coverage exists but is degraded.',
      evidence: {
        source: manifest.vjepaCoverage.source,
        issues: manifest.vjepaCoverage.issues,
        overlayHitRate: manifest.vjepaCoverage.overlayHitRate,
        segmentCoverage: manifest.vjepaCoverage.segmentCoverage,
      },
    });
  }
}

function addOverlayClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  const motionGraphics = manifest.overlayFamilies.motionGraphics;
  const weakMgCount = motionGraphics.filter((overlay) => (
    !overlay.hasAtomicPlan ||
    !overlay.hasAtomicReceipt ||
    overlay.semanticAtomCount === 0
  )).length;
  if (weakMgCount > 0) {
    classes.push({
      id: 'overlay.mg_atomic_spine_incomplete',
      severity: 'warn',
      source: 'overlay',
      message: 'One or more MG overlays are missing atomic plan, receipt, or semantic atoms.',
      evidence: { weakMgCount, total: motionGraphics.length },
    });
  }

  const transitions = manifest.overlayFamilies.transitions;
  if (transitions.count > transitions.withAtomicForm) {
    classes.push({
      id: 'overlay.transition_form_missing',
      severity: 'warn',
      source: 'overlay',
      message: 'One or more transition overlays are missing atomic transition form metadata.',
      evidence: { count: transitions.count, withAtomicForm: transitions.withAtomicForm },
    });
  }

  const sfx = manifest.overlayFamilies.sfx;
  if (sfx.count > sfx.withAtomicForm) {
    classes.push({
      id: 'overlay.sfx_form_missing',
      severity: 'warn',
      source: 'overlay',
      message: 'One or more sound overlays are missing atomic SFX form metadata.',
      evidence: { count: sfx.count, withAtomicForm: sfx.withAtomicForm },
    });
  }
}

function addRenderClasses(
  classes: Phase0FailureClass[],
  manifest: Phase0FixtureManifest,
  artifactPack?: Phase0RenderArtifactPack,
  renderedReport?: Phase0RenderedAestheticReportLike,
): void {
  if (!artifactPack) {
    classes.push({
      id: 'render.artifact_pack_missing',
      severity: 'fail',
      source: 'render',
      message: 'Rendered artifact pack was not produced.',
    });
    return;
  }
  if (artifactPack.status !== 'ready') {
    classes.push({
      id: 'render.artifact_pack_not_ready',
      severity: 'fail',
      source: 'render',
      message: 'Rendered artifact pack cannot be rendered safely.',
      evidence: { issues: artifactPack.issues, paths: artifactPack.paths },
    });
  }
  if (renderedReport) {
    addRenderedAestheticClasses(classes, renderedReport);
    return;
  }
  if (manifest.renderArtifacts.status === 'not-rendered') {
    classes.push({
      id: 'render.not_executed',
      severity: 'info',
      source: 'render',
      message: 'Render input exists, but rendered stills/GIFs have not been produced yet.',
      evidence: { artifactDir: manifest.renderArtifacts.artifactDir },
    });
  }
}

function addRenderedAestheticClasses(
  classes: Phase0FailureClass[],
  renderedReport: Phase0RenderedAestheticReportLike,
): void {
  const summary = renderedReport.summary;
  if (!summary) {
    classes.push({
      id: 'render.aesthetic_summary_missing',
      severity: 'fail',
      source: 'render',
      message: 'Rendered aesthetic report exists but has no summary block.',
    });
    return;
  }

  if (summary.status === 'fail') {
    classes.push({
      id: 'render.aesthetic_gate_failed',
      severity: 'fail',
      source: 'render',
      message: 'Rendered aesthetic gate failed on sampled overlay frames.',
      evidence: {
        score: summary.score,
        passFrames: summary.passFrames,
        warnFrames: summary.warnFrames,
        failFrames: summary.failFrames,
        sampledFrames: summary.sampledFrames,
        animationSampleFrames: summary.animationSampleFrames,
      },
    });
  } else if (summary.status === 'warn') {
    classes.push({
      id: 'render.aesthetic_gate_warn',
      severity: 'warn',
      source: 'render',
      message: 'Rendered aesthetic gate passed with warnings on sampled overlay frames.',
      evidence: {
        score: summary.score,
        passFrames: summary.passFrames,
        warnFrames: summary.warnFrames,
        failFrames: summary.failFrames,
        sampledFrames: summary.sampledFrames,
        animationSampleFrames: summary.animationSampleFrames,
      },
    });
  }

  const issues = collectRenderedIssues(renderedReport);
  for (const group of groupRenderedIssues(issues)) {
    classes.push({
      id: `render.${normalizeIssueToken(group.dimension)}_${group.severity}`,
      severity: group.severity,
      source: 'render',
      message: `Rendered aesthetic ${group.dimension} issues occurred on sampled overlay frames.`,
      evidence: {
        dimension: group.dimension,
        count: group.count,
        samples: group.samples,
      },
    });
  }
}

function collectRenderedIssues(renderedReport: Phase0RenderedAestheticReportLike) {
  const issues: Array<{
    frame: number | null;
    dimension: string;
    severity: Phase0FailureSeverity;
    message: string;
    overlayId: string | number | null;
    evidence: string | null;
  }> = [];
  for (const frame of renderedReport.frames ?? []) {
    for (const issue of frame.report?.issues ?? []) {
      const dimension = typeof issue.dimension === 'string' && issue.dimension.trim() ? issue.dimension.trim() : 'unknown';
      const severity = issue.severity === 'fail' || issue.severity === 'warn' || issue.severity === 'info'
        ? issue.severity
        : 'warn';
      issues.push({
        frame: typeof frame.frame === 'number' && Number.isFinite(frame.frame) ? frame.frame : null,
        dimension,
        severity,
        message: typeof issue.message === 'string' ? issue.message : '',
        overlayId: typeof issue.overlayId === 'string' || typeof issue.overlayId === 'number' ? issue.overlayId : null,
        evidence: typeof issue.evidence === 'string' ? issue.evidence : null,
      });
    }
  }
  return issues;
}

function groupRenderedIssues(issues: ReturnType<typeof collectRenderedIssues>) {
  const groups = new Map<string, {
    dimension: string;
    severity: Phase0FailureSeverity;
    count: number;
    samples: Array<{
      frame: number | null;
      overlayId: string | number | null;
      message: string;
      evidence: string | null;
    }>;
  }>();
  for (const issue of issues) {
    const key = `${issue.dimension}:${issue.severity}`;
    const group = groups.get(key) ?? {
      dimension: issue.dimension,
      severity: issue.severity,
      count: 0,
      samples: [],
    };
    group.count += 1;
    if (group.samples.length < 8) {
      group.samples.push({
        frame: issue.frame,
        overlayId: issue.overlayId,
        message: issue.message,
        evidence: issue.evidence,
      });
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => {
    const severityRank = severityWeight(b.severity) - severityWeight(a.severity);
    return severityRank || b.count - a.count || a.dimension.localeCompare(b.dimension);
  });
}

function normalizeIssueToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function severityWeight(severity: Phase0FailureSeverity): number {
  if (severity === 'fail') return 3;
  if (severity === 'warn') return 2;
  return 1;
}

function addCalibrationClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  if (!manifest.calibrationSafety.learningWritesAllowed) {
    classes.push({
      id: 'calibration.learning_writes_blocked',
      severity: 'info',
      source: 'calibration',
      message: 'Calibration and learning writes are blocked until rendered quality evidence exists.',
      evidence: { reason: manifest.calibrationSafety.reason },
    });
  }
}

function summarize(classes: Phase0FailureClass[]): Phase0FailureTaxonomy['summary'] {
  return {
    total: classes.length,
    fail: classes.filter((item) => item.severity === 'fail').length,
    warn: classes.filter((item) => item.severity === 'warn').length,
    info: classes.filter((item) => item.severity === 'info').length,
  };
}
