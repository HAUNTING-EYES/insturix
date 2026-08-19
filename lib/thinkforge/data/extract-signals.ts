/**
 * Signal Extraction — Maps ThinkForge context to CreativeSignals
 *
 * TIER_1: Format/document-type defaults (always applied)
 * TIER_2: Keyword extraction from brief/prompt (when text is available)
 *
 * This is a MINIMAL extractor. It produces a basic signal profile that
 * selectTechniques() can score against. Future: Gemini-based extraction
 * for richer signal resolution.
 */

import type { CreativeSignals } from '../../shared/signals/types';
import { SIGNAL_RANGES } from '../../shared/signals/validation';

type PartialSignals = Partial<CreativeSignals>;

const DOC_TYPE_DEFAULTS: Record<string, PartialSignals> = {
  video_script: {
    // Rhetorical (balanced persuasion mix for ads/brand content)
    logos_load: 0.3,
    pathos_load: 0.6,
    ethos_load: 0.5,
    kairos_pressure: 0.6,
    // Cognitive
    elaboration_demand: 0.4,
    novelty: 0.5,
    // Engagement
    visceral_impact: 0.5,
    behavioral_utility: 0.5,
    narrative_transportation: 0.5,
    // Emotional
    emotional_valence: 0.4,
    emotional_arousal: 0.6,
    // Audience
    assumed_expertise: 0.3,
    // Temporal
    pacing_velocity: 0.7,
    tension_arc: 0.5,
    // Voice
    formality: -0.2,
    humor: 0.2,
    enthusiasm: 0.6,
    warmth: 0.4,
    certainty: 0.6,
    // Craft
    visual_dependency: 0.7,
    show_tell_ratio: 0.6,
    specificity_grain: 0.6,
    rhythmic_variation: 0.5,
    negative_space: 0.3,
  },
  shot_list: {
    visual_dependency: 0.9,
    show_tell_ratio: 0.9,
    formality: 0.3,
    logos_load: 0.7,
    specificity_grain: 0.8,
  },
  character_bible: {
    narrative_transportation: 0.7,
    pathos_load: 0.6,
    specificity_grain: 0.7,
    reflective_depth: 0.6,
    subtext_depth: 0.5,
  },
  world_bible: {
    logos_load: 0.6,
    specificity_grain: 0.8,
    scope_breadth: 0.8,
    elaboration_demand: 0.6,
  },
  research_brief: {
    logos_load: 0.8,
    formality: 0.5,
    assumed_expertise: 0.6,
    certainty: 0.7,
    specificity_grain: 0.7,
  },
  interview_questions: {
    pathos_load: 0.5,
    ethos_load: 0.6,
    elaboration_demand: 0.7,
    autonomy_grant: 0.6,
  },
  score_direction: {
    visual_dependency: 0.3,
    emotional_valence: 0.5,
    emotional_arousal: 0.6,
    formality: 0.2,
    specificity_grain: 0.7,
  },
  brand_film: {
    pathos_load: 0.7,
    narrative_transportation: 0.7,
    ethos_load: 0.6,
    emotional_valence: 0.5,
    visceral_impact: 0.6,
  },
  budget: {
    logos_load: 0.9,
    formality: 0.6,
    specificity_grain: 0.9,
    certainty: 0.8,
  },
  post: {
    visual_dependency: 0.0,
    show_tell_ratio: 0.0,
    formality: 0.2,
    pacing_velocity: 0.6,
    kairos_pressure: 0.5,
    humor: 0.3,
    enthusiasm: 0.6,
    specificity_grain: 0.6,
    behavioral_utility: 0.6,
  },
  article: {
    visual_dependency: 0.0,
    show_tell_ratio: 0.0,
    formality: 0.4,
    pacing_velocity: 0.4,
    logos_load: 0.6,
    elaboration_demand: 0.6,
    reflective_depth: 0.5,
    specificity_grain: 0.6,
  },
  vfx_brief: {
    logos_load: 0.7,
    visual_dependency: 0.8,
    formality: 0.4,
    specificity_grain: 0.9,
  },
};

const KEYWORD_SIGNALS: Array<{ pattern: RegExp; signals: PartialSignals }> = [
  { pattern: /urgent|limited|act now|deadline|expir/i, signals: { kairos_pressure: 0.8 } },
  { pattern: /funny|humor|comedy|witty|playful|joke/i, signals: { humor: 0.7 } },
  { pattern: /data|research|evidence|study|statistic|metric/i, signals: { logos_load: 0.7 } },
  { pattern: /emotional|inspiring|heartfelt|moving|touching/i, signals: { pathos_load: 0.7 } },
  { pattern: /expert|technical|advanced|professional|specialist/i, signals: { assumed_expertise: 0.7 } },
  { pattern: /beginner|intro|101|basic|getting started/i, signals: { assumed_expertise: 0.2 } },
  { pattern: /formal|corporate|enterprise|institutional/i, signals: { formality: 0.6 } },
  { pattern: /casual|chill|vibe|laid.?back|conversational/i, signals: { formality: -0.4 } },
  { pattern: /story|narrative|journey|personal|memoir/i, signals: { narrative_transportation: 0.7 } },
  { pattern: /fast|quick|snappy|rapid|tiktok|reel/i, signals: { pacing_velocity: 0.8 } },
  { pattern: /slow|thoughtful|deep.?dive|long.?form/i, signals: { pacing_velocity: 0.3 } },
  { pattern: /surprise|twist|reveal|unexpected/i, signals: { novelty: 0.7, pivot_intensity: 0.6 } },
  { pattern: /educate|teach|explain|how.?to|tutorial/i, signals: { education_intent: 0.7 } },
  { pattern: /entertain|engage|captivate|hook/i, signals: { entertainment_intent: 0.7 } },
  { pattern: /persuade|convince|sell|convert/i, signals: { kairos_pressure: 0.6, pathos_load: 0.6, ethos_load: 0.6 } },
  { pattern: /talking\s*head|to\s*camera|face\s*to\s*camera|direct\s*address|on[- ]?camera|vlog|podcast/i, signals: { visual_dependency: 0.3, show_tell_ratio: 0.2 } },
  { pattern: /montage|b[- ]?roll\s*only|cinematic|visual[- ]?only|no\s*(narration|voice|vo)/i, signals: { visual_dependency: 0.9, show_tell_ratio: 0.9 } },
];

/**
 * Extract a basic signal profile from ThinkForge context.
 *
 * Merges canonical numeric defaults with TIER_1 document defaults and TIER_2 keyword extraction.
 * Each higher tier overrides the previous tier when both provide the same signal —
 * brief-extracted signals are more specific than format defaults.
 */
export function extractSignalsFromContext(params: {
  documentType?: string;
  medium?: string;
  projectSummary?: string;
  userPrompt?: string;
}): PartialSignals {
  const { documentType, medium, projectSummary, userPrompt } = params;

  const signals: PartialSignals = {};
  for (const key of Object.keys(SIGNAL_RANGES) as Array<keyof typeof SIGNAL_RANGES>) {
    const range = SIGNAL_RANGES[key];
    if (range) {
      (signals as Record<string, number>)[key] = range.default;
    }
  }

  const docKey = (documentType || medium || '').toLowerCase().replace(/\s+/g, '_');
  const defaults = DOC_TYPE_DEFAULTS[docKey];
  if (defaults) {
    Object.assign(signals, defaults);
  }

  const text = `${projectSummary || ''} ${userPrompt || ''}`;
  if (text.trim()) {
    for (const { pattern, signals: extracted } of KEYWORD_SIGNALS) {
      if (pattern.test(text)) {
        Object.assign(signals, extracted);
      }
    }
  }

  return signals;
}
