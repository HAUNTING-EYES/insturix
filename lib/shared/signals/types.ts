/**
 * @insturix/signals — Shared Signal Type Definitions
 *
 * The single source of truth for the 47 creative signals that drive both
 * Editron (video editing) and ThinkForge (content writing).
 *
 * "humor=0.7" means the same thing everywhere because both systems
 * import these types. See docs/creative-content-knowledge.md Part 2.
 *
 * Architecture decision: 2026-05-19 (B+ separate graphs, shared signal module)
 * - Editing graph: lib/editron/data/creative-knowledge-graph.json (boolean triggers)
 * - Writing graph: lib/thinkforge/data/writing-knowledge.json (scored activation)
 * - Both import signal definitions from HERE.
 */

// ─── Enum Types ──────────────────────────────────────────────────────────────

export type BloomLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type AwarenessLevel =
  | 'unaware'
  | 'problem_aware'
  | 'solution_aware'
  | 'product_aware'
  | 'most_aware';

export type EpistemicStance =
  | 'teacher'
  | 'peer'
  | 'guide'
  | 'oracle'
  | 'co-discoverer';

export type TemporalOrientation = 'forward' | 'present' | 'backward';

export type PowerDynamic = 'command' | 'invite' | 'confide' | 'provoke';

export type TransitionCraftStyle =
  | 'hard_cut'
  | 'bridge'
  | 'callback_bridge'
  | 'question_bridge'
  | 'tonal_shift'
  | 'contradiction'
  | 'nested_reveal'
  | 'emotional_reset'
  | 'parallel_cut'
  | 'the_drop'
  | 'associative_leap'
  | 'the_withhold';

// ─── Creative Signals Interface (47 signals) ─────────────────────────────────
//
// All fields are optional. The cascade resolver fills them via 3-tier inference:
//   Tier 1: FORMAT defaults (~15 signals)
//   Tier 2: Brief extraction via LLM (~6 signals)
//   Tier 3: Smart defaults (~26 signals)
//
// See docs/creative-content-knowledge.md Part 0.5 for full inference spec.

export interface CreativeSignals {
  // ── I. RHETORICAL AXIS (4 signals) ──
  /** Reliance on logic, evidence, data. Aristotle's logos. */
  logos_load?: number;          // 0–1
  /** Reliance on emotional resonance. Aristotle's pathos. */
  pathos_load?: number;         // 0–1
  /** Reliance on credibility, authority, trust. Aristotle's ethos. */
  ethos_load?: number;          // 0–1
  /** Time-sensitivity, situational urgency. Cialdini's scarcity. */
  kairos_pressure?: number;     // 0–1

  // ── II. COGNITIVE AXIS (4 signals) ──
  /** Deep thinking required from audience. Petty & Cacioppo ELM. */
  elaboration_demand?: number;  // 0–1
  /** Bloom's revised taxonomy level. */
  bloom_level?: BloomLevel;
  /** Genuinely new information vs confirming known. Shannon information theory. */
  novelty?: number;             // 0–1
  /** Hayakawa's abstraction ladder: concrete (0) to universal (1). */
  abstraction_level?: number;   // 0–1

  // ── III. EMOTIONAL AXIS (6 signals) ──
  /** Immediate sensory/gut reaction. Norman's visceral design level. */
  visceral_impact?: number;     // 0–1
  /** Enables audience to DO something. Norman's behavioral level. */
  behavioral_utility?: number;  // 0–1
  /** Invites reconsideration of beliefs. Norman's reflective level. */
  reflective_depth?: number;    // 0–1
  /** Story immersion, narrative absorption. Green & Brock 2000. */
  narrative_transportation?: number; // 0–1
  /** Dark/tragic (-1) to bright/celebratory (+1). Russell's circumplex. */
  emotional_valence?: number;   // -1 to +1
  /** Intensity independent of direction. Russell's circumplex arousal axis. */
  emotional_arousal?: number;   // 0–1

  // ── IV. AUDIENCE AXIS (5 signals) ──
  /** Schwartz's 5 levels of awareness. */
  audience_awareness?: AwarenessLevel;
  /** Domain knowledge audience already has. */
  assumed_expertise?: number;   // 0–1
  /** "Others are doing this" as persuasion lever. Cialdini. */
  social_proof_reliance?: number; // 0–1
  /** Insider jargon and shared references. Social Identity Theory. */
  in_group_signal?: number;     // 0–1
  /** Agency given to audience vs directing them. Deci & Ryan SDT. */
  autonomy_grant?: number;      // 0–1

  // ── V. STRUCTURAL AXIS (3 signals) ──
  /** How fast through ideas/topics/beats. */
  pacing_velocity?: number;     // 0–1
  /** Builds and releases tension over duration. Freytag. */
  tension_arc?: number;         // 0–1
  /** Audience can anticipate what's next. */
  predictability?: number;      // 0–1
  /** Flesch-Kincaid reading difficulty proxy. */
  linguistic_complexity?: number; // 0–1

  // ── VI. VOICE AXIS (9 signals) ──
  /** Irreverent (-1) to formal (+1). Merged formality + irreverence. NN/g. */
  formality?: number;           // -1 to +1
  /** Comedic intent. NN/g tone model. */
  humor?: number;               // 0–1
  /** Energy and excitement. NN/g tone model. */
  enthusiasm?: number;          // 0–1
  /** Personal warmth vs professional distance. Scriptwriter review. */
  warmth?: number;              // 0–1
  /** Knowledge-relationship between writer and audience. Scriptwriter review. */
  epistemic_stance?: EpistemicStance;
  /** Doubt/provisionality vs confident assertion. */
  certainty?: number;           // 0–1
  /** Forward-looking, present, or heritage-oriented. */
  temporal_orientation?: TemporalOrientation;
  /** How the writer relates to audience power-wise. */
  power_dynamic?: PowerDynamic;
  /** Amplification (1.0 = MrBeast) vs understatement (0.0 = Hemingway). */
  intensity_performance?: number; // 0–1

  // ── VII. PURPOSE AXIS (3 signals) ──
  /** Knowledge/skill transfer. Gagne's 9 Events. */
  education_intent?: number;    // 0–1
  /** Pleasure/diversion/aesthetic experience. */
  entertainment_intent?: number; // 0–1
  /** Relationship building. Deci & Ryan relatedness. */
  connection_intent?: number;   // 0–1

  // ── VIII. TEMPORAL AXIS (2 signals) ──
  /** 0 = ephemeral (trending), 1 = evergreen (timeless). */
  temporal_relevance_decay?: number; // 0–1
  /** Narrow/specific (0) to wide/universal (1). */
  scope_breadth?: number;       // 0–1

  // ── IX. CRAFT AXIS (8 signals) ──
  /** Proportion of deliberate absence. Scriptwriter review. */
  negative_space?: number;      // 0–1
  /** Generic (0) to hyper-specific proper nouns (1). */
  specificity_grain?: number;   // 0–1
  /** Sentence/clause structure variation. */
  rhythmic_variation?: number;  // 0–1
  /** Sharpness of central turn(s). */
  pivot_intensity?: number;     // 0–1
  /** Frequency of setup/payoff pairs. Robert McKee. */
  callback_density?: number;    // 0–1
  /** Gap between surface and intended meaning. */
  subtext_depth?: number;       // 0–1
  /** Ratio of explicit to implied meaning. Grice's Cooperative Principle. */
  implication_reliance?: number; // 0–1
  /** How ideas connect between sections. 12 types. */
  transition_craft?: TransitionCraftStyle;

  // ── X. VISUAL-VERBAL AXIS (3 signals) ──
  /** How much meaning lives in visuals vs words. CEO review. */
  visual_dependency?: number;   // 0–1
  /** Demonstrate (1) vs describe (0). Screenwriting "show don't tell." */
  show_tell_ratio?: number;     // 0–1
  /** Visual and verbal carry different signals intentionally. Eisenstein montage. */
  multimodal_counterpoint?: number; // 0–1
}

// ─── Derived Signals (3, computed — never set directly) ──────────────────────

export interface DerivedSignals {
  /** f(elaboration, abstraction, complexity, novelty). Sweller 1988. */
  cognitive_load: number;
  /** f(logos, elaboration, abstraction). Miller's 7±2. */
  information_density: number;
  /** max(logos, pathos, ethos). Aristotle. */
  persuasion_intent: number;
}

// ─── Content Constraints (not signals — hard requirements) ───────────────────

export type OutputFormat =
  | 'video_script'
  | 'social_post'
  | 'blog_article'
  | 'email'
  | 'ad_copy'
  | 'presentation_script'
  | 'podcast_script'
  | 'newsletter'
  | 'product_description'
  | 'case_study'
  | 'press_release'
  | 'landing_page'
  | 'caption'
  | 'whitepaper';

export type CTAType = 'none' | 'soft' | 'hard' | 'urgent';

export type RegulatoryIndustry =
  | 'pharma'
  | 'finance'
  | 'legal'
  | 'alcohol'
  | 'gambling'
  | 'food_beverage'
  | 'healthcare'
  | 'insurance'
  | 'crypto';

export interface ContentConstraints {
  /** REQUIRED. Target length with unit. */
  target_length: { value: number; unit: 'seconds' | 'words' | 'characters' | 'slides' };
  /** REQUIRED. Content format type. Platform specifics handled by FORMAT layer. */
  output_format: OutputFormat;
  /** REQUIRED. ISO 639-1 language code. */
  language: string;
  /** Links to Brand DNA in brands collection. */
  brand_voice_id?: string;
  /** CTA intensity. */
  cta_type?: CTAType;
  /** Flesch-Kincaid grade level target. */
  reading_level_target?: number;
  /** Activates hard constraint rules from Part 6. */
  regulatory_profile?: RegulatoryIndustry;
  /** Hard platform limits (char count, aspect ratio, duration cap). */
  platform_constraints?: Record<string, unknown>;
}

// ─── Content Signal Profile (the complete resolved intent) ───────────────────

export interface InferenceMetadata {
  source:
    | 'format_default'
    | 'brief_extraction'
    | 'brand_dna'
    | 'campaign_lock'
    | 'user_explicit'
    | 'smart_default'
    | 'audience_overlay'
    | 'segment_type_overlay'
    | 'language_overlay'
    | 'pattern_break';
  confidence: number;
  resolvedFrom: string;
  wasLocked?: boolean;
  patternBreakApplied?: boolean;
  patternBreakSuppressed?: boolean;
  suppressionReason?: string;
  regulatoryClamped?: boolean;
}

export interface ContentSignalProfile {
  constraints: ContentConstraints;
  signals: Partial<CreativeSignals>;
  derived?: DerivedSignals;
  _inference_metadata?: Record<string, InferenceMetadata>;
}

// ─── Signal Envelope (for Part 3 Signal Dynamics — types only, runtime deferred) ──

export type EnvelopeCurve = 'linear' | 'exponential' | 'logarithmic';

export interface SignalEnvelope {
  start: number;
  peak: number;
  end: number;
  peakPosition: number; // 0–1
  attackCurve: EnvelopeCurve;
  releaseCurve: EnvelopeCurve;
}

/** A signal value can be static (number) or dynamic (envelope). */
export type SignalValueOrEnvelope = number | SignalEnvelope;

// ─── Pattern Break (Moments — Part 3.3) ──────────────────────────────────────

/**
 * Numeric-only creative signals. Enum signals (bloom_level, audience_awareness,
 * epistemic_stance, temporal_orientation, power_dynamic, transition_craft)
 * are excluded — you cannot "spike 0.6" on an enum.
 */
export type NumericCreativeSignal = {
  [K in keyof CreativeSignals]: CreativeSignals[K] extends number | undefined ? K : never;
}[keyof CreativeSignals];

export interface PatternBreakV1 {
  /** Which numeric signal to break. */
  signal: NumericCreativeSignal;
  /** Relative to the current trajectory value. */
  direction: 'spike' | 'drop';
  /** DELTA from cascade-resolved value, 0.2–0.8. */
  magnitude: number;
  /** Why this break exists — required for auditability. */
  reason: string;
}
