import type { EditDecision, EditDecisionList } from './reactive-edit-engine';
import type { SeamLink } from '../storyline/storyline';

type VisualStorylineOverlay = {
  id: string | number;
  type: string;
  from: number;
  durationInFrames: number;
  storyline?: {
    source?: unknown;
    sourceRef?: unknown;
    role?: unknown;
    order?: unknown;
    linkFromPrev?: unknown;
  };
};

type SeamPlan = {
  relation: SeamLink;
  transitionJob: 'direct-continuity' | 'smooth-continuity' | 'emphasize-turn' | 'reset-attention';
  transitionIntent?: 'continuity-blend' | 'impact-transfer';
  confidence: number;
  signals: Record<string, number | string>;
  params: Record<string, number | string | boolean>;
};

const STORYLINE_VISUAL_TYPES = new Set(['video', 'image']);

function normalizeSeamLink(value: unknown): SeamLink | null {
  return value === 'therefore' || value === 'but' || value === 'and-then' || value === 'meanwhile'
    ? value
    : null;
}

function seamPlanFor(link: SeamLink): SeamPlan {
  switch (link) {
    case 'but':
      return {
        relation: link,
        transitionJob: 'reset-attention',
        transitionIntent: 'impact-transfer',
        confidence: 0.76,
        signals: {
          topic_shift: 0.78,
          emotion_intensity: 0.62,
          word_importance: 0.68,
          visual_significance: 0.58,
        },
        params: {
          semanticContrast: 0.9,
          topicDelta: 0.78,
          emotionJump: 0.62,
        },
      };
    case 'therefore':
      return {
        relation: link,
        transitionJob: 'smooth-continuity',
        transitionIntent: 'continuity-blend',
        confidence: 0.72,
        signals: {
          topic_shift: 0.46,
          emotion_intensity: 0.44,
          word_importance: 0.55,
          visual_significance: 0.45,
        },
        params: {
          claimEvidenceRelation: 0.82,
          topicDelta: 0.46,
          semanticContrast: 0.22,
        },
      };
    case 'meanwhile':
      return {
        relation: link,
        transitionJob: 'smooth-continuity',
        transitionIntent: 'continuity-blend',
        confidence: 0.66,
        signals: {
          topic_shift: 0.38,
          emotion_intensity: 0.36,
          visual_significance: 0.42,
        },
        params: {
          parallelRelation: 0.74,
          topicDelta: 0.38,
          semanticContrast: 0.3,
        },
      };
    case 'and-then':
      return {
        relation: link,
        transitionJob: 'direct-continuity',
        confidence: 0.58,
        signals: {
          topic_shift: 0.18,
          emotion_intensity: 0.24,
          visual_significance: 0.28,
        },
        params: {
          sentenceContinues: 0.72,
          topicDelta: 0.18,
          semanticContrast: 0.08,
        },
      };
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function visualStorylineOverlays(overlays: readonly VisualStorylineOverlay[]): VisualStorylineOverlay[] {
  return overlays
    .filter((overlay) => STORYLINE_VISUAL_TYPES.has(overlay.type))
    .filter((overlay) => Number.isFinite(overlay.from) && Number.isFinite(overlay.durationInFrames))
    .sort((a, b) => a.from - b.from);
}

export function buildStorylineSeamTransitionEdl(
  projectId: string,
  overlays: readonly VisualStorylineOverlay[],
  fps = 30,
): EditDecisionList | null {
  const visual = visualStorylineOverlays(overlays);
  const decisions: EditDecision[] = [];

  for (let index = 1; index < visual.length; index += 1) {
    const clipA = visual[index - 1];
    const clipB = visual[index];
    const link = normalizeSeamLink(clipB.storyline?.linkFromPrev);
    if (!link) continue;

    const boundaryFrame = clipA.from + clipA.durationInFrames;
    if (Math.abs(boundaryFrame - clipB.from) > 2) continue;

    const plan = seamPlanFor(link);
    const durationFrames = Math.max(4, Math.min(36, Math.round(fps * 0.5)));
    const params = {
      version: 'storyline-seam-transition-v1',
      boundaryAtom: 'storyline-seam',
      boundaryFrame,
      transitionFrame: boundaryFrame,
      clipAId: clipA.id,
      clipBId: clipB.id,
      relation: plan.relation,
      storylineRelation: plan.relation,
      transitionJob: plan.transitionJob,
      ...(plan.transitionIntent ? { transitionIntent: plan.transitionIntent } : {}),
      sourceRefA: readString(clipA.storyline?.sourceRef),
      sourceRefB: readString(clipB.storyline?.sourceRef),
      roleA: readString(clipA.storyline?.role),
      roleB: readString(clipB.storyline?.role),
      orderA: readNumber(clipA.storyline?.order),
      orderB: readNumber(clipB.storyline?.order),
      ...plan.params,
      signals: {
        ...plan.signals,
        storyline_relation: plan.relation,
      },
      calibrationStatus: 'invented-needs-calibration',
    };

    decisions.push({
      type: 'transition',
      frame: boundaryFrame,
      durationFrames,
      priority: plan.confidence >= 0.7 ? 3 : 4,
      source: 'storyline-seam',
      signal: `storyline.${plan.relation}`,
      reason: `Storyline seam relation "${plan.relation}" between ordered clips`,
      params,
      confidence: plan.confidence,
    });
  }

  if (decisions.length === 0) return null;

  return {
    projectId,
    generatedAt: new Date(),
    totalDecisions: decisions.length,
    decisions,
    stats: {
      cutsPerMinute: 0,
      transitionCount: decisions.length,
      graphicCount: 0,
      zoomCount: 0,
      speedChangeCount: 0,
      averageConfidence: decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length,
    },
  };
}
