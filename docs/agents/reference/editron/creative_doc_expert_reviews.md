---
name: Creative Content Doc — Expert Review Details (Eng + Scriptwriter)
description: >
  FULL expert review outputs for the signal taxonomy and scope system.
  Contains: Eng signal correlations, measurability ratings, TypeScript schemas,
  cascade algorithm. Scriptwriter 23 proposed signals, voice axis expansion,
  craft walkthrough, what makes content GOOD.
type: project
last_updated: 2026-05-19
priority: HIGH
originSessionId: 06e29f3e-3816-4c0e-8acc-4d2fb1ebae47
---
# Expert Reviews — Full Detail

## PART A: ENG REVIEW OF SIGNAL TAXONOMY

### Correlated Pairs (11 found, 4 acted on)

HIGH correlation (eliminated or derived):
- `logos_load` ↔ `information_density` — near-synonyms. KILLED info_density → derived
- `elaboration_demand` ↔ `cognitive_load` — cause/effect. KILLED cognitive_load → derived
- `persuasion_intent` ↔ `logos+pathos+ethos` — fully decomposed. KILLED persuasion_intent → derived
- `formality` ↔ `irreverence` — near-inverses. MERGED into formality -1 to +1

MODERATE (keep both, document):
- `abstraction_level` ↔ `assumed_expertise` — high abstraction usually implies high expertise, but popular science breaks this
- `enthusiasm` ↔ `emotional_arousal` — enthusiasm is subset of arousal. Constraint: enthusiasm <= arousal + 0.2
- `narrative_transportation` ↔ `entertainment_intent` — diverge only for educational narratives

LOW (acceptable):
- `pacing_velocity` ↔ `kairos_pressure`
- `tension_arc` ↔ `emotional_arousal`
- `novelty` ↔ `predictability` (inversely related but different dimensions)
- `behavioral_utility` ↔ `education_intent` — utility = action change, education = comprehension. Philosophy lecture = high edu, low utility.

### Measurability Per Signal

A = auto-inferable from brief, U = needs user input, M = ambiguous

RHETORICAL: logos_load=M, pathos_load=M, ethos_load=M, kairos_pressure=A
COGNITIVE: elaboration_demand=M, bloom_level=U, novelty=U, abstraction_level=M
EMOTIONAL: visceral_impact=M, behavioral_utility=A, reflective_depth=U, narrative_transportation=M, emotional_valence=A, emotional_arousal=M
AUDIENCE: audience_awareness=A, assumed_expertise=A, social_proof_reliance=M, in_group_signal=U, autonomy_grant=U
STRUCTURAL: pacing_velocity=A, tension_arc=U, predictability=U, linguistic_complexity=M
VOICE: formality=A, humor=A, enthusiasm=M
PURPOSE: education_intent=A, entertainment_intent=A, connection_intent=M
TEMPORAL: temporal_relevance_decay=A, scope_breadth=M

TOTALS: 11 Auto, 13 Ambiguous, 8 Needs-User-Input
FIX: 3-tier inference (format defaults → brief extraction → smart defaults)

### TypeScript Schema (Signal System)

```typescript
interface DerivedSignals {
  information_density: number;
  cognitive_load: number;
  persuasion_intent: number;
}

interface ContentConstraints {
  output_format: OutputFormat;                      // required
  target_length: { value: number; unit: 'seconds' | 'words' | 'slides' };  // required
  language: string;                                 // ISO 639-1, required
  brand_voice_id?: string;                          // overrides voice signals
  platform_constraints?: PlatformConstraints;
  cta_type?: 'none' | 'soft' | 'hard' | 'urgent';
  reading_level_target?: number;                    // Flesch-Kincaid grade
}

interface CreativeSignals {
  // RHETORICAL
  logos_load?: number;
  pathos_load?: number;
  ethos_load?: number;
  kairos_pressure?: number;
  // COGNITIVE
  elaboration_demand?: number;
  bloom_level?: BloomLevel;
  novelty?: number;
  abstraction_level?: number;
  // EMOTIONAL
  visceral_impact?: number;
  behavioral_utility?: number;
  reflective_depth?: number;
  narrative_transportation?: number;
  emotional_valence?: number;       // -1 to +1
  emotional_arousal?: number;
  // AUDIENCE
  audience_awareness?: AwarenessLevel;
  assumed_expertise?: number;
  social_proof_reliance?: number;
  in_group_signal?: number;
  autonomy_grant?: number;
  // STRUCTURAL
  pacing_velocity?: number;
  tension_arc?: number;
  predictability?: number;
  linguistic_complexity?: number;
  // VOICE (expanded)
  formality?: number;               // -1 to +1
  humor?: number;
  enthusiasm?: number;
  warmth?: number;
  epistemic_stance?: EpistemicStance;
  certainty?: number;
  temporal_orientation?: TemporalOrientation;
  power_dynamic?: PowerDynamic;
  intensity_performance?: number;
  // PURPOSE
  education_intent?: number;
  entertainment_intent?: number;
  connection_intent?: number;
  // TEMPORAL
  temporal_relevance_decay?: number;
  scope_breadth?: number;
  // CRAFT
  negative_space?: number;
  specificity_grain?: number;
  rhythmic_variation?: number;
  pivot_intensity?: number;
  callback_density?: number;
  subtext_depth?: number;
  implication_reliance?: number;
  transition_craft?: TransitionCraftStyle;
  // VISUAL-VERBAL
  visual_dependency?: number;
  show_tell_ratio?: number;
  multimodal_counterpoint?: number;
}

interface ContentSignalProfile {
  constraints: ContentConstraints;
  signals: CreativeSignals;
  derived?: DerivedSignals;
  _inference_metadata?: {
    source: Record<string, 'format_default' | 'brief_extraction' | 'user_specified' | 'smart_default'>;
    confidence: Record<string, number>;
  };
}

type OutputFormat = 'tiktok_script' | 'youtube_script' | 'instagram_reel_script'
  | 'blog_post' | 'article' | 'linkedin_post' | 'tweet_thread'
  | 'presentation' | 'email' | 'ad_copy' | 'product_description'
  | 'newsletter' | 'whitepaper';
type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
type AwarenessLevel = 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware';
type EpistemicStance = 'teacher' | 'peer' | 'guide' | 'oracle' | 'co_discoverer';
type TemporalOrientation = 'forward' | 'present' | 'backward';
type PowerDynamic = 'command' | 'invite' | 'confide' | 'provoke';
type TransitionCraftStyle = 'hard_cut' | 'bridge' | 'callback_bridge' | 'question_bridge' | 'tonal_shift' | 'contradiction';
```

### 3-Tier Inference Walkthrough

User prompt: "Write a 30-second TikTok ad for our coffee brand targeting millennials"

Tier 1 (format defaults for tiktok_script):
- pacing_velocity=0.85, formality=-0.3, humor=0.4, emotional_arousal=0.7
- bloom_level=remember, temporal_decay=0.2, tension_arc=0.3, predictability=0.6

Tier 2 (LLM extracts from brief text):
- audience_awareness=product_aware ("our coffee brand")
- assumed_expertise=0.3 (millennials, general)
- pathos_load=0.5, logos_load=0.2, ethos_load=0.3
- emotional_valence=+0.7 (coffee = positive)

Tier 3 (smart defaults for remaining):
- elaboration_demand=0.2, novelty=0.5, abstraction_level=0.2
- visceral_impact=0.6, behavioral_utility=0.3, reflective_depth=0.1
- narrative_transportation=0.4, social_proof=0.3, in_group_signal=0.5
- autonomy_grant=0.3, enthusiasm=0.7
- education_intent=0.1, entertainment_intent=0.6, connection_intent=0.4

### Technique Mapping: Sparse Activation

```typescript
interface TechniqueCard {
  id: string;
  name: string;
  description: string;
  activation_conditions: {
    signal: keyof CreativeSignals;
    min?: number;
    max?: number;
    weight: number;
  }[];
  inhibitors?: {
    signal: keyof CreativeSignals;
    threshold: number;
    direction: 'above' | 'below';
  }[];
}
```

Each technique specifies 3-6 activation signals + 0-2 inhibitors. NOT all 47.
Selection: score = sum(weight * signal_match), filter inhibitors, rank, take top N.

---

## PART B: SCRIPTWRITER REVIEW

### Creative Process Walkthrough

**TikTok Ad — what the taxonomy MISSES:**
- Pattern interruption (sensory disruption, not just novelty)
- Mimetic camouflage (make ad look like organic content)
- Micro-reward density (dopamine hits every 3-5 seconds)
- Exit velocity (how resolved should the ending feel?)

**Kurzgesagt Explainer — what the taxonomy MISSES:**
- The "oh shit" moment (controlled demolition of viewer's mental model)
- Scale manipulation (zoom between microscopic and cosmic)
- Explanatory metaphor reliance ("immune system as medieval kingdom")
- Progressive complexity (concept dependency chain)

**Patagonia Brand Film — what the taxonomy MISSES:**
- Negative space (60% silence, restraint IS the message)
- Earned emotion (show, don't demand — let image carry weight)
- Visual-verbal counterpoint (narration + image = third meaning)
- Temporal confidence (slow pace from confidence, not insecurity)

### 23 Proposed New Signals (curated to 8 in final taxonomy)

ADDED to taxonomy:
1. `negative_space` — proportion of deliberate absence
2. `specificity_grain` — generic to hyper-specific details
3. `rhythmic_variation` — sentence/clause structure variation
4. `pivot_intensity` — sharpness of central turn(s)
5. `callback_density` — setup/payoff pair frequency
6. `subtext_depth` — gap between surface and intended meaning
7. `implication_reliance` — explicit to implied meaning ratio
8. `transition_craft` — style and visibility of idea movement

NOT added (acknowledged, may add later):
9. pattern_interrupt_intensity — how hard opening disrupts viewer
10. mimetic_register — closeness to native content form
11. micro_reward_density — frequency of small payoff moments
12. resolution_completeness — how resolved the ending feels
13. scale_oscillation — micro/macro zoom frequency
14. metaphor_reliance — extended metaphor vs literal explanation
15. concept_dependency — how tightly coupled segments are
16. rule_violation_frequency — deliberate pattern-breaking
17. earned_emotion_ratio — showing vs telling emotion

### Voice Axis Expansion Rationale

4 signals can't distinguish:
- MrBeast (maximalist, performative energy) vs Casey Neistat (laconic, observational cool)
  → Difference: `intensity_performance`
- Vox (smart friend explaining) vs Kurzgesagt (benevolent alien showing universe)
  → Difference: `epistemic_stance`
- Nike (imperative, pressurized) vs Patagonia (reflective, unhurried)
  → Difference: `temporal_orientation` + `power_dynamic`
- Startup scrappy vs Apple restrained
  → Difference: `certainty` + `temporal_orientation`
- Cold professional vs warm mentor
  → Difference: `warmth`

### What Makes Content GOOD vs Merely Correct

Even with all 47 signals perfectly set, three things would still be missing:

1. **SURPRISE**: Great writing deliberately violates its own patterns for effect. No signal for rule-breaking.

2. **VOICE SIGNATURE**: Two writers with identical signal values produce different writing. The structural habits — paragraph building, evidence placement, point-of-story location — are below signal resolution.

3. **BREATHING**: Signals are static positions. Within a piece, pacing and emotion are in constant MOTION. The variation pattern IS the craft. A signal system describes WHERE to be on each axis, not HOW to move between positions over time.

---

## PART C: ENG REVIEW OF SCOPE SYSTEM

### Cascade Resolution Algorithm

```typescript
function resolveSignal(signalId, targetSceneId, targetBeatId, campaign, project, signalMeta): ResolvedSignal {
  // Phase 1: Walk bottom-up
  // Beat → Scene → Act → Project → Campaign → Brand
  // First explicit override wins

  // Phase 2: Lock enforcement (top-down)
  // If campaign locks this signal, campaign value wins regardless
  // Lower-level overrides marked 'locked-above'

  // Phase 3: Group/Segment Type overlay
  // Highest-priority group wins when overlapping
  // Groups cannot override locked signals

  // Phase 4: Default fallback
  // Schema-defined neutral value if nothing set anywhere
}
```

Returns: { value, resolvedFrom (scope level), wasExplicit, resolutionChain (debug), groupOverride? }

### MongoDB Storage

- Embedded hierarchy within project document (one findOne loads entire tree)
- Campaigns as separate collection (cross-project, spans multiple projects)
- Sparse ScopeOverrides: only stores explicitly-set signals, not all 47
- 10-scene video ≈ 5KB scope data. 50-scene with beats well under 16MB limit.

### Scope Signal Metadata Registry

```typescript
interface SignalScopeMetadata {
  signalId: string;
  defaultScope: ScopeLevel;        // where typically set
  minMeaningfulScope: ScopeLevel;  // lowest level with meaning
  campaignLockable: boolean;       // can creative director lock?
}
```

### Edge Cases Handled
- Scene with no parent act → skip act level (normal for <5 scenes)
- Campaign has no value → schema default (like CSS initial value)
- Locked signal without value → configuration error at validation
- Transition blend > next scope duration → clamp + warning
- Two groups overlap with same priority → validation error at construction
- Signal type mismatch across scopes → runtime validation error

### What Should Be Campaign-Lockable
YES: formality, color_temperature, ambient_type (STYLE signals)
NO: energy, motion_intensity, structural signals, composite signals (CONTENT signals)

---

## PART D: CEO REVIEW OF SCOPE SYSTEM

### BRAND above CAMPAIGN (most important insight)
"An agency managing Nike doesn't start with 'Campaign.' They start with 'Nike.'"
Brand is the permanent home screen. Campaigns are time-bound overlays.

### FORMAT layer (the one-brief-every-format mechanism)
System-managed, not user-created. Between CAMPAIGN and PROJECT.
"TikTok means pacing +30%, formality -2 levels, max duration 60s, vertical crop."
Without FORMAT, users manually adjust 10+ signals per platform = the Adobe workflow.

### SEGMENT TYPE replaces GROUP
Concrete categories: interview, b-roll, title_card, product_shot, testimonial, CTA, hook.
- Auto-tag scenes by segment type
- Learnable defaults per type
- "All interview segments across all projects share these signals"

### AUDIENCE as orthogonal overlay
Same brand + campaign + platform, different target demo = different signals.
"Nike Summer 2026, TikTok, for 18-24 athletes"

### Additional requirements
- Signal LOCKING with approval workflows
- Brand DNA VERSIONING with project pinning
- Conflict resolution UI ("overridden from Brand default" + one-click revert)
- Competitive reference (decompose competitor → signal fingerprint → starting point)
- VERSION HISTORY on signals (brand evolution over quarters)
