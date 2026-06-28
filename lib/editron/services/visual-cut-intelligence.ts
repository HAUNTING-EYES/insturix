import type { PacingSplitBoundaryReason, RawFootageAnalysis, SilenceRemovalAction } from './raw-footage-processor';
import type { VjepaAnalysisResult, VjepaSegmentResult } from './vjepa-service';

type VisualCutDecisionType = 'protect-existing-cut' | 'remove-visual-dead-air' | 'split-visual-boundary';

export interface VisualCutDecision {
  type: VisualCutDecisionType;
  startMs: number;
  endMs: number;
  confidence: number;
  reasons: string[];
  visual: Pick<
    VjepaSegmentResult,
    | 'startMs'
    | 'endMs'
    | 'visualSignificance'
    | 'motionIntensity'
    | 'actionType'
    | 'motionType'
    | 'objectCount'
    | 'faceCount'
    | 'textCoverage'
  >;
  affectedAction?: Pick<SilenceRemovalAction, 'startMs' | 'endMs' | 'action' | 'reason'>;
}

export interface VisualCutIntelligenceReport {
  version: 1;
  status: 'applied' | 'skipped';
  source: 'vjepa';
  speechCoverage: number;
  needsVisualDrivenEditing: boolean;
  inputActionCount: number;
  outputActionCount: number;
  visualSegmentCount: number;
  protectedActionCount: number;
  addedRemovalCount: number;
  addedSplitCount: number;
  calibrationStatus: 'invented-threshold';
  decisions: VisualCutDecision[];
}

export interface VisualCutRefinementResult {
  plan: SilenceRemovalAction[];
  report: VisualCutIntelligenceReport;
}

const LOW_SPEECH_COVERAGE = 0.3;
const PROTECT_SIGNIFICANCE = 0.62;
const PROTECT_MOTION = 0.55;
const PROTECT_TEXT_COVERAGE = 0.12;
const DEAD_AIR_SIGNIFICANCE = 0.18;
const DEAD_AIR_MOTION = 0.12;
const DEAD_AIR_TEXT_COVERAGE = 0.03;
const MIN_VISUAL_DEAD_AIR_MS = 1800;
const MIN_VISUAL_SPLIT_GAP_MS = 2500;
const VISUAL_BOUNDARY_DELTA = 0.42;
const VISUAL_TEXT_BOUNDARY_DELTA = 0.16;
const MAX_ADDED_VISUAL_REMOVALS = 60;
const MAX_ADDED_VISUAL_SPLITS = 120;

export function refineCutPlanWithVisualIntelligence(
  rawFootage: RawFootageAnalysis,
  vjepaAnalysis: VjepaAnalysisResult | null | undefined,
): VisualCutRefinementResult {
  const visualSegments = sanitizeVisualSegments(vjepaAnalysis?.segments);
  const inputPlan = [...(rawFootage.silenceRemovalPlan ?? [])];
  const speechCoverage = clamp01(rawFootage.speechCoverage ?? 1);
  const needsVisualDrivenEditing = Boolean(rawFootage.needsVisualDrivenEditing || speechCoverage < LOW_SPEECH_COVERAGE);
  const decisions: VisualCutDecision[] = [];

  if (!visualSegments.length) {
    return {
      plan: inputPlan,
      report: buildReport({
        status: 'skipped',
        speechCoverage,
        needsVisualDrivenEditing,
        inputActionCount: inputPlan.length,
        outputActionCount: inputPlan.length,
        visualSegmentCount: 0,
        protectedActionCount: 0,
        addedRemovalCount: 0,
        addedSplitCount: 0,
        decisions,
      }),
    };
  }

  let protectedActionCount = 0;
  const protectedPlan = inputPlan.filter((action) => {
    if (!canVisualProtectAction(action)) return true;
    const strongest = strongestOverlappingVisual(action.startMs, action.endMs, visualSegments);
    if (!strongest) return true;
    const protection = visualProtectionReasons(strongest);
    if (!protection.length) return true;

    protectedActionCount++;
    decisions.push(buildDecision('protect-existing-cut', action.startMs, action.endMs, strongest, protection, action));
    return false;
  });

  const addedActions: SilenceRemovalAction[] = [];
  if (needsVisualDrivenEditing) {
    let addedRemovalCount = 0;
    let addedSplitCount = 0;
    let lastSplitMs = -Infinity;

    for (let i = 0; i < visualSegments.length; i++) {
      const segment = visualSegments[i];
      if (
        addedRemovalCount < MAX_ADDED_VISUAL_REMOVALS &&
        isVisualDeadAir(segment) &&
        !rangeHasSpeech(rawFootage, segment.startMs, segment.endMs) &&
        !rangeIntersectsPlan(segment.startMs, segment.endMs, protectedPlan.concat(addedActions))
      ) {
        const reasons = visualDeadAirReasons(segment);
        addedActions.push(buildVisualDeadAirRemoval(segment, reasons));
        decisions.push(buildDecision('remove-visual-dead-air', segment.startMs, segment.endMs, segment, reasons));
        addedRemovalCount++;
      }

      const previous = visualSegments[i - 1];
      if (
        previous &&
        addedSplitCount < MAX_ADDED_VISUAL_SPLITS &&
        segment.startMs - lastSplitMs >= MIN_VISUAL_SPLIT_GAP_MS
      ) {
        const boundaryReasons = visualBoundaryReasons(previous, segment);
        if (
          boundaryReasons.length &&
          !splitNear(segment.startMs, protectedPlan.concat(addedActions), MIN_VISUAL_SPLIT_GAP_MS / 2)
        ) {
          addedActions.push(buildVisualBoundarySplit(previous, segment, boundaryReasons));
          decisions.push(buildDecision('split-visual-boundary', segment.startMs, segment.startMs, segment, boundaryReasons));
          lastSplitMs = segment.startMs;
          addedSplitCount++;
        }
      }
    }
  }

  const plan = protectedPlan.concat(addedActions).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const addedRemovalCount = addedActions.filter(action => action.action === 'remove').length;
  const addedSplitCount = addedActions.filter(action => action.action === 'split').length;

  return {
    plan,
    report: buildReport({
      status: 'applied',
      speechCoverage,
      needsVisualDrivenEditing,
      inputActionCount: inputPlan.length,
      outputActionCount: plan.length,
      visualSegmentCount: visualSegments.length,
      protectedActionCount,
      addedRemovalCount,
      addedSplitCount,
      decisions,
    }),
  };
}

function buildReport(input: Omit<VisualCutIntelligenceReport, 'version' | 'source' | 'calibrationStatus'>): VisualCutIntelligenceReport {
  return {
    version: 1,
    source: 'vjepa',
    calibrationStatus: 'invented-threshold',
    ...input,
  };
}

function sanitizeVisualSegments(segments: VjepaSegmentResult[] | undefined): VjepaSegmentResult[] {
  return (segments ?? [])
    .filter(segment => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs > segment.startMs)
    .slice()
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function canVisualProtectAction(action: SilenceRemovalAction): boolean {
  return action.action !== 'split' && (action.reason === 'silence' || action.reason === 'visual-dead-air');
}

function strongestOverlappingVisual(
  startMs: number,
  endMs: number,
  visualSegments: VjepaSegmentResult[],
): VjepaSegmentResult | null {
  let strongest: VjepaSegmentResult | null = null;
  let strongestScore = 0;
  for (const segment of visualSegments) {
    if (!rangesOverlap(startMs, endMs, segment.startMs, segment.endMs)) continue;
    const score = visualImportanceScore(segment);
    if (score > strongestScore) {
      strongest = segment;
      strongestScore = score;
    }
  }
  return strongest;
}

function visualProtectionReasons(segment: VjepaSegmentResult): string[] {
  const reasons: string[] = [];
  if (segment.visualSignificance >= PROTECT_SIGNIFICANCE) reasons.push('high-visual-significance');
  if (segment.motionIntensity >= PROTECT_MOTION) reasons.push('high-motion');
  if (segment.textCoverage >= PROTECT_TEXT_COVERAGE || segment.textBoxCount > 0) reasons.push('visible-text');
  if (segment.faceCount > 0 || segment.eyeContact === true) reasons.push('face-or-eye-contact');
  if (segment.objectCount >= 2) reasons.push('multiple-objects');
  if (['demonstrating', 'interacting_with_object', 'walking', 'gesturing', 'writing'].includes(segment.actionType)) {
    reasons.push(`action-${segment.actionType}`);
  }
  return reasons;
}

function isVisualDeadAir(segment: VjepaSegmentResult): boolean {
  const durationMs = segment.endMs - segment.startMs;
  const hasSubject = (segment.mainSubject?.confidence ?? 0) >= 0.35 || segment.faceCount > 0 || segment.objectCount > 1;
  const hasVisibleText = segment.textCoverage >= DEAD_AIR_TEXT_COVERAGE || segment.textBoxCount > 0;
  const activeAction = !['still', 'other'].includes(segment.actionType);

  return (
    durationMs >= MIN_VISUAL_DEAD_AIR_MS &&
    segment.visualSignificance <= DEAD_AIR_SIGNIFICANCE &&
    segment.motionIntensity <= DEAD_AIR_MOTION &&
    !hasSubject &&
    !hasVisibleText &&
    !activeAction
  );
}

function visualDeadAirReasons(segment: VjepaSegmentResult): string[] {
  const reasons = ['low-visual-significance', 'low-motion'];
  if (segment.actionType === 'still') reasons.push('still-action');
  if (segment.objectCount <= 1) reasons.push('low-object-presence');
  if (segment.faceCount <= 0) reasons.push('no-face');
  if (segment.textCoverage < DEAD_AIR_TEXT_COVERAGE) reasons.push('low-text-coverage');
  return reasons;
}

function visualBoundaryReasons(previous: VjepaSegmentResult, next: VjepaSegmentResult): PacingSplitBoundaryReason[] {
  const reasons: PacingSplitBoundaryReason[] = [];
  if (Math.abs(next.visualSignificance - previous.visualSignificance) >= VISUAL_BOUNDARY_DELTA) {
    reasons.push('visual-state-change');
  }
  if (Math.abs(next.motionIntensity - previous.motionIntensity) >= VISUAL_BOUNDARY_DELTA) {
    reasons.push('visual-motion-change');
  }
  if (Math.abs(next.objectCount - previous.objectCount) >= 2 || Math.abs(next.faceCount - previous.faceCount) >= 1) {
    reasons.push('visual-subject-change');
  }
  if (Math.abs(next.textCoverage - previous.textCoverage) >= VISUAL_TEXT_BOUNDARY_DELTA || Math.abs(next.textBoxCount - previous.textBoxCount) >= 2) {
    reasons.push('visual-text-change');
  }
  return reasons;
}

function buildVisualDeadAirRemoval(segment: VjepaSegmentResult, reasons: string[]): SilenceRemovalAction {
  return {
    startMs: segment.startMs,
    endMs: segment.endMs,
    action: 'remove',
    reason: 'visual-dead-air',
    metadata: {
      kind: 'visual-cut',
      source: 'vjepa-visual-dead-air',
      calibrationStatus: 'invented-threshold',
      visualCut: visualCutMetadata('remove-visual-dead-air', segment, reasons),
    },
  };
}

function buildVisualBoundarySplit(
  previous: VjepaSegmentResult,
  next: VjepaSegmentResult,
  reasons: PacingSplitBoundaryReason[],
): SilenceRemovalAction {
  return {
    startMs: next.startMs,
    endMs: next.startMs,
    action: 'split',
    reason: 'pacing-split',
    metadata: {
      kind: 'pacing-split',
      source: 'vjepa-visual-boundary',
      calibrationStatus: 'invented-threshold',
      boundaryReasons: reasons,
      speechGapMs: Math.max(0, Math.round(next.startMs - previous.endMs)),
      visualCut: visualCutMetadata('split-visual-boundary', next, reasons),
    },
  };
}

function visualCutMetadata(
  decision: VisualCutDecisionType,
  segment: VjepaSegmentResult,
  reasons: string[],
): NonNullable<NonNullable<SilenceRemovalAction['metadata']>['visualCut']> {
  return {
    decision,
    confidence: confidenceForReasons(reasons),
    visualSegmentStartMs: segment.startMs,
    visualSegmentEndMs: segment.endMs,
    visualSignificance: round01(segment.visualSignificance),
    motionIntensity: round01(segment.motionIntensity),
    actionType: segment.actionType,
    motionType: segment.motionType,
    objectCount: segment.objectCount,
    faceCount: segment.faceCount,
    textCoverage: round01(segment.textCoverage),
    reasons,
  };
}

function buildDecision(
  type: VisualCutDecisionType,
  startMs: number,
  endMs: number,
  visual: VjepaSegmentResult,
  reasons: string[],
  affectedAction?: SilenceRemovalAction,
): VisualCutDecision {
  return {
    type,
    startMs,
    endMs,
    confidence: confidenceForReasons(reasons),
    reasons,
    visual: {
      startMs: visual.startMs,
      endMs: visual.endMs,
      visualSignificance: round01(visual.visualSignificance),
      motionIntensity: round01(visual.motionIntensity),
      actionType: visual.actionType,
      motionType: visual.motionType,
      objectCount: visual.objectCount,
      faceCount: visual.faceCount,
      textCoverage: round01(visual.textCoverage),
    },
    ...(affectedAction && {
      affectedAction: {
        startMs: affectedAction.startMs,
        endMs: affectedAction.endMs,
        action: affectedAction.action,
        reason: affectedAction.reason,
      },
    }),
  };
}

function visualImportanceScore(segment: VjepaSegmentResult): number {
  return Math.max(
    segment.visualSignificance,
    segment.motionIntensity * 0.9,
    segment.textCoverage * 1.2,
    segment.faceCount > 0 ? 0.7 : 0,
    segment.objectCount >= 2 ? 0.62 : 0,
    ['demonstrating', 'interacting_with_object', 'walking', 'gesturing', 'writing'].includes(segment.actionType) ? 0.68 : 0,
  );
}

function confidenceForReasons(reasons: string[]): number {
  return round01(Math.min(0.95, 0.58 + reasons.length * 0.08));
}

function rangeHasSpeech(rawFootage: RawFootageAnalysis, startMs: number, endMs: number): boolean {
  const words = rawFootage.transcription?.words ?? [];
  return words.some(word => rangesOverlap(startMs, endMs, word.startMs, word.endMs));
}

function rangeIntersectsPlan(startMs: number, endMs: number, plan: SilenceRemovalAction[]): boolean {
  return plan.some(action => action.action !== 'split' && rangesOverlap(startMs, endMs, action.startMs, action.endMs));
}

function splitNear(atMs: number, plan: SilenceRemovalAction[], toleranceMs: number): boolean {
  return plan.some(action => action.action === 'split' && Math.abs(action.startMs - atMs) <= toleranceMs);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round01(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}