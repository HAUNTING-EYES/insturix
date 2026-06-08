---
name: creative-doc-review-round2-ceo
description: "CEO review round 2: FORMAT ranges not points, user-created FORMAT PRESETS, orthogonal overlay merge precedence, Arc Contrast system (BREATHING+SURPRISE unified), 3-layer Voice Signature, 5 agency edge cases, 10-star vision, Signal Performance Attribution as moat."
metadata:
  type: project
  last_updated: 2026-05-19
---

# CEO Review Round 2: FORMAT Override System + SURPRISE + VOICE SIGNATURE + BREATHING

## FORMAT Override System --- 3 Upgrades Needed

### Problem A: FORMAT defaults are single points, not ranges

TikTok is really 15-180s, sweet spot 30-60s, vertical preferred but horizontal works. Setting a single default creates false precision. Edge case: agency creates TikTok carousel campaign, each piece 15s, they override to 15s on EVERY project --- that is a sub-format, not an override.

**FIX:** FORMAT should define RANGES:

```
target_length: {
  min: 15,
  max: 180,
  default: 60,
  sweet_spot: [30, 60]
}
aspect_ratio: {
  preferred: '9:16',
  accepted: ['9:16', '1:1', '16:9']
}
```

In-range adjustment = normal. Out-of-range override = validation warning.

### Problem B: FORMAT is read-only --- wrong for agencies

Agencies have internal format definitions more specific than platform defaults. "Coke TikTok" is brand-specific TikTok --- neither BRAND signals nor pure FORMAT. It lives in between, and the current system has no place for it.

**FIX:** Two-tier FORMAT system:

- **Tier 1** = system-managed platform defaults (TikTok, YouTube Shorts, LinkedIn Video, etc.)
- **Tier 2** = user-created FORMAT PRESETS that inherit from Tier 1 but add brand-specific overrides

Cascade becomes: BRAND > CAMPAIGN > FORMAT_PRESET (inherits PLATFORM_FORMAT) > PROJECT > SCENE

"Agencies don't think in terms of TikTok. They think in terms of OUR kind of TikTok."

### Problem C: Orthogonal overlay merge precedence undefined

AUDIENCE and SEGMENT_TYPE are non-hierarchical overlays competing for the same signals. Example: Nike + LinkedIn + Gen Z athletes --- BRAND says formality=0.6, FORMAT says +0.3, AUDIENCE says -0.4. What wins?

**FIX:** Explicit precedence order:

1. User-explicit (manual override at any level)
2. AUDIENCE (who you are talking to)
3. SEGMENT_TYPE (what kind of content)
4. Cascade hierarchy (BRAND > CAMPAIGN > FORMAT_PRESET > PROJECT > SCENE)

Conflict resolution UI is P0, not optional. Users must be able to see which layer is driving each signal value and override it.

---

## SURPRISE --- Replace pattern_break with Arc Contrast System

### Why pattern_break is too narrow

The proposed `pattern_break` signal assumes you know WHICH scene should surprise. But the best surprises are structural --- they emerge from the overall arc, not from a single scene property. It treats surprise as a knob (signal, direction, magnitude), but real surprise has TYPES:

1. **Tonal** --- register shift (humor injected into a serious piece)
2. **Structural** --- pattern violation (a rapid-cut video holds one 15s static shot)
3. **Informational** --- a reveal that recontextualizes everything before it
4. **Meta** --- breaks the medium itself (fourth wall break, format subversion)

The proposed model can only represent tonal surprise. The other three types are invisible to it.

### 10-star version: Arc Contrast at TWO levels

**Level 1: Arc Contrast (project/act level)**

Define the expected signal trajectory across scenes. Mark DEVIATION POINTS where the trajectory deliberately breaks. This is structural surprise --- it lives above individual scenes.

**Level 2: Surprise Type (scene level)**

When a scene is marked as a deviation point, classify what type of surprise it is:

```
surprise_type: 'tonal' | 'structural' | 'informational' | 'meta'
contrast_with: 'preceding' | 'established_pattern' | 'audience_expectation' | 'genre_norm'
recovery: 'snap_back' | 'new_baseline' | 'gradual_return' | 'escalate'
```

This enables creative structures that single-scene surprise cannot:

- Build tension across 4 scenes, then silence, then explosion (structural)
- Deadpan delivery until the last line recontextualizes everything (informational)
- Documentary format that is actually an ad --- the reveal is a meta surprise
- Rapid cuts establishing rhythm, then one held shot that forces the viewer to sit with the image (structural)

The `contrast_with` field is critical: it defines WHAT the surprise contrasts against. A surprise only works relative to an established expectation. The `recovery` field defines what happens AFTER the surprise --- does the piece snap back to the prior pattern, establish a new baseline, gradually return, or escalate further?

---

## VOICE SIGNATURE --- 3 Layers, Not 1

### Layer 1: Explicit Brand DNA (user-provided, deterministic)

- Kill list (words/phrases that must never appear)
- Must-use vocabulary (brand terms, product names, approved phrasing)
- Tone guardrails (bounds, not values --- "formality between 0.4 and 0.7", not "formality = 0.55")
- Structural rules (always open with a question, never use more than 3 sentences per paragraph, etc.)

This is NOT a fingerprint --- it is a RULEBOOK. It is enforceable without an LLM. Deterministic. Hard-coded. Zero ambiguity.

### Layer 2: Extracted Voice Model (system-derived from 20-50 reference pieces)

- N-gram distributions (word choice patterns, phrase frequency)
- Sentence structure patterns (average length, variance, complexity distribution)
- Rhetorical device frequency (questions, repetition, parallelism, contrast)
- Paragraph architecture (how ideas are sequenced, transition patterns)

This IS a fingerprint. Statistical. Measurable. Derived automatically from reference content. The user does not write this --- the system extracts it.

### Layer 3: Voice Exemplars (reference samples indexed for retrieval)

- 5-10 approved pieces stored as literal exemplars
- Retrieved by signal similarity for few-shot context
- LLM does pattern matching that statistics cannot capture (rhythm, cadence, the "feel" of a voice)
- Smart few-shot: exemplars selected by signal relevance to the current piece, not random

### Why three layers are necessary

- **Layer 1** prevents catastrophic voice violations (deterministic, zero false negatives)
- **Layer 2** nudges statistical properties toward the brand voice (measurable, tunable)
- **Layer 3** captures the music that statistics miss (adaptive, context-aware)

Each layer catches what the others cannot. Layer 1 stops "never say synergy" violations. Layer 2 catches "our sentences are too long" drift. Layer 3 captures "this doesn't sound like us even though it follows all the rules" --- the intangible quality of voice.

**Moat:** Writer.com does Layer 1 and Layer 2 badly. Nobody does Layer 3 with signal-aware exemplar selection. The combination of all three, with exemplars indexed by the 47-signal space, is unprecedented.

---

## BREATHING --- Unified with SURPRISE via Breath Groups

### Core insight: BREATHING and SURPRISE are one system

Breathing = expected envelopes (how signals move across scenes). Surprise = deviation points where the trajectory deliberately breaks. Building them as separate features creates conflicts --- one system defines the expected arc, the other punctures it, and neither knows about the other.

They must be unified. The breathing envelope defines what is EXPECTED. The surprise system defines where and how the expectation is VIOLATED. Together they form a complete model of signal dynamics.

### Breath Groups (coupled signal clusters)

47 independent signal curves is chaos. Signals are not independent --- they move in correlated clusters. The system must model these correlations explicitly.

**INTENSITY group:**
- emotional_arousal (primary driver)
- pacing_velocity (+0.8 correlation --- high arousal = fast pacing)
- negative_space (-0.7 correlation --- high arousal = less breathing room)
- linguistic_complexity (-0.5 correlation --- high arousal = simpler language)

**REVEAL group:**
- novelty (primary driver)
- predictability (-0.9 correlation --- high novelty = low predictability)
- tension_arc (+0.6 correlation --- novelty feeds tension)

**INTIMACY group:**
- warmth (primary driver)
- formality (-0.6 correlation --- warmth = less formal)
- specificity_grain (+0.5 correlation --- warmth = more specific detail)

The user sets 3-5 group-level patterns (e.g., "INTENSITY rises through Act 1, plateaus in Act 2, peaks in Act 3"). The system resolves individual signal envelopes from the group correlations. This is dramatically simpler for the user and prevents contradictory signal motion.

### What is missing from the standalone envelope proposal

1. **Signal COUPLING** --- 47 independent curves create contradictory motion. If emotional_arousal rises but pacing_velocity falls, the piece feels incoherent. Coupled envelopes via Breath Groups prevent this by modeling the correlations explicitly.

2. **SURPRISE interaction** --- Breathing and surprise must be unified, not separate features. The breathing envelope defines the expected trajectory. Surprise is a deliberate violation of that trajectory. Without unification, the surprise system does not know what "normal" looks like, and the breathing system does not know where violations are intentional.

---

## 5 Agency Edge Cases

### 1. Multi-language campaigns

Japanese formality is not the same construct as English formality. A formality value of 0.6 means completely different things in Japanese (where baseline formality is higher) versus casual American English. LANGUAGE must be an orthogonal overlay that adjusts how signal values are interpreted, not just translated. The signal SPACE itself shifts by language.

### 2. Content repurposing (YouTube long-form to 5 TikToks)

This is not "create 5 new projects." It is a TRANSFORMATION mode: take existing content with its signal profile, define a target FORMAT, and compute the minimum signal adjustments needed to fit the new format while preserving as much of the original voice and intent as possible. The system should show exactly which signals change and by how much.

### 3. A/B testing

Campaigns routinely test variations. The system needs VARIANT BRANCHES: fork at the signal level (e.g., variant A has formality=0.5, variant B has formality=0.7), generate both, track performance independently. Variants share everything except the forked signals. After results come in, the winning variant's signal values feed back into the brand model.

### 4. Regulated industries

Pharmaceutical, financial services, legal --- these have hard regulatory constraints that CANNOT be overridden by any cascade level, not even user-explicit overrides. A `regulatory_profile` constraint layer must sit ABOVE the entire cascade. If a regulation says "must include risk disclaimer," no brand preference, campaign goal, or creative choice can remove it. This is a hard ceiling, not a signal.

### 5. Client review loops

Real agency workflow involves multiple rounds of client feedback. The system needs per-project signal VERSION HISTORY with revert and diff capabilities. "The client wants it more like version 2 but with the pacing from version 4" must be expressible as signal-level operations, not starting over.

---

## Investment Thesis --- What Makes This Category-Defining

### Three things NOT in the current plan that should be

**1. Signal Performance Attribution**

After 1000+ pieces are published with their signal profiles, map engagement data (view duration, completion rate, shares, conversions) back to signal values. Which signal combinations drive engagement for THIS brand in THIS format for THIS audience? This closes the theory-vs-data gap. It is Persado's model applied to a dramatically richer signal space (47 signals vs Persado's ~12 language dimensions). The feedback loop compounds: more content = better signal-performance maps = better recommendations = more content.

**2. Signal Decomposition as a Service**

Third parties submit existing content (competitor ads, viral videos, reference pieces). The system decomposes it into a 47-signal profile. This enables competitive analysis ("their TikToks are 0.3 more informal than ours"), brand onboarding ("upload 50 pieces and we extract your voice"), and industry vocabulary adoption ("here is what 'premium' looks like in signal space for luxury goods"). Every decomposition improves the model.

**3. Real-time Signal Mixing Board**

A UI where you drag a formality fader and watch the content preview shift in real time. Like a music mixing board but for content signals. This is the demo that sells the product. It makes the abstract signal space tangible and interactive. Non-technical stakeholders (CMOs, creative directors) can participate in signal tuning without understanding the underlying system.

### What to fund

Taxonomy + cascade + format presets + voice signature (3-layer) + breathing with coupled groups + performance attribution = 2-year moat. The combination creates compounding network effects: more content trained, better attribution, better recommendations, more content.

### What NOT to fund

Taxonomy alone without the measurement loop. Without empirical validation (performance attribution feeding back into signal recommendations), the system is academic --- a beautiful taxonomy with no proof it works. The feedback loop is what separates a product from a research paper.

---

## Summary: Review Decisions

| Area | Current Proposal | CEO Upgrade | Priority |
|------|-----------------|-------------|----------|
| FORMAT defaults | Single values | Ranges with sweet spots | P0 |
| FORMAT customization | Read-only platform formats | Two-tier: platform + user presets | P0 |
| Overlay precedence | Undefined | Explicit: User > AUDIENCE > SEGMENT > Cascade | P0 |
| Conflict resolution UI | Not planned | Required --- users must see what drives each signal | P0 |
| SURPRISE | pattern_break (single signal) | Arc Contrast (two-level: arc + scene type) | P1 |
| VOICE SIGNATURE | Single layer | 3-layer: Brand DNA + Voice Model + Exemplars | P1 |
| BREATHING | Independent envelopes | Coupled Breath Groups unified with surprise | P1 |
| Multi-language | Not addressed | LANGUAGE as orthogonal overlay | P2 |
| Content repurposing | Not addressed | TRANSFORMATION mode | P2 |
| A/B testing | Not addressed | VARIANT BRANCHES at signal level | P2 |
| Regulated industries | Not addressed | regulatory_profile hard constraint layer | P2 |
| Client review loops | Not addressed | Signal VERSION HISTORY with revert + diff | P2 |
| Performance attribution | Not planned | Map engagement to signals after 1000+ pieces | P1 (moat) |
| Signal decomposition | Not planned | Third-party content to 47-signal profile | P2 (moat) |
| Real-time mixing board | Not planned | Drag faders, watch content shift | P2 (demo) |
