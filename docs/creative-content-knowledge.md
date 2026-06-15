# CREATIVE CONTENT KNOWLEDGE — THE WRITING INTELLIGENCE DOCUMENT

Version: 1.0
Date: 2026-05-19
Status: Complete v1.0 foundation. Parts 0-8 present; performance attribution and expansion remain ongoing.
Authors: Nimit Jain (vision + reviews), Claude (research + synthesis)
Consumers: ThinkForge agents (outline, contract, author, refinement, coherence, stylist), FORMAT system, Brand Studio, signal executor

This document is the writing equivalent of `creative_production_knowledge_v3.md` (5838 lines, 671 graph nodes) which powers Editron's video editing decisions. That doc answers "given footage, how do I edit it?" This doc answers "given a brief, how do I write content?"

Content type is EMERGENT from signals — there are no "video script" or "LinkedIn post" sections. The same signal taxonomy handles every format. The same cascade handles every scope. What changes is the signal VALUES, not the system.

Signals describe WHERE content lives in a multidimensional space. They do not describe HOW to get there. Two scripts with identical signal profiles can differ in quality based on craft execution — word choice, rhythm, the specific metaphor, the unexpected turn. This system handles the structure so humans can focus on the ideas. For the 80% of agency work that is competent, on-brand, deadline-driven content production, it replaces manual signal-setting entirely. For the 20% that is actual creative breakthrough work, it is a sophisticated starting point — not a destination.

## Document Structure (9 Parts)

```
Part 0: Content Intent Schema        — scope, cascade, FORMAT, inference (this section)
Part 1: Voice & Brand System         — voice signature, brand DNA, FORMAT presets
Part 2: Brief Signal Dictionary       — 47 signals, 10 axes, behavioral anchors
Part 3: Signal Dynamics              — breathing, surprise, moments, envelopes
Part 4: Signal → Writing Technique Atlas — when X do Y because Z never W
Part 5: Writing Technique Reference   — each technique fully described
Part 6: Writing Constraints           — anti-patterns, limits, regulatory
Part 7: Irreducible Writing Knowledge — theory for novel situations
Part 8: Platform & Format Constants   — hard numbers per platform
```

---

# PART 0 — CONTENT INTENT SCHEMA

Pipeline stage: ThinkForge Agent Pipeline (ContractAgent → OutlineAgent → ScriptAuthorAgent)
When: BEFORE any writing decisions. Once per project, not per scene.
Purpose: Compute the signal profile that modulates all writing technique selection.

## 0.0 How Writing Intent Gets Computed

Writing intent must be computed regardless of how the brief arrives. The input format differs; the output schema (ContentSignalProfile) is identical.

### Path A: Brief → New Content (user provides a brief or prompt)

The ThinkForge pipeline reads the brief text, the brand context (Voice Signature + Brand DNA from Brand Studio), the campaign context (if any), and the FORMAT selection. It computes a ContentSignalProfile that drives every agent in the pipeline.

```
STAGE 1 — Parse the brief
  Input:  User's brief text + selected FORMAT + brand context
  Action: Extract explicit signals from brief text via LLM (Tier 2 inference)
  Output: ~6 explicitly stated signals (e.g., "casual TikTok" → formality: -0.3, pacing_velocity: +0.3)
  Note:   LLM extracts signals, it does NOT write the content

STAGE 2 — Apply FORMAT defaults
  Input:  Selected platform/format
  Action: Load platform range-based defaults (Tier 1 inference)
  Output: ~15 signals set from format defaults (e.g., TikTok → pacing_velocity: 0.85, sweet spot: 21-60s)
  Note:   These are DEFAULTS within accepted RANGES, not hard constraints

STAGE 3 — Apply Brand DNA
  Input:  Brand Signal Profile + Voice Signature + Campaign overrides (if any)
  Action: Cascade resolution — brand values override format defaults, campaign locks override everything
  Output: Resolved signal profile with provenance tracking per signal
  Note:   By project #50, the system has essentially memorized how this brand writes

STAGE 4 — Fill remaining signals via smart defaults
  Input:  Partially-filled signal profile (~21 signals set from Stages 1-3)
  Action: Tier 3 inference — domain-aware defaults for remaining ~26 signals
  Output: Complete ContentSignalProfile (all 47 signals resolved)
  Note:   Smart defaults are NOT random middle values — they are domain-derived
          (e.g., education_intent default depends on FORMAT: tutorial=0.8, ad=0.1)

STAGE 5 — Technique selection
  Input:  Complete ContentSignalProfile + Writing Technique Atlas (Part 4)
  Action: Sparse activation — each technique card's activation conditions scored against profile
  Output: Ranked technique set for each writing decision point (hook, structure, narration, CTA, etc.)
  Note:   Deterministic. Same profile → same techniques. No LLM randomness.
```

The agents then receive: the brief text, the resolved signal profile, the selected techniques, and the voice signature. The LLM writes content WITHIN the constraints the signal system has defined — it is not making creative decisions, it is executing them.

### Path B: Existing Content → Adaptation (user provides content to transform)

Content transformation — taking a YouTube script and producing 5 TikTok clips — requires a different computation path. The content already exists; writing intent is DERIVED from the source, then MODIFIED by the target format.

**Honest scope of Path B:** Adaptation works well between SIMILAR formats (YouTube script → podcast script, LinkedIn post → email newsletter) where the signal delta is small and the content structure is preserved. For MAJOR format boundary crossings (10-minute blog → 30-second TikTok), the signal delta is so large that "minimum adjustment" is misleading — the system must identify the single most compelling insight and reimagine it for the new format. This is editorial judgment, not signal arithmetic. The system assists by identifying high-weight moments from the source content, but the creative decision of what to keep belongs to the user or the agent pipeline's editorial judgment layer.

```
STAGE 1 — Decompose source content
  Input:  Existing content (script, blog post, email, etc.)
  Action: Signal decomposition — extract the 47-signal profile of the existing content
  Output: Source ContentSignalProfile (what the content currently IS)
  Note:   This is the inverse of generation — reading signals from finished content

STAGE 2 — Compute target profile + assess transformation magnitude
  Input:  Source profile + target FORMAT + any user overrides
  Action: Apply target FORMAT defaults, compute signal-by-signal delta
  Output: Target ContentSignalProfile + transformation_magnitude (small | medium | large)
  Note:   Small delta (<5 signals change >0.3) = surface adaptation (word choice, length trim)
          Medium delta (5-15 signals) = structural adaptation (reorder, reframe, cut sections)
          Large delta (>15 signals) = creative reimagination (find the core insight, rebuild from scratch)

STAGE 3 — Generate transformation plan
  Input:  Source profile vs target profile + transformation_magnitude
  Action: For small/medium: signal-by-signal diff → technique swap list
          For large: identify top 3 highest-weight moments from source → rebuild around those
  Output: Transformation plan with explicit scope declaration
  Note:   Large transformations flag to user: "This adaptation requires significant creative
          reimagination. The system will identify key moments — you approve the editorial choices."

STAGE 4 — Execute transformation
  Input:  Original content + transformation plan
  Action: Agents rewrite content following the plan, preserving brand coherence
  Output: Transformed content + diff showing what changed and why
```

This enables the "one brief, every format" mechanism for small/medium adaptations. Large format boundary crossings (blog → TikTok, presentation → tweet thread) require user involvement in editorial decisions. Each format version shares the same brand DNA and campaign signals, differing only where the FORMAT layer requires it.

### Both Paths: Brand Context from Brand Studio

If this brand has been written for before, the Voice Signature provides learned preferences:
- Kill list (words the brand never uses)
- Structural habits (how this brand opens, transitions, closes)
- Statistical fingerprint (sentence rhythm, vocabulary tier, rhetorical patterns)
- Reference exemplars (retrieved by signal similarity for few-shot context)

These compound over time. By project #50, the system produces content that sounds like the brand without the user specifying anything beyond "new TikTok for summer campaign."


## 0.1 Content Intent Output Schema

The resolved intent for every writing project. This is what every ThinkForge agent receives.

```
ContentSignalProfile {
  // === CONSTRAINTS (not signals — hard requirements) ===
  constraints: {
    target_length:          { value: number, unit: 'seconds' | 'words' | 'characters' | 'slides' }  // REQUIRED
    output_format:          OutputFormat          // REQUIRED — see enum below
    language:               string                // REQUIRED — ISO 639-1
    brand_voice_id?:        string                // links to Brand DNA in separate collection
    cta_type?:              'none' | 'soft' | 'hard' | 'urgent'
    reading_level_target?:  number                // grade level (e.g., 8 = grade 8)
    regulatory_profile?:    RegulatoryIndustry  // activates hard constraint rules from Part 6 — see Part 1.5 for full enum + jurisdiction
    platform_constraints?:  PlatformConstraints   // hard platform limits (char count, aspect ratio, duration cap)
  }

  // === 47 SIGNALS (all optional, resolved via cascade) ===
  // Each numeric signal accepts number OR SignalEnvelope (see Part 3 for envelope spec).
  // At resolution time, envelopes are pre-resolved to static values at the requested temporal position.
  // Type: SignalValueOrEnvelope = number | SignalEnvelope
  signals: Partial<CreativeSignals>  // see Part 2 for full 47-signal schema

  // === 3 DERIVED SIGNALS (computed, never set directly) ===
  derived?: {
    cognitive_load:       number    // f(elaboration, abstraction, complexity, novelty) — defined in Part 2
    information_density:  number    // f(logos, elaboration, abstraction) — defined in Part 2
    persuasion_intent:    number    // max(logos, pathos, ethos)
  }

  // === INFERENCE METADATA (provenance tracking, optional) ===
  _inference_metadata?: {
    [signalKey: string]: {
      source:     'format_default' | 'brief_extraction' | 'brand_dna' | 'campaign_lock'
                | 'user_explicit' | 'smart_default' | 'audience_overlay' | 'segment_type_overlay'
                | 'language_overlay' | 'pattern_break'
      confidence: number    // 0-1
      resolvedFrom: string  // scope level that provided this value
      wasLocked?: boolean   // true if campaign/brand lock overrode a lower-scope value
      patternBreakApplied?: boolean   // true if a Moment/PatternBreak modified this value
      patternBreakSuppressed?: boolean  // true if a lock blocked a pattern break (surfaced in UI)
      suppressionReason?: string        // why the pattern break was suppressed
    }
  }
}

// Output format enum — GENERIC types, not platform-specific.
// Platform specifics (TikTok vs YouTube vs Instagram Reels) are handled by the FORMAT layer,
// not the output_format enum. This prevents the enum from duplicating FORMAT logic.
OutputFormat =
  | 'video_script'        // narration + visual directions (platform via FORMAT)
  | 'social_post'         // caption + optional visual direction (platform via FORMAT)
  | 'blog_article'        // long-form text
  | 'email'               // subject + body + CTA
  | 'ad_copy'             // headline + body + CTA
  | 'presentation_script' // slide narration + bullet points
  | 'podcast_script'      // spoken word, no visual
  | 'newsletter'          // curated sections
  | 'product_description' // feature-focused
  | 'case_study'          // problem → solution → result
  | 'press_release'       // inverted pyramid
  | 'landing_page'        // hero + sections + CTA
  | 'caption'             // short-form text for social media
  | 'whitepaper'          // research-backed long-form
```

### Why constraints are separate from signals

Constraints are HARD REQUIREMENTS — a 30-second video script cannot be 5 minutes. Signals are CREATIVE PROPERTIES — formality=0.7 means "lean formal" but allows artistic deviation. The system enforces constraints absolutely. It interprets signals as guidance.

A regulatory_profile overrides everything. If pharma is set, specific constraint rules from Part 6 activate (risk disclosure required, superlatives banned, indication-specific language mandatory). No signal, override, or pattern break can bypass a regulatory constraint.


## 0.2 Scope Hierarchy

Every signal value exists within a scope. Scopes nest. More specific wins.

```
BRAND DNA                    ← immortal, versioned, lockable
  └─ CAMPAIGN                ← time-bound strategic overlay
       └─ FORMAT             ← system-managed platform defaults (range-based)
            └─ FORMAT PRESET ← user-created brand-specific format variant
                 └─ PROJECT  ← one deliverable
                      └─ ACT ← groups of scenes (long-form only, configurable threshold)
                           └─ SCENE ← per-segment (tagged with SEGMENT TYPE)
                                └─ BEAT ← micro-moments (DEFERRED to post-MVP)

TRANSITION  — between adjacent same-level items (resets, delta, blend, easing)
SEGMENT TYPE — concrete categories (interview, b-roll, title_card, product_shot, CTA, hook)
AUDIENCE    — orthogonal overlay modifying signals for target demographic
LANGUAGE    — orthogonal overlay (Japanese formality ≠ English formality for same brand)
```

### Scope descriptions

**BRAND DNA** — The permanent home. Defines voice, visual identity, sonic signature, kill list (words/patterns the brand NEVER uses). Versioned — Nike Q1 2026 is different from Nike Q3 2026. Lockable — a brand manager can LOCK formality at 0.3, meaning no campaign, project, or scene can override it.

**CAMPAIGN** — Time-bound strategic overlay. "Summer Launch 2026" sets kairos_pressure: 0.8, enthusiasm: 0.9. When the campaign ends, these values disappear. The brand returns to its baseline. Campaign locks are ABSOLUTE — they override everything below them in the hierarchy.

**FORMAT** — System-managed platform defaults. NOT single-point values — RANGES with preferred, accepted, and out-of-range boundaries. When the user selects "TikTok," the system applies ~15 signal defaults within their accepted ranges. The user can override any default at any lower scope.

**FORMAT PRESET** — User-created brand-specific format variant. "Coke TikTok Challenge" inherits TikTok platform defaults but adds duration=15s, pacing_velocity=0.95, humor=0.7, CTA at final scene. Lives at the intersection of BRAND and FORMAT. Agencies don't think "TikTok" — they think "our kind of TikTok."

**PROJECT** — One deliverable. The brief, the content, the output. Most users interact at this level.

**ACT** — Groups of scenes for long-form content. Activated only when content exceeds configurable threshold (default: 5+ scenes or 90+ seconds). Not exposed in default UI.

**SCENE** — Per-segment signal values. Tagged with a SEGMENT TYPE (interview, b-roll, title_card, product_shot, CTA, hook). Segment types enable learnable cross-project defaults — "all CTA scenes for Nike tend to have kairos_pressure: 0.9."

**BEAT** — Sub-scene micro-moments. DEFERRED to post-MVP. The cascade algorithm already supports it; adding it later requires no architectural changes.

### Duration-dependent scope activation

Not all scopes are active for all content lengths. Short content doesn't need ACTs. Series need the full hierarchy.

```
< 30 seconds:   BRAND → CAMPAIGN → FORMAT → PROJECT → SCENE
30–90 seconds:  + TRANSITION (between scenes)
90s – 5 min:    + ACT
5 – 30 min:     + ACT (full hierarchy except BEAT)
Series/campaign: BRAND → CAMPAIGN → FORMAT → per-piece PROJECT
Post-MVP:       + BEAT (within-scene micro-moments)
```

The system automatically activates the appropriate scopes based on target_length. Users never need to think about scope levels — the UI shows only what's relevant for their content length.


## 0.3 Cascade Resolution Algorithm

The cascade resolves each signal independently. For any signal at any scope, the resolution walks bottom-up through the hierarchy until it finds an explicit value.

```
function resolveSignal(signalId, scopeContext, normalizedTime = 0.5):
  candidate = null
  regulatoryClamp = null

  // Phase 0: Regulatory clamp lookup (ABOVE all other resolution — see Part 1.5)
  if scopeContext.constraints.regulatory_profile:
    profile = REGULATORY_PROFILES[scopeContext.constraints.regulatory_profile]
    if profile.signalClamps[signalId]:
      regulatoryClamp = profile.signalClamps[signalId]  // { max?, min? }

  // Phase 1: Bottom-up walk — first explicit value wins
  for scope in [BEAT, SCENE, ACT, PROJECT, FORMAT_PRESET, FORMAT, CAMPAIGN, BRAND]:
    if scope.overrides[signalId] exists AND is explicit:
      rawValue = scope.overrides[signalId]
      // If value is a SignalEnvelope, pre-resolve to static at the requested time
      candidate = (typeof rawValue === 'object' && rawValue.start !== undefined)
        ? evaluateEnvelope(rawValue, normalizedTime)
        : rawValue
      candidateScope = scope.name
      break

  // Phase 2: Lock enforcement — top-down, absolute (THE SOLE EXCEPTION to "more specific wins")
  for scope in [BRAND, CAMPAIGN]:
    if scope.locks[signalId] exists:
      candidate = scope.locks[signalId]
      candidateScope = scope.name + ':LOCKED'
      wasLocked = true
      break

  // Phase 3: PatternBreak application (Moments — see Part 3 for full spec)
  // PatternBreaks are scene-level meta-directives that deliberately violate the cascade.
  // They apply ONLY to numeric signals (enum signals excluded via NumericCreativeSignal type guard).
  // Magnitude is a DELTA from the cascade-resolved value, not an absolute.
  if scopeContext.scene.patternBreaks has entry for signalId:
    pb = scopeContext.scene.patternBreaks[signalId]
    if wasLocked:
      // Lock wins — but suppression MUST be surfaced in UI, never silent
      patternBreakSuppressed = true
      suppressionReason = "Campaign lock on " + signalId + " at " + candidate
    else:
      delta = (pb.direction === 'spike') ? +pb.magnitude : -pb.magnitude
      candidate = clamp(candidate + delta, SIGNAL_RANGES[signalId].min, SIGNAL_RANGES[signalId].max)
      patternBreakApplied = true

  // Phase 4: Orthogonal overlay application (additive deltas, clamped after each)
  // Only the HIGHEST-PRIORITY overlay with a modifier for this signal applies.
  // Priority: AUDIENCE > SEGMENT_TYPE > LANGUAGE
  overlayApplied = null
  if candidate !== null:
    if AUDIENCE overlay has modifier for signalId:
      candidate = clamp(candidate + AUDIENCE.modifier.delta, signal.min, signal.max)
      overlayApplied = 'audience'
    else if SEGMENT_TYPE overlay has modifier for signalId:
      candidate = clamp(candidate + SEGMENT_TYPE.modifier.delta, signal.min, signal.max)
      overlayApplied = 'segment_type'
    else if LANGUAGE overlay has modifier for signalId:
      candidate = clamp(candidate + LANGUAGE.modifier.delta, signal.min, signal.max)
      overlayApplied = 'language'

  // Phase 5: Default fallback
  if candidate === null:
    candidate = SIGNAL_SCHEMA[signalId].defaultValue
    candidateScope = 'default'

  // Phase 6: Regulatory clamp (FINAL — overrides everything, including locks and overlays)
  if regulatoryClamp !== null:
    if regulatoryClamp.max !== undefined AND candidate > regulatoryClamp.max:
      candidate = regulatoryClamp.max
      regulatoryClamped = true
    if regulatoryClamp.min !== undefined AND candidate < regulatoryClamp.min:
      candidate = regulatoryClamp.min
      regulatoryClamped = true

  return {
    value: candidate,
    resolvedFrom: candidateScope,
    wasExplicit: candidateScope !== 'default',
    wasLocked: wasLocked || false,
    patternBreakApplied: patternBreakApplied || false,
    patternBreakSuppressed: patternBreakSuppressed || false,
    suppressionReason: suppressionReason || null,
    overlayApplied: overlayApplied,
    regulatoryClamped: regulatoryClamped || false,
    resolutionChain: [...scopes traversed],
  }
```

### Resolution rules

1. **More specific wins, with ONE exception.** Scene beats Act beats Project beats Format beats Campaign beats Brand — EXCEPT for campaign/brand locks, which are the sole exception to this rule. Locks exist for brand governance; they override everything below them regardless of specificity.
2. **Campaign locks are absolute.** If a brand manager locks formality at 0.3 at the campaign level, no project, scene, pattern break, or overlay can change it. The value IS 0.3. Period. Suppressed overrides and pattern breaks are surfaced in the UI with the reason — never silently swallowed.
3. **PatternBreaks (Moments) apply after locks, before overlays.** They are DELTAS from the cascade-resolved value, not absolute overrides. They apply only to numeric signals — enum signals (bloom_level, epistemic_stance, etc.) cannot be "spiked by 0.6." Full PatternBreak specification in Part 3.
4. **Sparse storage.** Only explicitly-set overrides are stored. A scene with no overrides inherits everything from its parent. Storage cost is proportional to what the user actually touched, not to the total signal count.
5. **Orthogonal overlays apply AFTER cascade + PatternBreaks.** The cascade gives the base value. PatternBreaks modify it. Then ONE overlay adjusts it (highest-priority overlay wins, not all applied additively). This prevents stacking: AUDIENCE delta alone, OR SEGMENT_TYPE delta alone, OR LANGUAGE delta alone — not all three summed.
6. **Overlay precedence.** AUDIENCE > SEGMENT_TYPE > LANGUAGE. Audience is a deliberate creative choice. Segment type is structural. Language is cultural baseline.
7. **Conflict resolution is visible.** When multiple sources compete for the same signal, the UI shows the full resolution chain including any suppressed pattern breaks. Every creative director will eventually ask "why is this value 0.6?" and the system must answer with complete provenance.
8. **Signal version history.** Every project maintains a version history of its signal profile. Users can revert to any previous state, diff two versions, and see exactly what changed between revision cycles. This enables client review loops: "make it warmer" → adjust → "too warm, go back" without losing state.

### Cascade validation rules

The cascade rejects or warns on these conditions:
- **Orphan scene:** Scene with no parent act (when ACT scope is active) → construction error
- **Overlapping group priority:** Two segment types with equal priority on same signal → validation error
- **Locked signal without value:** Campaign locks a signal but provides no value → configuration error
- **Transition blend overflow:** blendDurationMs exceeds next scope's duration → clamp + warning
- **Signal type mismatch:** Enum signal at parent, numeric at child → runtime error

### One-click reset

Any override at any scope can be reset to inherited with one action. This removes the explicit value at that scope, causing the signal to re-inherit from the parent. The UX equivalent of CSS `unset`. Without easy undo, overrides become anxiety-inducing.

### Signal scope metadata (defined per signal in Part 2)

Each signal carries metadata governing how the cascade interprets it:
```
SignalScopeMetadata {
  defaultScope:        'global' | 'per_scene' | 'transition'  // where this signal naturally lives
  minMeaningfulScope:  ScopeLevel   // below this, the signal has no meaningful variation
  campaignLockable:    boolean      // can this signal be locked by campaign/brand?
}
```
Style signals (formality, warmth, epistemic_stance) are campaignLockable. Content signals (energy, motion_intensity, pacing) are NOT — they must respond to what the content actually says.


## 0.4 FORMAT System

FORMAT is the mechanism that makes "one brief, every format" possible. It is NOT a rigid container — it is a sensible starting point that any lower scope can override.

### Range-based definitions (not single points)

Every FORMAT defines RANGES, not fixed values. This is the critical distinction that makes the system robust for real agency use.

```
FORMAT: TikTok {
  target_length: {
    min: 3,            // seconds — TikTok minimum (source: TikTok platform docs 2026)
    max: 600,          // seconds — 10 min in-app recording; up to 60 min uploaded (source: flowshorts.app 2026)
    default: 30,       // seconds — optimized for completion rate
    sweet_spot: [21, 60]  // seconds — 21-34s highest completion, 45-75s algorithm-optimized (source: socialrails.com, retensis.com 2026)
  }
  aspect_ratio: {
    preferred: '9:16',
    accepted: ['9:16', '1:1', '16:9'],
    warning_on: ['16:9']  // vertical has 9x completion rate vs horizontal (source: Snapchat/Kleiner Perkins 2015, widely replicated)
  }
  signal_modifiers: {
    pacing_velocity:        { delta: +0.30, range: [0.6, 1.0] }
    formality:              { delta: -0.20, range: [-0.5, 0.3] }
    humor:                  { delta: +0.10, range: [0.0, 0.8] }
    linguistic_complexity:  { delta: -0.15, range: [0.1, 0.5] }
    hook_urgency:           { value: 0.9 }   // 84.3% of viral TikToks use hook triggers in first 3s; <60% 3s retention = no algo push (source: ttsvibes.com, socialync.io 2026)
    visual_dependency:      { range: [0.3, 0.9] }  // varies by content type
  }
  reading_level_target: 8   // grade 8 — mass audience
}
```

### In-range vs out-of-range overrides

When a user sets a value:
- **Within sweet spot:** Normal adjustment. No warning. System applies it silently.
  - Example: TikTok, user sets duration=30s → within sweet spot, no warning.
- **Within platform range but outside sweet spot:** Informational note.
  - Example: TikTok, user sets duration=120s → valid but "TikTok algorithm favors content under 60s for organic discovery."
- **Outside practical range:** Warning with explanation.
  - Example: TikTok, user sets duration=900s → "15-minute TikToks rarely receive algorithmic distribution. Consider splitting into a series."
- **Contradicts platform requirements:** Hard block with override option.
  - Example: TikTok, user sets reading_level_target=16 → "Academic reading level contradicts TikTok's audience demographics. Override?"

### FORMAT PRESETS (user-created)

Agencies create brand-specific format variants that inherit from platform FORMATs:

```
FORMAT PRESET: "Nike TikTok Challenge" {
  inherits: FORMAT.TikTok,
  overrides: {
    target_length: { default: 15, sweet_spot: [10, 20] },
    pacing_velocity: { delta: +0.40 },  // even faster than TikTok default
    humor: { value: 0.6 },
    cta_type: 'hard',
    enthusiasm: { value: 0.9 },
  }
  // All other TikTok defaults still apply
  // Brand DNA still applies on top of this
}
```

FORMAT PRESETS live at the intersection of BRAND and FORMAT — they are BRAND-SCOPED FORMAT configurations. The cascade becomes: BRAND → CAMPAIGN → FORMAT PRESET (inherits FORMAT) → PROJECT → SCENE. The preset inherits all unoverridden values from its parent FORMAT.


## 0.5 Three-Tier Inference

Users never explicitly set more than 3-5 signals. The system resolves the remaining ~42 through three inference tiers, each with decreasing confidence.

### Tier 1: FORMAT Defaults (~15 signals)

When the user selects a FORMAT (TikTok, LinkedIn, YouTube, email, etc.), the system immediately sets ~15 signal defaults from the FORMAT definition. These are high-confidence defaults grounded in platform-specific best practices.

```
User selects: "TikTok"
System sets:
  pacing_velocity:        0.85  (source: format_default, confidence: 0.9)
  formality:             -0.10  (source: format_default, confidence: 0.9)
  humor:                  0.30  (source: format_default, confidence: 0.7)
  linguistic_complexity:  0.35  (source: format_default, confidence: 0.9)
  reading_level_target:   8     (source: format_default, confidence: 0.95)
  visual_dependency:      0.60  (source: format_default, confidence: 0.8)
  ... ~9 more signals
```

### Tier 2: Brief Extraction via LLM (~6 signals)

A lightweight LLM call (Gemini Flash, ~200ms) reads the brief text and extracts explicitly or implicitly stated signals. This is EXTRACTION, not generation — the LLM reads what the user wrote and maps it to signal values.

```
Brief: "30-second TikTok ad for artisanal coffee brand targeting millennials.
        Warm, authentic tone. Show the brewing process. End with shop location."

LLM extracts:
  warmth:                 0.75  (source: brief_extraction, confidence: 0.85)
  ethos_load:             0.60  (source: brief_extraction, confidence: 0.70)
  show_tell_ratio:        0.70  (source: brief_extraction, confidence: 0.80)
  target_length:          30s   (source: brief_extraction, confidence: 1.0)
  cta_type:               'soft' (source: brief_extraction, confidence: 0.75)
  visual_dependency:      0.70  (source: brief_extraction, confidence: 0.75)
  // overrides TikTok default of 0.60 because brief says "show the process"
```

### Tier 3: Smart Defaults (~26 signals)

Remaining unset signals get domain-aware defaults. These are NOT random middle values — they are derived from signal correlations and content-domain knowledge.

```
Unset signals filled:
  logos_load:             0.20  (smart_default: ad + warmth → low data density)
  pathos_load:            0.55  (smart_default: artisanal + warmth → moderate emotion)
  kairos_pressure:        0.30  (smart_default: brand ad, not limited offer)
  bloom_level:            'understand'  (smart_default: ad → audience understands, doesn't analyze)
  negative_space:         0.40  (smart_default: 30s → moderate breathing room)
  ... ~21 more signals
```

Smart defaults use documented heuristics:
- Correlation pairs: if warmth is high and formality is unset, formality defaults low (correlated)
- Format implications: tutorial → education_intent defaults high; ad → persuasion defaults high
- Duration implications: <30s → low negative_space; >5min → high negative_space
- Platform implications: LinkedIn → ethos_load defaults higher than TikTok

### Confidence tracking

Every signal carries its inference source and confidence level. This serves three purposes:
1. **UI transparency:** Users see which signals the system set vs which they set.
2. **Learning weight:** Thompson Sampling weighs high-confidence signals more than guesses.
3. **Override awareness:** Low-confidence defaults invite user adjustment; high-confidence defaults suggest the system knows what it's doing.

```
Confidence levels:
  1.0:    User explicitly set this value
  0.9:    FORMAT default for this specific platform (well-established best practice)
  0.85:   Extracted from brief text with high clarity
  0.7-0.8: Extracted from brief text with moderate clarity
  0.6:    Smart default from strong correlation
  0.4-0.5: Smart default from weak correlation or domain heuristic
  0.2:    Cold-start fallback (no signal data available)
```

### [COLD_START_FALLBACK] When inference fails

In rare cases where no signals are available (no brief, no format, no brand), these conservative fallback values are used. They are intentionally neutral.

```
Fallback values (used ONLY when ALL three inference tiers fail):
  All numeric signals: 0.5 (midpoint)
  formality: 0.0 (neutral, neither formal nor casual)
  bloom_level: 'understand'
  audience_awareness: 'problem_aware'
  epistemic_stance: 'guide'
  power_dynamic: 'invite'
```

These are NOT content-type presets. There is deliberately ONE fallback, not twelve. The system should compute from signals whenever possible.


## 0.6 Orthogonal Overlays

Three dimensions cross-cut the scope hierarchy. They are not part of the BRAND → SCENE chain — they modify resolved values AFTER cascade resolution.

### AUDIENCE overlay

Same brand + campaign + format but different demographics = different signals. Audience modifies the cascade result with additive deltas.

```
AUDIENCE: "Gen Z athletes" {
  formality:    { delta: -0.30 }   // more casual
  humor:        { delta: +0.15 }   // more playful
  in_group_signal: { delta: +0.25 } // more tribal/insider language
  enthusiasm:   { delta: +0.20 }   // higher energy
  pacing_velocity: { delta: +0.15 } // faster
}
```

Audience overlays are optional. When set, they apply to the entire project (or can be scoped to specific scenes for multi-audience content).

**Audience evolution:** Audience profiles are NOT static snapshots. The audience's relationship to the brand changes over time — what was edgy last quarter is cringe this quarter. When the performance feedback loop is active (see Future Work below), audience signal deltas are refined from actual engagement data. The system should surface drift: "Gen Z athletes responded 23% better to formality=-0.5 than your current -0.3 setting."

### SEGMENT TYPE overlay

Different segment types within one piece have different signal norms. A CTA scene is more urgent than an interview scene, even within the same project.

```
SEGMENT_TYPE: "CTA" {
  kairos_pressure: { delta: +0.30 }
  pacing_velocity: { delta: +0.15 }
  behavioral_utility: { delta: +0.20 }
  certainty: { value: 0.85 }  // CTAs should sound confident
}

SEGMENT_TYPE: "interview" {
  warmth: { delta: +0.15 }
  negative_space: { delta: +0.20 }  // give breathing room
  autonomy_grant: { delta: +0.10 }
}
```

Segment types are auto-tagged when the system detects the scene's purpose. Users can manually reassign. Defaults accumulate across projects — "all CTA scenes for Nike have kairos_pressure: 0.9" becomes a learnable per-brand pattern.

### LANGUAGE overlay

Language is not just a constraint (ISO 639-1 code) — it modifies signal interpretation. Japanese business communication has MUCH higher formality than American English for the same brand voice. Arabic reads right-to-left, which changes visual-verbal relationships.

```
LANGUAGE: "ja" {
  formality: { delta: +0.25 }     // Japanese business = more formal
  certainty: { delta: -0.15 }     // hedging is polite in Japanese
  power_dynamic: { value: 'invite' }  // direct commands are rude
}

LANGUAGE: "es-MX" {
  warmth: { delta: +0.10 }        // Mexican Spanish = warmer register
  enthusiasm: { delta: +0.10 }
}
```

Language overlays are system-provided (not user-created). They encode cross-cultural communication norms. The system activates them automatically when the project's language constraint is set.

### Overlay merge precedence

When multiple overlays compete for the same signal:

```
Resolution order (highest priority first):
1. User-explicit override at any scope level
2. Campaign lock (absolute, cannot be overridden)
3. AUDIENCE overlay (deliberate creative choice)
4. SEGMENT_TYPE overlay (structural, content-driven)
5. LANGUAGE overlay (cultural norm, least creative)
6. Cascade-resolved value (from scope hierarchy)
```

All applied overlays are recorded in `_inference_metadata` for full provenance tracking. The UI shows a resolution chain for any signal — users can trace exactly why a signal has a specific value.


## 0.7 Transition Model

When scope changes (scene-to-scene, act-to-act), signals don't always jump instantly. The transition model defines how signals move between scopes.

```
ScopeTransition {
  // Which signals reset to the new scope's values (hard boundaries)
  resets: SignalKey[]
  // Which signals blend gradually (soft boundaries)
  deltas: {
    [signalKey: string]: {
      shift: number,          // additive delta, clamped to signal range
      blendDurationMs: number,  // over how long the transition occurs
      easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out',
    }
  }
  // Transition style (affects writing technique selection at the boundary)
  style: 'hard_cut' | 'bridge' | 'callback_bridge' | 'question_bridge' | 'tonal_shift' | 'contradiction'
  // How much of the next scope's duration the transition occupies
  rate: number   // 0-1, typically 0.05-0.15 (5-15% of next scope)
}
```

### Transition styles and their effects on writing (12 types)

**hard_cut** — abrupt topic/tone shift. No bridging sentence. Used for pattern breaks and structural surprise.

**bridge** — connective sentence or phrase linking two scopes. The default for most transitions.

**callback_bridge** — references earlier content to connect forward. Creates narrative coherence across distance.

**question_bridge** — poses a question that the next scope answers. Natural curiosity driver.

**tonal_shift** — deliberately changes register. The writing acknowledges the shift. Used for intentional Moments (Part 3).

**contradiction** — next scope deliberately contradicts or subverts the previous. High-impact, use sparingly. Maps to multimodal_counterpoint in video scripts.

**nested_reveal** — the transition sentence IS the content. The connective carries the key insight, not just the bridge. Common in persuasive writing where the turn is the point.

**emotional_reset** — deliberately deflates intensity before rebuilding. Not a tonal shift (tone stays the same), only intensity resets. Comedy uses this constantly: big laugh → quiet moment → bigger laugh.

**parallel_cut** — alternates between two threads that converge. Documentary and journalism staple. Structural interleave, not a bridge — both threads carry simultaneously until they merge.

**the_drop** — removes all ornamentation, switches to simple direct language for emphasis. After elaborate prose, one short declarative sentence. Texture shift, not tone shift.

**associative_leap** — connects ideas through metaphor or shared sensory property rather than logical progression. The connection is emotional/sensory, not logical. Poetry and advertising use this heavily.

**the_withhold** — ends a section with an unanswered question or incomplete thought, forcing the reader forward. Unlike question_bridge, the question is implicit, not stated. Creates tension through absence.


## 0.8 Authority Matrix

What the system decides, what it suggests, what the user decides.

### Override Principle

Every decision the system makes is manually overridable. Changing one decision does not break others. The automatic car model: auto mode drives, but the human can grab the wheel at any point without crashing.

- Signal values? User can adjust any signal at any scope level.
- Technique selection? User can disable specific techniques ("no questions as hooks").
- Voice Signature? User can override any extracted pattern.
- FORMAT defaults? User can override any platform default.
- Scope structure? User can add/remove acts, reassign segment types.
- Any individual writing decision? User can rewrite one sentence without re-running the pipeline.

Every override gets logged as a learning signal. "User always overrides formality higher for Nike LinkedIn" → system adjusts future defaults.

### Authority Levels

**System DECIDES (always automatic):**
- Platform character limits enforcement [overridable via explicit bypass]
- Reading level compliance (if regulatory_profile set) [not overridable]
- Kill list enforcement (banned words from Brand DNA) [overridable only by brand admin]
- Language grammar and spelling [overridable]
- Signal cascade resolution [not overridable — it's math]
- FORMAT range validation (warnings for out-of-range) [overridable]

**System SUGGESTS (auto mode applies, manual mode presents options with reasoning):**
- All 47 signal values (via 3-tier inference)
- Writing technique selection (via sparse activation from Part 4)
- Hook type and style (system presents ranked options — the hook is the most important creative decision in short-form, so the system suggests with reasoning, not auto-selects)
- CTA placement and intensity
- Scene/segment boundaries
- Transition styles between scenes
- Narration density (from visual_dependency + show_tell_ratio)

**User DECIDES (never automated without explicit instruction):**
- Brand voice identity and evolution
- Content structure (PAS, AIDA, Sparkline, etc.) — structure IS the creative idea, not a technique optimization. System presents options with reasoning; user chooses.
- Narrative angle and story
- What claims to make about the product/service
- Target audience definition
- Which platforms to target
- Campaign strategy and positioning
- Whether to override system suggestions
- Editorial choices in large-format transformations (Path B with transformation_magnitude = large)

**NEVER automated (liability risk):**
- Legal claims about product performance
- Regulatory disclosures (system flags where they're needed, human writes them)
- Competitor comparisons
- Pricing and promotional claims
- Medical, financial, or legal advice
- Testimonial fabrication (all testimonials must be sourced)

### Content Text Sources

On-screen text, quotes, statistics, and claims follow a strict sourcing hierarchy:

```
Priority 1: User's brief / brand guidelines (explicitly provided text)
Priority 2: Brand DNA knowledge base (approved messaging, taglines, value props)
Priority 3: Extracted from reference materials (user-uploaded docs, previous content)

NEVER: AI-generated claims, statistics, or testimonials not sourced from user-provided materials.
If the user didn't provide it, the system doesn't claim it.
```

## 0.9 Variant Branches (A/B Testing)

When an agency wants to test two versions of the same content (e.g., humor=0.7 vs humor=0.3), the system supports VARIANT BRANCHES — forking a project at the signal level.

```
VariantBranch {
  baseProjectId:    string          // the source project
  variantName:      string          // "High humor" / "Low humor"
  signalOverrides:  Partial<CreativeSignals>  // only the signals that differ
  // Everything else (brand, campaign, format, voice) inherited from base
}
```

Variant branches share the same base project. They differ only in the explicitly overridden signals. When performance data arrives (engagement, completion rate, shares), the system maps it back to the signal delta between variants, building empirical evidence for signal-performance relationships.

This is deferred to post-V1 but architecturally supported: a variant branch is just a PROJECT-scope override set with a pointer to its parent.


## 0.10 Competitive Context (Deferred)

Real writing exists in a competitive field. A Nike ad is written knowing what Adidas, New Balance, and On Running just published. The signal profile of content is partly defined by category norms — you are either conforming or deliberately violating them.

Future capability: COMPETITIVE overlay — an orthogonal dimension (like AUDIENCE) that modifies signals based on category positioning:

```
COMPETITIVE: "differentiate" {
  // Shift signals AWAY from detected category norms
  // If category average formality = 0.5, push to 0.2 or 0.8
  strategy: 'differentiate' | 'conform' | 'lead'
}
```

This requires Signal Decomposition as a Service (analyzing competitor content to extract signal profiles) which is a future moat-building feature. Not in V1.


## 0.11 Future Work (Acknowledged, Not Specified)

These capabilities emerged from CEO/Eng/Designer reviews as category-defining features. They are architecturally compatible with Part 0's design but are NOT specified in this document version:

1. **Signal Performance Attribution** — map engagement data back to signal values across 1,000+ pieces. Closes the theory-vs-data gap. This is what transforms the taxonomy from academic framework to empirical production system.

2. **Signal Decomposition as a Service** — third parties submit content, system decomposes it into a 47-signal profile. Enables competitive analysis, brand onboarding ("upload your last 50 pieces, we'll extract your signal DNA"), and industry vocabulary adoption.

3. **Real-time Signal Mixing Board** — drag a formality fader, watch the content preview shift in real-time. The UI that makes the signal system tangible and addictive. Every creative director who touches it understands immediately why signals matter.

4. **Brand Timeline View** — signal trajectories over time. How the brand's voice has evolved across quarters. Drift detection: "Your formality has decreased 15% over 6 months — intentional?"

These features compound: performance attribution feeds back into FORMAT defaults and audience overlays. Decomposition enables competitive context. The mixing board makes the system accessible to non-technical creatives. Together they create a 3-5 year moat no competitor can replicate quickly.

---

*End of Part 0 — Content Intent Schema*

---

# PART 1 — VOICE & BRAND SYSTEM

Pipeline stage: Brand Studio (setup) + ThinkForge Agent Pipeline (runtime injection)
When: Brand setup is once per brand. Runtime injection happens on every project, every agent call.
Purpose: Make project #50 sound like the brand without the user specifying anything.

Voice is the hardest thing to formalize. Two writers with identical signal profiles produce different writing. Signals describe the SPACE. Voice Signature describes the FINGERPRINT within that space. This Part defines how the system captures, stores, and applies brand identity below signal resolution.

## 1.0 Voice Signature — Three-Layer Architecture

A single-layer voice model fails. Storing just word frequencies produces UNCANNY VALLEY voice — statistics are right but the music is wrong. Three layers, each catching what the others miss:

```
Layer 1: RULEBOOK        — deterministic, zero LLM, prevents catastrophic violations
Layer 2: FINGERPRINT     — statistical, extracted from samples, nudges properties
Layer 3: EXEMPLARS       — retrieval-augmented, captures the intangible "sounds like us"
```

### Layer 1: Explicit Brand DNA Rulebook (user-provided, deterministic)

Hard rules the brand CAN articulate about its own voice. Enforced without an LLM. Zero ambiguity. Zero false negatives.

```
BrandRulebook {
  // --- Vocabulary (3-tier hierarchy, not binary) ---
  vocabulary: {
    banned: string[]               // NEVER appear — deterministic string match, zero tolerance
                                   // e.g., ["utilize", "leverage", "synergy", "circle back"]
    preferred: {                   // USE THESE over alternatives — system nudges, not enforces
      [preferred: string]: string[]  // preferred term → alternatives it replaces
    }                              // e.g., { "customers": ["users", "clients"], "MacBook Pro": ["laptop", "Macbook pro"] }
    acceptable: string[]           // OK in informal contexts — no nudge, no ban
                                   // e.g., ["users" is acceptable in developer docs but not in marketing]
  }

  // --- Tone guardrails (BOUNDS, not values) ---
  tone_guardrails: {
    formality: { min: number, max: number }
    humor: { min: number, max: number }
    warmth: { min: number, max: number }
  }

  // --- Structural rules (explicit do/don't) ---
  structural_rules: string[]       // e.g., ["Never open with a question", "Max 3 sentences per paragraph",
                                   //        "Always end with action verb", "No parenthetical asides"]

  // --- Pronoun policy ---
  pronoun_policy: 'we' | 'you' | 'they' | 'mixed'

  // --- Inclusive language guidelines ---
  inclusive_language?: {
    gender_neutral: boolean        // use they/them for unknown gender
    person_first: boolean          // "person with a disability" not "disabled person"
    cultural_sensitivity: string[] // specific terms to handle carefully
  }

  // --- Competitive framing ---
  competitor_policy?: {
    mention_by_name: 'never' | 'comparison_only' | 'unrestricted'
    comparison_format: 'chart' | 'prose' | 'none'
    banned_competitor_claims: string[]  // e.g., ["never claim we are cheaper than X"]
  }

  // --- Grammar stance ---
  grammar?: {
    oxford_comma: boolean
    sentence_fragments_ok: boolean
    preferred_dash: 'em' | 'en'
    contractions_ok: boolean       // "don't" vs "do not"
  }
}
```

**Field name mapping (for implementers):** This doc uses descriptive names. The Eng review TypeScript interfaces use shorter names. Canonical mapping:
- `vocabulary.banned` = Eng review `bannedVocab`
- `vocabulary.preferred` keys = Eng review `preferredVocab`
- `tone_guardrails.formality` = Eng review `toneGuardrails`
- `structural_rules` = Eng review `structuralRules`

**How it enters the pipeline:** Injected as hard constraints into every agent prompt. Kill list violations are caught post-generation by deterministic string matching — no LLM needed. Structural rules become prompt instructions. Tone guardrails become signal range clamps.

**When it fails:** When the brand voice has subtleties the owner cannot articulate. "Don't be too corporate" is not a rule — it's a vibe. Layer 2 handles vibes.

### Layer 2: Extracted Voice Fingerprint (system-derived, statistical)

Given 20-50 approved reference pieces (uploaded during setup or accumulated via Phase B passive growth), the system extracts measurable patterns. The user does NOT write this — the system computes it. Note: 20-50 pieces are the INPUT for statistical extraction. The Layer 3 exemplar store (below) holds a CURATED 5-10 pieces — these are different concepts. Extraction uses volume; exemplars use quality.

```
VoiceFingerprint {
  // Lexical patterns
  topBigrams:             [string, number][]  // top 20 characteristic word pairs + frequency
                                               // e.g., [["here's the thing", 0.04], ["the reality is", 0.03]]
  avgWordsPerSentence:    number               // measured from reference corpus
  sentenceLengthVariance: number               // low = metronomic, high = varied rhythm
  passiveVoiceRatio:      number               // 0-1, measured from reference corpus
  questionFrequency:      number               // questions per 100 sentences
  punctuationProfile:     Record<string, number>  // comma, dash, semicolon, ellipsis, exclamation frequency

  // Structural patterns
  sentenceRhythm:         SentenceLength[]     // typical cadence: ["short", "short", "long", "medium"]
  paragraphPattern:       string[]             // idea sequencing: ["topic", "evidence", "turn", "landing"]
  openingPattern:         OpeningPattern        // how pieces typically start
  transitionStyle:        TransitionStyle       // how ideas connect
  closingPattern:         ClosingPattern        // how pieces typically end
  listStyle:              ListStyle             // numbered | bulleted | inline | none
}

type SentenceLength = 'fragment' | 'short' | 'medium' | 'long'
type OpeningPattern = 'question' | 'statistic' | 'story' | 'provocation' | 'scene_set' | 'direct_claim'
type TransitionStyle = 'conjunction' | 'implicit' | 'question_bridge' | 'callback' | 'tonal_shift'
type ClosingPattern = 'cta' | 'callback_open' | 'reframe' | 'cliffhanger' | 'landing'
type ListStyle = 'numbered' | 'bulleted' | 'inline' | 'none'
```

**How it enters the pipeline:** Serialized as XML in the agent prompt (~100 tokens). The LLM uses it as style guidance — "write sentences averaging 14 words with high variance, prefer dashes over semicolons, open with provocations."

**Token budget:** ~100 tokens for the structured fingerprint data. Well within the ~200 token total budget for voice context (0.8% of a 20K token prompt).

**When it fails:** When the brand voice has qualities that statistics cannot capture. Two pieces with identical word frequencies, identical sentence lengths, and identical paragraph structures can sound completely different because voice lives in the SEQUENCE — which words follow which other words, where the emphatic word lands, how qualifiers are used. Layer 3 handles sequence.

### Layer 3: Voice Exemplars (signal-aware retrieval, few-shot)

5-10 approved reference pieces stored as literal text. NOT included in every prompt (that would cost 3,750+ tokens). Instead, retrieved SELECTIVELY based on signal similarity to the current project.

```
VoiceExemplarStore {
  exemplars: {
    id:               string
    text:             string          // max 500 words per exemplar
    signalProfile:    Partial<CreativeSignals>  // the 47-signal profile of this specific piece
    contentType:      string          // what kind of content this exemplar represents
    pinned:           boolean         // "always include this one" — user override
    weight:           number          // influence weight, adjustable by user (default 1.0)
  }[]
}
```

**How it enters the pipeline:** When generating a new piece, the system:
1. Computes the target ContentSignalProfile (from Part 0 cascade)
2. Finds the 2-3 exemplars with the closest signal profiles (cosine similarity on the 47-signal vector)
3. Injects them as few-shot examples in the agent prompt
4. The LLM pattern-matches on the exemplars' style — capturing the rhythm, cadence, and "feel" that statistics miss

**Why signal-aware retrieval matters:** Random exemplar selection is what Jasper and Copy.ai do. If your brand writes both formal whitepapers and casual TikTok scripts, randomly selecting a whitepaper as a few-shot for TikTok generation produces garbage. Signal-aware selection matches exemplars to the current content's signal profile — the system retrieves the right voice for the right context.

**When it fails:** When no exemplar exists for the current signal region. A brand's first TikTok has no TikTok exemplars to retrieve. The system falls back to Layers 1 + 2 only, and flags: "No voice exemplars match this content type. Output may not perfectly match brand voice."

### Three layers combined — the runtime pipeline

```
For every agent call:
  1. Load BrandRulebook (Layer 1) → inject as hard constraints
  2. Load VoiceFingerprint (Layer 2) → inject as style guidance XML (~100 tokens)
  3. Retrieve 2-3 VoiceExemplars (Layer 3) → inject as few-shot context (~400 tokens)
  4. Agent writes content within all three layers of constraint

Post-generation:
  5. Kill list check (Layer 1) → deterministic string match, no LLM
  6. Fingerprint drift check (Layer 2) → measure output's sentence length, vocabulary tier, rhythm
     If drift > threshold: flag "This output is 20% more formal than your brand voice"
  7. Update VoiceFingerprint passively (Layer 2) → every approved piece refines the statistical model
```

**Total runtime token cost:** ~200 tokens for Layer 1 rules + Layer 2 fingerprint. ~400 tokens for Layer 3 exemplars (2-3 excerpts). Total: ~600 tokens = 3% of a 20K prompt budget. Acceptable.


## 1.1 Brand DNA Structure

Brand DNA is the persistent identity that outlives every campaign, format, and project. It lives at the TOP of the scope hierarchy (Part 0, section 0.2).

```
BrandDNA {
  // Identity
  id:                   string
  name:                 string          // "Nike", "Patagonia", "McDonald's"
  version:              number          // increments on every DNA change
  updatedAt:            Date

  // Voice Signature (reference to separate collection — NOT embedded)
  // The VoiceSignature has its OWN version tracking (independent of BrandDNA version)
  // because passive learning updates the fingerprint without changing brand DNA.
  voiceSignatureId:     string          // reference to VoiceSignature collection

  // --- PERSONA VARIANTS (multi-voice brands) ---
  // A brand may have multiple voices: social media, investor relations, support, recruitment.
  // Each persona has its own VoiceSignature + context-dependent activation.
  // The DEFAULT persona (no persona specified) uses the root voiceSignatureId above.
  personas?: {
    id:                 string
    name:               string          // "Social Media Voice", "Corporate Voice", "Support Voice"
    voiceSignatureId:   string          // separate VoiceSignature for this persona
    activationContext:  PersonaContext   // when this persona activates
    signalOverrides?:   Partial<CreativeSignals>  // persona-specific signal adjustments
  }[]

  // --- VOICE SITUATIONS (how the brand handles specific communicative contexts) ---
  // Not personas (who is talking) but situations (what are they talking about).
  // Same persona may handle multiple situations differently.
  voiceSituations?: {
    situation:          VoiceSituation
    toneShift:          Partial<CreativeSignals>   // signal adjustments for this situation
    structuralOverride?: string[]                  // structural rules specific to this situation
  }[]

  // Signal Baseline — the brand's "home" signal values
  signalBaseline:       Partial<CreativeSignals>   // only signals the brand explicitly anchors
  signalLocks:          SignalKey[]     // which signals are LOCKED (cannot be overridden below)

  // Brand Rulebook (Layer 1 of Voice Signature — embedded because it's small)
  rulebook:             BrandRulebook

  // Visual Identity (consumed by Editron, referenced by ThinkForge for visual_dependency signals)
  visualIdentity?: {
    primaryColors:      string[]
    typography:         string
    imageStyle:         string          // "warm editorial" | "clean minimal" | "bold graphic"
  }

  // Sonic Identity (consumed by Editron BGM/SFX, referenced by ThinkForge for audio direction)
  sonicIdentity?: {
    musicMood:          string
    tempoRange:         [number, number]
    instrumentPrefs:    string[]
  }

  // Performance Attribution (Future — populated by Signal Performance Attribution system)
  performanceCorrelations?: {
    [signalKey: string]: {
      engagementCorrelation: number    // -1 to +1
      sampleSize:            number
      lastUpdated:           Date
    }
  }

  // Metadata
  createdBy:            string          // user who created this brand
  teamMembers:          string[]        // users who can modify this brand DNA
  projectCount:         number          // how many projects have used this brand
}

// Persona activation contexts — WHEN does this persona's voice activate?
type PersonaContext =
  | 'social_media'       // TikTok, Instagram, Twitter
  | 'corporate'          // whitepapers, press releases, investor comms
  | 'support'            // help docs, FAQs, customer service
  | 'recruitment'        // careers page, job postings, employer brand
  | 'internal'           // team comms, memos, Slack
  | 'partner'            // co-branding, channel partner materials

// Voice situations — WHAT is the brand communicating about?
type VoiceSituation =
  | 'announcing'         // new product, feature, partnership
  | 'apologizing'        // outage, mistake, recall
  | 'educating'          // how-to, tutorial, explainer
  | 'celebrating'        // milestone, award, community achievement
  | 'defending'          // responding to criticism, competitive attack
  | 'crisis'             // PR crisis — clarity and legal precision override voice
```

### Persona vs Situation vs FORMAT

These three dimensions are orthogonal:
- **FORMAT** = platform mechanics (TikTok duration, LinkedIn char count)
- **Persona** = WHO is talking (social media voice vs corporate voice)
- **Situation** = WHAT they're talking about (announcing vs apologizing)

A single piece of content has ONE format, ONE persona, and ONE situation. Example: Nike posting an apology on Twitter uses FORMAT=social_post (Twitter), Persona=social_media, Situation=apologizing. Each dimension contributes its own signal adjustments, resolved via the cascade.

### Brand DNA versioning

Every change to Brand DNA creates a new version. Projects PIN to the version they were created under — so a project from Q1 uses Q1 brand DNA even if the brand evolves in Q2.

```
Version history enables:
  - "Show me how our voice changed over the last year"
  - "This project used v3 of the brand DNA — revert to v3 to reproduce it"
  - "Compare v4 and v5 — what signals changed?"
  - Drift detection: "Your formality has decreased 15% across 6 versions — intentional?"
```

Version history is stored as a changelog (not full snapshots) — each version records only the delta from the previous version. This keeps storage proportional to changes, not to total brand complexity.


## 1.2 FORMAT PRESETS

FORMAT PRESETS are brand-scoped format variants. They inherit from system-managed platform FORMATs (Part 0, section 0.4) but add brand-specific constraints.

```
FormatPreset {
  id:                   string
  brandId:              string          // which brand owns this preset
  name:                 string          // "Nike TikTok Challenge", "Patagonia Long-form"
  inheritsFrom:         string          // platform FORMAT ID: "tiktok", "linkedin", "youtube", etc.

  // Overrides — only the signals that differ from the parent FORMAT
  signalOverrides:      Partial<CreativeSignals>
  constraintOverrides:  Partial<ContentConstraints>

  // Preset-specific rules
  defaultSegmentTypes:  string[]        // e.g., ["hook", "product_shot", "CTA"] for a 15s challenge format
  defaultStructure?:    string          // e.g., "hook_value_cta" — suggested content structure
  defaultBriefTemplate?: string         // pre-filled brief structure for this preset
                                        // e.g., "Challenge mechanic: ___, Hero product: ___, Key hashtag: ___"
                                        // Reduces 70% of brief writing for repeat format types

  // Guardrail relationship
  exceedsBrandGuardrails: boolean       // if true, this preset was explicitly approved to operate outside
                                        // the brand's tone_guardrails (e.g., a formal whitepaper preset
                                        // for a normally casual brand). Requires brand-admin approval.
  guardrailApproval?: {                 // audit trail when exceedsBrandGuardrails = true
    approvedBy:         string
    approvedAt:         Date
    reason:             string          // "Whitepapers require higher formality than our social voice"
  }

  // Learning
  projectCount:         number          // how many projects have used this preset
  avgQualityScore?:     number          // average quality across projects using this preset
  performanceMetrics?:  Record<string, number>  // platform-specific KPIs: completion_rate, ctr, shares, etc.
  lastUsed:             Date
  status:               'active' | 'declining' | 'retired'  // formats go stale — flag when performance drops
}
```

### How FORMAT PRESETS interact with the cascade

```
Resolution order:
  1. BRAND DNA signal baseline
  2. CAMPAIGN overrides (if any)
  3. FORMAT PRESET overrides (inherits from PLATFORM FORMAT for unset signals)
  4. PROJECT overrides
  5. SCENE overrides
```

The preset inherits ALL unoverridden values from its parent FORMAT. If TikTok FORMAT defines 15 signal modifiers and the preset overrides 3 of them, the other 12 still apply.

### Preset creation and learning

**Manual creation:** User creates a preset in Brand Studio, names it, sets overrides. Takes 2 minutes.

**Automatic suggestion:** After 5+ projects with similar FORMAT overrides, the system suggests: "You've overridden pacing_velocity, humor, and duration on your last 7 TikTok projects. Want to save this as a preset?"

**Learning from usage:** Presets accumulate quality data. If "Nike TikTok Challenge" consistently scores higher than "Nike TikTok Tutorial," the system surfaces this: "Your Challenge preset outperforms your Tutorial preset by 23% on completion rate."

⚠️ The 23% figure above is a hypothetical example illustrating what the system would display, not a claimed statistic.


## 1.3 Voice Signature Setup Flow

Voice Signature builds progressively. There is NO bulk-upload wall — nobody will upload 50 documents on day one. The system builds confidence over time.

### Phase A — "Seed" (required, ~2 minutes)

User pastes or uploads 1-3 reference samples (scripts, blog posts, ad copy — whatever they write most). The system extracts an initial fingerprint and presents it as a readable card:

```
EXTRACTED VOICE PROFILE:
  Tone:       Conversational, warm
  Sentences:  Short-medium (avg 12 words), high variance
  Opens with: Questions (60%) or provocations (30%)
  Closes with: CTAs (70%) or callback to opening (20%)
  Avoids:     Jargon, passive voice
  Distinctive: Heavy dash usage, frequent "here's the thing" lead-ins
  Confidence: 35% (need more samples for reliable extraction)
```

Each trait is adjustable. User can nudge "Conversational" toward "Formal" or accept all. This takes 30 seconds after the extraction.

### Phase B — "Grow" (selective, ongoing)

Every script the user writes or approves in ThinkForge CAN feed back into the voice model — but not all pieces SHOULD. Brand voice is not the average of everything produced; it is the standard set by the best work.

**Canonical vs Expedient distinction:** When a user approves a piece, the system offers two options:
- **"This represents our voice"** (canonical) — full weight in fingerprint extraction and exemplar candidacy
- **"Good enough for the deadline"** (expedient) — excluded from voice training. Still counts for project metrics.

Without this distinction, Phase B trains on compromise and converges on mediocrity — the exact voice quality that makes AI-generated content feel like AI-generated content.

```
After 3 canonical projects:   Confidence 45% — basic rhythm and vocabulary captured
After 10 canonical projects:  Confidence 70% — structural patterns emerging
After 25 canonical projects:  Confidence 85% — reliable voice matching
After 50 canonical projects:  Confidence 95% — full voice fidelity, exemplar library rich
```

⚠️ These confidence thresholds are engineering estimates, not empirical measurements. Actual thresholds should be calibrated from real usage data. Confidence is tracked per-persona and per-language, not globally — a brand may have 90% confidence for LinkedIn English but 30% for TikTok Japanese.

A "Voice confidence: 63%" indicator in Brand Studio shows progress. After confidence reaches 85%+, the indicator turns gold.

**Active drift monitoring:** The system does not only check drift per-output (post-generation, step 6 in the runtime pipeline). It also runs periodic analysis: "Your last 20 projects have drifted 18% more formal than your brand baseline." When drift is detected, the system surfaces it in Brand Studio with context: "This drift correlates with Campaign X — your non-campaign content is stable." This is the trigger for Phase C refinement — not the user deciding to go into advanced settings, but the system detecting that attention is needed.

### Phase C — "Refine" (optional, expert mode)

In Brand Studio, the full Voice Signature editor exposes:
- Radar chart showing 6-8 voice dimensions (formality, rhythm, vocabulary tier, pronoun use, rhetorical devices, structural patterns)
- Each axis adjustable
- Reference samples listed with their influence weight
- Users can pin samples ("always reference this") or exclude them ("this was off-brand")
- Side-by-side comparison: "Your current voice" vs "Output from last 5 projects" — showing drift

Phase C is hidden from 90% of users (progressive disclosure, per Designer review). Only visible in Brand Studio under an "Advanced Voice" section.


## 1.4 Voice Signature Merge Rules

When Brand DNA and Campaign both have voice-related settings, they merge according to these rules:

```
MERGE SEMANTICS:
  bannedVocab:         UNION (brand bans + campaign bans = all bans. Brand bans are absolute.)
  mustUseVocab:        UNION (campaign adds to brand vocabulary, never replaces)
  toneGuardrails:      INTERSECTION (campaign narrows the range, never widens)
  structuralRules:     UNION (campaign adds rules, never removes brand rules)
  pronounPolicy:       CAMPAIGN overrides if explicitly set
  sentenceRhythm:      CAMPAIGN overrides if explicitly set
  openingPattern:      CAMPAIGN overrides if explicitly set
  closingPattern:      CAMPAIGN overrides if explicitly set

CONFLICT RESOLUTION:
  If campaign must-use vocabulary contains a brand banned word → ERROR, flagged in Brand Studio
  If campaign tone guardrails exceed brand guardrails → CLAMPED to brand range + warning
  If campaign structural rule contradicts brand rule → brand rule wins + warning
```

**Kill list is inviolable.** If Nike's brand DNA bans "cheap" and the Black Friday campaign wants to use "cheap deals," the brand DNA wins. The campaign manager must request a brand-level kill list exception, which is versioned and auditable.


## 1.5 Regulatory Profiles

Certain industries have compliance constraints that override ALL creative signals. These are not suggestions — they are legal requirements.

```
RegulatoryProfile {
  id:                   RegulatoryIndustry
  jurisdiction:         string          // e.g., "US-FDA", "EU-EMA", "UK-ASA", "JP-PMDA", "global"
                                        // Pharma in US (FDA) ≠ pharma in EU (EMA) ≠ pharma in UK
                                        // Direct-to-consumer pharma ads are legal in US, BANNED in UK

  // Hard rules — CANNOT be overridden by any signal, override, or pattern break
  requiredDisclosures:  string[]        // e.g., ["Risk disclosure required", "Past performance disclaimer"]
  bannedClaims:         string[]        // e.g., ["No superlatives about returns", "No cure/prevent/treat claims"]
  requiredLanguage:     string[]        // e.g., ["Must use FDA-approved indications only"]
  maxClaims:            number          // e.g., pharma: 1 primary claim per piece
  reviewRequired:       boolean         // must human-review before publishing?

  // Signal constraints — clamp signals to safe ranges
  signalClamps: {
    [signalKey: string]: { max?: number, min?: number }
    // Example clamps per industry:
    // pharma:  humor max 0.2, enthusiasm max 0.5, certainty max 0.7
    // finance: kairos_pressure max 0.3, certainty max 0.6
    // alcohol: enthusiasm max 0.6 (no "party hard" messaging)
  }
}

// Regulatory industry enum — MUST match Part 0 ContentConstraints.regulatory_profile
RegulatoryIndustry =
  | 'pharma'            // FDA, EMA, PMDA rules
  | 'finance'           // SEC, FCA, FINMA rules
  | 'legal'             // bar association advertising rules
  | 'alcohol'           // TTB, ASA age-gate rules
  | 'gambling'          // state/country-specific gambling advertising rules
  | 'food_beverage'     // FTC nutritional claims
  | 'healthcare'        // HIPAA-adjacent (not pharma-specific)
  | 'insurance'         // state insurance commission rules
  | 'crypto'            // rapidly evolving, jurisdiction-dependent

// NOTE: FTC endorsement/testimonial rules apply to ALL industries when content
// includes testimonial-style claims. This is format-triggered, not industry-triggered.
// Part 6 (Writing Constraints) defines the full rule set per profile + jurisdiction.
```

Regulatory profiles activate when `constraints.regulatory_profile` is set in the ContentSignalProfile (Part 0, section 0.1). They sit ABOVE the entire cascade — even campaign locks defer to regulatory requirements. The cascade algorithm in Part 0 should enforce regulatory clamps as Phase 0, before all other resolution phases.

⚠️ Signal clamp values (humor max 0.2 for pharma, etc.) are reasonable engineering defaults, not regulatory-sourced thresholds. Actual values should be validated by compliance professionals per jurisdiction. Part 6 (Writing Constraints) contains the full constraint rules per regulatory profile.


## 1.6 MongoDB Storage Architecture

Voice Signature and Brand DNA have different storage patterns to balance query performance with document size.

```
COLLECTION: brands
  BrandDNA document (embedded)
  Includes: signalBaseline, signalLocks, rulebook, visualIdentity, sonicIdentity
  Size: ~5-10KB per brand
  Query: one findOne loads the complete brand

COLLECTION: voice_signatures (SEPARATE — not embedded in brands)
  VoiceSignature document (has its OWN version + updatedAt, independent of BrandDNA version)
  Passive learning updates this collection without touching brands collection
  Includes: lexical fingerprint, structural patterns, compressedFingerprint
  Size: ~2-3KB per voice signature (without reference samples)
  Linked via: brands.voiceSignatureId → voice_signatures._id

COLLECTION: voice_reference_samples (SEPARATE — not embedded anywhere)
  Reference sample documents
  Includes: full text of 5-10 approved pieces
  Size: ~12-15KB per brand (5 samples × 500 words × ~5 chars/word)
  Linked via: voice_signatures.referenceSampleIds[] → voice_reference_samples._id
  Why separate: keeps brand doc small, allows independent versioning, avoids 16MB MongoDB limit
    for agencies with many brands

COLLECTION: format_presets
  FormatPreset documents
  Includes: signal overrides, constraint overrides, learning data
  Size: ~1-2KB per preset
  Query: find by brandId + inheritsFrom for format selection
```

This separation means:
- Loading a brand for cascade resolution: ONE query (brands collection, ~5KB)
- Loading voice for prompt injection: ONE additional query (voice_signatures, ~2KB)
- Loading exemplars for few-shot: ONE additional query (voice_reference_samples, ~12KB) — only when Layer 3 is active
- Format presets: ONE query filtered by brand + platform

Total for a fully-loaded project: 3 queries, ~20KB. Sub-millisecond on MongoDB Atlas with proper indexes.

---

*End of Part 1 — Voice & Brand System*

---

# PART 2 — BRIEF SIGNAL DICTIONARY

Every measurable property of written content. These are the 47 atomic dimensions that define WHERE content lives in creative space. They do NOT define how to get there — that is Part 4 (Technique Atlas).

Content type is EMERGENT from signal combinations. There is no "video script" cluster or "LinkedIn post" cluster. A Nike video script and a Nike LinkedIn post may differ on only 5-8 signals (pacing, visual_dependency, target_length, linguistic_complexity) while sharing 39 others. The system handles this naturally — no content-type-specific rules.

## 2.0 Signal Entry Format

Each signal follows this structure:

```
Signal: name
  Axis:       which of the 10 axes
  Range:      value type and bounds
  Scope:      GLOBAL | PER_SCENE | TRANSITION
  Inference:  TIER_1 (format default) | TIER_2 (brief extraction) | TIER_3 (smart default)
  CampaignLockable: YES | NO
  Anchors:    behavioral description at 5 levels (0.0, 0.25, 0.5, 0.75, 1.0)
  Grounding:  theoretical source that justifies this signal's existence
  Primary:    YES if included in the 8-10 signal LLM prompt, NO if system-only
```

Signals marked as PRIMARY are injected into the ThinkForge agent prompt. SECONDARY signals are used by the technique selection system (Part 4) but never shown to the LLM — this keeps the prompt focused.

## 2.1 Rhetorical Axis (4 signals)

The classical persuasion modes. Every piece of content has a rhetorical mix — the balance between logic, emotion, and credibility.

```
Signal: logos_load
  Axis:       RHETORICAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable from brief: "data-driven", "backed by research")
  CampaignLockable: NO (content-dependent)
  Anchors:
    0.00: Pure emotion/story — zero data, zero evidence, zero logic
           Example: Nike "Just Do It" brand anthem — feeling IS the message
    0.25: Minimal data — one statistic or fact, mostly narrative
           Example: Charity appeal with "1 in 5 children..." opener then all story
    0.50: Balanced — arguments supported by evidence but wrapped in story
           Example: TED talk mixing personal anecdote with research citations
    0.75: Evidence-led — structure built around data, story as seasoning
           Example: Consulting firm case study: metrics → methodology → results
    1.00: Pure logic — densely evidenced, no emotional appeals
           Example: SEC filing, API documentation, research paper abstract
  Grounding: Aristotle's logos — rational persuasion through logical argument (Rhetoric, ~330 BCE)
  Primary:   YES
```

```
Signal: pathos_load
  Axis:       RHETORICAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "emotional", "inspiring", "heartfelt")
  CampaignLockable: NO
  Anchors:
    0.00: Deliberately unemotional — clinical, procedural, dry by design
           Example: Legal contract, assembly instructions, tax form guidance
    0.25: Light emotional coloring — professional warmth without manipulation
           Example: Corporate annual letter acknowledging team effort
    0.50: Emotionally engaged — genuine feeling woven through substance
           Example: Product launch that connects features to human outcomes
    0.75: Emotion-forward — audience should FEEL before they THINK
           Example: Nonprofit campaign video, memorial tribute, Nike "Dream Crazy"
    1.00: Raw emotional immersion — tears, rage, euphoria, awe
           Example: ASPCA Sarah McLachlan spot, grief memoir, war correspondence, charity: water origin film
  Grounding: Aristotle's pathos — emotional persuasion through audience affect (Rhetoric, ~330 BCE)
  Primary:   YES
```

```
Signal: ethos_load
  Axis:       RHETORICAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable: "authoritative", "expert", "trusted")
  CampaignLockable: YES (brand-governed)
  Anchors:
    0.00: No authority claim — content stands on its own merit
           Example: Anonymous Reddit post, crowdsourced wiki entry
    0.25: Implied credibility — brand reputation does the work, no explicit claims
           Example: Apple product page — authority is assumed, never stated
    0.50: Moderate credentials — occasional references to expertise or track record
           Example: Blog post mentioning "in our 10 years of..." or citing industry experience
    0.75: Credential-forward — expertise is a key persuasion lever
           Example: Doctor explaining a procedure, "as a Stanford researcher..."
    1.00: Authority IS the message — the point is who's saying it
           Example: Expert testimony, peer-reviewed publication, celebrity endorsement
  Grounding: Aristotle's ethos — persuasion through speaker credibility (Rhetoric, ~330 BCE)
  Primary:   YES
```

```
Signal: kairos_pressure
  Axis:       RHETORICAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable: "limited time", "urgent", "act now")
  CampaignLockable: YES (campaign-temporal)
  Anchors:
    0.00: Timeless — no urgency, no expiration, evergreen relevance
           Example: Brand manifesto, educational explainer, origin story
    0.25: Soft relevance — topical but not urgent
           Example: "This season's trends" — relevant now, not panic-inducing
    0.50: Moderate urgency — clear reason to act soon but not immediately
           Example: "Early bird pricing ends this month" — deadline but distant
    0.75: High urgency — specific deadline, clear consequence of inaction
           Example: "48-hour flash sale", "Applications close Friday"
    1.00: Extreme pressure — act NOW or lose permanently
           Example: "Last 3 tickets", "Offer expires at midnight", crisis communications
  Grounding: Aristotle's kairos — the opportune moment for persuasion; Cialdini's scarcity principle
  Primary:   NO (system uses for CTA technique selection)
```

## 2.2 Cognitive Axis (4 signals + 1 derived)

How hard the audience must think. Determines sentence complexity, explanation depth, assumed knowledge, and pacing of new information.

```
Signal: elaboration_demand
  Axis:       COGNITIVE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3 (derived from content complexity + audience expertise)
  CampaignLockable: NO
  Anchors:
    0.00: Zero thinking required — content is consumed passively
           Example: Background music playlist description, ambient video caption
    0.25: Minimal processing — familiar concepts, no new mental models
           Example: Recipe card, simple how-to, motivational quote card
    0.50: Moderate engagement — audience follows an argument or learns something
           Example: Explainer video, product comparison, feature walkthrough
    0.75: Active thinking — audience must connect ideas, apply frameworks
           Example: Strategy whitepaper, investment thesis, complex tutorial
    1.00: Deep cognitive work — audience builds new mental models
           Example: Academic lecture, philosophy essay, systems architecture doc
  Grounding: Petty & Cacioppo's Elaboration Likelihood Model — central vs peripheral processing
  Primary:   NO
```

```
Signal: bloom_level
  Axis:       COGNITIVE
  Range:      enum: remember | understand | apply | analyze | evaluate | create
  Scope:      GLOBAL
  Inference:  TIER_3 (inferred from output_format + brief intent)
  CampaignLockable: NO
  Anchors:
    remember:    Audience recalls facts — "Nike was founded in 1964"
    understand:  Audience grasps meaning — "Nike's direct-to-consumer shift changed retail"
    apply:       Audience uses knowledge — "Here's how to structure your pitch like Nike"
    analyze:     Audience breaks down components — "Why Nike's strategy works: 3 pillars"
    evaluate:    Audience makes judgments — "Is Nike's approach right for YOUR brand?"
    create:      Audience produces something new — "Design your own brand strategy using this framework"
  Grounding: Bloom's revised taxonomy (Anderson & Krathwohl 2001)
  Primary:   NO
```

```
Signal: novelty
  Axis:       COGNITIVE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3 (hard to extract from brief — default 0.5)
  CampaignLockable: NO
  Anchors:
    0.00: Confirming — audience already knows everything; content validates
           Example: Brand ad reinforcing existing perception, company values page
    0.25: Mostly familiar — one new angle on a known topic
           Example: "5 things you didn't know about coffee" (4 are known, 1 is new)
    0.50: Half new — meaningful new information mixed with context-setting
           Example: Product launch with both familiar brand + genuinely new features
    0.75: Mostly new — audience is learning significantly
           Example: First exposure to a new technology, paradigm-shifting research
    1.00: Completely new — audience has no prior framework
           Example: Announcing a category that didn't exist, groundbreaking discovery
  Grounding: Shannon's information theory — surprise as information content
  Primary:   NO
```

```
Signal: abstraction_level
  Axis:       COGNITIVE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3 (inferred from brief + output_format)
  CampaignLockable: NO
  Anchors:
    0.00: Hyper-concrete — specific things, people, places, actions
           Example: "Sarah picked up the 2023 MacBook Air in Midnight and clicked Buy"
    0.25: Mostly concrete — tangible examples with occasional generalization
           Example: Product demo showing specific UI screens and clicks
    0.50: Mixed — concrete examples illustrating abstract principles
           Example: "Innovation means [abstract] — like when we built [concrete example]"
    0.75: Mostly abstract — principles and frameworks with sparse examples
           Example: Strategy document about market positioning
    1.00: Pure abstraction — concepts, theories, universal principles
           Example: "Excellence is the margin between effort and expectation"
  Grounding: Hayakawa's Abstraction Ladder (Language in Thought and Action, 1949)
  Primary:   NO
```

```
DERIVED: cognitive_load = 0.3 * elaboration_demand + 0.25 * abstraction_level + 0.25 * linguistic_complexity + 0.2 * novelty
  Notes: Computed, never set directly. High cognitive_load (>0.7) should trigger shorter sentences,
         more white space, and concrete examples to offset. Part 4 technique selection uses this.
  Grounding: Sweller's Cognitive Load Theory (1988) — intrinsic + extraneous + germane load
```


## 2.3 Emotional Axis (6 signals)

Based on Don Norman's three levels of emotional design (visceral, behavioral, reflective) plus Russell's circumplex model (valence × arousal) and Green & Brock's transportation theory.

```
Signal: visceral_impact
  Axis:       EMOTIONAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: No sensory/gut reaction — purely intellectual content
           Example: Tax filing instructions, API changelog
    0.25: Mild aesthetic appeal — pleasant but not arresting
           Example: Airbnb listing description, cafe menu copy
    0.50: Noticeable impact — audience pauses, reacts physically
           Example: Apple product reveal slow-mo, "shot on iPhone" gallery
    0.75: Strong visceral hit — sharp intake of breath, goosebumps, flinch
           Example: Nike "Dream Crazy" Kaepernick opening, Volvo truck splits Jean-Claude Van Damme
    1.00: Overwhelming — shock, awe, visceral discomfort, can't look away
           Example: Dumb Ways to Die, Thai life insurance ads, "Most Shocking Second a Day" (Save the Children)
  Grounding: Norman's visceral design level (Emotional Design, 2004)
  Primary:   NO
```

```
Signal: behavioral_utility
  Axis:       EMOTIONAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable: "actionable", "how-to", "practical")
  CampaignLockable: NO
  Anchors:
    0.00: Zero actionability — content is for feeling or knowing, not doing
           Example: Brand anthem, origin story, art film
    0.25: Vague inspiration — "you should try this" without specifics
           Example: Motivational LinkedIn post, TED talk closing call-to-action
    0.50: Moderate utility — clear takeaways but audience must figure out details
           Example: "5 strategies for better sleep" — direction without prescription
    0.75: Highly actionable — step-by-step, immediately applicable
           Example: Notion template walkthrough, HubSpot marketing playbook
    1.00: Tool-like — content IS the action (template, checklist, calculator)
           Example: Canva template, ROI calculator landing page, Typeform quiz
  Grounding: Norman's behavioral design level — usability and function satisfaction
  Primary:   NO
```

```
Signal: reflective_depth
  Axis:       EMOTIONAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: No lasting impression — consumed and forgotten
           Example: Product spec sheet, shipping notification, weather update
    0.25: Mild reflection — audience thinks about it briefly after
           Example: Interesting LinkedIn insight, "huh, I didn't know that" blog post
    0.50: Genuine pause — audience reconsiders an assumption or belief
           Example: Patagonia "Don't Buy This Jacket" — rethinks consumption
    0.75: Deep impact — content changes how audience sees a topic
           Example: "An Inconvenient Truth", Dove "Real Beauty Sketches"
    1.00: Worldview shift — audience questions fundamental beliefs
           Example: "13th" documentary, "Pale Blue Dot" (Carl Sagan)
  Grounding: Norman's reflective design level — self-image and meaning-making
  Primary:   NO
```

```
Signal: narrative_transportation
  Axis:       EMOTIONAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Zero immersion — audience fully aware they are reading/watching content
           Example: Terms of service, form instructions, compliance notice
    0.25: Light engagement — audience follows along but mind wanders
           Example: Standard corporate blog, routine newsletter
    0.50: Moderate absorption — audience is engaged, occasionally pulled out
           Example: Good podcast episode, well-written case study
    0.75: Deep immersion — audience loses track of time, emotionally invested
           Example: Serial podcast, Humans of New York stories, long-form New Yorker profile
    1.00: Complete transportation — audience forgets they are consuming media
           Example: "The Bear" opening sequence, Pixar "Up" first 10 minutes, Ira Glass at his best
  Grounding: Green & Brock's transportation theory (2000) — narrative absorption reduces counter-arguing
  Primary:   NO
```

```
Signal: emotional_valence
  Axis:       EMOTIONAL
  Range:      -1.0 to +1.0 (bipolar continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "uplifting" → +, "somber" → -, "urgent" → context-dependent)
  CampaignLockable: YES (brand emotional range)
  Anchors:
    -1.0: Dark, tragic, grief — "We lost everything in the fire"
    -0.5: Somber, serious, concerned — "The numbers are alarming"
     0.0: Neutral — factual, balanced, neither positive nor negative
    +0.5: Warm, hopeful, encouraging — "Things are getting better"
    +1.0: Euphoric, celebratory, triumphant — "We did it! Record-breaking!"
  Grounding: Russell's circumplex model of affect — valence axis (1980)
  Primary:   YES
```

```
Signal: emotional_arousal
  Axis:       EMOTIONAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "high energy", "calm", "intense")
  CampaignLockable: NO
  Anchors:
    0.00: Complete calm — meditative, ASMR, deliberately soporific
    0.25: Low-key — conversational, relaxed, unhurried
    0.50: Engaged — alert and interested, normal presentation energy
    0.75: Intense — elevated heart rate, leaning forward, urgent
           Example: Product launch countdown, competitive sports narration, crisis update
    1.00: Peak arousal — fight-or-flight intensity (loud OR quiet: explosive MrBeast energy AND sustained quiet dread of a cancer diagnosis scene both live here. Arousal ≠ volume.)
           Example: MrBeast "$1 vs $1,000,000" reveal (loud peak), Moonlight diner scene (quiet peak)
  Grounding: Russell's circumplex model — arousal axis, independent of valence
  Primary:   YES
```


## 2.4 Audience Axis (5 signals)

Who the audience is and what they already know. Determines vocabulary level, explanation depth, proof requirements, and how much the content assumes vs explains.

```
Signal: audience_awareness
  Axis:       AUDIENCE
  Range:      enum: unaware | problem_aware | solution_aware | product_aware | most_aware
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable from brief context)
  CampaignLockable: YES (campaign targets a specific awareness level)
  Anchors:
    unaware:        Doesn't know the problem exists — need pattern interrupt
    problem_aware:  Knows the problem, not the solution — need education
    solution_aware: Knows solutions exist, hasn't chosen — need differentiation
    product_aware:  Knows your product, hasn't bought — need conviction
    most_aware:     Existing customer — need retention, upsell, advocacy
  Grounding: Eugene Schwartz's 5 Levels of Awareness (Breakthrough Advertising, 1966)
  Primary:   NO (but drives hook technique selection heavily in Part 4)
```

```
Signal: assumed_expertise
  Axis:       AUDIENCE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable: "beginner-friendly", "for developers", "executive audience")
  CampaignLockable: NO
  Anchors:
    0.00: Zero domain knowledge — explain everything, no jargon
    0.25: Basic familiarity — knows the field exists, needs hand-holding
    0.50: Working knowledge — can follow industry discussion, skip basics
    0.75: Expert — deep domain knowledge, skip to advanced concepts
    1.00: Peer expert — assume complete mastery, use full jargon
  Grounding: Cognitive load theory — extraneous load from unnecessary explanation
  Primary:   NO
```

```
Signal: social_proof_reliance
  Axis:       AUDIENCE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Zero social proof — content stands on logic/emotion alone
    0.25: Light social proof — occasional mention of others ("many companies...")
    0.50: Moderate — testimonials, case studies, or numbers woven in
    0.75: Heavy reliance — "10,000 customers", named brands, specific results
    1.00: Social proof IS the content — entire piece is testimonials/reviews
  Grounding: Cialdini's social proof principle (Influence, 1984)
  Primary:   NO
```

```
Signal: in_group_signal
  Axis:       AUDIENCE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Universal — zero insider references, accessible to anyone
    0.25: Light shared context — occasional reference insiders appreciate
    0.50: Moderate tribalism — "if you know, you know" moments
    0.75: Strong insider language — jargon, references that exclude outsiders
    1.00: Fully tribal — incomprehensible to non-members, deliberately exclusive
  Grounding: Social Identity Theory (Tajfel & Turner 1979) — in-group/out-group bonding through shared language
  Primary:   NO
```

```
Signal: autonomy_grant
  Axis:       AUDIENCE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Full direction — "Do this. Now." No choice offered.
    0.25: Guided — "We recommend this approach" — one option with reason
    0.50: Options — "Here are three approaches, each with tradeoffs"
    0.75: Open — "Consider these factors and decide what's right for you"
    1.00: Full autonomy — "Here's what we know. You take it from here."
  Grounding: Deci & Ryan's Self-Determination Theory (2000) — autonomy as intrinsic motivation driver
  Primary:   NO
```


## 2.5 Structural Axis (3 signals + 1 derived)

How ideas are organized, paced, and sequenced. Determines rhythm, tension, and predictability.

```
Signal: pacing_velocity
  Axis:       STRUCTURAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_1 (FORMAT provides strong default: TikTok 0.85, LinkedIn 0.45)
  CampaignLockable: NO (content-dependent)
  Anchors:
    0.00: Glacial — one idea explored for minutes, long pauses, meditation pace
    0.25: Slow — deliberate, each point gets full development, documentary pace
    0.50: Moderate — conversational flow, natural topic progression
    0.75: Fast — rapid topic transitions, dense information delivery
    1.00: Breakneck — idea every 2-3 seconds, no pause, TikTok/Reels pace
  Grounding: Editing pacing research — cuts/min correlates with perceived energy. Extended to writing via ideas/paragraph density.
  Primary:   YES
```

```
Signal: tension_arc
  Axis:       STRUCTURAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL (describes the piece's overall trajectory)
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Flat — no tension, no buildup, no release. Informational only.
    0.25: Gentle slope — mild curiosity, small question answered at end
    0.50: Standard arc — clear setup, rising action, resolution
    0.75: Strong arc — significant stakes, delayed payoff, emotional investment
    1.00: Extreme tension — cliffhanger, unresolved, audience on edge
  Grounding: Freytag's dramatic structure (Die Technik des Dramas, 1863); Duarte's Sparkline
  Primary:   NO
```

```
Signal: predictability
  Axis:       STRUCTURAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Completely surprising — audience cannot anticipate what comes next
    0.25: Mostly surprising — occasional familiar patterns, mostly unexpected
    0.50: Balanced — familiar structure with surprising content (or vice versa)
    0.75: Mostly predictable — audience knows the shape, enjoys the execution
    1.00: Fully predictable — template content, audience knows exactly what's coming
  Grounding: Information theory — surprise as information content. Predictability is not bad — it reduces cognitive load and builds trust. The question is whether the predictability is intentional.
  Primary:   NO
```

```
Signal: linguistic_complexity
  Axis:       STRUCTURAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_1 (FORMAT default) or TIER_3 (from reading_level_target)
  CampaignLockable: NO
  Anchors:
    0.00: Extremely simple — grade 3-4 level, basic vocabulary, short sentences
    0.25: Simple — grade 6-8, everyday language, clear syntax
    0.50: Moderate — grade 10-12, some complex sentences, standard vocabulary
    0.75: Complex — college level, subordinate clauses, technical vocabulary
    1.00: Highly complex — academic/legal, dense syntax, specialized terminology
  Grounding: Flesch-Kincaid readability formula. Note: reading level as a single number is an imperfect proxy — it captures syntax complexity but not conceptual difficulty. A Hemingway novel scores grade 4-7 on Flesch-Kincaid (varies by analysis method) but is not grade-school content.
  Primary:   NO
```

```
DERIVED: information_density = 0.4 * logos_load + 0.3 * elaboration_demand + 0.3 * abstraction_level
  Notes: Computed. High density (>0.7) needs white space, section breaks, bullet points to be digestible.
  Grounding: Miller's 7±2 channel capacity; Mayer's segmenting principle
```


## 2.6 Voice Axis (9 signals)

How the brand/author sounds. The most subjective axis — and the one that matters most for brand consistency. Expanded from 4 to 9 signals after the scriptwriter review identified that 4 signals cannot distinguish MrBeast from Casey Neistat, Vox from Kurzgesagt, or Nike from Patagonia.

```
Signal: formality
  Axis:       VOICE
  Range:      -1.0 to +1.0 (bipolar continuous)
  Scope:      GLOBAL
  Inference:  TIER_1 (FORMAT default: TikTok -0.3, LinkedIn +0.4)
  CampaignLockable: YES (core brand property)
  Anchors:
    -1.0: Irreverent — slang, broken rules, profanity-adjacent
           Example: Wendy's Twitter roasts, Cards Against Humanity packaging
    -0.5: Casual — conversational, contractions, first-name basis
           Example: Mailchimp emails, Slack notifications
     0.0: Neutral — neither formal nor casual, professional but approachable
           Example: Google blog posts, standard SaaS communications
    +0.5: Formal — proper grammar, measured tone, institutional voice
           Example: McKinsey reports, university communications
    +1.0: High formal — legal precision, ceremonial weight
           Example: Supreme Court opinions, diplomatic communications
  Grounding: NN/g's 4-dimension tone model — formality axis. Merged with original irreverence signal per Eng review.
  Primary:   YES
```

```
Signal: humor
  Axis:       VOICE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "funny", "witty", "playful")
  CampaignLockable: YES
  Anchors:
    0.00: Zero humor — dead serious, no levity of any kind
    0.25: Dry wit — occasional clever phrasing, understated amusement
    0.50: Clearly playful — audience smiles, lighthearted tone throughout
    0.75: Comedy-forward — laughs are a primary goal alongside the message
    1.00: Pure comedy — the joke IS the content
  Grounding: NN/g tone model — humor axis. Humor in writing shares mechanisms with stand-up: setup, misdirection, payoff.
  Primary:   YES
```

```
Signal: enthusiasm
  Axis:       VOICE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "exciting", "energetic", "passionate")
  CampaignLockable: NO
  Anchors:
    0.00: Flat affect — deliberately monotone, matter-of-fact
    0.25: Measured — controlled energy, professional composure
    0.50: Warm engagement — genuine interest without over-excitement
    0.75: Energetic — exclamation marks earned, audible smile
    1.00: Explosive — MrBeast energy, ALL CAPS justified, maximum hype
  Grounding: NN/g tone model — enthusiasm axis
  Primary:   YES
```

```
Signal: warmth
  Axis:       VOICE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable: "warm", "friendly", "approachable", "personal")
  CampaignLockable: YES (core brand property)
  Anchors:
    0.00: Cold professional — deliberate distance, institution speaking
           Example: Law firm client letter, IRS notice
    0.25: Polite distance — courteous but impersonal
           Example: Standard corporate communications
    0.50: Approachable — "we're people too" with professional boundaries
           Example: Salesforce blog, Notion documentation
    0.75: Warm — personal, empathetic, mentor-like
           Example: Headspace copy, Patagonia essays
    1.00: Intimate — feels like a close friend talking to you
           Example: Personal newsletter, handwritten founder letter
  Grounding: Scriptwriter review — distinguishes cold professional (law firm) from warm mentor (Headspace). Not captured by formality alone — formal + warm = possible (university president's commencement speech).
  Primary:   NO
```

```
Signal: epistemic_stance
  Axis:       VOICE
  Range:      enum: teacher | peer | guide | oracle | co-discoverer
  Scope:      GLOBAL
  Inference:  TIER_3 (inferred from content type + brand voice)
  CampaignLockable: YES
  Anchors:
    teacher:        "I know this and I'll explain it to you" — Masterclass, Khan Academy
    peer:           "We're figuring this out together" — indie newsletters, community posts
    guide:          "I've been where you are, let me show you the path" — Headspace, therapy apps
    oracle:         "Here is truth" — Kurzgesagt, The Economist, Apple keynotes
    co-discoverer:  "Let's explore this together — I don't know the answer yet either" — 3Blue1Brown, science YouTube
  Grounding: Scriptwriter review — captures the knowledge-relationship between writer and audience. Vox = teacher, Kurzgesagt = oracle, 3Blue1Brown = co-discoverer.
  Primary:   NO
```

```
Signal: certainty
  Axis:       VOICE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: YES (regulated industries clamp this — see Part 1.5)
  Anchors:
    0.00: Explicitly uncertain — "we don't know yet", "the data is unclear"
    0.25: Hedged — "it appears that", "evidence suggests", "we believe"
    0.50: Balanced — confident claims with acknowledged limitations
    0.75: Confident — "this works", "here's what you should do"
    1.00: Absolute certainty — "this IS the answer", zero qualification
  Grounding: Scriptwriter review — startup pitch (certainty 0.9) vs scientific paper (certainty 0.4) vs Apple keynote (certainty 1.0).
  Primary:   NO
```

```
Signal: temporal_orientation
  Axis:       VOICE
  Range:      enum: forward | present | backward
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    forward:   "The future is..." — startup pitches, innovation content, vision statements
    present:   "Right now..." — news, tutorials, product demos, current state descriptions
    backward:  "We've always..." — heritage brands, origin stories, nostalgia marketing
  Grounding: Scriptwriter review — Nike (forward: "the future of sport") vs Patagonia (backward: "we've always believed") vs Apple (present: "this changes everything, today").
  Primary:   NO
```

```
Signal: power_dynamic
  Axis:       VOICE
  Range:      enum: command | invite | confide | provoke
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: YES
  Anchors:
    command:   "Do this." — Nike "Just Do It", military recruitment, direct-response CTA
    invite:    "Join us." — Community-building, Patagonia, "What if we..."
    confide:   "Between us..." — Personal newsletters, behind-the-scenes, vulnerable sharing
    provoke:   "Are you sure about that?" — Contrarian takes, challenger brands, thought leadership
  Grounding: Scriptwriter review — power_dynamic + epistemic_stance together capture the full relationship between writer and audience.
  Primary:   NO
```

```
Signal: intensity_performance
  Axis:       VOICE
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Maximum understatement — says less than it means, trusts audience
           Example: Hemingway prose, Patagonia product descriptions
    0.25: Restrained — measured delivery, occasional emphasis
    0.50: Standard — emphasis matches content importance
    0.75: Amplified — deliberate intensity, theatrical moments
    1.00: Maximum performance — MrBeast, Gary Vee, preachers, stadium announcers
  Grounding: Scriptwriter review — MrBeast (1.0) vs Casey Neistat (0.3) share similar enthusiasm but differ radically in intensity_performance.
  Primary:   NO
```


## 2.7 Purpose Axis (3 signals + 1 derived)

The underlying goal of the content. Most content blends all three; the ratios determine technique selection.

```
Signal: education_intent
  Axis:       PURPOSE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_1 (FORMAT-derived: tutorial 0.9, ad 0.1)
  CampaignLockable: NO
  Anchors:
    0.00: Zero teaching — pure entertainment, emotion, or persuasion
    0.25: Incidental learning — audience picks up facts along the way
    0.50: Balanced — learning is a goal but not the only one
    0.75: Education-primary — structure exists to teach effectively
    1.00: Pure education — every sentence advances understanding
  Grounding: Gagne's 9 Events of Instruction; Mayer's 12 Principles of Multimedia Learning
  Primary:   NO
```

```
Signal: entertainment_intent
  Axis:       PURPOSE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_1 (FORMAT-derived)
  CampaignLockable: NO
  Anchors:
    0.00: Zero entertainment value — utility content, compliance, reference
    0.25: Mildly engaging — readable/watchable but pleasure is not the point
    0.50: Genuinely enjoyable — audience would choose this over alternatives
    0.75: Entertainment-primary — audience is here for the experience
    1.00: Pure entertainment — content exists solely for pleasure/diversion
  Grounding: Uses and Gratifications Theory (Katz, Blumler & Gurevitch, 1974)
  Primary:   NO
```

```
Signal: connection_intent
  Axis:       PURPOSE
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: No relational goal — content is transactional, one-directional
    0.25: Light connection — "follow for more", mild community nod
    0.50: Relationship-building — "we're in this together", shared values
    0.75: Deep bonding — vulnerability, shared struggle, we-language
    1.00: Pure connection — content exists to strengthen the relationship
  Grounding: Deci & Ryan's relatedness need (SDT, 2000); parasocial relationship theory
  Primary:   NO
```

```
DERIVED: persuasion_intent = max(logos_load, pathos_load, ethos_load)
  Notes: Computed. Indicates overall persuasive force regardless of mode. High persuasion (>0.7)
         triggers CTA techniques and conversion-oriented structures in Part 4.
```


## 2.8 Temporal Axis (2 signals)

How the content relates to time. Determines whether content should reference current events, use dated language, or aim for permanence.

```
Signal: temporal_relevance_decay
  Axis:       TEMPORAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_2 (extractable from brief context: "trending" → 0.1, "foundational" → 0.9)
  CampaignLockable: NO
  Anchors:
    0.00: Ephemeral — irrelevant within hours/days (trending topic, breaking news)
    0.25: Short-lived — relevant for weeks (seasonal campaign, product launch)
    0.50: Medium shelf life — relevant for months (quarterly report, feature release)
    0.75: Long-lasting — relevant for years (brand manifesto, evergreen tutorial)
    1.00: Timeless — relevant indefinitely (foundational principles, origin story)
  Grounding: Content marketing lifecycle models; SEO evergreen vs topical content distinction
  Primary:   NO
```

```
Signal: scope_breadth
  Axis:       TEMPORAL
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Hyper-narrow — one specific instance, person, or event
    0.25: Narrow — one product, one company, one situation
    0.50: Moderate — an industry, a demographic, a trend
    0.75: Broad — a generation, a society, a movement
    1.00: Universal — the human condition, nature, existence
  Grounding: Journalism's scope ladder — from local incident to universal truth
  Primary:   NO
```


## 2.9 Craft Axis (8 signals)

The scriptwriter review's core contribution. These signals capture what makes content GOOD, not just what content IS. "The deepest structural gap is the absence of any signal for WHAT TO LEAVE OUT."

```
Signal: negative_space
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3 (partially from FORMAT: TikTok 0.15, documentary 0.6)
  CampaignLockable: NO
  Anchors:
    0.00: No silence, no pauses, no white space — wall-to-wall content
    0.25: Minimal breathing room — tight editing, dense but with paragraph breaks
    0.50: Balanced — deliberate pauses, section breaks, room to digest
    0.75: Generous space — let the audience sit with ideas, silence after key points
    1.00: Space IS the content — Patagonia-style 60% silence, haiku minimalism
  Grounding: Scriptwriter review — "the taxonomy is entirely additive. Great writing is equally about what to LEAVE OUT." Musical rest theory — silence gives notes meaning.
  Primary:   NO
```

```
Signal: specificity_grain
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Generic — "She drove a car"
    0.25: Category-level — "She drove a hatchback"
    0.50: Brand-level — "She drove a Volvo"
    0.75: Model-level — "She drove a 1987 Volvo 240"
    1.00: Hyper-specific — "She drove a 1987 Volvo 240 with a bobblehead of Ruth Bader Ginsburg on the dash"
  Grounding: Scriptwriter review — "single fastest way to make writing feel human." Concrete language activates more neural pathways than abstract (Jessen et al., 2000 — fMRI studies of concrete vs abstract words).
  Primary:   NO
```

```
Signal: rhythmic_variation
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3 (partially from Voice Signature Layer 2 sentenceLengthVariance)
  CampaignLockable: NO
  Anchors:
    0.00: Metronomic — every sentence the same length and structure
    0.25: Low variation — mostly similar with occasional change
    0.50: Moderate — noticeable rhythm with intentional shifts
    0.75: High variation — deliberate alternation between short punchy and long flowing
    1.00: Maximum variation — "Short. Short. Then a sentence that unfurls like a flag in wind, clause after clause, building to something you didn't see coming." Hemingway meets Faulkner.
  Grounding: Scriptwriter review — "sentence length variation IS the craft." Prose rhythm research (Hye-Knudsen 2023 — rhythmic variation correlates with reader engagement).
  Primary:   NO
```

```
Signal: pivot_intensity
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: No pivot — linear progression, no reversals
    0.25: Gentle turn — subtle shift in perspective or argument
    0.50: Clear pivot — "But here's the thing..." — audience feels the turn
    0.75: Sharp reversal — "Everything I just said is wrong" — attention spike
    1.00: Whiplash — complete 180, audience gasps, subverts all expectations
  Grounding: Scriptwriter review — "every great piece has a moment where it pivots. Not tension_arc (continuous). A discrete hinge."
  Primary:   NO
```

```
Signal: callback_density
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: No callbacks — each section is self-contained, no cross-references
    0.25: Occasional echo — one moment references an earlier one
    0.50: Regular callbacks — setup/payoff pairs every few sections
    0.75: Dense callbacks — multiple threads planted and paid off, comedy-writer density
    1.00: Everything connects — every element is both setup and payoff for something else
  Grounding: Scriptwriter review — "plant in minute 1, pay off in minute 8." Setup/payoff is fundamental to screenwriting (Robert McKee, Story, 1997).
  Primary:   NO
```

```
Signal: subtext_depth
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Surface only — content means exactly what it says, no layers
    0.25: Light subtext — occasional implications, mostly explicit
    0.50: Moderate — surface meaning + an underlying message/theme
    0.75: Rich subtext — multiple layers of meaning, rewards re-reading
    1.00: Almost entirely subtextual — surface is a vehicle for deeper meaning
  Grounding: Scriptwriter review — "gap between surface meaning and intended meaning. Great writing operates on 2+ levels."
  Primary:   NO
```

```
Signal: implication_reliance
  Axis:       CRAFT
  Range:      0.0–1.0 (continuous)
  Scope:      GLOBAL
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Fully explicit — everything stated directly, nothing left to inference
    0.25: Mostly explicit — audience fills in small gaps
    0.50: Balanced — some things said, some implied, audience is trusted
    0.75: Heavily implied — audience constructs significant meaning
    1.00: Almost nothing stated — reader does the heavy lifting
  Grounding: Scriptwriter review — "great writing trusts the audience to construct meaning." Grice's Cooperative Principle and conversational implicature (1975).
  Primary:   NO
```

```
Signal: transition_craft
  Axis:       CRAFT
  Range:      enum: hard_cut | bridge | callback_bridge | question_bridge | tonal_shift | contradiction
             | nested_reveal | emotional_reset | parallel_cut | the_drop | associative_leap | the_withhold
  Scope:      TRANSITION (between scenes/sections)
  Inference:  TIER_3 (partially from pacing_velocity: high pacing → hard_cut, low → bridge)
  CampaignLockable: NO
  Anchors:    See Part 0, section 0.7 for full descriptions of all 12 transition types
  Grounding: Scriptwriter review + Copywriter review (6 additional types added in verification)
  Primary:   NO (but drives Part 4 technique selection for section transitions)
  ⚠️ IMPLEMENTER NOTE: The TypeScript TransitionCraftStyle enum from the Eng review
     contains only the original 6 values. Update it to include all 12:
     nested_reveal, emotional_reset, parallel_cut, the_drop, associative_leap, the_withhold
```


## 2.10 Visual-Verbal Axis (3 signals)

How written words and visual elements interact. Critical for video scripts, presentation scripts, and any content where both channels carry meaning. The CEO review flagged this: "Suspiciously text-only for a video company."

```
Signal: visual_dependency
  Axis:       VISUAL-VERBAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_1 (FORMAT default: podcast 0.0, product_demo 0.8) + TIER_2 (brief extraction)
  CampaignLockable: NO
  Anchors:
    0.00: Audio-only friendly — content works with eyes closed
           Example: Podcast, audiobook, radio ad
    0.25: Mostly verbal — occasional "as you can see" but visuals are supplementary
           Example: Talking head vlog, keynote with minimal slides
    0.50: Balanced — narration and visuals carry equal weight
           Example: Tutorial with screen share, cooking video with voiceover
    0.75: Visual-led — narration references specific visual elements constantly
           Example: Product demo, SaaS walkthrough, fashion lookbook
    1.00: Purely visual — zero narration, visuals ARE the content
           Example: ASMR cooking, silent cinematic montage, animated infographic
  Grounding: CEO review — "suspiciously text-only." Directly controls narration volume: low → dense VO, high → minimal/zero VO.
  Primary:   YES (controls narration generation volume)
```

```
Signal: show_tell_ratio
  Axis:       VISUAL-VERBAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_2 (extractable: "show the process", "demonstrate" → high)
  CampaignLockable: NO
  Anchors:
    0.00: All tell — narrator describes everything ("Picture a golden sunset...")
    0.25: Mostly tell — narration carries the story, visuals support
    0.50: Balanced — narration sets up, visuals pay off
    0.75: Mostly show — visuals lead, sparse narration punctuates
    1.00: All show — product speaks for itself, words are minimal
  Grounding: Screenwriting principle: "show, don't tell." Controls narration density — at 0.0, a 30s script needs ~75 words; at 1.0, it needs ~10 words or zero.
  Primary:   YES (controls narration style alongside visual_dependency)
```

```
Signal: multimodal_counterpoint
  Axis:       VISUAL-VERBAL
  Range:      0.0–1.0 (continuous)
  Scope:      PER_SCENE
  Inference:  TIER_3
  CampaignLockable: NO
  Anchors:
    0.00: Perfect alignment — audio mirrors visual exactly ("click here" + arrow)
    0.25: Complementary — same message, different information per channel
    0.50: Layered — narration adds context visuals cannot show (backstory, feelings)
    0.75: Deliberate tension — serene visuals + urgent narration, or vice versa
    1.00: Full contradiction — channels say opposite things for artistic effect
  Grounding: CEO review — needed for video company. Film theory: Eisenstein's montage theory (meaning from juxtaposition of contrasting elements). Patagonia brand films routinely use 0.7-0.8.
  Primary:   NO
```


## 2.11 Signal Classification Summary

### Primary signals (10-12, in LLM prompt)

These signals are injected into the ThinkForge agent prompt. They are the signals the LLM needs to "feel" the content:

| Signal | Axis | Range | Why Primary |
|--------|------|-------|-------------|
| logos_load | RHETORICAL | 0-1 | Determines evidence density |
| pathos_load | RHETORICAL | 0-1 | Determines emotional weight |
| ethos_load | RHETORICAL | 0-1 | Determines authority posture |
| emotional_valence | EMOTIONAL | -1 to +1 | Determines mood |
| emotional_arousal | EMOTIONAL | 0-1 | Determines intensity |
| pacing_velocity | STRUCTURAL | 0-1 | Determines rhythm |
| formality | VOICE | -1 to +1 | Determines register |
| humor | VOICE | 0-1 | Determines playfulness |
| enthusiasm | VOICE | 0-1 | Determines energy |
| visual_dependency | VISUAL-VERBAL | 0-1 | Controls narration volume |
| show_tell_ratio | VISUAL-VERBAL | 0-1 | Controls narration style |

### Secondary signals (~36, system uses for technique selection)

All other signals. The system uses them deterministically via the technique atlas (Part 4) — the LLM never sees them directly.

### Derived signals (3, computed)

| Signal | Formula | Grounding |
|--------|---------|-----------|
| cognitive_load | 0.3×elaboration + 0.25×abstraction + 0.25×complexity + 0.2×novelty | Sweller 1988 |
| information_density | 0.4×logos + 0.3×elaboration + 0.3×abstraction | Miller's 7±2 |
| persuasion_intent | max(logos, pathos, ethos) | Aristotle |


## 2.12 Correlation Pairs (from Eng Review)

11 correlated pairs were identified. 4 were acted on (eliminated/merged). 7 remain documented for implementers:

**Eliminated/merged (no longer separate signals):**
- logos_load ↔ information_density → information_density is now derived
- elaboration_demand ↔ cognitive_load → cognitive_load is now derived
- persuasion_intent decomposed → now derived as max(logos, pathos, ethos)
- formality ↔ irreverence → merged into single -1 to +1 formality scale

**Documented correlations (both signals retained, correlation noted):**
- abstraction_level ↔ assumed_expertise (0.6 — but popular science breaks this: high abstraction, low expertise)
- enthusiasm ≤ arousal + 0.2 (constraint — enthusiasm cannot exceed arousal by more than 0.2)
- narrative_transportation ↔ entertainment_intent (0.5 — diverge for educational narratives)
- pacing_velocity ↔ kairos_pressure (0.4 — urgent content is usually fast, but slow urgent exists)
- tension_arc ↔ emotional_arousal (0.5 — high tension usually means high arousal, but horror subverts this)
- novelty ↔ predictability (-0.7 — inverse, but not perfectly: familiar topic with surprising angle)
- behavioral_utility ↔ education_intent (0.5 — tutorials are useful, but some useful content doesn't teach)

Implementers should test for constraint violations (e.g., enthusiasm > arousal + 0.2) and flag them rather than silently accepting.


## 2.13 Measurability Tiers

How each signal gets its value through the 3-tier inference system:

| Tier | Count | How it works | Confidence |
|------|-------|-------------|------------|
| TIER_1 (format default) | ~15 signals | FORMAT selection influences these. ~6 are purely FORMAT-derived; ~9 more are dual-sourced (FORMAT provides a default that brief extraction may override). | 0.9 |
| TIER_2 (brief extraction) | ~11 signals | LLM extracts from brief text | 0.7-0.85 |
| TIER_3 (smart default) | ~21 signals | Domain heuristics + correlation | 0.4-0.6 |

**Auto-inferable from brief (TIER_2):** logos_load, pathos_load, ethos_load, emotional_valence, emotional_arousal, warmth, humor, enthusiasm, behavioral_utility, visual_dependency, show_tell_ratio

**Needs user input (rare):** audience_awareness (which awareness level to target), assumed_expertise (how expert is the audience), brand-specific signals (via Brand DNA)

**Everything else:** Smart defaults from correlations, format implications, and domain heuristics.

---

*End of Part 2 — Brief Signal Dictionary*

---

# PART 3 — SIGNAL DYNAMICS

Pipeline stage: Cascade resolver (temporal extension) + ThinkForge agent pipeline (arc planning)
When: After signal profile is computed (Part 0) but before technique selection (Part 4)
Purpose: Define how signals MOVE across a piece — the unified BREATHING + SURPRISE system.

Part 2 defines 47 signals as static values — WHERE content lives in signal space. But great content is not a point in space. It is a TRAJECTORY through space. A 60-second brand film that holds emotional_arousal at 0.6 for the entire duration is flat and lifeless. One that builds from 0.3 to 0.9 and drops to 0.2 at the end has an arc. Part 3 defines the machinery for that arc.

The core insight from the CEO review: **BREATHING and SURPRISE are not two features. They are one system.** Breathing defines the EXPECTED trajectory. Surprise defines the DEVIATIONS from it. Building them separately would create conflicts. Building them together creates a complete model of signal dynamics.


## 3.0 The Unified System — Arc + Deviation

```
BREATHING  = expected signal trajectories over the piece's duration
             (how signals move from scene to scene)

SURPRISE   = deviation points where the trajectory deliberately breaks
             (Moments — where the piece violates its own pattern for effect)

Together: the system knows BOTH where it's going AND when to break its own rules.
```

This parallels music production: an arrangement has a dynamic contour (verse quiet, chorus loud, bridge breakdown) AND deliberate violations of that contour (a sudden silence before the drop, an acapella bar in the middle of a wall of sound). The contour is breathing. The violations are surprise. Producers think of these as one system, not two.


## 3.1 Signal Envelopes — How Signals Move

A signal envelope replaces a static value with a curve over the duration of a scope.

```
SignalEnvelope {
  start:         number     // value at the beginning of the scope (t=0)
  peak:          number     // value at the peak/trough
  end:           number     // value at the end of the scope (t=1)
  peakPosition:  number     // WHERE the peak occurs, normalized 0-1
                            // 0.0 = immediate peak, 0.5 = midpoint, 0.9 = near end
  attackCurve:   EnvelopeCurve  // how the signal moves from start → peak
  releaseCurve:  EnvelopeCurve  // how the signal moves from peak → end
}

EnvelopeCurve = 'linear' | 'exponential' | 'logarithmic'
// linear:       constant rate of change — predictable, mechanical
// exponential:  slow start, fast finish — suspense build, acceleration
// logarithmic:  fast start, slow finish — impact followed by settling

// 'step' deliberately excluded — an instantaneous value change is a PatternBreak (section 3.3),
// not an envelope. Keeping both representations for the same concept would cause confusion.

// The signal value at any point in time:
SignalValueOrEnvelope = number | SignalEnvelope
// Every numeric signal in CreativeSignals accepts either type — no schema changes per signal.
```

### How envelopes are evaluated

```
function evaluateEnvelope(envelope, normalizedTime):
  // Guard: peakPosition at boundaries means one phase is zero-length
  if envelope.peakPosition === 0:
    return interpolate(envelope.peak, envelope.end, normalizedTime, envelope.releaseCurve)
  if envelope.peakPosition === 1:
    return interpolate(envelope.start, envelope.peak, normalizedTime, envelope.attackCurve)

  if normalizedTime <= envelope.peakPosition:
    // Attack phase: start → peak
    localT = normalizedTime / envelope.peakPosition  // normalize to 0-1 within attack
    return interpolate(envelope.start, envelope.peak, localT, envelope.attackCurve)
  else:
    // Release phase: peak → end
    localT = (normalizedTime - envelope.peakPosition) / (1 - envelope.peakPosition)
    return interpolate(envelope.peak, envelope.end, localT, envelope.releaseCurve)

function interpolate(from, to, t, curve):
  switch curve:
    'linear':       return from + (to - from) * t
    'exponential':  return from + (to - from) * (t * t)
    'logarithmic':  return from + (to - from) * Math.sqrt(t)
```

### Envelope examples

**Brand film (90s) — emotional_arousal envelope:**
```
{ start: 0.2, peak: 0.85, end: 0.3, peakPosition: 0.7, attackCurve: 'logarithmic', releaseCurve: 'exponential' }
// Slow quiet opening → builds steadily → hits peak at 70% → sharp emotional release → gentle landing
// The logarithmic attack means the build feels gradual at first then accelerates
// The exponential release means the drop is sharp then settles
```

**TED talk (18 min) — tension_arc envelope:**
```
{ start: 0.3, peak: 0.8, end: 0.5, peakPosition: 0.6, attackCurve: 'linear', releaseCurve: 'linear' }
// Opens with moderate tension (the question) → builds linearly to peak (the key insight) → resolves to moderate (call to action)
// Linear curves because TED talks have predictable, steady arcs — no surprises in the structure
```

**MrBeast video (12 min) — enthusiasm envelope:**
```
{ start: 0.9, peak: 1.0, end: 0.8, peakPosition: 0.85, attackCurve: 'logarithmic', releaseCurve: 'linear' }
// Opens HOT (hook) → stays high → peaks at the big reveal near the end → slight comedown for outro
// MrBeast never drops below 0.8 enthusiasm — the floor IS the content
```

### When to use envelopes vs static values

**Duration-dependent activation (matching Part 0, section 0.2):**
```
< 30 seconds:   Static values only. Not enough duration for meaningful trajectory.
30–90 seconds:  Optional envelopes on 2-3 signals (tension_arc, emotional_arousal, pacing_velocity)
90s – 5 min:    Recommended envelopes on 5-8 core dynamic signals
5 – 30 min:     Envelopes on all dynamic signals, mandatory for tension_arc
Series:         Per-episode envelopes + cross-episode arc envelope at campaign level
```

Most users never touch envelopes. The system generates DEFAULT envelopes based on content type and signal values:
- `tension_arc: 0.7` → system auto-generates a build-peak-release curve
- `emotional_arousal: 0.8` → system generates a gradual ramp with peak at 70% duration
- `pacing_velocity: 0.6` → system generates gentle acceleration toward the end

These defaults are overridable at the PROJECT or SCENE level via the timeline editor (Part 0, Designer review: mini sparklines in Tier 2, full curve editor in Tier 3).


## 3.2 Breath Groups — Coupled Signal Clusters

47 independent signal envelopes is chaos. When emotional_arousal ramps up, pacing_velocity should increase, negative_space should decrease, and linguistic_complexity should drop. These co-movements are what makes content feel natural vs robotic.

Breath Groups define signal clusters that breathe together. The user (or the system) sets an envelope for the GROUP'S primary signal. Coupled signals inherit proportional envelopes based on their correlation coefficients.

### Defined Breath Groups

```
INTENSITY {
  primary:     emotional_arousal
  coupled: [
    { signal: pacing_velocity,       correlation: +0.8 }   // high arousal → fast pacing
    { signal: negative_space,        correlation: -0.7 }   // high arousal → less silence
    { signal: linguistic_complexity, correlation: -0.5 }   // high arousal → simpler words
    { signal: enthusiasm,            correlation: +0.6 }   // high arousal → more energy
  ]
  // When emotional_arousal envelope goes from 0.3 → 0.8:
  //   pacing_velocity moves from ~0.4 → ~0.8 (tracks closely)
  //   negative_space moves from ~0.6 → ~0.2 (inverts)
  //   linguistic_complexity moves from ~0.6 → ~0.35 (drops moderately)
  //   enthusiasm moves from ~0.4 → ~0.7 (tracks, with some independence)
}

REVEAL {
  primary:     novelty
  coupled: [
    { signal: predictability,  correlation: -0.9 }   // new info → less predictable
    { signal: tension_arc,     correlation: +0.6 }    // new info → builds tension
    { signal: elaboration_demand, correlation: +0.4 } // new info → more thinking required
  ]
  // When novelty envelope ramps before a big reveal:
  //   predictability drops (audience can't see what's coming)
  //   tension rises (something is about to happen)
  //   elaboration increases (audience is working harder to process)
}

INTIMACY {
  primary:     warmth
  coupled: [
    { signal: formality,          correlation: -0.6 }   // warm → less formal
    { signal: specificity_grain,  correlation: +0.5 }   // warm → more specific/personal details
    { signal: autonomy_grant,     correlation: +0.4 }   // warm → more audience agency
    { signal: in_group_signal,    correlation: +0.3 }   // warm → more insider language
  ]
  // When warmth increases (e.g., a personal story in the middle of a presentation):
  //   formality drops (register shifts)
  //   specificity increases (concrete personal details)
  //   autonomy increases (inviting, not directing)
}
```

⚠️ Correlation coefficients above are engineering estimates grounded in copywriter review observations, not empirically measured values. They should be calibrated from real content analysis data (Signal Performance Attribution — Part 0, section 0.11).

### How Breath Groups resolve

```
function resolveBreathGroup(group, primaryEnvelope, normalizedTime):
  primaryValue = evaluateEnvelope(primaryEnvelope, normalizedTime)

  for each coupled signal in group:
    // Compute the coupled signal's value from the primary's position
    coupledDelta = (primaryValue - primaryEnvelope.start) * coupled.correlation
    coupledValue = coupled.signal.baseValue + coupledDelta
    coupledValue = clamp(coupledValue, signal.min, signal.max)

  // Coupled values are SUGGESTIONS, not overrides.
  // If a scene has an explicit override for a coupled signal, coupling is SUPPRESSED
  // for that signal — the explicit value wins. CSS-specificity: explicit > computed.
  // If two Breath Groups both want to move the same signal (e.g., INTENSITY and INTIMACY
  // both affect formality), the group whose PRIMARY signal has higher moment_weight wins.
  // Edge case: if equal weight, the more specific scope wins (scene > act > project).
```

### User interaction with Breath Groups

**Default (90% of users):** The system handles groups automatically. When a user sets `emotional_arousal` to 0.8 or draws an envelope for it, the INTENSITY group automatically adjusts pacing, negative_space, complexity, and enthusiasm. The user sees ONE knob; the system turns five.

**Power users:** Can decouple any signal from its group. "I want high arousal but SLOW pacing" → override pacing_velocity explicitly, breaking it free from the INTENSITY group. The system shows: "pacing_velocity is decoupled from INTENSITY group (explicit override)."

**Experts (timeline view):** See all coupled signals as parallel lanes. Can edit each independently. Correlation arrows show which signals are grouped and which are decoupled.


## 3.3 Moments — Deviation Points (PatternBreak)

A Moment is a point in the content where the system deliberately VIOLATES its own signal trajectory. The breathing defines expectations. Moments break them. The audience notices because the pattern was established first — without a pattern, there is no surprise.

### PatternBreak schema (V1 — no recovery, recovery deferred to BEAT scope post-MVP)

```
PatternBreakV1 {
  signal:      NumericCreativeSignal   // ONLY numeric signals — enums excluded
  direction:   'spike' | 'drop'       // relative to the current trajectory value
  magnitude:   number                 // 0.2–0.8 DELTA, not absolute
                                      // below 0.2 = imperceptible; above 0.8 = breaks adjacent constraints
  reason:      string                 // WHY this break exists — required for auditability
}

// NumericCreativeSignal = type guard excluding enum signals (bloom_level, audience_awareness,
// epistemic_stance, temporal_orientation, power_dynamic, transition_craft)
// You cannot "spike 0.6" on an enum. For enum changes, use a scene-level override instead.
```

### How PatternBreaks resolve (recap from Part 0, section 0.3)

```
1. Resolve the signal's value at this point in time (static or from envelope)
2. Apply PatternBreak delta: value + (spike ? +magnitude : -magnitude)
3. Check campaign lock: if locked, SUPPRESS the break (surface in UI, never silent)
4. Clamp to signal range
5. Record in _inference_metadata: patternBreakApplied: true
```

The same PatternBreak produces different absolute results at different times because the underlying value changes. A `magnitude: 0.4 spike` on emotional_arousal where the envelope is at 0.3 gives 0.7. Where the envelope is at 0.6, it gives 1.0 (clamped). This is correct — a surprise should be relative to what the audience is experiencing at that moment.

### Surprise types (from CEO review Arc Contrast system)

Not all surprises are signal spikes. The CEO review identified 4 types:

**Tonal surprise** — the piece shifts register. Humor injected into a serious piece. Gravity in a light one. This IS a signal change and is handled by PatternBreak on the relevant signal (humor, formality, warmth, etc.).

**Structural surprise** — the piece breaks its own structural pattern. A rapid-cut video suddenly holds a single shot for 15 seconds. A metronomic rhythm suddenly varies wildly. This is a PatternBreak on pacing_velocity or rhythmic_variation. The signal system handles it.

**Informational surprise** — a reveal that recontextualizes everything before it. "The reason I'm telling you this is because I WAS the patient." This is NOT a signal change — signals remain the same, the CONTENT shifts. Informational surprise is a TECHNIQUE, not a signal dynamic. It belongs in Part 4 (Technique Atlas) as a structural technique triggered by signal conditions.

**Meta surprise** — the piece breaks its own medium. Fourth wall break. Format subversion. "This isn't actually a product demo." This is also a technique, not a signal. Part 4 handles it.

Summary: tonal and structural surprise → PatternBreak (Part 3). Informational and meta surprise → Technique selection (Part 4).

### Moments in the UI (from Designer review)

The user does not see "PatternBreak." They see **"Moments."**

- Right-click a scene → "Make this a Moment"
- Three presets:
  - **Surprise** — spikes energy, humor, and/or pace for one scene
  - **Pause** — drops pace, raises negative_space, lowers arousal
  - **Shift** — inverts the dominant tone (formal becomes casual, serious becomes playful)
- Each preset shows a one-line description vs project defaults
- Gold diamond icon marks Moment scenes in the scene list
- "Advanced" link at the bottom opens per-signal PatternBreak controls for experts

The three presets map to PatternBreak configurations:

```
Surprise preset:
  [{ signal: emotional_arousal, direction: 'spike', magnitude: 0.3, reason: 'user_preset:surprise' },
   { signal: pacing_velocity,   direction: 'spike', magnitude: 0.2, reason: 'user_preset:surprise' }]

Pause preset:
  [{ signal: pacing_velocity,   direction: 'drop',  magnitude: 0.3, reason: 'user_preset:pause' },
   { signal: negative_space,    direction: 'spike', magnitude: 0.3, reason: 'user_preset:pause' },
   { signal: emotional_arousal, direction: 'drop',  magnitude: 0.2, reason: 'user_preset:pause' }]

Shift preset:
  [{ signal: formality,   direction: invert_from_current, magnitude: 0.4, reason: 'user_preset:shift' },
   { signal: humor,       direction: invert_from_current, magnitude: 0.3, reason: 'user_preset:shift' }]
  // "invert_from_current" is syntactic sugar, resolved at Moment creation time:
  //   resolve signal's current cascade value at this scene
  //   if value > signal.midpoint → direction: 'drop'
  //   if value < signal.midpoint → direction: 'spike'
  //   if value === signal.midpoint → direction: 'spike' (break toward the unexpected)
  //   midpoint: 0.5 for 0-1 signals, 0.0 for bipolar (-1 to +1) signals
```


## 3.4 Arc Contrast — Project-Level Trajectory Planning

Individual Moments are scene-level. Arc Contrast is project-level — it defines the expected signal trajectory across ALL scenes and marks where deviations should occur.

### How it works

```
ArcContrast {
  // The expected trajectory (what the audience's pattern-recognition system predicts)
  expectedArc: {
    signal:    keyof CreativeSignals   // which signal this arc describes
    envelope:  SignalEnvelope          // the expected trajectory
  }[]

  // Deviation points (where the trajectory deliberately breaks)
  deviations: {
    position:        number           // 0-1 normalized within the project
    type:            'tonal' | 'structural'  // informational + meta handled by Part 4
    targetScene:     string           // scene ID where the deviation occurs
    patternBreaks:   PatternBreakV1[] // the actual signal changes at this point
    contrastWith:    'preceding' | 'established_pattern' | 'audience_expectation' | 'genre_norm'
    recovery:        'snap_back' | 'new_baseline' | 'gradual_return' | 'escalate'
  }[]
}
```

### Arc Contrast examples

**"Build then break" (brand film):**
```
expectedArc: [
  { signal: emotional_arousal, envelope: { start: 0.2, peak: 0.7, end: 0.3, peakPosition: 0.7, ... } },
  { signal: pacing_velocity,   envelope: { start: 0.3, peak: 0.6, end: 0.4, peakPosition: 0.6, ... } }
]
deviations: [
  { position: 0.7, type: 'structural', targetScene: 'scene_5',
    patternBreaks: [
      { signal: pacing_velocity, direction: 'drop', magnitude: 0.5, reason: 'held shot after rapid montage' },
      { signal: negative_space,  direction: 'spike', magnitude: 0.6, reason: 'silence after noise' }
    ],
    contrastWith: 'established_pattern',
    recovery: 'new_baseline'  // piece does NOT return to prior pacing — the break changes everything
  }
]
// 4 scenes of building montage → scene 5 holds one static shot in silence → final scene is the new pace
```

**"Deadpan until the punch" (comedy ad):**
```
expectedArc: [
  { signal: humor, envelope: { start: 0.1, peak: 0.1, end: 0.1, peakPosition: 0.5, ... } }  // FLAT
]
deviations: [
  { position: 0.85, type: 'tonal', targetScene: 'scene_final',
    patternBreaks: [
      { signal: humor,      direction: 'spike', magnitude: 0.8, reason: 'punchline' },
      { signal: enthusiasm, direction: 'spike', magnitude: 0.5, reason: 'punchline energy' }
    ],
    contrastWith: 'established_pattern',
    recovery: 'snap_back'  // back to deadpan for the logo card
  }
]
// The humor flatline MAKES the punchline work. Without the established pattern, the spike has no contrast.
```

### Arc Contrast as a planning tool

Arc Contrast is generated automatically by the outline agent based on the ContentSignalProfile + content structure:
- 3-act structure → INTENSITY group builds across acts, deviation at act 2/3 boundary
- Hook-value-CTA → high arousal at start, drops for value section, spikes for CTA
- Listicle → flat arc with mini-spikes at each list item (rhythmic pattern)

The user can override the auto-generated arc in the timeline view. For 90% of content, the automatic arc is sufficient. For premium creative work, the timeline view gives full control over every signal's trajectory and deviation points.


## 3.5 Envelope + Cascade Interaction Rules

When envelopes exist at multiple scope levels, the cascade resolver must decide which one applies. These rules extend Part 0, section 0.3.

### Case A: Parent has envelope, child has no override

The child INHERITS the parent's envelope. The cascade resolver samples the parent envelope at the child's temporal position within the parent.

```
Example: Project envelope for emotional_arousal: 0.3 → 0.8 (linear)
Scene 3 occupies 40%-60% of the project duration
Scene 3 gets emotional_arousal ≈ 0.5-0.6 (sampled from project envelope)
```

### Case B: Parent has envelope, child has static override

The child's static value WINS for the entire child duration. This creates a discontinuity at the child's boundaries — the parent envelope jumps to the static value, then jumps back. This is intentional: an explicit override is a creative choice to break from the arc.

### Case C: Parent has envelope, child has its own envelope

The child's envelope WINS entirely. The child envelope operates over the CHILD's duration (0-1 normalized to child length), not the parent's. The two envelopes are independent — no blending.

### Case D: PatternBreak + envelope at same scope

The PatternBreak applies as a DELTA to the envelope's value at the current time. This is the standard resolution order from Part 0.

### Transition blending between scoped envelopes

When adjacent children have different envelopes (or one has an envelope and the other inherits), the transition model (Part 0, section 0.7) handles the boundary. If `transition.style` is `bridge` or `callback_bridge`, the system blends across the `blendDurationMs`. If `hard_cut`, the values jump discontinuously.


## 3.6 Implementation Phasing

Signal dynamics is the most architecturally complex part of the system. It is built in phases to manage blast radius.

```
PHASE 0 (NOW — ship with Parts 0-2):
  ✅ Define SignalEnvelope type (TypeScript interface)
  ✅ Define SignalValueOrEnvelope union type
  ✅ Define PatternBreakV1 interface with NumericCreativeSignal guard
  ✅ Define Breath Group correlation tables
  ✅ Define ArcContrast schema
  At this point: types exist, schemas are forward-compatible, runtime uses static values only

PHASE 1 (Next — pre-resolve at cascade layer):
  - Cascade resolver handles SignalValueOrEnvelope
  - Pre-resolves envelopes to static values at scene boundaries
  - Signal executor sees only numbers — zero changes to consumers
  - PatternBreak V1 integrated into cascade (already in Part 0 pseudocode)
  - Breath Group resolution: primary → coupled auto-computation

PHASE 2 (Later — within-scene temporal variation):
  - Cascade resolver becomes fully time-parameterized (normalizedTime parameter)
  - Signal executor re-resolves at each grid point (every ~500ms) for within-scene variation
  - UI: mini sparklines in Override Panel, full curve editor in Timeline view

PHASE 3 (Future — learning):
  - Breath Group correlation coefficients refined from real content analysis
  - Default arc shapes learned from performance data
  - PatternBreak recovery semantics (needs BEAT scope)
  - Automatic deviation detection: "scene 4 breaks your established pattern — intentional?"
```

### Performance at each phase

| Phase | Resolution count (60s video) | Latency |
|-------|------------------------------|---------|
| 0 | 470 (static, one per scene per signal) | < 0.1ms |
| 1 | 470 (pre-resolved at scene boundaries) | < 0.1ms |
| 2 | 5,640 (every 500ms × 47 signals) | < 1ms |
| 3 | Same as Phase 2 + learning overhead | < 2ms |

Performance is NOT a concern at any phase. The bottleneck is always the LLM call (~200ms for Gemini Flash), not the signal resolver.


## 3.7 What Signals Cannot Capture (Honest Limitations)

The scriptwriter review identified three things that remain below signal resolution even with full dynamics:

**SURPRISE** — addressed partially. PatternBreaks handle tonal and structural surprise. But INFORMATIONAL surprise (a reveal that recontextualizes everything) and META surprise (breaking the medium) are techniques, not signal dynamics. They live in Part 4.

**VOICE SIGNATURE** — addressed in Part 1. Voice signature captures patterns below signal resolution (lexical fingerprint, structural habits, exemplar retrieval). Dynamics does not replace voice — it adds trajectory to a voice that is already established.

**BREATHING** — addressed fully. Signal envelopes + Breath Groups model how content moves through signal space over time. But the scriptwriter's deeper point — "the variation pattern IS the craft" — means the SPECIFIC pattern of movement matters, not just that movement exists. Two pieces with identical envelopes can have different quality because the micro-variations (within-sentence rhythm, within-paragraph tension) differ. These live below envelope resolution, in the execution of specific writing techniques (Part 5).

This system handles the MACRO dynamics (how does arousal change across scenes?). The MICRO dynamics (how does a single sentence create tension?) are Part 5 territory — technique execution, not signal trajectory.

---

*End of Part 3 — Signal Dynamics*

---

# PART 4 — SIGNAL → WRITING TECHNIQUE ATLAS

The core decision matrix. When you detect signal combination X, use writing technique Y, because Z, never W.

Part 2 defines the 47 signals. Part 3 defines how they move. This Part defines what WRITING DECISIONS those signals produce. It is the bridge between measurement and execution — the system's "if this, then that" for creative choices.

Content type is NOT in this atlas. There is no "video script hook techniques" section and no "LinkedIn post structure" section. Techniques are selected by SIGNAL CONDITIONS, and the same technique can appear in a TikTok script, a blog post, or a pitch deck — if the signals match.


## 4.0 Technique Card Format

Each mapping follows this structure:

```
Technique: descriptive_name
  Category:       which writing decision this addresses (hook, structure, narration, CTA, etc.)
  Activation:     signal conditions that trigger this technique (3-6 signals with thresholds)
  Inhibitors:     signal conditions that BLOCK this technique (0-2 signals with thresholds)
  Primary:        what the technique does — the core writing action
  Complements:    supporting techniques that amplify the primary
  Anti-patterns:  what NOT to do when this technique is active
  Weight response: how signal intensity modifies technique application
  Why:            cognitive/rhetorical justification — why this works on human brains
  Example:        one concrete instance of this technique in real content
```

### Selection algorithm

```
function selectTechniques(signalProfile, category):
  candidates = TECHNIQUE_ATLAS.filter(t => t.category === category)

  for each candidate:
    // Score: sum of (signal_match * weight) for each activation condition
    // Activation conditions can reference signals, derived signals, AND constraints from ContentSignalProfile.
    score = 0
    for each condition in candidate.activation:
      signalValue = signalProfile[condition.signal] ?? signalProfile.constraints[condition.signal]

      if condition.value !== undefined:
        // ENUM match: exact value comparison (for audience_awareness, power_dynamic, cta_type, etc.)
        score += (signalValue === condition.value) ? condition.weight : 0
      else:
        // NUMERIC range: threshold comparison (for continuous 0-1 and bipolar -1 to +1 signals)
        if signalValue >= condition.min AND signalValue <= condition.max:
          score += condition.weight * signalValue
        else:
          score -= condition.weight * 0.5  // penalty for out-of-range signals

    // Check inhibitors: any inhibitor firing = candidate rejected
    for each inhibitor in candidate.inhibitors:
      if signalProfile[inhibitor.signal] > inhibitor.threshold:
        score = -Infinity  // hard rejection
        break

    candidate.score = score

  // Return top N per category (highest scoring candidates)
  return candidates.filter(c => c.score > 0).sort(by score descending).slice(0, maxPerCategory)
```

This is DETERMINISTIC. Same signal profile → same technique selection → same writing instructions to the LLM. The LLM executes techniques; it does not choose them.


## 4.1 Mapping Priority Rules

When multiple techniques fire simultaneously:

1. **Constraints (Part 6) ALWAYS override mappings.** If a regulatory constraint bans superlatives, no technique can use them — regardless of score.
2. **Brand Rulebook (Part 1) overrides technique-suggested vocabulary.** Kill list and structural rules are inviolable.
3. **Inhibitors are absolute.** One inhibitor firing kills the technique — no "partial inhibition."
4. **When two techniques compete for the same writing slot** (e.g., two hook types both score > 0): the one with higher activation score wins.
5. **Moment-modified techniques:** When a PatternBreak (Part 3) is active, technique selection re-runs with the break-adjusted signal values. A "Surprise" Moment may select different techniques than the base arc.
6. **Voice Signature (Part 1) modifies technique EXECUTION, not selection.** The atlas selects "question hook." The Voice Signature determines HOW the question is phrased (casual vs formal, long vs short, provocative vs curious).


## 4.2 Hook Techniques

Hooks are the first 3-10 seconds of video content or the first 1-3 lines of text content. The hook's job is to earn the audience's next second/sentence.

```
Technique: question_hook
  Category:       hook
  Activation: [
    { signal: elaboration_demand, min: 0.3, max: 1.0, weight: 0.3 },
    { signal: audience_awareness, value: 'problem_aware', weight: 0.4 },
    { signal: autonomy_grant, min: 0.4, max: 1.0, weight: 0.2 },
    { signal: novelty, min: 0.3, max: 0.8, weight: 0.1 }
  ]
  Inhibitors: [
    { signal: certainty, threshold: 0.9 }  // questions feel weak when the brand sounds absolute
  ]
  Primary:        Open with a question the audience already has but hasn't articulated.
                  Not a generic question — a SPECIFIC question that proves you understand their situation.
  Complements:    Follow with a brief credibility marker (ethos) before answering.
  Anti-patterns:
    - Generic questions ("Want to grow your business?") — too broad, feels like spam
    - Questions with obvious answers — insulting to the audience
    - Multiple questions stacked — cognitive overload, pick ONE
  Weight response:
    elaboration > 0.7: philosophical question ("What if everything you know about X is wrong?")
    elaboration 0.3-0.7: practical question ("How do you handle X when Y happens?")
  Why: Questions activate the brain's completion instinct (Zeigarnik effect). An unanswered question
       creates an open loop that the audience must close by continuing to read/watch.
  Example: "What happens to your brand when your best copywriter quits?" — specific, painful, relevant
```

```
Technique: statistic_hook
  Category:       hook
  Activation: [
    { signal: logos_load, min: 0.5, max: 1.0, weight: 0.4 },
    { signal: novelty, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: assumed_expertise, min: 0.3, max: 0.8, weight: 0.2 },
    { signal: visceral_impact, min: 0.3, max: 1.0, weight: 0.1 }
  ]
  Inhibitors: [
    { signal: formality, threshold: -0.5 }  // stats feel clinical in very casual content
  ]
  Primary:        Open with a surprising data point that reframes the audience's understanding.
                  The stat must be COUNTERINTUITIVE — confirming what people already believe is not a hook.
  Complements:    Follow with "...and here's why that matters to you" (behavioral_utility bridge).
  Anti-patterns:
    - Made-up or unverifiable statistics — destroys ethos instantly
    - Stats without source — feels like LLM fabrication (the #1 anti-AI tell)
    - Multiple stats in the hook — one is a hook, three is a data dump
  Weight response:
    logos > 0.8: lead with the number ("73% of..."), source immediately
    logos 0.5-0.8: embed the stat in a narrative framing ("Most people assume X. The data says Y.")
  Why: Cognitive disruption — a counterintuitive fact creates a prediction error in the brain (Rescorla-Wagner model).
       The audience stays to resolve the discrepancy between what they believed and what the data shows.
  Example: "97% of video content gets zero organic reach. Here's what the 3% does differently."
  ⚠️ All statistics in generated content MUST be sourced from user-provided materials (Part 0, section 0.8).
     The system NEVER fabricates statistics.
```

```
Technique: story_hook
  Category:       hook
  Activation: [
    { signal: pathos_load, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: narrative_transportation, min: 0.4, max: 1.0, weight: 0.3 },
    { signal: specificity_grain, min: 0.5, max: 1.0, weight: 0.2 },
    { signal: warmth, min: 0.3, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: pacing_velocity, threshold: 0.9 }  // stories need time; breakneck pace kills them
  ]
  Primary:        Open in the middle of a specific moment. Not backstory — a vivid, concrete scene
                  that the audience enters immediately. "It was 3am and the server was on fire."
  Complements:    Delay context — let the scene breathe before explaining why it matters.
  Anti-patterns:
    - Starting with backstory ("Let me tell you about my journey...") — earned, not given
    - Vague scene-setting ("Imagine a world where...") — generic, not specific
    - Stories that are clearly manufactured for the content — audience detects inauthenticity
  Weight response:
    pathos > 0.8: start in the most emotionally intense moment (in medias res at the crisis)
    pathos 0.5-0.8: start at a moment of tension or decision
  Why: Green & Brock transportation theory — a concrete scene activates narrative absorption,
       reducing the audience's counter-arguing defenses. They are IN the story before they decide
       whether to stay.
  Example: "She stared at the Slack notification. 47 unread messages. All from the same channel."
```

```
Technique: provocation_hook
  Category:       hook
  Activation: [
    { signal: certainty, min: 0.6, max: 1.0, weight: 0.3 },
    { signal: power_dynamic, value: 'provoke', weight: 0.3 },
    { signal: novelty, min: 0.5, max: 1.0, weight: 0.2 },
    { signal: pivot_intensity, min: 0.4, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: warmth, threshold: 0.8 }  // provocations feel harsh in very warm contexts
  ]
  Primary:        Open with a bold, contrarian claim that challenges conventional wisdom.
                  Must be defensible — not clickbait, but a genuine alternative perspective.
  Complements:    Immediately signal that evidence is coming ("...and I can prove it.").
  Anti-patterns:
    - Provocations you can't back up — damages ethos permanently
    - Insulting the audience ("You're doing it wrong") — provoke their assumptions, not their competence
    - Clickbait gap ("You won't BELIEVE...") — audience is trained to detect and punish this
  Weight response:
    certainty > 0.8: absolute statement ("X is dead. Here's what replaces it.")
    certainty 0.6-0.8: qualified provocation ("The conventional wisdom about X is dangerously wrong.")
  Why: Cognitive dissonance — a confident claim that contradicts the audience's beliefs creates
       discomfort that can only be resolved by engaging with the argument. Berlyne's optimal arousal.
  Example: "Content calendars are killing your brand. Stop scheduling. Start responding."
```

```
Technique: pattern_interrupt_hook
  Category:       hook
  Activation: [
    { signal: pacing_velocity, min: 0.7, max: 1.0, weight: 0.3 },
    { signal: entertainment_intent, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: visceral_impact, min: 0.4, max: 1.0, weight: 0.2 },
    { signal: visual_dependency, min: 0.5, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: formality, threshold: 0.6 }  // pattern interrupts feel unprofessional in formal contexts
  ]
  Primary:        Open with something unexpected that STOPS the scroll — a jarring visual direction,
                  a sentence fragment, a sound, a contradiction. The goal is the 0.4-second stopping
                  reaction, not comprehension. Comprehension comes in the next 3 seconds.
  Complements:    Follow immediately with context (within 2 sentences) or audience bounces.
  Anti-patterns:
    - Shock without substance — stops the scroll but loses the audience at second 4
    - Pattern interrupts on every piece — audience builds tolerance fast
    - Interrupts that contradict the brand voice — jarring in the wrong way
  Weight response:
    pacing > 0.9: maximum disruption — fragment, visual, unexpected angle
    pacing 0.7-0.9: moderate interruption — unexpected opening line, contrast
  Why: Orienting response (Sokolov 1963) — novel stimuli trigger involuntary attention.
       TikTok data: 84.3% of viral videos use hook triggers in first 3 seconds.
       ⚠️ Source: ttsvibes.com/hangryfeed.com 2025 — industry analysis, not peer-reviewed.
  Example: "STOP. Before you read another productivity tip." (then pivots to a genuine insight)
```

```
Technique: outcome_hook
  Category:       hook
  Activation: [
    { signal: behavioral_utility, min: 0.6, max: 1.0, weight: 0.4 },
    { signal: audience_awareness, value: 'solution_aware', weight: 0.3 },
    { signal: kairos_pressure, min: 0.3, max: 0.8, weight: 0.2 },
    { signal: certainty, min: 0.5, max: 1.0, weight: 0.1 }
  ]
  Inhibitors: [
    { signal: narrative_transportation, threshold: 0.8 }  // outcome hooks are utilitarian, not immersive
  ]
  Primary:        Open with the RESULT the audience wants, then explain how to get there.
                  "Here's how we cut our CAC by 40% in 6 weeks." — destination first, journey second.
  Complements:    Include a specificity marker (the number, the timeframe, the constraint).
  Anti-patterns:
    - Vague outcomes ("grow your business") — no specificity = no hook
    - Outcomes the audience doesn't care about — must map to THEIR pain
    - Unbelievable outcomes without hedging — "10x your revenue in a week" triggers BS detector
  Weight response:
    behavioral > 0.8: specific number + timeframe + constraint in the hook
    behavioral 0.6-0.8: outcome statement + credibility marker
  Why: Outcome-first structure (product demo pattern from Part 5) applied to hooks.
       The audience evaluates effort-to-outcome ratio — showing the outcome first makes the effort
       worth evaluating.
  Example: "We reduced 12-hour video production to 45 minutes. Here's the exact workflow."
```


## 4.3 Content Structure Techniques

These determine the SHAPE of the entire piece — how ideas are sequenced from start to finish.

**Note from the copywriter review: structure IS the creative idea, not a technique optimization.** These are presented as OPTIONS with reasoning (per Part 0 authority matrix — user DECIDES structure). The system recommends based on signals and presents the top 2-3 structures with rationale.

```
Technique: problem_agitate_solve (PAS)
  Category:       structure
  Activation: [
    { signal: behavioral_utility, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: kairos_pressure, min: 0.3, max: 1.0, weight: 0.3 },
    { signal: pathos_load, min: 0.3, max: 0.8, weight: 0.2 },
    { signal: audience_awareness, value: 'problem_aware', weight: 0.2 }
  ]
  Inhibitors: [
    { signal: education_intent, threshold: 0.8 }  // PAS is persuasion, not education
  ]
  Primary:        Problem (name the pain) → Agitate (make it vivid) → Solve (present the answer).
                  Works best under 60 seconds / 300 words. The agitation must be SPECIFIC —
                  not "this is bad" but "here's exactly how this ruins your Tuesday."
  Weight response:
    kairos > 0.7: compressed PAS — problem and agitation in one sentence, jump to solve
    kairos 0.3-0.7: full PAS — each phase gets development
  Why: Direct response copywriting's most proven structure (Dan Kennedy, Gary Halbert).
       Agitation bridges the gap between "I have a problem" and "I need to solve it NOW."
  Anti-patterns:
    - Agitation without empathy — making the audience feel stupid for having the problem
    - Weak agitation — "this is a challenge" instead of vivid, specific pain
    - Solution too early — jumping to solve before the audience feels the sting
  Example: P: "Your onboarding takes 3 weeks." A: "That's 3 weeks of salary for every hire who
           can't contribute. 12 hires a year = 36 lost weeks." S: "One playbook. Day-one productive."
```

```
Technique: attention_interest_desire_action (AIDA)
  Category:       structure
  Activation: [
    { signal: persuasion_intent, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: audience_awareness, value: 'solution_aware', weight: 0.3 },
    { signal: pacing_velocity, min: 0.3, max: 0.7, weight: 0.2 },
    { signal: ethos_load, min: 0.3, max: 0.8, weight: 0.2 }
  ]
  Inhibitors: []
  Primary:        Attention (hook) → Interest (relevance) → Desire (benefits) → Action (CTA).
                  Classic funnel. Works best for 60s-3min content / 300-1000 words.
                  Each stage must EARN the next — attention doesn't guarantee interest.
  Weight response:
    persuasion > 0.8: aggressive AIDA — each stage shorter, harder push toward action
    persuasion 0.5-0.8: balanced AIDA — interest and desire get most of the time
  Anti-patterns:
    - Rushing through Interest to get to Desire — audience hasn't bought in yet
    - Desire section that is features-list instead of benefits — "we have X" vs "you get Y"
    - CTA disconnected from Desire — the action must feel like the natural next step
  Why: St. Elmo Lewis (1898). Still works because it maps to the buyer's psychological journey.
  Example: A: "Your customers abandon carts 73% of the time." I: "Most recovery emails feel like spam."
           D: "Imagine a follow-up that sounds like a friend, not a bot." A: "Start your free trial."
```

```
Technique: sparkline_structure
  Category:       structure
  Activation: [
    { signal: tension_arc, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: reflective_depth, min: 0.4, max: 1.0, weight: 0.3 },
    { signal: emotional_valence, min: -0.3, max: 0.8, weight: 0.2 },
    { signal: pacing_velocity, min: 0.2, max: 0.6, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: kairos_pressure, threshold: 0.8 }  // sparklines need space; urgency compresses them
  ]
  Primary:        Alternate between "what is" (current reality) and "what could be" (vision)
                  throughout the piece. Each swing builds amplitude until the final "what could be"
                  becomes irresistible. Duarte's presentation structure.
  Weight response:
    tension > 0.8: wide swings between is/could-be, dramatic contrast
    tension 0.5-0.8: moderate oscillation, clear progression
  Anti-patterns:
    - "What could be" too vague — audience needs to SEE the alternative, not just hear "imagine better"
    - Equal length swings — vary the rhythm, build amplitude (wider swings toward the end)
    - No final resolution — sparkline must end on "what could be" as the new reality
  Why: Nancy Duarte's analysis of great presentations (Sparkline, 2010). The oscillation creates
       sustained engagement because the audience is never settled — always pulled between realities.
  Example: "Today, a junior designer waits 2 days for brand feedback. Imagine instant guardrails.
           Today, your brand voice drifts across 5 freelancers. Imagine one system that remembers."
```

```
Technique: inverted_pyramid
  Category:       structure
  Activation: [
    { signal: logos_load, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: assumed_expertise, min: 0.4, max: 1.0, weight: 0.3 },
    { signal: behavioral_utility, min: 0.4, max: 1.0, weight: 0.2 },
    { signal: temporal_relevance_decay, min: 0.0, max: 0.5, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: narrative_transportation, threshold: 0.7 }  // inverted pyramid kills story immersion
  ]
  Primary:        Most important information FIRST. Supporting details second. Background last.
                  Reader can stop at any point and has the essential information.
                  Journalism's default. Works for news, announcements, updates, reports.
  Weight response:
    logos > 0.8: pure inverted pyramid — headline, lead, details, context
    logos 0.5-0.8: modified inverted pyramid — lead with takeaway, then evidence, then context
  Anti-patterns:
    - Burying the lead — context before conclusion defeats the entire purpose
    - Equal weight per paragraph — each paragraph should be LESS important than the one before
    - Using inverted pyramid for persuasion — it is a clarity structure, not a conversion structure
  Why: AP Stylebook journalism standard. Respects the reader's time and attention.
       Optimized for scanning — most readers don't finish (Sumo analysis of 650K page hits found only ~20% of readers reach the end; Nielsen found avg reader consumes ~20% of page text).
  Example: "Shopify expands AI assistant to all merchants. The tool generates product descriptions,
           ad copy, and email campaigns from a single brief. [details in decreasing importance]"
```

```
Technique: narrative_arc
  Category:       structure
  Activation: [
    { signal: narrative_transportation, min: 0.6, max: 1.0, weight: 0.3 },
    { signal: tension_arc, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: pathos_load, min: 0.4, max: 1.0, weight: 0.2 },
    { signal: specificity_grain, min: 0.4, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: pacing_velocity, threshold: 0.9 }   // stories need development time
    { signal: behavioral_utility, threshold: 0.9 } // pure utility content doesn't need narrative
  ]
  Primary:        Setup (world + character + tension) → Confrontation (obstacle + stakes) → Resolution.
                  Freytag's pyramid adapted for content marketing. The "character" can be the audience,
                  the brand, a customer, or an idea.
  Weight response:
    transportation > 0.8: full three-act — invest in setup, delay resolution, emotional payoff
    transportation 0.6-0.8: compressed arc — setup in one beat, focus on confrontation + resolution
  Anti-patterns:
    - Setup too long — audience loses patience before the story begins
    - Stakes unclear — "things were hard" is not stakes, "she'd lose the account" is stakes
    - Resolution too neat — real stories have rough edges; perfect endings feel fabricated
  Why: Freytag (1863). Stories are the most natural human information structure — we evolved
       to pay attention to narratives. Transportation (Green & Brock 2000) reduces counter-arguing.
  Example: "When Maya launched her bakery, she posted one photo a day. Nobody noticed. Then a food
           blogger walked in by accident..." [confrontation + resolution follows]
```


## 4.4 Narration Mode Techniques

How words and visuals relate in video scripts. Controlled primarily by visual_dependency and show_tell_ratio (Part 2).

```
Technique: narration_anchor
  Category:       narration_mode
  Activation: [
    { signal: visual_dependency, min: 0.0, max: 0.3, weight: 0.4 },
    { signal: show_tell_ratio, min: 0.0, max: 0.3, weight: 0.4 },
    { signal: education_intent, min: 0.3, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: []
  Primary:        Narration carries ALL meaning. Visuals are supplementary or absent.
                  Full spoken script with 150 WPM VO density.
                  150 WPM is the standard voiceover rate (source: National Center for Voice and Speech;
                  confirmed across multiple VO platforms and training resources).
  Example:        Podcast script, radio ad, audiobook chapter, narration-heavy documentary.
```

```
Technique: narration_complement
  Category:       narration_mode
  Activation: [
    { signal: visual_dependency, min: 0.3, max: 0.6, weight: 0.3 },
    { signal: show_tell_ratio, min: 0.3, max: 0.6, weight: 0.3 },
    { signal: multimodal_counterpoint, min: 0.0, max: 0.3, weight: 0.2 },
    { signal: education_intent, min: 0.3, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: []
  Primary:        Narration and visuals SUPPORT each other — same message, different channels.
                  VO explains while screen shows. ~120 WPM density (slower, breathing room for visuals).
                  80% of marketing video content uses this mode.
                  This is the most common narration mode in marketing video content.
  Example:        Standard explainer, product overview, corporate brand video.
```

```
Technique: narration_counterpoint
  Category:       narration_mode
  Activation: [
    { signal: multimodal_counterpoint, min: 0.5, max: 1.0, weight: 0.4 },
    { signal: visual_dependency, min: 0.4, max: 0.8, weight: 0.2 },
    { signal: reflective_depth, min: 0.5, max: 1.0, weight: 0.2 },
    { signal: subtext_depth, min: 0.4, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: assumed_expertise, threshold: 0.3 }  // counterpoint confuses novice audiences (threshold 0.3, not 0.1 — most non-beginner content should be eligible)
  ]
  Primary:        Narration and visuals carry DIFFERENT messages that create meaning through juxtaposition.
                  VO tells one story while the screen shows another — the audience constructs the
                  connection. Advanced technique. ~100 WPM density (sparse, each word must earn its place).
  Example:        Patagonia brand film: serene nature visuals + urgent climate narration.
                  Documentary: upbeat childhood photos + adult voice recounting trauma.
```

```
Technique: narration_minimal
  Category:       narration_mode
  Activation: [
    { signal: visual_dependency, min: 0.7, max: 1.0, weight: 0.4 },
    { signal: show_tell_ratio, min: 0.7, max: 1.0, weight: 0.4 },
    { signal: negative_space, min: 0.5, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: []
  Primary:        Visuals carry the message. Narration is sparse or absent.
                  0-50 WPM. Each word is a deliberate punctuation mark, not explanation.
                  On-screen text may replace spoken narration.
  Example:        Nike "Just Do It" anthem, Apple keynote product reveal, ASMR, cooking video.
```


## 4.5 CTA Techniques

Call-to-action selection based on the content's persuasion mode, audience awareness, and urgency level.

```
Technique: soft_cta
  Category:       cta
  Activation: [
    { signal: cta_type, value: 'soft', weight: 0.5 },
    { signal: autonomy_grant, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: warmth, min: 0.4, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: kairos_pressure, threshold: 0.7 }  // high urgency needs harder CTA
  ]
  Primary:        Invitation, not instruction. "If this resonated, you might enjoy..."
                  Positioned as a natural next step, not a demand. Often embedded in closing content
                  rather than separated as a distinct CTA block.
  Example:        "Want to see this in action? We'd love to show you." / "Follow for more like this."
```

```
Technique: hard_cta
  Category:       cta
  Activation: [
    { signal: cta_type, value: 'hard', weight: 0.5 },
    { signal: behavioral_utility, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: certainty, min: 0.6, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: []
  Primary:        Clear directive with specific action. "Start your free trial." / "Book a demo today."
                  Explicit value proposition in or immediately before the CTA.
                  One CTA per piece — multiple CTAs reduce conversion.
                  Single CTA increased conversion by 266% vs multiple CTAs (source: Campaign Monitor).
                  Hick's Law: decision time increases with number of choices.
  Example:        "Start editing smarter — free for 14 days. No credit card required."
```

```
Technique: urgent_cta
  Category:       cta
  Activation: [
    { signal: cta_type, value: 'urgent', weight: 0.4 },
    { signal: kairos_pressure, min: 0.7, max: 1.0, weight: 0.4 },
    { signal: certainty, min: 0.7, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: formality, threshold: 0.7 }  // urgency + high formality = desperation
    { signal: ethos_load, threshold: 0.8 } // authority brands don't beg
  ]
  Primary:        Time-bound directive with scarcity. "Limited spots. Closes Friday."
                  Must be REAL scarcity — fabricated urgency destroys trust permanently.
                  Combined with specific consequence of inaction.
  Anti-patterns:
    - Fake countdown timers — audience knows. Destroys all future credibility.
    - "Act now!" without a real deadline — generic urgency is noise.
  Example:        "Early access closes in 48 hours. 200 spots. 140 taken."
```


## 4.6 Transition Techniques (Between Sections)

These correspond to the 12 `transition_craft` enum values in Part 2 and the transition styles in Part 0, section 0.7. Each transition type maps to specific writing techniques.

```
Technique: bridge_transition
  Category:       transition
  Activation: [
    { signal: pacing_velocity, min: 0.3, max: 0.7, weight: 0.5 },
    { signal: predictability, min: 0.4, max: 0.8, weight: 0.3 },
    { signal: linguistic_complexity, min: 0.3, max: 0.7, weight: 0.2 }
  ]
  Primary:        Connective sentence linking two sections. "But here's where it gets interesting."
                  / "And that brings us to the real question." The default — safe, clear, professional.
  When to use:    Most section transitions. When in doubt, bridge.
```

```
Technique: callback_transition
  Category:       transition
  Activation: [
    { signal: callback_density, min: 0.4, max: 1.0, weight: 0.4 },
    { signal: narrative_transportation, min: 0.3, max: 1.0, weight: 0.3 },
    { signal: tension_arc, min: 0.3, max: 0.8, weight: 0.3 }
  ]
  Primary:        Reference earlier content to connect forward. "Remember the 12-hour problem
                  we mentioned? Here's why it's actually worse than you think." Creates coherence.
  When to use:    When setup/payoff structure is active. When the piece has planted seeds.
```

```
Technique: drop_transition
  Category:       transition
  Activation: [
    { signal: pivot_intensity, min: 0.5, max: 1.0, weight: 0.4 },
    { signal: rhythmic_variation, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: negative_space, min: 0.3, max: 0.8, weight: 0.3 }
  ]
  Primary:        Strip all ornamentation. After flowing prose, one short declarative sentence.
                  The texture shift IS the emphasis. "That changed everything." Period. New paragraph.
  When to use:    At the pivot point. When the piece needs to land a single fact with maximum impact.
```

```
Technique: withhold_transition
  Category:       transition
  Activation: [
    { signal: tension_arc, min: 0.5, max: 1.0, weight: 0.4 },
    { signal: implication_reliance, min: 0.4, max: 1.0, weight: 0.3 },
    { signal: subtext_depth, min: 0.3, max: 0.8, weight: 0.3 }
  ]
  Primary:        End the section with an unanswered question or incomplete thought.
                  Force the audience forward through absence. "And then she opened the envelope."
                  [new section starts WITHOUT revealing what was inside — for 2 more paragraphs]
  When to use:    When tension is the primary engagement driver. Cliffhanger at section boundary.
```


## 4.7 Informational Surprise Techniques

These are the informational and meta surprise types that Part 3 routed here (not signal dynamics — these are writing techniques triggered by signal conditions).

```
Technique: recontextualization_reveal
  Category:       informational_surprise
  Activation: [
    { signal: pivot_intensity, min: 0.6, max: 1.0, weight: 0.3 },
    { signal: subtext_depth, min: 0.5, max: 1.0, weight: 0.3 },
    { signal: novelty, min: 0.5, max: 1.0, weight: 0.2 },
    { signal: narrative_transportation, min: 0.5, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: predictability, threshold: 0.8 }  // high predictability means audience sees it coming
  ]
  Primary:        A reveal that RECONTEXTUALIZES everything the audience has read/watched.
                  All prior content takes on new meaning. This is not a twist — it is a deeper truth
                  that was always there, now visible.
  Anti-patterns:
    - The reveal must be EARNED — planted seeds must exist earlier in the piece
    - The reveal must be TRUE — fabricated revelations feel like manipulation
    - Overuse destroys credibility — once per piece maximum, once per campaign is better
  Example:        "The reason I know this works is because I was that agency owner. The one who
                  edited every video herself. The 12-hour days were mine."
  Why: Predictive processing violation (Friston 2010) — the brain's prediction model updates
       retroactively. The emotional impact comes from revising PAST understanding, not just
       learning something new.
```

```
Technique: meta_break
  Category:       informational_surprise
  Activation: [
    { signal: humor, min: 0.4, max: 1.0, weight: 0.3 },
    { signal: formality, min: -1.0, max: 0.0, weight: 0.3 },
    { signal: intensity_performance, min: 0.3, max: 0.8, weight: 0.2 },
    { signal: entertainment_intent, min: 0.5, max: 1.0, weight: 0.2 }
  ]
  Inhibitors: [
    { signal: formality, threshold: 0.5 }   // meta breaks feel jarring in formal content
    { signal: ethos_load, threshold: 0.8 }   // authority voices don't break the fourth wall
  ]
  Primary:        Break the fourth wall. Acknowledge the medium. "Yes, this is a marketing video.
                  Yes, we're trying to sell you something. But here's why you should care anyway."
                  Disarms audience defenses through honesty.
  Anti-patterns:
    - Meta breaks that undermine the entire piece — the break should STRENGTHEN the message
    - Multiple meta breaks — one is refreshing, two is a gimmick
  Example:        "Look, I know what you're thinking — 'another AI tool.' Stay with me for 30 seconds."
  Why: Deadpool effect — breaking conventions signals confidence and earns trust through vulnerability.
       Advertising research: self-aware ads outperform non-self-aware on brand recall (Eisend 2009).
       ⚠️ Eisend 2009 is a meta-analysis of advertising humor — the "self-aware ads" claim is extrapolated from
       his findings on humor + advertising effectiveness, not a direct study of meta-awareness.
```


## 4.8 Atlas Expansion

This atlas contains the INITIAL technique set — enough to cover the core writing decisions (hooks, structures, narration modes, CTAs, transitions, surprises). It is NOT exhaustive. Part 5 (Writing Technique Reference) contains the full description of each technique family. This atlas defines WHEN each technique fires; Part 5 defines HOW to execute it.

### Missing technique categories (to be added as the system matures)

**Priority 1 (should be in v1.1):**
- **Empathy/relatability hook** — "I've been there too" — warmth + pathos driven, distinct from story hook (CEO review)
- **Social proof/testimonial hook** — "We helped X achieve Y" — ethos + solution_aware audiences (Copywriter review)
- **Curiosity gap hook** — withholds rather than asks, distinct from question hook (Copywriter review)
- **Repetition techniques** — anaphora, epistrophe, symploce based on emphasis signals (CEO: fundamental, not advanced)
- **Tone/register modulation** — deliberate mid-piece register shifts as persuasion tool (Copywriter review)
- **Closing techniques** — callback close, open question, restatement, cliffhanger (beyond CTA)

**Priority 2 (v1.2+):**
- **Caption/on-screen text techniques** — when to use on-screen text vs narration vs both
- **Formatting techniques** — paragraph length, bullet lists, headers, whitespace density
- **Evidence presentation techniques** — how to present data, quotes, testimonials per signal profile
- **Social proof techniques** — when/how to introduce testimonials, numbers, named brands

These categories will follow the same TechniqueCard format with activation conditions, inhibitors, and weight responses. Thompson Sampling and performance feedback will also DISCOVER new technique mappings from user data over time — the atlas grows.

---

*End of Part 4 — Signal → Writing Technique Atlas*

---

# PART 5 — WRITING TECHNIQUE REFERENCE

Every technique the system can execute. Part 4 says WHEN to use each technique (signal triggers). This Part says WHAT each technique does, WHY it works on human brains, and HOW it's configured. Each entry covers: the technique's effect, its perceptual/rhetorical mechanism, parameters, what it pairs with, anti-patterns, and cultural considerations.

This Part is designed to be READ BY THE LLM during generation — it is the craft knowledge that transforms signal-driven technique selection into actual well-written content.


## 5.0 Hook Technique Reference

### Question Hook — Full Specification

**What it does:** Opens with a specific question the audience already has but hasn't articulated. Forces an open loop (Zeigarnik effect) that can only be closed by continuing.

**Parameters:**
- Specificity level: generic ("Want growth?") → specific ("What happens to pipeline when your top AE quits mid-quarter?")
- Question type: diagnostic ("Is your X doing Y?"), hypothetical ("What if Z?"), provocative ("Why does everyone assume X?")
- Follow-up timing: answer delay in sentences (1 = immediate context, 3 = build suspense, 5+ = long-form withhold)

**Perceptual mechanism:** Zeigarnik (1927) — incomplete tasks create cognitive tension that persists until closure. A question IS an incomplete task. The brain treats an unanswered question as an open to-do item. Completion bias drives continued engagement.

**Pairs with:** Ethos marker immediately after (establishes right to ask). Specificity in the question body (generic questions don't open loops — the brain already has a generic answer).

**Cultural considerations:** Direct questions read differently across cultures. US/UK: engaging, conversational. Japan: potentially confrontational if too direct. Germany: welcomed if substantive, resented if rhetorical. Adjust directness via `formality` and `power_dynamic` signals.

**Anti-AI markers:** LLM-generated questions tend toward: "Have you ever wondered...?", "What if I told you...?", "Did you know that...?" — all flagged as AI tells. Real questions are specific to the audience's situation, not generic curiosity prompts.

### Statistic Hook — Full Specification

**What it does:** Opens with a counterintuitive data point that creates a prediction error. The stat must CONTRADICT what the audience believes — confirming known facts is not a hook.

**Parameters:**
- Source requirement: MUST cite source. Unsourced stats are the #1 AI tell in content.
- Framing: raw number ("73%") vs narrative embed ("Most people assume X. The data says otherwise.")
- Shock calibration: the stat should surprise but not strain credulity. "5% improvement" is boring. "10,000% improvement" triggers BS detector.

**Perceptual mechanism:** Rescorla-Wagner prediction error model (1972) — when observed data contradicts expected data, the brain allocates attention to resolve the discrepancy. The larger the prediction error, the more attention — up to a credibility threshold.

**⚠️ CRITICAL CONSTRAINT:** The system NEVER fabricates statistics. All stats must be sourced from: user-provided brief, brand knowledge base, or user-uploaded reference materials. If no stat is available, this technique is INHIBITED and the system selects an alternative hook. See Part 0, section 0.8 (Content Text Sources).

### Story Hook — Full Specification

**What it does:** Opens in the middle of a specific, vivid moment. Not backstory — a scene the audience enters immediately. In medias res applied to content marketing.

**Parameters:**
- Entry point: crisis moment (high pathos) | decision moment (moderate) | sensory moment (visceral)
- Specificity: details that could only be true (the time, the place, the specific object) — generality kills transportation
- Delay before context: 1-3 sentences of scene before explaining why it matters

**Perceptual mechanism:** Green & Brock (2000) transportation theory — narrative absorption reduces the audience's counter-arguing defenses. A vivid scene activates the brain's simulation machinery (mental imagery, mirror neurons) before the evaluative machinery can engage. By the time critical thinking kicks in, the audience is already invested.

**Key distinction from narrative_arc structure:** Story hook is just the OPENING. It can lead into any structure (PAS, AIDA, inverted pyramid). Narrative arc is the entire piece shaped as a story.

### Provocation Hook — Full Specification

**What it does:** Opens with a bold, contrarian claim that challenges conventional wisdom. The claim must be DEFENSIBLE — provocation without evidence is clickbait.

**Parameters:**
- Strength: qualified ("The data suggests X is wrong") → absolute ("X is dead")
- Target: challenge an ASSUMPTION, not the AUDIENCE. "Your strategy is wrong" attacks them. "The assumption behind most strategies is wrong" attacks the assumption.
- Evidence preview: signal immediately that proof is coming ("...and here's the data")

**Perceptual mechanism:** Festinger's cognitive dissonance (1957) — a confident claim that contradicts existing beliefs creates discomfort. The audience resolves discomfort by engaging with the argument (consonance-seeking behavior).

### Pattern Interrupt Hook — Full Specification

**What it does:** Opens with something unexpected that triggers the orienting response — a jarring visual direction, sentence fragment, contradiction. Goal: the 0.4-second stopping reaction.

**Parameters:**
- Interrupt type: visual (unexpected image/scene), textual (fragment, contradiction, unexpected register), auditory (for video: silence after noise, noise after silence)
- Recovery time: context MUST follow within 2 sentences or audience bounces
- Freshness: the same interrupt pattern loses effectiveness after 3-5 uses — must rotate

**Perceptual mechanism:** Sokolov (1963) orienting response — novel stimuli trigger involuntary attention allocation. The brain cannot ignore a pattern violation — it must assess whether the anomaly is a threat or opportunity. This buys ~3 seconds of guaranteed attention.

**Platform note:** Pattern interrupts are the dominant hook type on TikTok/Reels. 84.3% of viral TikToks use hook triggers in the first 3 seconds (source: ttsvibes.com 2025 — industry analysis). But overuse creates platform-level fatigue — when every video opens with a pattern interrupt, none of them interrupt.

### Outcome Hook — Full Specification

**What it does:** Opens with the RESULT the audience wants, then explains how to get there. Destination first, journey second.

**Parameters:**
- Specificity: must include at least one concrete marker (number, timeframe, or constraint)
- Credibility: the outcome must be believable. Internal heuristic: if the audience's first reaction is "bullshit," the hook failed
- Effort preview: hint at the effort required — outcomes without effort feel like scams

**Perceptual mechanism:** Effort-outcome ratio evaluation — the brain assesses whether effort is worth the stated result. Showing the outcome first makes the audience evaluate the effort IN CONTEXT of the reward rather than in isolation.


## 5.1 Structure Technique Reference

### PAS (Problem-Agitate-Solve)

**Origin:** Direct response copywriting (Dan Kennedy, Gary Halbert, 1970s-80s).
**Mechanism:** Agitation bridges the gap between "I have a problem" and "I NEED to solve it NOW." Without agitation, the audience acknowledges the problem and moves on. Agitation makes the problem VIVID, SPECIFIC, and PERSONAL.

**The agitation principle:** Good agitation is NOT repeating the problem louder. It is showing the CONSEQUENCES — the second-order effects the audience hasn't considered. "Your video takes 12 hours" is the problem. "That's 3 months of a salary annually that produces content your competitor makes in an afternoon" is agitation.

**Duration fit:** Best under 60s / 300 words. PAS is a sprint, not a marathon.

### AIDA (Attention-Interest-Desire-Action)

**Origin:** St. Elmo Lewis (1898). The oldest formal advertising structure.
**Mechanism:** Maps to the buyer's psychological journey. Each stage must EARN the next — attention doesn't guarantee interest, interest doesn't guarantee desire.

**Critical failure point:** Most AIDA implementations rush Interest to get to Desire. Interest is where credibility is built — skip it and Desire feels unearned. The test: if you removed the Desire section, would the audience still trust the brand? If no, Interest was too thin.

### Duarte Sparkline

**Origin:** Nancy Duarte, "Resonate" (2010). Analysis of great presentations (MLK, Steve Jobs, etc.).
**Mechanism:** Oscillation between "what is" (current painful reality) and "what could be" (envisioned better state). Each swing increases amplitude. The audience is never settled — always pulled between worlds.

**The amplitude principle:** Early swings are gentle (small gap between is/could-be). Late swings are dramatic (large gap). The final "what could be" must feel INEVITABLE — the audience has been pulled so far toward the vision that returning to "what is" feels impossible.

### Inverted Pyramid

**Origin:** Associated Press journalism standard (1860s telegraph era — most important info first in case the wire cut mid-transmission).
**Mechanism:** Respects the reader's time absolutely. Every sentence is less important than the one before. Reader can stop at ANY point and has the essential information.

**When it fails:** Persuasion. Inverted pyramid has zero emotional build. It delivers facts, not desire. Using it for sales content produces journalism, not marketing.

### Narrative Arc

**Origin:** Freytag (1863), Campbell (1949), Vogler (1998).
**Mechanism:** Setup → Confrontation → Resolution maps to the brain's natural story-processing architecture. Stories activate the default mode network — the brain's "meaning-making" system.

**The character principle:** Every narrative needs a character the audience identifies with. The character can be: the audience themselves ("you were struggling"), a customer ("Sarah's agency"), the brand ("when we started"), or an idea ("the old way of thinking"). Without a character, there is no empathy, and without empathy, there is no transportation.


## 5.2 Narration Mode Reference

### Anchor Mode (visual_dependency < 0.3)

**What it produces:** Dense narration script — 150 WPM, continuous spoken word, visuals supplementary.
**Where it's used:** Podcasts, radio, audiobooks, narration-heavy documentaries.
**Key principle:** Every word must carry weight. Without visual support, weak words create dead air. The voice IS the entire experience — rhythm, pacing, emphasis all live in the text.

### Complement Mode (visual_dependency 0.3-0.6)

**What it produces:** Balanced script — 120 WPM, narration explains while visuals demonstrate.
**Where it's used:** 80% of marketing video content. Standard explainers, product overviews.
**Key principle:** Audio and visual say the SAME thing in DIFFERENT ways (dual coding, Mayer 2009). The narration provides the abstract understanding. The visual provides the concrete example. Together they encode more strongly than either alone.

### Counterpoint Mode (multimodal_counterpoint > 0.5)

**What it produces:** Sparse, deliberate narration — 100 WPM, each word chosen for its contrast with the visual.
**Where it's used:** Brand films, documentaries, artistic advertising.
**Key principle:** The meaning lives in the GAP between what is seen and what is heard. Patagonia's nature footage + climate urgency narration creates more impact than either alone because the audience's brain must RESOLVE the tension between the two channels.

### Minimal Mode (visual_dependency > 0.7)

**What it produces:** Near-silent script — 0-50 WPM, words as punctuation, not explanation.
**Where it's used:** Product reveals, ASMR, cinematic montage, cooking videos.
**Key principle:** Each word must earn its place. In minimal mode, a single sentence carries the weight of an entire paragraph in anchor mode. If the word doesn't change the audience's understanding of the visual, cut it.


## 5.3 CTA Technique Reference

### Soft CTA

**What it does:** Invitation, not instruction. Feels like a natural extension of the content, not a sales pitch appended to the end.
**Key principle:** The CTA must feel EARNED. If the content provided genuine value, the audience grants permission for a soft ask. If the content was thin, even a soft CTA feels extractive.
**Execution:** Embed in closing content rather than separating as a distinct block. "If this resonated..." or "We'd love to show you..." — language of invitation, not direction.

### Hard CTA

**What it does:** Clear directive with specific action and explicit value proposition.
**Key principle:** One CTA per piece. Multiple CTAs trigger Hick's Law — choice paralysis reduces conversion. The CTA must name the action AND the benefit in one sentence.
**Execution:** "Start your free trial — no credit card required." Action (start) + incentive (free) + friction removal (no card). Every word earns its place.

### Urgent CTA

**What it does:** Time-bound directive with REAL scarcity.
**Key principle:** Fabricated urgency destroys trust permanently. "Limited time!" without an actual deadline is noise. Real urgency names the deadline, the quantity, and the consequence of inaction.
**Execution:** "Early access closes Friday. 200 spots, 140 taken." Specific deadline + specific quantity + social proof (others already acted).
**Anti-pattern:** Fake countdown timers. The audience knows. They always know.


## 5.4 Transition Technique Reference

### Bridge

**What it does:** Connective sentence linking sections. The default, safe, professional choice.
**Execution:** "But here's where it gets interesting." / "And that brings us to..." / "Which raises a question."
**When it fails:** Overuse. If every transition is a bridge, the piece reads as a chain of linked paragraphs instead of a flowing argument.

### Callback

**What it does:** References earlier content to connect forward. Creates narrative coherence across distance.
**Execution:** "Remember the [specific detail from section 1]? Here's why it matters." The callback must reference something SPECIFIC, not vague ("as we discussed earlier" = weak).
**Key principle:** Setup must exist for callback to work. Planting a detail early and paying it off later creates the most satisfying coherence. Robert McKee: "Setup/payoff is the fundamental unit of storytelling."

### The Drop

**What it does:** Strips all ornamentation. One short declarative sentence after flowing prose. Texture shift as emphasis.
**Execution:** End a flowing paragraph. New line. Short sentence. Period. "That changed everything." The contrast with the preceding rhythm IS the emphasis.
**Key principle:** Works exactly once per piece. A second drop loses impact. A third is a gimmick.

### The Withhold

**What it does:** Ends a section with an unanswered question or incomplete thought. Forces the audience forward through absence.
**Execution:** "And then she opened the envelope." [New section starts WITHOUT revealing contents for 2+ paragraphs.] The audience's need for closure pulls them through.
**Key principle:** The withhold must eventually PAY OFF. Withholding indefinitely is frustration, not craft. The payoff should arrive 2-5 sections later, not immediately (too quick = no tension) or never (broken promise).


## 5.5 Informational Surprise Technique Reference

### Recontextualization Reveal

**What it does:** A reveal that changes the meaning of everything the audience has already consumed. Not a twist — a deeper truth that was always present, now visible.
**Key principle:** The reveal must be PLANTED. Seeds must exist in earlier content that, in retrospect, pointed to the truth. Without seeds, the reveal feels arbitrary. With seeds, the audience gets the double pleasure of surprise + "I should have seen that."
**Execution:** Build the piece around a conventional interpretation. Accumulate details that support the interpretation AND the hidden truth. At the reveal moment, restate one early detail with new context. "The reason I know this works is because I was that agency owner."
**Frequency:** Once per piece maximum. Once per campaign is often enough. Overuse destroys trust.

### Meta Break

**What it does:** Breaks the fourth wall. Acknowledges the medium. Disarms audience defenses through honesty.
**Key principle:** The meta break must STRENGTHEN the message, not undermine it. "Yes, this is a marketing video. But stay with me for 30 seconds — here's why it matters anyway." The honesty earns more trust than the illusion of objectivity.
**Execution:** Acknowledge what the audience is already thinking. "I know — another AI tool." / "You probably saw this coming." Then pivot to why the acknowledgment itself is the point.
**Frequency:** Once per piece. More than once shifts from self-aware to insecure.


---

# PART 6 — WRITING CONSTRAINTS

Deterministic rules that ALWAYS apply — anti-patterns, platform limits, brand safety, readability, regulatory. These are not techniques (flexible, signal-driven). These are CONSTRAINTS (absolute, rule-driven).

Every constraint is overridable by the user. Every override is logged as a learning signal. But the DEFAULT is enforcement — the system protects the user from mistakes.


## 6.0 Constraint Format

```
Constraint: name
  Severity:        critical (-15) | warning (-5) | info (-1)
  Detection:       how the system detects the violation
  Auto-correction: what the system does to fix it
  Why:             why this matters
  Overridable:     yes | no | brand-admin-only
```

Quality scoring: every piece starts at 100. Constraints deduct based on severity. `finalScore = max(0, 100 - sumOfDeductions)`. Score < 70 = auto-review flag. Score < 50 = below production standard. Score 0 = hard-reject, requires human rewrite.

⚠️ Severity weights (-15, -5, -1) are engineering defaults, not empirically calibrated. They should be refined from performance data as the system matures.


## 6.1 Anti-AI Constraints

The most important constraint category. AI-generated content is increasingly detectable — by audiences, platforms, and brand managers. These constraints force the system to write like a HUMAN, not like a language model.

```
Constraint: ai_filler_words
  Severity:        warning (-5) per occurrence
  Detection:       match against banned phrase list (600+ patterns)
  Auto-correction: replace with brand-appropriate alternative or delete
  Why:             LLM-generated content has telltale filler: "In today's fast-paced world",
                   "It's important to note that", "Let's dive in", "At the end of the day",
                   "game-changer", "leverage", "unlock", "empower", "cutting-edge",
                   "seamless", "robust", "innovative", "synergy", "circle back"
  Overridable:     yes (some industries genuinely use these words)

Constraint: uniform_sentence_length
  Severity:        warning (-5)
  Detection:       standard deviation of sentence word-count < 15% of mean over 10+ sentences
  Auto-correction: flag for rewrite with rhythm variation target
  Why:             LLMs produce metronomically uniform sentences. Human writers vary naturally.
                   See Part 2: rhythmic_variation signal.
  Overridable:     yes

Constraint: formulaic_opener
  Severity:        info (-1)
  Detection:       opening matches common LLM patterns: "In today's...", "Have you ever...",
                   "What if I told you...", "Did you know that..."
  Auto-correction: rewrite opener using selected hook technique from Part 4
  Why:             Trained audiences (especially marketing professionals) detect these instantly.

Constraint: paragraph_uniformity
  Severity:        info (-1)
  Detection:       all paragraphs within ±20% of same length for 5+ consecutive paragraphs
  Auto-correction: flag for structural variation
  Why:             LLMs produce uniform paragraph blocks. Human writers vary paragraph length
                   deliberately — short punch paragraphs, long development paragraphs.

Constraint: hedging_overload
  Severity:        warning (-5)
  Detection:       >3 hedge phrases per 200 words ("it seems", "perhaps", "might", "could potentially")
  Auto-correction: strengthen claims or remove hedges, per certainty signal
  Why:             LLMs over-hedge to seem balanced. Real writers commit to their claims.
                   Exception: certainty < 0.4 (deliberately provisional content is exempt)

Constraint: list_dependency
  Severity:        info (-1)
  Detection:       >40% of content is bulleted/numbered lists
  Auto-correction: convert some lists to prose
  Why:             LLMs default to lists as a crutch. Lists are a valid formatting tool (Part 4 atlas)
                   but content that is MOSTLY lists reads as outline, not finished work.

Constraint: transition_word_overload
  Severity:        warning (-5)
  Detection:       >4 formal transition words per 300 words ("furthermore", "moreover", "additionally",
                   "consequently", "nevertheless", "in conclusion")
  Auto-correction: remove or replace with natural connective language
  Why:             LLMs over-use academic transition words. Real writers use implicit transitions,
                   conjunctions, or white space — not a thesaurus of "moreover."

Constraint: three_examples_pattern
  Severity:        info (-1)
  Detection:       3+ instances of exactly-three-item lists or "three reasons/tips/steps" in one piece
  Auto-correction: flag — vary list lengths (2, 4, 5, 7 are all valid)
  Why:             LLMs almost always generate exactly 3 examples. The "rule of three" is real but
                   when EVERY list has exactly 3 items, it signals AI generation.

Constraint: false_balance_hedge
  Severity:        info (-1)
  Detection:       pattern: "While X, it's also true that Y" or "On one hand... on the other hand"
                   appearing 2+ times in one piece
  Auto-correction: flag for rewrite — commit to a position or acknowledge complexity without formula
  Why:             LLMs hedge by presenting both sides in a formulaic pattern. Real writers who
                   genuinely see both sides express it with nuance, not with "on the other hand."

Constraint: summary_restatement
  Severity:        info (-1)
  Detection:       final paragraph restates 3+ key points already made in the piece, using similar phrasing
  Auto-correction: flag — replace with forward-looking close, CTA, or callback (Part 4 closing techniques)
  Why:             The trademark LLM ending: "In summary, we've covered X, Y, and Z." Real writers
                   end with resonance, not recitation. If the reader needs a summary, the piece was too long.
```


## 6.2 Platform Constraints

Hard limits per platform. These are FACTS, not recommendations. Exceeding them causes content to be truncated, rejected, or de-prioritized by the platform's algorithm.

```
Constraint: platform_character_limit
  Severity:        critical (-15)
  Detection:       content length exceeds platform maximum
  Auto-correction: trim content, prioritizing removal of lowest-weight scenes/sections
  Platforms:       see Part 8 for exact limits per platform
  Overridable:     no (platform enforces this regardless)

Constraint: platform_duration_limit
  Severity:        critical (-15)
  Detection:       video script duration (word count / WPM) exceeds platform maximum
  Auto-correction: flag excess scenes for user review
  Platforms:       see Part 8 for exact duration limits
  Overridable:     no

Constraint: hook_within_threshold
  Severity:        warning (-5)
  Detection:       first substantive hook element appears after platform-specific threshold
                   TikTok: 3 seconds. Instagram Reels: 3 seconds. YouTube: 10 seconds.
                   LinkedIn: first 210 characters (desktop) / 140 characters (mobile)
  Auto-correction: restructure to front-load hook
  Why:             each platform has a measured attention threshold — content that doesn't
                   hook within it gets zero algorithmic distribution
  Overridable:     yes (some artistic content deliberately delays the hook)
```


## 6.3 Pacing Constraints

```
Constraint: wpm_exceeds_format
  Severity:        warning (-5)
  Detection:       word count / duration exceeds comfortable WPM for format
                   Video narration: > 170 WPM (uncomfortable VO pace)
                   Presentation: > 160 WPM (speaker can't keep up)
                   Podcast: > 190 WPM (listener fatigue)
                   ⚠️ WPM thresholds are industry standards confirmed across VO training resources.
                   Standard VO: 150 WPM. Fast: 170-180 WPM. Slow: 120-130 WPM.
  Auto-correction: flag excess words for trim or increase target_length
  Overridable:     yes

Constraint: information_overload
  Severity:        warning (-5)
  Detection:       cognitive_load (derived) > 0.8 AND negative_space < 0.2
  Auto-correction: add section breaks, whitespace, or simplify language
  Why:             Sweller's cognitive load theory — intrinsic load + extraneous load must not
                   exceed working memory capacity. Dense content without breathing room overwhelms.
  Overridable:     yes
```


## 6.4 Brand Safety Constraints

```
Constraint: kill_list_violation
  Severity:        critical (-15)
  Detection:       deterministic string matching against Brand DNA kill list (Part 1)
  Auto-correction: replace with preferred alternative from vocabulary hierarchy
  Overridable:     brand-admin-only

Constraint: tone_guardrail_breach
  Severity:        warning (-5)
  Detection:       output signal values exceed Brand DNA tone guardrails (Part 1)
  Auto-correction: flag for rewrite with adjusted signal targets
  Overridable:     brand-admin-only

Constraint: competitor_mention
  Severity:        warning (-5) or critical (-15) depending on competitor_policy
  Detection:       named competitor detected in output (requires competitor list in Brand DNA)
  Auto-correction: remove mention or replace with generic reference per competitor_policy
  Overridable:     yes
```


## 6.5 Readability Constraints

```
Constraint: reading_level_exceeded
  Severity:        warning (-5)
  Detection:       Flesch-Kincaid grade level exceeds reading_level_target by > 2 grades
  Auto-correction: simplify vocabulary and sentence structure
  Why:             content that exceeds the audience's reading comfort level gets abandoned.
                   Grade 8 = mass consumer. Grade 12 = professional. Grade 16+ = academic.
                   ⚠️ Flesch-Kincaid is a proxy — it measures syntax complexity, not conceptual difficulty.
  Overridable:     yes

Constraint: jargon_density
  Severity:        info (-1)
  Detection:       >5% of words are domain-specific jargon AND assumed_expertise < 0.5
  Auto-correction: flag jargon words, suggest plain-language alternatives
  Why:             jargon is a barrier for non-expert audiences. It is CORRECT for expert audiences
                   (in_group_signal > 0.7) — this constraint is suppressed when expertise is high.
  Overridable:     yes
```


## 6.6 Regulatory Constraints

These activate when `regulatory_profile` is set (Part 1, section 1.5). They are NON-OVERRIDABLE — legal compliance is not a creative choice.

⚠️ Part 1.5 defines 9 regulatory industries. This section provides explicit constraint rules for 3 (pharma, finance, alcohol). The remaining 6 (legal, gambling, food_beverage, healthcare, insurance, crypto) require industry-specific constraint rules that have NOT been written yet. Until those rules exist, the system should flag content in those industries for mandatory human review rather than silently applying no constraints.

```
Constraint: missing_required_disclosure
  Severity:        critical (-15)
  Detection:       regulatory_profile requires disclosures AND output does not contain them
  Auto-correction: append required disclosure text (system flags location, human writes disclosure)
  Overridable:     no

Constraint: banned_regulatory_claim
  Severity:        critical (-15)
  Detection:       output contains claim type banned by regulatory_profile
                   Pharma: cure/prevent/treat claims without FDA-approved indications
                   Finance: guaranteed returns, specific performance predictions
                   Alcohol: health benefits, targeting minors
  Auto-correction: remove claim, flag for human rewrite
  Overridable:     no

Constraint: superlative_in_regulated_content
  Severity:        warning (-5)
  Detection:       superlatives ("best", "fastest", "most effective", "#1") in regulated content
  Auto-correction: remove superlative, replace with qualified claim
  Why:             regulated industries (pharma, finance) ban superlatives unless substantiated
  Overridable:     no (in regulated context)
```


## 6.7 Content Integrity Constraints

```
Constraint: unsourced_statistic
  Severity:        critical (-15)
  Detection:       numeric claim (percentage, count, monetary value) without source attribution
  Auto-correction: flag claim, require user to provide source or remove
  Why:             AI-fabricated statistics are the #1 credibility risk. Every number must trace
                   to user-provided material (Part 0, section 0.8).
  Overridable:     no (for claims). Yes (for illustrative round numbers in non-claim context).

Constraint: fabricated_testimonial
  Severity:        critical (-15)
  Detection:       quote attributed to a named person/company not in user-provided materials
  Auto-correction: remove quote, flag for user
  Why:             fabricated testimonials are FTC violations (US) and ASA violations (UK)
                   regardless of industry
  Overridable:     no

Constraint: unverifiable_claim
  Severity:        warning (-5)
  Detection:       claim that cannot be verified from user-provided materials
                   (e.g., "industry-leading", "best-in-class", "revolutionary")
  Auto-correction: replace with specific, verifiable claim or remove
  Overridable:     yes (user may have external verification)
```

---

# PART 7 — IRREDUCIBLE WRITING KNOWLEDGE

Theory for genuinely novel creative situations — when Parts 1-6 don't have a signal, mapping, technique, or constraint that covers the decision at hand.

**This section is designed to SHRINK over time.** As more patterns get captured as structured techniques (Parts 4-5) and constraints (Part 6), less needs to live here as unstructured theory. When performance data shows that a particular principle consistently produces a specific signal → technique pattern, that pattern graduates from Part 7 into Part 4.

**Who reads this:** ThinkForge agents (for creative reasoning), the outline agent (for structural decisions), and any consumer that needs to reason about WHY the system's rules exist.


## 7.0 Aristotle's Rhetoric — The Persuasion Triangle

**Source:** Aristotle, "Rhetoric" (~330 BCE)

Three modes of persuasion, in dynamic balance:
- **Logos** (logic) — evidence, data, reasoning. "Here are the facts."
- **Pathos** (emotion) — feelings, stories, imagery. "Here is how it feels."
- **Ethos** (credibility) — character, authority, trust. "Here is why I can tell you."

**The key insight:** No mode works alone. Pure logos is a textbook — convincing but not moving. Pure pathos is manipulation — moving but not convincing. Pure ethos is an appeal to authority — trusted but not substantiated. Great content balances all three, with the MIX determined by the signal profile (Part 2, Rhetorical axis).

**Kairos** (the right moment) — Aristotle's often-forgotten fourth concept. The SAME argument lands differently at different times. A climate message during a drought hits differently than during a snowstorm. Part 2's `kairos_pressure` signal captures this.


## 7.1 Freytag's Dramatic Structure

**Source:** Gustav Freytag, "Die Technik des Dramas" (1863)

Five-act structure underlying most Western narrative:
```
Exposition → Rising Action → Climax → Falling Action → Denouement
```

**Applied to content:** Even a 30-second TikTok has a micro-version: setup (3s) → build (10s) → peak (5s) → resolve (7s) → close (5s). The proportions change; the shape persists.

**The tension principle:** Audiences engage with RISING tension, not stable states. Content that maintains a flat emotional level — even a HIGH flat level — loses the audience. The CHANGE matters more than the absolute value. This is why Part 3 (Signal Dynamics) exists.


## 7.2 Cialdini's Six Principles of Influence

**Source:** Robert Cialdini, "Influence: The Psychology of Persuasion" (1984)

Six universal influence principles, each mapping to signals:

1. **Reciprocity** — give before asking. Mapped: high `behavioral_utility` + delayed CTA
2. **Commitment/Consistency** — small yeses lead to big yeses. Mapped: progressive `audience_awareness` stages
3. **Social Proof** — others are doing it. Mapped: `social_proof_reliance` signal
4. **Authority** — experts say so. Mapped: `ethos_load` + `certainty`
5. **Liking** — people buy from people they like. Mapped: `warmth` + `in_group_signal`
6. **Scarcity** — limited availability. Mapped: `kairos_pressure` signal

**The system connection:** Cialdini's principles are not techniques — they are REASONS techniques work. The technique atlas (Part 4) implements the techniques. Cialdini explains WHY they work, which helps agents make judgment calls in novel situations.


## 7.3 Mayer's 12 Principles of Multimedia Learning

**Source:** Richard Mayer, "Multimedia Learning" (2009, 3rd ed. 2020)

Twelve evidence-based principles for content that combines words and images. Critical for video scripts.

Most relevant to writing:
1. **Coherence** — remove extraneous material. Every element must serve the learning goal.
2. **Signaling** — highlight essential information. Bold, emphasis, structure.
3. **Segmenting** — break complex info into learner-paced segments.
4. **Pre-training** — introduce key concepts before the main lesson.
5. **Modality** — present words as narration rather than on-screen text (for video).
6. **Redundancy** — do NOT present identical text on screen AND in narration simultaneously.
7. **Temporal contiguity** — present words and pictures simultaneously, not sequentially.

**The redundancy trap:** Many video scripts violate principle 6 — the narrator reads the on-screen text verbatim. This REDUCES learning because the audience processes the same information twice through competing channels. Video scripts should have on-screen text that COMPLEMENTS narration, not duplicates it. This maps directly to `multimodal_counterpoint` > 0 (Part 2).


## 7.4 Attention Science — The Economy of Focus

**Key sources:** Kahneman "Thinking, Fast and Slow" (2011), NN/g research (ongoing)

**The 3-second window:** On social platforms, content has approximately 3 seconds to demonstrate value before the user scrolls. This is not a metaphor — it is measured behavior. 70%+ of users decide within 3 seconds (source: TikTok retention research 2025, multiple industry analyses).

**Selective attention:** The brain cannot process everything — it SELECTS. Content competes for attention against every other piece of content in the feed, plus the user's own thoughts. Winning attention requires either relevance (the content addresses an active need) or novelty (the content is unexpected enough to trigger the orienting response).

**Attention is NOT engagement.** Capturing attention (the hook) and maintaining engagement (the structure) are different cognitive processes. A pattern interrupt captures attention. A narrative arc maintains engagement. Using pattern interrupts throughout a piece produces attention fatigue — the orienting response habituates after 3-5 unexpected events.

**The NN/g finding:** Average screen-based attention has dropped to approximately 43 seconds as of recent measurement (source: NN/g Digital Focus Report). This does NOT mean content must be 43 seconds — it means content must RE-EARN attention approximately every 43 seconds through new information, new emotion, or new structure.

⚠️ The "8.25-second attention span" (Microsoft 2015) is widely cited but has no peer-reviewed support and conflates selective attention with sustained attention. It should not be used as a design parameter.


## 7.5 Green & Brock's Transportation Theory

**Source:** Green & Brock, "The Role of Transportation in the Persuasiveness of Public Narratives" (2000)

**Core finding:** When an audience is "transported" into a narrative, their counter-arguing defenses decrease. They accept claims within the story that they would reject in a non-narrative context.

**Implications for content:** Story-driven content (narrative_transportation > 0.6) is more persuasive than argument-driven content for audiences who are skeptical or resistant. This is why brand films work for reputation recovery — the audience enters the story before activating their brand skepticism.

**The transportation paradox:** Transportation works BECAUSE the audience forgets they are being persuaded. If the content signals "I am trying to persuade you" (explicit CTA mid-story, heavy-handed product placement), transportation breaks. The audience exits the story and re-activates critical thinking. This is why `multimodal_counterpoint` and `implication_reliance` matter — the persuasion must live in subtext, not surface.


## 7.6 Cognitive Load Theory

**Source:** John Sweller, "Cognitive Load Theory" (1988, updated 2019)

Three types of cognitive load:
- **Intrinsic** — complexity of the material itself (cannot be reduced without simplifying the content)
- **Extraneous** — load from poor presentation (CAN and SHOULD be reduced)
- **Germane** — load from learning/connecting ideas (SHOULD be increased)

**For content writers:** The goal is to minimize extraneous load (clear structure, short sentences, whitespace) while managing intrinsic load (chunk complex ideas, provide examples) and maximizing germane load (ask the audience to think, not just consume).

**The derived signal `cognitive_load`** (Part 2) approximates the total of all three. When it exceeds 0.7, the constraint system (Part 6) triggers formatting interventions: shorter paragraphs, more whitespace, simpler vocabulary.


## 7.7 The Elaboration Likelihood Model (ELM)

**Source:** Petty & Cacioppo, "Communication and Persuasion" (1986)

Two routes to persuasion:
- **Central route** — audience carefully evaluates arguments. Requires high `elaboration_demand`. Produces lasting attitude change.
- **Peripheral route** — audience relies on cues (celebrity, design, social proof). Requires low cognitive effort. Produces temporary attitude change.

**For content:** The signal `elaboration_demand` determines which route the content activates. High elaboration (white papers, case studies) → central route. Low elaboration (social posts, banner ads) → peripheral route. Mismatching route and content type produces either: dense ads nobody reads (central for peripheral context) or fluffy white papers nobody trusts (peripheral for central context).


---

# PART 8 — PLATFORM & FORMAT CONSTANTS

Hard numbers that don't change based on signals. These are FACTS about platforms, not recommendations. Updated as platforms change their specs. All numbers sourced and dated.

**Update cadence:** Platform constants should be verified quarterly. Social platform specs change 2-4 times per year. This section dates every constant so stale data is identifiable.

⚠️ Platform specs change frequently. All values below are as of May 2026. Verify before relying on specific limits.


## 8.0 TikTok

```
Last verified: 2026-05-19
Sources: flowshorts.app, socialrails.com, TikTok official docs

Character limits:
  Caption: 4,000 characters (expanded from 2,200 in 2024)
  Bio: 80 characters
  Username: 24 characters

Duration limits:
  Minimum: 3 seconds
  In-app recording: up to 10 minutes
  Uploaded video: up to 60 minutes
  Algorithm sweet spot: 21-34 seconds (entertainment), 45-75 seconds (informative)
  Source: socialrails.com 2026, retensis.com 2026

Aspect ratio:
  Preferred: 9:16 (vertical, full-screen)
  Accepted: 1:1, 16:9
  Vertical vs horizontal: 9x completion rate for vertical (source: Snapchat/Kleiner Perkins 2015)

Algorithm signals (ranked by weight):
  1. Completion rate (strongest — videos with >50% avg completion get significantly more distribution)
  2. Rewatch rate
  3. Share rate (especially DM shares)
  4. Comment rate
  5. Like rate (weakest of the engagement signals)
  Source: socialync.io 2026, various industry analyses

Hook threshold: 3 seconds — <60% retention at 3s = minimal algorithmic push
```

## 8.1 Instagram

```
Last verified: 2026-05-19
Sources: zeely.ai, heytrendy.app, Instagram official docs

Reels duration:
  Minimum: 3 seconds
  Maximum: 20 minutes (expanded from 90 seconds in 2024)
  Algorithm favors: under 90 seconds for organic discovery
  Sweet spot: 7-15 seconds (reach), 15-60 seconds (tutorials), 3+ minutes (conversion, followers only)

Feed post caption: 2,200 characters
  Visible before fold: ~125 characters
  Desktop: ~210 characters before "more"

Stories: 60 seconds per story (previously 15s segments)

Algorithm signals:
  1. DM shares (#1 signal per Instagram head Adam Mosseri)
  2. Saves
  3. Comments
  4. Likes
  5. Watch time (Reels)

Hashtags: max 30, optimal 3-5 (keywords > hashtags in 2026)
```

## 8.2 LinkedIn

```
Last verified: 2026-05-19
Sources: authoredup.com, connectsafely.ai, LinkedIn official docs

Post character limit: 3,000 characters
  Optimal engagement: 1,300-1,900 characters (source: analysis of 10,000+ posts, connectsafely.ai)
  Visible before fold: ~210 characters (desktop), ~140 characters (mobile)

Article character limit: 125,000 characters (~40,000 words)

Video duration:
  Feed: 3 seconds to 10 minutes
  Optimal: 30-90 seconds

Algorithm signals:
  1. Dwell time (time spent reading/viewing)
  2. Engagement velocity (speed of initial reactions)
  3. Comment depth (substantive > emoji)
  4. Shares to network
  5. Completion rate (video)

Carousel: up to 300 slides (PDF format), optimal 6-10 slides
  Carousel engagement: 6.6% average (highest format engagement on LinkedIn)
```

## 8.3 YouTube

```
Last verified: 2026-05-19

Shorts:
  Duration: 3 seconds to 3 minutes
  Aspect: 9:16 (vertical)
  Sweet spot: 30-60 seconds

Long-form:
  Maximum: 12 hours (default), 256 GB file size
  Sweet spot: 8-12 minutes (ad mid-roll eligible at 8 min)

Title: 100 characters (optimal 60-70 for full display)
Description: 5,000 characters

Algorithm signals:
  1. Click-through rate (thumbnail + title)
  2. Average view duration (watch time)
  3. Session time (does your video lead to more YouTube watching?)
  4. Engagement (likes, comments, shares)

Thumbnail: 1280x720 pixels, <2MB
```

## 8.4 Twitter/X

```
Last verified: 2026-05-19

Post: 280 characters (free), 25,000 characters (Premium)
  Optimal engagement: 71-100 characters (single post)

Thread: unlimited posts
  Optimal: 5-7 posts per thread
  Threads generate 63% more impressions than single posts

Video: up to 2 hours 20 minutes (free), up to 4 hours (Premium)
  ⚠️ Duration limits expanded significantly in 2024-2025. Verify current limits.

Algorithm signals:
  1. Reply/conversation
  2. Repost
  3. Like
  4. Bookmark
  5. Time spent viewing
```

## 8.5 Email

```
No platform character limits — inbox rendering varies.

Subject line: optimal 30-50 characters (6-10 words)
  >50 characters: truncated on mobile
  Personalized subjects: 26% more likely to be opened (source: Campaign Monitor).

Preview text: 40-130 characters (varies by client)
Body: optimal 200-300 words for newsletters, 50-125 words for transactional

Reading pattern: F-shaped (NN/g eye-tracking research, confirmed across multiple studies)
Mobile open rate: ~60% of all email opens (varies by industry, general industry consensus 2025-2026)
```

## 8.6 WPM Reference Table

Standard speaking/reading rates for content duration estimation:

```
Voiceover (standard):     150 WPM
Voiceover (fast):         170-180 WPM
Voiceover (slow/dramatic): 120-130 WPM
Presentation (live):      130-160 WPM
Podcast (conversational): 150-170 WPM
Reading (silent):         200-250 WPM (average adult)
Reading (scanning):       400-700 WPM (skimming headers + first sentences)

Duration estimation:
  30-second script:   65-85 words (at 150 WPM, minus 10% for breathing room)
  60-second script:   130-170 words
  3-minute script:    400-500 words
  10-minute script:   1,300-1,700 words

⚠️ WPM rates are industry standards confirmed across multiple VO training resources
and presentation coaching materials. Individual variation exists.
```

## 8.7 Content Length Optimization (Cross-Platform)

```
Blog article: 1,500-2,500 words (SEO optimal per industry consensus)
  SEO optimal blog length varies by study. HubSpot (2021): 2,100-2,400 words for most organic traffic.
  Backlinko (2020): 1,447 words average for page-1 results. Google confirms word count is NOT a ranking factor.
     Backlinko (2020): 1,447 words average for page-1 results. Use as guidelines, not rules.

Newsletter: 200-500 words (optimal open-to-click)
Case study: 1,500-3,000 words
White paper: 3,000-8,000 words
Landing page: 500-1,000 words above the fold, 1,500-3,000 total
Product description: 100-300 words (e-commerce), 300-800 words (SaaS feature page)
Press release: 400-600 words
Presentation script: 130-160 words per minute of presentation
  10-minute presentation: ~1,400 words of speaker notes
```

---

*End of Part 8 — Platform & Format Constants*

---

# DOCUMENT COMPLETE

**Creative Content Knowledge Document v1.0**
**9 Parts, ~4,800 lines**
**47 signals, 25 technique cards, 20+ constraints, 7 theoretical foundations, 8 platform specs**

This document is the foundation for ThinkForge's writing intelligence. It will be:
1. Converted to a knowledge graph (like `creative-knowledge-graph.json` for editing)
2. Consumed by ThinkForge agents at runtime
3. Updated as performance data validates or invalidates signal → technique mappings
4. Expanded as new techniques, platforms, and constraints are discovered

The signal taxonomy is designed to grow. Thompson Sampling will discover new mappings. Performance attribution will validate the theory. The document is a starting point — not a destination.
