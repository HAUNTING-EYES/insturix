import type { Phase0FixtureManifest, Phase0OverlayLike } from './phase0-fixture-manifest';
import type { Phase0RenderArtifactPack } from './phase0-render-artifact-pack';

export const PHASE0_FAILURE_TAXONOMY_VERSION = 'editron-phase0-failure-taxonomy-v1' as const;

export type Phase0FailureSeverity = 'info' | 'warn' | 'fail';

type JsonRecord = Record<string, unknown>;

const TRANSITION_REPETITION_RUN = 3;
const MIN_ZOOM_GAP_FRAMES = 90;
const MIN_SFX_GAP_FRAMES = 15;
const SFX_SYNC_WINDOW_FRAMES = 3;
const TIMELINE_SAMPLE_LIMIT = 8;

export interface Phase0FailureClass {
  id: string;
  severity: Phase0FailureSeverity;
  source: 'cut' | 'timeline' | 'decision' | 'vjepa' | 'render' | 'overlay' | 'calibration' | 'quality';
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
  addQualityClasses(classes, manifest);
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
  const cutPlan = manifest.cutPlan;
  if (cutPlan.status !== 'present') {
    classes.push({
      id: 'cut.plan_missing',
      severity: 'warn',
      source: 'cut',
      message: 'Cut plan actions are missing from the Phase 0 fixture, so pacing/removal intent cannot be audited.',
      evidence: {
        status: cutPlan.status,
        issue: cutPlan.issue,
      },
    });
  }
  if (cutPlan.pacingSplitsMissingEvidenceCount > 0) {
    classes.push({
      id: 'cut.pacing_split_evidence_missing',
      severity: 'warn',
      source: 'cut',
      message: 'One or more pacing split actions are missing boundary evidence.',
      evidence: {
        count: cutPlan.pacingSplitsMissingEvidenceCount,
        samples: cutPlan.actions
          .filter((action) => (
            (action.reason === 'pacing-split' || action.action === 'split') &&
            (action.pacingEvidence.boundaryReasons.length === 0 || action.pacingEvidence.speechGapMs == null)
          ))
          .slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
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

  const decisionMode = resolveDecisionMode(manifest.unifiedDecisionBundle.authority);
  if (decisionMode === 'creative-brief-primary') {
    classes.push({
      id: 'decision.authority_creative_primary',
      severity: 'warn',
      source: 'decision',
      message: 'Decision authority is still Creative Brief primary; signal candidates do not own execution.',
      evidence: {
        decisionMode,
        source: manifest.unifiedDecisionBundle.source,
      },
    });
  }

  const signalDecisionHealth = asRecord(manifest.unifiedDecisionBundle.signalDecisionHealth);
  const signalHealthStatus = readString(signalDecisionHealth.status);
  if (signalHealthStatus === 'missing') {
    classes.push({
      id: 'decision.signal_audit_missing',
      severity: 'warn',
      source: 'decision',
      message: 'Unified bundle exists, but signal-decision audit evidence is missing.',
      evidence: {
        issue: readString(signalDecisionHealth.issue),
      },
    });
  } else if (signalHealthStatus === 'empty') {
    classes.push({
      id: 'decision.signal_candidates_empty',
      severity: 'warn',
      source: 'decision',
      message: 'Signal-decision audit exists, but it contains zero signal candidates.',
      evidence: compactSignalDecisionHealthEvidence(signalDecisionHealth),
    });
  } else if (signalHealthStatus === 'no-executable-signals') {
    classes.push({
      id: 'decision.signal_candidates_not_promoted',
      severity: 'warn',
      source: 'decision',
      message: 'Signal candidates were observed, but none became executable or validated a primary decision.',
      evidence: compactSignalDecisionHealthEvidence(signalDecisionHealth),
    });
  } else if (signalHealthStatus === 'normalization-incomplete') {
    classes.push({
      id: 'decision.signal_normalization_incomplete',
      severity: 'warn',
      source: 'decision',
      message: 'One or more signal candidates are missing normalized score fields used for planner authority.',
      evidence: compactSignalDecisionHealthEvidence(signalDecisionHealth),
    });
  }

  const decisionOutputTrace = asRecord(manifest.unifiedDecisionBundle.decisionOutputTrace);
  const outputTraceStatus = readString(decisionOutputTrace.status);
  if (outputTraceStatus === 'missing') {
    classes.push({
      id: 'decision.output_trace_missing',
      severity: 'warn',
      source: 'decision',
      message: 'Unified bundle exists, but decision-to-overlay execution trace is missing.',
      evidence: { issue: readString(decisionOutputTrace.issue) },
    });
  } else if (outputTraceStatus === 'empty') {
    classes.push({
      id: 'decision.output_trace_empty',
      severity: 'warn',
      source: 'decision',
      message: 'Decision-to-overlay execution trace exists but contains no observed decisions.',
      evidence: compactDecisionOutputTraceEvidence(decisionOutputTrace),
    });
  } else if (outputTraceStatus === 'no-output-links') {
    classes.push({
      id: 'decision.output_trace_no_overlay_links',
      severity: 'warn',
      source: 'decision',
      message: 'Executed decisions were observed, but none linked to created or modified overlays.',
      evidence: compactDecisionOutputTraceEvidence(decisionOutputTrace),
    });
  } else if (outputTraceStatus === 'partial-output-links') {
    classes.push({
      id: 'decision.output_trace_partial_overlay_links',
      severity: 'warn',
      source: 'decision',
      message: 'Some executed decisions did not link to a created or modified overlay.',
      evidence: compactDecisionOutputTraceEvidence(decisionOutputTrace),
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
  if (transitions.boundaryEvidenceMissing.length > 0) {
    classes.push({
      id: 'overlay.transition_boundary_evidence_missing',
      severity: 'warn',
      source: 'overlay',
      message: 'One or more transition overlays are missing boundary pair or boundary-reason evidence.',
      evidence: {
        count: transitions.boundaryEvidenceMissing.length,
        withBoundaryPair: transitions.withBoundaryPair,
        withBoundaryReason: transitions.withBoundaryReason,
        samples: transitions.boundaryEvidenceMissing.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
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
  if (sfx.transitionEvidenceMissing.length > 0) {
    classes.push({
      id: 'overlay.sfx_transition_evidence_missing',
      severity: 'warn',
      source: 'overlay',
      message: 'One or more transition-anchored SFX overlays are missing transition job or evidence metadata.',
      evidence: {
        count: sfx.transitionEvidenceMissing.length,
        withTransitionAnchor: sfx.withTransitionAnchor,
        withTransitionEvidence: sfx.withTransitionEvidence,
        samples: sfx.transitionEvidenceMissing.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }

  addCaptionLayoutMismatchClass(classes, manifest);
}

function addCaptionLayoutMismatchClass(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  const canvasWidth = positiveNumber(manifest.canvas.width, 0);
  const canvasHeight = positiveNumber(manifest.canvas.height, 0);
  if (canvasWidth <= 0 || canvasHeight <= 0) return;

  const samples = manifest.overlayFamilies.captions.geometryMismatches.slice(0, TIMELINE_SAMPLE_LIMIT);
  if (samples.length === 0) return;

  classes.push({
    id: 'overlay.caption_layout_mismatch',
    severity: 'warn',
    source: 'overlay',
    message: 'Caption overlay geometry contradicts its declared presentation layout.',
    evidence: {
      count: manifest.overlayFamilies.captions.geometryMismatches.length,
      canvas: { width: canvasWidth, height: canvasHeight },
      samples,
    },
  });
}

function addRenderClasses(
  classes: Phase0FailureClass[],
  manifest: Phase0FixtureManifest,
  artifactPack?: Phase0RenderArtifactPack,
  renderedReport?: Phase0RenderedAestheticReportLike,
): void {
  if (manifest.codeProvenance?.dirty) {
    classes.push({
      id: 'render.dirty_code_checkout',
      severity: 'warn',
      source: 'render',
      message: 'Phase 0 artifact was captured from a dirty code checkout, so rendered evidence may not match the pushed branch.',
      evidence: {
        branch: manifest.codeProvenance.branch,
        head: manifest.codeProvenance.head,
        upstreamHead: manifest.codeProvenance.upstreamHead,
        dirtyPathCount: manifest.codeProvenance.dirtyPaths.length,
        dirtyPaths: manifest.codeProvenance.dirtyPaths.slice(0, TIMELINE_SAMPLE_LIMIT),
        untrackedPaths: manifest.codeProvenance.untrackedPaths.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }

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
  if (artifactPack.familyCoverage.missingRequiredFamilies.length > 0) {
    classes.push({
      id: 'render.required_family_coverage_missing',
      severity: 'info',
      source: 'render',
      message: 'Phase 0 artifact pack is missing one or more northstar overlay-family evidence buckets.',
      evidence: {
        missingRequiredFamilies: artifactPack.familyCoverage.missingRequiredFamilies,
        presentRequiredFamilies: artifactPack.familyCoverage.presentRequiredFamilies,
        auditedVisualCount: artifactPack.familyCoverage.auditedVisualCount,
        auditedMotionCount: artifactPack.familyCoverage.auditedMotionCount,
        auditedAudioCount: artifactPack.familyCoverage.auditedAudioCount,
      },
    });
  }
  addTimelineEvidenceClasses(classes, artifactPack);
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

function addTimelineEvidenceClasses(
  classes: Phase0FailureClass[],
  artifactPack: Phase0RenderArtifactPack,
): void {
  const overlays = artifactPack.renderInput.overlays;
  const fps = positiveNumber(artifactPack.renderInput.fps, 30);

  addTransitionRepetitionClass(classes, overlays);
  addZoomTimingClass(classes, overlays);
  addSfxTimingClasses(classes, overlays, fps);
}

function addTransitionRepetitionClass(classes: Phase0FailureClass[], overlays: Phase0OverlayLike[]): void {
  const transitions = overlays
    .filter((overlay) => overlay.type === 'transition')
    .map((overlay) => ({
      id: overlayId(overlay),
      frame: frameOf(overlay),
      style: transitionStyle(overlay),
    }))
    .sort((a, b) => a.frame - b.frame);
  const samples: Array<{ style: string; runLength: number; startFrame: number; overlayIds: string[] }> = [];
  let runStart = 0;

  for (let index = 1; index <= transitions.length; index += 1) {
    const previous = transitions[index - 1];
    const current = transitions[index];
    if (current && previous && current.style === previous.style) continue;

    const run = transitions.slice(runStart, index);
    if (run.length >= TRANSITION_REPETITION_RUN && run[0]?.style !== 'unknown') {
      samples.push({
        style: run[0].style,
        runLength: run.length,
        startFrame: run[0].frame,
        overlayIds: run.map((item) => item.id).slice(0, TIMELINE_SAMPLE_LIMIT),
      });
    }
    runStart = index;
  }

  if (samples.length > 0) {
    classes.push({
      id: 'timeline.transition_repetition',
      severity: 'warn',
      source: 'timeline',
      message: 'Three or more consecutive transition overlays use the same physical form.',
      evidence: {
        threshold: TRANSITION_REPETITION_RUN,
        count: samples.length,
        samples: samples.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
}

function addZoomTimingClass(classes: Phase0FailureClass[], overlays: Phase0OverlayLike[]): void {
  const zooms = collectZoomEvents(overlays).sort((a, b) => a.frame - b.frame);
  const samples: Array<{ previousId: string; currentId: string; previousFrame: number; currentFrame: number; gapFrames: number; role: string | null }> = [];

  for (let index = 1; index < zooms.length; index += 1) {
    const previous = zooms[index - 1];
    const current = zooms[index];
    const gapFrames = current.frame - previous.frame;
    if (gapFrames >= 0 && gapFrames < MIN_ZOOM_GAP_FRAMES) {
      samples.push({
        previousId: previous.id,
        currentId: current.id,
        previousFrame: previous.frame,
        currentFrame: current.frame,
        gapFrames,
        role: current.role,
      });
    }
  }

  if (samples.length > 0) {
    classes.push({
      id: 'timeline.zoom_too_dense',
      severity: 'warn',
      source: 'timeline',
      message: 'Zoom/camera-motion events are clustered closer than the signal-owned spacing floor.',
      evidence: {
        minGapFrames: MIN_ZOOM_GAP_FRAMES,
        count: samples.length,
        samples: samples.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
}

function addSfxTimingClasses(classes: Phase0FailureClass[], overlays: Phase0OverlayLike[], fps: number): void {
  const sfx = overlays
    .filter((overlay) => overlay.type === 'sound' || overlay.type === 'audio')
    .map((overlay) => ({
      id: overlayId(overlay),
      frame: sfxSyncFrameOf(overlay),
      role: sfxRole(overlay),
      transitionLinked: hasSfxTransitionEvidence(overlay),
      selfLicensedAudioAnchor: hasSelfLicensedSfxAudioAnchor(overlay),
    }))
    .sort((a, b) => a.frame - b.frame);
  const anchors = collectVisualSyncAnchors(overlays).sort((a, b) => a.frame - b.frame);
  const denseSamples: Array<{ previousId: string; currentId: string; previousFrame: number; currentFrame: number; gapFrames: number }> = [];
  const driftSamples: Array<{ id: string; frame: number; nearestAnchorFrame: number; nearestAnchorType: string; distanceFrames: number; role: string | null }> = [];
  const orphanSamples: Array<{ id: string; frame: number; nearestAnchorFrame: number | null; nearestAnchorType: string | null; distanceFrames: number | null; role: string | null }> = [];

  for (let index = 1; index < sfx.length; index += 1) {
    const previous = sfx[index - 1];
    const current = sfx[index];
    const gapFrames = current.frame - previous.frame;
    if (gapFrames >= 0 && gapFrames < MIN_SFX_GAP_FRAMES) {
      denseSamples.push({
        previousId: previous.id,
        currentId: current.id,
        previousFrame: previous.frame,
        currentFrame: current.frame,
        gapFrames,
      });
    }
  }

  for (const item of sfx) {
    if (item.selfLicensedAudioAnchor) continue;
    const nearest = nearestAnchor(item.frame, anchors);
    if (!nearest) {
      orphanSamples.push({
        id: item.id,
        frame: item.frame,
        nearestAnchorFrame: null,
        nearestAnchorType: null,
        distanceFrames: null,
        role: item.role,
      });
      continue;
    }
    if (nearest.distanceFrames > SFX_SYNC_WINDOW_FRAMES && nearest.distanceFrames <= fps) {
      driftSamples.push({
        id: item.id,
        frame: item.frame,
        nearestAnchorFrame: nearest.frame,
        nearestAnchorType: nearest.type,
        distanceFrames: nearest.distanceFrames,
        role: item.role,
      });
    } else if (nearest.distanceFrames > fps) {
      orphanSamples.push({
        id: item.id,
        frame: item.frame,
        nearestAnchorFrame: nearest.frame,
        nearestAnchorType: nearest.type,
        distanceFrames: nearest.distanceFrames,
        role: item.role,
      });
    }
  }

  const missingTransitionSfx = overlays
    .filter((overlay) => overlay.type === 'transition')
    .map((overlay) => ({
      id: overlayId(overlay),
      frame: frameOf(overlay),
      style: transitionStyle(overlay),
      sfxRole: transitionSfxRole(overlay),
      sfxPlacementStatus: transitionSfxPlacementStatus(overlay),
      sfxPlacementReason: transitionSfxPlacementReason(overlay),
    }))
    .filter((transition) => transitionNeedsSfx(transition.style, transition.sfxRole))
    .filter((transition) => !transitionSfxSuppressed(transition.sfxPlacementStatus, transition.sfxPlacementReason))
    .filter((transition) => !sfx.some((item) => item.transitionLinked && Math.abs(item.frame - transition.frame) <= SFX_SYNC_WINDOW_FRAMES))
    .slice(0, TIMELINE_SAMPLE_LIMIT);

  if (denseSamples.length > 0) {
    classes.push({
      id: 'timeline.sfx_too_dense',
      severity: 'warn',
      source: 'timeline',
      message: 'SFX events are clustered closer than the timing floor.',
      evidence: {
        minGapFrames: MIN_SFX_GAP_FRAMES,
        count: denseSamples.length,
        samples: denseSamples.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
  if (driftSamples.length > 0) {
    classes.push({
      id: 'timeline.sfx_timing_drift',
      severity: 'warn',
      source: 'timeline',
      message: 'SFX events exist near visual anchors but miss the sync window.',
      evidence: {
        syncWindowFrames: SFX_SYNC_WINDOW_FRAMES,
        orphanWindowFrames: fps,
        count: driftSamples.length,
        samples: driftSamples.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
  if (orphanSamples.length > 0) {
    classes.push({
      id: 'timeline.sfx_orphan',
      severity: 'info',
      source: 'timeline',
      message: 'SFX events have no nearby visual, transition, cut, or zoom anchor.',
      evidence: {
        orphanWindowFrames: fps,
        count: orphanSamples.length,
        samples: orphanSamples.slice(0, TIMELINE_SAMPLE_LIMIT),
      },
    });
  }
  if (missingTransitionSfx.length > 0) {
    classes.push({
      id: 'timeline.transition_sfx_missing',
      severity: 'warn',
      source: 'timeline',
      message: 'One or more non-hard-cut transitions have no paired SFX inside the sync window.',
      evidence: {
        syncWindowFrames: SFX_SYNC_WINDOW_FRAMES,
        count: missingTransitionSfx.length,
        samples: missingTransitionSfx,
      },
    });
  }
}

function addQualityClasses(classes: Phase0FailureClass[], manifest: Phase0FixtureManifest): void {
  if (manifest.qualityReview.status === 'missing') {
    classes.push({
      id: 'quality.review_metadata_missing',
      severity: 'info',
      source: 'quality',
      message: 'Quality review metadata is missing from project fixture.',
      evidence: {
        issue: manifest.qualityReview.issue ?? 'quality review not persisted',
      },
    });
    return;
  }

  if (manifest.qualityReview.criticalCount > 0) {
    classes.push({
      id: 'quality.critical_issues',
      severity: 'fail',
      source: 'quality',
      message: 'Quality review contains critical issues.',
      evidence: {
        criticalCount: manifest.qualityReview.criticalCount,
        issueCount: manifest.qualityReview.issueCount,
      },
    });
  }

  if (manifest.qualityReview.warningCount > 0) {
    classes.push({
      id: 'quality.warning_issues',
      severity: 'warn',
      source: 'quality',
      message: 'Quality review contains warning-level issues.',
      evidence: {
        warningCount: manifest.qualityReview.warningCount,
        autoFixableCount: manifest.qualityReview.autoFixableCount,
      },
    });
  }

  if (manifest.qualityReview.overallScore != null && manifest.qualityReview.overallScore < 0.4) {
    classes.push({
      id: 'quality.low_overall_score',
      severity: manifest.qualityReview.criticalCount > 0 ? 'fail' : 'warn',
      source: 'quality',
      message: 'Persisted overall quality score is poor.',
      evidence: { overallScore: manifest.qualityReview.overallScore },
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

function resolveDecisionMode(authority: unknown): string | null {
  if (typeof authority === 'string') {
    if (authority === 'creative-primary-signal-evidence') {
      return 'creative-brief-primary';
    }
    return authority;
  }

  if (authority && typeof authority === 'object' && 'decisionMode' in authority) {
    const decisionMode = authority.decisionMode;
    if (typeof decisionMode === 'string') {
      return decisionMode;
    }
  }

  return null;
}

function normalizeIssueToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function severityWeight(severity: Phase0FailureSeverity): number {
  if (severity === 'fail') return 3;
  if (severity === 'warn') return 2;
  return 1;
}

function collectZoomEvents(overlays: Phase0OverlayLike[]): Array<{ id: string; frame: number; role: string | null }> {
  const events: Array<{ id: string; frame: number; role: string | null }> = [];
  for (const overlay of overlays) {
    const metadata = asRecord(overlay.metadata);
    if (overlay.type === 'zoom') {
      const zoomForm = asRecord(metadata.atomicZoomForm);
      events.push({
        id: overlayId(overlay),
        frame: frameOf(overlay),
        role: readString(zoomForm.intent ?? metadata.role) ?? null,
      });
      continue;
    }

    if (overlay.type === 'video' && Array.isArray(metadata.zoomKeyframes)) {
      metadata.zoomKeyframes.forEach((keyframe, index) => {
        const record = asRecord(keyframe);
        const localFrame = readNumber(record.frame ?? record.atFrame ?? record.timeFrame);
        if (localFrame == null) return;
        events.push({
          id: `${overlayId(overlay)}:zoom-${index}`,
          frame: frameOf(overlay) + localFrame,
          role: readString(record.intent ?? record.type ?? record.kind) ?? 'zoom-keyframe',
        });
      });
    }
  }
  return events;
}

function collectVisualSyncAnchors(overlays: Phase0OverlayLike[]): Array<{ frame: number; type: string }> {
  const visualAnchorTypes = new Set([
    'caption',
    'html-scene',
    'html-sticker',
    'image',
    'motion-graphic',
    'shape',
    'sticker',
    'text',
    'transition',
    'zoom',
  ]);
  const anchors: Array<{ frame: number; type: string }> = [];

  for (const overlay of overlays) {
    const type = String(overlay.type ?? 'unknown');
    if (type === 'video') {
      anchors.push({ frame: frameOf(overlay), type: 'cut' });
      continue;
    }
    if (visualAnchorTypes.has(type)) {
      anchors.push({ frame: frameOf(overlay), type });
    }
  }

  return anchors;
}

function nearestAnchor(frame: number, anchors: Array<{ frame: number; type: string }>): { frame: number; type: string; distanceFrames: number } | null {
  let best: { frame: number; type: string; distanceFrames: number } | null = null;
  for (const anchor of anchors) {
    const distanceFrames = Math.abs(anchor.frame - frame);
    if (!best || distanceFrames < best.distanceFrames) {
      best = { ...anchor, distanceFrames };
    }
  }
  return best;
}

function transitionNeedsSfx(style: string, sfxRole?: string | null): boolean {
  if (sfxRole === 'none') return false;
  if (sfxRole) return true;
  return ![
    'cut',
    'hard-cut',
    'hard_cut',
    'invisible-cut',
    'match-cut',
    'match_cut',
    'soft-cut',
    'dip-to-black',
    'dip-to-white',
    'film-burn',
    'none',
    'unknown',
  ].includes(style);
}

function transitionSfxRole(overlay: Phase0OverlayLike): string | null {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicTransitionForm);
  return readString(form.sfxRole);
}

function transitionSfxPlacementStatus(overlay: Phase0OverlayLike): string | null {
  const metadata = asRecord(overlay.metadata);
  const placement = asRecord(metadata.transitionSfxPlacement);
  return readString(placement.status ?? metadata.transitionSfxPlacementStatus);
}

function transitionSfxPlacementReason(overlay: Phase0OverlayLike): string | null {
  const metadata = asRecord(overlay.metadata);
  const placement = asRecord(metadata.transitionSfxPlacement);
  return readString(placement.reason ?? metadata.transitionSfxSkipReason);
}

function transitionSfxSuppressed(status: string | null, reason: string | null): boolean {
  if (status === 'suppressed') return true;
  return reason === 'profile-policy-off'
    || reason === 'atomic-silence'
    || Boolean(reason?.startsWith('silence-wins'));
}

function transitionStyle(overlay: Phase0OverlayLike): string {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicTransitionForm);
  return normalizeStyle(
    readString(overlay.transitionStyle)
      ?? readString(metadata.transitionType)
      ?? readString(metadata.transitionStyle)
      ?? readString(form.style)
      ?? readString(form.compatibilityType)
      ?? readString(form.job)
      ?? 'unknown',
  );
}

function sfxRole(overlay: Phase0OverlayLike): string | null {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicSfxForm);
  return readString(form.role ?? metadata.role ?? metadata.sfxRole ?? metadata.sfxType) ?? null;
}

function sfxSyncFrameOf(overlay: Phase0OverlayLike): number {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicSfxForm);
  const timing = asRecord(form.timing);
  return Math.max(0, Math.round(
    readNumber(timing.syncFrame)
      ?? readNumber(metadata.sfxSyncFrame)
      ?? frameOf(overlay),
  ));
}

function hasSelfLicensedSfxAudioAnchor(overlay: Phase0OverlayLike): boolean {
  const anchor = sfxTimingAnchor(overlay);
  if (anchor === 'motion-peak') return sfxMotionEvidenceStrength(overlay) >= 0.62;
  return anchor === 'keyword' || anchor === 'speech-peak' || anchor === 'beat';
}

function sfxTimingAnchor(overlay: Phase0OverlayLike): string | null {
  const metadata = asRecord(overlay.metadata);
  const form = asRecord(metadata.atomicSfxForm);
  const timing = asRecord(form.timing);
  const receipt = sfxReceipt(overlay);
  const payload = asRecord(receipt.payload);
  return normalizeStyle(
    readString(timing.anchor)
      ?? readString(metadata.sfxAnchor)
      ?? readString(payload.syncAnchor)
      ?? '',
  ) || null;
}

function sfxMotionEvidenceStrength(overlay: Phase0OverlayLike): number {
  const receipt = sfxReceipt(overlay);
  const visualContext = asRecord(receipt.visualContext);
  const motionFromContext = readNumber(visualContext.motionIntensity) ?? readNumber(visualContext.motion_intensity) ?? 0;
  const motionFromAtoms = sfxReceiptAtoms(overlay).reduce((max, atom) => {
    if (readString(atom.key) !== 'visual.motion_intensity') return max;
    return Math.max(max, readNumber(atom.value) ?? 0);
  }, 0);
  return Math.max(motionFromContext, motionFromAtoms);
}

function hasSfxTransitionEvidence(overlay: Phase0OverlayLike): boolean {
  return hasSfxTransitionOverlayId(overlay)
    && hasSfxTransitionReason(overlay)
    && hasSfxTransitionEvidenceSource(overlay);
}

function hasSfxTransitionOverlayId(overlay: Phase0OverlayLike): boolean {
  const metadata = asRecord(overlay.metadata);
  const receipt = sfxReceipt(overlay);
  const payload = asRecord(receipt.payload);
  const target = asRecord(receipt.target);
  return Boolean(
    hasScalarEvidence(metadata.transitionOverlayId)
      || hasScalarEvidence(payload.transitionOverlayId)
      || hasScalarEvidence(target.transitionOverlayId)
      || sfxReceiptAtoms(overlay).some((atom) => readString(atom.key) === 'transition.overlay_id' && hasScalarEvidence(atom.value))
  );
}

function hasSfxTransitionReason(overlay: Phase0OverlayLike): boolean {
  const metadata = asRecord(overlay.metadata);
  const receipt = sfxReceipt(overlay);
  const payload = asRecord(receipt.payload);
  return Boolean(
    hasScalarEvidence(payload.transitionJob)
      || hasScalarEvidence(payload.transitionIntent)
      || hasScalarEvidence(metadata.transitionJob)
      || hasScalarEvidence(metadata.transitionIntent)
      || sfxReceiptAtoms(overlay).some((atom) => {
        const key = readString(atom.key);
        return (key === 'transition.job' || key === 'transition.intent') && hasScalarEvidence(atom.value);
      })
  );
}

function hasSfxTransitionEvidenceSource(overlay: Phase0OverlayLike): boolean {
  const receipt = sfxReceipt(overlay);
  const payload = asRecord(receipt.payload);
  return Boolean(
    hasScalarEvidence(payload.transitionEvidenceSource)
      || sfxReceiptAtoms(overlay).some((atom) => readString(atom.key) === 'transition.evidence_source' && hasScalarEvidence(atom.value))
  );
}

function sfxReceipt(overlay: Phase0OverlayLike): JsonRecord {
  const metadata = asRecord(overlay.metadata);
  const receipts = [
    ...(Array.isArray(metadata.atomicOverlayReceipts) ? metadata.atomicOverlayReceipts.map(asRecord) : []),
    asRecord(metadata.atomicOverlayReceipt),
  ].filter((receipt) => Object.keys(receipt).length > 0);
  return receipts.find(isSfxReceipt) ?? receipts[0] ?? {};
}

function isSfxReceipt(receipt: JsonRecord): boolean {
  const payload = asRecord(receipt.payload);
  const form = asRecord(receipt.form);
  return readString(receipt.family) === 'sfx'
    || readString(form.family) === 'sfx'
    || readString(payload.formVersion) === 'atomic-sfx-form-v1';
}

function sfxReceiptAtoms(overlay: Phase0OverlayLike): JsonRecord[] {
  const receipt = sfxReceipt(overlay);
  return Array.isArray(receipt.atoms) ? receipt.atoms.map(asRecord).filter((item) => Object.keys(item).length > 0) : [];
}

function overlayId(overlay: Phase0OverlayLike): string {
  return String(overlay.id ?? `${overlay.type ?? 'overlay'}:${frameOf(overlay)}`);
}

function frameOf(overlay: Phase0OverlayLike): number {
  return Math.max(0, Math.round(readNumber(overlay.from) ?? 0));
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = readNumber(value);
  return number != null && number > 0 ? number : fallback;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasScalarEvidence(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return false;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function compactSignalDecisionHealthEvidence(signalDecisionHealth: JsonRecord): Record<string, unknown> {
  return {
    status: readString(signalDecisionHealth.status),
    totalCount: readNumber(signalDecisionHealth.totalCount),
    candidateCount: readNumber(signalDecisionHealth.candidateCount),
    sampleCount: readNumber(signalDecisionHealth.sampleCount),
    addedExecutableCount: readNumber(signalDecisionHealth.addedExecutableCount),
    signalPrimaryCount: readNumber(signalDecisionHealth.signalPrimaryCount),
    validatedPrimaryCount: readNumber(signalDecisionHealth.validatedPrimaryCount),
    evidenceOnlyCount: readNumber(signalDecisionHealth.evidenceOnlyCount),
    executableSignalOutcomeCount: readNumber(signalDecisionHealth.executableSignalOutcomeCount),
    promotionRate: readNumber(signalDecisionHealth.promotionRate),
    normalizedCandidateCount: readNumber(signalDecisionHealth.normalizedCandidateCount),
    unnormalizedCandidateCount: readNumber(signalDecisionHealth.unnormalizedCandidateCount),
    outcomes: asRecord(signalDecisionHealth.outcomes),
    topReasons: Array.isArray(signalDecisionHealth.topReasons) ? signalDecisionHealth.topReasons.slice(0, 5) : [],
    candidateSamples: Array.isArray(signalDecisionHealth.candidateSamples) ? signalDecisionHealth.candidateSamples.slice(0, 5) : [],
    evidenceSamples: Array.isArray(signalDecisionHealth.evidenceSamples) ? signalDecisionHealth.evidenceSamples.slice(0, 5) : [],
  };
}

function compactDecisionOutputTraceEvidence(decisionOutputTrace: JsonRecord): Record<string, unknown> {
  return {
    status: readString(decisionOutputTrace.status),
    totalObserved: readNumber(decisionOutputTrace.totalObserved),
    keptEntries: readNumber(decisionOutputTrace.keptEntries),
    truncated: decisionOutputTrace.truncated === true,
    executed: readNumber(decisionOutputTrace.executed),
    skipped: readNumber(decisionOutputTrace.skipped),
    overlaysCreated: readNumber(decisionOutputTrace.overlaysCreated),
    overlaysModified: readNumber(decisionOutputTrace.overlaysModified),
    createdOverlayLinkCount: readNumber(decisionOutputTrace.createdOverlayLinkCount),
    modifiedOverlayLinkCount: readNumber(decisionOutputTrace.modifiedOverlayLinkCount),
    executedWithoutOverlayLinkCount: readNumber(decisionOutputTrace.executedWithoutOverlayLinkCount),
    byOutcome: asRecord(decisionOutputTrace.byOutcome),
    samples: Array.isArray(decisionOutputTrace.samples) ? decisionOutputTrace.samples.slice(0, 5) : [],
  };
}

function normalizeStyle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-') || 'unknown';
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
