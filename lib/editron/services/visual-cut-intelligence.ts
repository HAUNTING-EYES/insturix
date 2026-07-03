import type { PacingSplitBoundaryReason, RawFootageAnalysis, SilenceRemovalAction } from './raw-footage-processor';
import {
  scoreVisualBoundaryEvidence,
  scoreVisualSegmentEvidence,
  type VisualBoundaryEvidenceScore,
  type VisualEvidenceScore,
} from './visual-evidence-scorer';
import type { VjepaAnalysisResult, VjepaSegmentResult } from './vjepa-service';

type VisualCutDecisionType = 'protect-existing-cut' | 'remove-visual-dead-air' | 'split-visual-boundary';
export type VisualCutRefinementMode = 'speech-led-visual-check' | 'visual-led';

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
  evidence?: VisualCutEvidenceSummary;
  affectedAction?: Pick<SilenceRemovalAction, 'startMs' | 'endMs' | 'action' | 'reason'>;
}

interface VisualCutEvidenceSummary {
  coverageTrust: number;
  viewerValue?: number;
  speechLock?: number;
  boundaryReadiness?: number;
  visualContinuityRisk?: number;
  artifactRisk?: number;
  brollUsefulness?: number;
  cutEligibility?: number;
  boundaryStrength?: number;
  continuityRisk?: number;
  missingEvidence: string[];
}

export interface VisualCutIntelligenceReport {
  version: 1;
  status: 'applied' | 'skipped';
  source: 'vjepa';
  mode: VisualCutRefinementMode;
  modeReason: string;
  speechCoverage: number;
  needsVisualDrivenEditing: boolean;
  inputActionCount: number;
  outputActionCount: number;
  visualSegmentCount: number;
  protectedActionCount: number;
  addedRemovalCount: number;
  addedSplitCount: number;
  calibrationStatus: 'invented-threshold';
  perception: VisualPerceptionSummary;
  decisions: VisualCutDecision[];
}

export interface VisualPerceptionSummary {
  version: 1;
  source: 'vjepa';
  calibrationStatus: 'invented-threshold';
  status: 'available' | 'unavailable';
  segmentCount: number;
  durationMs: number;
  speechCoverage: number;
  primaryVisualMode: 'unknown' | 'talking-head' | 'screen-text' | 'demonstration' | 'action-broll' | 'static-low-value' | 'mixed';
  dominantActionType: VjepaSegmentResult['actionType'] | null;
  dominantMotionType: VjepaSegmentResult['motionType'] | null;
  subjectPresenceRatio: number;
  facePresenceRatio: number;
  textPresenceRatio: number;
  motionPresenceRatio: number;
  screenClutterRatio: number;
  avgViewerValue: number;
  avgCutEligibility: number;
  avgCoverageTrust: number;
  avgTextCoverage: number;
  avgObjectCount: number;
  avgFaceCount: number;
  avgNegativeSpace: { top: number; right: number; bottom: number; left: number };
  preferredOverlayRegion: 'top' | 'right' | 'bottom' | 'left' | 'unknown';
  screenAwarePlacementTrust: 'trusted' | 'degraded' | 'unavailable';
  visualExplainability: 'high' | 'medium' | 'low' | 'unknown';
  reasons: string[];
  missingEvidence: string[];
}

export interface VisualCutRefinementResult {
  plan: SilenceRemovalAction[];
  report: VisualCutIntelligenceReport;
}

const LOW_SPEECH_COVERAGE = 0.3;
const PROTECT_VIEWER_VALUE = 0.58;
const PROTECT_SPEECH_LOCK = 0.58;
const PROTECT_BROLL_USEFULNESS = 0.48;
const PROTECT_CONTINUITY_RISK = 0.5;
const VISUAL_DEAD_AIR_CUT_ELIGIBILITY = 0.46;
const VISUAL_DEAD_AIR_MAX_VIEWER_VALUE = 0.28;
const VISUAL_DEAD_AIR_MAX_SPEECH_LOCK = 0.22;
const VISUAL_DEAD_AIR_MAX_BROLL = 0.28;
const VISUAL_DEAD_AIR_MAX_BOUNDARY_READINESS = 0.28;
const MIN_VISUAL_DEAD_AIR_MS = 1800;
const MIN_VISUAL_SPLIT_GAP_MS = 2500;
const VISUAL_BOUNDARY_STRENGTH = 0.26;
const VISUAL_BOUNDARY_CUT_ELIGIBILITY = 0.2;
const MAX_ADDED_VISUAL_REMOVALS = 60;
const MAX_ADDED_VISUAL_SPLITS = 120;

export function resolveVisualCutRefinementMode(
  rawFootage: Partial<Pick<RawFootageAnalysis, 'speechCoverage' | 'needsVisualDrivenEditing'>> | null | undefined,
): { mode: VisualCutRefinementMode; modeReason: string; speechCoverage: number; needsVisualDrivenEditing: boolean } {
  const speechCoverage = clamp01(rawFootage?.speechCoverage ?? 1);
  const needsVisualDrivenEditing = Boolean(rawFootage?.needsVisualDrivenEditing || speechCoverage < LOW_SPEECH_COVERAGE);
  if (needsVisualDrivenEditing) {
    return {
      mode: 'visual-led',
      modeReason: rawFootage?.needsVisualDrivenEditing ? 'raw-footage-marked-visual-driven' : 'low-speech-coverage',
      speechCoverage,
      needsVisualDrivenEditing,
    };
  }

  return {
    mode: 'speech-led-visual-check',
    modeReason: 'speech-coverage-sufficient',
    speechCoverage,
    needsVisualDrivenEditing,
  };
}

export function refineCutPlanWithVisualIntelligence(
  rawFootage: RawFootageAnalysis,
  vjepaAnalysis: VjepaAnalysisResult | null | undefined,
): VisualCutRefinementResult {
  const visualSegments = sanitizeVisualSegments(vjepaAnalysis?.segments);
  const inputPlan = [...(rawFootage.silenceRemovalPlan ?? [])];
  const cutMode = resolveVisualCutRefinementMode(rawFootage);
  const { speechCoverage, needsVisualDrivenEditing } = cutMode;
  const decisions: VisualCutDecision[] = [];

  if (!visualSegments.length) {
    return {
      plan: inputPlan,
      report: buildReport({
        status: 'skipped',
        mode: cutMode.mode,
        modeReason: cutMode.modeReason,
        speechCoverage,
        needsVisualDrivenEditing,
        inputActionCount: inputPlan.length,
        outputActionCount: inputPlan.length,
        visualSegmentCount: 0,
        protectedActionCount: 0,
        addedRemovalCount: 0,
        addedSplitCount: 0,
        perception: buildVisualPerceptionSummary([], rawFootage),
        decisions,
      }),
    };
  }

  let protectedActionCount = 0;
  const protectedPlan = inputPlan.filter((action) => {
    if (!canVisualProtectAction(action)) return true;
    const strongest = strongestOverlappingVisual(action.startMs, action.endMs, visualSegments, rawFootage);
    if (!strongest) return true;
    const evidence = segmentEvidence(strongest, rawFootage, action.startMs, action.endMs);
    const protection = visualProtectionReasons(strongest, evidence);
    if (!protection.length) return true;

    protectedActionCount++;
    decisions.push(buildDecision('protect-existing-cut', action.startMs, action.endMs, strongest, protection, action, evidence));
    return false;
  });

  const addedActions: SilenceRemovalAction[] = [];
  if (needsVisualDrivenEditing) {
    let addedRemovalCount = 0;
    let addedSplitCount = 0;
    let lastSplitMs = -Infinity;

    for (let i = 0; i < visualSegments.length; i++) {
      const segment = visualSegments[i];
      const evidence = segmentEvidence(segment, rawFootage);
      if (
        addedRemovalCount < MAX_ADDED_VISUAL_REMOVALS &&
        isVisualDeadAir(segment, evidence) &&
        !rangeHasSpeech(rawFootage, segment.startMs, segment.endMs) &&
        !rangeIntersectsPlan(segment.startMs, segment.endMs, protectedPlan.concat(addedActions))
      ) {
        const reasons = visualDeadAirReasons(segment, evidence);
        addedActions.push(buildVisualDeadAirRemoval(segment, reasons, evidence));
        decisions.push(buildDecision('remove-visual-dead-air', segment.startMs, segment.endMs, segment, reasons, undefined, evidence));
        addedRemovalCount++;
      }

      const previous = visualSegments[i - 1];
      if (
        previous &&
        addedSplitCount < MAX_ADDED_VISUAL_SPLITS &&
        segment.startMs - lastSplitMs >= MIN_VISUAL_SPLIT_GAP_MS
      ) {
        const boundaryEvidence = scoreVisualBoundaryEvidence(previous, segment);
        const boundaryReasons = visualBoundaryReasons(boundaryEvidence);
        if (
          boundaryReasons.length &&
          !splitNear(segment.startMs, protectedPlan.concat(addedActions), MIN_VISUAL_SPLIT_GAP_MS / 2)
        ) {
          addedActions.push(buildVisualBoundarySplit(previous, segment, boundaryReasons, boundaryEvidence));
          decisions.push(buildDecision('split-visual-boundary', segment.startMs, segment.startMs, segment, boundaryReasons, undefined, boundaryEvidence));
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
      mode: cutMode.mode,
      modeReason: cutMode.modeReason,
      speechCoverage,
      needsVisualDrivenEditing,
      inputActionCount: inputPlan.length,
      outputActionCount: plan.length,
      visualSegmentCount: visualSegments.length,
      protectedActionCount,
      addedRemovalCount,
      addedSplitCount,
      perception: buildVisualPerceptionSummary(visualSegments, rawFootage),
      decisions,
    }),
  };
}

function buildVisualPerceptionSummary(
  visualSegments: VjepaSegmentResult[],
  rawFootage: RawFootageAnalysis,
): VisualPerceptionSummary {
  const speechCoverage = clamp01(rawFootage.speechCoverage ?? 0);
  if (!visualSegments.length) {
    return {
      version: 1,
      source: 'vjepa',
      calibrationStatus: 'invented-threshold',
      status: 'unavailable',
      segmentCount: 0,
      durationMs: 0,
      speechCoverage,
      primaryVisualMode: 'unknown',
      dominantActionType: null,
      dominantMotionType: null,
      subjectPresenceRatio: 0,
      facePresenceRatio: 0,
      textPresenceRatio: 0,
      motionPresenceRatio: 0,
      screenClutterRatio: 0,
      avgViewerValue: 0,
      avgCutEligibility: 0,
      avgCoverageTrust: 0,
      avgTextCoverage: 0,
      avgObjectCount: 0,
      avgFaceCount: 0,
      avgNegativeSpace: { top: 0, right: 0, bottom: 0, left: 0 },
      preferredOverlayRegion: 'unknown',
      screenAwarePlacementTrust: 'unavailable',
      visualExplainability: 'unknown',
      reasons: ['no-vjepa-segments'],
      missingEvidence: ['vjepa-segments'],
    };
  }

  const evidence = visualSegments.map(segment => segmentEvidence(segment, rawFootage));
  const avgCoverageTrust = durationWeightedAverage(visualSegments, (_, index) => evidence[index]?.coverageTrust ?? 0);
  const avgViewerValue = durationWeightedAverage(visualSegments, (_, index) => evidence[index]?.viewerValue ?? 0);
  const avgCutEligibility = durationWeightedAverage(visualSegments, (_, index) => evidence[index]?.cutEligibility ?? 0);
  const avgTextCoverage = durationWeightedAverage(visualSegments, segment => segment.textCoverage);
  const avgObjectCount = durationWeightedAverage(visualSegments, segment => segment.objectCount);
  const avgFaceCount = durationWeightedAverage(visualSegments, segment => segment.faceCount);
  const negativeSpace = averageNegativeSpace(visualSegments);
  const preferredOverlayRegion = preferredRegionFromNegativeSpace(negativeSpace);
  const subjectPresenceRatio = durationWeightedRatio(visualSegments, hasSubjectPresence);
  const facePresenceRatio = durationWeightedRatio(visualSegments, segment => segment.faceCount > 0 || segment.eyeContact === true);
  const textPresenceRatio = durationWeightedRatio(visualSegments, segment => segment.textCoverage >= 0.08 || segment.textBoxCount > 0);
  const motionPresenceRatio = durationWeightedRatio(visualSegments, segment => segment.motionIntensity >= 0.28 || segment.motionType !== 'static');
  const screenClutterRatio = durationWeightedRatio(visualSegments, segment => segment.textCoverage >= 0.18 || segment.objectCount >= 4);
  const dominantActionType = dominantDurationValue(visualSegments, segment => segment.actionType);
  const dominantMotionType = dominantDurationValue(visualSegments, segment => segment.motionType);
  const demoRatio = durationWeightedRatio(visualSegments, segment => (
    segment.actionType === 'demonstrating' || segment.actionType === 'interacting_with_object' || segment.actionType === 'writing'
  ));
  const actionRatio = durationWeightedRatio(visualSegments, segment => (
    segment.actionType === 'walking' || segment.actionType === 'eating' || segment.actionType === 'gesturing'
  ));
  const primaryVisualMode = classifyPrimaryVisualMode({
    dominantActionType,
    textPresenceRatio,
    avgTextCoverage,
    demoRatio,
    facePresenceRatio,
    motionPresenceRatio,
    actionRatio,
    avgViewerValue,
  });
  const missingEvidence = uniqueStrings(evidence.flatMap(item => item.missingEvidence));
  const screenAwarePlacementTrust = avgCoverageTrust >= 0.78
    && !missingEvidence.includes('negative-space')
    && !missingEvidence.includes('main-subject')
    ? 'trusted'
    : 'degraded';
  const visualExplainability = resolveVisualExplainability({
    textPresenceRatio,
    demoRatio,
    avgObjectCount,
    avgViewerValue,
    facePresenceRatio,
  });

  return {
    version: 1,
    source: 'vjepa',
    calibrationStatus: 'invented-threshold',
    status: 'available',
    segmentCount: visualSegments.length,
    durationMs: Math.round(totalSegmentDuration(visualSegments)),
    speechCoverage,
    primaryVisualMode,
    dominantActionType,
    dominantMotionType,
    subjectPresenceRatio,
    facePresenceRatio,
    textPresenceRatio,
    motionPresenceRatio,
    screenClutterRatio,
    avgViewerValue,
    avgCutEligibility,
    avgCoverageTrust,
    avgTextCoverage,
    avgObjectCount,
    avgFaceCount,
    avgNegativeSpace: negativeSpace,
    preferredOverlayRegion,
    screenAwarePlacementTrust,
    visualExplainability,
    reasons: [
      `primary:${primaryVisualMode}`,
      `placement:${screenAwarePlacementTrust}`,
      `preferred-region:${preferredOverlayRegion}`,
      `visual-explainability:${visualExplainability}`,
    ],
    missingEvidence,
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
  rawFootage: RawFootageAnalysis,
): VjepaSegmentResult | null {
  let strongest: VjepaSegmentResult | null = null;
  let strongestScore = 0;
  for (const segment of visualSegments) {
    if (!rangesOverlap(startMs, endMs, segment.startMs, segment.endMs)) continue;
    const score = visualImportanceScore(segment, rawFootage, startMs, endMs);
    if (score > strongestScore) {
      strongest = segment;
      strongestScore = score;
    }
  }
  return strongest;
}

function visualProtectionReasons(segment: VjepaSegmentResult, evidence: VisualEvidenceScore): string[] {
  const reasons: string[] = [];
  const shouldProtect = (
    evidence.viewerValue >= PROTECT_VIEWER_VALUE ||
    evidence.speechLock >= PROTECT_SPEECH_LOCK ||
    evidence.brollUsefulness >= PROTECT_BROLL_USEFULNESS ||
    evidence.visualContinuityRisk >= PROTECT_CONTINUITY_RISK
  );
  if (!shouldProtect) return reasons;

  if (evidence.viewerValue >= PROTECT_VIEWER_VALUE || segment.visualSignificance >= 0.45) reasons.push('high-visual-significance');
  if (evidence.visualContinuityRisk >= PROTECT_CONTINUITY_RISK || segment.motionIntensity >= 0.45) reasons.push('high-motion');
  if (segment.textCoverage >= 0.08 || segment.textBoxCount > 0) reasons.push('visible-text');
  if (segment.faceCount > 0 || segment.eyeContact === true) reasons.push('face-or-eye-contact');
  if (segment.objectCount >= 2) reasons.push('multiple-objects');
  if (['demonstrating', 'interacting_with_object', 'walking', 'gesturing', 'writing'].includes(segment.actionType)) {
    reasons.push(`action-${segment.actionType}`);
  }
  if (evidence.speechLock >= PROTECT_SPEECH_LOCK) reasons.push('speech-locked');
  if (evidence.brollUsefulness >= PROTECT_BROLL_USEFULNESS) reasons.push('useful-broll');
  return reasons;
}

function isVisualDeadAir(segment: VjepaSegmentResult, evidence: VisualEvidenceScore): boolean {
  const durationMs = segment.endMs - segment.startMs;
  return (
    durationMs >= MIN_VISUAL_DEAD_AIR_MS &&
    evidence.cutEligibility >= VISUAL_DEAD_AIR_CUT_ELIGIBILITY &&
    evidence.viewerValue <= VISUAL_DEAD_AIR_MAX_VIEWER_VALUE &&
    evidence.speechLock <= VISUAL_DEAD_AIR_MAX_SPEECH_LOCK &&
    evidence.brollUsefulness <= VISUAL_DEAD_AIR_MAX_BROLL &&
    evidence.boundaryReadiness <= VISUAL_DEAD_AIR_MAX_BOUNDARY_READINESS
  );
}

function visualDeadAirReasons(segment: VjepaSegmentResult, evidence: VisualEvidenceScore): string[] {
  const reasons = ['low-visual-significance', 'low-motion'];
  if (segment.actionType === 'still') reasons.push('still-action');
  if (segment.objectCount <= 1) reasons.push('low-object-presence');
  if (segment.faceCount <= 0) reasons.push('no-face');
  if (segment.textCoverage < 0.03) reasons.push('low-text-coverage');
  if (evidence.coverageTrust < 0.6) reasons.push('low-vjepa-coverage');
  return reasons;
}

function visualBoundaryReasons(evidence: VisualBoundaryEvidenceScore): PacingSplitBoundaryReason[] {
  if (
    evidence.boundaryStrength < VISUAL_BOUNDARY_STRENGTH ||
    evidence.cutEligibility < VISUAL_BOUNDARY_CUT_ELIGIBILITY
  ) {
    return [];
  }

  const reasons: PacingSplitBoundaryReason[] = [];
  if (evidence.reasons.includes('visual-state-change')) {
    reasons.push('visual-state-change');
  }
  if (evidence.reasons.includes('motion-change')) {
    reasons.push('visual-motion-change');
  }
  if (evidence.reasons.includes('subject-or-action-change')) {
    reasons.push('visual-subject-change');
  }
  if (evidence.reasons.includes('text-state-change')) {
    reasons.push('visual-text-change');
  }
  return reasons;
}

function buildVisualDeadAirRemoval(segment: VjepaSegmentResult, reasons: string[], evidence: VisualEvidenceScore): SilenceRemovalAction {
  return {
    startMs: segment.startMs,
    endMs: segment.endMs,
    action: 'remove',
    reason: 'visual-dead-air',
    metadata: {
      kind: 'visual-cut',
      source: 'vjepa-visual-dead-air',
      calibrationStatus: 'invented-threshold',
      visualCut: visualCutMetadata('remove-visual-dead-air', segment, reasons, evidence.cutEligibility, evidence),
    },
  };
}

function buildVisualBoundarySplit(
  previous: VjepaSegmentResult,
  next: VjepaSegmentResult,
  reasons: PacingSplitBoundaryReason[],
  evidence: VisualBoundaryEvidenceScore,
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
      visualCut: visualCutMetadata('split-visual-boundary', next, reasons, evidence.cutEligibility, evidence),
    },
  };
}

function visualCutMetadata(
  decision: VisualCutDecisionType,
  segment: VjepaSegmentResult,
  reasons: string[],
  confidence = confidenceForReasons(reasons),
  evidence?: VisualEvidenceScore | VisualBoundaryEvidenceScore,
): NonNullable<NonNullable<SilenceRemovalAction['metadata']>['visualCut']> {
  return {
    decision,
    confidence: round01(confidence),
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
    ...(evidence && { evidence: summarizeEvidence(evidence) }),
  };
}

function buildDecision(
  type: VisualCutDecisionType,
  startMs: number,
  endMs: number,
  visual: VjepaSegmentResult,
  reasons: string[],
  affectedAction?: SilenceRemovalAction,
  evidence?: VisualEvidenceScore | VisualBoundaryEvidenceScore,
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
    ...(evidence && { evidence: summarizeEvidence(evidence) }),
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

function classifyPrimaryVisualMode(input: {
  dominantActionType: VjepaSegmentResult['actionType'] | null;
  textPresenceRatio: number;
  avgTextCoverage: number;
  demoRatio: number;
  facePresenceRatio: number;
  motionPresenceRatio: number;
  actionRatio: number;
  avgViewerValue: number;
}): VisualPerceptionSummary['primaryVisualMode'] {
  if (input.textPresenceRatio >= 0.42 || input.avgTextCoverage >= 0.12) return 'screen-text';
  if (input.demoRatio >= 0.3) return 'demonstration';
  if (input.facePresenceRatio >= 0.45 && (input.dominantActionType === 'talking' || input.dominantActionType === 'gesturing')) return 'talking-head';
  if (input.actionRatio >= 0.35 || input.motionPresenceRatio >= 0.55) return 'action-broll';
  if (input.avgViewerValue <= 0.26 && input.motionPresenceRatio <= 0.22) return 'static-low-value';
  return 'mixed';
}

function resolveVisualExplainability(input: {
  textPresenceRatio: number;
  demoRatio: number;
  avgObjectCount: number;
  avgViewerValue: number;
  facePresenceRatio: number;
}): VisualPerceptionSummary['visualExplainability'] {
  if (input.textPresenceRatio >= 0.35 || input.demoRatio >= 0.3 || input.avgObjectCount >= 2.2) return 'high';
  if (input.avgViewerValue >= 0.38 || input.facePresenceRatio >= 0.3) return 'medium';
  return 'low';
}

function averageNegativeSpace(segments: VjepaSegmentResult[]): VisualPerceptionSummary['avgNegativeSpace'] {
  return {
    top: durationWeightedAverage(segments, segment => segment.negativeSpaceTop),
    right: durationWeightedAverage(segments, segment => segment.negativeSpaceRight),
    bottom: durationWeightedAverage(segments, segment => segment.negativeSpaceBottom),
    left: durationWeightedAverage(segments, segment => segment.negativeSpaceLeft),
  };
}

function preferredRegionFromNegativeSpace(
  negativeSpace: VisualPerceptionSummary['avgNegativeSpace'],
): VisualPerceptionSummary['preferredOverlayRegion'] {
  const entries = [
    ['top', negativeSpace.top],
    ['right', negativeSpace.right],
    ['bottom', negativeSpace.bottom],
    ['left', negativeSpace.left],
  ] as Array<[VisualPerceptionSummary['preferredOverlayRegion'], number]>;
  const best = entries.reduce((winner, entry) => entry[1] > winner[1] ? entry : winner, entries[0]);
  return best[1] > 0 ? best[0] : 'unknown';
}

function hasSubjectPresence(segment: VjepaSegmentResult): boolean {
  return (segment.mainSubject?.confidence ?? 0) >= 0.35
    || segment.mainSubjectWidth * segment.mainSubjectHeight >= 0.04
    || segment.faceCount > 0
    || segment.objectCount > 0;
}

function durationWeightedRatio(segments: VjepaSegmentResult[], predicate: (segment: VjepaSegmentResult) => boolean): number {
  const durationMs = totalSegmentDuration(segments);
  if (durationMs <= 0) return 0;
  const matchingMs = segments.reduce((sum, segment) => sum + (predicate(segment) ? segmentDuration(segment) : 0), 0);
  return round01(matchingMs / durationMs);
}

function durationWeightedAverage(segments: VjepaSegmentResult[], value: (segment: VjepaSegmentResult, index: number) => number): number {
  const durationMs = totalSegmentDuration(segments);
  if (durationMs <= 0) return 0;
  const weighted = segments.reduce((sum, segment, index) => sum + clampFinite(value(segment, index)) * segmentDuration(segment), 0);
  return roundMetric(weighted / durationMs);
}

function dominantDurationValue<T extends string>(segments: VjepaSegmentResult[], value: (segment: VjepaSegmentResult) => T): T | null {
  const totals = new Map<T, number>();
  for (const segment of segments) {
    const key = value(segment);
    totals.set(key, (totals.get(key) ?? 0) + segmentDuration(segment));
  }
  let best: T | null = null;
  let bestDuration = 0;
  for (const [key, duration] of totals) {
    if (duration > bestDuration) {
      best = key;
      bestDuration = duration;
    }
  }
  return best;
}

function totalSegmentDuration(segments: VjepaSegmentResult[]): number {
  return segments.reduce((sum, segment) => sum + segmentDuration(segment), 0);
}

function segmentDuration(segment: VjepaSegmentResult): number {
  return Math.max(0, segment.endMs - segment.startMs);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}
function visualImportanceScore(
  segment: VjepaSegmentResult,
  rawFootage: RawFootageAnalysis,
  startMs: number,
  endMs: number,
): number {
  const evidence = segmentEvidence(segment, rawFootage, startMs, endMs);
  return Math.max(
    evidence.viewerValue,
    evidence.speechLock,
    evidence.brollUsefulness,
    evidence.visualContinuityRisk,
  );
}

function segmentEvidence(
  segment: VjepaSegmentResult,
  rawFootage: RawFootageAnalysis,
  startMs = segment.startMs,
  endMs = segment.endMs,
): VisualEvidenceScore {
  return scoreVisualSegmentEvidence(segment, {
    speechOverlapRatio: rangeSpeechOverlapRatio(rawFootage, startMs, endMs),
  });
}

function summarizeEvidence(evidence: VisualEvidenceScore | VisualBoundaryEvidenceScore): VisualCutEvidenceSummary {
  if ('boundaryStrength' in evidence) {
    return {
      coverageTrust: evidence.coverageTrust,
      boundaryStrength: evidence.boundaryStrength,
      continuityRisk: evidence.continuityRisk,
      cutEligibility: evidence.cutEligibility,
      missingEvidence: evidence.missingEvidence,
    };
  }

  return {
    coverageTrust: evidence.coverageTrust,
    viewerValue: evidence.viewerValue,
    speechLock: evidence.speechLock,
    boundaryReadiness: evidence.boundaryReadiness,
    visualContinuityRisk: evidence.visualContinuityRisk,
    artifactRisk: evidence.artifactRisk,
    brollUsefulness: evidence.brollUsefulness,
    cutEligibility: evidence.cutEligibility,
    missingEvidence: evidence.missingEvidence,
  };
}

function confidenceForReasons(reasons: string[]): number {
  return round01(Math.min(0.95, 0.58 + reasons.length * 0.08));
}

function rangeHasSpeech(rawFootage: RawFootageAnalysis, startMs: number, endMs: number): boolean {
  const words = rawFootage.transcription?.words ?? [];
  return words.some(word => rangesOverlap(startMs, endMs, word.startMs, word.endMs));
}

function rangeSpeechOverlapRatio(rawFootage: RawFootageAnalysis, startMs: number, endMs: number): number {
  const durationMs = Math.max(1, endMs - startMs);
  const words = rawFootage.transcription?.words ?? [];
  const overlapMs = words.reduce((total, word) => {
    const overlap = Math.max(0, Math.min(endMs, word.endMs) - Math.max(startMs, word.startMs));
    return total + overlap;
  }, 0);
  return clamp01(overlapMs / durationMs);
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
