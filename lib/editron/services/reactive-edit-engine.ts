/**
 * Reactive Edit Engine
 *
 * Reads all 5 analysis tracks and generates an Edit Decision List (EDL) —
 * a complete ordered sequence of every edit action with frame-accurate timing.
 *
 * Priority hierarchy: Speech > Music > Motion > Subject > Visual
 *
 * From master plan Section 9:
 * "The Reactive Edit Engine reads all five analysis tracks simultaneously
 * and generates an Edit Decision List — a complete ordered sequence of
 * every edit action, with frame-accurate timing and reasoning."
 */

import type {
  FiveTrackAnalysis,
  SpeechTrack,
  VisualTrack,
  MusicTrack,
  MotionTrack,
  SubjectTrack,
} from './five-track-analysis';

// ─── Types ───────────────────────────────────────────────────────

export type EditDecisionType =
  | 'cut'           // Hard cut at this frame
  | 'transition'    // Insert transition overlay
  | 'zoom'          // Apply scale keyframe
  | 'pan'           // Apply position keyframe
  | 'graphic'       // Insert motion graphic
  | 'sfx'           // Insert sound effect
  | 'speed-change'  // Apply speed ramp
  | 'filter-change' // Change color filter
  | 'caption-emphasis' // Highlight specific words
  | 'audio-duck'    // Duck BGM for speech
  | 'fade'          // Opacity keyframe (fade in/out)
  ;

export interface EditDecision {
  type: EditDecisionType;
  frame: number;         // Frame where this edit should occur
  durationFrames?: number;
  priority: number;      // 1 (highest) to 5 (lowest)
  source: 'speech' | 'visual' | 'music' | 'motion' | 'subjects';
  reason: string;        // Human-readable explanation
  params: Record<string, any>; // Tool-specific parameters
  confidence: number;    // 0-1, how confident the engine is in this decision
}

export interface EditDecisionList {
  projectId: string;
  generatedAt: Date;
  totalDecisions: number;
  decisions: EditDecision[];
  /** Summary statistics */
  stats: {
    cutsPerMinute: number;
    transitionCount: number;
    graphicCount: number;
    averageConfidence: number;
  };
}

// ─── Engine ──────────────────────────────────────────────────────

const FPS = 30;
const msToFrame = (ms: number) => Math.round((ms / 1000) * FPS);

/**
 * Generate an Edit Decision List from 5-track analysis results.
 *
 * @param analyses - Map of assetId → FiveTrackAnalysis for all project assets
 * @param projectDurationMs - Total project duration in milliseconds
 * @param options - Configuration for decision thresholds
 */
export function generateEditDecisionList(
  analyses: FiveTrackAnalysis[],
  projectDurationMs: number,
  options: {
    targetCutsPerMinute?: number;
    transitionStyle?: 'hard-cut' | 'soft-cut' | 'dissolve' | 'mixed';
    graphicDensity?: 'minimal' | 'moderate' | 'heavy';
    pacing?: 'slow' | 'medium' | 'fast';
  } = {},
): EditDecisionList {
  const {
    targetCutsPerMinute = 6,
    transitionStyle = 'mixed',
    graphicDensity = 'moderate',
    pacing = 'medium',
  } = options;

  const decisions: EditDecision[] = [];

  for (const analysis of analyses) {
    // Priority 1: Speech-driven decisions
    if (analysis.speech) {
      decisions.push(...generateSpeechDecisions(analysis.speech, analysis.assetId));
    }

    // Priority 2: Music-driven decisions
    if (analysis.music) {
      decisions.push(...generateMusicDecisions(analysis.music, pacing));
    }

    // Priority 3: Motion-driven decisions
    if (analysis.motion) {
      decisions.push(...generateMotionDecisions(analysis.motion));
    }

    // Priority 4: Subject-driven decisions
    if (analysis.subjects) {
      decisions.push(...generateSubjectDecisions(analysis.subjects, graphicDensity));
    }

    // Priority 5: Visual-driven decisions
    if (analysis.visual) {
      decisions.push(...generateVisualDecisions(analysis.visual, transitionStyle));
    }
  }

  // Sort by frame, then by priority (lower = higher priority)
  decisions.sort((a, b) => a.frame - b.frame || a.priority - b.priority);

  // Remove conflicting decisions (same frame, incompatible types)
  const deduped = deduplicateDecisions(decisions);

  const totalMinutes = projectDurationMs / 60000;
  const cutCount = deduped.filter(d => d.type === 'cut').length;

  return {
    projectId: '',
    generatedAt: new Date(),
    totalDecisions: deduped.length,
    decisions: deduped,
    stats: {
      cutsPerMinute: totalMinutes > 0 ? cutCount / totalMinutes : 0,
      transitionCount: deduped.filter(d => d.type === 'transition').length,
      graphicCount: deduped.filter(d => d.type === 'graphic').length,
      averageConfidence: deduped.length > 0
        ? deduped.reduce((sum, d) => sum + d.confidence, 0) / deduped.length
        : 0,
    },
  };
}

// ─── Track-Specific Decision Generators ──────────────────────────

function generateSpeechDecisions(speech: SpeechTrack, assetId: string): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Silence gaps > 1s = potential cut points
  for (const gap of speech.silenceGaps) {
    if (gap.durationMs > 1000) {
      decisions.push({
        type: 'cut',
        frame: msToFrame(gap.startMs + gap.durationMs / 2),
        priority: 1,
        source: 'speech',
        reason: `Speech pause (${Math.round(gap.durationMs / 100) / 10}s gap)`,
        params: {},
        confidence: Math.min(gap.durationMs / 3000, 1),
      });
    }
  }

  // Topic boundaries = transition points
  for (const boundary of speech.topicBoundaries) {
    decisions.push({
      type: 'transition',
      frame: msToFrame(boundary.timestampMs),
      durationFrames: 18,
      priority: 1,
      source: 'speech',
      reason: `Topic change: "${boundary.fromTopic}" → "${boundary.toTopic}"`,
      params: { transitionType: 'soft-cut' },
      confidence: 0.8,
    });
  }

  // Audio ducking for all speech regions
  if (speech.words.length > 0) {
    const speechStart = speech.words[0].startMs;
    const speechEnd = speech.words[speech.words.length - 1].endMs;
    decisions.push({
      type: 'audio-duck',
      frame: msToFrame(speechStart),
      durationFrames: msToFrame(speechEnd - speechStart),
      priority: 1,
      source: 'speech',
      reason: 'Duck BGM under voiceover',
      params: { duckLevel: 0.20, rampDownMs: 300, rampUpMs: 600 },
      confidence: 1.0,
    });
  }

  return decisions;
}

function generateMusicDecisions(music: MusicTrack, pacing: string): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Beat-aligned cut opportunities (every N beats based on pacing)
  const beatsPerCut = pacing === 'fast' ? 4 : pacing === 'slow' ? 16 : 8;
  for (let i = beatsPerCut; i < music.beats.length; i += beatsPerCut) {
    decisions.push({
      type: 'cut',
      frame: msToFrame(music.beats[i]),
      priority: 2,
      source: 'music',
      reason: `Beat-aligned cut (beat ${i}, ${music.bpm} BPM)`,
      params: { beatIndex: i },
      confidence: 0.7,
    });
  }

  // Energy drops = potential dramatic pauses / zoom punches
  for (let i = 1; i < music.energyCurve.length; i++) {
    const prev = music.energyCurve[i - 1];
    const curr = music.energyCurve[i];
    const energyDrop = prev.energy - curr.energy;

    if (energyDrop > 0.4) {
      decisions.push({
        type: 'transition',
        frame: msToFrame(curr.timestampMs),
        durationFrames: 8,
        priority: 2,
        source: 'music',
        reason: `Energy drop (${Math.round(energyDrop * 100)}%)`,
        params: { transitionType: 'dip-to-black' },
        confidence: 0.75,
      });
    }

    // Energy peaks = zoom punch opportunities
    if (curr.energy > 0.8 && prev.energy < 0.6) {
      decisions.push({
        type: 'zoom',
        frame: msToFrame(curr.timestampMs),
        durationFrames: 10,
        priority: 2,
        source: 'music',
        reason: `Energy peak (${Math.round(curr.energy * 100)}%)`,
        params: { scaleFrom: 1.0, scaleTo: 1.08 },
        confidence: 0.65,
      });
    }
  }

  // Section boundaries = transition points
  for (let i = 1; i < music.sections.length; i++) {
    const section = music.sections[i];
    decisions.push({
      type: 'transition',
      frame: msToFrame(section.startMs),
      durationFrames: 12,
      priority: 2,
      source: 'music',
      reason: `Music section change → ${section.type}`,
      params: { transitionType: section.type === 'drop' ? 'zoom-punch' : 'soft-cut' },
      confidence: 0.8,
    });
  }

  return decisions;
}

function generateMotionDecisions(motion: MotionTrack): EditDecision[] {
  const decisions: EditDecision[] = [];

  for (const segment of motion.segments) {
    // Static → motion transitions = potential cut-on-action
    if (segment.motionType !== 'static' && segment.intensity > 0.6) {
      decisions.push({
        type: 'cut',
        frame: msToFrame(segment.startMs),
        priority: 3,
        source: 'motion',
        reason: `Motion onset: ${segment.motionType} (intensity ${Math.round(segment.intensity * 100)}%)`,
        params: { motionType: segment.motionType },
        confidence: segment.intensity,
      });
    }

    // High-intensity motion = speed ramp opportunity
    if (segment.intensity > 0.8) {
      const durationMs = segment.endMs - segment.startMs;
      if (durationMs > 1000) {
        decisions.push({
          type: 'speed-change',
          frame: msToFrame(segment.startMs),
          durationFrames: msToFrame(durationMs),
          priority: 3,
          source: 'motion',
          reason: `High-intensity ${segment.motionType} — speed ramp candidate`,
          params: { speedFrom: 1.0, speedTo: 0.5, speedBack: 1.0 },
          confidence: 0.5,
        });
      }
    }
  }

  return decisions;
}

function generateSubjectDecisions(subjects: SubjectTrack, density: string): EditDecision[] {
  const decisions: EditDecision[] = [];
  if (density === 'minimal') return decisions;

  for (const subject of subjects.subjects) {
    // Products/logos = callout graphic opportunities
    if (subject.category === 'product' || subject.category === 'logo') {
      const firstAppearance = subject.appearances[0];
      if (firstAppearance) {
        decisions.push({
          type: 'graphic',
          frame: msToFrame(firstAppearance.timestampMs) + 15, // 0.5s after appearing
          durationFrames: 90, // 3s
          priority: 4,
          source: 'subjects',
          reason: `Product/logo detected: "${subject.label}"`,
          params: {
            graphicType: 'callout',
            text: subject.label,
            position: firstAppearance.boundingBox,
          },
          confidence: firstAppearance.confidence,
        });
      }
    }

    // People entering frame = potential lower third
    if (subject.category === 'person' && density === 'heavy') {
      const firstAppearance = subject.appearances[0];
      if (firstAppearance) {
        decisions.push({
          type: 'graphic',
          frame: msToFrame(firstAppearance.timestampMs) + 30, // 1s after appearing
          durationFrames: 120, // 4s
          priority: 4,
          source: 'subjects',
          reason: `Person detected: "${subject.label}"`,
          params: {
            graphicType: 'lower-third',
            text: subject.label,
          },
          confidence: firstAppearance.confidence * 0.8,
        });
      }
    }
  }

  return decisions;
}

function generateVisualDecisions(visual: VisualTrack, transitionStyle: string): EditDecision[] {
  const decisions: EditDecision[] = [];

  // Scene changes = cut/transition points
  for (const change of visual.sceneChanges) {
    const transType = transitionStyle === 'hard-cut' ? 'hard-cut'
      : transitionStyle === 'dissolve' ? 'dissolve'
      : transitionStyle === 'soft-cut' ? 'soft-cut'
      : change.confidence > 0.8 ? 'hard-cut' : 'soft-cut';

    if (transType !== 'hard-cut') {
      decisions.push({
        type: 'transition',
        frame: msToFrame(change.timestampMs),
        durationFrames: 15,
        priority: 5,
        source: 'visual',
        reason: `Visual scene change (confidence ${Math.round(change.confidence * 100)}%)`,
        params: { transitionType: transType },
        confidence: change.confidence,
      });
    }
  }

  // Composition changes = potential zoom opportunities
  for (let i = 1; i < visual.keyframes.length; i++) {
    const prev = visual.keyframes[i - 1];
    const curr = visual.keyframes[i];

    if (prev.composition !== curr.composition) {
      // Wide to close-up = zoom in
      if ((prev.composition === 'wide' || prev.composition === 'medium') && curr.composition === 'close-up') {
        decisions.push({
          type: 'zoom',
          frame: msToFrame(curr.timestampMs) - 15,
          durationFrames: 30,
          priority: 5,
          source: 'visual',
          reason: `Composition shift: ${prev.composition} → ${curr.composition}`,
          params: { scaleFrom: 1.0, scaleTo: 1.3 },
          confidence: 0.5,
        });
      }
    }
  }

  return decisions;
}

// ─── Deduplication ───────────────────────────────────────────────

function deduplicateDecisions(decisions: EditDecision[]): EditDecision[] {
  const result: EditDecision[] = [];
  const MIN_GAP_FRAMES = 10; // Minimum 10 frames between decisions of same type

  for (const decision of decisions) {
    // Check for conflicts with existing decisions
    const hasConflict = result.some(existing => {
      if (Math.abs(existing.frame - decision.frame) > MIN_GAP_FRAMES) return false;
      // Same type at nearby frame = conflict
      if (existing.type === decision.type) return true;
      // Cut and transition at same point = keep the one with higher priority
      if ((existing.type === 'cut' && decision.type === 'transition') ||
          (existing.type === 'transition' && decision.type === 'cut')) {
        return true;
      }
      return false;
    });

    if (!hasConflict) {
      result.push(decision);
    }
  }

  return result;
}
