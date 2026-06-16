# Implementation Plan: Utility AI Engine + Visual Intelligence

## Status: PLAN — CEO/Eng reviewed 2026-05-24. Gaps addressed. Ready for implementation.
## Created: 2026-05-24
## Reviewed: 2026-05-24 (CEO + Elon + Eng). All gaps addressed below.
## Decisions this plan depends on: [[D-014-Utility-AI-Decision-Engine]], [[D-001-Extend-Signal-Registry]], [[D-002-L0-Stack]]

---

## Phase 0: Foundation (estimated: CC ~2-3 hours)
**Goal:** Build the utility scoring engine. No overlays yet. Just the math.

### 0.1 — Core types
- `Consideration`: { signalId, curveType, curveParams: {slope, exponent, xShift, yShift} }
- `OverlayDefinition`: { id, category, considerations[], weight, rank }
- `ScoringResult`: { overlayId, totalScore, considerationScores[] }
- File: `lib/editron/engine/utility-types.ts` (NEW)

### 0.2 — Response curve engine
- Implement 6 curve types: linear, polynomial, logistic, logit, normal, sine
- All clamped to [0,1] output
- Pure function: `evaluateCurve(curveType, params, inputValue) → number`
- File: `lib/editron/engine/response-curves.ts` (NEW)

### 0.3 — Scoring engine
- `scoreOverlay(definition, signalSnapshot) → ScoringResult`
- Compensation factor: `modification = (1 - score) * (1 - 1/N) * score`
- Multiplicative scoring (AND implement summing variant for A/B test)
- `scoreAllOverlays(definitions[], signalSnapshot) → ScoringResult[]` (sorted)
- Budget constraints per category (zoom, sfx, graphic, transition, filter)
- File: `lib/editron/engine/utility-scorer.ts` (NEW)

### 0.4 — Decision inspector (debugging)
- `generateScorecard(results[], signalSnapshot) → InspectorOutput`
- Shows all candidates, all scores, all consideration breakdowns
- Logs to structured JSON for post-hoc analysis
- File: `lib/editron/engine/decision-inspector.ts` (NEW)

### 0.5 — Test harness
- Unit tests for each curve type (known inputs → expected outputs)
- Scoring test: mock overlays + mock signals → verify winner selection
- Compensation factor test: overlays with different consideration counts score fairly
- A/B test scaffold: same inputs → compare multiplicative vs summing outputs
- File: `scripts/test-utility-engine.ts` (NEW)

**Phase 0 deliverable:** A standalone scoring engine that takes signal snapshots + overlay definitions and produces ranked, debuggable decisions. Not wired to anything yet.

---

## Phase 1: Bootstrap from CRG (estimated: CC ~3-4 hours)
**Goal:** Convert existing 95 CRG mappings into overlay definitions. Prove the utility engine matches or beats CRG output.

### 1.1 — CRG-to-overlay converter
- Read each CRG mapping's trigger signal + threshold + action type
- Convert to overlay definition with linear consideration (threshold → x-shift on linear curve)
- Automated: script reads creative-knowledge-graph.json, outputs overlay-definitions.json
- File: `scripts/convert-crg-to-overlays.ts` (NEW)
- Output: `lib/editron/engine/overlay-definitions.json` (NEW)

### 1.2 — Parallel scoring
- Wire utility scorer alongside existing signal-executor in director-agent.ts
- Both systems score the same signal snapshots
- Log both outputs: CRG decision vs utility decision
- Do NOT apply utility decisions yet. Observe only.
- File changes: `director-agent.ts` (add utility scoring call, ~30 LOC)

### 1.3 — Comparison test
- Run on 5+ test videos across content types
- Compare CRG decisions vs utility decisions
- Measure agreement rate. Target: >85% agreement on Phase 1 (linear curves)
- Report disagreements with full scorecards
- File: `scripts/test-utility-vs-crg.ts` (NEW)

**Phase 1 deliverable:** Proof that the utility engine produces equivalent decisions to CRG. Disagreement analysis shows where curves could improve.

---

## Phase 2: Kill Profiles (estimated: CC ~3 hours)
**Goal:** Replace 54 static profiles with overlay definitions for filters, captions, transitions.

### 2.1 — Filter overlays
- Define overlay for each filter preset (warm-neutral, vivid, clean-corporate, vintage, etc.)
- Considerations: warmth, formality, enthusiasm, emotional_arousal
- Curve shapes from domain knowledge (warm_filter has quadratic warmth curve, etc.)
- ~8-10 overlay definitions

### 2.2 — Caption style overlays
- Define overlay for each caption style (word_by_word, sentence, key_phrases, none)
- Considerations: pacing_velocity, formality, enthusiasm, speech_coverage
- ~4 overlay definitions

### 2.3 — Transition type overlays
- Define overlay for each transition type (dissolve, hard_cut, whip_pan, fade_to_black, etc.)
- Considerations: energy_delta, scene_change, warmth, pacing
- KB rules (same montage = hard_cut, contrasting moods = hard_cut) encoded as veto considerations
- ~8-10 overlay definitions

### 2.4 — Remove profile dependency
- Director agent: remove profile-based filter/caption/transition selection
- Replace with utility scoring for these categories
- Profile system stays for backwards compat but utility results take priority
- Feature flag: `useUtilityEngine: true` (default false, flip when validated)

### 2.5 — Validation
- Same 5+ test videos
- Compare profile decisions vs utility decisions
- Does a funeral video get vivid filter? (It shouldn't now — warmth/formality curves should select appropriate filter)
- Does a fast TikTok get word_by_word captions? (Should — pacing/enthusiasm considerations)

**Phase 2 deliverable:** Profiles no longer control filters, captions, transitions. Signals do. Feature-flagged.

---

## Phase 3: Response Curves (estimated: CC ~2-3 hours)
**Goal:** Upgrade from linear considerations to shaped response curves. Beat CRG on nuance.

### 3.1 — Curve tuning for existing overlays
- Replace linear curves with appropriate shapes based on domain knowledge:
  - Zooms: quadratic on speech_energy (slow start, sharp uptake above 0.5)
  - SFX: logistic on energy (sharp threshold at 0.4)
  - Filters: bell curve on enthusiasm for vivid (peaks at 0.7, drops at extremes)
  - Transitions: inverted logistic on energy_delta for dissolve (smooth falling energy)
- Each curve choice documented with "WHY this shape"

### 3.2 — A/B test: multiplicative vs summing
- Run both scoring methods on same test videos
- Compare output quality
- Pick winner based on: fewer bad decisions, better variety, less oscillation
- Document result in [[D-014-Utility-AI-Decision-Engine]]

### 3.3 — Comparison test (round 2)
- Utility with curves vs CRG
- Target: utility decisions rated BETTER than CRG in blind comparison
- If not better: analyze where curves underperform, adjust shapes

**Phase 3 deliverable:** Response curves tuned. Utility engine demonstrably better than CRG for scored content.

---

## Phase 4: Visual Intelligence Signals (estimated: CC ~4-5 hours)
**Goal:** Add L0 signals for non-speech content + dead air detection.

### 4.1 — Local RMS silence detection
- Decode audio via audio-decode (already in stack)
- Compute RMS energy per 500ms window from PCM buffer
- New signal: `silence_duration_local` (seconds of sub-threshold RMS)
- NOT dependent on Gemini. L0 = can't fail.
- ~30 LOC in signal-registry.ts

### 4.2 — Essentia.js beat detection
- Add essentia.js to package.json
- Extract: BPM, beat positions, onset times, spectral contrast
- New signals: `beat_proximity` (distance to nearest beat, 0-1), `onset_detected` (binary)
- Write adapter: essentia WASM output → signal-registry format
- ~100 LOC adapter + signal-registry additions

### 4.3 — Scene boundary detection
- Frame histogram diff on existing keyframeAnalyses.dominantColors
- Compare consecutive keyframe color distributions via sharp
- New signal: `scene_change` (0-1, magnitude of visual change)
- ~40 LOC in signal-registry.ts

### 4.4 — VES composite signal
- Compute VES from available sub-signals (eye_contact, visual_significance, motion, face_quality, brightness_stability)
- Graceful: if sub-signals missing, VES computed from whatever IS available
- New signal: `visual_engagement` (0-1 composite)
- ~20 LOC in signal-registry.ts

### 4.5 — Visual intelligence overlays
- `cut_dead_air`: considerations on VES (inverted), silence_duration, speech_energy (inverted)
- `beat_sync_cut`: considerations on beat_proximity (steep), speech_coverage (inverted)
- `scene_transition`: considerations on scene_change, energy_delta
- ~3-5 new overlay definitions

### 4.6 — Non-speech content validation
- Test on: music video, product b-roll, timelapse, dance clip
- Verify: system produces meaningful decisions without any transcript
- Verify: speech-dominant content unchanged (visual overlays score low when speech is high)

**Phase 4 deliverable:** System handles non-speech content. Dead air detection works. Speech content unaffected.

---

## Phase 5: EMA + Surprise Signals (estimated: CC ~2 hours)
**Goal:** Add temporal context to signals. Enable dramatic pause vs dead air distinction.

### 5.1 — EMA computation
- For key signals (speech_energy, enthusiasm, motion_intensity, VES): compute exponential moving average over 3-second window
- New signals: `signal_ema` variants (e.g., `speech_energy_ema`)
- ~30 LOC in signal-registry.ts

### 5.2 — Surprise computation
- `signal_surprise = signal_raw - signal_ema`
- Positive surprise = rising unexpectedly. Negative surprise = dropping unexpectedly.
- New signals: `signal_surprise` variants
- ~15 LOC in signal-registry.ts

### 5.3 — Trajectory signals
- `energy_trajectory`: rising / peaked / sustained / falling / quiet (derived from EMA slope)
- `emotional_arc`: building / climax / resolution / neutral
- ~40 LOC in signal-registry.ts

### 5.4 — Update overlay considerations
- `cut_dead_air`: add consideration for speech_energy_surprise (negative = energy dropped, more likely dead air)
- `hold_dramatic_pause`: NEW overlay. Considers VES (high), speech_energy_ema (recently high), speech_energy_surprise (negative but VES still high)
- `zoom_push`: add consideration for energy_trajectory = peaked (fire at PEAK, not every high-energy frame)

### 5.5 — Dramatic pause vs dead air validation
- Test on videos with: dramatic pauses (speaker holds for effect) and dead air (speaker disengaged)
- Verify system distinguishes them based on VES + EMA + surprise
- This is the hardest test. If it works, the merge logic problem is mostly solved.

**Phase 5 deliverable:** System has temporal context. Dramatic pause vs dead air distinction working.

---

## Phase 6: Creative Brief Integration (estimated: CC ~3-4 hours)
**Goal:** Wire the narrative layer. Creative brief provides story arc, utility engine handles moments.

### 6.1 — Creative brief routing
- Content type detection from L0 signals: speechCoverage, musicPresence, visualChangeRate
- Route to appropriate prompt variant: speech / music / visual / hybrid
- Routing happens in director-agent.ts before creative brief call
- ~40 LOC

### 6.2 — Music prompt variant
- New creative brief prompt for music-dominant content
- Coordinates: beat positions + section boundaries (not word indices)
- Eval harness: multi-seed testing per Rule 35
- ~200 LOC prompt + eval

### 6.3 — Visual prompt variant
- New creative brief prompt for visual-dominant content
- Coordinates: scene boundaries + motion events (not word indices)
- Eval harness
- ~200 LOC prompt + eval

### 6.4 — Rank/priority system
- Creative brief narrative decisions get higher RANK than utility moment decisions
- When creative brief says "this is the climax, hold" → overrides utility's cut_dead_air
- Dual utility: rank categories (narrative=100, moment=50, default=0)
- ~50 LOC in utility-scorer.ts

**Phase 6 deliverable:** Full pipeline working for all content types. Narrative + moment decisions coexist with clear priority.

---

## Phase 7: Calibration + Self-Improvement (estimated: CC ~3 hours)
**Goal:** Make the system learn from real usage.

### 7.1 — Decision tracking
- Log every utility decision + user outcome (kept / changed / undone)
- Store in MongoDB per project
- ~50 LOC

### 7.2 — Thompson sampling on curve parameters
- Each curve parameter has a Beta distribution (not fixed value)
- Sample from distribution, measure outcome, update distribution
- Over 100+ videos, parameters converge toward optimal
- ~150 LOC

### 7.3 — Aggregate calibration
- Across all users: compute aggregate preference per content type
- "70% of users undo zoom when enthusiasm < 0.4" → enthusiasm curve for zoom adjusts
- Privacy-safe: aggregate only, no per-user tracking
- ~100 LOC

### 7.4 — Visual curve editor (optional, nice-to-have)
- Web UI showing each overlay's consideration curves
- Drag points to adjust curve shape
- Real-time preview: "at these signal values, this overlay scores X"
- Larger effort, defer if time-constrained

**Phase 7 deliverable:** System improves with usage. 61 invented thresholds become self-calibrating.

---

## Phase Summary

| Phase | What | Depends On | Estimated CC Time | Risk |
|-------|------|-----------|-------------------|------|
| 0 | Utility engine core | Nothing | 2-3 hours | Low — standalone |
| 1 | Bootstrap from CRG | Phase 0 | 3-4 hours | Low — comparison only |
| 2 | Kill profiles | Phase 1 | 3 hours | Medium — changes decision source |
| 3 | Response curves | Phase 1 | 2-3 hours | Low — tuning |
| 4 | Visual signals (L0) | Phase 0 | 4-5 hours | Medium — new signal sources |
| 5 | EMA + surprise | Phase 4 | 2 hours | Low — derived signals |
| 6 | Creative brief integration | Phase 4 | 3-4 hours | High — prompt engineering |
| 7 | Calibration | Phase 3+ | 3 hours | Low — additive |

**Total estimated: ~23-27 hours CC time**

### Dependencies
```
Phase 0 ──→ Phase 1 ──→ Phase 2
                    └──→ Phase 3
Phase 0 ──→ Phase 4 ──→ Phase 5
                    └──→ Phase 6
Phase 3 + Phase 5 ──→ Phase 7
```

Phases 1-3 (engine + profiles) and Phases 4-5 (visual signals) can run in PARALLEL after Phase 0.

### Open Decisions (resolve before coding)
- [[D-008-Modal-Commitment]] — needed for Qwen3-VL in Phase 6+ but not for Phases 0-5
- A/B test: multiplicative vs summing — resolved in Phase 3
- 2D surfaces — deferred. Start with 1D curves. Evaluate need after Phase 5.
- Multi-D curves — explicitly NOT in scope. See [[D-014-Utility-AI-Decision-Engine]]

---

## Review Gaps Addressed (2026-05-24)

### Gap 1: Error Handling Spec

```
evaluateCurve(type, params, input):
  NaN/undefined input     → return 0.5 (neutral), log warning
  input outside [0,1]     → clamp, log warning
  curve produces NaN      → return 0.5, log error with full context
  curve produces Infinity → clamp to [0,1]

scoreOverlay(definition, signals):
  signal missing          → skip consideration, compensation adjusts
  all considerations miss → return 0
  zero considerations     → return 0, log error

scoreAllOverlays(definitions, signals):
  empty definitions       → return empty, log warning
  all score 0             → return empty (no action this grid point)
```

Principle: never crash, never veto from missing data, always log abnormal inputs.

### Gap 2: Performance Budget

```
Target: <50ms for full video scoring

50 overlays × 240 grid points × 5 considerations = 60,000 curve evals
Each eval: ~4 math ops. At JS ~100M ops/sec = ~2.4ms
With sorting + logging: <10ms total

Not a concern, but measure it. Alert if any video >50ms.
```

### Gap 3: Overlay Definition Schema

```typescript
interface OverlayDefinition {
  id: string;                    // 'zoom_push', 'dissolve'
  category: OverlayCategory;    // which pool this competes in
  rank: number;                  // priority tier (narrative=100, moment=50)
  weight: number;                // base multiplier (default 1.0)
  minScore: number;              // below this, don't apply (default 0.3)
  minGapFrames: number;          // min frames since last same-category overlay
  considerations: Consideration[];
  outputParams: OutputParam[];   // what the overlay produces when it wins
}

interface Consideration {
  signalId: string;              // 'speech_energy'
  curveType: CurveType;          // 'linear' | 'polynomial' | 'logistic' | etc.
  params: CurveParams;           // { slope, exponent, xShift, yShift }
  invert: boolean;               // high signal → low score
  description: string;           // "prefers high energy moments"
}

interface OutputParam {
  name: string;                  // 'scaleTo', 'volume'
  mode: 'fixed' | 'proportional';
  fixedValue?: any;
  minValue?: number;             // proportional: score maps to [min,max]
  maxValue?: number;
}
```

OutputParam `mode: 'proportional'` = numeric strength driven by score. Score 0.5 → midpoint. Score 0.9 → near max.

### Gap 4: Category System

```typescript
type OverlayCategory =
  | 'zoom'        // max 1 per grid point, gap: 90 frames
  | 'transition'  // max 1 per clip boundary
  | 'sfx'         // max 2 per grid point, gap: 30 frames
  | 'graphic'     // max 1 per grid point, gap: 90 frames
  | 'filter'      // max 1 per VIDEO (global)
  | 'caption'     // max 1 per VIDEO (global)
  | 'cut'         // max 1 per grid point, gap: 60 frames
  | 'camera'      // max 1 per grid point (shake, drift)
```

Each category scored independently. `filter` and `caption` are GLOBAL (score entire video, pick single best).

### Gap 5: Essentia.js Risk + Fallback

**Spike (30 min, before Phase 4 commits):**
1. `npm install essentia.js`
2. Load WASM, feed 30s audio, extract BPM + beats
3. Measure memory + cold start
4. Deploy to Vercel preview, test serverless

**Fallback ladder:**
1. Essentia.js WASM in Vercel → preferred
2. WASM fails Vercel → client-side beat detection before upload
3. Neither → existing 5-Track BPM from Gemini
4. Gemini 429 → RMS peak detection from audio-decode (crude but L0)

Don't block Phase 4 on Essentia.js. Build silence + scene detection first. Add beats after spike validates.

### Gap 6: Migration Path

```
Phase 1: CRG primary, utility shadow (logs only)
Phase 2-3: Feature flag useUtilityEngine (default false, flip per-project)
Validation: utility matches/beats CRG on 10+ videos, 5 content types
Phase 4: Flip useUtilityEngine = true (default). CRG available for rollback.
+30 days zero rollbacks: Mark signal-executor CRG path deprecated.
Next major: Delete CRG evaluation code (~600 LOC). Keep knowledge graph data.
```

### Rollback Strategy

| Phase | Rollback Method | Time |
|-------|----------------|------|
| 0 | Nothing to rollback (standalone) | N/A |
| 1 | Delete shadow logging (~5 LOC) | 2 min |
| 2-3 | Flip `useUtilityEngine = false` | 30 sec |
| 4 | Ignore new signals (or remove from registry) | 5 min |
| 5 | Remove EMA computation | 5 min |
| 6 | Git revert prompt changes | 2 min |
| 7 | Disable Thompson sampling (flag) | 30 sec |

Every phase independently rollbackable. No bridges burned.

### Content Type Test Matrix

| Content Type | Source | Phases Tested |
|-------------|--------|---------------|
| Talking head | Existing test suite | 1, 2, 3 (regression) |
| Tutorial | Pexels "how to" | 2, 3 (captions) |
| Music video | Pexels music | 4, 5, 6 (non-speech) |
| Product b-roll | Pexels product | 4, 5 (visual signals) |
| Interview | Pexels interview | 2 (transitions) |
| Timelapse | Pexels timelapse | 4 (scene detection) |
| Corporate | Existing test suite | 2, 3 (filter/formality) |

---

## Related
- [[D-014-Utility-AI-Decision-Engine]] — the core decision
- [[Visual-Intelligence-Architecture]] — revised architecture
- [[Utility-AI-Architecture]] — research backing
- [[Phase-1C-Failure-Analysis]] — safety constraint
- [[Codebase-Graph]] — blast radius reference

Tags: #roadmap #plan #utility-ai #visual-intelligence
