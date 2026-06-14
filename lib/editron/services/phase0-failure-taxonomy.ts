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

export function classifyPhase0Fixture(
  manifest: Phase0FixtureManifest,
  artifactPack?: Phase0RenderArtifactPack,
): Phase0FailureTaxonomy {
  const classes: Phase0FailureClass[] = [];

  addCutClasses(classes, manifest);
  addTimelineClasses(classes, manifest);
  addDecisionClasses(classes, manifest);
  addVjepaClasses(classes, manifest);
  addOverlayClasses(classes, manifest);
  addRenderClasses(classes, manifest, artifactPack);
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
  if (cut.overlapCount > 0) {
    classes.push({
      id: 'cut.overlapping_video_clips',
      severity: 'fail',
      source: 'cut',
      message: 'Edited timeline contains overlapping source video clips.',
      evidence: { count: cut.overlapCount, samples: cut.overlaps },
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
