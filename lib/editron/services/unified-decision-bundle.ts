import type {
  EditDecision as ReactiveEditDecision,
  EditDecisionList as ReactiveEditDecisionList,
} from './reactive-edit-engine';

type CompatibleEditDecision = Partial<ReactiveEditDecision> & {
  type: ReactiveEditDecision['type'];
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
    hasAtomicMomentBundle: boolean;
    hasUnifiedMomentEvidence: boolean;
  };
  calibrationStatus: 'invented-needs-calibration';
}

interface UnifiedTransitionBoundaryPlan {
  version: 'transition-boundary-plan-v1';
  family: 'transition';
  source: 'signal-family-planner';
  visualTransitionAllowed: boolean;
  reasonKeys: string[];
  atoms: Record<string, string | number | boolean>;
  evidence: {
    directionMagnitude: number;
    intensity: number;
    visualPressure: number;
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
  evidence: {
    intensity: number;
    visualPressure: number;
    hasSubjectAnchor: boolean;
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
  evidence: {
    salience: number;
    readabilityPressure: number;
    speechPace: number;
    hasTextAnchor: boolean;
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
  evidence: {
    syncConfidence: number;
    impact: number;
    restraint: number;
    transitionAnchored: boolean;
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
  const edl = normalizeEdl(options.edl);
  const isSignalSource = options.source === 'signal-driven';
  return {
    source: options.source,
    authority: authorityForSingleProducer(options.source),
    edl,
    graphicsDensity: options.graphicsDensity,
    expectedExecuted: options.expectedExecuted ?? edl.totalDecisions,
    expectedSkipped: options.expectedSkipped ?? 0,
    evidence: {
      primaryDecisionCount: isSignalSource ? 0 : edl.totalDecisions,
      signalDecisionCount: isSignalSource ? edl.totalDecisions : 0,
      addedSignalDecisionCount: isSignalSource ? edl.totalDecisions : 0,
      validatedDecisionCount: 0,
      suppressedSignalDuplicateCount: 0,
      evidenceOnlySignalDecisionCount: 0,
      evidenceOnlySignalDecisions: [],
      signalDecisionAudit: createEmptySignalDecisionAudit(),
    },
  };
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
  let bundle: UnifiedDecisionBundle | null = null;
  for (const candidate of orderProducerCandidates(candidates)) {
    bundle = planUnifiedDecisionBundle(bundle, candidate, options);
  }
  return bundle;
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
  const signalDecisions = signalEdl.decisions.map(cloneDecision);
  const resolvedIncomingProducer = incomingProducer
    ?? inferIncomingProducer(signalDecisions, primaryBundle.source);
  const signalExecutionBudgets = buildSignalExecutionBudgets(signalDecisions);
  const primaryProducer = resolveProducerForPlan(primaryBundle);
  const mergedDecisionEntries = primaryBundle.edl.decisions.map((decision) => toPlannedDecision({
    decision: cloneDecision(decision),
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
  'slow-motion': 0.76,
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
  'slow-motion': 120,
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
  'slow-motion': 2,
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
    case 'slow-motion':
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
    setAtom('textCoverage', ['textCoverage', 'text_coverage', 'visual.text_coverage']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen']);
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
    setAtom('motionVectorX', ['motionVectorX', 'motion_vector_x', 'visual_motion_x']);
    setAtom('motionVectorY', ['motionVectorY', 'motion_vector_y', 'visual_motion_y']);
    setAtom('shotScale', ['shotScale', 'shot_scale']);
    setAtom('speechPeak', ['speechPeak', 'speech_energy', 'energy_delta', 'speech.energy']);
    setAtom('wordImportance', ['wordImportance', 'word_importance', 'word.importance']);
    setAtom('beatStrength', ['beatStrength', 'beat_strength', 'music_energy', 'audio.music_energy']);
    setAtom('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity']);
    setAtom('visualSignificance', ['visualSignificance', 'visual_significance', 'visual.significance']);
    setAtom('visualMotion', ['visualMotion', 'motion_intensity', 'visual.motion_intensity']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen']);
    setAtom('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity']);
    setAtom('topicDelta', ['topicDelta', 'topic_shift', 'topicShift', 'topic_shift_strength', 'narrative_pressure']);
  }

  if (family === 'audio') {
    setAtom('beatStrength', ['beatStrength', 'music_energy', 'audio.music_energy']);
    setAtom('beatFrame', ['beatFrame', 'targetBeatFrame', 'audio.beat_frame']);
    setAtom('anchorFrame', ['anchorFrame', 'targetFrame', 'audio.anchor_frame']);
    setAtom('phraseImpact', ['phraseImpact', 'visceral_impact', 'emotion_intensity', 'speech_energy']);
    setAtom('rhythmRole', ['rhythmRole', 'music_section', 'audio.music_section']);
    setAtom('syncAnchor', ['sfxAnchor', 'syncAnchor', 'anchor']);
    setAtom('transitionEnergy', ['transitionEnergy', 'topicDelta', 'topic_shift', 'narrative_pressure', 'motion_intensity']);
    setAtom('silencePocketMs', ['silencePocketMs', 'speechGapMs', 'silence_duration_ms', 'speech_gap_ms']);
    setAtom('speechEnergy', ['speechEnergy', 'speech_energy', 'speech.energy']);
    setAtom('providerQuality', ['providerQuality', 'asset_quality', 'candidateQuality']);
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
    setAtom('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity']);
    setAtom('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen']);
    setAtom('negativeSpaceBottom', ['negativeSpaceBottom', 'negative_space_bottom', 'visual.negative_space_bottom']);
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
  const signalKeys = signals ? Object.keys(signals).sort().slice(0, 40) : [];
  return {
    hasSignals: signalKeys.length > 0,
    signalKeys,
    hasAtomicMomentBundle: recordParam(decision.params.atomicMomentBundle) !== null,
    hasUnifiedMomentEvidence: recordParam(decision.params.unifiedMomentEvidence) !== null,
  };
}

function lookupSourcePrimitive(decision: ReactiveEditDecision, aliases: string[]): string | number | boolean | undefined {
  const sources = [
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
    case 'slow-motion':
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
  if (decision.type === 'speed-change' || decision.type === 'slow-motion' || decision.type === 'fade') return 'span';
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
    case 'slow-motion':
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
  const params = decision.params ?? {};
  if (hasAnyParam(decision, ['value', 'name', 'quote', 'semanticAtoms', 'contentStructure'])) return true;
  if (hasAnyParam(decision, ['title']) && hasAnyParam(decision, ['body'])) return true;
  if (hasAnyParam(decision, ['from']) && hasAnyParam(decision, ['to', 'relation'])) return true;

  const items = params.items;
  if (Array.isArray(items)) return items.length > 0;

  return false;
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
  const directionX = transitionAtomSignedNumber(atoms, 'motionVectorX');
  const directionY = transitionAtomSignedNumber(atoms, 'motionVectorY');
  const directionMagnitude = roundAuditNumber(clamp01(Math.max(Math.abs(directionX), Math.abs(directionY))));
  const visualPressure = roundAuditNumber(clamp01(Math.max(
    textCoverage,
    textOnScreen,
    visualContinuity,
    motionIntensity * 0.48,
    visualChange * 0.36,
  )));
  const intensity = roundAuditNumber(clamp01(Math.max(
    beatStrength,
    topicDelta * 0.92,
    emotionJump * 0.88,
    motionIntensity * 0.76,
    visualChange * 0.72,
    directionMagnitude * 0.7,
  )));
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
  });

  return {
    version: 'transition-boundary-plan-v1',
    family: 'transition',
    source: 'signal-family-planner',
    visualTransitionAllowed,
    reasonKeys,
    atoms,
    evidence: {
      directionMagnitude,
      intensity,
      visualPressure,
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
}): boolean {
  if (input.visualPressure >= 0.86 || input.textOnScreen >= 0.72) return false;
  return input.directionMagnitude >= 0.48
    || (input.directionMagnitude >= 0.32 && input.motionIntensity >= 0.48)
    || input.intensity >= 0.84
    || input.beatStrength >= 0.72
    || (input.speechGapMs >= 450 && input.topicDelta >= 0.38)
    || input.topicDelta >= 0.56
    || input.emotionJump >= 0.62;
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
  return aliases;
}

function resolveZoomMotionPlan(decision: ReactiveEditDecision): UnifiedZoomMotionPlan | null {
  if (decision.type !== 'zoom' || familyForSignalDecision(decision) !== 'camera') return null;

  const atoms = zoomMotionAtoms(decision);
  const speechPeak = zoomAtomNumber(atoms, 'speechPeak');
  const wordImportance = zoomAtomNumber(atoms, 'wordImportance');
  const beatStrength = zoomAtomNumber(atoms, 'beatStrength');
  const emotionIntensity = zoomAtomNumber(atoms, 'emotionIntensity');
  const visualSignificance = zoomAtomNumber(atoms, 'visualSignificance');
  const visualMotion = zoomAtomNumber(atoms, 'visualMotion');
  const shotScale = zoomAtomNumber(atoms, 'shotScale');
  const textOnScreen = zoomAtomNumber(atoms, 'textOnScreen');
  const visualComplexity = zoomAtomNumber(atoms, 'visualComplexity');
  const topicDelta = zoomAtomNumber(atoms, 'topicDelta');
  const hasSubjectAnchor = zoomHasSubjectAnchor(atoms);
  const intensity = roundAuditNumber(clamp01(Math.max(
    speechPeak,
    wordImportance,
    beatStrength,
    emotionIntensity,
    visualSignificance * 0.86,
    visualMotion * 0.72,
  )));
  const visualPressure = roundAuditNumber(clamp01(Math.max(
    textOnScreen,
    visualComplexity,
    visualMotion * 0.66,
    shotScale * 0.18,
  )));
  const reasonKeys = zoomMotionReasonKeys({
    speechPeak,
    wordImportance,
    beatStrength,
    emotionIntensity,
    visualSignificance,
    visualMotion,
    topicDelta,
    hasSubjectAnchor,
    visualPressure,
  });

  if (reasonKeys.length === 0) return null;

  const visualMotionAllowed = intensity >= 0.45 && visualPressure < 0.9;

  return {
    version: 'zoom-motion-plan-v1',
    family: 'zoom',
    source: 'signal-family-planner',
    visualMotionAllowed,
    reasonKeys,
    atoms,
    evidence: {
      intensity,
      visualPressure,
      hasSubjectAnchor,
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
  setFallback('shotScale', ['shotScale', 'shot_scale']);
  setFallback('speechPeak', ['speechPeak', 'speech_energy', 'energy_delta', 'speech.energy']);
  setFallback('wordImportance', ['wordImportance', 'word_importance', 'word.importance']);
  setFallback('beatStrength', ['beatStrength', 'beat_strength', 'music_energy', 'audio.music_energy']);
  setFallback('emotionIntensity', ['emotionIntensity', 'emotion_intensity', 'emotional_arousal', 'speech.emotion_intensity']);
  setFallback('visualSignificance', ['visualSignificance', 'visual_significance', 'visual.significance']);
  setFallback('visualMotion', ['visualMotion', 'motion_intensity', 'visual.motion_intensity']);
  setFallback('textOnScreen', ['textOnScreen', 'text_on_screen', 'visual.text_on_screen']);
  setFallback('visualComplexity', ['visualComplexity', 'visual_complexity', 'visual.complexity']);
  setFallback('topicDelta', ['topicDelta', 'topic_shift', 'topicShift', 'topic_shift_strength', 'narrative_pressure']);
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

function zoomMotionReasonKeys(input: {
  speechPeak: number;
  wordImportance: number;
  beatStrength: number;
  emotionIntensity: number;
  visualSignificance: number;
  visualMotion: number;
  topicDelta: number;
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
  if (input.topicDelta >= 0.62) reasonKeys.push('topic-shift');
  if (input.hasSubjectAnchor) reasonKeys.push('subject-anchor');
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
  assign('shot_scale', 'shotScale');
  assign('speech_energy', 'speechPeak');
  assign('word_importance', 'wordImportance');
  assign('beat_strength', 'beatStrength');
  assign('emotion_intensity', 'emotionIntensity');
  assign('visual_significance', 'visualSignificance');
  assign('motion_intensity', 'visualMotion');
  assign('text_on_screen', 'textOnScreen');
  assign('visual_complexity', 'visualComplexity');
  assign('topic_shift', 'topicDelta');
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
  )));
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
  });

  if (!hasTextAnchor && reasonKeys.length === 0) return null;

  const emphasisAllowed = hasTextAnchor && salience >= 0.38 && readabilityPressure < 0.94;

  return {
    version: 'caption-moment-plan-v1',
    family: 'caption',
    source: 'signal-family-planner',
    emphasisAllowed,
    reasonKeys,
    atoms,
    evidence: {
      salience,
      readabilityPressure,
      speechPace,
      hasTextAnchor,
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
  return atoms;
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
  return aliases;
}

function resolveSfxSyncPlan(decision: ReactiveEditDecision): UnifiedSfxSyncPlan | null {
  if ((decision.type !== 'sfx' && decision.type !== 'sfx-trigger') || familyForSignalDecision(decision) !== 'audio') return null;

  const sfxType = normalizeParamString(decision.params.sfxType ?? decision.params.type);
  if (!sfxType || sfxType === 'none') return null;

  const atoms = sfxSyncAtoms(decision);
  const transitionAnchored = isTransitionAnchoredSfx(decision);
  const beatStrength = signalAtomNumber(atoms, 'beatStrength');
  const phraseImpact = signalAtomNumber(atoms, 'phraseImpact');
  const transitionEnergy = signalAtomNumber(atoms, 'transitionEnergy');
  const providerQuality = signalAtomNumber(atoms, 'providerQuality');
  const speechEnergy = signalAtomNumber(atoms, 'speechEnergy');
  const silencePocketMs = signalAtomRawNumber(atoms, 'silencePocketMs');
  const hasBeatAnchor = sfxHasBeatAnchor(decision, atoms);
  const hasLinkedOverlay = hasAnyParam(decision, ['linkedOverlayId']) || atoms.linkedOverlayId !== undefined;
  const hasTransitionEvidence = !transitionAnchored || hasTransitionSfxBoundaryEvidence(decision);
  const hasRealSyncAnchor = hasBeatAnchor || (transitionAnchored && hasTransitionEvidence) || hasLinkedOverlay;
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
  const syncConfidence = roundAuditNumber(clamp01(Math.max(
    beatStrength,
    phraseImpact,
    transitionAnchored && hasTransitionEvidence ? 0.74 : 0,
    hasBeatAnchor ? 0.68 : 0,
    hasLinkedOverlay ? 0.64 : 0,
    silencePocketMs >= 140 ? 0.48 : 0,
  )));
  const restraint = roundAuditNumber(clamp01(Math.max(
    speechEnergy * 0.42,
    providerQuality > 0 ? (1 - providerQuality) * 0.35 : 0,
  )));
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
  });

  if (reasonKeys.length === 0) return null;

  const placementAllowed = hasTransitionEvidence && syncConfidence >= 0.45 && impact >= 0.42 && restraint < 0.95;

  return {
    version: 'sfx-sync-plan-v1',
    family: 'audio',
    source: 'signal-family-planner',
    placementAllowed,
    reasonKeys,
    atoms,
    evidence: {
      syncConfidence,
      impact,
      restraint,
      transitionAnchored,
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
  setFallback('transitionFrame', ['transitionFrame', 'boundaryFrame', 'cutFrame']);
  setFallback('transitionEnergy', ['transitionEnergy', 'topicDelta', 'topic_shift', 'motion_intensity']);
  setFallback('beatStrength', ['beatStrength', 'beat_strength', 'music_energy']);
  setFallback('phraseImpact', ['phraseImpact', 'visceral_impact', 'speech_energy']);
  setFallback('silencePocketMs', ['silencePocketMs', 'speechGapMs', 'silence_duration_ms']);
  setFallback('speechEnergy', ['speechEnergy', 'speech_energy']);
  setFallback('providerQuality', ['providerQuality', 'asset_quality', 'candidateQuality']);
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
}): string[] {
  const reasonKeys: string[] = [];
  if (input.beatStrength >= 0.5 || input.hasBeatAnchor) reasonKeys.push('beat-anchor');
  if (input.phraseImpact >= 0.5) reasonKeys.push('phrase-impact');
  if (input.transitionAnchored && input.hasTransitionEvidence) reasonKeys.push('transition-boundary');
  if (input.hasLinkedOverlay) reasonKeys.push('linked-overlay');
  if (input.silencePocketMs >= 140) reasonKeys.push('silence-pocket');
  if (input.impact >= 0.58) reasonKeys.push('impact');
  if (input.syncConfidence >= 0.62) reasonKeys.push('sync-confidence');
  return [...new Set(reasonKeys)];
}

function sfxCompatibilityTokenImpact(sfxType: string): number {
  if (!sfxType || sfxType === 'none') return 0;
  if (sfxType.includes('impact') || sfxType.includes('hit') || sfxType.includes('boom')) return 0.58;
  if (sfxType.includes('whoosh') || sfxType.includes('swoosh') || sfxType.includes('swish')) return 0.5;
  if (sfxType.includes('tick') || sfxType.includes('click')) return 0.44;
  return 0.42;
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

  if (signalDecision.type === 'graphic' && !hasEvidenceBackedGraphicContent(signalDecision)) {
    return { executable: false, reason: 'missing-graphic-content-evidence' };
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
      return { executable: true, reason: 'licensed-by-graphic-content-atoms' };
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
    return plan?.visualTransitionAllowed
      ? { executable: true, reason: 'licensed-by-transition-family-plan' }
      : { executable: false, reason: 'hard-cut-is-boundary-evidence' };
  }

  if (plan && !plan.visualTransitionAllowed) {
    return { executable: false, reason: 'transition-family-plan-kept-clean-cut' };
  }

  return { executable: true, reason: 'licensed-by-transition-boundary-atoms' };
}

function resolveCameraExecutionLicense(decision: ReactiveEditDecision): { executable: boolean; reason: string } {
  if (!hasCameraMotionEvidence(decision)) {
    return { executable: false, reason: 'missing-camera-motion-atoms' };
  }

  if (decision.type === 'zoom') {
    const zoomPlan = resolveZoomMotionPlan(decision);
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

function applySignalFamilyPlanner(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
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
          },
        },
      },
    };
  }

  return signalDecision;
}

function markSignalSupplement(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  const plannedDecision = applySignalFamilyPlanner(signalDecision, reason);
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
  const decisions = edl.decisions.map(cloneDecision);
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

function cloneDecision(decision: CompatibleEditDecision): ReactiveEditDecision {
  const confidence = clamp01(decision.confidence ?? 0);
  return {
    ...decision,
    type: decision.type,
    frame: decision.frame,
    durationFrames: decision.durationFrames,
    priority: decision.priority ?? priorityFromConfidence(confidence),
    source: decision.source ?? 'unknown-source',
    signal: decision.signal ?? decision.technique ?? decision.type,
    reason: decision.reason ?? '',
    params: { ...(decision.params ?? {}) },
    confidence,
  } as ReactiveEditDecision;
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
