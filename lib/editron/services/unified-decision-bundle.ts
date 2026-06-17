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
  role: UnifiedSignalDecisionRole;
  timingAnchor: {
    kind: UnifiedSignalTimingAnchorKind;
    frame: number;
    durationFrames: number;
  };
  evidenceStrength: number;
  completeness: number;
  risk: number;
  riskFlags: string[];
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

  const mergedEdl = normalizeEdl({
    ...primaryBundle.edl,
    decisions: mergedDecisionEntries
      .map((entry) => entry.decision)
      .sort((a, b) => a.frame - b.frame || a.priority - b.priority),
  });

  return {
    ...primaryBundle,
    source: primaryBundle.authority.executableProducer === 'creative-brief'
      ? 'creative-brief+signal-driven'
      : primaryBundle.source,
    authority: authorityAfterSignalMerge(primaryBundle.authority, signalDecisionCount, addedSignalDecisionCount),
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

  const decisionMode = addedSignalDecisionCount > 0 ? 'unified-planner' : 'merged-supplemental';

  return {
    version: 'unified-decision-authority-v1',
    executableProducer: 'unified-planner',
    advisoryProducers: mergeAdvisoryProducers(authority.advisoryProducers, ['creative-brief', 'signal-driven']),
    signalDecisionRole: addedSignalDecisionCount > 0 ? 'co-owner' : 'advisor',
    signalDecisionsCanAddExecutable: addedSignalDecisionCount > 0,
    decisionMode,
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
  updateAuditBucket(audit.byType, decision.type, decision);
  updateAuditBucket(audit.byFamily, candidate.family, decision);
  updateAuditBucket(audit.byReason, reason, decision);
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
): void {
  const bucket = buckets[key] ?? createMutableAuditBucket();
  const confidence = Number.isFinite(decision.confidence) ? decision.confidence : 0;
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
  const completeness = completenessForSignalDecision(decision);
  const riskFlags = riskFlagsForSignalDecision(decision, completeness);
  const risk = roundAuditNumber(Math.min(1, Math.max(0, (1 - decision.confidence) * 0.6 + (1 - completeness) * 0.4)));

  return {
    version: 'signal-execution-candidate-v1',
    family,
    role: roleForSignalDecision(decision),
    timingAnchor: {
      kind: timingAnchorKindForSignalDecision(decision),
      frame: decision.frame,
      durationFrames: Math.max(1, decision.durationFrames ?? 1),
    },
    evidenceStrength: roundAuditNumber(clamp01(decision.confidence)),
    completeness,
    risk,
    riskFlags,
    calibrationStatus: 'invented-needs-calibration',
  };
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
  if (minConfidence !== undefined && decision.confidence < minConfidence) flags.push('below-execution-confidence');
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
  }

  if (decision.type === 'graphic' && !hasEvidenceBackedGraphicContent(decision)) {
    flags.push('missing-graphic-content-evidence');
  }

  return flags;
}

function hasAnyParam(decision: ReactiveEditDecision, keys: string[]): boolean {
  return keys.some((key) => {
    const value = decision.params[key];
    if (typeof value === 'string') return value.trim().length > 0;
    return value !== undefined && value !== null;
  });
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
  const minConfidence = SIGNAL_EXECUTION_MIN_CONFIDENCE[signalDecision.type];
  if (minConfidence === undefined) {
    return { executable: false, reason: 'unsupported-signal-decision-type' };
  }

  if (signalDecision.confidence < minConfidence) {
    return { executable: false, reason: 'below-signal-confidence-floor' };
  }

  if (signalDecision.type === 'transition') {
    const transitionType = normalizeParamString(
      signalDecision.params.transitionType ?? signalDecision.params.type ?? signalDecision.params.transType,
    );
    if (NON_EXECUTABLE_TRANSITION_TYPES.has(transitionType)) {
      return { executable: false, reason: 'hard-cut-is-boundary-evidence' };
    }
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
      return hasTransitionBoundaryEvidence(decision)
        ? { executable: true, reason: 'licensed-by-transition-boundary-atoms' }
        : { executable: false, reason: 'missing-transition-boundary-atoms' };
    case 'camera':
      return hasCameraMotionEvidence(decision)
        ? { executable: true, reason: 'licensed-by-camera-motion-atoms' }
        : { executable: false, reason: 'missing-camera-motion-atoms' };
    case 'audio':
      return hasAudioBeatEvidence(decision)
        ? { executable: true, reason: 'licensed-by-audio-beat-atoms' }
        : { executable: false, reason: 'missing-audio-beat-atoms' };
    case 'caption':
      return hasCaptionMomentEvidence(decision)
        ? { executable: true, reason: 'licensed-by-caption-moment-atoms' }
        : { executable: false, reason: 'missing-caption-moment-atoms' };
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

function hasTransitionBoundaryEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'boundaryAtom',
    'boundaryFrame',
    'clipAId',
    'clipBId',
    'motionVectorX',
    'motionVectorY',
    'topicDelta',
    'speechGapMs',
    'beatPhase',
    'visualContinuity',
    'transitionJob',
    'relation',
  ]);
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
    'emotion',
    'visualMotion',
  ]);
}

function hasAudioBeatEvidence(decision: ReactiveEditDecision): boolean {
  return hasAnyParam(decision, [
    'beatFrame',
    'beatStrength',
    'transitionId',
    'transitionFrame',
    'linkedOverlayId',
    'anchorFrame',
    'phraseImpact',
    'rhythmRole',
    'sfxRole',
    'role',
  ]);
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
    confidence: decision.confidence,
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

function markSignalSupplement(signalDecision: ReactiveEditDecision, reason: string): ReactiveEditDecision {
  return {
    ...signalDecision,
    params: {
      ...signalDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(signalDecision),
        version: 'unified-decision-bundle-v1',
        role: 'signal-supplement',
        executionLicense: reason,
      },
    },
  };
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
