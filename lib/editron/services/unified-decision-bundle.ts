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

export type UnifiedDecisionExecutableProducer = Exclude<UnifiedDecisionBundleSource, 'creative-brief+signal-driven'>;

export interface UnifiedDecisionBundleAuthority {
  version: 'unified-decision-authority-v1';
  executableProducer: UnifiedDecisionExecutableProducer;
  advisoryProducers: UnifiedDecisionExecutableProducer[];
  signalDecisionRole: 'none' | 'primary' | 'advisor';
  signalDecisionsCanAddExecutable: boolean;
}

export interface UnifiedSignalDecisionEvidence {
  type: ReactiveEditDecision['type'];
  frame: number;
  durationFrames?: number;
  confidence: number;
  source: string;
  signal: string;
  reason: string;
  params?: Record<string, string | number | boolean>;
}

export interface UnifiedDecisionBundleEvidence {
  primaryDecisionCount: number;
  signalDecisionCount: number;
  addedSignalDecisionCount: number;
  validatedDecisionCount: number;
  suppressedSignalDuplicateCount: number;
  evidenceOnlySignalDecisionCount: number;
  evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[];
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
  source: UnifiedDecisionExecutableProducer;
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
      return mergeSignalDrivenBundle(primaryBundle, currentBundle.edl, options);
    }
    throw new Error(`Unified decision planner already has primary producer: ${currentBundle.source}`);
  }

  if (!currentBundle) {
    return createUnifiedDecisionBundle(candidate);
  }

  return mergeSignalDrivenBundle(currentBundle, candidate.edl, options);
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
  const canSupplementFromSignals = canPrimaryBundleDeferToSignals(primaryBundle);
  const signalSupplementLimit = canSupplementFromSignals
    ? getSignalSupplementLimit(primaryBundle)
    : 0;
  const mergedDecisions = primaryBundle.edl.decisions.map(cloneDecision);
  let addedSignalDecisionCount = 0;
  let validatedDecisionCount = 0;
  let suppressedSignalDuplicateCount = 0;
  let evidenceOnlySignalDecisionCount = 0;
  const evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[] = [];
  const creativePrimaryOwnsExecutableDecisions = primaryBundle.authority.executableProducer === 'creative-brief';

  for (const signalDecision of signalEdl.decisions.map(cloneDecision)) {
    const matchIndex = findNearEquivalentDecisionIndex(mergedDecisions, signalDecision, maxNearFrameWindow);
    if (matchIndex >= 0) {
      mergedDecisions[matchIndex] = attachSignalValidation(mergedDecisions[matchIndex], signalDecision);
      validatedDecisionCount++;
      suppressedSignalDuplicateCount++;
      continue;
    }

    if (creativePrimaryOwnsExecutableDecisions) {
      if (canSupplementFromSignals && addedSignalDecisionCount < signalSupplementLimit) {
        mergedDecisions.push(markSignalSupplement(signalDecision));
        addedSignalDecisionCount++;
        continue;
      }

      evidenceOnlySignalDecisionCount++;
      if (evidenceOnlySignalDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
        evidenceOnlySignalDecisions.push(summarizeSignalDecisionEvidence(signalDecision));
      }
      continue;
    }

    mergedDecisions.push(markSignalSupplement(signalDecision));
    addedSignalDecisionCount++;
  }

  const mergedEdl = normalizeEdl({
    ...primaryBundle.edl,
    decisions: mergedDecisions.sort((a, b) => a.frame - b.frame || a.priority - b.priority),
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
    },
  };
}

function authorityForSingleProducer(source: UnifiedDecisionExecutableProducer): UnifiedDecisionBundleAuthority {
  return {
    version: 'unified-decision-authority-v1',
    executableProducer: source,
    advisoryProducers: [],
    signalDecisionRole: source === 'signal-driven' ? 'primary' : 'none',
    signalDecisionsCanAddExecutable: source === 'signal-driven',
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

  return {
    version: 'unified-decision-authority-v1',
    executableProducer: 'creative-brief',
    advisoryProducers: authority.advisoryProducers.includes('signal-driven')
      ? authority.advisoryProducers
      : [...authority.advisoryProducers, 'signal-driven'],
    signalDecisionRole: 'advisor',
    signalDecisionsCanAddExecutable: addedSignalDecisionCount > 0,
  };
}

function canPrimaryBundleDeferToSignals(primaryBundle: UnifiedDecisionBundle): boolean {
  const primaryDecisionCount = primaryBundle.edl.totalDecisions;
  const averageConfidence = primaryBundle.edl.stats?.averageConfidence ?? 0;
  const hasSignalRichPrimaryDecision =
    (primaryBundle.edl.stats?.graphicCount ?? 0) > 0 ||
    (primaryBundle.edl.stats?.transitionCount ?? 0) > 0 ||
    (primaryBundle.edl.stats?.zoomCount ?? 0) > 0 ||
    (primaryBundle.edl.stats?.speedChangeCount ?? 0) > 0;

  return (
    (primaryDecisionCount <= PRIMARY_SIGNAL_SUPPLEMENT_DECISION_THRESHOLD &&
      averageConfidence < PRIMARY_SIGNAL_SUPPLEMENT_CONFIDENCE_THRESHOLD) ||
    (!hasSignalRichPrimaryDecision && primaryDecisionCount <= 3)
  );
}

function getSignalSupplementLimit(primaryBundle: UnifiedDecisionBundle): number {
  const baseBudget = Math.max(
    PRIMARY_SIGNAL_SUPPLEMENT_MIN_BUDGET,
    Math.round((primaryBundle.edl.totalDecisions * PRIMARY_SIGNAL_SUPPLEMENT_GROWTH_FACTOR) + 2),
  );
  return Math.min(PRIMARY_SIGNAL_SUPPLEMENT_HARD_CAP, baseBudget);
}

const SIGNAL_EVIDENCE_DETAIL_LIMIT = 64;
const PRIMARY_SIGNAL_SUPPLEMENT_DECISION_THRESHOLD = 4;
const PRIMARY_SIGNAL_SUPPLEMENT_CONFIDENCE_THRESHOLD = 0.75;
const PRIMARY_SIGNAL_SUPPLEMENT_MIN_BUDGET = 3;
const PRIMARY_SIGNAL_SUPPLEMENT_GROWTH_FACTOR = 2;
const PRIMARY_SIGNAL_SUPPLEMENT_HARD_CAP = 12;
const SIGNAL_EVIDENCE_PARAM_KEYS = new Set([
  'anchorFrame',
  'graphicType',
  'intensity',
  'keyword',
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

function summarizeSignalDecisionEvidence(decision: ReactiveEditDecision): UnifiedSignalDecisionEvidence {
  const params = compactSignalEvidenceParams(decision.params);
  return {
    type: decision.type,
    frame: decision.frame,
    ...(decision.durationFrames === undefined ? {} : { durationFrames: decision.durationFrames }),
    confidence: decision.confidence,
    source: decision.source,
    signal: decision.signal,
    reason: decision.reason,
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

function markSignalSupplement(signalDecision: ReactiveEditDecision): ReactiveEditDecision {
  return {
    ...signalDecision,
    params: {
      ...signalDecision.params,
      unifiedDecisionMerge: {
        ...readMergeMetadata(signalDecision),
        version: 'unified-decision-bundle-v1',
        role: 'signal-supplement',
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
