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
  /** Visual composition similarity (0-1) — high = match-cut candidate */
  visualSimilarity: number;
  /** Reasoning for the score */
  notes: string[];
}

export interface ScenePairAnalysis {
  sceneA: number; // Scene index
  sceneB: number;
  score: ContinuityScore;
  /** Recommended transition based on score */
  recommendedTransition: 'hard-cut' | 'soft-cut' | 'dip-to-black' | 'dissolve' | 'match-cut';
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

/**
 * Score visual composition similarity between two scenes.
 * Uses keyword overlap from visual descriptions + shot type matching.
 * High similarity (>0.7) = match-cut candidate (compositions align visually).
 */
function scoreVisualSimilarity(descA?: string, descB?: string): number {
  if (!descA || !descB) return 0.3;

  const wordsA = new Set(descA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(descB.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  // Keyword overlap (Jaccard similarity)
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  const keywordSim = union.size > 0 ? intersection.length / union.size : 0;

  // Shot type matching (if both mention similar framing)
  const shotTypes = ['close-up', 'closeup', 'wide', 'medium', 'extreme', 'aerial', 'overhead', 'eye-level', 'low-angle', 'high-angle'];
  const shotA = shotTypes.filter(s => descA.toLowerCase().includes(s));
  const shotB = shotTypes.filter(s => descB.toLowerCase().includes(s));
  const shotMatch = shotA.length > 0 && shotB.length > 0
    ? shotA.some(s => shotB.includes(s)) ? 1.0 : 0.3
    : 0.5;

  // Subject matching (if both mention similar subjects)
  const subjectWords = ['person', 'hand', 'face', 'product', 'logo', 'food', 'car', 'building', 'landscape', 'crowd'];
  const subA = subjectWords.filter(s => descA.toLowerCase().includes(s));
  const subB = subjectWords.filter(s => descB.toLowerCase().includes(s));
  const subjectMatch = subA.length > 0 && subB.length > 0
    ? subA.some(s => subB.includes(s)) ? 1.0 : 0.2
    : 0.4;

  // Weighted: keyword overlap is strongest signal, then subject, then shot type
  return keywordSim * 0.5 + subjectMatch * 0.3 + shotMatch * 0.2;
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
  const visualSimilarity = scoreVisualSimilarity(sceneA.visualDescription, sceneB.visualDescription);

  if (colorMatch < 0.3) notes.push('Color palette shift between scenes');
  if (energyMatch < 0.4) notes.push(`Energy level change: ${sceneA.mood} → ${sceneB.mood}`);
  if (pacingMatch < 0.5) notes.push('Significant duration difference between scenes');
  if (visualSimilarity > 0.7) notes.push('High visual similarity — match-cut candidate');

  // Weighted average
  const overall = colorMatch * 0.30 + energyMatch * 0.35 + pacingMatch * 0.15 + visualSimilarity * 0.20;

  return { overall, colorMatch, energyMatch, pacingMatch, visualSimilarity, notes };
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

    // Match-cut: high visual similarity + reasonable continuity
    if (score.visualSimilarity > 0.7 && score.overall > 0.5) {
      recommendedTransition = 'match-cut';
    } else if (score.overall > 0.70) {
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
