/**
 * Cinematic Moment Detector
 *
 * Now integrated into the Reactive Edit Engine as the
 * `detectCinematicMoments()` function. This file provides
 * standalone access for the API route and quality review panel.
 *
 * A cinematic moment = when 2+ analysis tracks peak within
 * a 500ms window. The weighted combination of music energy,
 * motion intensity, speech emphasis, and visual changes
 * determines the suggested edit type:
 *
 * Music + Motion → zoom punch
 * Tension + Motion → slow-motion reveal
 * Speech + Music → graphic emphasis
 * All tracks → maximum impact edit
 */

import type { AssetAnalysis } from './five-track-analysis';

export interface CinematicMoment {
  frame: number;
  timestampMs: number;
  intensity: number;
  peakingTracks: string[];
  suggestedEdit: {
    type: string;
    params: Record<string, any>;
    reason: string;
  };
}

const FPS = 30;
const WINDOW_FRAMES = 15; // 0.5s

function semanticGraphicParamsFromTracks(tracks: string[], score: number): Record<string, any> {
  return {
    kind: 'emphasis',
    text: 'Speech emphasis',
    sourceTracks: tracks,
    signals: Object.fromEntries(tracks.map(track => [`${track}_peak`, score])),
  };
}

/**
 * Detect cinematic moments from a full asset analysis.
 * Returns moments sorted by intensity (highest first).
 */
export function detectCinematicMoments(analysis: AssetAnalysis): CinematicMoment[] {
  const moments: CinematicMoment[] = [];
  const totalFrames = Math.round(analysis.durationMs / 1000 * FPS);

  for (let frame = 0; frame < totalFrames; frame += WINDOW_FRAMES) {
    const ms = (frame / FPS) * 1000;
    const peaking: { track: string; score: number }[] = [];

    // Music energy
    if (analysis.musicStructure) {
      const energy = getNearestValue(analysis.musicStructure.energyCurve, ms);
      if (energy > 0.7) peaking.push({ track: 'music', score: energy });

      const tension = getNearestValue(analysis.musicStructure.tensionCurve, ms);
      if (tension > 0.8) peaking.push({ track: 'tension', score: tension });
    }

    // Motion intensity
    const motionSeg = analysis.motionSegments.find(
      s => frame >= s.startFrame && frame <= s.endFrame,
    );
    if (motionSeg && motionSeg.motionIntensity > 0.7) {
      peaking.push({ track: 'motion', score: motionSeg.motionIntensity });
    }

    // Speech emphasis
    const speechSeg = analysis.speechSegments.find(
      s => frame >= s.startFrame && frame <= s.endFrame,
    );
    if (speechSeg && (speechSeg.contentType === 'emphasis' || speechSeg.contentType === 'statistic')) {
      peaking.push({ track: 'speech', score: speechSeg.confidence });
    }

    // Visual scene change
    const nearSceneChange = analysis.keyframeAnalyses.some(
      kf => Math.abs(kf.frame - frame) < WINDOW_FRAMES && kf.naturalCutPoint,
    );
    if (nearSceneChange) {
      peaking.push({ track: 'visual', score: 0.6 });
    }

    if (peaking.length >= 2) {
      const intensity = peaking.reduce((sum, p) => sum + p.score, 0) / peaking.length;
      const tracks = peaking.map(p => p.track);

      moments.push({
        frame,
        timestampMs: ms,
        intensity,
        peakingTracks: tracks,
        suggestedEdit: suggestCinematicEdit(tracks, intensity),
      });
    }
  }

  // Sort by intensity, deduplicate nearby
  moments.sort((a, b) => b.intensity - a.intensity);
  return moments.filter((m, i) =>
    !moments.slice(0, i).some(prev => Math.abs(prev.frame - m.frame) < WINDOW_FRAMES * 2),
  );
}

function suggestCinematicEdit(
  tracks: string[],
  intensity: number,
): CinematicMoment['suggestedEdit'] {
  if (tracks.includes('music') && tracks.includes('motion')) {
    return {
      type: 'zoom-punch',
      params: { scaleFrom: 1.0, scaleTo: 1.0 + intensity * 0.15 },
      reason: 'Music and motion peak together — zoom punch for impact',
    };
  }
  if (tracks.includes('tension') && tracks.includes('motion')) {
    return {
      type: 'slow-motion',
      params: { speed: 0.3 },
      reason: 'Tension peak with motion — iconic slow-motion reveal',
    };
  }
  if (tracks.includes('speech') && tracks.includes('music')) {
    return {
      type: 'graphic-reveal',
      params: semanticGraphicParamsFromTracks(tracks, intensity),
      reason: 'Speech emphasis meets musical moment',
    };
  }
  return {
    type: 'dramatic-cut',
    params: { transitionType: 'hard-cut' },
    reason: `Multi-track peak: ${tracks.join(' + ')}`,
  };
}

function getNearestValue(
  curve: Array<{ timestampMs: number; energy?: number; tension?: number }>,
  ms: number,
): number {
  if (!curve.length) return 0;
  const nearest = curve.reduce((best, c) =>
    Math.abs(c.timestampMs - ms) < Math.abs(best.timestampMs - ms) ? c : best,
  );
  return (nearest as any).energy ?? (nearest as any).tension ?? 0;
}
