---
name: Pipeline Investigations — Long-Form Bug & Gap Reports
description: Standardized investigation reports for bugs, design gaps, conflicts, and vulnerabilities found during development. Each entry includes symptom, root cause with file:line evidence, impact analysis, and proposed fixes. Append new entries here whenever an investigation surfaces something worth fixing (Rule 20N mandatory).
type: project
last_updated: 2026-04-16
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Pipeline Investigations — Long-Form Reports

**Purpose:** Central repository for investigation findings that future sessions can reference without re-running the investigation. Complements:
- `toyota_reliability_audit.md` — silent failures, timeouts, retry gaps (reliability patterns)
- `editron_master_remaining.md` — open items list (backlog tracker with short entries)
- `phase_a3_decision_log.md` — phase-specific decisions
- THIS FILE — detailed root-cause analysis for individual bugs/gaps/conflicts

**How to use:**
1. **Before investigating a reported bug:** search this file for existing analysis. If found, you save hours.
2. **After investigating:** append a new entry using the template below.
3. **Short summary of each entry also goes in `editron_master_remaining.md`** bugs table with a link/reference here.

**Rule 20N compliance:** When ANY investigation reveals a bug, design gap, architectural conflict, silent failure, performance issue, or vulnerability — document it here before moving on. Format is non-negotiable so entries are searchable.

---

## Entry Template (use this for every new finding)

```
## [YYYY-MM-DD] — Short descriptive title

**Category:** bug | design-gap | architectural-conflict | silent-failure | perf-issue | vulnerability
**Severity:** P0 (blocks usage) | P1 (affects quality) | P2 (polish)
**Status:** open | investigating | fixed-partial | fixed | wontfix
**Triggered by:** What surfaced this (user test, audit, code review, etc.)
**Related commits:** (if any partial/previous fixes)

### Symptom
What the user or developer observes. Be specific — include numbers, log lines, project IDs.

### Root cause
Traced chain with **file:line evidence**. No assumptions — everything must be verifiable.

### Impact
Who/what is affected. Which content types break. Cross-reference creative_production_knowledge.md rules violated (if any).

### Proposed fix options
Minimum 2 options with tradeoffs. Pick recommended. Note deferred options.

### Decision / Action
What was chosen (and why) OR what was deferred.
```

---

# FINDINGS

## [2026-04-19] — AssetBriefing crashes on partial cached audio/musicStructure shape

**Category:** bug (silent failure → degraded LLM context → worse EDL decisions)
**Severity:** P0 (every Director run on AI-generated clips produces fallback briefings — the LLM operates blind)
**Status:** MITIGATED 2026-04-19 in asset-briefing.ts (defensive array checks). Root cause upstream in 5-Track cache shape — separate investigation deferred.
**Triggered by:** proj_L7c43ghg7Rt3 logs: every one of 11 clips emitted `[AssetBriefing] Failed to compress video_XXX: Cannot read properties of undefined (reading 'length')` — user flagged as "we need to fix it."

### Symptom

Director execution logs 11× (once per clip) of:
```
[AssetBriefing] Failed to compress video_XXX: Cannot read properties of undefined (reading 'length')
```

Error is caught at `asset-briefing.ts:compressAllAnalyses` (line ~420 pre-fix) and replaced with a minimal fallback briefing:
```ts
{
  visualSummary: 'Unknown (compression failed)',
  mood: 'neutral',
  motionProfile: 'unknown',
  ...
  promptText: 'Clip analysis unavailable — use conservative editing decisions.'
}
```

Unified Intelligence then runs with this fallback briefing for EVERY clip → zero creative context per scene → Gemini produces fewer / less-specific decisions → EDL under-saturates (witnessed in proj_L7c43: 5 EDL transitions for 10 boundaries, compared to proj_3jE3's 10/10).

### Root cause

**File:line:** primary crash `asset-briefing.ts:247` (pre-fix), `.length` accessed on `audio.beats` / `audio.silences` / `audio.energyCurve` / `musicStructure.drops`.

TypeScript types declare these fields as non-nullable arrays:
```ts
// five-track-analysis.ts:46-60
interface AudioAnalysis {
  beats: number[];
  silences: Array<{ startMs: number; endMs: number; durationMs: number }>;
  energyCurve: Array<{ timestampMs: number; energy: number }>;
  ...
}
```

But at runtime, some cached `AssetAnalysis` objects have `audio` present (non-null) yet `audio.beats === undefined` (and/or silences/energyCurve). Same for `musicStructure.drops`. Accessing `.length` on undefined throws.

**Cause of the type/runtime mismatch (suspected, not confirmed this session):**
- Older cached analyses from before schema evolution, stored to MongoDB, deserialized back with undefined sub-fields.
- OR a code path during 5-Track creation that produces stub `audio: {}` objects (instead of `audio: null`) when a sub-analysis is skipped for short clips / AI-generated content.

The code at `buildAudioContent` checks `if (audio)` correctly — but that guards only against `null`, not against partial objects with missing sub-arrays. TypeScript can't catch this because the type contract says the sub-fields are non-nullable.

Same pattern repeated in `detectSlop` for `track.frames` and `kfs[i].subjects`.

### Fix (this session — defensive, mitigating)

File: `lib/editron/services/asset-briefing.ts`. Three sites made defensive:

1. `buildAudioContent`:
   - `audio.beats?.length` → `Array.isArray(audio.beats) ? audio.beats : []` then `.length`
   - Same for `audio.silences`, `audio.energyCurve`
   - `music.drops.length` → same pattern
   - `music.bpm` only included if `typeof === 'number'`

2. `compressAnalysisToBriefing` `hasSpeech` computation:
   - Guard `s.text` before `.trim()` (`typeof s?.text === 'string'`)

3. `detectSlop` Checks 1 + 2:
   - `track.frames.length` → `Array.isArray(track?.frames) ? track.frames : []` then `.length`
   - Guard `prev`/`curr`/`next` before dereferencing

Produces a PARTIAL briefing (correct creative context minus audio detail) instead of a useless all-unknown fallback. LLM now gets real per-clip context for downstream EDL decisions even when audio sub-fields are partial.

### Why this is "defensive" not "fallback-masking" (Rule 2N alignment)

Rule 2N forbids fallbacks that mask bugs. This is different — it's input robustness against malformed cached data. The briefing function is a **consumer** of analysis data, not the producer. Producing correct output from imperfect input is ordinary defensive programming.

The UNDERLYING bug (analysis cache producing partial audio objects) is separate. Logged here as follow-up investigation. This commit ensures the briefing layer stops crashing while that's investigated.

### NOT fixed in this commit (explicitly deferred)

Other `.length` / field-access sites in `asset-briefing.ts` that could also crash on partial objects:
- `buildVisualSummary:152` — `primary.subjects.filter(...)`
- `findKeyMoment:232` — `best.subjects.filter(...)`
- `findKeyMoment:234-235` — `best.description.substring(...)`
- `buildMotionProfile:203` — `dominantMotion.cameraMotion.replace(...)`

These aren't the observed crash source. Patching them would increase commit scope without direct evidence of need. Easy follow-ups if they start crashing.

**Root cause of the underlying analysis shape drift:** investigate 5-Track analysis creation in `five-track-analysis.ts` — when does `audio` end up as a stub vs a full AudioAnalysis vs null? Possibly a schema migration or short-clip path. Separate sprint item.

### Rule alignment

- **Rule 17N (deliberate):** considered (a) fix root cause in 5-Track [deeper, unknown-sized work], (b) defensive-code briefing [this], (c) hybrid. (b) chosen for immediate quality recovery; (a) tracked as follow-up.
- **Rule 18N (production stability):** fail-visible preserved — briefing quality flag still reflects `'fallback'` if the outer function's `compressAnalysisToBriefing` threw for a different reason. Partial briefings log correctly.
- **Rule A3 (understand WHY before fixing):** full why-trace documented above. Producer is the deeper bug; consumer robustness is the surgical fix.
- **Rule A4 (all code paths):** grep verified only this file accesses those analysis sub-fields for `.length`. EDL executor and Director agent access analysis via different code paths not impacted by this fix.

### Reference for future fixer

- File: `lib/editron/services/asset-briefing.ts:247-300` (fixed defensive section), `:336-376` (detectSlop defensive section), `:97-106` (hasSpeech defensive)
- Test: run Director on a Seedance-generated project; verify logs show actual briefing text (e.g., `"no motion data"`, `"medium shot of..."`) rather than `"Unknown (compression failed)"` for every clip
- Root cause follow-up: find producer path that creates partial `audio` objects in AssetAnalysis cache. Start with `five-track-analysis.ts` audio analysis path + MongoDB storage/retrieval of `analyses` collection

---

## [2026-04-19] — add_transition tool's applyToAll fallback silently overwrites EDL-placed transitions

**Category:** bug (silent params-ignore → destructive side-effect)
**Severity:** P0 (every Director run with gap boundaries loses EDL's diverse transition styling)
**Status:** FIXED 2026-04-19 in director-agent.ts (single-line param change) — pending preview verification
**Triggered by:** User inspection of proj_L7c43ghg7Rt3 (2026-04-19) noticing all 10 transitions were dissolves, comparing to proj_3jE3Q8mx5fB5 which had mixed styles. "Transitions breaking again" complaint.

### Symptom

Videos produced with profiles whose EDL doesn't saturate ALL clip-pair boundaries end up with monotone transitions (all the profile's default style). EDL's creative-intent transitions (film-burn, dip-to-white, flash, etc.) get silently obliterated and replaced with the profile's default.

proj_L7c43ghg7Rt3 (D-01 profile, Seedance, 30s McDonald's):
- EDL-Exec log: `[EDL-Exec] Transition APPLIED: dissolve @ 216; film-burn @ 447; dip-to-white @ 601; dissolve @ 721; dissolve @ 841` — 5 diverse transitions on 5 of 10 boundaries
- Director log: `add_transition: 5 script transitions already exist`, `5 gaps without transitions, filling with profile default`
- Final MongoDB state: **10 dissolves, ALL source='tool', zero EDL transitions survived**

proj_3jE3Q8mx5fB5 (D-07 profile, Seedance, same kind of script):
- EDL saturated all 10 boundaries with mixed soft-cut + dissolve
- Director log: `all scene boundaries have transitions, skipping`
- Final MongoDB state: **10 transitions, ALL source='edl', mixed styles survived** ✓

### Root cause

**File:** `lib/editron/agent/tools.ts:3732-3744` (schema) + `3852` (fallback branch) + `3802-3808` (destructive delete) + `lib/editron/agent/director-agent.ts:991` (misuse)

The `add_transition` tool's Zod schema `addTransitionSchema` declares only two targeting fields:
```ts
afterOverlayId: z.coerce.number().optional()
applyToAll: z.boolean().optional()
```

Director at director-agent.ts:991 (pre-fix) was passing `{ clipAId, clipBId }` to target one specific pair — but **those fields are not in the schema**. Zod strips unknown fields silently.

The tool then evaluates at line 3852:
```ts
if (input.applyToAll || !input.afterOverlayId) {
  for (let i = 0; i < videoOverlays.length - 1; i++) {
    await applyBetween(videoOverlays[i], videoOverlays[i + 1]);
  }
}
```

With no `applyToAll` and no `afterOverlayId`, `!input.afterOverlayId` is `true` → **tool falls into the applyToAll loop**, iterating every pair.

Inside `applyBetween` at lines 3802-3808, there's an "idempotent" delete-existing step:
```ts
const existingTrans = project.overlays?.find(o =>
  o.type === 'transition' && o.clipAId === outgoing.id && o.clipBId === incoming.id
);
if (existingTrans) {
  await projectService.deleteOverlay(userId, projectId, existingTrans.id);
}
```

So each tool call:
1. Silently iterates all clip pairs (because Director's targeted `clipAId`/`clipBId` params were dropped by Zod)
2. For each pair, deletes any existing transition (including EDL's film-burn etc.)
3. Places the profile-default transition

Director's B1 clip-pair dedup (lines 946-954, shipped 2026-04-18) correctly identifies the 5 EDL-filled pairs and skips them in the outer loop — but each invocation of the tool for a GAP pair triggers the full applyToAll sweep, wiping EDL transitions on OTHER pairs.

Why proj_3jE3 escaped:
Its EDL happened to place transitions on all 10 boundaries. Director's pre-loop check at director-agent.ts:877-881 found `gapCount === 0` → `break` → tool never invoked. Survival was luck of EDL saturation, not correctness.

### Impact

- Every Director run where EDL fills fewer than N-1 boundaries (N = video count) loses all EDL transition diversity.
- Every profile that has `applyToAll: true` default in its action already means the action's profile-level params would enter applyToAll mode anyway — but Director's per-pair loop replaces the params per iteration, so the applyToAll flag set at profile level was already being overridden to undefined.
- Creative intent's transition-type choice (matched to scene mood per creative_production_knowledge.md §6 Transition Psychology) is discarded. Every scene boundary gets the same style regardless of content.

### Fix (one-line change in Director)

`director-agent.ts:991` (pre-fix):
```ts
params: {
  type: effectiveType,
  durationMs: effectiveDuration,
  clipAId: clipA.id,
  clipBId: clipB.id,
},
```

Replaced with:
```ts
params: {
  type: effectiveType,
  durationMs: effectiveDuration,
  afterOverlayId: clipA.id,  // targets THIS pair via tool's single-pair branch
},
```

This routes the tool to the single-pair path at tools.ts:3857-3864 which calls `applyBetween(videoOverlays[targetIdx], videoOverlays[targetIdx + 1])` exactly ONCE.

Director's B1 clip-pair dedup already prevents Director from invoking the tool on pairs that have EDL transitions, so the delete-existing step at 3802-3808 would find nothing to delete — EDL transitions on non-gap pairs are untouched.

### Rule alignment

- **Rule 17N (deliberate):** 3 options considered — (a) change Director's params [chosen], (b) add clipAId/clipBId to schema, (c) remove delete-existing from tool. (a) is smallest surface + preserves other callers' contracts (applyToAll for manual user intent).
- **Rule A4 (every code path):** verified via grep — only Director passes `clipAId`/`clipBId`. Profile actions use `applyToAll: true`. UI panel passes user-chosen params. reactive-edit-engine declares `afterOverlayId: undefined` in a decision shape but doesn't invoke the tool directly.
- **Rule A6 (one source of truth):** addTransitionSchema becomes canonical. Director aligns to its field names.
- **Rule 18N (production stability):** restores rule-driven creative-intent transition placement — system becomes deterministic-per-profile again.

### Reference for future fixer

- File: `lib/editron/agent/director-agent.ts:1015-1022` (fixed params shape)
- File: `lib/editron/agent/tools.ts:3732-3744` (schema), `3802-3808` (delete-existing), `3852` (applyToAll fallback), `3857-3864` (single-pair branch)
- MongoDB witness: proj_L7c43ghg7Rt3 had 10 tool transitions (should have kept 5 EDL + added 5 tool)
- Log witness: "5 gaps without transitions, filling with profile default" + "Transition APPLIED" EDL lines that didn't survive to final state
- Test: re-run the same McDonald's script, query MongoDB, count transitions by source — expect ~5 EDL + ~5 tool mixed.

### Latent related hardening (NOT in this fix — documented for later)

If Director's B1 dedup ever has a false negative (e.g., a transition slips in from somewhere without clipAId/clipBId set), the tool's delete-existing step could still silently remove legitimate EDL transitions. Defensive improvement for a later commit:
- Make the tool's delete-existing respect `metadata.source` priority (only delete same-or-lower-priority existing)
- Add schema validation that requires exactly one of `{ afterOverlayId, applyToAll, clipAId+clipBId }` — error if none or multiple are set, preventing silent fallback

Related concern: `reactive-edit-engine.ts:155` emits `params: { afterOverlayId: undefined }` which would trigger the same applyToAll fallback if ever invoked. Not hitting the bug today because the reactive engine's decisions don't directly map to tool invocations, but worth cleaning.

---

## [2026-04-16] — Edit-direction-applier pacing multiplier compounds with script-set scene durations

**Category:** design-gap
**Severity:** P1 (affects script duration fidelity — Rule 8N "Script Duration is King")
**Status:** open (deferred, Fix #1 for parent issue shipped separately)
**Triggered by:** Nike pipeline test investigation (2026-04-16), project `proj_o0IBr1ParZJQ` delivered 21.6s for a 30s script.
**Related commits:**
- `bbcb438e` (partial) — fixed one half of the duration-drift symptoms by skipping video-duration cap for montage scenes
- Investigation full analysis performed 2026-04-16

### Symptom

Scripts that specify scene durations (e.g., Nike "Scene 2: 5-25 seconds") AND specify pacing for that scene (e.g., "fast-paced montage") deliver ~15% less scene duration than scripted. The Nike log showed:

```
[Finalize] Edit directions applied: 11 overlays (-119 frame shift)
```

-119 frames at 30fps = -3.97s shortening attributable to edit-direction-applier.

This is on top of the PRIMARY duration bug (Contributor #1: sub-shot totals under-filling scene, fixed separately by parser scale-up post-processor).

### Root cause

**File:** `lib/pipeline/edit-direction-applier.ts:85-138`

The applier maintains a `pacingMultiplierMap`:
```typescript
const pacingMultiplierMap: Record<string, number> = {
  'fast': 0.85,
  'slow': 1.2,
  'building': 0.95,
  'beat-synced': 1.0,
  'medium': 1.0,
};
```

When scene has `editDirections.pacing === 'fast'`, applier multiplies every video/image overlay's `durationInFrames` by 0.85 (line 132). It also shifts subsequent scenes left by `frameDelta` (line 134-137).

**The compounding:**

For a script that says "Scene 2: 20 seconds, fast-paced montage":
1. Parser reads the script, extracts `scene.durationSeconds = 20` (script's EXPLICIT duration — already accounts for the intended fast feel)
2. Parser ALSO extracts `scene.editDirections.pacing = 'fast'` (because script mentioned "fast-paced")
3. scene-to-editron places overlays filling 20s
4. edit-direction-applier sees `pacing='fast'` and multiplies 20s × 0.85 = 17s ← **double-counts**

The 20s was already the "fast-paced result per the script's intent." Applying another 0.85 multiplier produces 17s, violating Rule 8N (Script Duration is King).

### Impact

**Affects:** Any script that both specifies an explicit scene duration AND mentions pacing keywords ("fast", "slow", "building").

**Quantified:**
- `fast` multiplier 0.85: loses 15% of scene duration per affected scene
- `slow` multiplier 1.2: adds 20% per affected scene (overshoots scripted time)
- `building` multiplier 0.95: loses 5% per affected scene

**Scripts with multiple paced scenes:** losses compound across the entire video.

**Creative doc violations:**
- Rule 8N: "Script Duration is King — if the script says 4s, show 4s"
- §5 Pacing by Content Type: the content-type pacing table assumes user RESPECTS the per-scene duration, then pacing applies CUTS PER MINUTE within. We're modifying the duration instead.

**Cross-content-type impact** (Rule 0):
- Brand film scripts: typically specify exact durations → always affected
- Social Reels: often omit explicit durations → rarely affected (LLM infers duration, pacing then shapes it)
- Tutorials: typically specify durations → always affected

### Proposed fix options

**Option A: Conditional application (respect explicit script durations)**

Only apply pacing multiplier when scene duration was INFERRED by parser, not stated in script. Requires tracking provenance:

```typescript
interface SceneDescriptor {
  // ... existing fields
  /** True when durationSeconds came from explicit script timing markers
   *  ("Scene 2: 5-25 seconds") vs. LLM-inferred. Set by parser based on
   *  whether a time range was parseable from the script text. */
  durationWasExplicit?: boolean;
}
```

Applier then:
```typescript
const multiplier = scenePacing
  ? (pacingMultiplierMap[scenePacing] || 1.0)
  : globalPacingMult;

// Skip multiplier when scene duration came from explicit script timing.
// Script's duration already bakes in the intended pacing feel.
const skipForExplicitDuration = scene?.durationWasExplicit && scenePacing;
if (skipForExplicitDuration || multiplier === 1.0) {
  // shift only, no duration change
  continue;
}
```

**Pros:** Preserves user intent when explicit, keeps pacing multiplier for LLM-inferred cases.
**Cons:** Requires parser to track provenance (adds `durationWasExplicit` field, updates all parser paths). ~3 files, needs careful testing across script formats.

**Option B: Reduce multiplier intensity**

Change `0.85 → 0.92` for 'fast', `1.2 → 1.1` for 'slow'. Less aggressive → less compounding damage.

**Pros:** 1 file, 2 lines changed. No parser changes needed.
**Cons:** Treats the symptom, not the cause. Scripts with LLM-inferred durations now get less pacing effect than they should.

**Option C: Apply pacing at SHOT level only, not scene level**

Multiplier only affects individual shot/sub-shot durations within the scene, never the scene boundaries. Scene duration stays fixed. Pacing feel achieved by tightening individual cuts.

**Pros:** Preserves script's scene duration. Pacing still has an effect via shot density.
**Cons:** Requires rethinking how pacing flows through the pipeline. Affects 2-3 files. Might over-constrain short scenes.

**Option D: Accept and document (do nothing)**

Current behavior is compounding, but it produces SHORTER videos which often get better social engagement. Document the quirk, move on.

**Pros:** Zero dev time.
**Cons:** Violates Rule 8N. Erodes trust (Rule 18N — users expect predictable output).

### Decision / Action

**Deferred.** Chose **Option A (conditional application)** as the right design, but scope makes it inappropriate for current sprint:
1. Requires parser changes (provenance tracking)
2. Touches 3 files minimum
3. Needs testing across all 54 profiles + multiple content types
4. Interaction with pacing fields in editProfile (`pacingMultiplier: number`) needs reconciliation — profile-level pacing might ALSO compound; requires audit

**Logged for future session.** The parent duration-fidelity problem is being addressed by Fix #1 (parser scale-up post-processor) this sprint. Contributor #2 explains ~4s of the Nike 8.4s loss; after Fix #1 (recovers ~5s), Contributor #2 still costs ~3-4s but output is "close enough" for current standards.

**Next session should revisit when:**
- Beat-sync wiring goes live (beat-sync demands precise scene durations)
- Or user reports duration fidelity as a blocker
- Or Rule 8N compliance audit

**Reference for fixer:**
- File: `lib/pipeline/edit-direction-applier.ts:85-138`
- Log line to watch: `[EditDirections] Per-scene pacing applied, totalShift=N frames`
- Test case: any 30s script with explicit scene time ranges AND "fast-paced" in any scene's description

---

## [2026-04-16] — AI video model quantized duration grids conflict with continuous narrative timing

**Category:** architectural-conflict
**Severity:** P1 (affects any multi-subject scene on non-Seedance models; also affects beat-sync fidelity once shipped)
**Status:** open (deferred — no quick fix is non-shitty)
**Triggered by:** User pushback on proposed Fix #1 (parser sub-shot scale-up) during Nike duration-drift investigation (2026-04-16). User correctly identified that my fix produced arbitrary sub-shot durations without considering model duration grids, would waste paid video on coarse-grid models, and had no strategy for filling gaps.
**Related:** Same Nike investigation as Contributor #2 above. These two problems COMPOUND.

### Symptom

The same 30s script produces different output durations depending on which video model the user picked, because each model has a different achievable duration grid. Example with Nike Scene 2 (scripted 20s, 5 athletes):

| Model | Allowed clip durations | 5 sub-shots × best fit | Result |
|---|---|---|---|
| Kling 2.1 | {5s, 10s} | 5 × 5s = 25s | 5s overshoot, OR drop athlete |
| Veo 3.1 | {4s, 6s, 8s} | 5 × 4s = 20s | exact fit ✓ |
| Seedance 1.5 | integer 4-12s | 5 × 4s = 20s | exact fit ✓ |

Identical creative intent, different duration outcomes, inconsistent cross-model behavior.

### Root cause

This is NOT a bug. It's an **architectural mismatch** between three layers:

1. **Script layer** (continuous timing): scripts specify scene durations + shot counts as continuous variables.
2. **Creative intent layer** (LLM parser): parser produces `targetDurationSeconds` as a free-form float (any value).
3. **Model execution layer** (fal.ai adapters): each model has a quantized duration set — `video-model-configs.ts:actualSeconds()` snaps to achievable values.

**File:line evidence:**
- `lib/pipeline/adapters/video-model-configs.ts:93` (Kling 2.1) — `actualSeconds: (n) => n >= 8 ? 10 : 5`
- `lib/pipeline/adapters/video-model-configs.ts:123` (Kling 2.6) — same binary grid
- `lib/pipeline/adapters/video-model-configs.ts:151` (Veo 3.1) — `actualSeconds: (n) => n <= 4 ? 4 : n <= 6 ? 6 : 8`
- `lib/pipeline/adapters/video-model-configs.ts:188` (Seedance 1.5) — `Math.min(Math.max(Math.round(n), 4), 12)`
- `lib/pipeline/adapters/video-model-configs.ts:226` (Seedance 2.0) — `Math.min(Math.max(Math.round(n), 4), 15)`

**The conflict:** Parser produces e.g., 4s targetDurationSeconds. Kling adapter snaps to 5s. Timeline scheduled for 4s. Video asset is 5s. 1s of generated video is trashed per clip. Scene duration is OFF by the snap delta × clip count.

### Impact

**Affects:** Any multi-sub-shot scene on Kling or Veo, where scene duration ÷ shot count doesn't match a model's grid value. Seedance (fine-grained integer 4-15s) is the only model that reliably avoids this.

**Not merely cosmetic:**
- **Cost waste:** generated video paid for, partially unused (~$0.01-0.05 per affected clip × multiple clips per project)
- **Timeline drift:** scheduled timeline vs. actual video duration mismatch → gap-closing absorbs, output drifts from script
- **Beat-sync blocker:** when beat-sync ships, it needs accurate scene durations to place cuts on downbeats. Quantization drift makes beats misalign.

**Cross-content-type impact (Rule 0):**
- Seedance-first users (current default): mostly unaffected (fine-grained grid)
- Kling-first users (cinematic preset): 20-30% duration drift possible
- Veo-first users (premium): minor drift, Veo's {4,6,8} grid often aligns with common durations

### Proposed fix options (all have meaningful drawbacks — documented here so future sessions don't reinvent)

**Option A: Parser-level scale-up (original "Fix #1")**
- Parser post-processor scales sub-shot durations to fill parent scene.
- Downside: ignores model grid. Produces non-achievable durations that adapter will snap — cost waste + timeline slot ≠ video asset length.
- Verdict: **flimsy.** Works only for Seedance. Fails Kling/Veo silently.

**Option B: Model-aware constraint solver (parser or generate-videos level)**
- Solver function picks sub-shot durations from model's achievable grid that sum to scene duration.
- May require DROPPING sub-shots to fit (5 athletes → 4 athletes on Kling).
- Downside: **loses creative intent without UI warning.** User wrote 5 athletes, gets 4. Silent degradation.
- Downside: no good answer when no combination fits (e.g., 17s scene on Kling {5, 10} — 1×10+1×5=15, 2×5=10, nothing hits 17).
- Verdict: **lossy.** Needs UI component to surface tradeoffs.

**Option C: Filler content strategy**
- Gaps filled with B-roll, freeze frames, or generated filler clips.
- Downside: **we have no filler pool.** Would require additional AI generation per gap (+cost) OR reuse existing shots (repetitive).
- Downside: Rule 7N: "Ken Burns is ABSOLUTE LAST RESORT." Most filler strategies are Ken Burns variants.
- Verdict: **doesn't exist.** Can't build without Phase C (asset library) or Phase G (motion graphics primitives) first.

**Option D: Model auto-selection at parse time**
- Parser analyzes scene structure and picks model whose grid best fits.
- Nike 20s/5 shots → Seedance (5×4=20 exact).
- Downside: overrides user's model choice. User picked Kling for a reason.
- Downside: requires model selection BEFORE parse; current flow picks model later.
- Verdict: **violates user control.** Could be OPT-IN.

**Option E: Profile-level conflict resolution policy**
- Add `editProfile.onDurationConflict: 'preserve-duration' | 'preserve-shots' | 'extend-scene' | 'auto-select-model'`.
- Parser reads policy and resolves accordingly.
- Brand ad profile → preserve-duration (drop shots).
- Action montage → preserve-shots (extend scene).
- Downside: each of 54 profiles needs annotation.
- Downside: still lossy in individual cases (just codifies which way the loss goes).
- Verdict: **best long-term answer,** but requires Phase-C-or-G-equivalent investment.

**Option F: Accept drift, document honestly**
- Current behavior. Document limitation in UI so users can pick accordingly.
- For duration-critical content, recommend Seedance in tooltip/dialog.
- Downside: violates Rule 8N (script duration is king) in practice.
- Downside: Rule 18N (Insturix as industry standard) compromised — users don't want "pick Seedance to avoid our bug."
- Verdict: **what we have now.** Least bad short-term but not the long-term answer.

### Decision / Action

**Ship nothing this sprint.** User (2026-04-16) correctly pushed back on Option A band-aid. No other option is shippable without larger architectural investment:
- B needs UI for tradeoff surfacing
- C needs Phase C or Phase G
- D needs parse-time model selection rework
- E needs 54-profile annotation + policy logic
- F is the current state

**Re-evaluate when:**
- Beat-sync goes live (will force the decision — probably Option E with default `preserve-duration`)
- Phase C (asset library) or Phase G (motion graphics) unlock filler strategies (Option C becomes viable)
- User reports specific script that produces broken output AND requires fix (concrete scenario drives decision)
- User picks non-Seedance model AND hits duration problem (forcing function)

**Short-term mitigations (zero-code):**
1. Document model duration grids visibly in model-selection UI (ExportToEditronDialog) so users can pick informed.
2. Keep Seedance as default for content that doesn't specify otherwise.
3. Log a diagnostic warning in generate-videos when sub-shot math mismatches model grid.

**Reference for future investigator:**
- Current Seedance-default users: unaffected. Don't break them.
- When the solver IS built (Option B or E), start with `planSubShotDurations(sceneSec, shotCount, modelGrid) → { durations: number[], droppedShots?: number }`.
- UI needs a warning layer that surfaces "your script + model will lose X" BEFORE generation cost is incurred.
- Beat-sync sprint (whenever it comes) is the likely forcing function — wire that first, then address constraint solving.

---

## [2026-04-17] — Beat-sync design doc (Option C: profile-gated synchronous BGM)

**Category:** design-gap (feature not wired) + design-doc (architecture choice recorded)
**Severity:** P1 (blocks "premium feel" quality multiplier; specifically needed for montage/music-video content)
**Status:** IMPLEMENTED 2026-04-17 (commits 31df7b3a + 6875d02a + 8efc06df + 040548e5). Heuristic beat detection MVP. Audio-analysis upgrade path documented in beat-detection-service.ts header.
**Triggered by:** User-approved Option C (2026-04-17) after comparing alternatives during Nike-test sprint investigation.

**Actual commits:**
- `31df7b3a` Phase B1 — beat-detection-service.ts primitive (heuristic grid, BPM inference, script BPM extraction)
- `6875d02a` Phase B2 — parser post-processor for beatSyncActive flag + BPM extraction
- `8efc06df` Phase B3 — finalize sync BGM dispatch + beat grid on BGM overlay metadata
- `040548e5` Phase B4 — Director step 3.5 wires alignCutsToBeats (previously dead code)

---

## [2026-04-17] — Profile detection scoring normalization penalized rich-keyword profiles

**Category:** bug (scoring math)
**Severity:** P1 (affects every profile auto-selection outcome; silently picks wrong profile)
**Status:** FIXED 2026-04-17
**Triggered by:** Nike script (Limitless Flow: Nike Athletes in Motion) auto-detected as `B-02 E-Commerce / Product Launch` instead of `B-05 Health & Wellness / Athletic` despite strong athletic signals ("athletes", "runners", "basketball", "gymnasts", "dunks" all present in visualDescription).

### Symptom

For the Nike athletic brand ad:
- **B-02 Product Launch** matched 2 of its 4 keywords (raw score 0.6) → normalized **0.55**
- **B-05 Athletic** matched 5 of its 16 keywords (raw score 2.0) → normalized **0.38**

B-02 won despite B-05 having 3.3× more actual evidence. This happened because the scoring formula was `score / maxPossible` — profiles with fewer keywords have smaller denominators, making high percentages easier to achieve.

### Root cause

**File:** `lib/editron/services/profile-detection-service.ts:131` (pre-fix)

```ts
let normalized = score / maxPossible;
```

`maxPossible` is the sum of that specific profile's own keyword weights. Sparse profiles (B-02: 4 keywords totaling 1.1) compete on the same 0-1 scale as rich profiles (B-05: 16 keywords totaling 5.2). A single moderate match can produce 30-50% confidence for a sparse profile. A rich profile needs multiple strong matches to hit the same percentage.

**Verified with actual Nike data:**
- B-02: keywords matched = {product, close-up}, raw score = 0.4+0.2 = 0.6, maxPossible = 1.1 → 0.6/1.1 = 0.545
- B-05: keywords matched = {athlete, runner, basketball, gymnast, dunk}, raw score = 0.5+0.4+0.4+0.3+0.3 = 1.9, maxPossible = 5.2 → 1.9/5.2 = 0.365

### Impact

**Affects:** Every script auto-detection outcome. Profiles with SPARSE keyword lists systematically win over profiles with RICH keyword lists.

**Which profiles are unfairly advantaged:**
- B-02 (4 keywords, max 1.1): Product Launch
- F-02 (4 keywords, max 1.4): Event Live Stream
- D-01 (4 keywords, max 1.5): Cinematic Premium
- Any profile with ≤5 keywords

**Which profiles are unfairly penalized:**
- B-05 (16 keywords, max 5.2): Athletic
- B-01 (14 keywords, max ~4.8): SaaS
- B-03 (12 keywords, max ~4.5): Fashion
- Any profile with ≥10 keywords

**Content-type consequence:** athletic brand ads, SaaS product demos, fashion lookbooks, and other categories with rich keyword vocabularies consistently got wrong profile detection. Since profile drives EVERYTHING downstream (filter, pacing, transitions, SFX policy, captions, audio ducking), wrong profile = wrong editing character throughout the entire pipeline.

### Fix (implemented 2026-04-17)

**Commit:** pending (this session)
**Files:**
- `lib/editron/config/editron-config.ts` — new `ProfileDetectionConfig` interface + defaults
- `lib/editron/services/profile-detection-service.ts` — use config constants, removed per-profile normalization

**New formula:**
```ts
let normalized = Math.min(1, score / DETECTION.scoreNormalizationTarget);
```

Where `scoreNormalizationTarget = 2.5` (configurable in `editron-config.ts`). This represents the "strong match target" — ~5 medium-weight keywords (0.5 each) hitting, or ~3 strong keywords (0.8 each) hitting.

**New Nike scores:**
- B-02: 0.6 / 2.5 = **0.24** → below `fallbackConfidence` (0.40), flagged for review
- B-05: 2.0 / 2.5 = **0.80** → above `autoSelectConfidence` (0.60), auto-select ✓

### Rule alignment

- **Rule 18N (Production Stability):** deterministic — same input → same profile, every time
- **Rule 19N (Domain Expert Check):** a sound designer / editor looks at total evidence, not "percentage of my own checklist I fulfilled"
- **Rule A6 (One Source of Truth):** magic numbers moved to `editron-config.ts` `ProfileDetectionConfig` section. No hardcoded values in scoring code.
- **Rule 17N (Deliberate):** alternatives considered and rejected:
  - Sqrt scaling (`normalized × sqrt(score+1)`) — complex, harder to reason about
  - Match count bonus (`normalized × (1 + 0.1 × matches)`) — doesn't fully solve the problem
  - Pure raw score without cap — breaks existing confidence thresholds

### Tuning notes for future sessions

The `scoreNormalizationTarget` constant (default 2.5) has documented tuning guidance in `editron-config.ts`:
- Lower (2.0): easier auto-select, more projects get a specific profile
- Higher (3.0): harder auto-select, more fall to G-01 Universal Clean with manual review

If future tests show TOO MANY auto-selects with wrong profiles, raise to 3.0. If TOO FEW auto-selects and users complain about manual review prompts, lower to 2.0.

**Concrete test to re-validate:** Nike script in Vercel preview should detect B-05 Athletic at confidence 0.80+. If it regresses, check that parser's `suggestedProfileCategory = 'industry-vertical'` is still flowing (previous 2026-04-17 fix) AND that the scoring hits 2.0+ raw.

---

## [2026-04-17] — LLM parser cold-start timeouts force regex fallback with destructive data shape

**Category:** silent-failure (cascading to data-integrity violation)
**Severity:** P0 (when LLM parser fails, ENTIRE pipeline's intelligence is neutered — profile correct only by luck)
**Status:** ✅ FULLY RESOLVED 2026-04-19 (root-cause fix in regex parser + prior mitigations retained as layered defenses).

**Resolution timeline (all commits kept as defense-in-depth):**
1. `fce2ccdd` (2026-04-17) — Quality gate in `export-for-editron/route.ts` rejects byte-identical narration/visualDescription + editorial-header narration with HTTP 422 retryable. Prevented garbage reaching Editron.
2. `3ffd1a70` (batch around 2026-04-18) — LLM abort timeout bumped 120s → 180s for cold-start headroom.
3. `8f76b94f` (Batch 4, 2026-04-19) — `geminiRetry` wrapper with exponential backoff (1.5s→3s→6s→12s) on parser's main `generateObject` call. Exhausts before falling back to regex.
4. **Root-cause fix (S-16, commit `f41b4e52`, 2026-04-20):** `lib/pipeline/script-to-scenes.ts` rewritten:
   - Added exported `EDITORIAL_HEADER_PATTERNS` + `isEditorialHeaderLine` helper — single source of truth, route.ts imports it (no more pattern drift risk).
   - `convertThinkForgeBlocksToScenes`: paragraph-block branch now detects editorial metadata ("Emotional Target:", "Instrumentation:", etc.) and routes to `rawProductionNotes` instead of concatenating into `narration`. TTS can no longer speak production directives.
   - Killed the `visualDescription: ... || narration.substring(0, 2000)` copy-back in both `convertThinkForgeBlocksToScenes` (line 98→144) AND `convertCIRToScenes` (line 424→478). Downstream `storyboard-prompt-builder.ts:106` already handles empty visualDescription with a 300-char scene-context hint — cleaner than byte-identical duplication.
   - Quality gate stays in place as last-line defense. Should never trip on these two patterns again; if it does, it signals a NEW editorial pattern to add to the shared list.

**What this resolves:**
- The byte-identical dump symptom (narration === visualDescription at 622/906/630 chars) can no longer happen — the copy-back line that produced it is gone.
- The "TTS speaks editorial metadata" symptom can no longer happen — editorial headers never reach the `narration` field.
- Rule 2N alignment: regex fallback now produces legitimate degraded output instead of garbage. Rule 16N graceful degradation.
- The `parserFallback: true` flag in responses becomes a quality signal (LLM down, output usable) rather than a garbage signal (LLM down, output toxic).
**Triggered by:** User Nike test `proj_a83yxEs73pKg` / `sb_pq2iQh5xGLaQ` on deployment `dpl_EbLMJJeKWJWriExFdYTUioCgRZ5t` (2026-04-17 15:17).

### Symptom

User re-ran the Nike script after env fix + sprint push. Visible failures:
- Storyboard page 500 crash (separate investigation — see below)
- Export dialog shows massive VO truncations: Scene 0 46.5s→10s, Scene 1 61.9s→10s, Scene 2 46.4s→10s
- No beat-sync activated (even though script says "140 BPM", "montage", "quick cuts")
- No sub-shot decomposition (Scene 2's 5-athlete montage became 1 clip)
- Each scene capped to 10s video

Previously (different run, previous log 13:58) the same user got the same 403 error — but a minute later it worked. That's cold-start luck.

### Root cause

**Primary:** `AbortSignal.timeout(120_000)` in `lib/pipeline/llm-scene-parser.ts` fires BEFORE Gemini 2.5 Flash responds, especially on cold-start for the new GCP project `insturix-493414`. The parser catches TimeoutError and falls back to regex parsing.

**Documented in `toyota_reliability_audit.md`:**
- **A.gemini.4 [P1]:** "90s abort timeout on parser may be too tight for 50+ scene scripts" — Nike is only 3 scenes but the complex Zod schema + structured output still takes >120s on cold start.

**Secondary (the data-destruction part):** The regex fallback in `app/api/services/thinkforge/script/export-for-editron/route.ts` produces a structurally-incompatible output shape:

MongoDB evidence (Nike, `sb_pq2iQh5xGLaQ`):
```
scenes[0].narrationLength === scenes[0].visualDescriptionLength === 622
scenes[0].narration.slice(0, 80) === scenes[0].visualDescription.slice(0, 80)
  === "Emotional Target: Immediate engagement, high-intensity..."
scenes[0].editDirections === {}                 // empty object, not undefined
scenes[0].subShots === []                       // no montage decomposition
scenes[0].musicDescription === ""
scenes[0].sfxDescription === ""
storyboard.suggestedProfileCategory === null
storyboard.overallMusicPrompt === ""
```

The regex parser dumps the ENTIRE scene block (metadata + visual + audio notes + editorial headers) into BOTH `narration` AND `visualDescription` fields. The "Emotional Target:" / "Instrumentation:" / "Audio:" / "Visual:" / "On-Screen Text:" editorial headers become part of the text TTS speaks and the image gen draws.

### Impact cascade

When LLM parse times out, EVERY downstream intelligence is affected:

| Feature | Expected source | Actual state when regex fires | Effect |
|---|---|---|---|
| `suggestedProfileCategory` | LLM parser new field | `null` | LLM category filter (2026-04-17 fix) NEVER activates |
| `beatSyncActive` | LLM parser post-processor | `undefined` | Beat-sync (B1-B4) never runs, stays in async BGM flow |
| `bpm` | LLM parser regex on script | `undefined` | No beat grid, `alignCutsToBeats` silently no-ops |
| Per-scene `editDirections` | LLM extracts from script | `{}` | No `pacing`, `onScreenText`, `sfxCue`, `transition` hints — edit-direction-applier no-ops |
| Per-scene `subShots` | LLM montage decomposition | `[]` | No montage decomposition — multi-subject scenes collapse to 1 clip |
| `sfxDescription` | LLM per-scene field | `""` | SFXLib never searches for ambient/foley |
| `musicDescription` | LLM per-scene field | `""` | BGM generation gets generic prompt |
| `narration` (for TTS) | LLM extracts clean spoken lines | **Full scene metadata block** | TTS speaks "Emotional Target: ..." — user hears 46-62s of editorial metadata |
| `visualDescription` (for image gen) | LLM extracts clean visual | **Full scene metadata block** | Image gen gets polluted prompt — still works but less precise |

**Profile detection still worked** but only because the visual field contained athletic keywords (athlete, runner, basketball, dunk, gymnast) from the raw script block. Score was 0.92 — dominated by keyword matching, not semantic understanding. If the script had been less keyword-rich, profile detection would have been random.

### Why this happens NOW specifically

Three cumulative pressures on parser LLM call:
1. **Complex Zod schema** — ParseResultSchema has scenes[] with nested editDirections, subShots, many optional fields → Gemini structured output is slower
2. **Cold start on new GCP project** — `insturix-493414` is fresh, first Gemini call of the day warms up → 60-100s warm-up
3. **Large scripts** — user scripts are 3-4K chars with editorial scaffolding → more tokens to process

Total cold-start parse time: often 100-130s. Our 120s `AbortSignal.timeout` catches this.

### Proposed fixes (not this session — too late in sprint)

**Fix options for LLM timeout:**
- (A) Bump timeout to 180s (Vercel function limit is 300s — safe headroom)
- (B) Prewarm Gemini via health check call on deploy
- (C) Switch parser to `gemini-3.1-flash-lite-preview` (faster, untested with complex schema — Rule A1 concern)
- (D) Simplify Zod schema — move optional fields to post-processing

**Fix options for regex fallback data quality (WORSE problem):**
- (E) Regex should NOT write identical text to narration AND visualDescription. Split on script conventions ("Visual:", "Audio:", "Narration:").
- (F) Regex should recognize "Emotional Target:", "Instrumentation:", etc. as editorial headers and EXCLUDE from narration.
- (G) When regex fallback fires, refuse to proceed — return 500 with clear error to user, force retry rather than produce garbage.
- (H) Detect the regex-fallback shape in finalize (identical narration/visual = smell) and refuse to dispatch downstream jobs.

**Recommended combination:** A + E + G. Timeout headroom + fix regex split + hard-fail on parser failure rather than silently producing garbage.

### Rule alignment

- **Rule 2N (No Fallbacks as Solutions):** Current regex fallback IS the root violation. A "fallback" that produces unusable data is worse than a hard failure — it burns user credits on garbage output without user knowing.
- **Rule 18N (Production Stability Standard):** System must fail LOUDLY when LLM parser fails. Silent fallback with garbage data is the opposite of industry-standard.
- **Rule 3N (Adversarial Testing):** This failure mode wasn't on the testing radar. Any parser test should include "LLM unavailable" scenario.
- **Rule A5 (Downstream Consumers Ready):** Our recent commits added new fields (`suggestedProfileCategory`, `beatSyncActive`) that silently null-out when parser fails. They work with the happy-path. They gracefully no-op on failure. But they don't warn the user that intelligence features are disabled.

### Reference for future investigator

- File: `lib/pipeline/llm-scene-parser.ts:126` (`AbortSignal.timeout(120_000)`)
- File: `app/api/services/thinkforge/script/export-for-editron/route.ts:140-155` (regex fallback branch)
- Log markers: `[export-for-editron] LLM parsing FAILED: { name: 'TimeoutError' }` + `[export-for-editron] Using regex parser (fallback)`
- MongoDB smell test: if `scenes[0].narration === scenes[0].visualDescription` → regex fallback fired

---

## [2026-04-17] — Storyboard page crash: "Cannot access 'ec' before initialization"

**Category:** bug (JS bundle / runtime TDZ error)
**Severity:** P0 (blocks all users from viewing their storyboards on `/dashboard/storyboard/[id]`)
**Status:** INVESTIGATED, root cause unconfirmed — needs targeted bundle diagnosis
**Triggered by:** User attempt to view `/dashboard/storyboard/sb_pq2iQh5xGLaQ` on deployment `dpl_EbLMJJeKWJWriExFdYTUioCgRZ5t` (commits `42a3fc16` + earlier sprint).

### Symptom

```
⨯ ReferenceError: Cannot access 'ec' before initialization
    at q (.next/server/app/dashboard/storyboard/[storyboardId]/page.js:1:11407)
  digest: '467360815'
```

Browser shows "Something went wrong" page with "Go home" button. The MongoDB data for the storyboard IS valid (verified via direct query — scenes, overlays, videos all populated). This is a pure client/SSR rendering crash, not a data issue.

### Root cause (suspected, unconfirmed)

**The error pattern "Cannot access `<var>` before initialization"** is a JavaScript Temporal Dead Zone (TDZ) violation — code reads a `let`/`const` before its declaration executes. In minified production code, this usually comes from:

1. **Circular import** between two module-level `const` declarations. Webpack/Turbopack can produce bundle output where one module's top-level const is evaluated before its dependency's const is defined.
2. **Tree-shaking inlining** that misorders initialization.
3. **Stale build cache** from Vercel — older bundle chunks mixed with new ones.

**Suspected trigger:** Our sprint added a new import chain:
- `lib/editron/services/profile-detection-service.ts` NOW imports `DEFAULT_CONFIG` from `lib/editron/config/editron-config.ts` (new, commit `42a3fc16`)
- `editron-config.ts` imports `EditProfile` type from `lib/editron/data/edit-profile-types.ts` (pre-existing)
- `lib/editron/data/edit-profiles.ts` (the actual profile catalog) imports from `edit-profile-types.ts`
- `components/dashboard/storyboard/StoryboardWorkspace.tsx` does NOT directly import any of these, BUT may transitively via barrel files or shared contexts.

**Unconfirmed:** whether this specific transitive chain causes the TDZ.

**Alternative hypothesis:** stale Vercel build cache from previous deployment. The redeploy DID pick up the new env var value but may have reused cached page chunks with stale module graph.

### Impact

Every user who exports a project and clicks "View Full Storyboard" hits the crash. Blocks:
- Sub-shot review (the very feature user complained was missing UI-side)
- Per-scene regenerate
- Manual profile override from storyboard workspace
- Generally any post-export review workflow

### Proposed fixes

**Fix A: Clean rebuild** (fastest test, zero code change)
- In Vercel → Deployments → Redeploy → uncheck "Use existing Build Cache"
- Forces full rebuild from scratch
- If crash goes away → was a stale-cache bug
- If crash persists → it's our code

**Fix B: Isolate the import chain** (if Fix A fails)
- Temporarily revert commit `42a3fc16` (profile detection normalization moves DEFAULT_CONFIG import)
- If crash goes away → the new import chain is the cause
- Investigate circular dep: run `madge --circular lib/editron/` locally
- Fix by restructuring imports (e.g., inline the small constants instead of cross-file import)

**Fix C: Add error boundary**
- Even if we fix the root cause, page should never white-screen
- Wrap `<StoryboardWorkspace>` in an error boundary that shows a useful error + "Open in Editor" fallback
- Prevents future bundle errors from locking users out

### Rule alignment

- **Rule A10 (Verify Deployed Result):** This bug would have been caught by visiting the page on the Vercel preview AFTER each push. Tests should include "view storyboard page" step.
- **Rule 18N (Production Stability Standard):** A professional tool never white-screens. Error boundary is non-negotiable long-term.
- **Rule 16 (Production-Level Engineering):** "Graceful degradation — new features fall back to previous behavior on failure, never crash" — violated here.

### Reference for future investigator

- File: `app/dashboard/storyboard/[storyboardId]/page.js:1:11407` (minified — source is `page.tsx` + `StoryboardWorkspace.tsx`)
- Error digest: `467360815` (Next.js bundles this into error reports — cross-ref if seen again)
- Deployment ID where crash first seen: `dpl_EbLMJJeKWJWriExFdYTUioCgRZ5t`
- Commit cohort: `42a3fc16` (profile normalization) + `b0e142f2` (LLM category filter) + `164dd21a` earlier — any could be the trigger
- Test to confirm root cause: after applying Fix A (clean rebuild), visit the same storyboard URL. If works → cache was the cause. If still broken → revert sequence.

### Follow-up investigation 2026-04-17 (post-commit `b0e142f2`)

Traced the dependency chain to confirm or deny whether my sprint commits caused this crash.

**Finding: Sprint commits DID NOT touch the runtime import chain for StoryboardWorkspace.**

Chain traced via grep (Rule 10N — no assumptions):
- `app/dashboard/storyboard/[storyboardId]/page.tsx` (11 lines) imports only `StoryboardWorkspace` + Next.js `useParams`
- `components/dashboard/storyboard/StoryboardWorkspace.tsx` imports only React + UI primitives + `useStoryboard` hook + Lucide icons
- `components/dashboard/storyboard/hooks/useStoryboard.ts` imports only `type Storyboard` from `@/lib/pipeline/schemas/storyboard` (type-only!)
- `lib/pipeline/schemas/storyboard.ts` has ZERO imports (pure TypeScript types)

Type-only imports (`import type`) are erased at compile time — they produce NO runtime JavaScript. Therefore my addition of `suggestedProfileCategory?: string` to the `Storyboard` interface in commit `b0e142f2` cannot cause a runtime TDZ error in the bundle.

**Neither `profile-detection-service.ts`, `editron-config.ts`, nor `edit-profiles.ts`** (the files I touched in `42a3fc16` / `b0e142f2` that DO have runtime code) are imported anywhere in the StoryboardWorkspace transitive dependency tree.

**Conclusion: the crash is NOT directly caused by this sprint's commits.** Most likely stale Vercel build cache from the redeploy pattern. Next commit push (`fce2ccdd`, quality validation) triggers a full rebuild — if storyboard page loads after, cache was confirmed culprit.

**If crash persists after `fce2ccdd` rebuild:** there is a real bug elsewhere (pre-existing or triggered by environmental change). Would need:
- Vercel build log comparison (what chunks are emitted for page.js)
- Local `npm run build` + `ANALYZE=true` to inspect bundle structure
- Git bisect against `7a67e73f` (last confirmed-working commit on this page per git log)

---

---

## [2026-04-18] — CRITICAL: Dual transition system regression (A3.5.1/A3.5.2 returned)

**Category:** regression — A3.5.1/A3.5.2 previously fixed in `90267a82`
**Severity:** P0 (duplicate transitions on same clip boundaries — visible quality regression)
**Status:** FIXED 2026-04-18 (pending preview re-test on fresh run)
  - A1: commit `8362b5dc` — strip in-memory dedup markers before save (ghost transitions)
  - B1 + B3: THIS session's second commit — clip-pair dedup in EDL + Director + post-composition safety net
**Triggered by:** User inspection of proj_3ETiKQF69nRd transitions — "transitions are repeated throughout"

### Root causes (all three confirmed)

1. **Ghost transitions (3 at frames 250/404/678):** `director-agent.ts:945` in-memory dedup markers
   pushed to `overlays` array after each `invokeAITool` success; step-4 `saveProject(overlays)` persisted
   the full in-memory array including these markers to MongoDB. Markers had `type: 'transition'` +
   `metadata: { isTransition: true }` but no `source`, no `transitionStyle`, no `content` — exactly
   matching the ghost fingerprint.
   **Fix:** tag markers with `inMemoryMarker: true`; filter before save.

2. **Dual transitions on same clipA/clipB pair:** EDL executor (`edl-executor.ts:410-413`) and Director
   `add_transition` (`director-agent.ts:907-911`) each had their own dedup check, but they used
   different reference frames — EDL compared against `decision.frame` with ±15f window, Director
   compared against `boundaryFrame = clipA.from + clipA.duration` with ±30f window. EDL actually
   places the overlay at `boundaryFrame - floor(duration/2)`, so when drift accumulated, the two
   checkers failed to see each other's work on the same pair.
   **Fix:** both dedup checkers now primary-match on clipAId+clipBId identity (authoritative),
   with frame-proximity retained as fallback for legacy overlays without clip IDs.

3. **Too many EDL transitions (8 for 3 scenes):** not individually traced this session. Likely
   both intent-translator AND reactive-edit-engine produce transition decisions that the EDL
   executor's 15f dedup doesn't collapse. Mitigated (not fixed) by B3 safety net which ensures
   at most one transition survives per pair regardless of how many get proposed.

   **DIRECTION CHOSEN 2026-04-18 (user): Option A — intent-translator is authoritative.**
   Reactive-edit-engine keeps its role as the FALLBACK engine that runs only when creative
   intent fails to produce decisions (as already documented in stable_v2_snapshot.md:
   "Fallback: if creative intent fails → reactive edit engine"). The task for a follow-up
   commit: verify that when creative intent SUCCEEDS, reactive-edit-engine's transition
   emissions (reactive-edit-engine.ts:153, 285, 361, 460) are either gated off or discarded
   before reaching the EDL executor. Grep the Director wiring to confirm the actual current
   behavior — the doc says "fallback" but the 8-for-3-scenes evidence suggests both may fire
   in parallel on the creative-intent happy path too.

   Scope when picked up: 1-2 files, touches `director-agent.ts` where creative intent is
   merged with reactive-engine output (if any), and possibly `reactive-edit-engine.ts`
   itself if a "creative-intent-succeeded" flag needs to short-circuit its transition
   emission. See Rule 13 — this is an architectural decision already approved by user, so
   when implementing no fresh permission needed, but should still re-check with user before
   removing any existing behavior.

### Evidence from MongoDB (proj_3ETiKQF69nRd)

Total transitions: **12** for a 3-scene McDonald's ad (expected: 2 — one between each pair of scenes).

```
EDL source (8 transitions — too many for 3 scenes):
  171 (18f)  film-burn    clipA=...3414 → clipB=...3416
  328 (12f)  soft-cut     clipA=...3417 → clipB=...3418
  485 (6f)   flash        clipA=...3419 → clipB=...3420
  558 (15f)  dissolve     clipA=...3420 → clipB=...3421
  619 (12f)  soft-cut     clipA=...3421 → clipB=...3422
  738 (15f)  dissolve     clipA=...3423 → clipB=...3424
  799 (12f)  soft-cut     clipA=...3424 → clipB=...3425  ← pair X
  798 (15f)  dip-to-black clipA=...3424 → clipB=...3425  ← pair X (DUPLICATE)

Ghost transitions (NO style, NO source, NO metadata):
  250 (15f)  ???
  404 (15f)  ???
  678 (15f)  ???

Tool source (from Director add_transition tool):
  179 (15f)  dissolve     clipA=...3414 → clipB=...3416  ← pair Y (duplicate of EDL film-burn)
```

**Two categories of bugs:**

1. **Dual transition on same clip pair** — EDL places film-burn at frame 171 on pair 3414↔3416, then `add_transition` tool places dissolve at frame 179 on SAME pair 3414↔3416. Same issue for pair 3424↔3425 (soft-cut + dip-to-black).

2. **Ghost transitions** — 3 transitions at frames 250, 404, 678 with no `metadata.source`, no `transitionStyle`, no `content`. Origin unknown. Possibly from edit-direction-applier, possibly from scene-to-editron placeholder, possibly from a new code path in recent commits.

### Why this regressed

Commit `90267a82` "Fix A3.5.1/A3.5.2: remove duplicate transition system from finalize" killed the edit-direction-applier's transition placement, leaving EDL + Director-add_transition as the two sources. We also shipped `b68fcdef` in-memory marker dedup.

The regression is likely one of:
- In-memory dedup marker doesn't persist across the EDL-executor-then-Director sequence for the SAME clip pair
- Transition SFX placer (Fix 1.2 commit `0de726f5`) may be creating "ghost" overlays without metadata
- Something else reintroduced via recent commits

### Impact

Every user gets duplicate transitions on some clip boundaries. Renders have:
- Stacked transition effects (one on top of another)
- Inconsistent pacing (2 transitions on 1 boundary, none elsewhere)
- User-visible "muddy" or "over-edited" feel

### Investigation needed (next session)

1. Re-read commits `90267a82`, `b68fcdef`, `0de726f5` to find the specific dedup logic
2. Grep for all places that push transitions to overlays array — there should be exactly one authoritative source
3. Check if transition-sfx-placer (Fix 1.2) is erroneously creating transition overlays instead of sound overlays
4. Check the 3 ghost overlays at frames 250/404/678 — where do they come from?
5. Check if multiple deploys with graph cache might have introduced duplicate code paths

### Quick fix options (when investigation completes)

- Add a post-composition dedup pass: if two transitions share clipA+clipB, keep only the one with highest metadata.source priority (EDL > tool > unknown)
- Refuse transition placement if one already exists at the same clipA+clipB
- Strip ghost transitions (no source metadata) as invalid

### Reference for future investigator

- File: `lib/editron/services/edl-executor.ts` (applyTransition function)
- File: `lib/editron/agent/director-agent.ts` (add_transition existing-check at line ~763)
- File: `lib/editron/services/transition-sfx-placer.ts` (should only push `type:'sound'` — verify it's not pushing transitions)
- File: `lib/pipeline/edit-direction-applier.ts` (supposedly disabled per commit 90267a82 — verify)
- Test project: proj_3ETiKQF69nRd (MongoDB editron_prev.projects)
- Test transition audit command pattern: filter overlays by `type==='transition'`, group by clipAId+clipBId, report any group with >1 entry

---

## [2026-04-18] — Nano Banana 2 reference images hardcoded to text-only (image-urls capability untapped)

**Category:** bug (known TODO, never completed) + quality-visible-to-user
**Severity:** P1 (scene images visually inconsistent with reference images — user-observable style drift)
**Status:** IDENTIFIED, fix requires new capability type
**Triggered by:** User Nike/McDonald's test 2026-04-18 — reference images (Happy Meal, Golden Arches) look high-quality and on-brand standalone, but scene images (restaurant interior, family meal) are stylistically different — different photographic treatment, lower perceived resolution, slightly off-brand.

### Symptom

User provides reference subject images via ThinkForge → they're generated standalone by `ReferenceImageWorker` at full quality. User then approves refs → storyboard images are generated → scene images look DIFFERENT from the refs because the model doesn't actually see the reference images, only text descriptions.

For proj_3ETiKQF69nRd (McDonald's):
- 5 approved refs generated standalone (ref_cb5UiHMW60Gb etc.)
- 3 scene images generated via Nano Banana 2 (storyboard_Oc2EVoFMC_Py etc.)
- Visual style NOT carried through — each scene's NB2 output is NB2's independent interpretation of text descriptions of the references, not NB2 looking at the images

### Root cause

**File:line:** `lib/pipeline/adapters/image-model-configs.ts:139-159`

```ts
'nano-banana-2': {
  // ...
  // OLD: 'image-to-image' — appended /image-to-image to endpoint, but that path
  // returns 404 on fal.ai. Nano Banana 2 accepts reference images via image_urls
  // param on its standard endpoint, not a separate i2i sub-path.
  // Changed to text-only to stop the 404. TODO: add inline-reference capability
  // type that passes image_urls through the standard endpoint.
  referenceCapability: 'text-only',
  referenceConfig: {
    paramName: 'image_urls',
    maxRefs: 4,
    weightSupport: false,
  },
  // ...
}
```

The same pattern exists for `nano-banana` (line 127) and `nano-banana-pro` (line 165). All three NB models have `referenceCapability: 'text-only'` as a defensive workaround for a 404 on a sub-path — but they all SUPPORT `image_urls` via their standard endpoint.

**Historical timeline:**
1. Originally: `referenceCapability: 'image-to-image'` → storyboard-service appended `/image-to-image` to endpoint → 404
2. Workaround: flip to `'text-only'` → stops the 404 but loses image reference capability
3. TODO note added → never completed

### Impact

**Every user who:**
- Uploads / generates approved reference subjects
- Uses Nano Banana 2 (default image model in Editron)
- Expects scene images to MATCH the references visually

**Gets:** style-drifted scene images that describe the same subjects but don't visually match. Feels inconsistent, breaks brand continuity. Especially visible on character/location continuity — a brand's specific restaurant interior or product shot style doesn't carry.

**Does NOT affect:**
- Flux General (uses proper IP-adapter)
- Vidu Q2 (uses `reference_image_urls`)
- MiniMax (uses `image_url` for face ref)
- Flux Kontext (uses `image_url` for context)

These models DO use reference images. Only the NB family is blocked.

### Proposed fix

**Add new `referenceCapability` type:** `'inline-image-urls'`

Semantics: "pass `image_urls` array to the STANDARD endpoint (not a sub-path)."

Implementation steps:
1. Add `'inline-image-urls'` to the `referenceCapability` union type
2. Update `storyboard-service.ts` dispatch logic: when capability is `'inline-image-urls'`, include `image_urls: [...refs]` in the fal input without changing the endpoint URL
3. Flip all three NB models from `'text-only'` → `'inline-image-urls'`
4. Verify with a test call to fal.ai (Rule A1 — test before shipping)

Expected result: NB2 receives actual reference images (up to 14 per fal docs, currently capped at 4 in config), generates scene images that honor visual style.

**Alternative options considered:**

- (A) Switch default from NB2 to Flux Kontext or Vidu Q2 — those models already use image refs properly. **Rejected:** NB2 is the user-facing default per resources.md and has specific advantages (large ref count, character consistency).
- (B) Leave as-is, document limitation. **Rejected:** User-observable quality loss.
- (C) Proposed: add `'inline-image-urls'` capability. **Chosen.**

### Rule alignment

- **Rule 18N (Production Stability):** scene images failing to match refs is the opposite of "user trusts the output" — fix advances the vision
- **Rule A1 (Never ship model ID without testing):** Fix REQUIRES live test with actual fal.ai call before shipping — verify NB2 accepts `image_urls` on standard endpoint as resources.md claims
- **Rule A6 (One Source of Truth):** capability type lives in one place (image-model-configs.ts), used consistently by dispatch
- **Rule 11N (Bigger Picture):** Fix applies to all three NB variants (base, 2, Pro) — Rule A4 requires reaching all code paths

### Reference for future fixer

- File: `lib/pipeline/adapters/image-model-configs.ts:127, 139, 160`
- Dispatch code to update: `lib/pipeline/storyboard-service.ts` — search for `referenceCapability` branching
- Test script: adapt the debug-storyboard.mjs pattern to test NB2 with image_urls on standard endpoint
- Known working pattern: Flux Kontext uses `image_url` (single) via standard endpoint — NB2 should work similarly with `image_urls` (array)
- fal.ai docs for NB2: confirm payload shape before shipping

---

## [2026-04-18] — Minor: Nano Banana 2 fal.ai timeouts + Creative intent decisive moment fallbacks

**Category:** observability / quality-polish
**Severity:** P2 (non-fatal, self-recovering)
**Status:** MONITORED, no fix needed short-term

### Nano Banana 2 timeout retries

```
[falRetry] image gen (fal-ai/nano-banana-2): retry 1/3 in 1039ms 
  (last error: fal.ai call timed out after 60s)
```

Occurred 2x in proj_3ETiKQF69nRd. Retry succeeded both times. Root cause: fal.ai queue pressure on NB2, not a code bug. If this starts happening >20% of runs, consider:
- Bumping NB2 per-call timeout past 60s
- Routing overflow to Nano Banana Pro or Flux Schnell

### Creative intent decisive moment fallbacks

```
[Director] Intent translation warnings: 
  Scene 0/1/2: decisive moment "..." resolved via fallback (midpoint)
```

All 3 scenes fell back to scene-midpoint for their "decisive moment" frame. This means the LLM chose abstract/semantic moments ("the nostalgic reveal") that didn't map to concrete 5-Track data points (motion peaks, subject bounding-box events, voiceover word timestamps).

Root causes to verify (deferred investigation):
1. 5-Track analysis quality — are AI-generated videos producing crisp enough peaks to anchor against?
2. Creative intent prompt — is it encouraging abstract moments over grounded ones?
3. Intent translator waterfall — might it be failing at higher strata before reaching fallback?

Not urgent — midpoint fallback produces acceptable output. Revisit if user complains about zoom placements / transition timing feeling off.

---

## [2026-04-17] — Hardcoded 10s video duration cap in generate-videos route

**Category:** bug (incorrect constraint, blocks scripts wanting longer scenes)
**Severity:** P1 (silently caps every scene, violates Rule 8N)
**Status:** IDENTIFIED, fix deferred
**Triggered by:** Nike test showed all scenes capped to `videoDurationMs: 10000` despite script specifying 5-20s scene durations.

### Symptom

MongoDB evidence (Nike `sb_pq2iQh5xGLaQ`):
- `scenes[].durationSeconds = 15` (parser default)
- `scenes[].videoDurationMs = 10000` on ALL scenes regardless of scripted length

### Root cause

**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:311`
```ts
durationSeconds: Math.min(descriptor.durationSeconds, 10),
```

Hardcoded 10s maximum for continuous (non-montage) scenes. No user override, no profile awareness, no model-capability check. This limit predates the Seedance 1.5 (12s max) and Seedance 2.0 (15s max) models being wired — it was a defensive cap for older models that don't handle long generations well.

Matching caps for sub-shots at line 260-261 (range 3-10s) compound the issue.

### Impact

- ANY script with scene.durationSeconds > 10 gets silently capped to 10s
- Scripts describing 20-30s continuous scenes (brand films, documentary) lose half their duration
- User has no visibility: no warning, no error, just shorter video
- Combined with Contributor #3 (model grid quantization), compounds duration drift

### Proposed fix

Replace hardcoded cap with model-aware cap from adapter config:
```ts
import { getActualVideoDuration } from '@/lib/pipeline/adapters/video-model-configs';
const actualDur = getActualVideoDuration(modelKey, descriptor.durationSeconds);
```

This already exists in `video-model-configs.ts:358` and does per-model snap. Just need to wire it.

### Reference

- File: `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:311` (main), `:260-261` (sub-shots)
- Helper to use: `getActualVideoDuration()` in `lib/pipeline/adapters/video-model-configs.ts:358`
- Related deferred: Contributor #3 in earlier investigation entry (model grid quantization)

---
**Related:**
- Existing dead code: `alignCutsToBeats()` in `lib/pipeline/scene-to-editron.ts:311` — the snap-to-beats function exists but is never called from any pipeline path.
- Creative doc reference: `creative_production_knowledge.md` §11 (Song Structure for Video Ads — cuts on downbeats, transitions on phrase boundaries).
- `content_editing_knowledge.md` — "Beat-sync is a TOOL, not a default style. Not every beat needs a cut."

### Symptom (of doing nothing)

Montage and music-video content currently has cuts placed by creative intent (narrative-driven). Those cuts don't land on BGM beats because BGM generation is asynchronous and arrives AFTER cuts are placed. Result: professional-feeling "beat-synced" output is unattainable despite the dead function `alignCutsToBeats()` existing in the codebase.

For Nike-test-style montages, this means the visual cuts ignore the musical rhythm. Creative doc §11 explicitly says cuts should land on downbeats for montages.

### Root cause (current architecture)

**Ordering problem:**
```
Video gen (async QStash) → Finalize (dispatches BGM async via QStash line 730-762) →
Video worker dispatches Director → Director runs 13 steps (BGM may still be cooking) →
Step 4 merge: re-read project, pick up async BGM overlay (arrived during Director) → 
Render
```

**Key file:line evidence:**
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:730-762` — BGM dispatched via `dispatchAudio()` which uses QStash async mode
- `app/api/internal/workers/pipeline/video/route.ts:516` — Director dispatched AFTER all videos complete
- `lib/editron/agent/director-agent.ts:506-521` — Director's step 4 re-reads project from MongoDB to pick up async BGM that arrived during execution
- `lib/pipeline/scene-to-editron.ts:311-387` — `alignCutsToBeats(overlays, beats, fps)` — DEAD CODE, never invoked

**What's missing:**
- Beat detection service (given a BGM audio file, return beat timings as frames)
- A profile or script signal that says "this project should be beat-synced"
- A code path that BLOCKS on BGM completion BEFORE Director runs, for beat-sync scenes only

### Impact

**Affects:** Montage scenes, music-video content, hype reels, brand-anthem content — anywhere Rule §11 would say "cuts on downbeats."

**Does NOT affect:** Tutorials, testimonials, talking heads, corporate content — per creative_production_knowledge.md §5 "Beat-sync is WRONG for: tutorials, talking heads, testimonials, gentle product demos."

**Why this matters (per Rule 18N Production Standard):**
- Beat-sync is a professional quality multiplier — facebook study referenced in doc shows up to 40% higher completion rates with strong audio-visual sync.
- Without beat-sync, Editron montages feel amateur compared to post-produced content.
- Beat-sync is a bigger quality lever than almost any other pipeline improvement for music-forward content.

### Proposed design: Option C (profile-gated synchronous BGM)

**Core principle:** Beat-sync is a CONTENT-TYPE-SPECIFIC flow, not a universal one. Scenes that need beat-sync pay the cost (synchronous BGM, longer pipeline); scenes that don't keep current async flow (fast).

### Detection: when does beat-sync activate?

A project is "beat-sync-critical" if ANY of these are true:

1. **Profile signals beat-sync:** `editProfile.pacing === 'beat-synced'` (already a valid enum value in `EditProfile.pacing` type at `edit-profile-types.ts:60`)
2. **Profile has beat-sync action:** any action in `editProfile.actions` with `tool === 'sync_cuts_to_beats'` (existing in Director at `director-agent.ts:741`)
3. **Script signal:** script text contains explicit beat-sync keywords detected during parse: `"beat-synced"`, `"quick cuts"`, `"edit to the beat"`, `"cut on the drop"`, or a BPM mention (`/\d+\s*bpm/i`)
4. **Scene-level override:** individual scene's `editDirections.pacing === 'beat-synced'` (already in schema at `llm-scene-parser.ts:30`)

Parser will produce a project-level flag: `storyboard.beatSyncActive: boolean`. Finalize reads this flag to decide BGM dispatch mode.

### Revised pipeline flow (beat-sync branch)

```
Parser (sets storyboard.beatSyncActive=true if signals present)
  ↓
Storyboard images
  ↓
Video gen (async QStash as before)
  ↓
TTS
  ↓
Finalize
  ├── if storyboard.beatSyncActive === false:
  │     → BGM dispatched async (current flow)
  │     → Director runs async merge (current flow)
  │
  └── if storyboard.beatSyncActive === true:
        → BGM dispatched SYNCHRONOUSLY (finalize waits for completion, max 120s)
        → Detect beats via beat detection service (returns Beat[] { frame, isDownbeat })
        → Beats persisted on project state: project.bgmBeatGrid
        → Director dispatched with beats in context
        → Director step 5 (pacing) reads beats and places cuts on downbeats
        → Director step 6 (transitions) places transitions on phrase boundaries (every 4 or 8 bars)
        → Director step 3.6 (transition SFX placer) — unchanged
        → alignCutsToBeats() runs as final pass in step 5 (existing dead code now called)
        → Render
```

### New components needed

**1. Beat detection service** (`lib/editron/services/beat-detection-service.ts` — NEW)
- Takes BGM audio URL or buffer
- Returns `{ beats: Beat[], bpm: number, downbeats: number[], phraseMarkers: number[] }`
- Options:
  - Server-side FFT via Meyda or Essentia.js (noted in editron_master_remaining.md as "Essentia.js integration — feasible, not configured")
  - Server-side via external API (e.g., spotipy for Spotify tracks — not applicable since we generate music)
  - Gemini audio analysis with timestamps (works but slower + less accurate for beat detection specifically)
- **Recommended:** Essentia.js WASM — already noted as feasible + no external dependency.

**2. Synchronous BGM dispatch path** (`finalize/route.ts` — MODIFIED, ~30 lines)
- New branch in BGM dispatch logic: if beatSyncActive, use `await bgmService.generate()` directly (no QStash hop)
- Handle timeout at 120s (CassetteAI max generation time per observations) — fall back to async if timeout
- Save BGM + beats to project BEFORE dispatching Director

**3. Director beats context** (`director-agent.ts` — MODIFIED, ~20 lines)
- New optional field on Director context: `beats?: { frames: number[], downbeats: number[], bpm: number }`
- Step 5 (pacing) consults beats when placing cuts
- Step 6 (transitions) places transitions on phrase boundaries
- Step after 6 (or part of 6): call `alignCutsToBeats(overlays, beats, fps)` to snap final sub-shot boundaries

**4. Parser signal extraction** (`llm-scene-parser.ts` — MODIFIED, ~15 lines)
- Post-process: scan script text for beat-sync keywords + BPM mentions
- Scan parsed scenes for any `editDirections.pacing === 'beat-synced'`
- Scan selected profile for beat-sync actions
- Set `storyboard.beatSyncActive` boolean accordingly

### Interaction with existing systems

**Transition SFX placer (Fix 1.2):**
- Runs AFTER beats have snapped cuts (step 3.6 is AFTER step 6 transition placement)
- When alignCutsToBeats shifts cut frames, the transition overlay `from` frame also shifts (alignCutsToBeats handles this)
- Transition SFX placer reads the final transition positions → SFX lands at correct (now beat-aligned) frames
- No collision.

**Profile pacing multiplier (Contributor #2 above):**
- Beat-sync flow overrides profile pacing multiplier (beats drive duration, not pacing field)
- For non-beat-sync flow, Contributor #2 remains an open problem
- Beat-sync does NOT fix duration drift — it works within whatever timeline is assembled

**Duration drift (Contributor #1 / #3 above):**
- Beat-sync does NOT solve duration drift
- If scene duration is 21.6s (drifted from 30s script), BGM for beat-sync generates at 21.6s OR at 30s-music-overruns-video
- Beat-sync aligns cuts WITHIN the drifted timeline; it doesn't extend the timeline
- This limitation should be noted in the beat-sync PR description to prevent confusion

### Duration handling within beat-sync flow

When beatSyncActive=true, we control BGM duration. Decision: **match BGM duration to actual video timeline length**, not script-declared duration.

Rationale:
- Any other choice creates black-screen trailing or hard music truncation
- Actual video length is known at the moment of BGM dispatch (finalize has assembled it)
- This means BGM IS shorter than script intent, but it's CONSISTENT with what the user sees

**Implementation:** `bgm-service.ts:generateMusic()` already accepts `duration` param. Pass `currentFrame / fps` (actual timeline length) as the duration.

### Fallback strategy (Rule 16 graceful degradation)

If ANY step in the beat-sync flow fails:
- BGM generation timeout → fall back to async BGM + log degradation to pipelineWarnings
- Beat detection returns empty → skip `alignCutsToBeats`, cuts stay creative-intent-placed
- Beats detected but `alignCutsToBeats` snap threshold not met for any cut → no harm, cuts unchanged

All failure modes degrade to "current async BGM flow" — never block the pipeline.

### Estimated effort

- Beat detection service: 6-8 hours (Essentia.js integration + WASM deployment on Vercel is the unknown)
- Sync BGM dispatch: 2 hours
- Director beats context + wiring: 3 hours
- Parser signal extraction: 1 hour
- Tests + adversarial (beat-sync scene that fails BGM, beat-sync + duration drift interaction, non-beat-sync regression check): 4 hours
- **Total: ~16 hours / 2 days of focused work**

### Rule compliance check

- **Rule 18N (Production Standard):** ✅ Deterministic (given same video + music, same beats → same cuts). Scoped to scenes that want beat-sync, doesn't punish narrative content.
- **Rule 19N (Domain Expert Check):** ✅ This IS how a music-video editor works. Receives track, cuts to beats.
- **Rule 13 (No arch changes without permission):** ⚠️ Adds new service (beat-detection) + new pipeline branch. User approved Option C on 2026-04-17.
- **Rule 17N (Deliberate):** ✅ 3 alternatives considered (A block always, B re-run director, C profile-gated). C chosen for efficiency + scope.
- **Rule 0 (Universal Content Compatibility):** ✅ Beat-sync is content-type-specific (montages yes, tutorials no). Non-applicable content types unaffected.
- **Creative doc alignment:** ✅ Matches §11 (cuts on downbeats, transitions on phrase boundaries) + `content_editing_knowledge.md` beat-sync principles.

### Decision / Action

Design approved (2026-04-17). Not implemented yet. When implementing:
1. Start with beat detection service (unknown risk factor — Essentia.js WASM deployment)
2. Then synchronous BGM dispatch
3. Then Director context + step 5/6 wiring
4. Adversarial test: force `sync_cuts_to_beats` profile on a non-montage script, verify fallback
5. Adversarial test: BGM timeout → verify async fallback engages, no pipeline block

**Next session implementing:** re-read this entry before touching code. Duration drift is a SEPARATE problem — beat-sync does NOT solve it. Be honest about this in any user-facing communication.

---

## [2026-04-17] — Duration fix (CORRECTED): pre-calculated generation + slop-aware trim (user-selected model is sacred)

**Category:** design-decision + implementation-plan
**Severity:** P1 (solves Contributor #1 of duration drift — sub-shot under-fill gap)
**Status:** IMPLEMENTED 2026-04-17 (commits d5c79f8a + 87e7b6a4). Commits ship Contributor #1 fix; Contributors #2 and #3 remain separate deferred items.

**Implementation note (simpler than original design):** `videoStartTime` field on VideoOverlay already exists and already wires to Remotion's `startFrom`. No schema changes needed (the originally-planned Milimo trimIn/trimOut port was over-engineered — the existing mechanism is structurally equivalent). Delivered in 2 files, not 6. See commits for details.

**Actual commits:**
- `d5c79f8a` — Parser scale-up post-processor (sub-shot total ≥ 85% scene duration)
- `87e7b6a4` — Slop-aware selectBestSegment + detectSlop wiring in finalize
**Triggered by:** User correction (2026-04-17) of earlier flimsy scale-up proposal. User explicitly forbade model-switching and proposed pre-calculated duration + post-generation trim approach.
**Replaces:** Earlier "Fix #1 Simple" and "Fix #1 Enhanced (solver that drops sub-shots)" — both wrong. This is the correct approach.

### The algorithm

```
PRE-GENERATION:
1. ideal_per_shot_seconds = scene.durationSeconds / shot_count
   (or scene.durationSeconds directly if no sub-shots)
2. userModel = user's selection (NEVER CHANGE THIS)
3. generation_seconds = round_to_model_grid(ideal_per_shot_seconds, userModel)
   - Kling 5/10: picks whichever achievable value ≥ ideal
   - Veo 4/6/8: picks closest achievable ≥ ideal
   - Seedance 4-15 integer: picks ideal (usually exact match)

GENERATION (unchanged):
4. Generate N clips at generation_seconds using userModel

POST-GENERATION:
5. Run 5-Track analysis per clip (already happens)
6. Run asset-briefing slop detection per clip (already happens — see asset-briefing.ts)
7. For each clip:
   overshoot_frames = (generation_seconds - ideal_per_shot_seconds) × fps
   Set trim_in + trim_out so total trimmed = overshoot_frames
   Trim priority (highest to lowest):
     a) Slop-detected frame ranges (severity threshold > 0.5)
     b) Low-motion + no-subject-visible frames
     c) Off-peak frames (avoid motion peaks, decisive moments)
8. Timeline slot uses (generation - trim_in - trim_out) = ideal ✓
```

### Why this is the right approach

- **Model-sacred** (Rule 18N user-trust): user picks Kling for a reason; we don't override
- **No content loss:** all N sub-shots generated; no drops
- **Slop cleanup bonus:** worst frames are naturally cut during duration fit (2 problems → 1 solution)
- **Rule 18N production-grade:** deterministic (same scene + model + budget → same trim plan)
- **Rule 19N domain-expert:** real editors do exactly this — shoot 5s, keep the 3s that matter
- **Reuses existing infrastructure:** selectBestSegment (five-track-analysis.ts:1306) + asset-briefing.ts slop detection

### Architecture: port Milimo's trim pattern

**Source:** `mainza-ai/milimovideo/docs/02_data_models.md` — their Shot entity has `trim_in`, `trim_out`, `start_frame` fields.

**Port to our VideoOverlay schema:**
```typescript
// ADDED to components/editron/editor/version-7.0.0/types.ts
export type VideoOverlay = BaseOverlay & {
  type: OverlayType.VIDEO;
  src: string;
  // ... existing fields
  
  // NEW — Milimo trim pattern for frame-accurate duration control
  /** Frames trimmed from start of source asset (default 0 = no trim) */
  trimIn?: number;
  /** Frames trimmed from end of source asset (default 0 = no trim) */
  trimOut?: number;
  /** Total length of underlying source asset in frames.
   *  Invariant: durationInFrames = sourceDurationFrames - trimIn - trimOut */
  sourceDurationFrames?: number;
};
```

**Backward-compatible:** all fields optional. Existing overlays with trimIn=0, trimOut=0 render identically. No migration needed.

### Phased implementation (respects Rule 2 max-5-files)

**Phase D1 — Schema + Remotion render** (2 files, backward-compatible)
- Add trim fields to `types.ts` VideoOverlay
- Wire Remotion video renderer to use trimIn as playback offset + trimOut to cap duration
- Defaults (0, 0) = current behavior → zero regression risk
- Commit: "Add trimIn/trimOut to VideoOverlay schema + Remotion render support"

**Phase D2 — Duration-trim planner service** (2 files)
- NEW: `lib/editron/services/duration-trim-planner.ts` with `planTrimBudget(overlay, analysis, briefing, overshoot_frames) → { trimIn, trimOut }`
- Logic: compose slop frame ranges + motion scores + subject gaps into a trim-priority list; distribute overshoot across the worst frames
- Uses asset-briefing.ts slop detection results
- Commit: "Add duration-trim planner: slop-aware frame trim budget"

**Phase D3 — Wire into finalize** (2 files)
- Modify `finalize/route.ts` to call planner after 5-Track completes per clip
- Set trimIn/trimOut on the resulting overlay
- Update `scene-to-editron.ts` sub-shot duration calc to derive from `sourceDurationFrames - trimIn - trimOut`
- Commit: "Wire duration-trim planner into finalize pipeline"

**Each phase: TSC clean + code-review-graph update + commit before next phase (Rule A8).**

### Expected Nike outcome after all phases

Nike Scene 2 — 20s scripted, 5 sub-shots, user picked Seedance:
- ideal_per_shot = 4.0s, generation = 4s (Seedance supports 4s exactly)
- overshoot = 0 per clip → trim budget = 0
- scene delivers 20s ✓

Nike Scene 2 — 20s scripted, 5 sub-shots, user picked Kling (5/10 grid):
- ideal_per_shot = 4.0s, generation = 5s (Kling's minimum)
- overshoot = 30 frames per clip (1.0s × 30fps) → trim budget = 30f per clip
- Planner picks worst 30f from each clip (slop + low-motion) → trims them
- Each clip shows 4.0s of its best content → scene delivers 20s ✓
- Visible gain: each clip's worst 1s of AI slop never reaches render

### Rule compliance

- **Rule 13** (no arch changes without permission): user approved 2026-04-17
- **Rule 17N** (deliberate): 3 alternatives considered (scale-up-parser, solver-with-drops, this). User rejected first two. This chosen.
- **Rule 18N** (production standard): deterministic, model-preserving, rule-driven
- **Rule 19N** (domain expert): matches real editor workflow
- **Rule A5** (ensure downstream consumers ready): Phase D1 ships schema + render together so no dead fields
- **Rule A8** (no stacked fixes): each phase is one commit

### Known limitations (honest)

- Does NOT solve Contributor #2 (pacing multiplier compound) — still open
- Undershoot case (rare): model minimum > ideal. E.g., 2s target on Kling (min 5s) → would need to either generate 1 clip covering 2 sub-shots or accept overshoot. **Decision deferred:** current code floors at 3s in generate-videos, already prevents most undershoot. Document as edge case.
- Assumes slop detection is accurate. If asset-briefing misses actual slop, we trim arbitrary frames. Mitigation: fall back to low-motion+no-subject frames when slop detection confidence is low.

---

## [2026-04-17] — External repo research summary (deeper analysis per user direction)

**Category:** research-notes
**Status:** reference (not integration decisions — those require separate entries when acted on)
**Triggered by:** User pushed back on shallow repo analysis (2026-04-17), asked for deeper dive on Frame + Vision Agents specifically, plus clarification on video-db/Director + HKUDS/VideoAgent.

### [video-db/Director](https://github.com/video-db/Director) — CORRECTED classification

**Actual reality** (deep-fetched README):
- Chat-based **orchestration framework**, ~20 pre-built agents (search, clip, summarize, subtitle, translate, movie-from-script)
- Does NOT generate video itself — it's a "mixing bowl of GenAI APIs"
- Python backend + chat UI + video player component

**Why wrong fit for Editron:**
- Our Director = deterministic 13-step (industry-standard reliability per Rule 18N)
- Their Director = LLM-chain conversational exploration
- Different philosophy: ours optimizes predictability; theirs optimizes flexibility

**What to keep:** UI pattern for real-time agent streaming (`push_update()`) — useful when we build user-visible Director output. Park in resources folder.

### [HKUDS/VideoAgent](https://github.com/HKUDS/VideoAgent) — multi-modal framework

**Actual capabilities** (deep-fetched):
1. Understanding — Q&A, summarization on existing videos
2. Editing — beat-sync cuts, scene selection, assembly
3. Creative generation — remix, cross-lingual, meme-making

**Architecture:** LLM-chain agent graph (same philosophy diff as video-db/Director).

**What's valuable:** Uses **ImageBind** for cross-modal alignment (vision + audio + text in one embedding space). Our 5-Track uses Gemini Vision per-keyframe; ImageBind would let us query "does this SFX match this visual?" semantically. Future-consideration note: **ImageBind for SFX/visual validation** — keyword-based SFX matching currently has no content-check layer.

### [mainza-ai/milimovideo](https://github.com/mainza-ai/milimovideo) — CONCRETE PORT SOURCE

**Deep-fetched docs/02_data_models.md:**
- `Shot` entity combines: generation spec + timeline placement + trim metadata + job reference
- Fields: `trim_in` (frames from start), `trim_out` (frames from end), `start_frame` (absolute timeline position)
- Trim applied during timeline composition, not as separate asset reference
- 3-track timeline: V1 magnetic main, V2 overlay, A1 audio

**Adoption decision:** Port trim pattern to our VideoOverlay schema. See "Duration fix (CORRECTED)" entry above for concrete port. No licensing issue — pattern adoption, not code copy.

### [aregrid/frame](https://github.com/aregrid/frame) — UX reference

**Actual capabilities** (deep-fetched):
- Open-source NLE with timeline editing, transitions, effects
- Auto-clipping via scene detection, audio peaks, motion detection (we already have via 5-Track)
- AI color correction + brightness + style filters (we have filter presets, different approach)
- Built-in "Frame Video Agent" chat component — exact implementation opaque in README (marketing-heavy docs)
- Node.js

**What's valuable:** "Cursor-like UX" for video editing — real-time previews, smart suggestions, drag-and-drop. If/when we build a rich AI chat for Editron's editor, Frame's UX is a reference. Not an architecture adoption — their implementation isn't documented well enough to evaluate.

**Limitation flagged:** README is marketing-heavy. Capabilities vs actual implementation hard to verify without running it.

### [GetStream/vision-agents](https://github.com/GetStream/vision-agents) — architecture pattern worth studying

**Actual capabilities** (deep-fetched):
- Real-time WebRTC video streaming with <30ms latency (NOT Editron's use case — we do post-gen analysis)
- **Pluggable processor pipeline** — frames flow through arbitrary processors (e.g., YOLO pose → Gemini Live → TTS)
- Ships integrations: OpenAI, Gemini, xAI, Claude, Hugging Face; Ultralytics YOLO, Roboflow, Moondream, NVIDIA Cosmos; Deepgram, ElevenLabs, Cartesia; Twilio
- Tool calling via native function calling + MCP + custom tools

**What's valuable — the processor pipeline pattern:**
Our 5-Track is 5 fixed processors (Speech, Visual, Music, Motion, Subject). Vision Agents' pattern formalizes this as a CHAIN that's pluggable — new processors added without touching core analysis logic.

**Concrete future idea:** Refactor 5-Track into a processor chain where each track is a Processor class with `analyze(frames, context) → TrackData`. Then adding a new track (e.g., YOLO pose for action content, ImageBind for cross-modal validation) is just adding another Processor — no core changes.

**Not urgent.** Document as architectural direction for when 5-Track needs extensibility.

### ImageBind — future SFX validation

**From VideoAgent research.** Cross-modal embedding model. Could catch:
- SFX prompt says "paper rustle" but video shows ice cream → mismatch detected
- BGM description says "drum-heavy electronic" but model generated ambient pads → mismatch detected
- Visual shows sprint but audio shows walking footsteps → mismatch detected

**Our current gap:** keyword-based SFX matching has no content-verification layer. Slop detection catches visual artifacts but not audio-visual alignment.

**Integration effort:** ~1 week (model hosting + embedding pipeline + mismatch scorer). **Deferred until:** user reports SFX mismatches as a quality issue OR we ship beat-sync and need tighter audio-visual coupling.

### Summary table

| Repo | Action |
|---|---|
| video-db/Director | Resources folder (UI pattern reference) |
| HKUDS/VideoAgent | Resources folder + ImageBind future-consideration |
| mainza-ai/milimovideo | **Pattern adopted** (trim_in/trim_out) — see Duration fix entry |
| aregrid/frame | Resources folder (UX reference, opaque docs) |
| GetStream/vision-agents | Resources folder + processor-chain architectural direction |
| FireRed-OpenStoryline | Unknown; user noncommittal |

---

## [2026-04-23] — Unified Intelligence crash: undefined.length on LLM output

**Category:** bug
**Severity:** P0
**Status:** fixed (c069d129)
**Affected files:** `lib/editron/services/unified-edit-intelligence.ts:623-642`
**Impact:** ALL smart editing disabled (zooms, graphics, SFX triggers, creative intent). Fallback to reactive engine which produces only informational pacing/cut decisions (0 executed). User gets a flat, unedited video.
**Content types affected:** ALL (Rule 0 violation)
**Detected in:** proj_2E2ulOY-LSSs (Vercel log 2026-04-22)

**Symptom:** `[Director] Unified Intelligence failed (Cannot read properties of undefined (reading 'length')), falling back to Reactive Engine`

**Root cause:** Vercel AI SDK `generateObject()` returns undefined for nested arrays/objects when Gemini omits optional fields in structured output. Three unguarded access points:
- Line 623: `object.sceneIntents.map(...)` — crashes if `sceneIntents` undefined
- Line 631: `si.audioIntent.nativeAudio` — crashes if `audioIntent` undefined
- Line 635: `si.graphicIntents.map(...)` — crashes if `graphicIntents` undefined

**Why it wasn't caught:** The creative intent plan logged successfully at line 656 (12 scenes, 7 zooms), but the crash happened AFTER in the translation step. The try/catch at director-agent.ts:362 caught it and fell back silently to the reactive engine — no error visible to user.

**Fix:** Added null coalescing (`|| []`, `?.`, `?? default`) on all LLM output field accesses. Every field now has a safe default.

**Fix options considered:**
1. ✅ Guard the consumer (chosen) — can't control Gemini output shape
2. ❌ Fix Vercel AI SDK — upstream dependency, not our code
3. ❌ Switch to native Gemini SDK — larger refactor, deferred

---

## [2026-04-23] — Transition keyframes clobbered by saveProject overwrite

**Category:** bug
**Severity:** P0
**Status:** fixed (ce337a10)
**Affected files:** `lib/editron/agent/director-agent.ts:657-696`
**Impact:** ALL dissolve/dip-to-black transitions render as tiles on timeline but produce no visual effect on playback. Affects every project with transitions.

**Symptom:** User sees transition tiles on the timeline but no visual transition during playback.

**Root cause:** The `add_transition` tool (tools.ts:3831) writes opacity keyframe tracks directly to MongoDB via `projectService.updateOverlay()`. But Director Step 4 (line 690) calls `saveProject()` which writes the entire in-memory `overlays` array — which does NOT have the keyframes because they were written directly to MongoDB, not to the in-memory array. The save overwrites the DB, keyframes are lost.

**Fix:** Step 4 already re-reads the project from DB (line 662). Added a keyframe merge loop that copies keyframeTracks from the fresh DB read into the in-memory overlays before save.

---

## [2026-04-23] — Audio ducking skipped due to async BGM timing

**Category:** bug
**Severity:** P1
**Status:** fixed (ce337a10)
**Affected files:** `lib/editron/agent/director-agent.ts`
**Impact:** Audio ducking never applied when BGM arrives via async QStash worker (which is always). Music plays at full volume over voiceover.

**Root cause:** Profile actions run at Step 3. `checkCondition('hasBGM')` checks the in-memory overlays. BGM is dispatched via QStash at finalize and arrives ~12s later. Director starts Step 3 before BGM arrives → `hasBGM` = false → `audio_ducking` skipped.

**Fix:** Added Step 4.5 after the async merge: if BGM is now present, run audio ducking. Same `executeAction` path, just deferred timing.

---

## [2026-04-23] — Video quality score is not trustworthy

**Category:** design-gap
**Severity:** P1
**Status:** open — needs rework
**Affected files:** `app/api/internal/workers/pipeline/video/route.ts:316-346`
**Impact:** Quality gate at 40/100 allows poor-quality videos through (melted hands, face morphing, text hallucination). Score of 84/100 on proj_2E2ulOY-LSSs despite user reporting poor quality.

**Root cause:** Score measures 3 proxy metrics, none of which measure actual video quality:
1. Subject count (40%) — "did Gemini detect things" not "do they look good"
2. Energy variance (35%) — low variance = high score, penalizes dynamic content
3. Brightness variance (25%) — penalizes intentional lighting changes

**What it should check (per creative_production_knowledge.md §7):**
- Anatomical correctness (melted hands, extra fingers)
- Text hallucination (AI-generated text visible in video)
- Temporal consistency (flickering, morphing, jumping)
- Composition (rule of thirds, headroom)
- Motion naturalness (physics, floating objects)
- Prompt adherence (does output match input prompt)

**Fix options:**
1. Gemini Vision quality check — send 3-5 keyframes to Gemini with a quality rubric. Cost: 1 Gemini call per video (~$0.003). Most accurate.
2. Deterministic heuristic improvement — add face detection confidence, motion smoothness from 5-Track, prompt-vs-description cosine similarity. Zero extra cost but less accurate.
3. Hybrid — deterministic fast-check first, Gemini Vision only on borderline scores (50-70). Best cost/accuracy tradeoff.

---
