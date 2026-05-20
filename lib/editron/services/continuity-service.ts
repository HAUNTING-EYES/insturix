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
  /** Recommended transition based on score — full vocabulary from transition-templates.ts */
  recommendedTransition:
    // Editorial cuts (no visual overlay)
    | 'hard-cut'      // High continuity, same energy — let the cut breathe
    | 'match-cut'     // Compositions align visually — cut on the alignment
    | 'jump-cut'      // Same angle, time skip — intentional discontinuity
    | 'cut-on-action'  // Motion carries across the cut
    | 'smash-cut'     // Maximum energy contrast — shock value
    // Gentle bridges (low visual disruption)
    | 'soft-cut'      // Slight blur/fade — softer than hard-cut
    | 'dissolve'      // Passage of time, reflection, connection between scenes
    | 'blur-transition' // Motion blur bridge — movement between shots
    // Section markers (clear visual boundary)
    | 'dip-to-black'  // New chapter/section/topic — reset signal
    | 'dip-to-white'  // Dreamy, heavenly, or flashback transition
    // Energy transitions (match high-energy moments)
    | 'whip-pan'      // Fast energy, excitement — simulates camera movement
    | 'zoom-punch'    // Impact, emphasis — punches into next scene
    | 'flash'         // Reveal, impact burst — bright attention grab
    | 'glitch'        // Digital, tech, edgy aesthetic
    // Stylistic (when content calls for specific aesthetic)
    | 'film-burn'     // Organic, vintage, analog feel
    | 'iris-wipe'     // Retro, theatrical, nostalgic
    | 'wipe-left'     // Classic directional transition
    | 'wipe-right'
    | 'slide-up'      // Push transition — spatial movement
    | 'slide-down';
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

    // ── Transition selection: editorial rules based on continuity signals ──
    //
    // Priority order (highest editorial confidence first):
    //   1. Match-cut: visual compositions align — rare, intentional, powerful
    //   2. High continuity (>0.70): same energy, same visual — hard-cut
    //   3. Medium continuity (0.40-0.70): energy or visual shift — gentle bridge
    //   4. Low continuity (<0.40): scene change — clear boundary marker
    //
    // Within each tier, energy direction (rising/falling/stable) selects
    // the specific type. This gives variety without randomness — each
    // transition is MOTIVATED by what's happening between the scenes.

    const energyA = MOOD_ENERGY[scenes[i].mood || 'neutral'] ?? 0.5;
    const energyB = MOOD_ENERGY[scenes[i + 1].mood || 'neutral'] ?? 0.5;
    const energyDelta = energyB - energyA;  // positive = energy rising
    const isHighEnergy = energyB > 0.65;

    if (score.visualSimilarity > 0.7 && score.overall > 0.5) {
      // Tier 1: Compositions align — match-cut candidate
      recommendedTransition = 'match-cut';
    } else if (score.overall > 0.70) {
      // Tier 2: High continuity — scenes flow naturally, minimal disruption
      // Same energy, same look → hard-cut (let the content carry the transition)
      // Slightly different energy → soft-cut (gentle acknowledgment of shift)
      recommendedTransition = Math.abs(energyDelta) < 0.15 ? 'hard-cut' : 'soft-cut';
    } else if (score.overall > 0.40) {
      // Tier 3: Medium continuity — noticeable shift, needs a bridge
      if (energyDelta > 0.25 && isHighEnergy) {
        // Energy rising sharply → whip-pan (momentum matches energy)
        recommendedTransition = 'whip-pan';
      } else if (energyDelta < -0.25) {
        // Energy dropping sharply → dissolve (deceleration, reflection)
        recommendedTransition = 'dissolve';
      } else if (score.colorMatch < 0.3) {
        // Color palette shift → dip-to-black (reset visual palette cleanly)
        // CRG constraint:transition.dissolve_color_clash — dissolve through
        // clashing colors creates muddy middle frame
        recommendedTransition = 'dip-to-black';
      } else {
        // Moderate shift, no strong signal → soft-cut (safe, professional)
        recommendedTransition = 'soft-cut';
      }
    } else {
      // Tier 4: Low continuity — clear scene change
      if (energyDelta > 0.3 && isHighEnergy) {
        // Low continuity + energy spike → smash-cut (shock, contrast)
        recommendedTransition = 'smash-cut';
      } else if (score.energyMatch < 0.3) {
        // Mood contrast → dip-to-black (clean section break)
        recommendedTransition = 'dip-to-black';
      } else {
        // General scene change → dip-to-black (universal section marker)
        recommendedTransition = 'dip-to-black';
      }
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
