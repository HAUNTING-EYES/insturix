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

export interface UnifiedDecisionBundleEvidence {
  primaryDecisionCount: number;
  signalDecisionCount: number;
  addedSignalDecisionCount: number;
  validatedDecisionCount: number;
  suppressedSignalDuplicateCount: number;
}

export interface UnifiedDecisionBundle {
  source: UnifiedDecisionBundleSource;
  edl: ReactiveEditDecisionList;
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  expectedExecuted: number;
  expectedSkipped: number;
  evidence: UnifiedDecisionBundleEvidence;
}

interface CreateUnifiedDecisionBundleOptions {
  source: Exclude<UnifiedDecisionBundleSource, 'creative-brief+signal-driven'>;
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
  const mergedDecisions = primaryBundle.edl.decisions.map(cloneDecision);
  let addedSignalDecisionCount = 0;
  let validatedDecisionCount = 0;
  let suppressedSignalDuplicateCount = 0;

  for (const signalDecision of signalEdl.decisions.map(cloneDecision)) {
    const matchIndex = findNearEquivalentDecisionIndex(mergedDecisions, signalDecision, maxNearFrameWindow);
    if (matchIndex >= 0) {
      mergedDecisions[matchIndex] = attachSignalValidation(mergedDecisions[matchIndex], signalDecision);
      validatedDecisionCount++;
      suppressedSignalDuplicateCount++;
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
    source: primaryBundle.source === 'creative-brief'
      ? 'creative-brief+signal-driven'
      : primaryBundle.source,
    edl: mergedEdl,
    expectedExecuted: mergedEdl.totalDecisions,
    expectedSkipped: primaryBundle.expectedSkipped + suppressedSignalDuplicateCount,
    evidence: {
      primaryDecisionCount: primaryBundle.evidence.primaryDecisionCount,
      signalDecisionCount: primaryBundle.evidence.signalDecisionCount + signalDecisionCount,
      addedSignalDecisionCount: primaryBundle.evidence.addedSignalDecisionCount + addedSignalDecisionCount,
      validatedDecisionCount: primaryBundle.evidence.validatedDecisionCount + validatedDecisionCount,
      suppressedSignalDuplicateCount: primaryBundle.evidence.suppressedSignalDuplicateCount + suppressedSignalDuplicateCount,
    },
  };
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
