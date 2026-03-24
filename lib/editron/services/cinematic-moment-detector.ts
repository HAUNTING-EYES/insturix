/**
 * Cinematic Moment Detector
 *
 * Combines multiple analysis tracks to detect "cinematic moments" —
 * points where multiple tracks peak simultaneously, creating opportunities
 * for impactful edits (zoom punches, dramatic transitions, graphic reveals).
 *
 * Inspired by F1 broadcast editing: the moment a car overtakes on a straight
 * while the crowd roars and the music drops — three tracks peaking at once.
 *
 * From master plan Section 9: "Cinematic Moment = when 3+ tracks peak
 * within a 500ms window"
 */

import type {
  FiveTrackAnalysis,
  MusicTrack,
  MotionTrack,
  SpeechTrack,
} from './five-track-analysis';

// ─── Types ───────────────────────────────────────────────────────

export interface CinematicMoment {
  timestampMs: number;
  frame: number;
  intensity: number;       // 0-1, how "cinematic" this moment is
  peakingTracks: string[]; // Which tracks are peaking
  suggestedEdit: {
    type: 'zoom-punch' | 'whip-pan' | 'speed-ramp' | 'graphic-reveal' | 'dramatic-cut';
    params: Record<string, any>;
    reason: string;
  };
}

// ─── Detection ───────────────────────────────────────────────────

const FPS = 30;
const WINDOW_MS = 500; // Peaks within this window count as simultaneous
const PEAK_THRESHOLD = 0.7; // Energy above this = peak

/**
 * Detect cinematic moments from 5-track analysis.
 * Returns moments sorted by intensity (highest first).
 */
export function detectCinematicMoments(
  analysis: FiveTrackAnalysis,
): CinematicMoment[] {
  const moments: CinematicMoment[] = [];
  const durationMs = analysis.durationMs;

  // Sample every 500ms
  for (let t = 0; t < durationMs; t += WINDOW_MS) {
    const peaking: string[] = [];
    let totalEnergy = 0;

    // Check music energy
    if (analysis.music) {
      const musicEnergy = getEnergyAt(analysis.music.energyCurve, t);
      if (musicEnergy > PEAK_THRESHOLD) {
        peaking.push('music');
        totalEnergy += musicEnergy;
      }

      // Check if near a beat
      const nearBeat = analysis.music.beats.some(b => Math.abs(b - t) < 100);
      if (nearBeat && musicEnergy > 0.5) {
        totalEnergy += 0.2; // Bonus for beat alignment
      }
    }

    // Check motion energy
    if (analysis.motion) {
      const motionEnergy = getEnergyAt(analysis.motion.energyCurve, t);
      if (motionEnergy > PEAK_THRESHOLD) {
        peaking.push('motion');
        totalEnergy += motionEnergy;
      }
    }

    // Check speech emphasis (silence gap ending = speaker returning with energy)
    if (analysis.speech) {
      const isPostSilence = analysis.speech.silenceGaps.some(
        g => t >= g.endMs && t < g.endMs + WINDOW_MS,
      );
      if (isPostSilence) {
        peaking.push('speech');
        totalEnergy += 0.6;
      }
    }

    // Check visual scene change
    if (analysis.visual) {
      const nearSceneChange = analysis.visual.sceneChanges.some(
        sc => Math.abs(sc.timestampMs - t) < WINDOW_MS,
      );
      if (nearSceneChange) {
        peaking.push('visual');
        totalEnergy += 0.5;
      }
    }

    // Check subject appearance
    if (analysis.subjects) {
      const newSubject = analysis.subjects.subjects.some(s =>
        s.appearances.some(a => Math.abs(a.timestampMs - t) < WINDOW_MS),
      );
      if (newSubject) {
        peaking.push('subjects');
        totalEnergy += 0.3;
      }
    }

    // Cinematic moment = 2+ tracks peaking simultaneously
    if (peaking.length >= 2) {
      const intensity = Math.min(totalEnergy / peaking.length, 1);
      const frame = Math.round((t / 1000) * FPS);

      moments.push({
        timestampMs: t,
        frame,
        intensity,
        peakingTracks: peaking,
        suggestedEdit: suggestEdit(peaking, intensity, analysis, t),
      });
    }
  }

  // Sort by intensity (highest first), deduplicate nearby moments
  moments.sort((a, b) => b.intensity - a.intensity);
  return deduplicateNearby(moments, WINDOW_MS * 2);
}

// ─── Helpers ─────────────────────────────────────────────────────

function getEnergyAt(
  curve: Array<{ timestampMs: number; energy: number }>,
  timestampMs: number,
): number {
  if (curve.length === 0) return 0;

  // Find the two nearest points and interpolate
  let before = curve[0];
  let after = curve[curve.length - 1];

  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].timestampMs <= timestampMs && curve[i + 1].timestampMs >= timestampMs) {
      before = curve[i];
      after = curve[i + 1];
      break;
    }
  }

  const range = after.timestampMs - before.timestampMs;
  if (range === 0) return before.energy;

  const t = (timestampMs - before.timestampMs) / range;
  return before.energy + (after.energy - before.energy) * t;
}

function suggestEdit(
  peakingTracks: string[],
  intensity: number,
  analysis: FiveTrackAnalysis,
  timestampMs: number,
): CinematicMoment['suggestedEdit'] {
  // Music + motion = zoom punch
  if (peakingTracks.includes('music') && peakingTracks.includes('motion')) {
    return {
      type: 'zoom-punch',
      params: { scaleFrom: 1.0, scaleTo: 1.0 + intensity * 0.15 },
      reason: 'Music and motion peak together — zoom punch for impact',
    };
  }

  // Speech + visual = dramatic cut
  if (peakingTracks.includes('speech') && peakingTracks.includes('visual')) {
    return {
      type: 'dramatic-cut',
      params: { transitionType: 'hard-cut' },
      reason: 'Speaker emphasis coincides with visual change — hard cut for punctuation',
    };
  }

  // Music + subjects = graphic reveal
  if (peakingTracks.includes('music') && peakingTracks.includes('subjects')) {
    return {
      type: 'graphic-reveal',
      params: { graphicType: 'callout' },
      reason: 'Musical moment with subject appearance — reveal callout',
    };
  }

  // Motion dominant = speed ramp
  if (peakingTracks.includes('motion') && intensity > 0.7) {
    return {
      type: 'speed-ramp',
      params: { speedFrom: 1.0, speedTo: 0.4, speedBack: 1.0 },
      reason: 'High-intensity motion — slow-motion reveal',
    };
  }

  // Default: whip pan
  return {
    type: 'whip-pan',
    params: {},
    reason: `Multiple tracks peaking (${peakingTracks.join(', ')})`,
  };
}

function deduplicateNearby(moments: CinematicMoment[], minGapMs: number): CinematicMoment[] {
  const result: CinematicMoment[] = [];
  for (const moment of moments) {
    const tooClose = result.some(
      existing => Math.abs(existing.timestampMs - moment.timestampMs) < minGapMs,
    );
    if (!tooClose) result.push(moment);
  }
  return result;
}
