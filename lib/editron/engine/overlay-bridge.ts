/**
 * Overlay Bridge — converts utility scorer GridPointDecisions into EditDecisions
 * that the EDL executor can consume.
 *
 * ScoringResult.outputValues maps directly to EditDecision.params for most categories.
 * For graphics: event signal context provides the text content (value, name, keyword).
 *
 * Consumers: director-agent.ts (Path D, when USE_UTILITY_LIVE=true)
 */

import type { EditDecision, EditDecisionList } from '../types/edit-decision';
import type { ScoringResult, OverlayCategory } from './utility-types';
import type { SignalTimeline, EventSignal } from '../services/signal-registry';

interface GridPointDecision {
  frame: number;
  timestampMs: number;
  winners: Partial<Record<OverlayCategory, ScoringResult | null>>;
}

const CATEGORY_TO_TYPE: Record<string, EditDecision['type']> = {
  zoom: 'zoom',
  transition: 'transition',
  graphic: 'graphic',
  cut: 'cut',
  camera: 'camera-shake',
  sfx: 'sfx-trigger',
};

const GRAPHIC_CONTEXT_RESOLVERS: Record<string, (events: EventSignal[], frame: number, gridInterval: number) => Record<string, string> | null> = {
  stat_graphic(events, frame, gi) {
    const evt = findNearestEvent(events, frame, gi, 'entity.number');
    if (!evt?.context) return null;
    const ctx = evt.context;
    const match = ctx.match(/^([^0-9]*)([\d,.]+)(.*)$/);
    if (match) {
      const payload: Record<string, string> = { value: match[2] ?? ctx, text: ctx };
      const prefix = match[1]?.trim();
      const suffix = match[3]?.trim();
      if (prefix) payload.prefix = prefix;
      if (suffix) payload.suffix = suffix;
      return payload;
    }
    return { value: ctx, text: ctx };
  },
  lower_third(events, frame, gi) {
    const evt = findNearestEvent(events, frame, gi, 'entity.name');
    if (!evt?.context) return null;
    return { name: evt.context, text: evt.context };
  },
  keyword_highlight(events, frame, gi) {
    const evt = findNearestEvent(events, frame, gi, 'speech.emphasis_word');
    if (!evt?.context) return null;
    return { text: evt.context, keyword: evt.context };
  },
  callout(events, frame, gi) {
    const evt = findNearestEvent(events, frame, gi, 'entity.claim_strength');
    if (!evt?.context) return null;
    return { text: evt.context, body: evt.context };
  },
};

function findNearestEvent(events: EventSignal[], frame: number, gridInterval: number, signal: string): EventSignal | undefined {
  let best: EventSignal | undefined;
  let bestDist = Infinity;
  for (const e of events) {
    if (e.signal !== signal) continue;
    const dist = Math.abs(e.frame - frame);
    if (dist < bestDist && dist <= gridInterval) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

const SIGNAL_MAP: Array<[string, string]> = [
  ['formality', 'formality'], ['enthusiasm', 'enthusiasm'], ['warmth', 'warmth'],
  ['speech.energy', 'speech_energy'], ['speech.energy_delta', 'energy_delta'],
  ['speech.energy_ema', 'speech_energy_ema'], ['speech.energy_surprise', 'energy_surprise'],
  ['speech.emotion_intensity', 'emotion_intensity'], ['speech.speaking_rate_wpm', 'speaking_rate_wpm'],
  ['speech.silence_normalized', 'silence_normalized'], ['speech.coverage', 'speech_coverage'],
  ['visual.motion_intensity', 'motion_intensity'], ['visual.face_present', 'face_present'],
  ['visual.engagement', 'visual_engagement'], ['visual.significance', 'visual_significance'],
  ['visual.motion_vector.x', 'motion_vector_x'], ['visual.motion_vector.y', 'motion_vector_y'],
  ['visual.scene_type', 'scene_type'], ['visual.complexity', 'visual_complexity'],
  ['visual.text_on_screen', 'text_on_screen'], ['visual.shot_scale', 'shot_scale'],
  ['visual.text_coverage', 'text_coverage'], ['visual.text_box_count', 'text_box_count'],
  ['visual.object_count', 'object_count'], ['visual.face_count', 'face_count'],
  ['visual.main_subject.x', 'main_subject_x'], ['visual.main_subject.y', 'main_subject_y'],
  ['visual.main_subject.width', 'main_subject_width'], ['visual.main_subject.height', 'main_subject_height'],
  ['visual.negative_space.top', 'negative_space_top'], ['visual.negative_space.right', 'negative_space_right'],
  ['visual.negative_space.bottom', 'negative_space_bottom'], ['visual.negative_space.left', 'negative_space_left'],
  ['visual.action_type', 'action_type'], ['visual.motion_type', 'motion_type'],
  ['visual.face_emotion', 'face_emotion'], ['visual.eye_contact', 'eye_contact'],
  ['composite.cinematic_moment', 'cinematic_moment'], ['composite.montage_mode', 'montage_mode'],
  ['composite.narrative_pressure', 'narrative_pressure'],
  ['structural.position_in_video', 'position_in_video'],
  ['structural.time_since_last_cut', 'time_since_last_cut'],
  ['audio.music_beat', 'music_beat'], ['audio.music_energy', 'music_energy'],
  ['audio.bpm', 'bpm'], ['audio.music_tatum', 'music_tatum'],
];

function buildSignalSnapshot(
  gridSignals: Record<string, number | boolean | string>,
  globalSignals: Record<string, number | boolean | string>,
): Record<string, number | boolean | string> {
  const snapshot: Record<string, number | boolean | string> = {};
  const merged = { ...globalSignals, ...gridSignals };
  for (const [registryKey, flatKey] of SIGNAL_MAP) {
    const val = merged[registryKey];
    if (val != null && val !== '') {
      snapshot[flatKey] = val;
    }
  }
  return snapshot;
}

export function overlayResultsToEditDecisions(
  gridDecisions: GridPointDecision[],
  timeline: SignalTimeline,
  fps: number,
): EditDecisionList {
  const start = Date.now();
  const decisions: EditDecision[] = [];
  const lastFrameByCategory = new Map<string, number>();
  const SKIP_CATEGORIES = new Set(['filter', 'caption']);

  for (const gd of gridDecisions) {
    for (const [cat, winner] of Object.entries(gd.winners)) {
      if (!winner || SKIP_CATEGORIES.has(cat)) continue;

      const edlType = CATEGORY_TO_TYPE[cat];
      if (!edlType) continue;

      const lastFrame = lastFrameByCategory.get(cat) ?? -Infinity;
      const minGap = winner.rank > 0 ? (gd.winners[cat as OverlayCategory] as ScoringResult).rank : 0;
      const defGap = getMinGapForCategory(cat);
      if (gd.frame - lastFrame < defGap) continue;

      const params: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(winner.outputValues)) {
        if (v != null) params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
      }
      if (winner.placementAdjustment) {
        (params as Record<string, unknown>).placementAdjustment = winner.placementAdjustment;
        if (winner.placementAdjustment.candidateRegion && !params.position) {
          params.position = winner.placementAdjustment.candidateRegion;
        }
      }

      if (edlType === 'graphic') {
        const graphicType = params.graphicType as string;
        const resolver = graphicType ? GRAPHIC_CONTEXT_RESOLVERS[graphicType] : null;
        if (resolver) {
          const textContent = resolver(timeline.eventSignals, gd.frame, timeline.gridInterval);
          if (!textContent) continue;
          Object.assign(params, textContent);
        } else if (!params.text) {
          continue;
        }
      }

      const gridSnap = timeline.gridSignals.get(gd.frame);
      if (gridSnap) {
        (params as Record<string, unknown>).signals = buildSignalSnapshot(
          gridSnap as Record<string, number | boolean | string>,
          timeline.globalSignals as Record<string, number | boolean | string>,
        );
      }

      decisions.push({
        type: edlType,
        frame: gd.frame,
        confidence: winner.totalScore,
        source: `utility:${winner.overlayId}`,
        technique: `overlay:${winner.overlayId}`,
        params,
        reason: winner.overlayId,
      });

      lastFrameByCategory.set(cat, gd.frame);
    }
  }

  return {
    decisions,
    metadata: {
      totalMappingsEvaluated: gridDecisions.length * Object.keys(CATEGORY_TO_TYPE).length,
      totalMappingsFired: decisions.length,
      totalDecisionsGenerated: decisions.length,
      totalDecisionsSuppressed: 0,
      executionTimeMs: Date.now() - start,
    },
  };
}

function getMinGapForCategory(cat: string): number {
  const gaps: Record<string, number> = {
    zoom: 90, transition: 0, graphic: 90, cut: 60, camera: 60, sfx: 30,
  };
  return gaps[cat] ?? 0;
}
