import type { VjepaSegmentResult } from './vjepa-service';

export type VisualEvidenceCalibrationStatus = 'invented-threshold';

export interface VisualArtifactEvidence {
  startMs: number;
  endMs: number;
  severity?: number;
  description?: string;
  source?: string;
}

export interface VisualEvidenceContext {
  speechOverlapRatio?: number;
  speechEnergy?: number;
  narrativePressure?: number;
  assetRole?: 'hero' | 'b-roll' | 'transition-fill' | string | null;
  isAiGenerated?: boolean | null;
  artifactRanges?: VisualArtifactEvidence[];
}

export interface VisualEvidenceScore {
  version: 1;
  calibrationStatus: VisualEvidenceCalibrationStatus;
  startMs: number;
  endMs: number;
  coverageTrust: number;
  viewerValue: number;
  speechLock: number;
  boundaryReadiness: number;
  visualContinuityRisk: number;
  artifactRisk: number;
  brollUsefulness: number;
  cutEligibility: number;
  reasons: string[];
  missingEvidence: string[];
}

export interface VisualBoundaryEvidenceScore {
  version: 1;
  calibrationStatus: VisualEvidenceCalibrationStatus;
  atMs: number;
  coverageTrust: number;
  boundaryStrength: number;
  continuityRisk: number;
  cutEligibility: number;
  reasons: string[];
  missingEvidence: string[];
}

const ACTION_ACTIVITY: Record<VjepaSegmentResult['actionType'], number> = {
  still: 0.02,
  other: 0.08,
  talking: 0.22,
  gesturing: 0.5,
  walking: 0.56,
  eating: 0.46,
  writing: 0.62,
  demonstrating: 0.76,
  interacting_with_object: 0.78,
};

const MOTION_ACTIVITY: Record<VjepaSegmentResult['motionType'], number> = {
  static: 0.02,
  subject_moving: 0.42,
  camera_moving: 0.32,
  both: 0.62,
};

export function scoreVisualSegmentEvidence(
  segment: VjepaSegmentResult,
  context: VisualEvidenceContext = {},
): VisualEvidenceScore {
  const coverageTrust = scorePrimitiveCoverage(segment);
  const missingEvidence = missingPrimitiveEvidence(segment);
  if (context.speechOverlapRatio === undefined) missingEvidence.push('speech-overlap');
  if (context.isAiGenerated === true && !context.artifactRanges?.length) missingEvidence.push('artifact-ranges');

  const speechOverlapRatio = clamp01(context.speechOverlapRatio ?? 0);
  const narrativePressure = clamp01(context.narrativePressure ?? 0);
  const subjectPresence = scoreSubjectPresence(segment);
  const textValue = scoreTextValue(segment);
  const actionValue = ACTION_ACTIVITY[segment.actionType] ?? 0.08;
  const motionValue = Math.max(clamp01(segment.motionIntensity), MOTION_ACTIVITY[segment.motionType] ?? 0);
  const visualSignificance = clamp01(segment.visualSignificance);
  const artifactRisk = scoreArtifactRisk(segment, context.artifactRanges);

  const viewerValue = round01(clamp01(
    visualSignificance * 0.28 +
    motionValue * 0.16 +
    actionValue * 0.18 +
    subjectPresence * 0.16 +
    textValue * 0.14 +
    narrativePressure * 0.08,
  ));

  const onCameraSpeechEvidence = Math.max(
    segment.actionType === 'talking' ? 0.55 : 0,
    segment.faceCount > 0 ? 0.45 : 0,
    segment.eyeContact === true ? 0.34 : 0,
  );
  const speechLock = round01(clamp01(
    speechOverlapRatio * (0.55 + onCameraSpeechEvidence * 0.35) +
    Math.min(onCameraSpeechEvidence, 0.32) +
    clamp01(context.speechEnergy ?? 0) * 0.08,
  ));

  const visualContinuityRisk = round01(clamp01(
    motionValue * 0.25 +
    subjectPresence * 0.18 +
    textValue * 0.18 +
    visualSignificance * 0.16 +
    edgeSubjectRisk(segment) * 0.12 +
    speechLock * 0.11,
  ));

  const brollRoleBoost = context.assetRole === 'b-roll' || context.assetRole === 'transition-fill' ? 0.14 : 0;
  const brollUsefulness = round01(clamp01(
    viewerValue * (1 - speechLock * 0.72) +
    actionValue * 0.15 +
    textValue * 0.1 +
    brollRoleBoost,
  ));

  const boundaryReadiness = round01(clamp01(
    visualSignificance * 0.3 +
    motionValue * 0.26 +
    textValue * 0.16 +
    actionValue * 0.12 +
    (1 - speechLock) * 0.16,
  ));

  const protectNeed = Math.max(viewerValue, speechLock, brollUsefulness, artifactRisk * 0.7);
  const cutEligibility = round01(clamp01(
    (1 - protectNeed) *
    (1 - visualContinuityRisk * 0.55) *
    coverageTrust,
  ));

  return {
    version: 1,
    calibrationStatus: 'invented-threshold',
    startMs: segment.startMs,
    endMs: segment.endMs,
    coverageTrust,
    viewerValue,
    speechLock,
    boundaryReadiness,
    visualContinuityRisk,
    artifactRisk,
    brollUsefulness,
    cutEligibility,
    reasons: visualSegmentReasons({
      viewerValue,
      speechLock,
      boundaryReadiness,
      visualContinuityRisk,
      artifactRisk,
      brollUsefulness,
      cutEligibility,
      segment,
    }),
    missingEvidence,
  };
}

export function scoreVisualBoundaryEvidence(
  previous: VjepaSegmentResult,
  next: VjepaSegmentResult,
): VisualBoundaryEvidenceScore {
  const previousTrust = scorePrimitiveCoverage(previous);
  const nextTrust = scorePrimitiveCoverage(next);
  const coverageTrust = round01((previousTrust + nextTrust) / 2);
  const missingEvidence = unique([
    ...missingPrimitiveEvidence(previous).map(item => `previous-${item}`),
    ...missingPrimitiveEvidence(next).map(item => `next-${item}`),
  ]);

  const subjectShift = normalizedSubjectShift(previous, next);
  const motionVectorShift = normalizedVectorShift(
    previous.motionVectorX,
    previous.motionVectorY,
    next.motionVectorX,
    next.motionVectorY,
  );
  const textDelta = clamp01(Math.abs(clamp01(next.textCoverage) - clamp01(previous.textCoverage)) + Math.abs(next.textBoxCount - previous.textBoxCount) * 0.08);
  const countDelta = clamp01(Math.abs(next.objectCount - previous.objectCount) * 0.18 + Math.abs(next.faceCount - previous.faceCount) * 0.24);
  const actionShift = previous.actionType === next.actionType ? 0 : 0.45;
  const motionTypeShift = previous.motionType === next.motionType ? 0 : 0.32;
  const significanceDelta = Math.abs(clamp01(next.visualSignificance) - clamp01(previous.visualSignificance));
  const motionDelta = Math.abs(clamp01(next.motionIntensity) - clamp01(previous.motionIntensity));

  const boundaryStrength = round01(clamp01(
    significanceDelta * 0.2 +
    motionDelta * 0.18 +
    subjectShift * 0.18 +
    motionVectorShift * 0.14 +
    textDelta * 0.12 +
    countDelta * 0.1 +
    actionShift * 0.05 +
    motionTypeShift * 0.03,
  ));

  const continuityRisk = round01(clamp01(
    subjectShift * 0.24 +
    motionVectorShift * 0.2 +
    Math.max(previous.motionIntensity, next.motionIntensity) * 0.16 +
    Math.max(previous.textCoverage, next.textCoverage) * 0.12 +
    actionShift * 0.1 +
    countDelta * 0.08 +
    (1 - coverageTrust) * 0.1,
  ));

  return {
    version: 1,
    calibrationStatus: 'invented-threshold',
    atMs: next.startMs,
    coverageTrust,
    boundaryStrength,
    continuityRisk,
    cutEligibility: round01(clamp01(boundaryStrength * coverageTrust * (1 - continuityRisk * 0.35))),
    reasons: visualBoundaryReasons({
      boundaryStrength,
      continuityRisk,
      significanceDelta,
      motionDelta,
      subjectShift,
      motionVectorShift,
      textDelta,
      countDelta,
      actionShift,
      motionTypeShift,
    }),
    missingEvidence,
  };
}

function scorePrimitiveCoverage(segment: VjepaSegmentResult): number {
  const presence = segment.primitivePresence;
  if (!presence) return 0.48;

  const checks = [
    presence.motionVector,
    presence.mainSubject,
    presence.textBoxes,
    presence.textCoverage,
    presence.objectCount,
    presence.faceCount,
    presence.negativeSpace,
  ];
  const presentCount = checks.filter(Boolean).length;
  return round01(clamp01(0.22 + (presentCount / checks.length) * 0.78));
}

function missingPrimitiveEvidence(segment: VjepaSegmentResult): string[] {
  const presence = segment.primitivePresence;
  if (!presence) {
    return ['primitive-presence'];
  }

  const missing: string[] = [];
  if (!presence.motionVector) missing.push('motion-vector');
  if (!presence.mainSubject) missing.push('main-subject');
  if (!presence.textBoxes) missing.push('text-boxes');
  if (!presence.textCoverage) missing.push('text-coverage');
  if (!presence.objectCount) missing.push('object-count');
  if (!presence.faceCount) missing.push('face-count');
  if (!presence.negativeSpace) missing.push('negative-space');
  return missing;
}

function scoreSubjectPresence(segment: VjepaSegmentResult): number {
  return clamp01(Math.max(
    segment.mainSubject?.confidence ?? 0,
    segment.faceCount > 0 ? 0.78 : 0,
    segment.objectCount > 0 ? Math.min(0.72, segment.objectCount * 0.18) : 0,
    segment.mainSubjectWidth > 0 && segment.mainSubjectHeight > 0 ? 0.42 : 0,
  ));
}

function scoreTextValue(segment: VjepaSegmentResult): number {
  return clamp01(Math.max(
    segment.textCoverage * 2.4,
    segment.textBoxCount > 0 ? Math.min(0.74, 0.22 + segment.textBoxCount * 0.14) : 0,
  ));
}

function scoreArtifactRisk(segment: VjepaSegmentResult, artifactRanges: VisualArtifactEvidence[] | undefined): number {
  let risk = 0;
  for (const artifact of artifactRanges ?? []) {
    const overlap = rangeOverlapRatio(segment.startMs, segment.endMs, artifact.startMs, artifact.endMs);
    if (overlap <= 0) continue;
    risk = Math.max(risk, overlap * clamp01(artifact.severity ?? 0.65));
  }
  return round01(risk);
}

function edgeSubjectRisk(segment: VjepaSegmentResult): number {
  const width = clamp01(segment.mainSubjectWidth || segment.mainSubject?.width || 0);
  const height = clamp01(segment.mainSubjectHeight || segment.mainSubject?.height || 0);
  const x = clamp01(segment.mainSubjectX || segment.mainSubject?.x || 0);
  const y = clamp01(segment.mainSubjectY || segment.mainSubject?.y || 0);
  if (width <= 0 || height <= 0) return 0;

  const left = x;
  const right = 1 - (x + width);
  const top = y;
  const bottom = 1 - (y + height);
  return clamp01(0.2 - Math.min(left, right, top, bottom)) * 5;
}

function normalizedSubjectShift(previous: VjepaSegmentResult, next: VjepaSegmentResult): number {
  const previousCenter = subjectCenter(previous);
  const nextCenter = subjectCenter(next);
  if (!previousCenter || !nextCenter) {
    return Math.abs(next.faceCount - previous.faceCount) > 0 || Math.abs(next.objectCount - previous.objectCount) > 1 ? 0.45 : 0;
  }

  const dx = nextCenter.x - previousCenter.x;
  const dy = nextCenter.y - previousCenter.y;
  return clamp01(Math.sqrt(dx * dx + dy * dy) / 0.8);
}

function subjectCenter(segment: VjepaSegmentResult): { x: number; y: number } | null {
  const width = segment.mainSubjectWidth || segment.mainSubject?.width || 0;
  const height = segment.mainSubjectHeight || segment.mainSubject?.height || 0;
  const x = segment.mainSubjectX || segment.mainSubject?.x || 0;
  const y = segment.mainSubjectY || segment.mainSubject?.y || 0;
  if (width <= 0 || height <= 0) return null;
  return {
    x: clamp01(x + width / 2),
    y: clamp01(y + height / 2),
  };
}

function normalizedVectorShift(
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number,
): number {
  const dx = clampSigned(nextX) - clampSigned(previousX);
  const dy = clampSigned(nextY) - clampSigned(previousY);
  return clamp01(Math.sqrt(dx * dx + dy * dy) / 2);
}

function visualSegmentReasons(input: {
  viewerValue: number;
  speechLock: number;
  boundaryReadiness: number;
  visualContinuityRisk: number;
  artifactRisk: number;
  brollUsefulness: number;
  cutEligibility: number;
  segment: VjepaSegmentResult;
}): string[] {
  const reasons: string[] = [];
  if (input.viewerValue >= 0.62) reasons.push('high-viewer-value');
  if (input.speechLock >= 0.58) reasons.push('speech-locked');
  if (input.brollUsefulness >= 0.48) reasons.push('useful-broll');
  if (input.boundaryReadiness >= 0.52) reasons.push('boundary-ready');
  if (input.visualContinuityRisk >= 0.52) reasons.push('continuity-risk');
  if (input.artifactRisk >= 0.45) reasons.push('artifact-risk');
  if (input.cutEligibility >= 0.46) reasons.push('cut-eligible');
  if (input.segment.textBoxCount > 0 || input.segment.textCoverage > 0.08) reasons.push('visible-text');
  if (input.segment.faceCount > 0 || input.segment.eyeContact === true) reasons.push('face-or-eye-contact');
  if (!reasons.length) reasons.push('low-evidence');
  return unique(reasons);
}

function visualBoundaryReasons(input: {
  boundaryStrength: number;
  continuityRisk: number;
  significanceDelta: number;
  motionDelta: number;
  subjectShift: number;
  motionVectorShift: number;
  textDelta: number;
  countDelta: number;
  actionShift: number;
  motionTypeShift: number;
}): string[] {
  const reasons: string[] = [];
  if (input.boundaryStrength >= 0.46) reasons.push('strong-boundary');
  if (input.continuityRisk >= 0.48) reasons.push('continuity-risk');
  if (input.significanceDelta >= 0.36) reasons.push('visual-state-change');
  if (input.motionDelta >= 0.34 || input.motionVectorShift >= 0.28 || input.motionTypeShift > 0) reasons.push('motion-change');
  if (input.subjectShift >= 0.26 || input.countDelta >= 0.32 || input.actionShift > 0) reasons.push('subject-or-action-change');
  if (input.textDelta >= 0.22) reasons.push('text-state-change');
  if (!reasons.length) reasons.push('weak-boundary');
  return unique(reasons);
}

function rangeOverlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  const duration = Math.max(1, aEnd - aStart);
  return clamp01(overlap / duration);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round01(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}
