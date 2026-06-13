import {
  mapEditedFrameToSourceFrame,
  type EditedTimelineContext,
} from './edited-timeline-context';

export interface DecisionTimelineGuardDecision {
  frame: number;
  type?: string;
  source?: string;
  params?: Record<string, unknown>;
}

export interface CanonicalDecisionTimelineStamp {
  version: 'canonical-decision-timeline-v1';
  frameSpace: 'cut';
  cutFrame: number | null;
  sourceFrame: number | null;
  sourceMapped: boolean;
  status: 'ok' | 'out-of-range' | 'unmapped-source';
  durationFrames: number;
  hasSourceMapping: boolean;
  requiresSourceMapping: boolean;
}

export interface CanonicalDecisionTimelineEvidence {
  version: 'canonical-decision-timeline-v1';
  frameSpace: 'cut';
  decisionCount: number;
  stampedDecisionCount: number;
  durationFrames: number;
  hasSourceMapping: boolean;
  requiresSourceMapping: boolean;
  outOfRangeDecisionCount: number;
  unmappedSourceDecisionCount: number;
}

export function enforceCanonicalDecisionTimeline(
  decisions: DecisionTimelineGuardDecision[],
  context: EditedTimelineContext,
): CanonicalDecisionTimelineEvidence {
  if (!context.evidence.isCanonicalDecisionTimeline) {
    throw new Error(
      `[Director] Unsafe canonical decision timeline: ${context.evidence.missingSourceMappingCount}/` +
      `${context.evidence.inputClipCount} video clips are missing source mapping`,
    );
  }

  const evidence: CanonicalDecisionTimelineEvidence = {
    version: 'canonical-decision-timeline-v1',
    frameSpace: 'cut',
    decisionCount: decisions.length,
    stampedDecisionCount: 0,
    durationFrames: context.durationFrames,
    hasSourceMapping: context.evidence.hasSourceMapping,
    requiresSourceMapping: context.evidence.requiresSourceMapping,
    outOfRangeDecisionCount: 0,
    unmappedSourceDecisionCount: 0,
  };

  for (const decision of decisions) {
    const cutFrame = Number.isFinite(decision.frame) ? Math.round(decision.frame) : null;
    const outOfRange = cutFrame == null
      || cutFrame < 0
      || cutFrame >= Math.max(1, context.durationFrames);
    const sourceFrame = outOfRange
      ? null
      : resolveSourceFrame(cutFrame, context);
    const unmappedSource = !outOfRange && sourceFrame == null;
    const status: CanonicalDecisionTimelineStamp['status'] = outOfRange
      ? 'out-of-range'
      : unmappedSource
      ? 'unmapped-source'
      : 'ok';

    if (outOfRange) evidence.outOfRangeDecisionCount++;
    if (unmappedSource) evidence.unmappedSourceDecisionCount++;

    const params = isRecord(decision.params) ? decision.params : {};
    decision.params = params;
    params.canonicalTimeline = {
      version: 'canonical-decision-timeline-v1',
      frameSpace: 'cut',
      cutFrame,
      sourceFrame,
      sourceMapped: sourceFrame != null,
      status,
      durationFrames: context.durationFrames,
      hasSourceMapping: context.evidence.hasSourceMapping,
      requiresSourceMapping: context.evidence.requiresSourceMapping,
    } satisfies CanonicalDecisionTimelineStamp;
    evidence.stampedDecisionCount++;
  }

  if (evidence.outOfRangeDecisionCount > 0 || evidence.unmappedSourceDecisionCount > 0) {
    throw new Error(
      `[Director] Non-canonical decision timeline: ` +
      `${evidence.outOfRangeDecisionCount} out-of-range, ` +
      `${evidence.unmappedSourceDecisionCount} unmapped-source decisions`,
    );
  }

  return evidence;
}

function resolveSourceFrame(frame: number, context: EditedTimelineContext): number | null {
  if (!context.evidence.hasSourceMapping) return frame;
  return mapEditedFrameToSourceFrame(frame, context.sourceClips);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
