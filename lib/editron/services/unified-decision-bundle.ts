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

export interface UnifiedDecisionBundleAuthority {
  version: 'unified-decision-authority-v1';
  executableProducer: UnifiedDecisionExecutableProducer;
  advisoryProducers: UnifiedDecisionCandidateProducer[];
  signalDecisionRole: 'none' | 'primary' | 'advisor' | 'co-owner';
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
  const signalDecisions = signalEdl.decisions.map(cloneDecision);
  const signalExecutionBudgets = buildSignalExecutionBudgets(signalDecisions);
  const mergedDecisions = primaryBundle.edl.decisions.map(cloneDecision);
  let addedSignalDecisionCount = 0;
  let validatedDecisionCount = 0;
  let suppressedSignalDuplicateCount = 0;
  let evidenceOnlySignalDecisionCount = 0;
  const evidenceOnlySignalDecisions: UnifiedSignalDecisionEvidence[] = [];
  const signalPrimaryOwnsExecutableDecisions = primaryBundle.authority.executableProducer === 'signal-driven';

  for (const signalDecision of signalDecisions) {
    const matchIndex = findNearEquivalentDecisionIndex(mergedDecisions, signalDecision, maxNearFrameWindow);
    if (matchIndex >= 0) {
      mergedDecisions[matchIndex] = attachSignalValidation(mergedDecisions[matchIndex], signalDecision);
      validatedDecisionCount++;
      suppressedSignalDuplicateCount++;
      continue;
    }

    if (!signalPrimaryOwnsExecutableDecisions) {
      const license = resolveSignalExecutionLicense(mergedDecisions, signalDecision, signalExecutionBudgets);
      if (license.executable) {
        mergedDecisions.push(markSignalSupplement(signalDecision, license.reason));
        addedSignalDecisionCount++;
        continue;
      }

      evidenceOnlySignalDecisionCount++;
      if (evidenceOnlySignalDecisions.length < SIGNAL_EVIDENCE_DETAIL_LIMIT) {
        evidenceOnlySignalDecisions.push(summarizeSignalDecisionEvidence(signalDecision, license.reason));
      }
      continue;
    }

    mergedDecisions.push(markSignalSupplement(signalDecision, 'signal-primary'));
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

function authorityForSingleProducer(source: UnifiedDecisionCandidateProducer): UnifiedDecisionBundleAuthority {
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
    executableProducer: addedSignalDecisionCount > 0 ? 'unified-planner' : 'creative-brief',
    advisoryProducers: mergeAdvisoryProducers(authority.advisoryProducers, ['creative-brief', 'signal-driven']),
    signalDecisionRole: addedSignalDecisionCount > 0 ? 'co-owner' : 'advisor',
    signalDecisionsCanAddExecutable: addedSignalDecisionCount > 0,
  };
}

const SIGNAL_EVIDENCE_DETAIL_LIMIT = 64;
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
};
const NON_EXECUTABLE_TRANSITION_TYPES = new Set(['hard-cut', 'cut', 'none']);
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

  const budget = budgets[signalDecision.type] ?? 0;
  const executableCountForType = mergedDecisions.filter((decision) => decision.type === signalDecision.type).length;
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

  return { executable: true, reason: 'licensed-by-signal-policy' };
}

function normalizeParamString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function summarizeSignalDecisionEvidence(decision: ReactiveEditDecision, reason?: string): UnifiedSignalDecisionEvidence {
  const params = compactSignalEvidenceParams(decision.params);
  return {
    type: decision.type,
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
