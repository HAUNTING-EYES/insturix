/**
 * Scene Continuity Scoring Service
 *
 * Evaluates every adjacent scene pair for visual/audio continuity.
 * Score determines transition selection: high continuity → hard cut,
 * low continuity → dissolve/dip + flag for review.
 *
 * This is what separates AI video assembly from editorial intelligence.
 */

export interface ContinuityScore {
  /** Overall continuity (0-1, 1 = perfectly continuous) */
  overall: number;
  /** Dominant color palette match */
  colorMatch: number;
  /** Energy/mood consistency */
  energyMatch: number;
  /** Pacing consistency */
  pacingMatch: number;
  /** Reasoning for the score */
  notes: string[];
}

export interface ScenePairAnalysis {
  sceneA: number; // Scene index
  sceneB: number;
  score: ContinuityScore;
  /** Recommended transition based on score */
  recommendedTransition: 'hard-cut' | 'soft-cut' | 'dip-to-black' | 'dissolve';
  /** Should human review this pair? */
  flagForReview: boolean;
}

interface SceneData {
  sceneIndex: number;
  mood?: string;
  colorPalette?: string[];
  visualDescription?: string;
  pacing?: string;
  durationSeconds?: number;
}

// ─── Mood Energy Mapping ─────────────────────────────────────────

const MOOD_ENERGY: Record<string, number> = {
  energetic: 0.9,
  dramatic: 0.7,
  inspirational: 0.6,
  playful: 0.6,
  serious: 0.5,
  mysterious: 0.4,
  neutral: 0.5,
  calm: 0.2,
  somber: 0.2,
};

// ─── Scoring Functions ───────────────────────────────────────────

function scoreMoodMatch(moodA: string, moodB: string): number {
  if (moodA === moodB) return 1.0;
  const energyA = MOOD_ENERGY[moodA] ?? 0.5;
  const energyB = MOOD_ENERGY[moodB] ?? 0.5;
  // Close energy levels = high match
  return 1 - Math.abs(energyA - energyB);
}

function scoreColorMatch(colorsA: string[], colorsB: string[]): number {
  if (!colorsA.length || !colorsB.length) return 0.5; // Neutral if no data
  const setA = new Set(colorsA.map(c => c.toLowerCase()));
  const setB = new Set(colorsB.map(c => c.toLowerCase()));
  const intersection = [...setA].filter(c => setB.has(c));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.length / union.size : 0.5;
}

function scorePacingMatch(durA: number, durB: number): number {
  if (!durA || !durB) return 0.5;
  const ratio = Math.min(durA, durB) / Math.max(durA, durB);
  return ratio; // 1.0 if same duration, lower if very different
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Score continuity between two adjacent scenes.
 */
export function scoreContinuity(sceneA: SceneData, sceneB: SceneData): ContinuityScore {
  const notes: string[] = [];

  const colorMatch = scoreColorMatch(sceneA.colorPalette || [], sceneB.colorPalette || []);
  const energyMatch = scoreMoodMatch(sceneA.mood || 'neutral', sceneB.mood || 'neutral');
  const pacingMatch = scorePacingMatch(sceneA.durationSeconds || 5, sceneB.durationSeconds || 5);

  if (colorMatch < 0.3) notes.push('Color palette shift between scenes');
  if (energyMatch < 0.4) notes.push(`Energy level change: ${sceneA.mood} → ${sceneB.mood}`);
  if (pacingMatch < 0.5) notes.push('Significant duration difference between scenes');

  // Weighted average
  const overall = colorMatch * 0.35 + energyMatch * 0.40 + pacingMatch * 0.25;

  return { overall, colorMatch, energyMatch, pacingMatch, notes };
}

/**
 * Analyze all adjacent scene pairs in a project.
 * Returns per-pair analysis with recommended transitions.
 */
export function analyzeAllScenePairs(scenes: SceneData[]): ScenePairAnalysis[] {
  const results: ScenePairAnalysis[] = [];

  for (let i = 0; i < scenes.length - 1; i++) {
    const score = scoreContinuity(scenes[i], scenes[i + 1]);

    let recommendedTransition: ScenePairAnalysis['recommendedTransition'];
    let flagForReview = false;

    if (score.overall > 0.70) {
      recommendedTransition = 'hard-cut';
    } else if (score.overall > 0.40) {
      recommendedTransition = 'soft-cut';
    } else {
      recommendedTransition = 'dip-to-black';
      flagForReview = true;
    }

    results.push({
      sceneA: scenes[i].sceneIndex,
      sceneB: scenes[i + 1].sceneIndex,
      score,
      recommendedTransition,
      flagForReview,
    });
  }

  return results;
}
