import type {
  EditDecision as ReactiveEditDecision,
  EditDecisionList as ReactiveEditDecisionList,
} from './reactive-edit-engine';
import { enrichDecisionsWithOverlayTimelineMemory } from './overlay-timeline-memory';
import { resolveSemanticMgLedgerGate } from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';
import { normalizeMotionGraphicContent } from './mg-content-atoms';
import { applyCrossOverlayChoreography, type CrossOverlayChoreographyReport } from './cross-overlay-choreography';

type LegacyCompatibleDecisionType = ReactiveEditDecision['type'] | 'slow-motion' | 'filter';

type CompatibleEditDecision = Omit<Partial<ReactiveEditDecision>, 'type' | 'params'> & {
  type: LegacyCompatibleDecisionType;
  frame: number;
  confidence?: number;
  source?: string;
  signal?: string;
  technique?: string;
  reason?: string;
  params?: Record<string, unknown>;
};

type CompatibleEditDecisionList = Partial<Omit<ReactiveEditDecisionList, 'decisions' | 'stats'>> & {
  decisions: CompatibleEditDecision[];
  stats?: Partial<ReactiveEditDecisionList['stats']>;
  metadata?: Record<string, unknown>;
};

export type UnifiedDecisionBundleSource =
  | 'creative-brief'
  | 'signal-driven'
  | 'creative-brief+signal-driven';

export type UnifiedDecisionCandidateProducer = Exclude<UnifiedDecisionBundleSource, 'creative-brief+signal-driven'>;
export type UnifiedDecisionExecutableProducer = UnifiedDecisionCandidateProducer | 'unified-planner';

export type UnifiedDecisionExecutionMode =
  | 'creative-brief-primary'
  | 'signal-primary'
  | 'merged-supplemental'
  | 'unified-planner';

export interface UnifiedDecisionBundleAuthority {
  version: 'unified-decision-authority-v1';
  executableProducer: UnifiedDecisionExecutableProducer;
  advisoryProducers: UnifiedDecisionCandidateProducer[];
  signalDecisionRole: 'none' | 'primary' | 'advisor' | 'co-owner';
  signalDecisionsCanAddExecutable: boolean;
  decisionMode: UnifiedDecisionExecutionMode;
  creativeBriefRole?: 'semantic-context';
  signalRole?: 'candidate-source';
}

export interface UnifiedSignalDecisionEvidence {
  type: ReactiveEditDecision['type'];
  family: UnifiedSignalDecisionFamily;
  outcome: UnifiedSignalDecisionOutcome;
  candidate: UnifiedSignalExecutionCandidate;
  frame: number;
  durationFrames?: number;
  confidence: number;
  source: string;
  signal: string;
  reason: string;
  params?: Record<string, string | number | boolean>;
}

export type UnifiedSignalDecisionFamily =
  | 'audio'
  | 'camera'
  | 'caption'
  | 'graphic'
  | 'pacing'
  | 'timing'
  | 'transition'
  | 'unknown';

export type UnifiedSignalDecisionOutcome =
  | 'added-executable'
  | 'evidence-only'
  | 'signal-primary'
  | 'validated-primary';

export type UnifiedSignalDecisionRole =
  | 'audio-emphasis'
  | 'camera-motion'
  | 'caption-emphasis'
  | 'graphic-expression'
  | 'pacing-control'
  | 'timing-modulation'
  | 'transition-boundary'
  | 'unknown';

export type UnifiedSignalTimingAnchorKind = 'boundary' | 'moment' | 'span';

export interface UnifiedSignalExecutionCandidate {
  version: 'signal-execution-candidate-v1';
  family: UnifiedSignalDecisionFamily;
  job: UnifiedSignalDecisionRole;
  role: UnifiedSignalDecisionRole;
  source: string;
  signal: string;
  confidence: number;
  momentImportance: number;
  timingAnchor: {
    kind: UnifiedSignalTimingAnchorKind;
    frame: number;
    durationFrames: number;
  };
  evidenceStrength: number;
  completeness: number;
  physicalFormReadiness: number;
  risk: number;
  riskFlags: string[];
  projectedAtoms: Record<string, string | number | boolean>;
  sourcePacket: {
    hasSignals: boolean;
    signalKeys: string[];
    hasVisualSetupSignals: boolean;
    visualSetupSignalKeys: string[];
    hasAtomicMomentBundle: boolean;
    hasUnifiedMomentEvidence: boolean;
  };
  calibrationStatus: 'invented-needs-calibration';
}

export type UnifiedPlannerCandidateAuthority =
  | 'legacy-compatibility'
  | 'semantic-context'
  | 'signal-evidence';

export interface UnifiedPlannerCandidateLicense {
  executable: boolean;
  reason: string;
  stage: 'primary-license' | 'signal-preflight-license';
  preliminary: boolean;
}

export interface UnifiedPlannerCandidate {
  version: 'unified-planner-candidate-v1';
  producer: UnifiedDecisionCandidateProducer;
  sourceAuthority: UnifiedPlannerCandidateAuthority;
  type: ReactiveEditDecision['type'];
  family: UnifiedSignalDecisionFamily;
  role: UnifiedSignalDecisionRole;
  frame: number;
  durationFrames: number;
  source: string;
  signal: string;
  confidence: number;
  momentImportance: number;
  evidenceStrength: number;
  completeness: number;
  physicalFormReadiness: number;
  risk: number;
  riskFlags: string[];
  score: number;
  outcome: 'executable-candidate' | 'evidence-only-candidate';
  license: UnifiedPlannerCandidateLicense;
  normalizedSignal: UnifiedSignalExecutionCandidate;
}

interface UnifiedTransitionBoundaryPlan {
  version: 'transition-boundary-plan-v1';
  family: 'transition';
  source: 'signal-family-planner';
  visualTransitionAllowed: boolean;
  reasonKeys: string[];
  atoms: Record<string, string | number | boolean>;
  jobVector: {
    continuity: number;
    turn: number;
    impact: number;
    motionTransfer: number;
    jumpHide: number;
    attentionReset: number;
    contrastReveal: number;
    audioBridge: number;
    silence: number;
  };
  physicalFormInputs: {
    boundaryConfidence: number;
    rawToCutConfidence: number;
    directionX: number;
    directionY: number;
    directionMagnitude: number;
    durationPressure: number;
    opacityPressure: number;
    motionPressure: number;
    blurPressure: number;
    smearPressure: number;
    exposurePressure: number;
    sfxEligibility: number;
    zoomBridgeNeed: number;
    screenSafetyPressure: number;
    repetitionPressure: number;
  };
  crossFamily: {
    sfxAllowed: boolean;
    zoomBridgeAllowed: boolean;
    captionConflictRisk: number;
    mgConflictRisk: number;
  };
  evidence: {
    directionMagnitude: number;
    intensity: number;
    visualPressure: number;
    boundaryConfidence: number;
    rawToCutConfidence: number;
    vjepaCoverageQuality: number;
  };
  calibrationStatus: 'invented-needs-calibration';
}

interface UnifiedZoomMotionPlan {
  version: 'zoom-motion-plan-v1';
  family: 'zoom';
  source: 'signal-family-planner';
  visualMotionAllowed: boolean;
  reasonKeys: string[];
  atoms: Record<string, string | number | boolean>;
  jobVector: {
    emphasis: number;
    intimacy: number;
    reveal: number;
    reset: number;
    drift: number;
    motionFollow: number;
    restraint: number;
  };
  subjectGeometry: {
    hasSubjectAnchor: boolean;
    anchorX: number | null;
    anchorY: number | null;
    subjectSize: number;
    offCenter: number;
    shotScale: number;
    facePresent: number;
    eyeContact: number;
    anchorConfidence: number;
  };
  motionMemory: {
    timeSinceLastZoomSec: number | null;
    recentZoomSimilarity: number;
    recentMotionSimilarity: number;
    recentZoomDensity: number;
    repeatedTargetRisk: number;
  };
  physicalFormInputs: {
    anchorConfidence: number;
    pushPressure: number;
    pullBackPressure: number;
    punchPressure: number;
    driftPressure: number;
    motionFollowPressure: number;
    cropRisk: number;
    screenSafetyPressure: number;
    repetitionPressure: number;
    sfxPairingEligibility: number;
  };
  crossFamily: {
    sfxPairingAllowed: boolean;
    captionConflictRisk: number;
    transitionConflictRisk: number;
    mgConflictRisk: number;
  };
  evidence: {
    intensity: number;
    visualPressure: number;
    hasSubjectAnchor: boolean;
    shotScale: number;
    directionMagnitude: number;
    repetitionPressure: number;
    cropRisk: number;
  };
  calibrationStatus: 'invented-needs-calibration';
}

interface UnifiedCaptionMomentPlan {
  version: 'caption-moment-plan-v1';
  family: 'caption';
  source: 'signal-family-planner';
  emphasisAllowed: boolean;
  reasonKeys: string[];
  atoms: Record<string, string | number | boolean>;
  jobVector: {
    subtitleClarity: number;
    emphasisPunch: number;
    phraseGrouping: number;
    hold: number;
    kinetic: number;
    restraint: number;
  };
  grouping: {
    speechRateWpm: number;
    phraseWordCount: number;
    readableWindowFrames: number;
    minReadableDurationFrames: number;
    durationPressure: number;
    splitPressure: number;
    lineBreakPressure: number;
  };
  readability: {
    readabilityPressure: number;
    speechPace: number;
    visualComplexity: number;
    textOnScreen: number;
    negativeSpaceBottom: number;
    safeZonePressure: number;
    contrastNeed: number;
    collisionRisk: number;
    readingSpeedRisk: number;
  };
  styleIntent: {
    subtitleMode: number;
    phraseMode: number;
    wordByWord: number;
    emphasisScale: number;
    surfaceNeed: number;
    brandFitPressure: number;
    formality: number;
  };
  crossFamily: {
    mgConflictRisk: number;
    zoomConflictRisk: number;
    transitionConflictRisk: number;
    sfxPairingAllowed: boolean;
  };
  evidence: {
    salience: number;
    readabilityPressure: number;
    speechPace: number;
    hasTextAnchor: boolean;
    phraseImpact: number;
    emphasisPunch: number;
    readingSpeedRisk: number;
    collisionRisk: number;
  };
  calibrationStatus: 'invented-needs-calibration';
}

interface UnifiedSfxSyncPlan {
  version: 'sfx-sync-plan-v1';
  family: 'audio';
  source: 'signal-family-planner';
  placementAllowed: boolean;
  reasonKeys: string[];
  atoms: Record<string, string | number | boolean>;
  jobVector: {
    impact: number;
    glue: number;
    build: number;
    texture: number;
    restraint: number;
  };
  syncWindow: {
    anchorFrame: number | null;
    requestedFrame: number;
    distanceFrames: number | null;
    toleranceFrames: number;
    exactSyncPressure: number;
    driftRisk: number;
  };
  mixSafety: {
    speechConflict: number;
    musicConflict: number;
    overlayDensity: number;
    recentSfxDensity: number;
    overmixRisk: number;
    silenceNeed: number;
  };
  providerGate: {
    providerQuality: number;
    providerConfidence: number;
    assetQualityFloor: number;
    providerRisk: number;
    externalSourceRequired: boolean;
    cachePreferred: boolean;
  };
  crossFamily: {
    transitionAnchored: boolean;
    mgAnchored: boolean;
    zoomAnchored: boolean;
    captionAnchored: boolean;
    linkedOverlay: boolean;
  };
  evidence: {
    syncConfidence: number;
    impact: number;
    restraint: number;
    transitionAnchored: boolean;
    providerQuality: number;
    overmixRisk: number;
    driftRisk: number;
    exactSyncPressure: number;
  };
  calibrationStatus: 'invented-needs-calibration';
}

export interface UnifiedSignalDecisionAuditBucket {
  count: number;
  confidence: {
    min: number;
    max: number;
    average: number;
  };
  frames: {
    first: number;
    last: number;
    samples: number[];
  };
  sources: Record<string, number>;
}

export interface UnifiedSignalDecisionAuditReport {
  version: 'signal-decision-audit-v1';
  totalCount: number;
  outcomes: Record<UnifiedSignalDecisionOutcome, number>;
  byType: Record<string, UnifiedSignalDecisionAuditBucket>;
  byFamily: Record<UnifiedSignalDecisionFamily, UnifiedSignalDecisionAuditBucket>;
  byReason: Record<string, UnifiedSignalDecisionAuditBucket>;
  candidates: UnifiedSignalExecutionCandidate[];
  samples: UnifiedSignalDecisionEvidence[];
}

export interface UnifiedDecisionBundleEvidence {
  primaryDecisionCount: number;
  signalDecisionCount: number;
  addedSignalDecisionCount: number;
  validatedDecisionCount: number;
  suppressedSignalDuplicateCount: number;
  evidenceOnlySignalDecisionCount: number;
  evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[];
  signalDecisionAudit: UnifiedSignalDecisionAuditReport;
  crossOverlayChoreography?: CrossOverlayChoreographyReport;
}

export interface UnifiedDecisionBundle {
  source: UnifiedDecisionBundleSource;
  authority: UnifiedDecisionBundleAuthority;
  edl: ReactiveEditDecisionList;
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  expectedExecuted: number;
  expectedSkipped: number;
  evidence: UnifiedDecisionBundleEvidence;
}

interface CreateUnifiedDecisionBundleOptions {
  source: UnifiedDecisionCandidateProducer;
  edl: CompatibleEditDecisionList;
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  expectedExecuted?: number;
  expectedSkipped?: number;
}

export type UnifiedDecisionProducerCandidate = CreateUnifiedDecisionBundleOptions;

interface MergeSignalDrivenBundleOptions {
  maxNearFrameWindow?: number;
}

const DEFAULT_MAX_NEAR_FRAME_WINDOW = 24;

export function createUnifiedDecisionBundle(options: CreateUnifiedDecisionBundleOptions): UnifiedDecisionBundle {
  const rawEdl = normalizeEdl(options.edl);
  const isSignalSource = options.source === 'signal-driven';
  const primaryLicensing = licensePrimaryProducerDecisions(options.source, rawEdl.decisions);
  const edl = primaryLicensing.rejectedCount > 0
    ? normalizeEdl({ ...rawEdl, decisions: primaryLicensing.decisions })
    : rawEdl;
  const enrichedEdl = isSignalSource
    ? { ...edl, decisions: enrichDecisionsWithOverlayTimelineMemory(edl.decisions, edl.decisions) }
    : edl;
  return {
    source: options.source,
    authority: authorityForSingleProducer(options.source),
    edl: enrichedEdl,
    graphicsDensity: options.graphicsDensity,
    expectedExecuted: options.expectedExecuted ?? enrichedEdl.totalDecisions,
    expectedSkipped: options.expectedSkipped ?? primaryLicensing.rejectedCount,
    evidence: {
      primaryDecisionCount: isSignalSource ? 0 : enrichedEdl.totalDecisions,
      signalDecisionCount: isSignalSource ? enrichedEdl.totalDecisions : 0,
      addedSignalDecisionCount: isSignalSource ? enrichedEdl.totalDecisions : 0,
      validatedDecisionCount: 0,
      suppressedSignalDuplicateCount: 0,
      evidenceOnlySignalDecisionCount: primaryLicensing.rejectedCount,
      evidenceOnlySignalDecisions: primaryLicensing.evidenceOnlyDecisions,
      signalDecisionAudit: primaryLicensing.signalDecisionAudit,
    },
  };
}

export function normalizeUnifiedPlannerCandidates(
  candidates: UnifiedDecisionProducerCandidate[],
): UnifiedPlannerCandidate[] {
  const normalized: UnifiedPlannerCandidate[] = [];

  for (const producerCandidate of orderProducerCandidates(candidates)) {
    const rawEdl = normalizeEdl(producerCandidate.edl);
    const decisions = cloneDecisions(rawEdl.decisions);
    const signalBudgets = producerCandidate.source === 'signal-driven'
      ? buildSignalExecutionBudgets(decisions)
      : {};

    for (const decision of decisions) {
      const normalizedSignal = normalizeSignalExecutionCandidate(decision);
      const license = resolveUnifiedPlannerCandidateLicense(
        producerCandidate.source,
        decision,
        signalBudgets,
      );
      normalized.push({
        version: 'unified-planner-candidate-v1',
        producer: producerCandidate.source,
        sourceAuthority: sourceAuthorityForPlannerCandidate(producerCandidate.source, decision),
        type: decision.type,
        family: normalizedSignal.family,
        role: normalizedSignal.role,
        frame: decision.frame,
        durationFrames: Math.max(1, decision.durationFrames ?? 1),
        source: decision.source,
        signal: decision.signal,
        confidence: normalizedSignal.confidence,
        momentImportance: normalizedSignal.momentImportance,
        evidenceStrength: normalizedSignal.evidenceStrength,
        completeness: normalizedSignal.completeness,
        physicalFormReadiness: normalizedSignal.physicalFormReadiness,
        risk: normalizedSignal.risk,
        riskFlags: normalizedSignal.riskFlags,
        score: scoreUnifiedDecision(decision, producerCandidate.source),
        outcome: license.executable ? 'executable-candidate' : 'evidence-only-candidate',
        license,
        normalizedSignal,
      });
    }
  }

  return normalized.sort((a, b) => (
    a.frame - b.frame
    || b.score - a.score
    || a.producer.localeCompare(b.producer)
    || a.type.localeCompare(b.type)
  ));
}

function resolveUnifiedPlannerCandidateLicense(
  source: UnifiedDecisionCandidateProducer,
  decision: ReactiveEditDecision,
  signalBudgets: Partial<Record<ReactiveEditDecision['type'], number>>,
): UnifiedPlannerCandidateLicense {
  if (source === 'creative-brief') {
    const license = resolvePrimaryCreativeDecisionLicense(decision, {
      requireFamilyAtoms: true,
    });
    return {
      ...license,
      stage: 'primary-license',
      preliminary: false,
    };
  }

  const license = resolveSignalExecutionLicense([], decision, signalBudgets);
  return {
    ...license,
    stage: 'signal-preflight-license',
    preliminary: true,
  };
}

function isPrimarySemanticContextDecision(decision: ReactiveEditDecision): boolean {
  return normalizeParamString(decision.params.creativeDecisionAuthority) === 'semantic-context'
    || hasAnyDirectParam(decision, ['creativeBriefSemanticCandidate', 'creativeBriefFactContract']);
}

function sourceAuthorityForPlannerCandidate(
  source: UnifiedDecisionCandidateProducer,
  decision: ReactiveEditDecision,
): UnifiedPlannerCandidateAuthority {
  if (source === 'signal-driven') return 'signal-evidence';
  const isSemanticContextGraphic = decision.type === 'graphic'
    && (normalizeParamString(decision.params.creativeDecisionAuthority) === 'semantic-context'
      || hasAnyDirectParam(decision, ['creativeBriefSemanticCandidate']));
  return isSemanticContextGraphic || isCreativeBriefFamilyCandidate(decision)
    ? 'semantic-context'
    : 'legacy-compatibility';
}

function licensePrimaryProducerDecisions(
  source: UnifiedDecisionCandidateProducer,
  decisions: ReactiveEditDecision[],
): {
  decisions: ReactiveEditDecision[];
  rejectedCount: number;
  evidenceOnlyDecisions: UnifiedSignalDecisionEvidence[];
  signalDecisionAudit: UnifiedSignalDecisionAuditReport;
} {
  if (source !== 'creative-brief') {
    return {
      decisions,
      rejectedCount: 0,
      evidenceOnlyDecisions: [],
      signalDecisionAudit: createEmptySignalDecisionAudit(),
    };
  }

  const audit = createSignalDecisionAuditBuilder(createEmptySignalDecisionAudit());
  const accepted: ReactiveEditDecision[] = [];
  const evidenceOnlyDecisions: UnifiedSignalDecisionEvidence[] = [];

  for (const decision of decisions) {
    const license = resolvePrimaryCreativeDecisionLicense(decision, {
      requireFamilyAtoms: isCreativeBriefFamilyCandidate(decision),
    });
    if (license.executable) {
      accepted.push(decision);
      continue;
    }

    const reasonPrefix = decision.type === 'graphic'
      ? 'primary-graphic-unlicensed'
      : 'primary-family-unlicensed';
    const reason = `${reasonPrefix}:${license.reason}`;
    recordSignalDecisionAudit(audit, decision, 'evidence-only', reason);
    if (evidenceOnlyDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
      evidenceOnlyDecisions.push(summarizeSignalDecisionEvidence(
        decision,
        normalizeSignalExecutionCandidate(decision),
        'evidence-only',
        reason,
      ));
    }
  }

  return {
    decisions: accepted,
    rejectedCount: decisions.length - accepted.length,
    evidenceOnlyDecisions,
    signalDecisionAudit: finalizeSignalDecisionAudit(audit),
  };
}

function resolvePrimaryCreativeDecisionLicense(
  decision: ReactiveEditDecision,
  options: { requireFamilyAtoms?: boolean } = {},
): { executable: boolean; reason: string } {
  if (decision.type !== 'graphic') {
    if (options.requireFamilyAtoms && isCreativeBriefFamilyCandidate(decision)) {
      return resolveFamilyExecutionLicense(decision);
    }
    return { executable: true, reason: 'not-primary-graphic' };
  }
  const isSemanticContextGraphic = normalizeParamString(decision.params.creativeDecisionAuthority) === 'semantic-context'
    || hasAnyDirectParam(decision, ['creativeBriefSemanticCandidate']);
  if (!isSemanticContextGraphic) return { executable: true, reason: 'legacy-primary-graphic-compatibility' };

  return resolveGraphicContentEvidenceLicense(decision);
}

function isCreativeBriefFamilyCandidate(decision: ReactiveEditDecision): boolean {
  switch (familyForSignalDecision(decision)) {
    case 'audio':
    case 'camera':
    case 'caption':
    case 'pacing':
    case 'timing':
    case 'transition':
      return true;
    default:
      return false;
  }
}
export function planUnifiedDecisionBundle(
  currentBundle: UnifiedDecisionBundle | null,
  candidate: UnifiedDecisionProducerCandidate,
  options: MergeSignalDrivenBundleOptions = {},
): UnifiedDecisionBundle {
  if (candidate.source === 'creative-brief') {
    const primaryBundle = createUnifiedDecisionBundle(candidate);
    if (!currentBundle) return primaryBundle;
    if (currentBundle.source === 'signal-driven') {
      return mergeSignalDrivenBundle(primaryBundle, currentBundle.edl, 'creative-brief', options);
    }
    throw new Error(`Unified decision planner already has primary producer: ${currentBundle.source}`);
  }

  if (!currentBundle) {
    return createUnifiedDecisionBundle(candidate);
  }

  return mergeSignalDrivenBundle(currentBundle, candidate.edl, candidate.source, options);
}

export function planUnifiedDecisionBundleFromCandidates(
  candidates: UnifiedDecisionProducerCandidate[],
  options: MergeSignalDrivenBundleOptions = {},
): UnifiedDecisionBundle | null {
  if (candidates.length === 0) return null;

  const producerSet = new Set(candidates.map((candidate) => candidate.source));
  if (producerSet.has('signal-driven')) {
    return planUnifiedDecisionBundleFromRankedCandidates(candidates, options);
  }

  let bundle: UnifiedDecisionBundle | null = null;
  for (const candidate of orderProducerCandidates(candidates)) {
    bundle = planUnifiedDecisionBundle(bundle, candidate, options);
  }
  return bundle;
}

function planUnifiedDecisionBundleFromRankedCandidates(
  candidates: UnifiedDecisionProducerCandidate[],
  options: MergeSignalDrivenBundleOptions = {},
): UnifiedDecisionBundle {
  const maxNearFrameWindow = options.maxNearFrameWindow ?? DEFAULT_MAX_NEAR_FRAME_WINDOW;
  const orderedProducerCandidates = orderProducerCandidates(candidates);
  const creativeDecisions = orderedProducerCandidates
    .filter((candidate) => candidate.source === 'creative-brief')
    .flatMap((candidate) => normalizeEdl(candidate.edl).decisions);
  const rawSignalDecisions = orderedProducerCandidates
    .filter((candidate) => candidate.source === 'signal-driven')
    .flatMap((candidate) => normalizeEdl(candidate.edl).decisions);
  const signalDecisions = enrichDecisionsWithOverlayTimelineMemory(rawSignalDecisions, creativeDecisions);
  const signalExecutionBudgets = buildSignalExecutionBudgets(signalDecisions);
  const signalDecisionAudit = createSignalDecisionAuditBuilder(createEmptySignalDecisionAudit());
  const evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[] = [];
  const selectedEntries: PlannedDecision[] = [];
  let validatedDecisionCount = 0;
  let suppressedSignalDuplicateCount = 0;
  let evidenceOnlySignalDecisionCount = 0;

  const plannerEntries = [
    ...creativeDecisions.map((decision) => toPlannedDecision({ decision, source: 'creative-brief' })),
    ...signalDecisions.map((decision) => toPlannedDecision({ decision, source: 'signal-driven' })),
  ].sort((a, b) => (
    b.score - a.score
    || b.decision.confidence - a.decision.confidence
    || a.decision.frame - b.decision.frame
    || producerRank(a.source) - producerRank(b.source)
    || a.decision.type.localeCompare(b.decision.type)
  ));

  const selectedDecisions = () => selectedEntries.map((entry) => entry.decision);

  const keepAsEvidence = (
    entry: PlannedDecision,
    outcome: UnifiedSignalDecisionOutcome,
    reason: string,
  ): void => {
    evidenceOnlySignalDecisionCount++;
    recordSignalDecisionAudit(signalDecisionAudit, entry.decision, outcome, reason);
    if (evidenceOnlySignalDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
      evidenceOnlySignalDecisions.push(summarizeSignalDecisionEvidence(
        entry.decision,
        normalizeSignalExecutionCandidate(entry.decision),
        outcome,
        reason,
      ));
    }
  };

  for (const entry of plannerEntries) {
    const license = entry.source === 'signal-driven'
      ? resolveSignalExecutionLicense(selectedDecisions(), entry.decision, signalExecutionBudgets)
      : resolvePrimaryCreativeDecisionLicense(entry.decision, { requireFamilyAtoms: true });
    if (!license.executable) {
      keepAsEvidence(entry, 'evidence-only', license.reason);
      continue;
    }

    const matchIndex = findNearEquivalentDecisionIndex(selectedDecisions(), entry.decision, maxNearFrameWindow);
    if (matchIndex >= 0) {
      const selected = selectedEntries[matchIndex];
      if (entry.source === 'signal-driven' && selected.source === 'creative-brief') {
        selected.decision = attachSignalValidation(selected.decision, entry.decision);
        recordSignalDecisionAudit(signalDecisionAudit, entry.decision, 'validated-primary', 'near-equivalent-selected-candidate');
        validatedDecisionCount++;
      } else {
        const outcome: UnifiedSignalDecisionOutcome = entry.source === 'signal-driven' ? 'evidence-only' : 'signal-primary';
        keepAsEvidence(entry, outcome, 'shadowed-by-higher-score-candidate');
      }
      suppressedSignalDuplicateCount++;
      continue;
    }

    selectedEntries.push({
      ...entry,
      decision: entry.source === 'signal-driven'
        ? markPlannerSelectedSignal(entry.decision, license.reason)
        : markPlannerSelectedPrimary(entry.decision, license.reason),
    });
  }

  const authority = authorityForUnifiedCandidatePlanner();
  const selectedEntrySourceByKey = new Map(
    selectedEntries.map((entry) => [decisionSelectionKey(entry.decision), entry.source]),
  );
  const selectedProducerForDecision = (decision: ReactiveEditDecision): UnifiedDecisionCandidateProducer => (
    selectedEntrySourceByKey.get(decisionSelectionKey(decision))
      ?? (isSignalSourceDecision(decision) ? 'signal-driven' : 'creative-brief')
  );
  const choreographyResult = applyCrossOverlayChoreography(selectedEntries.map((entry) => entry.decision));

  for (const suppression of choreographyResult.suppressed) {
    const suppressedProducer = selectedProducerForDecision(suppression.decision);
    const outcome: UnifiedSignalDecisionOutcome = suppressedProducer === 'signal-driven'
      ? 'evidence-only'
      : 'signal-primary';
    const reason = `cross-overlay-choreography:${suppression.reason}`;
    evidenceOnlySignalDecisionCount++;
    recordSignalDecisionAudit(signalDecisionAudit, suppression.decision, outcome, reason);
    if (evidenceOnlySignalDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
      evidenceOnlySignalDecisions.push(summarizeSignalDecisionEvidence(
        suppression.decision,
        normalizeSignalExecutionCandidate(suppression.decision),
        outcome,
        reason,
      ));
    }
  }

  for (const decision of choreographyResult.decisions) {
    if (selectedProducerForDecision(decision) !== 'signal-driven') continue;
    recordSignalDecisionAudit(signalDecisionAudit, decision, 'added-executable', executionLicenseReason(decision));
  }

  const decisions = stampUnifiedPlannerOwnership(
    choreographyResult.decisions
      .sort((a, b) => a.frame - b.frame || a.priority - b.priority),
    authority,
  );
  const edl = normalizeEdl({ decisions });
  const selectedSignalCount = choreographyResult.decisions
    .filter((decision) => selectedProducerForDecision(decision) === 'signal-driven')
    .length;
  const selectedCreativeCount = choreographyResult.decisions
    .filter((decision) => selectedProducerForDecision(decision) === 'creative-brief')
    .length;

  const source: UnifiedDecisionBundleSource = selectedCreativeCount > 0
    ? 'creative-brief+signal-driven'
    : 'signal-driven';
  return {
    source,
    authority,
    edl,
    graphicsDensity: orderedProducerCandidates.find((candidate) => candidate.graphicsDensity)?.graphicsDensity,
    expectedExecuted: edl.totalDecisions,
    expectedSkipped: evidenceOnlySignalDecisionCount,
    evidence: {
      primaryDecisionCount: selectedCreativeCount,
      signalDecisionCount: signalDecisions.length,
      addedSignalDecisionCount: selectedSignalCount,
      validatedDecisionCount,
      suppressedSignalDuplicateCount,
      evidenceOnlySignalDecisionCount,
      evidenceOnlySignalDecisions,
      signalDecisionAudit: finalizeSignalDecisionAudit(signalDecisionAudit),
      crossOverlayChoreography: choreographyResult.report,
    },
  };
}
export function mergeSignalDrivenBundle(
  primaryBundle: UnifiedDecisionBundle,
  signalEdl: CompatibleEditDecisionList,
  incomingProducer?: UnifiedDecisionCandidateProducer,
  options: MergeSignalDrivenBundleOptions = {},
): UnifiedDecisionBundle {
  const signalDecisionCount = signalEdl.decisions.length;
  if (signalDecisionCount === 0) {
    return {
      ...primaryBundle,
      evidence: {
        ...primaryBundle.evidence,
        signalDecisionCount: primaryBundle.evidence.signalDecisionCount + signalDecisionCount,
      },
    };
  }

  const maxNearFrameWindow = options.maxNearFrameWindow ?? DEFAULT_MAX_NEAR_FRAME_WINDOW;
  const signalDecisions = enrichDecisionsWithOverlayTimelineMemory(
    cloneDecisions(signalEdl.decisions),
    primaryBundle.edl.decisions,
  );
  const resolvedIncomingProducer = incomingProducer
    ?? inferIncomingProducer(signalDecisions, primaryBundle.source);
  const signalExecutionBudgets = buildSignalExecutionBudgets(signalDecisions);
  const primaryProducer = resolveProducerForPlan(primaryBundle);
  const mergedDecisionEntries = cloneDecisions(primaryBundle.edl.decisions).map((decision) => toPlannedDecision({
    decision,
    source: primaryProducer,
  }));
  let addedSignalDecisionCount = 0;
  let validatedDecisionCount = 0;
  let suppressedSignalDuplicateCount = 0;
  let evidenceOnlySignalDecisionCount = 0;
  const evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[] = [];
  const signalDecisionAudit = createSignalDecisionAuditBuilder(primaryBundle.evidence.signalDecisionAudit);
  const orderedSignalCandidates = signalDecisions
    .map((decision) => toPlannedDecision({ decision, source: resolvedIncomingProducer }))
    .sort((a, b) => b.score - a.score || b.decision.confidence - a.decision.confidence || a.decision.type.localeCompare(b.decision.type));

  const allDecisions = () => mergedDecisionEntries.map((entry) => entry.decision);

  for (const candidate of orderedSignalCandidates) {
    const decision = candidate.decision;
    const matchIndex = findNearEquivalentDecisionIndex(allDecisions(), decision, maxNearFrameWindow);
    if (matchIndex >= 0) {
      const existingPlan = mergedDecisionEntries[matchIndex];
      const existingDecision = existingPlan.decision;
      const replacementLicense = resolveSignalExecutionLicense(
        allDecisions().filter((_, index) => index !== matchIndex),
        decision,
        signalExecutionBudgets,
      );
      if (shouldSignalReplacePrimary(existingPlan, candidate, replacementLicense, resolvedIncomingProducer)) {
        const replacementReason = `signal-replaced-primary:${replacementLicense.reason}`;
        mergedDecisionEntries[matchIndex] = {
          ...candidate,
          decision: markSignalReplacement(decision, replacementLicense.reason, existingDecision),
        };
        recordSignalDecisionAudit(signalDecisionAudit, decision, 'added-executable', replacementReason);
        if (resolvedIncomingProducer === 'signal-driven') {
          addedSignalDecisionCount++;
        }
        suppressedSignalDuplicateCount++;
        continue;
      }
      existingPlan.decision = attachSignalValidation(existingDecision, decision);
      recordSignalDecisionAudit(signalDecisionAudit, decision, 'validated-primary', 'near-equivalent-primary');
      validatedDecisionCount++;
      suppressedSignalDuplicateCount++;
      continue;
    }

    const license = resolveSignalExecutionLicense(
      allDecisions(),
      decision,
      signalExecutionBudgets,
    );
      if (license.executable) {
        recordSignalDecisionAudit(signalDecisionAudit, decision, 'added-executable', license.reason);
        mergedDecisionEntries.push({
          ...candidate,
          decision: markSignalSupplement(decision, license.reason),
        });
      if (resolvedIncomingProducer === 'signal-driven') {
        addedSignalDecisionCount++;
      }
      if (resolvedIncomingProducer === 'creative-brief' && primaryBundle.source !== resolvedIncomingProducer) {
        validatedDecisionCount++;
      }
      continue;
    }

    const evidenceOutcome = resolvedIncomingProducer === 'creative-brief' ? 'signal-primary' : 'evidence-only';
    recordSignalDecisionAudit(signalDecisionAudit, decision, evidenceOutcome, license.reason);
    evidenceOnlySignalDecisionCount++;
    if (evidenceOnlySignalDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
      evidenceOnlySignalDecisions.push(summarizeSignalDecisionEvidence(
        decision,
        normalizeSignalExecutionCandidate(decision),
        evidenceOutcome,
        license.reason,
      ));
    }
  }

  const nextAuthority = authorityAfterSignalMerge(
    primaryBundle.authority,
    signalDecisionCount,
    addedSignalDecisionCount,
  );
  const mergedEdl = normalizeEdl({
    ...primaryBundle.edl,
    decisions: stampUnifiedPlannerOwnership(
      mergedDecisionEntries
        .map((entry) => entry.decision)
        .sort((a, b) => a.frame - b.frame || a.priority - b.priority),
      nextAuthority,
    ),
  });

  return {
    ...primaryBundle,
    source: primaryBundle.authority.executableProducer === 'creative-brief'
      ? 'creative-brief+signal-driven'
      : primaryBundle.source,
    authority: nextAuthority,
    edl: mergedEdl,
    expectedExecuted: mergedEdl.totalDecisions,
    expectedSkipped: primaryBundle.expectedSkipped,
    evidence: {
      primaryDecisionCount: primaryBundle.evidence.primaryDecisionCount,
      signalDecisionCount: primaryBundle.evidence.signalDecisionCount + signalDecisionCount,
      addedSignalDecisionCount: primaryBundle.evidence.addedSignalDecisionCount + addedSignalDecisionCount,
      validatedDecisionCount: primaryBundle.evidence.validatedDecisionCount + validatedDecisionCount,
      suppressedSignalDuplicateCount: primaryBundle.evidence.suppressedSignalDuplicateCount + suppressedSignalDuplicateCount,
      evidenceOnlySignalDecisionCount: primaryBundle.evidence.evidenceOnlySignalDecisionCount + evidenceOnlySignalDecisionCount,
      evidenceOnlySignalDecisions: [
        ...primaryBundle.evidence.evidenceOnlySignalDecisions,
        ...evidenceOnlySignalDecisions,
      ].slice(0, SIGNAL_EVIDENCE_DETAIL_LIMIT),
      signalDecisionAudit: finalizeSignalDecisionAudit(signalDecisionAudit),
    },
  };
}

type PlannedDecision = {
  decision: ReactiveEditDecision;
  source: UnifiedDecisionCandidateProducer;
  score: number;
};

function toPlannedDecision(params: { decision: ReactiveEditDecision; source: UnifiedDecisionCandidateProducer }): PlannedDecision {
  return {
    decision: params.decision,
    source: params.source,
    score: scoreUnifiedDecision(params.decision, params.source),
  };
}

function scoreUnifiedDecision(
  decision: ReactiveEditDecision,
  source: UnifiedDecisionCandidateProducer,
): number {
  const candidate = normalizeSignalExecutionCandidate(decision);
  const sourceBonus = source === 'creative-brief' ? 0.05 : 0.01;
  const riskPenalty = candidate.risk * 0.35;
  const transitionType = decision.type === 'transition'
    ? normalizeParamString(decision.params.transitionType ?? decision.params.type)
    : '';
  const typePenalty = decision.type === 'cut' || transitionType === 'hard-cut' ? 0.02 : 0;
  return roundAuditNumber(
    clamp01(candidate.evidenceStrength * 0.62 + candidate.completeness * 0.23 + (1 - riskPenalty) * 0.15 + sourceBonus - typePenalty),
  );
}

function authorityForSingleProducer(source: UnifiedDecisionCandidateProducer): UnifiedDecisionBundleAuthority {
  return {
    version: 'unified-decision-authority-v1',
    executableProducer: source,
    advisoryProducers: [],
    signalDecisionRole: source === 'signal-driven' ? 'primary' : 'none',
    signalDecisionsCanAddExecutable: source === 'signal-driven',
    decisionMode: source === 'signal-driven' ? 'signal-primary' : 'creative-brief-primary',
  };
}

function authorityAfterSignalMerge(
  authority: UnifiedDecisionBundleAuthority,
  signalDecisionCount: number,
  addedSignalDecisionCount = 0,
): UnifiedDecisionBundleAuthority {
  if (signalDecisionCount === 0 || authority.executableProducer === 'signal-driven') {
    return authority;
  }

  const alreadyUnified = authority.decisionMode === 'unified-planner'
    || (authority.executableProducer === 'unified-planner' && authority.signalDecisionsCanAddExecutable);
  const hasExecutableSignalSupplement = addedSignalDecisionCount > 0 || alreadyUnified;
  const decisionMode = hasExecutableSignalSupplement ? 'unified-planner' : 'merged-supplemental';

  return {
    version: 'unified-decision-authority-v1',
    executableProducer: hasExecutableSignalSupplement ? 'unified-planner' : authority.executableProducer,
    advisoryProducers: mergeAdvisoryProducers(authority.advisoryProducers, ['creative-brief', 'signal-driven']),
    signalDecisionRole: hasExecutableSignalSupplement ? 'co-owner' : 'advisor',
    signalDecisionsCanAddExecutable: hasExecutableSignalSupplement,
    decisionMode,
    ...(hasExecutableSignalSupplement
      ? {
          creativeBriefRole: 'semantic-context' as const,
          signalRole: 'candidate-source' as const,
        }
      : {}),
  };
}

function authorityForUnifiedCandidatePlanner(): UnifiedDecisionBundleAuthority {
  return {
    version: 'unified-decision-authority-v1',
    executableProducer: 'unified-planner',
    advisoryProducers: ['creative-brief', 'signal-driven'],
    signalDecisionRole: 'co-owner',
    signalDecisionsCanAddExecutable: true,
    decisionMode: 'unified-planner',
    creativeBriefRole: 'semantic-context',
    signalRole: 'candidate-source',
  };
}
const SIGNAL_EVIDENCE_DETAIL_LIMIT = 64;
const SIGNAL_AUDIT_SAMPLE_LIMIT = 128;
const SIGNAL_AUDIT_FRAME_SAMPLE_LIMIT = 12;
const SIGNAL_AUDIT_CANDIDATE_LIMIT = 256;
const FPS = 30;
const MIN_BUDGET_WINDOW_MINUTES = 0.25;
const SIGNAL_EXECUTION_MIN_CONFIDENCE: Partial<Record<ReactiveEditDecision['type'], number>> = {
  transition: 0.72,
  zoom: 0.72,
  'speed-change': 0.72,
  fade: 0.74,
  'camera-shake': 0.8,
  sfx: 0.78,
  'sfx-trigger': 0.78,
  graphic: 0.78,
  'caption-emphasis': 0.72,
  pacing: 0.68,
  'audio-duck': 0.82,
};
const SIGNAL_EXECUTION_MIN_SPACING_FRAMES: Partial<Record<ReactiveEditDecision['type'], number>> = {
  transition: 36,
  zoom: 90,
  'speed-change': 120,
  fade: 90,
  'camera-shake': 120,
  sfx: 90,
  'sfx-trigger': 90,
  graphic: 90,
  'caption-emphasis': 45,
  pacing: 120,
  'audio-duck': 150,
};
const SIGNAL_EXECUTION_MAX_PER_MINUTE: Partial<Record<ReactiveEditDecision['type'], number>> = {
  transition: 5,
  zoom: 8,
  'speed-change': 3,
  fade: 3,
  'camera-shake': 2,
  sfx: 4,
  'sfx-trigger': 4,
  graphic: 4,
  'caption-emphasis': 7,
  'audio-duck': 6,
  pacing: 5,
};
const NON_EXECUTABLE_TRANSITION_TYPES = new Set(['hard-cut', 'cut', 'none']);
const SIGNAL_EVIDENCE_PARAM_KEYS = new Set([
  'anchorFrame',
  'beatFrame',
  'graphicType',
  'intensity',
  'keyword',
  'value',
  'label',
  'name',
  'title',
  'body',
  'quote',
  'author',
  'from',
  'to',
  'relation',
  'role',
  'semanticRole',
  'sfxType',
  'sourceFrame',
  'targetScale',
  'technique',
  'text',
  'transitionType',
  'transType',
  'type',
]);

type MutableSignalDecisionAuditBucket = UnifiedSignalDecisionAuditBucket & {
  confidenceSum: number;
};

type MutableSignalDecisionAuditReport = {
  version: 'signal-decision-audit-v1';
  totalCount: number;
  outcomes: Record<UnifiedSignalDecisionOutcome, number>;
  byType: Record<string, MutableSignalDecisionAuditBucket>;
  byFamily: Record<UnifiedSignalDecisionFamily, MutableSignalDecisionAuditBucket>;
  byReason: Record<string, MutableSignalDecisionAuditBucket>;
  candidates: UnifiedSignalExecutionCandidate[];
  samples: UnifiedSignalDecisionEvidence[];
};

function createEmptySignalDecisionAudit(): UnifiedSignalDecisionAuditReport {
  return {
    version: 'signal-decision-audit-v1',
    totalCount: 0,
    outcomes: {
      'added-executable': 0,
      'evidence-only': 0,
      'signal-primary': 0,
      'validated-primary': 0,
    },
    byType: {},
    byFamily: {
      audio: emptyFinalAuditBucket(),
      camera: emptyFinalAuditBucket(),
      caption: emptyFinalAuditBucket(),
      graphic: emptyFinalAuditBucket(),
      pacing: emptyFinalAuditBucket(),
      timing: emptyFinalAuditBucket(),
      transition: emptyFinalAuditBucket(),
      unknown: emptyFinalAuditBucket(),
    },
    byReason: {},
    candidates: [],
    samples: [],
  };
}

function createSignalDecisionAuditBuilder(
  existing: UnifiedSignalDecisionAuditReport | undefined,
): MutableSignalDecisionAuditReport {
  const source = existing ?? createEmptySignalDecisionAudit();
  return {
    version: 'signal-decision-audit-v1',
    totalCount: source.totalCount,
    outcomes: { ...source.outcomes },
    byType: mapBucketsToMutable(source.byType),
    byFamily: mapFamilyBucketsToMutable(source.byFamily),
    byReason: mapBucketsToMutable(source.byReason),
    candidates: [...source.candidates],
    samples: [...source.samples],
  };
}

function recordSignalDecisionAudit(
  audit: MutableSignalDecisionAuditReport,
  decision: ReactiveEditDecision,
  outcome: UnifiedSignalDecisionOutcome,
  reason: string,
): void {
  const candidate = normalizeSignalExecutionCandidate(decision);
  const evidence = summarizeSignalDecisionEvidence(decision, candidate, outcome, reason);
  audit.totalCount++;
  audit.outcomes[outcome] = (audit.outcomes[outcome] ?? 0) + 1;
  updateAuditBucket(audit.byType, decision.type, decision, candidate.confidence);
  updateAuditBucket(audit.byFamily, candidate.family, decision, candidate.confidence);
  updateAuditBucket(audit.byReason, reason, decision, candidate.confidence);
  if (audit.candidates.length < SIGNAL_AUDIT_CANDIDATE_LIMIT) {
    audit.candidates.push(candidate);
  }
  if (audit.samples.length < SIGNAL_AUDIT_SAMPLE_LIMIT) {
    audit.samples.push(evidence);
  }
}

function finalizeSignalDecisionAudit(
  audit: MutableSignalDecisionAuditReport,
): UnifiedSignalDecisionAuditReport {
  return {
    version: 'signal-decision-audit-v1',
    totalCount: audit.totalCount,
    outcomes: audit.outcomes,
    byType: finalizeAuditBuckets(audit.byType),
    byFamily: finalizeAuditBuckets(audit.byFamily) as Record<UnifiedSignalDecisionFamily, UnifiedSignalDecisionAuditBucket>,
    byReason: finalizeAuditBuckets(audit.byReason),
    candidates: audit.candidates,
    samples: audit.samples,
  };
}

function updateAuditBucket(
  buckets: Record<string, MutableSignalDecisionAuditBucket>,
  key: string,
  decision: ReactiveEditDecision,
  normalizedConfidence = decision.confidence,
): void {
  const bucket = buckets[key] ?? createMutableAuditBucket();
  const confidence = Number.isFinite(normalizedConfidence) ? normalizedConfidence : 0;
  bucket.count++;
  bucket.confidenceSum += confidence;
  bucket.confidence.min = bucket.count === 1 ? confidence : Math.min(bucket.confidence.min, confidence);
  bucket.confidence.max = bucket.count === 1 ? confidence : Math.max(bucket.confidence.max, confidence);
  bucket.confidence.average = roundAuditNumber(bucket.confidenceSum / bucket.count);
  bucket.frames.first = bucket.count === 1 ? decision.frame : Math.min(bucket.frames.first, decision.frame);
  bucket.frames.last = bucket.count === 1 ? decision.frame : Math.max(bucket.frames.last, decision.frame);
  if (bucket.frames.samples.length < SIGNAL_AUDIT_FRAME_SAMPLE_LIMIT) {
    bucket.frames.samples.push(decision.frame);
  }
  bucket.sources[decision.source] = (bucket.sources[decision.source] ?? 0) + 1;
  buckets[key] = bucket;
}

function familyForSignalDecision(decision: ReactiveEditDecision): UnifiedSignalDecisionFamily {
  switch (decision.type) {
    case 'graphic':
      return 'graphic';
    case 'caption-emphasis':
      return 'caption';
    case 'transition':
      return 'transition';
    case 'zoom':
    case 'camera-shake':
      return 'camera';
    case 'sfx':
    case 'sfx-trigger':
      return 'audio';
    case 'speed-change':
    case 'fade':
      return 'timing';
    case 'pacing':
      return 'pacing';
    default:
      return 'unknown';
  }
}

function normalizeSignalExecutionCandidate(decision: ReactiveEditDecision): UnifiedSignalExecutionCandidate {
  const family = familyForSignalDecision(decision);
  const role = roleForSignalDecision(decision);
  const projectedAtoms = projectSignalFamilyAtoms(decision);
  const executionConfidence = signalExecutionConfidence(decision);
  const momentImportance = signalMomentImportance(decision);
  const evidenceStrength = signalEvidenceStrength(decision, executionConfidence);
  const completeness = completenessForSignalDecision(decision);
  const riskFlags = riskFlagsForSignalDecision(decision, completeness);
  const physicalFormReadiness = physicalFormReadinessForSignalDecision(decision, completeness, projectedAtoms, riskFlags);
  const risk = roundAuditNumber(Math.min(1, Math.max(0, (1 - executionConfidence) * 0.45 + (1 - completeness) * 0.35 + (1 - physicalFormReadiness) * 0.2)));

  return {
    version: 'signal-execution-candidate-v1',
    family,
    job: role,
    role,
    source: decision.source,
    signal: decision.signal,
    confidence: executionConfidence,
    momentImportance,
    timingAnchor: {
      kind: timingAnchorKindForSignalDecision(decision),
      frame: decision.frame,
      durationFrames: Math.max(1, decision.durationFrames ?? 1),
    },
    evidenceStrength,
    completeness,
    physicalFormReadiness,
    risk,
    riskFlags,
    projectedAtoms,
    sourcePacket: summarizeSignalSourcePacket(decision),
    calibrationStatus: 'invented-needs-calibration',
  };
}

function signalExecutionConfidence(decision: ReactiveEditDecision): number {
  return roundAuditNumber(clamp01(numberParam(decision.params.executionConfidence)
    ?? numberParam(decision.params.candidateConfidence)
    ?? numberParam(decision.params.familyConfidence)
    ?? decision.confidence));
}

function signalMomentImportance(decision: ReactiveEditDecision): number {
  return roundAuditNumber(clamp01(numberParam(decision.params.momentImportance)
    ?? numberParam(decision.params.momentWeight)
    ?? numberParam(decision.params.momentScore)
    ?? decision.confidence));
}

function signalEvidenceStrength(decision: ReactiveEditDecision, executionConfidence: number): number {
  return roundAuditNumber(clamp01(numberParam(decision.params.evidenceStrength)
    ?? numberParam(decision.params.signalEvidenceStrength)
    ?? executionConfidence));
}

function physicalFormReadinessForSignalDecision(
  decision: ReactiveEditDecision,
  completeness: number,
  projectedAtoms: Record<string, string | number | boolean>,
  riskFlags: string[],
): number {
  const atomBonus = Object.keys(projectedAtoms).length > 0 ? 0.18 : 0;
  const directFormBonus = hasAnyDirectParam(decision, [
    'transitionType',
    'type',
    'sfxType',
    'targetScale',
    'scale',
    'intensity',
    'value',
    'label',
    'keyword',
    'text',
  ]) ? 0.12 : 0;
  const riskPenalty = riskFlags.length > 0 ? 0.16 : 0;
  return roundAuditNumber(clamp01(completeness * 0.7 + atomBonus + directFormBonus - riskPenalty));
}

function projectSignalFamilyAtoms(decision: ReactiveEditDecision): Record<string, string | number | boolean> {
  const atoms: Record<string, string | number | boolean> = {};
  const family = familyForSignalDecision(decision);
  const sourcePacket = summarizeSignalSourcePacket(decision);

  const setAtom = (atom: string, aliases: string[]): void => {
    const value = lookupSourcePrimitive(decision, aliases);
    if (value !== undefined) atoms[atom] = value;
  };

  if (family === 'transition' || family === 'pacing') {
    setAtom('topicDelta', ['topicDelta', 'topic_shift', 'topicShift', 'topic_shift_strength', 'narrative_pressure']);
    setAtom('speechGapMs', ['speechGapMs', 'pauseMs', 'silence_duration_ms', 'speech_gap_ms']);
    setAtom('beatPhase', ['beatPhase', 'music_tatum', 'beat_phase']);
    setAtom('visualContinuity', ['visualContinuity', 'visual_continuity', 'visual_complexity']);
    setAtom('motionVectorX', ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
    setAtom('motionVectorY', ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
    setAtom('motionIntensity', ['motionIntensity', 'motion_intensity', 'visual.motion_intensity', 'visualMotion']);
    setAtom('visualChange', ['visualChange', 'visual_change', 'visual_change_rate', 'visual.significance']);
    setAtom('beatStrength', ['beatStrength', 'beat_strength', 'music_energy', 'audio.music_energy']);
    setAtom('emotionJump', ['emotionJump', 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity']);
    setAtom('textCoverage', ['textCoverage', 'text_coverage', 'visual.text_coverage', 'visual.perception.avg_text_coverage']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen', 'visual.perception.text_presence_ratio']);
    setAtom('subjectPositionJump', ['subjectPositionJump', 'subject_position_jump', 'eye_trace_jump', 'subjectJump']);
    setAtom('subjectSizeJump', ['subjectSizeJump', 'subject_size_jump', 'scale_jump', 'subjectScaleJump']);
    setAtom('shotScaleDelta', ['shotScaleDelta', 'shot_scale_delta', 'shotScaleChange']);
    setAtom('cameraMotion', ['cameraMotion', 'camera_motion', 'camera.motion']);
    setAtom('speakerChange', ['speakerChange', 'speaker_change', 'speech.speaker_change']);
    setAtom('sentenceContinues', ['sentenceContinues', 'sentence_continues', 'speech.continues']);
    setAtom('semanticContrast', ['semanticContrast', 'semantic_contrast', 'contrast_strength']);
    setAtom('claimEvidenceRelation', ['claimEvidenceRelation', 'claim_evidence_relation', 'proof_relation']);
    setAtom('musicHit', ['musicHit', 'music_hit', 'downbeat_strength']);
    setAtom('audioTailMs', ['audioTailMs', 'audio_tail_ms', 'incoming_audio_lead_ms', 'outgoing_audio_tail_ms']);
    setAtom('colorDelta', ['colorDelta', 'color_delta', 'color_temperature_delta']);
    setAtom('brightnessDelta', ['brightnessDelta', 'brightness_delta', 'luma_delta']);
    setAtom('clutterDelta', ['clutterDelta', 'clutter_delta', 'visual_clutter_delta', 'visual.perception.screen_clutter_ratio']);
    setAtom('tensionRelease', ['tensionRelease', 'tension_release', 'release_pressure']);
    setAtom('hookPayoff', ['hookPayoff', 'hook_payoff', 'setup_payoff']);
    setAtom('boundaryConfidence', ['boundaryConfidence', 'boundary_confidence']);
    setAtom('rawToCutConfidence', ['rawToCutConfidence', 'raw_to_cut_confidence', 'source_map_confidence']);
    setAtom('vjepaCoverageQuality', ['vjepaCoverageQuality', 'vjepa_coverage_quality', 'visual_coverage_quality', 'visual.perception.avg_coverage_trust']);
    setAtom('recentTransitionSimilarity', ['recentTransitionSimilarity', 'recent_transition_similarity', 'transition_repetition']);
    setAtom('recentDirectionSimilarity', ['recentDirectionSimilarity', 'recent_direction_similarity']);
    setAtom('recentOverlayDensity', ['recentOverlayDensity', 'recent_overlay_density', 'overlay_density']);
    setAtom('captionPressure', ['captionPressure', 'caption_pressure', 'active_caption_pressure']);
    setAtom('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
    if (family === 'transition' && !hasAnyDirectParam(decision, ['boundaryFrame', 'boundaryAtom', 'clipAId', 'clipBId'])) {
      const hasProjectedBoundaryReason = [
        'topicDelta',
        'speechGapMs',
        'beatPhase',
        'visualContinuity',
        'motionVectorX',
        'motionVectorY',
        'motionIntensity',
        'visualChange',
        'beatStrength',
        'emotionJump',
      ]
        .some((atom) => atoms[atom] !== undefined);
      if (sourcePacket.hasSignals && hasProjectedBoundaryReason) atoms.boundaryFrame = decision.frame;
    }
  }

  if (family === 'camera') {
    setAtom('mainSubjectX', ['mainSubjectX', 'subjectX', 'main_subject_x', 'subject_x']);
    setAtom('mainSubjectY', ['mainSubjectY', 'subjectY', 'main_subject_y', 'subject_y']);
    setAtom('mainSubjectWidth', ['mainSubjectWidth', 'subjectWidth', 'main_subject_width', 'subject_width']);
    setAtom('mainSubjectHeight', ['mainSubjectHeight', 'subjectHeight', 'main_subject_height', 'subject_height']);
    setAtom('facePresent', ['facePresent', 'face_present', 'visual.face_present']);
    setAtom('eyeContact', ['eyeContact', 'eye_contact', 'visual.eye_contact']);
    setAtom('motionVectorX', ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
    setAtom('motionVectorY', ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
    setAtom('shotScale', ['shotScale', 'shot_scale', 'visual.shot_scale']);
    setAtom('cameraMotion', ['cameraMotion', 'camera_motion', 'visual.camera_motion']);
    setAtom('subjectMotion', ['subjectMotion', 'subject_motion', 'visual.subject_motion']);
    setAtom('speechPeak', ['speechPeak', 'speech_energy', 'energy_delta', 'speech.energy']);
    setAtom('wordImportance', ['wordImportance', 'word_importance', 'word.importance']);
    setAtom('beatStrength', ['beatStrength', 'beat_strength', 'music_energy', 'audio.music_energy']);
    setAtom('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity']);
    setAtom('visualSignificance', ['visualSignificance', 'visual_significance', 'visual.significance']);
    setAtom('visualMotion', ['visualMotion', 'motion_intensity', 'visual.motion_intensity']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen', 'visual.perception.text_presence_ratio']);
    setAtom('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity', 'visual.perception.screen_clutter_ratio']);
    setAtom('topicDelta', ['topicDelta', 'topic_shift', 'topicShift', 'topic_shift_strength', 'narrative_pressure']);
    setAtom('currentZoomScale', ['currentZoomScale', 'current_zoom_scale']);
    setAtom('timeSinceLastZoomSec', ['timeSinceLastZoomSec', 'time_since_last_zoom', 'seconds_since_last_zoom']);
    setAtom('recentZoomSimilarity', ['recentZoomSimilarity', 'recent_zoom_similarity', 'zoom_repetition']);
    setAtom('recentMotionSimilarity', ['recentMotionSimilarity', 'recent_motion_similarity']);
    setAtom('recentZoomDensity', ['recentZoomDensity', 'recent_zoom_density', 'zoom_density']);
    setAtom('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
    setAtom('captionPressure', ['captionPressure', 'caption_pressure', 'active_caption_pressure']);
    setAtom('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
    setAtom('transitionPressure', ['transitionPressure', 'transition_pressure', 'active_transition_pressure']);
  }

  if (family === 'audio') {
    setAtom('beatStrength', ['beatStrength', 'music_energy', 'audio.music_energy']);
    setAtom('beatFrame', ['beatFrame', 'targetBeatFrame', 'audio.beat_frame']);
    setAtom('anchorFrame', ['anchorFrame', 'targetFrame', 'audio.anchor_frame']);
    setAtom('phraseImpact', ['phraseImpact', 'visceral_impact', 'emotion_intensity', 'speech_energy']);
    setAtom('rhythmRole', ['rhythmRole', 'music_section', 'audio.music_section']);
    setAtom('syncAnchor', ['sfxAnchor', 'syncAnchor', 'anchor']);
    setAtom('syncFrame', ['syncFrame', 'targetSyncFrame']);
    setAtom('mgLandingFrame', ['mgLandingFrame', 'graphicLandingFrame', 'overlay_landing_frame']);
    setAtom('zoomPeakFrame', ['zoomPeakFrame', 'zoomImpactFrame', 'camera_peak_frame']);
    setAtom('captionEmphasisFrame', ['captionEmphasisFrame', 'keywordFrame', 'wordEmphasisFrame']);
    setAtom('motionPeakFrame', ['motionPeakFrame', 'visual_motion_peak_frame']);
    setAtom('transitionEnergy', ['transitionEnergy', 'topicDelta', 'topic_shift', 'narrative_pressure', 'motion_intensity']);
    setAtom('topicDelta', ['topicDelta', 'topic_shift', 'narrative_pressure']);
    setAtom('visualMotion', ['visualMotion', 'motion_intensity', 'visual.motion_intensity']);
    setAtom('silencePocketMs', ['silencePocketMs', 'speechGapMs', 'silence_duration_ms', 'speech_gap_ms']);
    setAtom('speechEnergy', ['speechEnergy', 'speech_energy', 'speech.energy']);
    setAtom('musicEnergy', ['musicEnergy', 'music_energy', 'audio.music_energy']);
    setAtom('musicLoudness', ['musicLoudness', 'music_loudness', 'audio.music_loudness']);
    setAtom('speechLoudness', ['speechLoudness', 'speech_loudness', 'audio.speech_loudness']);
    setAtom('providerQuality', ['providerQuality', 'asset_quality', 'candidateQuality']);
    setAtom('providerConfidence', ['providerConfidence', 'asset_confidence', 'candidateConfidence']);
    setAtom('assetQualityFloor', ['assetQualityFloor', 'qualityFloor', 'provider_quality_floor']);
    setAtom('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
    setAtom('recentSfxDensity', ['recentSfxDensity', 'recent_sfx_density', 'sfx_density']);
    setAtom('captionPressure', ['captionPressure', 'caption_pressure', 'active_caption_pressure']);
    setAtom('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
    setAtom('zoomPressure', ['zoomPressure', 'zoom_pressure', 'active_zoom_pressure']);
    setAtom('transitionPressure', ['transitionPressure', 'transition_pressure', 'active_transition_pressure']);
    setAtom('brandRestraint', ['brandRestraint', 'brand_restraint', 'audio_restraint']);
    setAtom('cacheHit', ['cacheHit', 'asset_cache_hit', 'sfx_cache_hit']);
    if (!hasAnyDirectParam(decision, ['beatFrame', 'anchorFrame']) && atoms.beatStrength !== undefined) {
      atoms.beatFrame = decision.frame;
    }
  }

  if (family === 'caption') {
    setAtom('speechRate', ['speechRate', 'speaking_rate_wpm', 'speech.speaking_rate_wpm']);
    setAtom('keyword', ['keyword', 'targetWord', 'word', 'phrase']);
    setAtom('momentId', ['momentId', 'segmentId']);
    setAtom('speechPeak', ['speechPeak', 'speech_energy', 'speech.energy']);
    setAtom('wordImportance', ['wordImportance', 'word_importance', 'speech.emphasis_word']);
    setAtom('phraseImpact', ['phraseImpact', 'visceral_impact', 'claim_strength']);
    setAtom('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal']);
    setAtom('beatStrength', ['beatStrength', 'beat_strength', 'audio.music_energy']);
    setAtom('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity', 'visual.perception.screen_clutter_ratio']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen', 'visual.perception.text_presence_ratio']);
    setAtom('negativeSpaceBottom', ['negativeSpaceBottom', 'negative_space_bottom', 'visual.negative_space_bottom', 'visual.perception.negative_space.bottom']);
    setAtom('phraseWordCount', ['phraseWordCount', 'word_count', 'caption_word_count']);
    setAtom('captionDurationMs', ['captionDurationMs', 'duration_ms', 'display_duration_ms']);
    setAtom('captionSpanFrames', ['captionSpanFrames', 'durationFrames']);
    setAtom('lineBreakCount', ['lineBreakCount', 'line_break_count']);
    setAtom('maxCharsPerLine', ['maxCharsPerLine', 'max_chars_per_line']);
    setAtom('textLength', ['textLength', 'text_length', 'caption_text_length']);
    setAtom('formality', ['formality', 'speech.formality', 'brand.formality']);
    setAtom('brandContrast', ['brandContrast', 'brand_contrast', 'caption_contrast']);
    setAtom('brandCaptionEnergy', ['brandCaptionEnergy', 'brand_caption_energy', 'caption_energy']);
    setAtom('safeZoneBottom', ['safeZoneBottom', 'safe_zone_bottom', 'caption_safe_zone_pressure']);
    setAtom('negativeSpaceTop', ['negativeSpaceTop', 'negative_space_top', 'visual.negative_space_top', 'visual.perception.negative_space.top']);
    setAtom('negativeSpaceCenter', ['negativeSpaceCenter', 'negative_space_center', 'visual.negative_space_center']);
    setAtom('subjectBottom', ['subjectBottom', 'subject_bottom', 'visual.subject_bottom']);
    setAtom('faceBottom', ['faceBottom', 'face_bottom', 'visual.face_bottom']);
    setAtom('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
    setAtom('zoomPressure', ['zoomPressure', 'zoom_pressure', 'active_zoom_pressure']);
    setAtom('transitionPressure', ['transitionPressure', 'transition_pressure', 'active_transition_pressure']);
    setAtom('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
    setAtom('phraseBoundary', ['phraseBoundary', 'phrase_boundary']);
    setAtom('sentenceBoundary', ['sentenceBoundary', 'sentence_boundary']);
    setAtom('cutBoundaryDistanceFrames', ['cutBoundaryDistanceFrames', 'cut_boundary_distance_frames']);
    setAtom('speechCoverage', ['speechCoverage', 'speech_coverage']);
    setAtom('captionDensity', ['captionDensity', 'caption_density']);
    setAtom('captionRepetition', ['captionRepetition', 'caption_repetition']);
  }

  if (family === 'timing') {
    setAtom('motionIntensity', ['motionIntensity', 'motion_intensity', 'visual.motion_intensity']);
    setAtom('speechRate', ['speechRate', 'speaking_rate_wpm']);
    setAtom('beatStrength', ['beatStrength', 'music_energy']);
  }

  return atoms;
}

function summarizeSignalSourcePacket(decision: ReactiveEditDecision): UnifiedSignalExecutionCandidate['sourcePacket'] {
  const signals = recordParam(decision.params.signals);
  const fullSignalKeys = signals ? Object.keys(signals).sort() : [];
  const signalKeys = fullSignalKeys.slice(0, 40);
  const visualSetupSignalKeys = fullSignalKeys.filter(isVisualSetupSignalKey).slice(0, 24);
  return {
    hasSignals: signalKeys.length > 0,
    signalKeys,
    hasVisualSetupSignals: visualSetupSignalKeys.length > 0,
    visualSetupSignalKeys,
    hasAtomicMomentBundle: recordParam(decision.params.atomicMomentBundle) !== null,
    hasUnifiedMomentEvidence: recordParam(decision.params.unifiedMomentEvidence) !== null,
  };
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

function lookupSourcePrimitive(decision: ReactiveEditDecision, aliases: string[]): string | number | boolean | undefined {
  const sources = [
    recordParam(decision.params),
    recordParam(decision.params.signals),
    recordParam(decision.params.atomicMomentBundle),
    recordParam(decision.params.unifiedMomentEvidence),
  ].filter((source): source is Record<string, unknown> => source !== null);

  for (const source of sources) {
    const value = lookupPrimitiveInRecord(source, aliases, 0);
    if (value !== undefined) return value;
  }
  return undefined;
}

function lookupPrimitiveInRecord(
  record: Record<string, unknown>,
  aliases: string[],
  depth: number,
): string | number | boolean | undefined {
  if (depth > 3) return undefined;
  for (const alias of aliases) {
    const directValue = valueAtPath(record, alias);
    const primitive = primitiveSignalValue(directValue);
    if (primitive !== undefined) return primitive;
  }
  for (const value of Object.values(record)) {
    const nested = recordParam(value);
    if (!nested) continue;
    const primitive = lookupPrimitiveInRecord(nested, aliases, depth + 1);
    if (primitive !== undefined) return primitive;
  }
  return undefined;
}

function valueAtPath(record: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  if (!path.includes('.')) return undefined;
  let current: unknown = record;
  for (const part of path.split('.')) {
    const currentRecord = recordParam(current);
    if (!currentRecord || !Object.prototype.hasOwnProperty.call(currentRecord, part)) return undefined;
    current = currentRecord[part];
  }
  return current;
}

function primitiveSignalValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberParam(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function roleForSignalDecision(decision: ReactiveEditDecision): UnifiedSignalDecisionRole {
  switch (decision.type) {
    case 'graphic':
      return 'graphic-expression';
    case 'caption-emphasis':
      return 'caption-emphasis';
    case 'transition':
      return 'transition-boundary';
    case 'zoom':
    case 'camera-shake':
      return 'camera-motion';
    case 'sfx':
    case 'sfx-trigger':
      return 'audio-emphasis';
    case 'speed-change':
    case 'fade':
      return 'timing-modulation';
    case 'pacing':
      return 'pacing-control';
    default:
      return 'unknown';
  }
}

function timingAnchorKindForSignalDecision(decision: ReactiveEditDecision): UnifiedSignalTimingAnchorKind {
  if (decision.type === 'transition') return 'boundary';
  if (isTransitionAnchoredSfx(decision)) return 'boundary';
  if (decision.type === 'speed-change' || decision.type === 'fade') return 'span';
  return 'moment';
}

function completenessForSignalDecision(decision: ReactiveEditDecision): number {
  let score = 0.35;
  if (Number.isFinite(decision.frame)) score += 0.1;
  if (Number.isFinite(decision.confidence)) score += 0.1;
  if (decision.source) score += 0.1;
  if (decision.signal) score += 0.1;

  switch (decision.type) {
    case 'transition': {
      const transitionType = normalizeParamString(
        decision.params.transitionType ?? decision.params.type ?? decision.params.transType,
      );
      if (transitionType) score += 0.25;
      break;
    }
    case 'sfx':
    case 'sfx-trigger': {
      const sfxType = normalizeParamString(decision.params.sfxType ?? decision.params.type);
      if (sfxType && sfxType !== 'none') score += 0.25;
      break;
    }
    case 'graphic':
    case 'caption-emphasis': {
      if (decision.type === 'graphic' ? hasEvidenceBackedGraphicContent(decision) : hasAnyParam(decision, ['text', 'keyword', 'semanticRole', 'role', 'graphicType'])) score += 0.25;
      break;
    }
    case 'zoom':
    case 'camera-shake':
    case 'speed-change':
    case 'fade':
    case 'pacing':
      if (hasAnyParam(decision, ['intensity', 'targetScale', 'scale', 'type'])) score += 0.25;
      break;
    default:
      break;
  }

  return roundAuditNumber(clamp01(score));
}

function riskFlagsForSignalDecision(decision: ReactiveEditDecision, completeness: number): string[] {
  const flags: string[] = [];
  const minConfidence = SIGNAL_EXECUTION_MIN_CONFIDENCE[decision.type];
  if (minConfidence === undefined) flags.push('unsupported-executable-type');
  if (minConfidence !== undefined && signalExecutionConfidence(decision) < minConfidence) flags.push('below-execution-confidence');
  if (completeness < 0.8) flags.push('incomplete-intent');

  if (decision.type === 'transition') {
    const transitionType = normalizeParamString(
      decision.params.transitionType ?? decision.params.type ?? decision.params.transType,
    );
    if (NON_EXECUTABLE_TRANSITION_TYPES.has(transitionType)) flags.push('hard-cut-boundary-evidence');
  }

  if (decision.type === 'sfx' || decision.type === 'sfx-trigger') {
    const sfxType = normalizeParamString(decision.params.sfxType ?? decision.params.type);
    if (!sfxType || sfxType === 'none') flags.push('missing-sfx-intent');
    if (isTransitionAnchoredSfx(decision) && !hasTransitionSfxBoundaryEvidence(decision)) {
      flags.push('missing-transition-sfx-boundary-atoms');
    }
  }

  if (decision.type === 'graphic' && !hasEvidenceBackedGraphicContent(decision)) {
    flags.push('missing-graphic-content-evidence');
  }

  return flags;
}

function hasAnyParam(decision: ReactiveEditDecision, keys: string[]): boolean {
  const projectedAtoms = projectSignalFamilyAtoms(decision);
  return keys.some((key) => {
    if (hasDirectParamValue(decision.params[key])) return true;
    return hasDirectParamValue(projectedAtoms[key]);
  });
}

function hasAnyDirectParam(decision: ReactiveEditDecision, keys: string[]): boolean {
  return keys.some((key) => hasDirectParamValue(decision.params[key]));
}

function hasDirectParamValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function hasEvidenceBackedGraphicContent(decision: ReactiveEditDecision): boolean {
  return resolveGraphicContentEvidenceLicense(decision).executable;
}

function resolveGraphicContentEvidenceLicense(
  decision: ReactiveEditDecision,
): { executable: boolean; reason: string } {
  const normalized = normalizeMotionGraphicContent(decision.params ?? {});
  const ledger = normalized.semanticMgCandidateLedger;
  if (ledger.summary.totalCandidates === 0) {
    return { executable: false, reason: 'missing-graphic-content-evidence' };
  }

  const gate = resolveSemanticMgLedgerGate(ledger);
  if (!gate.allow || ledger.candidates.length === 0) {
    return {
      executable: false,
      reason: gate.reasons[0] ?? 'missing-graphic-content-evidence',
    };
  }

  return { executable: true, reason: 'licensed-by-graphic-semantic-ledger' };
}

function resolveTransitionBoundaryPlan(decision: ReactiveEditDecision): UnifiedTransitionBoundaryPlan | null {
  if (familyForSignalDecision(decision) !== 'transition') return null;

  const atoms = projectSignalFamilyAtoms(decision);
  const topicDelta = transitionAtomNumber(atoms, 'topicDelta');
  const speechGapMs = transitionAtomRawNumber(atoms, 'speechGapMs');
  const beatStrength = transitionAtomNumber(atoms, 'beatStrength');
  const emotionJump = transitionAtomNumber(atoms, 'emotionJump');
  const motionIntensity = transitionAtomNumber(atoms, 'motionIntensity');
  const visualChange = transitionAtomNumber(atoms, 'visualChange');
  const textCoverage = transitionAtomNumber(atoms, 'textCoverage');
  const textOnScreen = transitionAtomNumber(atoms, 'textOnScreen');
  const visualContinuity = transitionAtomNumber(atoms, 'visualContinuity');
  const subjectPositionJump = transitionAtomNumber(atoms, 'subjectPositionJump');
  const subjectSizeJump = transitionAtomNumber(atoms, 'subjectSizeJump');
  const shotScaleDelta = transitionAtomNumber(atoms, 'shotScaleDelta');
  const cameraMotion = transitionAtomNumber(atoms, 'cameraMotion');
  const speakerChange = transitionAtomNumber(atoms, 'speakerChange');
  const sentenceContinues = transitionAtomNumber(atoms, 'sentenceContinues');
  const semanticContrast = transitionAtomNumber(atoms, 'semanticContrast');
  const claimEvidenceRelation = transitionAtomNumber(atoms, 'claimEvidenceRelation');
  const musicHit = transitionAtomNumber(atoms, 'musicHit');
  const audioTailMs = transitionAtomRawNumber(atoms, 'audioTailMs');
  const colorDelta = transitionAtomNumber(atoms, 'colorDelta');
  const brightnessDelta = transitionAtomNumber(atoms, 'brightnessDelta');
  const clutterDelta = transitionAtomNumber(atoms, 'clutterDelta');
  const tensionRelease = transitionAtomNumber(atoms, 'tensionRelease');
  const hookPayoff = transitionAtomNumber(atoms, 'hookPayoff');
  const boundaryConfidence = transitionAtomNumberWithDefault(atoms, 'boundaryConfidence', transitionHasBoundaryAnchor(decision, atoms) ? 0.72 : 0);
  const rawToCutConfidence = transitionAtomNumberWithDefault(atoms, 'rawToCutConfidence', 0.72);
  const vjepaCoverageQuality = transitionAtomNumberWithDefault(atoms, 'vjepaCoverageQuality', 0.72);
  const recentTransitionSimilarity = transitionAtomNumber(atoms, 'recentTransitionSimilarity');
  const recentDirectionSimilarity = transitionAtomNumber(atoms, 'recentDirectionSimilarity');
  const recentOverlayDensity = transitionAtomNumber(atoms, 'recentOverlayDensity');
  const captionPressure = transitionAtomNumber(atoms, 'captionPressure');
  const mgPressure = transitionAtomNumber(atoms, 'mgPressure');
  const directionX = transitionAtomSignedNumber(atoms, 'motionVectorX');
  const directionY = transitionAtomSignedNumber(atoms, 'motionVectorY');
  const directionMagnitude = roundAuditNumber(clamp01(Math.max(Math.abs(directionX), Math.abs(directionY))));
  const visualPressure = roundAuditNumber(clamp01(Math.max(
    textCoverage,
    textOnScreen,
    visualContinuity,
    motionIntensity * 0.48,
    visualChange * 0.36,
    captionPressure,
    mgPressure,
    clutterDelta,
  )));
  const intensity = roundAuditNumber(clamp01(Math.max(
    beatStrength,
    topicDelta * 0.92,
    emotionJump * 0.88,
    motionIntensity * 0.76,
    visualChange * 0.72,
    directionMagnitude * 0.7,
    semanticContrast * 0.78,
    musicHit * 0.82,
    hookPayoff * 0.76,
  )));
  const jobVector = transitionBoundaryJobVector({
    topicDelta,
    speechGapMs,
    beatStrength,
    emotionJump,
    motionIntensity,
    visualChange,
    visualContinuity,
    directionMagnitude,
    subjectPositionJump,
    subjectSizeJump,
    shotScaleDelta,
    cameraMotion,
    speakerChange,
    sentenceContinues,
    semanticContrast,
    claimEvidenceRelation,
    musicHit,
    audioTailMs,
    colorDelta,
    brightnessDelta,
    clutterDelta,
    tensionRelease,
    hookPayoff,
    recentTransitionSimilarity,
    recentDirectionSimilarity,
    recentOverlayDensity,
    visualPressure,
  });
  const physicalFormInputs = transitionPhysicalFormInputs({
    jobVector,
    boundaryConfidence,
    rawToCutConfidence,
    directionX,
    directionY,
    directionMagnitude,
    visualPressure,
    captionPressure,
    mgPressure,
  });
  const crossFamily = transitionCrossFamilyPlan({
    physicalFormInputs,
    captionPressure,
    mgPressure,
  });
  const reasonKeys = transitionBoundaryReasonKeys({
    atoms,
    decision,
    directionMagnitude,
    motionIntensity,
    topicDelta,
    beatStrength,
    emotionJump,
    visualChange,
    speechGapMs,
    visualPressure,
    subjectPositionJump,
    subjectSizeJump,
    shotScaleDelta,
    speakerChange,
    sentenceContinues,
    semanticContrast,
    claimEvidenceRelation,
    musicHit,
    audioTailMs,
    colorDelta,
    brightnessDelta,
    clutterDelta,
    recentTransitionSimilarity,
    recentDirectionSimilarity,
  });

  if (!transitionHasBoundaryAnchor(decision, atoms) || reasonKeys.length === 0) return null;

  const visualTransitionAllowed = transitionBoundaryLicensesVisual({
    directionMagnitude,
    intensity,
    topicDelta,
    beatStrength,
    emotionJump,
    motionIntensity,
    speechGapMs,
    visualPressure,
    textOnScreen,
    jobVector,
    physicalFormInputs,
  });

  return {
    version: 'transition-boundary-plan-v1',
    family: 'transition',
    source: 'signal-family-planner',
    visualTransitionAllowed,
    reasonKeys,
    atoms,
    jobVector,
    physicalFormInputs,
    crossFamily,
    evidence: {
      directionMagnitude,
      intensity,
      visualPressure,
      boundaryConfidence,
      rawToCutConfidence,
      vjepaCoverageQuality,
    },
    calibrationStatus: 'invented-needs-calibration',
  };
}

function transitionAtomNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : 0;
}

function transitionAtomNumberWithDefault(
  atoms: Record<string, string | number | boolean>,
  key: string,
  fallback: number,
): number {
  const value = atoms[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : clamp01(fallback);
}

function transitionAtomRawNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function transitionAtomSignedNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return roundAuditNumber(Math.max(-1, Math.min(1, value)));
}

function transitionHasBoundaryAnchor(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): boolean {
  return [
    'boundaryAtom',
    'boundaryFrame',
    'clipAId',
    'clipBId',
    'transitionFrame',
    'cutFrame',
  ].some((key) => hasDirectParamValue(decision.params[key]) || hasDirectParamValue(atoms[key]));
}

function transitionBoundaryReasonKeys(input: {
  atoms: Record<string, string | number | boolean>;
  decision: ReactiveEditDecision;
  directionMagnitude: number;
  motionIntensity: number;
  topicDelta: number;
  beatStrength: number;
  emotionJump: number;
  visualChange: number;
  speechGapMs: number;
  visualPressure: number;
  subjectPositionJump: number;
  subjectSizeJump: number;
  shotScaleDelta: number;
  speakerChange: number;
  sentenceContinues: number;
  semanticContrast: number;
  claimEvidenceRelation: number;
  musicHit: number;
  audioTailMs: number;
  colorDelta: number;
  brightnessDelta: number;
  clutterDelta: number;
  recentTransitionSimilarity: number;
  recentDirectionSimilarity: number;
}): string[] {
  const reasonKeys: string[] = [];
  if (hasAnyDirectParam(input.decision, ['transitionJob', 'transition_job'])) reasonKeys.push('explicit-job');
  if (hasAnyDirectParam(input.decision, ['transitionIntent'])) reasonKeys.push('explicit-intent');
  if (input.directionMagnitude >= 0.32) reasonKeys.push('motion-direction');
  if (input.motionIntensity >= 0.48) reasonKeys.push('visual-motion');
  if (input.topicDelta >= 0.38) reasonKeys.push('topic-shift');
  if (input.beatStrength >= 0.62) reasonKeys.push('beat');
  if (input.emotionJump >= 0.62) reasonKeys.push('emotion');
  if (input.visualChange >= 0.45) reasonKeys.push('visual-change');
  if (input.speechGapMs >= 220) reasonKeys.push('speech-gap');
  if (input.visualPressure >= 0.72) reasonKeys.push('visual-pressure');
  if (input.subjectPositionJump >= 0.42 || input.subjectSizeJump >= 0.42) reasonKeys.push('subject-jump');
  if (input.shotScaleDelta >= 0.42) reasonKeys.push('shot-scale-change');
  if (input.speakerChange >= 0.5) reasonKeys.push('speaker-change');
  if (input.sentenceContinues >= 0.5) reasonKeys.push('sentence-continues');
  if (input.semanticContrast >= 0.5) reasonKeys.push('semantic-contrast');
  if (input.claimEvidenceRelation >= 0.5) reasonKeys.push('claim-evidence-relation');
  if (input.musicHit >= 0.58) reasonKeys.push('music-hit');
  if (input.audioTailMs >= 160) reasonKeys.push('audio-tail');
  if (input.colorDelta >= 0.52 || input.brightnessDelta >= 0.52) reasonKeys.push('visual-delta');
  if (input.clutterDelta >= 0.5) reasonKeys.push('clutter-delta');
  if (input.recentTransitionSimilarity >= 0.7 || input.recentDirectionSimilarity >= 0.7) reasonKeys.push('repetition-pressure');
  return [...new Set(reasonKeys)];
}

function transitionBoundaryLicensesVisual(input: {
  directionMagnitude: number;
  intensity: number;
  topicDelta: number;
  beatStrength: number;
  emotionJump: number;
  motionIntensity: number;
  speechGapMs: number;
  visualPressure: number;
  textOnScreen: number;
  jobVector: UnifiedTransitionBoundaryPlan['jobVector'];
  physicalFormInputs: UnifiedTransitionBoundaryPlan['physicalFormInputs'];
}): boolean {
  if (input.physicalFormInputs.repetitionPressure >= 0.86) return false;
  if (input.physicalFormInputs.screenSafetyPressure >= 0.92) return false;
  if (input.visualPressure >= 0.86 || input.textOnScreen >= 0.72) return false;
  return input.directionMagnitude >= 0.48
    || (input.directionMagnitude >= 0.32 && input.motionIntensity >= 0.48)
    || input.intensity >= 0.84
    || input.beatStrength >= 0.72
    || (input.speechGapMs >= 450 && input.topicDelta >= 0.38)
    || input.topicDelta >= 0.56
    || input.emotionJump >= 0.62
    || input.jobVector.jumpHide >= 0.58
    || input.jobVector.contrastReveal >= 0.58
    || input.jobVector.audioBridge >= 0.62;
}

function transitionBoundaryJobVector(input: {
  topicDelta: number;
  speechGapMs: number;
  beatStrength: number;
  emotionJump: number;
  motionIntensity: number;
  visualChange: number;
  visualContinuity: number;
  directionMagnitude: number;
  subjectPositionJump: number;
  subjectSizeJump: number;
  shotScaleDelta: number;
  cameraMotion: number;
  speakerChange: number;
  sentenceContinues: number;
  semanticContrast: number;
  claimEvidenceRelation: number;
  musicHit: number;
  audioTailMs: number;
  colorDelta: number;
  brightnessDelta: number;
  clutterDelta: number;
  tensionRelease: number;
  hookPayoff: number;
  recentTransitionSimilarity: number;
  recentDirectionSimilarity: number;
  recentOverlayDensity: number;
  visualPressure: number;
}): UnifiedTransitionBoundaryPlan['jobVector'] {
  const continuity = roundAuditNumber(clamp01(Math.max(
    input.visualContinuity * 0.68,
    input.sentenceContinues * 0.66,
    input.audioTailMs >= 160 ? 0.56 : 0,
    (1 - input.topicDelta) * 0.34,
  )));
  const turn = roundAuditNumber(clamp01(Math.max(
    input.topicDelta,
    input.speakerChange * 0.74,
    input.semanticContrast * 0.82,
  )));
  const impact = roundAuditNumber(clamp01(Math.max(
    input.beatStrength,
    input.emotionJump * 0.92,
    input.musicHit * 0.9,
    input.hookPayoff * 0.86,
  )));
  const motionTransfer = roundAuditNumber(clamp01(Math.max(
    input.directionMagnitude,
    input.motionIntensity * 0.84,
    input.cameraMotion * 0.72,
  )));
  const jumpHide = roundAuditNumber(clamp01(Math.max(
    input.subjectPositionJump,
    input.subjectSizeJump,
    input.shotScaleDelta,
    input.visualChange * 0.54,
    (1 - input.visualContinuity) * 0.42,
  )));
  const attentionReset = roundAuditNumber(clamp01(Math.max(
    input.recentOverlayDensity,
    input.clutterDelta,
    input.tensionRelease,
    input.topicDelta * 0.6,
  )));
  const contrastReveal = roundAuditNumber(clamp01(Math.max(
    input.semanticContrast,
    input.claimEvidenceRelation,
    input.colorDelta * 0.62,
    input.brightnessDelta * 0.58,
  )));
  const audioBridge = roundAuditNumber(clamp01(Math.max(
    input.audioTailMs >= 160 ? 0.62 : 0,
    input.sentenceContinues * 0.58,
    input.speakerChange * 0.5,
  )));
  const silence = roundAuditNumber(clamp01(Math.max(
    input.visualPressure,
    input.recentTransitionSimilarity,
    input.recentDirectionSimilarity,
    input.motionIntensity >= 0.78 && input.topicDelta < 0.32 ? 0.58 : 0,
  )));

  return {
    continuity,
    turn,
    impact,
    motionTransfer,
    jumpHide,
    attentionReset,
    contrastReveal,
    audioBridge,
    silence,
  };
}

function transitionPhysicalFormInputs(input: {
  jobVector: UnifiedTransitionBoundaryPlan['jobVector'];
  boundaryConfidence: number;
  rawToCutConfidence: number;
  directionX: number;
  directionY: number;
  directionMagnitude: number;
  visualPressure: number;
  captionPressure: number;
  mgPressure: number;
}): UnifiedTransitionBoundaryPlan['physicalFormInputs'] {
  const screenSafetyPressure = roundAuditNumber(clamp01(Math.max(
    input.visualPressure,
    input.captionPressure,
    input.mgPressure,
  )));
  const repetitionPressure = roundAuditNumber(clamp01(Math.max(
    input.jobVector.silence,
    input.jobVector.motionTransfer > 0.5 ? 0 : input.jobVector.continuity * 0.18,
  )));
  const durationPressure = roundAuditNumber(clamp01(Math.max(
    input.jobVector.continuity * 0.72,
    input.jobVector.audioBridge * 0.68,
    input.jobVector.turn * 0.42,
  )));
  const motionPressure = roundAuditNumber(clamp01(Math.max(
    input.jobVector.motionTransfer,
    input.jobVector.jumpHide * 0.48,
  )));
  const blurPressure = roundAuditNumber(clamp01(Math.max(
    input.jobVector.motionTransfer * 0.62,
    input.jobVector.jumpHide * 0.52,
    screenSafetyPressure * 0.18,
  )));
  const exposurePressure = roundAuditNumber(clamp01(input.jobVector.impact * (1 - screenSafetyPressure * 0.42)));

  return {
    boundaryConfidence: input.boundaryConfidence,
    rawToCutConfidence: input.rawToCutConfidence,
    directionX: input.directionX,
    directionY: input.directionY,
    directionMagnitude: input.directionMagnitude,
    durationPressure,
    opacityPressure: roundAuditNumber(clamp01(Math.max(input.jobVector.continuity, input.jobVector.audioBridge))),
    motionPressure,
    blurPressure,
    smearPressure: roundAuditNumber(clamp01(input.jobVector.motionTransfer * 0.74)),
    exposurePressure,
    sfxEligibility: roundAuditNumber(clamp01(Math.max(input.jobVector.impact, input.jobVector.motionTransfer * 0.74, input.jobVector.audioBridge * 0.7) - screenSafetyPressure * 0.18)),
    zoomBridgeNeed: roundAuditNumber(clamp01(Math.max(input.jobVector.jumpHide, input.jobVector.attentionReset * 0.52))),
    screenSafetyPressure,
    repetitionPressure,
  };
}

function transitionCrossFamilyPlan(input: {
  physicalFormInputs: UnifiedTransitionBoundaryPlan['physicalFormInputs'];
  captionPressure: number;
  mgPressure: number;
}): UnifiedTransitionBoundaryPlan['crossFamily'] {
  return {
    sfxAllowed: input.physicalFormInputs.sfxEligibility >= 0.52 && input.physicalFormInputs.screenSafetyPressure < 0.82,
    zoomBridgeAllowed: input.physicalFormInputs.zoomBridgeNeed >= 0.45 && input.physicalFormInputs.screenSafetyPressure < 0.86,
    captionConflictRisk: roundAuditNumber(clamp01(input.captionPressure)),
    mgConflictRisk: roundAuditNumber(clamp01(input.mgPressure)),
  };
}

function transitionSignalAliases(plan: UnifiedTransitionBoundaryPlan): Record<string, unknown> {
  const aliases: Record<string, unknown> = {};
  const assign = (alias: string, atom: string): void => {
    const value = plan.atoms[atom];
    if (value !== undefined) aliases[alias] = value;
  };

  assign('topic_shift', 'topicDelta');
  assign('silence_duration_ms', 'speechGapMs');
  assign('beat_phase', 'beatPhase');
  assign('visual_continuity', 'visualContinuity');
  assign('motion_vector_x', 'motionVectorX');
  assign('motion_vector_y', 'motionVectorY');
  assign('motion_intensity', 'motionIntensity');
  assign('visual_significance', 'visualChange');
  assign('beat_strength', 'beatStrength');
  assign('emotion_intensity', 'emotionJump');
  assign('text_coverage', 'textCoverage');
  assign('text_on_screen', 'textOnScreen');
  assign('subject_position_jump', 'subjectPositionJump');
  assign('subject_size_jump', 'subjectSizeJump');
  assign('shot_scale_delta', 'shotScaleDelta');
  assign('speaker_change', 'speakerChange');
  assign('sentence_continues', 'sentenceContinues');
  assign('semantic_contrast', 'semanticContrast');
  assign('claim_evidence_relation', 'claimEvidenceRelation');
  assign('music_hit', 'musicHit');
  assign('audio_tail_ms', 'audioTailMs');
  assign('color_delta', 'colorDelta');
  assign('brightness_delta', 'brightnessDelta');
  assign('clutter_delta', 'clutterDelta');
  aliases.transition_job_continuity = plan.jobVector.continuity;
  aliases.transition_job_turn = plan.jobVector.turn;
  aliases.transition_job_impact = plan.jobVector.impact;
  aliases.transition_job_motion_transfer = plan.jobVector.motionTransfer;
  aliases.transition_job_jump_hide = plan.jobVector.jumpHide;
  aliases.transition_job_attention_reset = plan.jobVector.attentionReset;
  aliases.transition_job_contrast_reveal = plan.jobVector.contrastReveal;
  aliases.transition_job_audio_bridge = plan.jobVector.audioBridge;
  aliases.transition_job_silence = plan.jobVector.silence;
  aliases.transition_duration_pressure = plan.physicalFormInputs.durationPressure;
  aliases.transition_motion_pressure = plan.physicalFormInputs.motionPressure;
  aliases.transition_sfx_eligibility = plan.physicalFormInputs.sfxEligibility;
  aliases.transition_zoom_bridge_need = plan.physicalFormInputs.zoomBridgeNeed;
  aliases.transition_screen_safety_pressure = plan.physicalFormInputs.screenSafetyPressure;
  aliases.transition_repetition_pressure = plan.physicalFormInputs.repetitionPressure;
  return aliases;
}

function resolveZoomMotionPlan(decision: ReactiveEditDecision): UnifiedZoomMotionPlan | null {
  if (decision.type !== 'zoom' || familyForSignalDecision(decision) !== 'camera') return null;

  const atoms = zoomMotionAtoms(decision);
  const subjectX = zoomAtomNullableNumber(atoms, 'mainSubjectX');
  const subjectY = zoomAtomNullableNumber(atoms, 'mainSubjectY');
  const subjectWidth = zoomAtomNumber(atoms, 'mainSubjectWidth');
  const subjectHeight = zoomAtomNumber(atoms, 'mainSubjectHeight');
  const facePresent = zoomAtomNumber(atoms, 'facePresent');
  const eyeContact = zoomAtomNumber(atoms, 'eyeContact');
  const speechPeak = zoomAtomNumber(atoms, 'speechPeak');
  const wordImportance = zoomAtomNumber(atoms, 'wordImportance');
  const beatStrength = zoomAtomNumber(atoms, 'beatStrength');
  const emotionIntensity = zoomAtomNumber(atoms, 'emotionIntensity');
  const visualSignificance = zoomAtomNumber(atoms, 'visualSignificance');
  const visualMotion = zoomAtomNumber(atoms, 'visualMotion');
  const shotScale = zoomShotScaleValue(atoms, Math.max(subjectWidth, subjectHeight));
  const textOnScreen = zoomAtomNumber(atoms, 'textOnScreen');
  const visualComplexity = zoomAtomNumber(atoms, 'visualComplexity');
  const topicDelta = zoomAtomNumber(atoms, 'topicDelta');
  const cameraMotion = zoomAtomNumber(atoms, 'cameraMotion');
  const subjectMotion = zoomAtomNumber(atoms, 'subjectMotion');
  const directionX = zoomAtomSignedNumber(atoms, 'motionVectorX');
  const directionY = zoomAtomSignedNumber(atoms, 'motionVectorY');
  const directionMagnitude = roundAuditNumber(clamp01(Math.max(Math.abs(directionX), Math.abs(directionY))));
  const currentZoomScale = zoomAtomRawNumber(atoms, 'currentZoomScale');
  const timeSinceLastZoomSec = zoomAtomRawNumber(atoms, 'timeSinceLastZoomSec');
  const recentZoomSimilarity = zoomAtomNumber(atoms, 'recentZoomSimilarity');
  const recentMotionSimilarity = zoomAtomNumber(atoms, 'recentMotionSimilarity');
  const recentZoomDensity = zoomAtomNumber(atoms, 'recentZoomDensity');
  const activeOverlayDensity = zoomAtomNumber(atoms, 'activeOverlayDensity');
  const captionPressure = zoomAtomNumber(atoms, 'captionPressure');
  const mgPressure = zoomAtomNumber(atoms, 'mgPressure');
  const transitionPressure = zoomAtomNumber(atoms, 'transitionPressure');
  const hasSubjectAnchor = zoomHasSubjectAnchor(atoms);
  const subjectGeometry = zoomSubjectGeometry({
    subjectX,
    subjectY,
    subjectWidth,
    subjectHeight,
    shotScale,
    facePresent,
    eyeContact,
    hasSubjectAnchor,
  });
  const motionMemory = zoomMotionMemory({
    timeSinceLastZoomSec,
    recentZoomSimilarity,
    recentMotionSimilarity,
    recentZoomDensity,
  });
  const intensity = roundAuditNumber(clamp01(Math.max(
    speechPeak,
    wordImportance,
    beatStrength,
    emotionIntensity,
    visualSignificance * 0.86,
    visualMotion * 0.72,
    cameraMotion * 0.62,
    subjectMotion * 0.66,
  )));
  const visualPressure = roundAuditNumber(clamp01(Math.max(
    textOnScreen,
    visualComplexity,
    visualMotion * 0.66,
    shotScale * 0.18,
    activeOverlayDensity,
    captionPressure,
    mgPressure,
    transitionPressure,
  )));
  const jobVector = zoomMotionJobVector({
    speechPeak,
    wordImportance,
    beatStrength,
    emotionIntensity,
    visualSignificance,
    visualMotion,
    cameraMotion,
    subjectMotion,
    topicDelta,
    shotScale,
    eyeContact,
    hasSubjectAnchor,
    currentZoomScale,
    directionMagnitude,
    motionMemory,
    visualPressure,
  });
  const physicalFormInputs = zoomPhysicalFormInputs({
    jobVector,
    subjectGeometry,
    motionMemory,
    currentZoomScale,
    visualPressure,
    activeOverlayDensity,
  });
  const crossFamily = zoomCrossFamilyPlan({
    physicalFormInputs,
    captionPressure,
    transitionPressure,
    mgPressure,
  });
  const reasonKeys = zoomMotionReasonKeys({
    speechPeak,
    wordImportance,
    beatStrength,
    emotionIntensity,
    visualSignificance,
    visualMotion,
    cameraMotion,
    subjectMotion,
    directionMagnitude,
    topicDelta,
    shotScale,
    subjectGeometry,
    motionMemory,
    physicalFormInputs,
    hasSubjectAnchor,
    visualPressure,
  });

  if (reasonKeys.length === 0) return null;

  const visualMotionAllowed = intensity >= 0.45
    && physicalFormInputs.screenSafetyPressure < 0.9
    && physicalFormInputs.cropRisk < 0.92
    && physicalFormInputs.repetitionPressure < 0.86;

  return {
    version: 'zoom-motion-plan-v1',
    family: 'zoom',
    source: 'signal-family-planner',
    visualMotionAllowed,
    reasonKeys,
    atoms,
    jobVector,
    subjectGeometry,
    motionMemory,
    physicalFormInputs,
    crossFamily,
    evidence: {
      intensity,
      visualPressure,
      hasSubjectAnchor,
      shotScale,
      directionMagnitude,
      repetitionPressure: physicalFormInputs.repetitionPressure,
      cropRisk: physicalFormInputs.cropRisk,
    },
    calibrationStatus: 'invented-needs-calibration',
  };
}

function zoomMotionAtoms(decision: ReactiveEditDecision): Record<string, string | number | boolean> {
  const atoms = { ...projectSignalFamilyAtoms(decision) };
  const setFallback = (atom: string, aliases: string[]): void => {
    if (atoms[atom] !== undefined) return;
    const value = lookupPrimitiveInRecord(decision.params, aliases, 0);
    if (value !== undefined) atoms[atom] = value;
  };

  setFallback('mainSubjectX', ['mainSubjectX', 'subjectX', 'main_subject_x', 'subject_x']);
  setFallback('mainSubjectY', ['mainSubjectY', 'subjectY', 'main_subject_y', 'subject_y']);
  setFallback('mainSubjectWidth', ['mainSubjectWidth', 'subjectWidth', 'main_subject_width', 'subject_width']);
  setFallback('mainSubjectHeight', ['mainSubjectHeight', 'subjectHeight', 'main_subject_height', 'subject_height']);
  setFallback('facePresent', ['facePresent', 'face_present', 'visual.face_present']);
  setFallback('eyeContact', ['eyeContact', 'eye_contact', 'visual.eye_contact']);
  setFallback('shotScale', ['shotScale', 'shot_scale', 'visual.shot_scale']);
  setFallback('cameraMotion', ['cameraMotion', 'camera_motion', 'visual.camera_motion']);
  setFallback('subjectMotion', ['subjectMotion', 'subject_motion', 'visual.subject_motion']);
  setFallback('motionVectorX', ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
  setFallback('motionVectorY', ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
  setFallback('speechPeak', ['speechPeak', 'speech_energy', 'energy_delta', 'speech.energy']);
  setFallback('wordImportance', ['wordImportance', 'word_importance', 'word.importance']);
  setFallback('beatStrength', ['beatStrength', 'beat_strength', 'music_energy', 'audio.music_energy']);
  setFallback('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity']);
  setFallback('visualSignificance', ['visualSignificance', 'visual_significance', 'visual.significance']);
  setFallback('visualMotion', ['visualMotion', 'motion_intensity', 'visual.motion_intensity']);
  setFallback('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen']);
  setFallback('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity']);
  setFallback('topicDelta', ['topicDelta', 'topic_shift', 'topicShift', 'topic_shift_strength', 'narrative_pressure']);
  setFallback('currentZoomScale', ['currentZoomScale', 'current_zoom_scale']);
  setFallback('timeSinceLastZoomSec', ['timeSinceLastZoomSec', 'time_since_last_zoom', 'seconds_since_last_zoom']);
  setFallback('recentZoomSimilarity', ['recentZoomSimilarity', 'recent_zoom_similarity', 'zoom_repetition']);
  setFallback('recentMotionSimilarity', ['recentMotionSimilarity', 'recent_motion_similarity']);
  setFallback('recentZoomDensity', ['recentZoomDensity', 'recent_zoom_density', 'zoom_density']);
  setFallback('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
  setFallback('captionPressure', ['captionPressure', 'caption_pressure', 'active_caption_pressure']);
  setFallback('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
  setFallback('transitionPressure', ['transitionPressure', 'transition_pressure', 'active_transition_pressure']);
  return atoms;
}

function zoomAtomNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function zoomAtomNullableNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number | null {
  const value = atoms[key];
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function zoomAtomRawNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function zoomAtomSignedNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return roundAuditNumber(Math.max(-1, Math.min(1, value)));
}

function zoomShotScaleValue(
  atoms: Record<string, string | number | boolean>,
  subjectSize: number,
): number {
  const value = atoms.shotScale;
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    const scaleMap: Record<string, number> = {
      ecu: 1,
      'extreme-close-up': 1,
      cu: 0.86,
      close: 0.82,
      'close-up': 0.86,
      mcu: 0.68,
      mediumclose: 0.68,
      'medium-close': 0.68,
      ms: 0.5,
      medium: 0.5,
      mws: 0.36,
      ws: 0.22,
      wide: 0.22,
      ews: 0.1,
      'extreme-wide': 0.1,
    };
    if (scaleMap[key] !== undefined) return scaleMap[key];
  }
  return roundAuditNumber(clamp01(subjectSize));
}

function zoomSubjectGeometry(input: {
  subjectX: number | null;
  subjectY: number | null;
  subjectWidth: number;
  subjectHeight: number;
  shotScale: number;
  facePresent: number;
  eyeContact: number;
  hasSubjectAnchor: boolean;
}): UnifiedZoomMotionPlan['subjectGeometry'] {
  const subjectSize = roundAuditNumber(clamp01(Math.max(input.subjectWidth, input.subjectHeight, input.shotScale)));
  const hasAnchorPoint = input.subjectX !== null || input.subjectY !== null;
  const anchorX = input.subjectX ?? null;
  const anchorY = input.subjectY ?? null;
  const offCenter = hasAnchorPoint
    ? roundAuditNumber(clamp01(Math.max(
        anchorX === null ? 0 : Math.abs(anchorX - 0.5) * 2,
        anchorY === null ? 0 : Math.abs(anchorY - 0.5) * 2,
      )))
    : 0;
  const anchorConfidence = roundAuditNumber(clamp01(Math.max(
    input.hasSubjectAnchor ? 0.62 : 0,
    hasAnchorPoint ? 0.72 : 0,
    input.facePresent * 0.72,
    subjectSize * 0.54,
  )));

  return {
    hasSubjectAnchor: input.hasSubjectAnchor,
    anchorX,
    anchorY,
    subjectSize,
    offCenter,
    shotScale: input.shotScale,
    facePresent: input.facePresent,
    eyeContact: input.eyeContact,
    anchorConfidence,
  };
}

function zoomMotionMemory(input: {
  timeSinceLastZoomSec: number;
  recentZoomSimilarity: number;
  recentMotionSimilarity: number;
  recentZoomDensity: number;
}): UnifiedZoomMotionPlan['motionMemory'] {
  const timeRisk = input.timeSinceLastZoomSec > 0 && input.timeSinceLastZoomSec < 2
    ? clamp01((2 - input.timeSinceLastZoomSec) / 2)
    : 0;
  const repeatedTargetRisk = roundAuditNumber(clamp01(Math.max(
    timeRisk,
    input.recentZoomSimilarity,
    input.recentMotionSimilarity * 0.82,
    input.recentZoomDensity,
  )));

  return {
    timeSinceLastZoomSec: input.timeSinceLastZoomSec > 0 ? roundAuditNumber(input.timeSinceLastZoomSec) : null,
    recentZoomSimilarity: input.recentZoomSimilarity,
    recentMotionSimilarity: input.recentMotionSimilarity,
    recentZoomDensity: input.recentZoomDensity,
    repeatedTargetRisk,
  };
}

function zoomMotionJobVector(input: {
  speechPeak: number;
  wordImportance: number;
  beatStrength: number;
  emotionIntensity: number;
  visualSignificance: number;
  visualMotion: number;
  cameraMotion: number;
  subjectMotion: number;
  topicDelta: number;
  shotScale: number;
  eyeContact: number;
  hasSubjectAnchor: boolean;
  currentZoomScale: number;
  directionMagnitude: number;
  motionMemory: UnifiedZoomMotionPlan['motionMemory'];
  visualPressure: number;
}): UnifiedZoomMotionPlan['jobVector'] {
  const emphasis = roundAuditNumber(clamp01(Math.max(
    input.speechPeak,
    input.wordImportance,
    input.beatStrength,
    input.emotionIntensity,
    input.visualSignificance * 0.86,
  )));
  const intimacy = roundAuditNumber(clamp01(Math.max(
    input.eyeContact * 0.8,
    input.shotScale * 0.68,
    input.hasSubjectAnchor ? 0.48 : 0,
  )));
  const reveal = roundAuditNumber(clamp01(Math.max(
    input.topicDelta,
    input.visualSignificance,
    input.shotScale < 0.32 && input.hasSubjectAnchor ? 0.44 : 0,
  )));
  const reset = roundAuditNumber(clamp01(Math.max(
    input.topicDelta * 0.76,
    input.currentZoomScale >= 1.12 ? 0.66 : 0,
    input.motionMemory.repeatedTargetRisk * 0.52,
  )));
  const drift = roundAuditNumber(clamp01(Math.max(
    input.hasSubjectAnchor && input.visualMotion < 0.22 && input.visualPressure < 0.48 ? 0.46 : 0,
    input.speechPeak >= 0.35 && input.speechPeak < 0.58 ? 0.38 : 0,
  )));
  const motionFollow = roundAuditNumber(clamp01(Math.max(
    input.directionMagnitude,
    input.visualMotion,
    input.cameraMotion,
    input.subjectMotion,
  )));
  const restraint = roundAuditNumber(clamp01(Math.max(
    input.visualPressure,
    input.motionMemory.repeatedTargetRisk,
    input.currentZoomScale >= 1.18 ? 0.78 : 0,
  )));

  return {
    emphasis,
    intimacy,
    reveal,
    reset,
    drift,
    motionFollow,
    restraint,
  };
}

function zoomPhysicalFormInputs(input: {
  jobVector: UnifiedZoomMotionPlan['jobVector'];
  subjectGeometry: UnifiedZoomMotionPlan['subjectGeometry'];
  motionMemory: UnifiedZoomMotionPlan['motionMemory'];
  currentZoomScale: number;
  visualPressure: number;
  activeOverlayDensity: number;
}): UnifiedZoomMotionPlan['physicalFormInputs'] {
  const cropRisk = roundAuditNumber(clamp01(Math.max(
    input.subjectGeometry.subjectSize * 0.72,
    input.currentZoomScale >= 1.18 ? 0.82 : 0,
    input.subjectGeometry.offCenter * 0.24,
  )));
  const screenSafetyPressure = roundAuditNumber(clamp01(Math.max(
    input.visualPressure,
    input.activeOverlayDensity,
    cropRisk * 0.42,
  )));
  const repetitionPressure = roundAuditNumber(clamp01(Math.max(
    input.motionMemory.repeatedTargetRisk,
    input.jobVector.restraint * 0.58,
  )));

  return {
    anchorConfidence: input.subjectGeometry.anchorConfidence,
    pushPressure: roundAuditNumber(clamp01(Math.max(input.jobVector.emphasis, input.jobVector.intimacy * 0.72))),
    pullBackPressure: roundAuditNumber(clamp01(input.jobVector.reset)),
    punchPressure: roundAuditNumber(clamp01(Math.max(input.jobVector.emphasis * 0.82, input.jobVector.motionFollow * 0.62) - screenSafetyPressure * 0.18)),
    driftPressure: roundAuditNumber(clamp01(input.jobVector.drift * (1 - repetitionPressure * 0.5))),
    motionFollowPressure: input.jobVector.motionFollow,
    cropRisk,
    screenSafetyPressure,
    repetitionPressure,
    sfxPairingEligibility: roundAuditNumber(clamp01(Math.max(input.jobVector.emphasis, input.jobVector.motionFollow * 0.74) - screenSafetyPressure * 0.18)),
  };
}

function zoomCrossFamilyPlan(input: {
  physicalFormInputs: UnifiedZoomMotionPlan['physicalFormInputs'];
  captionPressure: number;
  transitionPressure: number;
  mgPressure: number;
}): UnifiedZoomMotionPlan['crossFamily'] {
  return {
    sfxPairingAllowed: input.physicalFormInputs.sfxPairingEligibility >= 0.58 && input.physicalFormInputs.screenSafetyPressure < 0.78,
    captionConflictRisk: roundAuditNumber(clamp01(input.captionPressure)),
    transitionConflictRisk: roundAuditNumber(clamp01(input.transitionPressure)),
    mgConflictRisk: roundAuditNumber(clamp01(input.mgPressure)),
  };
}

function zoomMotionReasonKeys(input: {
  speechPeak: number;
  wordImportance: number;
  beatStrength: number;
  emotionIntensity: number;
  visualSignificance: number;
  visualMotion: number;
  cameraMotion: number;
  subjectMotion: number;
  directionMagnitude: number;
  topicDelta: number;
  shotScale: number;
  subjectGeometry: UnifiedZoomMotionPlan['subjectGeometry'];
  motionMemory: UnifiedZoomMotionPlan['motionMemory'];
  physicalFormInputs: UnifiedZoomMotionPlan['physicalFormInputs'];
  hasSubjectAnchor: boolean;
  visualPressure: number;
}): string[] {
  const reasonKeys: string[] = [];
  if (input.speechPeak >= 0.58) reasonKeys.push('speech-peak');
  if (input.wordImportance >= 0.58) reasonKeys.push('word-importance');
  if (input.beatStrength >= 0.62) reasonKeys.push('beat');
  if (input.emotionIntensity >= 0.58) reasonKeys.push('emotion');
  if (input.visualSignificance >= 0.48) reasonKeys.push('visual-significance');
  if (input.visualMotion >= 0.48) reasonKeys.push('visual-motion');
  if (input.cameraMotion >= 0.48) reasonKeys.push('camera-motion');
  if (input.subjectMotion >= 0.48) reasonKeys.push('subject-motion');
  if (input.directionMagnitude >= 0.32) reasonKeys.push('motion-direction');
  if (input.topicDelta >= 0.62) reasonKeys.push('topic-shift');
  if (input.shotScale >= 0.42) reasonKeys.push('shot-scale');
  if (input.hasSubjectAnchor) reasonKeys.push('subject-anchor');
  if (input.subjectGeometry.offCenter >= 0.42) reasonKeys.push('subject-off-center');
  if (input.motionMemory.timeSinceLastZoomSec !== null && input.motionMemory.timeSinceLastZoomSec < 3) reasonKeys.push('recent-zoom');
  if (input.physicalFormInputs.repetitionPressure >= 0.58) reasonKeys.push('repetition-pressure');
  if (input.physicalFormInputs.cropRisk >= 0.72) reasonKeys.push('crop-risk');
  if (input.visualPressure >= 0.72) reasonKeys.push('visual-pressure');
  return reasonKeys;
}

function zoomHasSubjectAnchor(atoms: Record<string, string | number | boolean>): boolean {
  return zoomAtomNumber(atoms, 'mainSubjectX') > 0
    || zoomAtomNumber(atoms, 'mainSubjectY') > 0
    || zoomAtomNumber(atoms, 'mainSubjectWidth') > 0
    || zoomAtomNumber(atoms, 'mainSubjectHeight') > 0
    || zoomAtomNumber(atoms, 'facePresent') >= 0.5;
}

function zoomSignalAliases(plan: UnifiedZoomMotionPlan): Record<string, unknown> {
  const aliases: Record<string, unknown> = {};
  const assign = (alias: string, atom: string): void => {
    const value = plan.atoms[atom];
    if (value !== undefined) aliases[alias] = value;
  };

  assign('main_subject_x', 'mainSubjectX');
  assign('main_subject_y', 'mainSubjectY');
  assign('main_subject_width', 'mainSubjectWidth');
  assign('main_subject_height', 'mainSubjectHeight');
  assign('face_present', 'facePresent');
  assign('eye_contact', 'eyeContact');
  assign('shot_scale', 'shotScale');
  assign('motion_vector_x', 'motionVectorX');
  assign('motion_vector_y', 'motionVectorY');
  assign('camera_motion', 'cameraMotion');
  assign('subject_motion', 'subjectMotion');
  assign('speech_energy', 'speechPeak');
  assign('word_importance', 'wordImportance');
  assign('beat_strength', 'beatStrength');
  assign('emotion_intensity', 'emotionIntensity');
  assign('visual_significance', 'visualSignificance');
  assign('motion_intensity', 'visualMotion');
  assign('text_on_screen', 'textOnScreen');
  assign('visual_complexity', 'visualComplexity');
  assign('topic_shift', 'topicDelta');
  assign('time_since_last_zoom', 'timeSinceLastZoomSec');
  assign('recent_zoom_similarity', 'recentZoomSimilarity');
  assign('recent_motion_similarity', 'recentMotionSimilarity');
  assign('recent_zoom_density', 'recentZoomDensity');
  assign('active_overlay_density', 'activeOverlayDensity');
  aliases.zoom_job_emphasis = plan.jobVector.emphasis;
  aliases.zoom_job_intimacy = plan.jobVector.intimacy;
  aliases.zoom_job_reveal = plan.jobVector.reveal;
  aliases.zoom_job_reset = plan.jobVector.reset;
  aliases.zoom_job_drift = plan.jobVector.drift;
  aliases.zoom_job_motion_follow = plan.jobVector.motionFollow;
  aliases.zoom_job_restraint = plan.jobVector.restraint;
  aliases.zoom_anchor_confidence = plan.physicalFormInputs.anchorConfidence;
  aliases.zoom_push_pressure = plan.physicalFormInputs.pushPressure;
  aliases.zoom_pull_back_pressure = plan.physicalFormInputs.pullBackPressure;
  aliases.zoom_punch_pressure = plan.physicalFormInputs.punchPressure;
  aliases.zoom_drift_pressure = plan.physicalFormInputs.driftPressure;
  aliases.zoom_motion_follow_pressure = plan.physicalFormInputs.motionFollowPressure;
  aliases.zoom_crop_risk = plan.physicalFormInputs.cropRisk;
  aliases.zoom_repetition_pressure = plan.physicalFormInputs.repetitionPressure;
  aliases.zoom_screen_safety_pressure = plan.physicalFormInputs.screenSafetyPressure;
  return aliases;
}

function resolveCaptionMomentPlan(decision: ReactiveEditDecision): UnifiedCaptionMomentPlan | null {
  if (decision.type !== 'caption-emphasis' || familyForSignalDecision(decision) !== 'caption') return null;

  const atoms = captionMomentAtoms(decision);
  const speechRateWpm = signalAtomRawNumber(atoms, 'speechRate');
  const speechPace = roundAuditNumber(clamp01(speechRateWpm / 220));
  const speechPeak = signalAtomNumber(atoms, 'speechPeak');
  const wordImportance = signalAtomNumber(atoms, 'wordImportance');
  const phraseImpact = signalAtomNumber(atoms, 'phraseImpact');
  const emotionIntensity = signalAtomNumber(atoms, 'emotionIntensity');
  const beatStrength = signalAtomNumber(atoms, 'beatStrength');
  const visualComplexity = signalAtomNumber(atoms, 'visualComplexity');
  const textOnScreen = signalAtomNumber(atoms, 'textOnScreen');
  const negativeSpaceBottom = captionAtomNumberWithDefault(atoms, 'negativeSpaceBottom', 0.55);
  const safeZoneBottom = signalAtomNumber(atoms, 'safeZoneBottom');
  const faceBottom = signalAtomNumber(atoms, 'faceBottom');
  const subjectBottom = signalAtomNumber(atoms, 'subjectBottom');
  const activeOverlayDensity = signalAtomNumber(atoms, 'activeOverlayDensity');
  const mgPressure = signalAtomNumber(atoms, 'mgPressure');
  const zoomPressure = signalAtomNumber(atoms, 'zoomPressure');
  const transitionPressure = signalAtomNumber(atoms, 'transitionPressure');
  const captionDensity = signalAtomNumber(atoms, 'captionDensity');
  const captionRepetition = signalAtomNumber(atoms, 'captionRepetition');
  const speechCoverage = signalAtomNumber(atoms, 'speechCoverage');
  const phraseBoundary = signalAtomNumber(atoms, 'phraseBoundary');
  const sentenceBoundary = signalAtomNumber(atoms, 'sentenceBoundary');
  const formality = signalAtomNumber(atoms, 'formality');
  const brandContrast = captionAtomNumberWithDefault(atoms, 'brandContrast', 0.58);
  const brandCaptionEnergy = signalAtomNumber(atoms, 'brandCaptionEnergy');
  const phraseWordCount = captionPhraseWordCount(decision, atoms);
  const readableWindowFrames = captionReadableWindowFrames(decision, atoms);
  const minReadableDurationFrames = captionMinReadableDurationFrames(phraseWordCount, speechRateWpm);
  const readingSpeedRisk = roundAuditNumber(clamp01(speechRateWpm > 0 ? (speechRateWpm - 160) / 80 : 0));
  const durationPressure = roundAuditNumber(clamp01(
    readableWindowFrames > 0
      ? (minReadableDurationFrames - readableWindowFrames) / Math.max(1, minReadableDurationFrames)
      : phraseWordCount >= 5 ? 0.22 : 0,
  ));
  const splitPressure = roundAuditNumber(clamp01(Math.max(
    readingSpeedRisk,
    durationPressure,
    phraseWordCount > 5 ? (phraseWordCount - 5) / 8 : 0,
    phraseBoundary > 0 ? 0.42 : 0,
    sentenceBoundary > 0 ? 0.35 : 0,
  )));
  const lineBreakPressure = roundAuditNumber(clamp01(Math.max(
    signalAtomRawNumber(atoms, 'textLength') / 64,
    phraseWordCount > 4 ? (phraseWordCount - 4) / 8 : 0,
    signalAtomNumber(atoms, 'lineBreakCount') * 0.42,
  )));
  const safeZonePressure = roundAuditNumber(clamp01(Math.max(
    safeZoneBottom,
    Math.max(0, 0.42 - negativeSpaceBottom) / 0.42,
    faceBottom,
    subjectBottom * 0.72,
  )));
  const contrastNeed = roundAuditNumber(clamp01(Math.max(
    visualComplexity * 0.7,
    textOnScreen * 0.86,
    1 - brandContrast,
  )));
  const collisionRisk = roundAuditNumber(clamp01(Math.max(
    mgPressure,
    activeOverlayDensity,
    textOnScreen * 0.82,
    safeZonePressure * 0.78,
  )));
  const hasTextAnchor = captionHasTextAnchor(decision, atoms);
  const salience = roundAuditNumber(clamp01(Math.max(
    wordImportance,
    phraseImpact,
    speechPeak,
    emotionIntensity * 0.9,
    beatStrength * 0.72,
    hasTextAnchor ? signalExecutionConfidence(decision) * 0.65 : 0,
  )));
  const readabilityPressure = roundAuditNumber(clamp01(Math.max(
    textOnScreen,
    visualComplexity,
    speechPace * 0.56,
    readingSpeedRisk,
    durationPressure,
    collisionRisk * 0.86,
    contrastNeed * 0.7,
  )));
  const emphasisPunch = roundAuditNumber(clamp01(Math.max(
    salience,
    phraseImpact * 0.94,
    speechPeak * 0.9,
    beatStrength * 0.72,
  )));
  const subtitleClarity = roundAuditNumber(clamp01(Math.max(
    readabilityPressure,
    formality * 0.8,
    readingSpeedRisk,
    speechCoverage * 0.72,
  )));
  const phraseGrouping = roundAuditNumber(clamp01(Math.max(
    splitPressure,
    lineBreakPressure,
    readingSpeedRisk,
    phraseBoundary,
    sentenceBoundary * 0.82,
  )));
  const restraint = roundAuditNumber(clamp01(Math.max(
    readabilityPressure * 0.84,
    collisionRisk,
    captionRepetition,
    captionDensity * 0.72,
  )));
  const jobVector = {
    subtitleClarity,
    emphasisPunch,
    phraseGrouping,
    hold: roundAuditNumber(clamp01(Math.max(sentenceBoundary * 0.62, phraseImpact * 0.44, speechPace < 0.58 ? emotionIntensity * 0.36 : 0))),
    kinetic: roundAuditNumber(clamp01(Math.max((1 - formality) * speechPeak * (1 - readingSpeedRisk), wordImportance * 0.54, brandCaptionEnergy * 0.42))),
    restraint,
  };
  const grouping = {
    speechRateWpm: roundAuditNumber(speechRateWpm),
    phraseWordCount,
    readableWindowFrames: roundAuditNumber(readableWindowFrames),
    minReadableDurationFrames: roundAuditNumber(minReadableDurationFrames),
    durationPressure,
    splitPressure,
    lineBreakPressure,
  };
  const readability = {
    readabilityPressure,
    speechPace,
    visualComplexity,
    textOnScreen,
    negativeSpaceBottom,
    safeZonePressure,
    contrastNeed,
    collisionRisk,
    readingSpeedRisk,
  };
  const styleIntent = {
    subtitleMode: roundAuditNumber(clamp01(Math.max(formality * (1 - Math.max(0, speechPace - 0.72)), readingSpeedRisk, subtitleClarity * 0.56))),
    phraseMode: roundAuditNumber(clamp01(Math.max(phraseGrouping, readingSpeedRisk, formality > 0.35 && formality < 0.75 ? 0.5 : 0))),
    wordByWord: roundAuditNumber(clamp01(Math.max(jobVector.kinetic, speechRateWpm > 180 ? 0 : (1 - formality) * emphasisPunch * 0.72))),
    emphasisScale: roundAuditNumber(clamp01(emphasisPunch * (1 - readabilityPressure * 0.35))),
    surfaceNeed: roundAuditNumber(clamp01(Math.max(contrastNeed, visualComplexity, textOnScreen))),
    brandFitPressure: roundAuditNumber(clamp01(Math.max(formality, brandCaptionEnergy, 1 - brandContrast))),
    formality,
  };
  const crossFamily = {
    mgConflictRisk: mgPressure,
    zoomConflictRisk: zoomPressure,
    transitionConflictRisk: transitionPressure,
    sfxPairingAllowed: emphasisPunch >= 0.68 && readabilityPressure < 0.82 && collisionRisk < 0.72,
  };
  const reasonKeys = captionMomentReasonKeys({
    atoms,
    decision,
    hasTextAnchor,
    salience,
    speechPace,
    wordImportance,
    speechPeak,
    phraseImpact,
    emotionIntensity,
    beatStrength,
    readabilityPressure,
    readingSpeedRisk,
    collisionRisk,
    splitPressure,
    lineBreakPressure,
    safeZonePressure,
    jobVector,
    styleIntent,
  });

  if (!hasTextAnchor) return null;

  const emphasisAllowed = hasTextAnchor
    && salience >= 0.38
    && readabilityPressure < 0.9
    && collisionRisk < 0.88
    && jobVector.restraint < 0.88;

  return {
    version: 'caption-moment-plan-v1',
    family: 'caption',
    source: 'signal-family-planner',
    emphasisAllowed,
    reasonKeys,
    atoms,
    jobVector,
    grouping,
    readability,
    styleIntent,
    crossFamily,
    evidence: {
      salience,
      readabilityPressure,
      speechPace,
      hasTextAnchor,
      phraseImpact,
      emphasisPunch,
      readingSpeedRisk,
      collisionRisk,
    },
    calibrationStatus: 'invented-needs-calibration',
  };
}

function captionMomentAtoms(decision: ReactiveEditDecision): Record<string, string | number | boolean> {
  const atoms = { ...projectSignalFamilyAtoms(decision) };
  const setFallback = (atom: string, aliases: string[]): void => {
    if (atoms[atom] !== undefined) return;
    const value = lookupPrimitiveInRecord(decision.params, aliases, 0);
    if (value !== undefined) atoms[atom] = value;
  };

  setFallback('text', ['text', 'captionText']);
  setFallback('keyword', ['keyword', 'targetWord', 'word', 'emphasisWord', 'phrase']);
  setFallback('phrase', ['phrase', 'captionPhrase']);
  setFallback('wordRange', ['wordRange']);
  setFallback('startWordIndex', ['startWordIndex']);
  setFallback('endWordIndex', ['endWordIndex']);
  setFallback('semanticRole', ['semanticRole', 'role']);
  setFallback('speechRate', ['speechRate', 'speaking_rate_wpm']);
  setFallback('speechPeak', ['speechPeak', 'speech_energy']);
  setFallback('wordImportance', ['wordImportance', 'word_importance', 'emphasisIntensity']);
  setFallback('phraseImpact', ['phraseImpact', 'visceral_impact', 'claim_strength']);
  setFallback('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal']);
  setFallback('beatStrength', ['beatStrength', 'beat_strength', 'music_energy']);
  setFallback('visualComplexity', ['visualComplexity', 'visual_complexity']);
  setFallback('textOnScreen', ['textOnScreen', 'text_on_screen']);
  setFallback('negativeSpaceBottom', ['negativeSpaceBottom', 'negative_space_bottom']);
  setFallback('phraseWordCount', ['phraseWordCount', 'word_count', 'caption_word_count']);
  setFallback('captionDurationMs', ['captionDurationMs', 'duration_ms', 'display_duration_ms']);
  setFallback('captionSpanFrames', ['captionSpanFrames', 'durationFrames']);
  setFallback('lineBreakCount', ['lineBreakCount', 'line_break_count']);
  setFallback('maxCharsPerLine', ['maxCharsPerLine', 'max_chars_per_line']);
  setFallback('textLength', ['textLength', 'text_length', 'caption_text_length']);
  setFallback('formality', ['formality', 'speech.formality', 'brand.formality']);
  setFallback('brandContrast', ['brandContrast', 'brand_contrast', 'caption_contrast']);
  setFallback('brandCaptionEnergy', ['brandCaptionEnergy', 'brand_caption_energy', 'caption_energy']);
  setFallback('safeZoneBottom', ['safeZoneBottom', 'safe_zone_bottom', 'caption_safe_zone_pressure']);
  setFallback('negativeSpaceTop', ['negativeSpaceTop', 'negative_space_top']);
  setFallback('negativeSpaceCenter', ['negativeSpaceCenter', 'negative_space_center']);
  setFallback('subjectBottom', ['subjectBottom', 'subject_bottom']);
  setFallback('faceBottom', ['faceBottom', 'face_bottom']);
  setFallback('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
  setFallback('zoomPressure', ['zoomPressure', 'zoom_pressure', 'active_zoom_pressure']);
  setFallback('transitionPressure', ['transitionPressure', 'transition_pressure', 'active_transition_pressure']);
  setFallback('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
  setFallback('phraseBoundary', ['phraseBoundary', 'phrase_boundary']);
  setFallback('sentenceBoundary', ['sentenceBoundary', 'sentence_boundary']);
  setFallback('cutBoundaryDistanceFrames', ['cutBoundaryDistanceFrames', 'cut_boundary_distance_frames']);
  setFallback('speechCoverage', ['speechCoverage', 'speech_coverage']);
  setFallback('captionDensity', ['captionDensity', 'caption_density']);
  setFallback('captionRepetition', ['captionRepetition', 'caption_repetition']);
  return atoms;
}

function captionAtomNumberWithDefault(
  atoms: Record<string, string | number | boolean>,
  key: string,
  fallback: number,
): number {
  const value = atoms[key];
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return clamp01(fallback);
}

function captionPhraseWordCount(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): number {
  const explicitCount = signalAtomRawNumber(atoms, 'phraseWordCount');
  if (explicitCount > 0) return Math.max(1, Math.round(explicitCount));

  for (const key of ['phrase', 'text', 'keyword'] as const) {
    const value = typeof atoms[key] === 'string' ? atoms[key] : decision.params[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return Math.max(1, value.trim().split(/\s+/).length);
    }
  }
  return 1;
}

function captionReadableWindowFrames(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): number {
  const explicitFrames = signalAtomRawNumber(atoms, 'captionSpanFrames');
  if (explicitFrames > 0) return explicitFrames;

  const durationMs = signalAtomRawNumber(atoms, 'captionDurationMs');
  if (durationMs > 0) return durationMs / (1000 / 30);

  return decision.durationFrames && Number.isFinite(decision.durationFrames)
    ? Math.max(0, decision.durationFrames)
    : 0;
}

function captionMinReadableDurationFrames(phraseWordCount: number, speechRateWpm: number): number {
  const baseFrames = 30;
  const wordFrames = Math.max(0, phraseWordCount - 1) * (speechRateWpm > 180 ? 7 : 9);
  return Math.min(120, baseFrames + wordFrames);
}

function captionHasTextAnchor(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): boolean {
  return [
    'text',
    'keyword',
    'phrase',
    'wordRange',
    'startWordIndex',
    'endWordIndex',
    'semanticRole',
    'momentId',
  ].some((key) => hasDirectParamValue(decision.params[key]) || hasDirectParamValue(atoms[key]));
}

function captionMomentReasonKeys(input: {
  atoms: Record<string, string | number | boolean>;
  decision: ReactiveEditDecision;
  hasTextAnchor: boolean;
  salience: number;
  speechPace: number;
  wordImportance: number;
  speechPeak: number;
  phraseImpact: number;
  emotionIntensity: number;
  beatStrength: number;
  readabilityPressure: number;
  readingSpeedRisk: number;
  collisionRisk: number;
  splitPressure: number;
  lineBreakPressure: number;
  safeZonePressure: number;
  jobVector: UnifiedCaptionMomentPlan['jobVector'];
  styleIntent: UnifiedCaptionMomentPlan['styleIntent'];
}): string[] {
  const reasonKeys: string[] = [];
  if (input.hasTextAnchor) reasonKeys.push('text-anchor');
  if (input.wordImportance >= 0.5) reasonKeys.push('word-importance');
  if (input.speechPeak >= 0.55) reasonKeys.push('speech-peak');
  if (input.phraseImpact >= 0.5) reasonKeys.push('phrase-impact');
  if (input.emotionIntensity >= 0.58) reasonKeys.push('emotion');
  if (input.beatStrength >= 0.62) reasonKeys.push('beat');
  if (input.speechPace >= 0.72) reasonKeys.push('fast-speech');
  if (input.readabilityPressure >= 0.72) reasonKeys.push('readability-pressure');
  if (input.readingSpeedRisk >= 0.35) reasonKeys.push('speaking-rate');
  if (input.collisionRisk >= 0.55) reasonKeys.push('caption-collision-risk');
  if (input.splitPressure >= 0.45) reasonKeys.push('phrase-grouping');
  if (input.lineBreakPressure >= 0.45) reasonKeys.push('line-break-pressure');
  if (input.safeZonePressure >= 0.55) reasonKeys.push('safe-zone-pressure');
  if (input.jobVector.hold >= 0.35) reasonKeys.push('hold-intent');
  if (input.jobVector.kinetic >= 0.45) reasonKeys.push('kinetic-intent');
  if (input.styleIntent.subtitleMode >= 0.55) reasonKeys.push('subtitle-mode');
  if (input.styleIntent.phraseMode >= 0.55) reasonKeys.push('phrase-mode');
  if (input.styleIntent.wordByWord >= 0.55) reasonKeys.push('word-by-word-intent');
  if (hasAnyParam(input.decision, ['momentId', 'segmentId']) || input.atoms.momentId !== undefined) reasonKeys.push('moment-anchor');
  if (input.salience >= 0.58) reasonKeys.push('salient-caption-moment');
  return [...new Set(reasonKeys)];
}

function captionSignalAliases(plan: UnifiedCaptionMomentPlan): Record<string, unknown> {
  const aliases: Record<string, unknown> = {};
  const assign = (alias: string, atom: string): void => {
    const value = plan.atoms[atom];
    if (value !== undefined) aliases[alias] = value;
  };

  assign('speaking_rate_wpm', 'speechRate');
  assign('speech_energy', 'speechPeak');
  assign('word_importance', 'wordImportance');
  assign('phrase_impact', 'phraseImpact');
  assign('emotion_intensity', 'emotionIntensity');
  assign('beat_strength', 'beatStrength');
  assign('visual_complexity', 'visualComplexity');
  assign('text_on_screen', 'textOnScreen');
  assign('negative_space_bottom', 'negativeSpaceBottom');
  assign('caption_phrase_word_count', 'phraseWordCount');
  assign('caption_duration_ms', 'captionDurationMs');
  assign('caption_span_frames', 'captionSpanFrames');
  assign('caption_text_length', 'textLength');
  assign('caption_formality', 'formality');
  assign('caption_mg_pressure', 'mgPressure');
  assign('caption_active_overlay_density', 'activeOverlayDensity');
  aliases.caption_salience = plan.evidence.salience;
  aliases.caption_readability_pressure = plan.readability.readabilityPressure;
  aliases.caption_speech_pace = plan.readability.speechPace;
  aliases.caption_reading_speed_risk = plan.readability.readingSpeedRisk;
  aliases.caption_collision_risk = plan.readability.collisionRisk;
  aliases.caption_split_pressure = plan.grouping.splitPressure;
  aliases.caption_line_break_pressure = plan.grouping.lineBreakPressure;
  aliases.caption_style_subtitle_mode = plan.styleIntent.subtitleMode;
  aliases.caption_style_phrase_mode = plan.styleIntent.phraseMode;
  aliases.caption_style_word_by_word = plan.styleIntent.wordByWord;
  aliases.caption_emphasis_scale = plan.styleIntent.emphasisScale;
  aliases.caption_surface_need = plan.styleIntent.surfaceNeed;
  aliases.caption_mg_conflict_risk = plan.crossFamily.mgConflictRisk;
  return aliases;
}

function resolveSfxSyncPlan(decision: ReactiveEditDecision): UnifiedSfxSyncPlan | null {
  if ((decision.type !== 'sfx' && decision.type !== 'sfx-trigger') || familyForSignalDecision(decision) !== 'audio') return null;

  const sfxType = normalizeParamString(decision.params.sfxType ?? decision.params.type);
  if (!sfxType || sfxType === 'none') return null;

  const atoms = sfxSyncAtoms(decision);
  const transitionAnchored = isTransitionAnchoredSfx(decision);
  const syncAnchor = sfxSyncAnchorKind(decision, atoms);
  const beatStrength = signalAtomNumber(atoms, 'beatStrength');
  const phraseImpact = signalAtomNumber(atoms, 'phraseImpact');
  const transitionEnergy = signalAtomNumber(atoms, 'transitionEnergy');
  const topicDelta = signalAtomNumber(atoms, 'topicDelta');
  const visualMotion = signalAtomNumber(atoms, 'visualMotion');
  const providerQuality = signalAtomNumber(atoms, 'providerQuality');
  const providerConfidence = signalAtomNumber(atoms, 'providerConfidence');
  const assetQualityFloor = sfxAtomNumberWithDefault(atoms, 'assetQualityFloor', 0.62);
  const speechEnergy = signalAtomNumber(atoms, 'speechEnergy');
  const speechLoudness = signalAtomNumber(atoms, 'speechLoudness');
  const musicEnergy = signalAtomNumber(atoms, 'musicEnergy');
  const musicLoudness = signalAtomNumber(atoms, 'musicLoudness');
  const activeOverlayDensity = signalAtomNumber(atoms, 'activeOverlayDensity');
  const recentSfxDensity = signalAtomNumber(atoms, 'recentSfxDensity');
  const captionPressure = signalAtomNumber(atoms, 'captionPressure');
  const mgPressure = signalAtomNumber(atoms, 'mgPressure');
  const zoomPressure = signalAtomNumber(atoms, 'zoomPressure');
  const brandRestraint = signalAtomNumber(atoms, 'brandRestraint');
  const silencePocketMs = signalAtomRawNumber(atoms, 'silencePocketMs');
  const hasBeatAnchor = sfxHasBeatAnchor(decision, atoms);
  const hasLinkedOverlay = hasAnyParam(decision, ['linkedOverlayId']) || atoms.linkedOverlayId !== undefined;
  const hasTransitionEvidence = !transitionAnchored || hasTransitionSfxBoundaryEvidence(decision);
  const syncWindow = sfxSyncWindow(decision, atoms, syncAnchor, transitionAnchored, hasTransitionEvidence);
  const crossFamily = sfxCrossFamily(decision, atoms, syncAnchor, transitionAnchored, hasLinkedOverlay);
  const hasRealSyncAnchor = syncWindow.anchorFrame !== null
    || hasBeatAnchor
    || (transitionAnchored && hasTransitionEvidence)
    || hasLinkedOverlay;
  const anchoredTokenImpact = hasRealSyncAnchor
    ? sfxCompatibilityTokenImpact(sfxType)
    : 0;
  const impact = roundAuditNumber(clamp01(Math.max(
    phraseImpact,
    beatStrength * 0.86,
    transitionEnergy * 0.82,
    anchoredTokenImpact,
    transitionAnchored ? 0.62 : 0,
  )));
  const jobVector = {
    impact,
    glue: roundAuditNumber(clamp01(Math.max(
      transitionAnchored ? 0.58 : 0,
      transitionEnergy * 0.86,
      beatStrength * 0.46,
      visualMotion * 0.38,
    ))),
    build: roundAuditNumber(clamp01(Math.max(
      sfxType.includes('riser') ? 0.7 : 0,
      topicDelta * 0.44,
      beatStrength * 0.38,
      transitionEnergy * 0.34,
    ))),
    texture: roundAuditNumber(clamp01(Math.max(
      sfxType.includes('ambient') || sfxType.includes('foley') ? 0.72 : 0,
      silencePocketMs >= 220 ? 0.42 : 0,
      visualMotion * 0.28,
    ))),
    restraint: 0,
  };
  const syncConfidence = roundAuditNumber(clamp01(Math.max(
    beatStrength,
    phraseImpact,
    transitionAnchored && hasTransitionEvidence ? 0.74 : 0,
    hasBeatAnchor ? 0.68 : 0,
    hasLinkedOverlay ? 0.64 : 0,
    syncWindow.exactSyncPressure * 0.72,
    silencePocketMs >= 140 ? 0.48 : 0,
  )));
  const providerHasEvidence = hasDirectParamValue(atoms.providerQuality)
    || hasDirectParamValue(atoms.providerConfidence)
    || hasDirectParamValue(decision.params.providerQuality)
    || hasDirectParamValue(decision.params.asset_quality)
    || hasDirectParamValue(decision.params.candidateQuality);
  const providerRisk = roundAuditNumber(providerHasEvidence
    ? clamp01(Math.max(0, assetQualityFloor - providerQuality) / Math.max(0.01, assetQualityFloor))
    : 0);
  const speechConflict = roundAuditNumber(clamp01(Math.max(speechEnergy, speechLoudness)));
  const musicConflict = roundAuditNumber(clamp01(Math.max(musicEnergy, musicLoudness)));
  const overmixRisk = roundAuditNumber(clamp01(Math.max(
    speechConflict * 0.48,
    musicConflict * 0.36,
    activeOverlayDensity * 0.72,
    recentSfxDensity * 0.94,
    captionPressure * 0.62,
    mgPressure * 0.58,
    zoomPressure * 0.48,
  )));
  const mixSafety = {
    speechConflict,
    musicConflict,
    overlayDensity: roundAuditNumber(activeOverlayDensity),
    recentSfxDensity: roundAuditNumber(recentSfxDensity),
    overmixRisk,
    silenceNeed: roundAuditNumber(clamp01(Math.max(overmixRisk, brandRestraint, providerRisk * 0.78))),
  };
  const providerGate = {
    providerQuality: roundAuditNumber(providerQuality),
    providerConfidence: roundAuditNumber(providerConfidence),
    assetQualityFloor: roundAuditNumber(assetQualityFloor),
    providerRisk,
    externalSourceRequired: true,
    cachePreferred: Boolean(atoms.cacheHit) || providerHasEvidence,
  };
  const restraint = roundAuditNumber(clamp01(Math.max(
    mixSafety.silenceNeed,
    speechEnergy * 0.42,
    providerRisk * 0.64,
  )));
  jobVector.restraint = restraint;
  const reasonKeys = sfxSyncReasonKeys({
    beatStrength,
    phraseImpact,
    transitionAnchored,
    hasTransitionEvidence,
    hasBeatAnchor,
    hasLinkedOverlay,
    silencePocketMs,
    impact,
    syncConfidence,
    syncWindow,
    mixSafety,
    providerGate,
    crossFamily,
    jobVector,
  });

  if (reasonKeys.length === 0) return null;

  const hasUsefulJob = impact >= 0.42 || jobVector.build >= 0.5 || jobVector.texture >= 0.5;
  const providerHardFail = providerHasEvidence && providerQuality < Math.max(0.35, assetQualityFloor - 0.2);
  const placementAllowed = hasTransitionEvidence
    && hasRealSyncAnchor
    && syncConfidence >= 0.45
    && hasUsefulJob
    && syncWindow.driftRisk < 0.55
    && mixSafety.overmixRisk < 0.92
    && restraint < 0.95
    && !providerHardFail;

  return {
    version: 'sfx-sync-plan-v1',
    family: 'audio',
    source: 'signal-family-planner',
    placementAllowed,
    reasonKeys,
    atoms,
    jobVector,
    syncWindow,
    mixSafety,
    providerGate,
    crossFamily,
    evidence: {
      syncConfidence,
      impact,
      restraint,
      transitionAnchored,
      providerQuality: roundAuditNumber(providerQuality),
      overmixRisk,
      driftRisk: syncWindow.driftRisk,
      exactSyncPressure: syncWindow.exactSyncPressure,
    },
    calibrationStatus: 'invented-needs-calibration',
  };
}

function sfxSyncAtoms(decision: ReactiveEditDecision): Record<string, string | number | boolean> {
  const atoms = { ...projectSignalFamilyAtoms(decision) };
  const setFallback = (atom: string, aliases: string[]): void => {
    if (atoms[atom] !== undefined) return;
    const value = lookupPrimitiveInRecord(decision.params, aliases, 0);
    if (value !== undefined) atoms[atom] = value;
  };

  setFallback('sfxType', ['sfxType', 'type']);
  setFallback('beatFrame', ['beatFrame', 'targetBeatFrame']);
  setFallback('anchorFrame', ['anchorFrame', 'targetFrame']);
  setFallback('linkedOverlayId', ['linkedOverlayId']);
  setFallback('syncAnchor', ['sfxAnchor', 'syncAnchor', 'anchor']);
  setFallback('syncFrame', ['syncFrame', 'targetSyncFrame']);
  setFallback('transitionFrame', ['transitionFrame', 'boundaryFrame', 'cutFrame']);
  setFallback('mgLandingFrame', ['mgLandingFrame', 'graphicLandingFrame', 'overlayLandingFrame']);
  setFallback('zoomPeakFrame', ['zoomPeakFrame', 'zoomImpactFrame']);
  setFallback('captionEmphasisFrame', ['captionEmphasisFrame', 'keywordFrame', 'wordEmphasisFrame']);
  setFallback('motionPeakFrame', ['motionPeakFrame', 'visualMotionPeakFrame']);
  setFallback('transitionEnergy', ['transitionEnergy', 'topicDelta', 'topic_shift', 'motion_intensity']);
  setFallback('topicDelta', ['topicDelta', 'topic_shift', 'narrative_pressure']);
  setFallback('visualMotion', ['visualMotion', 'motion_intensity', 'visual_motion']);
  setFallback('beatStrength', ['beatStrength', 'beat_strength', 'music_energy']);
  setFallback('phraseImpact', ['phraseImpact', 'visceral_impact', 'speech_energy']);
  setFallback('silencePocketMs', ['silencePocketMs', 'speechGapMs', 'silence_duration_ms']);
  setFallback('speechEnergy', ['speechEnergy', 'speech_energy']);
  setFallback('musicEnergy', ['musicEnergy', 'music_energy']);
  setFallback('musicLoudness', ['musicLoudness', 'music_loudness']);
  setFallback('speechLoudness', ['speechLoudness', 'speech_loudness']);
  setFallback('providerQuality', ['providerQuality', 'asset_quality', 'candidateQuality']);
  setFallback('providerConfidence', ['providerConfidence', 'asset_confidence', 'candidateConfidence']);
  setFallback('assetQualityFloor', ['assetQualityFloor', 'qualityFloor']);
  setFallback('activeOverlayDensity', ['activeOverlayDensity', 'active_overlay_density', 'recent_overlay_density']);
  setFallback('recentSfxDensity', ['recentSfxDensity', 'recent_sfx_density', 'sfx_density']);
  setFallback('captionPressure', ['captionPressure', 'caption_pressure', 'active_caption_pressure']);
  setFallback('mgPressure', ['mgPressure', 'mg_pressure', 'active_mg_pressure']);
  setFallback('zoomPressure', ['zoomPressure', 'zoom_pressure', 'active_zoom_pressure']);
  setFallback('brandRestraint', ['brandRestraint', 'brand_restraint', 'audio_restraint']);
  setFallback('cacheHit', ['cacheHit', 'asset_cache_hit', 'sfx_cache_hit']);
  return atoms;
}

function sfxHasBeatAnchor(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): boolean {
  return ['beatFrame', 'anchorFrame'].some((key) => hasDirectParamValue(decision.params[key]) || hasDirectParamValue(atoms[key]));
}

function sfxSyncReasonKeys(input: {
  beatStrength: number;
  phraseImpact: number;
  transitionAnchored: boolean;
  hasTransitionEvidence: boolean;
  hasBeatAnchor: boolean;
  hasLinkedOverlay: boolean;
  silencePocketMs: number;
  impact: number;
  syncConfidence: number;
  syncWindow: UnifiedSfxSyncPlan['syncWindow'];
  mixSafety: UnifiedSfxSyncPlan['mixSafety'];
  providerGate: UnifiedSfxSyncPlan['providerGate'];
  crossFamily: UnifiedSfxSyncPlan['crossFamily'];
  jobVector: UnifiedSfxSyncPlan['jobVector'];
}): string[] {
  const reasonKeys: string[] = [];
  if (input.beatStrength >= 0.5 || input.hasBeatAnchor) reasonKeys.push('beat-anchor');
  if (input.phraseImpact >= 0.5) reasonKeys.push('phrase-impact');
  if (input.transitionAnchored && input.hasTransitionEvidence) reasonKeys.push('transition-boundary');
  if (input.hasLinkedOverlay) reasonKeys.push('linked-overlay');
  if (input.silencePocketMs >= 140) reasonKeys.push('silence-pocket');
  if (input.impact >= 0.58) reasonKeys.push('impact');
  if (input.syncConfidence >= 0.62) reasonKeys.push('sync-confidence');
  if (input.syncWindow.distanceFrames !== null && input.syncWindow.distanceFrames <= input.syncWindow.toleranceFrames) reasonKeys.push('exact-sync-window');
  if (input.syncWindow.driftRisk >= 0.35) reasonKeys.push('sync-drift-risk');
  if (input.mixSafety.overmixRisk >= 0.55) reasonKeys.push('overmix-risk');
  if (input.mixSafety.recentSfxDensity >= 0.45) reasonKeys.push('recent-sfx-density');
  if (input.providerGate.providerQuality >= input.providerGate.assetQualityFloor) reasonKeys.push('provider-quality');
  if (input.providerGate.providerRisk >= 0.35) reasonKeys.push('provider-risk');
  if (input.providerGate.cachePreferred) reasonKeys.push('cache-preferred');
  if (input.crossFamily.mgAnchored) reasonKeys.push('mg-sync');
  if (input.crossFamily.zoomAnchored) reasonKeys.push('zoom-sync');
  if (input.crossFamily.captionAnchored) reasonKeys.push('caption-sync');
  if (input.jobVector.build >= 0.5) reasonKeys.push('build-intent');
  if (input.jobVector.texture >= 0.5) reasonKeys.push('texture-intent');
  if (input.jobVector.restraint >= 0.7) reasonKeys.push('silence-preferred');
  return [...new Set(reasonKeys)];
}

function sfxCompatibilityTokenImpact(sfxType: string): number {
  if (!sfxType || sfxType === 'none') return 0;
  if (sfxType.includes('impact') || sfxType.includes('hit') || sfxType.includes('boom')) return 0.58;
  if (sfxType.includes('whoosh') || sfxType.includes('swoosh') || sfxType.includes('swish')) return 0.5;
  if (sfxType.includes('tick') || sfxType.includes('click')) return 0.44;
  return 0.42;
}

function sfxSyncAnchorKind(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
): string {
  return normalizeParamString(atoms.syncAnchor ?? decision.params.sfxAnchor ?? decision.params.syncAnchor ?? decision.params.anchor);
}

function sfxSyncWindow(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
  syncAnchor: string,
  transitionAnchored: boolean,
  hasTransitionEvidence: boolean,
): UnifiedSfxSyncPlan['syncWindow'] {
  const requestedFrame = Number.isFinite(decision.frame) ? Math.max(0, Math.round(decision.frame)) : 0;
  const anchorFrame = sfxAnchorFrame(atoms, syncAnchor, transitionAnchored, hasTransitionEvidence);
  const toleranceFrames = sfxSyncToleranceFrames(syncAnchor, transitionAnchored);
  const distanceFrames = anchorFrame === null ? null : Math.abs(anchorFrame - requestedFrame);
  const driftRisk = roundAuditNumber(distanceFrames === null
    ? 0.25
    : clamp01(Math.max(0, distanceFrames - toleranceFrames) / 24));
  const exactSyncPressure = roundAuditNumber(distanceFrames === null
    ? 0
    : clamp01(1 - driftRisk));

  return {
    anchorFrame,
    requestedFrame,
    distanceFrames,
    toleranceFrames,
    exactSyncPressure,
    driftRisk,
  };
}

function sfxAnchorFrame(
  atoms: Record<string, string | number | boolean>,
  syncAnchor: string,
  transitionAnchored: boolean,
  hasTransitionEvidence: boolean,
): number | null {
  if (transitionAnchored || syncAnchor === 'transition') {
    return hasTransitionEvidence
      ? firstSignalFrame(atoms, ['transitionFrame', 'syncFrame', 'anchorFrame', 'beatFrame'])
      : null;
  }
  if (syncAnchor === 'mg-landing' || syncAnchor === 'graphic' || syncAnchor === 'overlay') {
    return firstSignalFrame(atoms, ['mgLandingFrame', 'syncFrame', 'anchorFrame', 'beatFrame']);
  }
  if (syncAnchor === 'zoom' || syncAnchor === 'zoom-peak' || syncAnchor === 'camera') {
    return firstSignalFrame(atoms, ['zoomPeakFrame', 'syncFrame', 'anchorFrame', 'beatFrame']);
  }
  if (syncAnchor === 'caption' || syncAnchor === 'keyword') {
    return firstSignalFrame(atoms, ['captionEmphasisFrame', 'syncFrame', 'anchorFrame', 'beatFrame']);
  }
  if (syncAnchor === 'motion-peak' || syncAnchor === 'motion') {
    return firstSignalFrame(atoms, ['motionPeakFrame', 'syncFrame', 'anchorFrame', 'beatFrame']);
  }
  return firstSignalFrame(atoms, ['syncFrame', 'beatFrame', 'anchorFrame', 'transitionFrame', 'mgLandingFrame', 'zoomPeakFrame', 'captionEmphasisFrame', 'motionPeakFrame']);
}

function sfxSyncToleranceFrames(syncAnchor: string, transitionAnchored: boolean): number {
  if (transitionAnchored || syncAnchor === 'transition') return 3;
  if (syncAnchor === 'mg-landing' || syncAnchor === 'zoom' || syncAnchor === 'zoom-peak' || syncAnchor === 'caption' || syncAnchor === 'keyword' || syncAnchor === 'motion-peak') return 4;
  if (syncAnchor === 'beat' || syncAnchor === '') return 6;
  if (syncAnchor === 'scene-bed' || syncAnchor === 'ambient') return 18;
  return 8;
}

function sfxCrossFamily(
  decision: ReactiveEditDecision,
  atoms: Record<string, string | number | boolean>,
  syncAnchor: string,
  transitionAnchored: boolean,
  hasLinkedOverlay: boolean,
): UnifiedSfxSyncPlan['crossFamily'] {
  const hasAtom = (key: string): boolean => hasDirectParamValue(atoms[key]);
  return {
    transitionAnchored,
    mgAnchored: syncAnchor.includes('mg') || syncAnchor.includes('graphic') || hasAtom('mgLandingFrame'),
    zoomAnchored: syncAnchor.includes('zoom') || syncAnchor.includes('camera') || hasAtom('zoomPeakFrame'),
    captionAnchored: syncAnchor.includes('caption') || syncAnchor.includes('keyword') || hasAtom('captionEmphasisFrame'),
    linkedOverlay: hasLinkedOverlay || hasDirectParamValue(decision.params.linkedOverlayId),
  };
}

function firstSignalFrame(atoms: Record<string, string | number | boolean>, keys: string[]): number | null {
  for (const key of keys) {
    const frame = signalAtomFrame(atoms, key);
    if (frame !== null) return frame;
  }
  return null;
}

function signalAtomFrame(atoms: Record<string, string | number | boolean>, key: string): number | null {
  const value = atoms[key];
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return null;
}

function sfxAtomNumberWithDefault(
  atoms: Record<string, string | number | boolean>,
  key: string,
  fallback: number,
): number {
  if (atoms[key] === undefined) return clamp01(fallback);
  return signalAtomNumber(atoms, key);
}

function sfxSignalAliases(plan: UnifiedSfxSyncPlan): Record<string, unknown> {
  const aliases: Record<string, unknown> = {};
  const assign = (alias: string, atom: string): void => {
    const value = plan.atoms[atom];
    if (value !== undefined) aliases[alias] = value;
  };

  assign('beat_strength', 'beatStrength');
  assign('phrase_impact', 'phraseImpact');
  assign('sfx_sync_anchor', 'syncAnchor');
  assign('transition_energy', 'transitionEnergy');
  assign('silence_duration_ms', 'silencePocketMs');
  assign('speech_energy', 'speechEnergy');
  assign('provider_quality', 'providerQuality');
  assign('provider_confidence', 'providerConfidence');
  assign('asset_quality_floor', 'assetQualityFloor');
  aliases.sfx_sync_confidence = plan.evidence.syncConfidence;
  aliases.sfx_impact = plan.evidence.impact;
  aliases.sfx_restraint = plan.evidence.restraint;
  aliases.sfx_anchor_distance_frames = plan.syncWindow.distanceFrames;
  aliases.sfx_sync_tolerance_frames = plan.syncWindow.toleranceFrames;
  aliases.sfx_drift_risk = plan.syncWindow.driftRisk;
  aliases.sfx_exact_sync_pressure = plan.syncWindow.exactSyncPressure;
  aliases.sfx_overmix_risk = plan.mixSafety.overmixRisk;
  aliases.sfx_recent_density = plan.mixSafety.recentSfxDensity;
  aliases.sfx_provider_risk = plan.providerGate.providerRisk;
  aliases.sfx_external_source_required = plan.providerGate.externalSourceRequired;
  aliases.sfx_cache_preferred = plan.providerGate.cachePreferred;
  return aliases;
}

function signalAtomNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  if (typeof value === 'number' && Number.isFinite(value)) return clamp01(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function signalAtomRawNumber(
  atoms: Record<string, string | number | boolean>,
  key: string,
): number {
  const value = atoms[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function createMutableAuditBucket(): MutableSignalDecisionAuditBucket {
  return {
    count: 0,
    confidence: { min: 0, max: 0, average: 0 },
    confidenceSum: 0,
    frames: { first: 0, last: 0, samples: [] },
    sources: {},
  };
}

function emptyFinalAuditBucket(): UnifiedSignalDecisionAuditBucket {
  return {
    count: 0,
    confidence: { min: 0, max: 0, average: 0 },
    frames: { first: 0, last: 0, samples: [] },
    sources: {},
  };
}

function mapBucketsToMutable(
  buckets: Record<string, UnifiedSignalDecisionAuditBucket>,
): Record<string, MutableSignalDecisionAuditBucket> {
  const mapped: Record<string, MutableSignalDecisionAuditBucket> = {};
  for (const [key, bucket] of Object.entries(buckets)) {
    mapped[key] = {
      ...bucket,
      confidence: { ...bucket.confidence },
      confidenceSum: bucket.confidence.average * bucket.count,
      frames: { ...bucket.frames, samples: [...bucket.frames.samples] },
      sources: { ...bucket.sources },
    };
  }
  return mapped;
}

function mapFamilyBucketsToMutable(
  buckets: Record<UnifiedSignalDecisionFamily, UnifiedSignalDecisionAuditBucket>,
): Record<UnifiedSignalDecisionFamily, MutableSignalDecisionAuditBucket> {
  return mapBucketsToMutable(buckets) as Record<UnifiedSignalDecisionFamily, MutableSignalDecisionAuditBucket>;
}

function finalizeAuditBuckets<T extends string>(
  buckets: Record<T, MutableSignalDecisionAuditBucket>,
): Record<T, UnifiedSignalDecisionAuditBucket> {
  const finalized = {} as Record<T, UnifiedSignalDecisionAuditBucket>;
  for (const [key, bucket] of Object.entries(buckets) as Array<[T, MutableSignalDecisionAuditBucket]>) {
    finalized[key] = {
      count: bucket.count,
      confidence: bucket.confidence,
      frames: bucket.frames,
      sources: bucket.sources,
    };
  }
  return finalized;
}

function roundAuditNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mergeAdvisoryProducers(
  existing: UnifiedDecisionCandidateProducer[],
  additions: UnifiedDecisionCandidateProducer[],
): UnifiedDecisionCandidateProducer[] {
  const merged = new Set<UnifiedDecisionCandidateProducer>(existing);
  for (const addition of additions) merged.add(addition);
  return [...merged];
}

function buildSignalExecutionBudgets(
  signalDecisions: ReactiveEditDecision[],
): Partial<Record<ReactiveEditDecision['type'], number>> {
  const grouped = new Map<ReactiveEditDecision['type'], ReactiveEditDecision[]>();
  for (const decision of signalDecisions) {
    if (!SIGNAL_EXECUTION_MIN_CONFIDENCE[decision.type]) continue;
    grouped.set(decision.type, [...(grouped.get(decision.type) ?? []), decision]);
  }

  const budgets: Partial<Record<ReactiveEditDecision['type'], number>> = {};
  for (const [type, decisions] of grouped.entries()) {
    const minFrame = Math.min(...decisions.map((decision) => decision.frame));
    const maxFrame = Math.max(...decisions.map((decision) => decision.frame + Math.max(1, decision.durationFrames ?? 1)));
    const minutes = Math.max(MIN_BUDGET_WINDOW_MINUTES, (maxFrame - minFrame) / (FPS * 60));
    const perMinute = SIGNAL_EXECUTION_MAX_PER_MINUTE[type] ?? 0;
    budgets[type] = Math.max(1, Math.round(minutes * perMinute));
  }
  return budgets;
}

function resolveSignalExecutionLicense(
  mergedDecisions: ReactiveEditDecision[],
  signalDecision: ReactiveEditDecision,
  budgets: Partial<Record<ReactiveEditDecision['type'], number>>,
): { executable: boolean; reason: string } {
  const candidate = normalizeSignalExecutionCandidate(signalDecision);
  const minConfidence = SIGNAL_EXECUTION_MIN_CONFIDENCE[signalDecision.type];
  if (minConfidence === undefined) {
    return { executable: false, reason: 'unsupported-signal-decision-type' };
  }

  if (candidate.confidence < minConfidence) {
    return { executable: false, reason: 'below-signal-confidence-floor' };
  }

  if (signalDecision.type === 'sfx' || signalDecision.type === 'sfx-trigger') {
    const sfxType = normalizeParamString(signalDecision.params.sfxType ?? signalDecision.params.type);
    if (!sfxType || sfxType === 'none') {
      return { executable: false, reason: 'missing-sfx-intent' };
    }
  }

  const familyLicense = resolveFamilyExecutionLicense(signalDecision);
  if (!familyLicense.executable) {
    return familyLicense;
  }

  const budget = budgets[signalDecision.type] ?? 0;
  const executableCountForType = mergedDecisions
    .filter((decision) => isSignalSourceDecision(decision))
    .filter((decision) => decision.type === signalDecision.type).length;
  if (executableCountForType >= budget) {
    return { executable: false, reason: 'signal-rhythm-budget-exhausted' };
  }

  const spacing = SIGNAL_EXECUTION_MIN_SPACING_FRAMES[signalDecision.type] ?? 0;
  const hasNearbySameType = mergedDecisions.some((decision) => (
    decision.type === signalDecision.type &&
    Math.abs(decision.frame - signalDecision.frame) < spacing
  ));
  if (hasNearbySameType) {
    return { executable: false, reason: 'nearby-executable-same-type' };
  }

  return familyLicense;
}

function resolveFamilyExecutionLicense(
  decision: ReactiveEditDecision,
): { executable: boolean; reason: string } {
  switch (familyForSignalDecision(decision)) {
    case 'transition':
      return resolveTransitionExecutionLicense(decision);
    case 'camera':
      return resolveCameraExecutionLicense(decision);
    case 'audio':
      return resolveSfxExecutionLicense(decision);
    case 'caption':
      return resolveCaptionExecutionLicense(decision);
    case 'pacing':
      return hasPacingMomentEvidence(decision)
        ? { executable: true, reason: 'licensed-by-pacing-moment-atoms' }
        : { executable: false, reason: 'missing-pacing-moment-atoms' };
    case 'timing':
      return hasTimingSpanEvidence(decision)
        ? { executable: true, reason: 'licensed-by-timing-span-atoms' }
        : { executable: false, reason: 'missing-timing-span-atoms' };
    case 'graphic':
      return resolveGraphicContentEvidenceLicense(decision);
    default:
      return { executable: false, reason: 'unsupported-signal-family' };
  }
}

function resolveTransitionExecutionLicense(decision: ReactiveEditDecision): { executable: boolean; reason: string } {
  const transitionType = normalizeParamString(
    decision.params.transitionType ?? decision.params.type ?? decision.params.transType,
  );
  const isNonExecutableCompatibilityHint = NON_EXECUTABLE_TRANSITION_TYPES.has(transitionType);
  const plan = resolveTransitionBoundaryPlan(decision);

  if (!hasTransitionBoundaryEvidence(decision)) {
    return isNonExecutableCompatibilityHint
      ? { executable: false, reason: 'hard-cut-is-boundary-evidence' }
      : { executable: false, reason: 'missing-transition-boundary-atoms' };
  }

  if (isNonExecutableCompatibilityHint) {
    const allowsBoundaryCompatibilityExecution = canExecuteHardCutTransitionAsCompatibilityHint(decision, plan);
    return allowsBoundaryCompatibilityExecution
      ? { executable: true, reason: 'licensed-by-transition-family-plan' }
      : { executable: false, reason: 'hard-cut-is-boundary-evidence' };
  }

  if (plan && !plan.visualTransitionAllowed) {
    return { executable: false, reason: 'transition-family-plan-kept-clean-cut' };
  }

  return { executable: true, reason: 'licensed-by-transition-boundary-atoms' };
}

function canExecuteHardCutTransitionAsCompatibilityHint(
  decision: ReactiveEditDecision,
  plan: UnifiedTransitionBoundaryPlan | null,
): boolean {
  if (!plan) return false;
  if (plan.physicalFormInputs.repetitionPressure >= 0.86 || plan.physicalFormInputs.screenSafetyPressure >= 0.92) {
    return false;
  }

  if (plan.visualTransitionAllowed) return true;

  if (hasAnyDirectParam(decision, ['transitionJob', 'transition_job']) || hasAnyDirectParam(decision, ['transitionIntent'])) {
    return true;
  }

  if (plan.reasonKeys.includes('motion-direction')
    || plan.reasonKeys.includes('visual-motion')
    || plan.reasonKeys.includes('beat')
    || plan.reasonKeys.includes('topic-shift')
    || plan.reasonKeys.includes('emotion')
    || plan.reasonKeys.includes('semantic-contrast')
    || plan.reasonKeys.includes('claim-evidence-relation')
    || plan.reasonKeys.includes('sentence-continues')
    || plan.reasonKeys.includes('music-hit')
    || plan.reasonKeys.includes('audio-tail')
    || plan.reasonKeys.includes('visual-change')
    || plan.reasonKeys.includes('speech-gap')) {
    return true;
  }

  return false;
}

function resolveCameraExecutionLicense(decision: ReactiveEditDecision): { executable: boolean; reason: string } {
  if (!hasCameraMotionEvidence(decision)) {
    return { executable: false, reason: 'missing-camera-motion-atoms' };
  }

  if (decision.type === 'zoom') {
    const zoomPlan = resolveZoomMotionPlan(decision);
    if (!zoomPlan) return { executable: false, reason: 'missing-camera-motion-atoms' };
    if (zoomPlan && !zoomPlan.visualMotionAllowed) {
      return { executable: false, reason: 'zoom-family-plan-kept-clean-camera' };
    }
  }

  return { executable: true, reason: 'licensed-by-camera-motion-atoms' };
}

function resolveCaptionExecutionLicense(decision: ReactiveEditDecision): { executable: boolean; reason: string } {
  const plan = resolveCaptionMomentPlan(decision);
  if (!plan) return { executable: false, reason: 'missing-caption-moment-atoms' };
  return plan.emphasisAllowed
    ? { executable: true, reason: 'licensed-by-caption-family-plan' }
    : { executable: false, reason: 'caption-family-plan-kept-readable' };
}

function resolveSfxExecutionLicense(decision: ReactiveEditDecision): { executable: boolean; reason: string } {
  const plan = resolveSfxSyncPlan(decision);
  if (!plan) {
    return isTransitionAnchoredSfx(decision)
      ? { executable: false, reason: 'missing-transition-sfx-boundary-atoms' }
      : { executable: false, reason: 'missing-audio-beat-atoms' };
  }
  if (!plan.placementAllowed) {
    return isTransitionAnchoredSfx(decision) && !hasTransitionSfxBoundaryEvidence(decision)
      ? { executable: false, reason: 'missing-transition-sfx-boundary-atoms' }
      : { executable: false, reason: 'sfx-family-plan-kept-silent' };
  }
  return { executable: true, reason: 'licensed-by-sfx-family-plan' };
}

function hasTransitionBoundaryEvidence(decision: ReactiveEditDecision): boolean {
  const hasBoundaryAnchor = hasAnyParam(decision, [
    'boundaryAtom',
    'boundaryFrame',
    'clipAId',
    'clipBId',
    'transitionFrame',
    'cutFrame',
  ]);
  const hasBoundaryReason = hasAnyParam(decision, [
    'topicDelta',
    'speechGapMs',
    'beatPhase',
    'visualContinuity',
    'motionIntensity',
    'visualChange',
    'beatStrength',
    'emotionJump',
    'textCoverage',
    'textOnScreen',
    'transitionJob',
    'relation',
    'motionVectorX',
    'motionVectorY',
    'subjectPositionJump',
    'subjectSizeJump',
    'shotScaleDelta',
    'speakerChange',
    'sentenceContinues',
    'semanticContrast',
    'claimEvidenceRelation',
    'musicHit',
    'audioTailMs',
    'colorDelta',
    'brightnessDelta',
    'clutterDelta',
  ]);
  return hasBoundaryAnchor && hasBoundaryReason;
}

function hasCameraMotionEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'subjectX',
    'subjectY',
    'subjectWidth',
    'subjectHeight',
    'mainSubjectX',
    'mainSubjectY',
    'motionVectorX',
    'motionVectorY',
    'shotScale',
    'cameraMotion',
    'subjectMotion',
    'eyeContact',
    'speechPeak',
    'beatStrength',
    'wordImportance',
    'emotionIntensity',
    'emotion',
    'visualSignificance',
    'visualMotion',
    'textOnScreen',
    'visualComplexity',
    'topicDelta',
    'timeSinceLastZoomSec',
    'recentZoomSimilarity',
  ]);
}

function hasAudioBeatEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'beatFrame',
    'beatStrength',
    'linkedOverlayId',
    'anchorFrame',
    'phraseImpact',
    'rhythmRole',
    'sfxRole',
    'role',
  ]);
}

function isTransitionAnchoredSfx(decision: ReactiveEditDecision): boolean {
  if (decision.type !== 'sfx' && decision.type !== 'sfx-trigger') return false;
  const anchor = normalizeParamString(
    decision.params.sfxAnchor ?? decision.params.syncAnchor ?? decision.params.anchor,
  );
  if (anchor === 'transition') return true;
  return hasAnyParam(decision, ['transitionFrame', 'boundaryFrame', 'cutFrame', 'transitionId']);
}

function hasTransitionSfxBoundaryEvidence(decision: ReactiveEditDecision): boolean {
  const hasBoundaryAnchor = hasAnyParam(decision, [
    'transitionFrame',
    'boundaryFrame',
    'cutFrame',
    'transitionId',
    'linkedOverlayId',
  ]);
  const hasBoundaryReason = hasAnyParam(decision, [
    'transitionJob',
    'transitionType',
    'transType',
    'topicDelta',
    'speechGapMs',
    'beatPhase',
    'visualContinuity',
    'motionVectorX',
    'motionVectorY',
    'sfxRole',
    'role',
  ]);
  return hasBoundaryAnchor && hasBoundaryReason;
}

function hasCaptionMomentEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'text',
    'keyword',
    'phrase',
    'wordRange',
    'startWordIndex',
    'endWordIndex',
    'semanticRole',
    'role',
    'speechRate',
    'momentId',
  ]);
}

function hasPacingMomentEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'momentId',
    'segmentId',
    'topicDelta',
    'pauseMs',
    'speechGapMs',
    'energyDelta',
    'visualChange',
    'motionBoundary',
    'cutReason',
  ]);
}

function hasTimingSpanEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'spanStartFrame',
    'spanEndFrame',
    'durationFrames',
    'beatStrength',
    'motionIntensity',
    'speechRate',
    'timingRole',
    'role',
  ]);
}

function isSignalSourceDecision(decision: ReactiveEditDecision): boolean {
  const source = String(decision.source ?? '').toLowerCase();
  if (!source) return false;
  return source.startsWith('signal') || source.includes('path-d') || source.includes('signal-driven');
}

function decisionSelectionKey(decision: ReactiveEditDecision): string {
  return [
    decision.type,
    decision.frame,
    decision.durationFrames ?? '',
    decision.source ?? '',
    decision.signal ?? '',
  ].join('|');
}

function executionLicenseReason(decision: ReactiveEditDecision): string {
  const license = readMergeMetadata(decision).executionLicense;
  return typeof license === 'string' && license.trim().length > 0
    ? license
    : 'selected-by-unified-planner';
}

function normalizeParamString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function summarizeSignalDecisionEvidence(
  decision: ReactiveEditDecision,
  candidate: UnifiedSignalExecutionCandidate,
  outcome: UnifiedSignalDecisionOutcome,
  reason?: string,
): UnifiedSignalDecisionEvidence {
  const params = compactSignalEvidenceParams(decision.params);
  return {
    type: decision.type,
    family: candidate.family,
    outcome,
    candidate,
    frame: decision.frame,
    ...(decision.durationFrames === undefined ? {} : { durationFrames: decision.durationFrames }),
    confidence: candidate.confidence,
    source: decision.source,
    signal: decision.signal,
    reason: reason ?? decision.reason,
    ...(Object.keys(params).length === 0 ? {} : { params }),
  };
}

function compactSignalEvidenceParams(params: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const compact: Record<string, string | number | boolean> = {};
  if (!params) return compact;

  for (const [key, value] of Object.entries(params)) {
    if (!SIGNAL_EVIDENCE_PARAM_KEYS.has(key)) continue;
    if (typeof value === 'string') {
      compact[key] = value.slice(0, 160);
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      compact[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      compact[key] = value;
    }
  }

  return compact;
}

function findNearEquivalentDecisionIndex(
  decisions: ReactiveEditDecision[],
  signalDecision: ReactiveEditDecision,
  maxNearFrameWindow: number,
): number {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < decisions.length; i++) {
    const candidate = decisions[i];
    if (candidate.type !== signalDecision.type) continue;
    const distance = Math.abs(candidate.frame - signalDecision.frame);
    if (!decisionsOverlap(candidate, signalDecision, maxNearFrameWindow) || distance >= bestDistance) continue;
    bestDistance = distance;
    bestIndex = i;
  }
  return bestIndex;
}

function decisionsOverlap(a: ReactiveEditDecision, b: ReactiveEditDecision, maxNearFrameWindow: number): boolean {
  const aDuration = Math.max(1, a.durationFrames ?? 1);
  const bDuration = Math.max(1, b.durationFrames ?? 1);
  const dynamicWindow = Math.min(maxNearFrameWindow, Math.max(6, Math.round(Math.max(aDuration, bDuration) / 2)));
  if (Math.abs(a.frame - b.frame) <= dynamicWindow) return true;

  const aEnd = a.frame + aDuration;
  const bEnd = b.frame + bDuration;
  return a.frame < bEnd && b.frame < aEnd;
}

function orderProducerCandidates(
  candidates: UnifiedDecisionProducerCandidate[],
): UnifiedDecisionProducerCandidate[] {
  return [...candidates].sort((a, b) => producerRank(a.source) - producerRank(b.source));
}

function producerRank(source: UnifiedDecisionProducerCandidate['source']): number {
  return source === 'creative-brief' ? 0 : 1;
}

function inferIncomingProducer(
  decisions: ReactiveEditDecision[],
  fallbackProducer: UnifiedDecisionBundle['source'],
): UnifiedDecisionCandidateProducer {
  const sources = decisions.map((decision) => (decision.source ?? '').toLowerCase());
  const hasCreativeSource = sources.some((source) => source.includes('creative-brief') || source.includes('creative') || source.includes('path-e'));
  if (hasCreativeSource) return 'creative-brief';

  if (fallbackProducer === 'signal-driven') return 'signal-driven';
  return 'signal-driven';
}

function resolveProducerForPlan(bundle: UnifiedDecisionBundle): UnifiedDecisionCandidateProducer {
  if (bundle.source === 'creative-brief' || bundle.authority.executableProducer === 'creative-brief') {
    return 'creative-brief';
  }
  return 'signal-driven';
}

function attachSignalValidation(primary: ReactiveEditDecision, signalDecision: ReactiveEditDecision): ReactiveEditDecision {
  const existingMerge = readMergeMetadata(primary);
  const signalValidations = Array.isArray(existingMerge.signalValidations)
    ? existingMerge.signalValidations
    : [];

  return {
    ...primary,
    params: {
      ...primary.params,
      unifiedDecisionMerge: {
        ...existingMerge,
        version: 'unified-decision-bundle-v1',
        role: 'primary-validated',
        signalValidations: [
          ...signalValidations,
          {
            type: signalDecision.type,
            frame: signalDecision.frame,
            frameDistance: Math.abs(primary.frame - signalDecision.frame),
            source: signalDecision.source,
            signal: signalDecision.signal,
            confidence: signalDecision.confidence,
            reason: signalDecision.reason,
          },
        ],
      },
    },
  };
}

function shouldSignalReplacePrimary(
  existingPlan: PlannedDecision,
  signalPlan: PlannedDecision,
  license: { executable: boolean; reason: string },
  incomingProducer: UnifiedDecisionCandidateProducer,
): boolean {
  if (incomingProducer !== 'signal-driven' || !license.executable) return false;
  if (existingPlan.source !== 'creative-brief') return false;

  const candidate = normalizeSignalExecutionCandidate(signalPlan.decision);
  if (candidate.evidenceStrength < 0.72) return false;
  if (candidate.completeness < 0.4) return false;
  if (candidate.physicalFormReadiness < 0.4) return false;

  return signalPlan.score >= existingPlan.score + 0.035;
}

function applyFamilyPlanner(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  const transitionPlan = resolveTransitionBoundaryPlan(signalDecision);
  if (transitionPlan) {
    const existingSignals = recordParam(signalDecision.params.signals) ?? {};
    return {
      ...signalDecision,
      params: {
        ...signalDecision.params,
        signals: {
          ...existingSignals,
          ...transitionSignalAliases(transitionPlan),
        },
        transitionBoundaryPlan: transitionPlan,
        unifiedDecisionMerge: {
          ...readMergeMetadata(signalDecision),
          familyPlanner: {
            version: 'transition-family-planner-v1',
            family: 'transition',
            visualTransitionAllowed: transitionPlan.visualTransitionAllowed,
            executionLicense: reason,
            reasonKeys: transitionPlan.reasonKeys,
            jobVector: transitionPlan.jobVector,
            physicalFormInputs: transitionPlan.physicalFormInputs,
            crossFamily: transitionPlan.crossFamily,
          },
        },
      },
    };
  }

  const zoomPlan = resolveZoomMotionPlan(signalDecision);
  if (zoomPlan) {
    const existingSignals = recordParam(signalDecision.params.signals) ?? {};
    return {
      ...signalDecision,
      params: {
        ...signalDecision.params,
        signals: {
          ...existingSignals,
          ...zoomSignalAliases(zoomPlan),
        },
        zoomMotionPlan: zoomPlan,
        unifiedDecisionMerge: {
          ...readMergeMetadata(signalDecision),
          familyPlanner: {
            version: 'zoom-family-planner-v1',
            family: 'zoom',
            visualMotionAllowed: zoomPlan.visualMotionAllowed,
            executionLicense: reason,
            reasonKeys: zoomPlan.reasonKeys,
            jobVector: zoomPlan.jobVector,
            subjectGeometry: zoomPlan.subjectGeometry,
            motionMemory: zoomPlan.motionMemory,
            physicalFormInputs: zoomPlan.physicalFormInputs,
            crossFamily: zoomPlan.crossFamily,
          },
        },
      },
    };
  }

  const captionPlan = resolveCaptionMomentPlan(signalDecision);
  if (captionPlan) {
    const existingSignals = recordParam(signalDecision.params.signals) ?? {};
    return {
      ...signalDecision,
      params: {
        ...signalDecision.params,
        signals: {
          ...existingSignals,
          ...captionSignalAliases(captionPlan),
        },
        captionMomentPlan: captionPlan,
        unifiedDecisionMerge: {
          ...readMergeMetadata(signalDecision),
          familyPlanner: {
            version: 'caption-family-planner-v1',
            family: 'caption',
            emphasisAllowed: captionPlan.emphasisAllowed,
            executionLicense: reason,
            reasonKeys: captionPlan.reasonKeys,
            jobVector: captionPlan.jobVector,
            grouping: captionPlan.grouping,
            readability: captionPlan.readability,
            styleIntent: captionPlan.styleIntent,
            crossFamily: captionPlan.crossFamily,
          },
        },
      },
    };
  }

  const sfxPlan = resolveSfxSyncPlan(signalDecision);
  if (sfxPlan) {
    const existingSignals = recordParam(signalDecision.params.signals) ?? {};
    return {
      ...signalDecision,
      params: {
        ...signalDecision.params,
        signals: {
          ...existingSignals,
          ...sfxSignalAliases(sfxPlan),
        },
        sfxSyncPlan: sfxPlan,
        unifiedDecisionMerge: {
          ...readMergeMetadata(signalDecision),
          familyPlanner: {
            version: 'sfx-family-planner-v1',
            family: 'audio',
            placementAllowed: sfxPlan.placementAllowed,
            executionLicense: reason,
            reasonKeys: sfxPlan.reasonKeys,
            jobVector: sfxPlan.jobVector,
            syncWindow: sfxPlan.syncWindow,
            mixSafety: sfxPlan.mixSafety,
            providerGate: sfxPlan.providerGate,
            crossFamily: sfxPlan.crossFamily,
          },
        },
      },
    };
  }

  return signalDecision;
}

function markSignalSupplement(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  const plannedDecision = applyFamilyPlanner(signalDecision, reason);
  return {
    ...plannedDecision,
    params: {
      ...plannedDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(plannedDecision),
        version: 'unified-decision-bundle-v1',
        role: 'signal-supplement',
        executionLicense: reason,
      },
    },
  };
}

function markPlannerSelectedSignal(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  const plannedDecision = applyFamilyPlanner(signalDecision, reason);
  return {
    ...plannedDecision,
    params: {
      ...plannedDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(plannedDecision),
        version: 'unified-decision-bundle-v1',
        role: 'signal-selected',
        executionLicense: reason,
      },
    },
  };
}

function markPlannerSelectedPrimary(decision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  const plannedDecision = applyFamilyPlanner(decision, reason);
  return {
    ...plannedDecision,
    params: {
      ...plannedDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(plannedDecision),
        version: 'unified-decision-bundle-v1',
        role: 'planner-owned-primary',
        executionLicense: reason,
      },
    },
  };
}
function markSignalReplacement(
  signalDecision: ReactiveEditDecision,
  reason: string,
  replacedDecision: ReactiveEditDecision,
): ReactiveEditDecision {
  const plannedDecision = applyFamilyPlanner(signalDecision, reason);
  return {
    ...plannedDecision,
    params: {
      ...plannedDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(plannedDecision),
        version: 'unified-decision-bundle-v1',
        role: 'signal-replaced-primary',
        executionLicense: reason,
        replacedPrimary: summarizeReplacedPrimaryDecision(replacedDecision),
      },
    },
  };
}

function summarizeReplacedPrimaryDecision(decision: ReactiveEditDecision): Record<string, unknown> {
  return {
    type: decision.type,
    frame: decision.frame,
    durationFrames: decision.durationFrames,
    source: decision.source,
    signal: decision.signal,
    confidence: decision.confidence,
    reason: decision.reason,
  };
}

function stampUnifiedPlannerOwnership(
  decisions: ReactiveEditDecision[],
  authority: UnifiedDecisionBundleAuthority,
): ReactiveEditDecision[] {
  if (authority.executableProducer !== 'unified-planner' || authority.decisionMode !== 'unified-planner') {
    return decisions;
  }

  return decisions.map((decision) => {
    const existingMerge = readMergeMetadata(decision);
    const plannerRole = typeof existingMerge.role === 'string' && existingMerge.role.trim().length > 0
      ? existingMerge.role
      : 'planner-owned-primary';

    return {
      ...decision,
      params: {
        ...decision.params,
        unifiedDecisionMerge: {
          ...existingMerge,
          version: 'unified-decision-bundle-v1',
          role: plannerRole,
          plannerOwned: true,
        },
        unifiedDecisionOwner: {
          version: 'unified-decision-owner-v1',
          owner: 'unified-planner',
          creativeBriefRole: 'semantic-context',
          signalRole: 'candidate-source',
          producerSource: decision.source,
          plannerRole,
        },
      },
    };
  });
}

function readMergeMetadata(decision: ReactiveEditDecision): Record<string, unknown> {
  const metadata = decision.params?.unifiedDecisionMerge;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizeEdl(edl: CompatibleEditDecisionList): ReactiveEditDecisionList {
  const decisions = cloneDecisions(edl.decisions);
  return {
    ...edl,
    projectId: edl.projectId ?? 'unknown-project',
    generatedAt: edl.generatedAt ?? new Date(0),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: edl.stats?.cutsPerMinute ?? 0,
      transitionCount: decisions.filter((decision) => decision.type === 'transition').length,
      graphicCount: decisions.filter((decision) => decision.type === 'graphic').length,
      zoomCount: decisions.filter((decision) => decision.type === 'zoom').length,
      speedChangeCount: decisions.filter((decision) => decision.type === 'speed-change').length,
      averageConfidence: decisions.length > 0
        ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
        : 0,
    },
  };
}

function cloneDecisions(decisions: CompatibleEditDecision[]): ReactiveEditDecision[] {
  return decisions
    .map(cloneDecision)
    .filter((decision): decision is ReactiveEditDecision => Boolean(decision));
}
function cloneDecision(decision: CompatibleEditDecision): ReactiveEditDecision | null {
  const normalizedDecision = normalizeLegacyDecisionType(decision);
  if (!normalizedDecision) return null;
  const confidence = clamp01(normalizedDecision.confidence ?? 0);
  return {
    ...normalizedDecision,
    type: normalizedDecision.type,
    frame: normalizedDecision.frame,
    durationFrames: normalizedDecision.durationFrames,
    priority: normalizedDecision.priority ?? priorityFromConfidence(confidence),
    source: normalizedDecision.source ?? 'unknown-source',
    signal: normalizedDecision.signal ?? normalizedDecision.technique ?? normalizedDecision.type,
    reason: normalizedDecision.reason ?? '',
    params: { ...(normalizedDecision.params ?? {}) },
    confidence,
  } as ReactiveEditDecision;
}

function normalizeLegacyDecisionType(decision: CompatibleEditDecision): CompatibleEditDecision | null {
  const params = { ...(decision.params ?? {}) };

  if (decision.type === 'slow-motion') {
    const speedMultiplier = numberParam(params.speedMultiplier) ?? numberParam(params.speed) ?? 0.3;
    return {
      ...decision,
      type: 'speed-change',
      params: {
        ...params,
        speedMultiplier,
        legacyDecisionType: 'slow-motion',
      },
    };
  }

  if (decision.type === 'filter') {
    return null;
  }

  return decision;
}



function priorityFromConfidence(confidence: number): number {
  if (confidence > 0.8) return 2;
  if (confidence > 0.6) return 3;
  return 4;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
