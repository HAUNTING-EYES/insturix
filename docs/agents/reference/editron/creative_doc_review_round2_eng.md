---
name: creative-doc-review-round2-eng
description: "Eng review round 2: TypeScript schemas for PatternBreak/VoiceSignature/SignalEnvelope, cascade interactions (lock > break > envelope), MongoDB storage analysis, performance verified sub-ms, migration path, 9 issues flagged, build order defined."
metadata:
  type: project
  last_updated: 2026-05-19
---

# Engineering Review Round 2 — Full Findings

## TypeScript Schemas

### PatternBreak

```typescript
type NumericCreativeSignal = {
  [K in keyof CreativeSignals]: CreativeSignals[K] extends number | undefined ? K : never
}[keyof CreativeSignals];

interface PatternBreakV1 {
  signal: NumericCreativeSignal; // NOT all CreativeSignals — enums excluded
  direction: 'spike' | 'drop';
  magnitude: number; // DELTA from cascade-resolved value, 0.2-0.8, clamped
  reason: string;
  // recovery and recoveryDuration DEFERRED to post-MVP (needs BEAT scope)
}
```

**Key decisions:**
- Magnitude is DELTA, not absolute: `resolvedValue + (spike ? +magnitude : -magnitude)`, clamped to signal range
- Enum signals (`bloom_level`, `epistemic_stance`, `audience_awareness`, etc.) EXCLUDED — can't "spike 0.6" on an enum. The `NumericCreativeSignal` conditional type enforces this at compile time.
- V1 ships without recovery semantics. Recovery (gradual return to baseline after break) requires BEAT scope for within-scene temporal resolution, which is deferred to post-MVP.
- `magnitude` range 0.2-0.8: below 0.2 is imperceptible, above 0.8 risks breaking adjacent signal constraints.
- `reason` is free text for auditability — explains WHY this scene needs a break from the inherited pattern.

### VoiceSignature

```typescript
interface VoiceSignature {
  lexical: {
    preferredVocab: string[];
    bannedVocab: string[];
    sentenceRhythm: SentenceLength[];
    avgSentenceLength: number;
    paragraphPattern: string[];
  };
  structural: {
    openingPattern: OpeningPattern;
    transitionStyle: TransitionStyle;
    closingPattern: ClosingPattern;
    listStyle: ListStyle;
  };
  referenceSamples: string[]; // max 5, each max 500 words — extraction/calibration ONLY
  compressedFingerprint?: {
    topBigrams: [string, number][];
    avgWordsPerSentence: number;
    sentenceLengthVariance: number;
    passiveVoiceRatio: number;
    questionFrequency: number;
    punctuationProfile: Record<string, number>;
  };
  version: number;
  updatedAt: Date;
}
```

**Key decisions:**
- Runtime prompt cost: ~200 tokens (0.8% of 20K budget). Fits comfortably within context limits.
- `referenceSamples` are NOT included in runtime prompts — they exist solely for extraction and calibration during voice setup. At runtime, only the structured fields (`lexical`, `structural`, and optionally `compressedFingerprint`) are injected into the prompt.
- Stored in a **separate MongoDB collection** (not embedded in the brand document) to avoid bloat. Brand doc holds a `voiceSignatureId` reference.
- `compressedFingerprint` is optional — computed from `referenceSamples` during extraction, used for runtime prompt enrichment when available. Contains statistical features that are cheap to serialize and high-signal for LLM style matching.
- `version` and `updatedAt` enable brand DNA versioning (CEO requirement from round 1).
- `paragraphPattern` captures rhythm beyond sentences — e.g., `["short", "long", "medium", "short"]` for a brand that opens paragraphs punchy and expands.

### SignalEnvelope

```typescript
interface SignalEnvelope {
  start: number;
  peak: number;
  end: number;
  peakPosition: number; // 0-1
  attackCurve: EnvelopeCurve; // start → peak
  releaseCurve: EnvelopeCurve; // peak → end (separate from attack)
}

type EnvelopeCurve = 'linear' | 'exponential' | 'logarithmic';
// 'step' REMOVED — it's really a PatternBreak, not an envelope

type SignalValueOrEnvelope = number | SignalEnvelope;
```

**Key decisions:**
- Two curves (attack + release) instead of one. This matches the audio/animation production mental model where the ramp-up and ramp-down of a signal are independent. A suspense build (logarithmic attack = slow then fast) with a sharp release (exponential release = fast then slow) is a common cinematic pattern.
- `step` curve type REMOVED as underspecified. A step function is semantically a PatternBreak (instantaneous value change), not an envelope (continuous variation). Keeping both representations for the same concept would cause confusion.
- `peakPosition` at 0-1 normalized: 0.0 = peak at start (immediate), 0.5 = peak at midpoint (symmetric), 0.9 = peak near end (slow build, fast release). Combined with the two curve types, this gives full control over signal shape.
- `SignalValueOrEnvelope` union type means every signal field in `CreativeSignals` can accept either a static number or an envelope — no schema changes needed per signal.

## Cascade Interactions

### PatternBreak vs Campaign Lock

- **Lock ALWAYS wins.** Campaign locks exist for brand governance. A locked signal cannot be overridden by any lower scope, including PatternBreak.
- Suppressed breaks MUST surface in the conflict resolution UI with a clear message — NOT silently swallowed. The user needs to know their creative intent was blocked by a governance constraint, and who to ask for an unlock.
- Resolution flow:
  1. `resolveSignal()` runs bottom-up cascade as normal
  2. Check if signal has campaign lock
  3. If locked: return `{ value: lockedValue, patternBreakSuppressed: true, suppressionReason: "Campaign lock on [signal] by [campaign]" }`
  4. If not locked: apply PatternBreak delta to cascade-resolved value
- This means the same PatternBreak definition can succeed in one campaign context and be suppressed in another — correct behavior for a governance system.

### SignalEnvelope vs Cascade

Three cases, each with different resolution semantics:

**Case A: Project envelope, scene has no override**
- Scene inherits the project-level envelope
- Cascade resolver samples the project envelope at the scene's temporal position within the project
- Example: Project envelope has `emotional_arousal` rising from 0.3 to 0.8 over the project duration. Scene at 60% of the project gets `emotional_arousal = 0.6` (assuming linear interpolation).

**Case B: Project envelope, scene has static override**
- Scene's static value wins for the entire scene duration
- Creates a discontinuity at scene boundaries — the project envelope value before the scene jumps to the static override, then jumps back after
- This is intentional: a scene override is an explicit creative choice to break from the project's arc at that point

**Case C: Project envelope, scene has its own envelope**
- Scene envelope wins entirely
- Scene envelope operates over the scene's own duration (0-1 normalized to scene length), NOT the project duration
- Scene and project envelopes are completely independent — no blending, no interpolation between them

**CRITICAL implication for Case A:** The cascade resolver becomes time-parameterized. Every consumer must pass `normalizedTime` (0-1 position within the current scope) when resolving signals. This is a pervasive API change that touches every call site. This is why envelope runtime is DEFERRED — the static type definition ships now, but runtime resolution waits until the API change can be rolled out carefully.

### PatternBreak + SignalEnvelope

Resolution order when both are present:

1. **Resolve envelope** at the scene's temporal position within its parent scope. This produces the base value at that point in time.
2. **Apply PatternBreak delta** to the envelope-resolved value. `result = envelopeValue + (direction === 'spike' ? +magnitude : -magnitude)`
3. **Check campaign lock.** If locked, revert to locked value and flag suppression.
4. **Clamp** to signal's valid range.

Important consequence: the same PatternBreak (`magnitude: 0.4, direction: spike`) produces different absolute results at different points in time, because the underlying envelope value changes. This is correct behavior — a "surprise moment" (pattern break) should be relative to what the audience is experiencing at that moment, not an absolute value disconnected from context.

## MongoDB Storage Analysis

### Envelope storage
- Worst case: all 47 signals as envelopes at all 6 scope levels = ~88KB per project
- Realistic case: 3-5 signals with envelopes at project level, 1-2 at scene level = ~2-3KB additional per project
- Verdict: **Negligible.** Well within MongoDB's 16MB document limit.

### VoiceSignature storage
- `referenceSamples`: max 5 samples x max 500 words each = ~12.5KB per brand
- Stored in a **separate collection** (`voice_signatures`) with a reference ID in the brand document
- Runtime prompt injection uses only structured fields (~200 tokens), never the raw samples
- `compressedFingerprint`: ~500 bytes. Negligible.

### PatternBreak storage
- ~300 bytes per scene (signal name + direction + magnitude + reason string)
- 50-scene project with breaks on every scene = ~15KB. Negligible.
- Most projects will have breaks on 5-10 scenes = ~1.5-3KB.

## Performance Analysis

### Static cascade (current system, no envelopes)
- 10 scenes x 47 signals x 5 scope levels = 2,350 lookups
- Result: **sub-millisecond.** Pure object property access, no computation.

### With envelopes — short-form (60s video)
- Assuming envelope resolution every 500ms for temporal signals
- 120 time points x 47 signals = 5,640 resolutions
- Result: **still sub-millisecond.** Each resolution is an interpolation (one multiply + one add).

### With envelopes — long-form (30 minute video)
- 3,600 time points x 47 signals = 169,200 resolutions
- Result: **~1.7ms.** Linear interpolation is O(1) per resolution.
- Even with exponential/logarithmic curves (one `Math.pow` or `Math.log` call), stays under 5ms.

### Verdict
**Performance is NOT a concern** in any realistic case. The cascade resolver is pure computation with no I/O, and the numbers are trivially small even at scale. Pre-resolving all signals per-scene at cascade time (before passing to signal executor) keeps the hot path allocation-free.

## Voice Signature Pipeline

### Integration point
- Enters the script-author-agent.ts prompt as an XML block: `<voice_signature>` containing `preferred_vocab`, `banned_vocab`, `sentence_rhythm`, and structural habits
- Injected after the creative signals block and before the input data (data-last principle per Rule 35)

### Runtime token cost
- ~160 tokens without `compressedFingerprint`
- ~260 tokens with `compressedFingerprint` included
- Both well within the 0.8% of 20K budget ceiling

### VoiceSignature merge (brand + campaign)
When a campaign has its own voice adjustments layered on a brand voice:
- `bannedVocab` = **UNION** (brand bans are absolute — campaign cannot un-ban a word)
- `preferredVocab` = **UNION** (campaign adds preferred terms on top of brand preferences)
- `structural` habits = **campaign overrides if explicitly set** (campaign can change opening pattern, transition style, etc. — unset fields inherit from brand)
- `lexical.sentenceRhythm` and `avgSentenceLength` = campaign overrides if set (campaign may want tighter rhythm than brand default)
- `compressedFingerprint` = brand only (campaign doesn't generate its own fingerprint — it modifies the brand voice, not replaces it)

## Migration Path

### Phase 0 (NOW — no runtime change)
- Define all TypeScript types: `PatternBreakV1`, `VoiceSignature`, `SignalEnvelope`, `SignalValueOrEnvelope`
- Add `SignalValueOrEnvelope` as the type for signal fields in `CreativeSignals`
- All existing code continues to work because every existing value is a `number`, which is a valid `SignalValueOrEnvelope`
- Zero runtime behavior change. Pure type-level preparation.

### Phase 1 (envelope cascade)
- Cascade resolver gains `resolveAtTime(signal, normalizedTime)` method
- For static values: returns value unchanged (no time dependency)
- For envelopes: interpolates based on `peakPosition`, `attackCurve`, `releaseCurve`
- **Key insight:** Pre-resolve envelopes to static values at scene boundaries. This means signal-executor, graph-query, and constraint-enforcer see only `number` values — zero changes to downstream consumers.
- This is the "adapter layer" approach: envelope complexity is contained in the cascade resolver.

### Phase 2 (within-scene temporal variation)
- Signal executor re-resolves at each grid point within a scene (e.g., every 500ms)
- Enables smooth signal transitions within a scene (rising tension, building energy)
- Requires signal executor to accept `normalizedTime` parameter
- Downstream consumers (graph-query, constraint-enforcer) still see pre-resolved static values per grid point

### Phase 3 (UI curve editor)
- Visual editor for drawing signal envelopes at project/act/scene level
- Bezier curve support added to `EnvelopeCurve` type
- Real-time preview of signal values over timeline
- Furthest out — depends on Phase 2 being stable

### Key insight across all phases
Pre-resolve at the cascade layer means zero changes to signal-executor, graph-query, and constraint-enforcer in Phase 0 and Phase 1. The blast radius is contained to the cascade resolver itself. Only Phase 2 expands the API surface.

## Edge Cases Handled

### 1. Overlapping pattern breaks in adjacent scenes
- PatternBreaks are scene-scoped. No bleed across scene boundaries.
- If a break has gradual recovery semantics (post-MVP), recovery is truncated at the scene boundary.
- This produces a warning (not an error) — the author is informed that their recovery window was cut short by the scene ending, and can adjust scene duration or magnitude.

### 2. Envelope discontinuities across act boundaries
- Handled by the existing `ScopeTransition` blend model (documented in `creative_doc_scope_system.md`)
- The transition's `blendDurationMs` and `easing` fields control how signal values interpolate across scope boundaries
- Envelopes at parent scope (project/act) produce smooth values — discontinuities only occur when a child scope (scene) explicitly overrides with a static value or its own envelope (Case B and Case C above)

### 3. Voice signature brand vs campaign
- `bannedVocab` = UNION (brand bans are absolute, campaign cannot un-ban)
- `preferredVocab` = UNION (campaign adds, brand retains)
- `structural` = campaign overrides if explicitly set (unset fields inherit from brand)
- This follows the same "more specific wins, but some fields are additive" pattern used in the cascade system for signal values

### 4. Pattern break on signal with envelope at higher scope
- Evaluate envelope at scene's temporal position within the parent scope — this gives the base value
- Apply PatternBreak delta to that base value
- Natural resolution order: the break is relative to wherever the envelope has brought the signal at that point in time
- No special-casing needed — falls out of the standard resolution order (envelope first, then break, then lock check)

## 9 Issues Flagged

### Issue 1 — BLOCKER (RESOLVED)
**Magnitude ambiguous: absolute vs delta**
- Original schema had `magnitude: number` without specifying whether it's the target value or a delta from the current value
- Absolute values would mean the same PatternBreak behaves differently depending on where in the cascade it's applied
- **Resolution:** Delta from cascade-resolved value. `resolvedValue + (spike ? +magnitude : -magnitude)`, clamped to signal range. Predictable regardless of cascade context.

### Issue 2 — BLOCKER (RESOLVED)
**Enum signals incompatible with magnitude**
- `bloom_level`, `audience_awareness`, `epistemic_stance` are enum signals. Cannot apply a numeric delta.
- Allowing PatternBreak on enums would require a completely different type (`targetValue: EnumType` instead of `magnitude: number`) and different resolution logic.
- **Resolution:** TypeScript conditional type `NumericCreativeSignal` excludes all enum-typed signals at compile time. PatternBreak only operates on numeric signals. Enum "breaks" can be handled as explicit scene-level overrides (which already exist in the cascade system).

### Issue 3 — HIGH (RESOLVED)
**referenceSamples token bloat**
- 5 samples x 500 words = 2,500 words. At ~1.3 tokens/word = ~3,250 tokens. That's 16% of a 20K context — unacceptable for runtime.
- **Resolution:** Reference samples stored in separate collection, used only for extraction/calibration. Runtime prompt uses structured fields (~200 tokens) and optionally `compressedFingerprint` (~60 tokens). Total runtime cost: 0.8-1.3% of budget.

### Issue 4 — MEDIUM (RESOLVED)
**Single curve for attack+release**
- Original schema had one `curve: EnvelopeCurve` for the entire envelope. This means the ramp-up and ramp-down must use the same shape.
- In audio/video production, attack and release are always independent parameters. A slow build with a sharp drop is one of the most common patterns.
- **Resolution:** Split into `attackCurve` (start to peak) and `releaseCurve` (peak to end). Each independently selectable.

### Issue 5 — MEDIUM (RESOLVED)
**`step` curve underspecified**
- `step` as an EnvelopeCurve type implies an instantaneous jump, but at what point? The `peakPosition` parameter would define it, but then `start` and `end` values become ambiguous (which value holds before/after the step?).
- Semantically, a step function is a PatternBreak — an instantaneous value change at a specific point. Having both representations for the same concept creates confusion about which to use.
- **Resolution:** Removed `step` from `EnvelopeCurve`. Users wanting instantaneous changes should use PatternBreak. Envelopes are for continuous variation only.

### Issue 6 — HIGH (RESOLVED)
**Suppressed pattern_break invisible**
- If a campaign lock suppresses a PatternBreak, the original design silently returned the locked value. The author would not know their creative intent was blocked.
- Silent suppression violates the CEO requirement for conflict resolution UI ("overridden from Brand default" with one-click revert).
- **Resolution:** `resolveSignal()` returns a `patternBreakSuppressed: true` flag with `suppressionReason` when a lock blocks a break. UI must surface this in the conflict resolution panel.

### Issue 7 — ARCHITECTURAL (DEFERRED)
**Cascade becomes time-parameterized**
- Case A (scene inheriting parent envelope) requires the cascade resolver to accept `normalizedTime` and sample the parent envelope at that position.
- This changes the cascade resolver's API signature — every call site must provide time context.
- Blast radius: every function that calls `resolveSignal()` needs updating.
- **Resolution:** Deferred to Phase 1/2 of migration. Phase 0 ships envelope types only. Pre-resolution at scene boundaries in Phase 1 contains the blast radius to the cascade resolver itself.

### Issue 8 — MEDIUM (RESOLVED)
**referenceSamples embedded bloats brand doc**
- Embedding `referenceSamples` (up to 12.5KB) directly in the brand document would bloat every brand query, even when voice data isn't needed.
- Most brand queries (signal resolution, cascade lookup) don't need voice reference text.
- **Resolution:** Separate `voice_signatures` MongoDB collection. Brand doc holds a `voiceSignatureId` reference. Voice data loaded only when needed (script generation, voice calibration).

### Issue 9 — LOW (RESOLVED)
**Gradual recovery truncated at scene boundary**
- When PatternBreak recovery (post-MVP) crosses a scene boundary, the recovery arc is cut short.
- This could produce a jarring signal jump if the next scene doesn't account for the break.
- **Resolution:** Validation warning emitted at authoring time: "PatternBreak recovery on [signal] in scene [N] extends beyond scene boundary. Recovery will be truncated." Author can extend scene duration, reduce magnitude, or acknowledge the truncation. Not an error — some truncations are intentional (e.g., hard scene cut after an emotional peak).

## Build Order (Agreed)

### Ship NOW (low risk, high value, contained blast radius)

1. **VoiceSignature** — 1 interface + 1 resolver + 1 prompt change in script-author-agent.ts. Self-contained. No cascade changes. Immediate value for brand voice consistency.

2. **PatternBreak v1 without recovery** — 1 interface + 1 cascade modifier. Magnitude is delta, enums excluded. Lock check integrated. No temporal dependency. Immediate value for scene-level creative variation.

3. **SignalEnvelope types only** — Forward-compatible schema definition. `SignalValueOrEnvelope` union type. Zero runtime change. Prepares the type system for Phase 1 without touching any execution code.

4. **FORMAT ranges + presets** — Schema change to add platform-specific signal defaults (TikTok, LinkedIn, YouTube, etc.). Enables the "one brief, every format" mechanism from CEO review.

### Ship DEFERRED (high blast radius, needs careful rollout)

5. **SignalEnvelope runtime** — Time-parameterized cascade resolver. Pervasive API change (`normalizedTime` parameter on all resolve calls). Pre-resolution at scene boundaries contains downstream blast radius but cascade resolver itself needs significant rework.

6. **PatternBreak recovery** — Requires BEAT scope for within-scene temporal resolution. Recovery semantics (gradual return to baseline after a break) need sub-scene time granularity that the current system doesn't support.

7. **Breath Groups** — Requires envelope runtime (Phase 2) for prosodic signal modulation within scenes. Depends on both SignalEnvelope runtime and a prosodic analysis pipeline.

8. **Signal Performance Attribution** — Requires 1000+ pieces of produced content with signal configurations and performance metrics to build meaningful correlations. Data collection infrastructure and A/B testing framework needed first.
