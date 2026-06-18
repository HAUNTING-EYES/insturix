# MG Session Port Handoff - 2026-06-18

Audience: Editron session operator, Codex, Claude, future MG-only agent
Repo root: `D:\google downloads\Front-End-main\editron-worktree`
Current branch observed: `infrastructure-improvs-+Editron`
Status observed: branch behind origin by 3 commits; worktree had unrelated dirty files.

This handoff ports the current Motion Graphics session into the broader Editron
session without losing the core lesson: the remaining MG problem is not solved by
presets, templates, menus, or better-looking text boxes. The correct path is
evidence facts -> licensed wires -> visual explanation contract -> stage mode ->
generated composition -> rendered proof -> calibration.

## Immediate Truth

The raw signal supply is rich enough to make good automatic MGs in principle.
The current failure is that the MG engine does not consume those signals with
enough bandwidth. The live path has a rich signal bus, but it narrows into a
small authority bottleneck, then often collapses into repeated layout/scene
grammar.

Current root shape:

```text
rich signal bus
  -> narrow MG expression authority
  -> weak stage/layout handoff
  -> repeated renderer grammar
  -> sparse/repetitive MGs that feel like templates
```

This is different from "the renderer cannot draw." The renderer can render stage
chrome, scene atoms, data-viz, signal curves, and atomic motion decisions. The
issue is which facts are licensed, which stage mode survives, which atoms are
selected, and whether the rendered result is judged as tastefully useful.

## Chat JSON State

Use this block as the compact session transfer object.

```json
{
  "handoff_date": "2026-06-18",
  "repo": "D:\\google downloads\\Front-End-main\\editron-worktree",
  "branch": "infrastructure-improvs-+Editron",
  "role": "Motion Graphics owner for Editron",
  "user_constraints": [
    "No presets, no menus, no templates as creative authority",
    "Compatibility renderer keys may exist only as downstream adapters",
    "Every MG must emerge from signals, atoms, facts, wires, gates, and deterministic scores",
    "Do not tune to one project, one creator, Hank, or the 0.02 example",
    "Verify by rendered pixels and motion snippets, not metadata only",
    "Do not claim Path E and Path D are merged without code proving one owner",
    "Commit and push intentional work when safe; never stage unrelated dirty files"
  ],
  "source_docs_read": [
    "D:\\google downloads\\Encoding-Law (1).md",
    "docs/agents/sessions/editron/Session-2026-06-14-MG-Separate-Branch-Handoff.md",
    "docs/agents/sessions/editron/MG-Encoding-Law-Phase-Ledger-2026-06-16.md",
    "docs/agents/sessions/editron/MG-Final-Build-Plan-2026-06-18.md",
    "docs/agents/sessions/editron/MG-Calibration-Readiness-Findings-2026-06-18.md",
    "docs/agents/reference/editron/Editron-Northstar-Final-Plan-2026-06-14.md"
  ],
  "latest_investigation_verdict": {
    "raw_signals_enough": true,
    "current_usage_enough": false,
    "main_issue": "signals reach MG overlays but are collapsed into narrow score patches and layout decisions",
    "not_the_solution": "more preset visuals or hardcoded screenshots",
    "actual_solution": "audit signal consumption, fix stage/layout authority, expand fact-gated atoms, then calibrate"
  },
  "runtime_coverage_scan": {
    "critical_runtime_files": 33,
    "critical_runtime_lines": 31705,
    "expanded_mg_signal_surface_files": 73,
    "expanded_mg_signal_surface_existing_files": 71,
    "expanded_mg_signal_surface_lines": 51388,
    "missing_paths": [
      "components/editron/editor/version-7.0.0/components/overlays/motion-graphic/types.ts",
      "lib/editron/data/atomic-overlay-aesthetic.ts"
    ],
    "honesty_note": "These files were read by deterministic line/hash scans and focused chunks were inspected. This is the MG signal-to-render surface, not the entire monorepo."
  },
  "projects_discussed": [
    {
      "id": "proj_sH-nZy0DtNOq",
      "symptom": "Saved project had one MG: 0.02 humans spoken to per day; visually weak and caption-colliding.",
      "phase_status": "Semantic rerun path later produced 11 licensed MG decisions and rendered stills, but visual language remained too sparse/repetitive."
    },
    {
      "id": "proj_2Mq5uesPpNOD",
      "symptom": "Real run still showed too few MGs and repeated sparse/top-right compositions.",
      "latest_read": "Signal payloads exist, but full-frame stage intent and richer semantic use are not surviving into final varied composition."
    },
    {
      "id": "proj_kP_BGiUHlkjS",
      "symptom": "Log investigation found a run could ship with poor quality review and too few fact-driven graphics.",
      "lesson": "Quality gates and decision authority still need teeth."
    }
  ],
  "next_recommended_work": [
    "Build a signal-consumption audit harness for real project MGs.",
    "Fix full-frame/caption layout contradiction in mg-expression-authority.",
    "Harden weak tiny-stat gates.",
    "Expand MG authority outputs beyond font size, scale contrast, and center avoidance.",
    "Build Stage Modes and richer fact-gated atom families.",
    "Make real-project rendered taste gates blocking before calibration or learning.",
    "Only then build calibration/holdout tuning."
  ]
}
```

## The Encoding Law

The Encoding Law is the constitutional source for this MG branch.

Core law:

```text
A graphic is shapes whose visual properties are driven by facts in the content.
We compose bindings, not pictures.
```

The atom is not "bar", "ring", "sparkline", "keyword box", or "quote card". The
atom is a wire:

```text
[visual property] <- [content fact]
```

Examples:

```text
length <- magnitude
sweep <- bounded proportion
slope <- ordered series
valence <- polarity
strike <- negation/refutation
pair <- directional transition
emphasis <- salience/hierarchy
```

Hard rule: a wire fires only when its licensing fact is present. A dishonest
encoding is never generated. Faithfulness is a hard gate, not a soft score.

Allowed:

```text
bounded-proportion -> licenses sweep, length, literal
comparison-relation -> licenses pair / position / connector
negation-or-refutation -> licenses strike
polarity -> licenses valence
```

Forbidden:

```text
percent -> ring
quote -> quote card
keyword -> keyword box
stat -> counter preset
```

Production loop must stay pure, deterministic, synchronous, and no-LLM. Expensive
judges and VLM scoring belong only in offline calibration.

## What Is Not A Preset

Not preset/menu/template:

- A bounded percent licensing `sweep`, then the renderer realizing that as an arc.
- A comparison fact licensing two anchors plus a connector.
- A negation fact licensing a strike/lightness treatment.
- A polarity fact tinting an already licensed visual property.
- A stage mode chosen from screen pressure, caption collision, negative space,
  visual salience, and communication gain.

Still visually template-like even if not menu-selected:

- The same dark slab behind every concept.
- The same empty rounded nodes for every claim.
- The same top-right title/body treatment regardless of meaning.
- The same stat shell for `0.02`, `90%`, and unrelated values.
- A "full-frame" metadata label that still renders like a corner card.

This distinction matters. The session established that "not menu-selected" is
not enough. The pixels can still feel templated if renderer chrome repeats.

## Current Live Path

Current high-level Editron/MG path:

```text
ingest/raw analysis
  -> SignalTimeline
  -> UnifiedMomentContext
  -> Path E Creative Brief decisions and Path D signal-driven decisions
  -> unified decision bundle / shared downstream plumbing
  -> executeEDL
  -> applyGraphic
  -> semantic ledger gate and selection
  -> MG expression authority
  -> planComposition
  -> atomic overlay plan and decision
  -> persisted motion-graphic overlay
  -> MotionGraphicLayerContent
  -> SafeCompositionRenderer
```

Important: Path E and Path D are still partial convergence, not a fully merged
single decision owner. Path E can still act as primary executable producer while
Path D contributes advisor/supplement/evidence roles. Do not claim "merged" until
the code proves one decision owner, one canonical timeline source, and one final
consumer.

Verified code facts from the latest investigation:

- Path E attaches per-moment `context.signals`, `atomicMomentBundle`, and
  `unifiedMomentEvidence` onto Creative Brief decisions after the brief EDL is
  generated.
- Path D attaches the same unified moment packet shape before its decisions enter
  the shared bundle.
- `UnifiedMomentContext` merges timeline global signals, base signals, source
  snapshot signals, and `momentBundleToSignalMap(...)`.
- `edl-executor.ts` builds `rawSignals`, scores MG property overlays, resolves
  semantic MG ledger gate/selection, resolves MG expression authority, plans the
  composition, builds atomic plan/decision, and persists recipe plus metadata.
- `motion-graphic-layer-content.tsx` uses the precomputed recipe directly and
  synthesizes scalar signal curves for render-time modulation.
- `composition-renderer.tsx` can render stage chrome, visual scene atoms,
  semantic scene atoms, atomic motion decisions, and signal-curve modulation.

## Latest Root Cause: Signals Exist, Usage Is Too Narrow

The latest investigation answered the user's direct question:

Are the signals given to MG enough to put out a good AutoAE-level MG?

Answer:

```text
Enough signal supply in principle: yes.
Enough semantic facts and signal consumption as currently wired: no.
```

Specific verified bottlenecks:

1. `mg-expression-authority.ts` is too narrow.
   It applies only three practical score patches into the MG system:
   `mg.typography.font_size`, `mg.emphasis.scale_contrast`, and
   `mg.layout.center_avoidance`. That cannot express stage mode, valence color,
   per-word emphasis, atom family, rhetorical hero selection, or real composition
   variety.

2. Full-frame intent can downgrade itself.
   `preferFullFrame` sets `captionZoneAware`. Then `captionZoneAware` becomes
   `captionCoordinated`. The layout code treats caption coordination as a reason
   to move the recipe to a caption-safe corner, often `top-right`. Result:
   metadata says full-frame, but the visible MG behaves like a corner card.

3. The render layer can do more than the authority sends it.
   `composition-renderer.tsx` has full-frame content layout logic and stage
   chrome. When correct visual intent/layout reaches it, it can render more than
   a small card. The failure is upstream of final rendering.

4. Semantic extraction is built but conservative.
   Numeric, comparison, quote, concept, refutation, identity, and list facts
   exist, but language facts remain thin for "most/few", "not X but Y", polarity,
   rhetoric, satire, claim strength, transition vs refutation, and per-word
   salience.

5. Real-project taste checks are still not production authority.
   The gate can identify weak tiny stats, repeated forms, and too-few MGs, but
   it is not yet a hard live blocker everywhere.

6. Atomic plan/decision are threaded, but still not fully trusted.
   The EDL persists `atomicOverlayPlan`, `atomicOverlayDecision`, and
   `atomicPlanObserveMode: true`. That means the capability exists and is partly
   rendered, but the branch must still prove it is authoritative enough in live
   visuals.

## Why The Screenshots Looked Like Templates

User screenshots showed:

- `0.02 humans spoken to per day`: mostly a centered number plus rule/label.
- Concept MGs like `Nobody Likes`, `Normal Deep Evil`, `Algorithm Problem`,
  `Culture Tells Good`: repeated dark slab, repeated top title/body, repeated
  geometry, repeated empty node/map shell, clipped or awkward text.
- Later concept rerenders improved by removing empty nodes, but still did not
  meet the final full-frame visual standard.

Truth:

- The selector was increasingly fact-driven, not a production preset menu.
- But the rendered grammar was visually repetitive.
- Therefore the user's "this still feels like a template" critique was correct.

Operational language going forward:

```text
"Not preset-selected" only means selection authority is not a menu.
"Not visually templated" requires rendered diversity and taste proof.
```

## Phase Ledger

This ledger reconciles the Encoding Law ledger, the 06-18 final plan, the
calibration-readiness doc, the Northstar plan, and the latest signal-use
investigation.

| Phase | Name | Status | Truth |
|---|---|---|---|
| 0 | Baseline artifact pack | Partial | Tests/scaffolds exist. Real rendered project packs and failure reports are still not a hard production gate. |
| 1 | Visual Explanation Contract | Present, not final | Contract exists and is tested. Needs more live render validation and richer evidence use. |
| 2 | Contract into MG authority | Present, incomplete | Authority exists but consumes too little and narrows output to a few score patches. |
| 2A | Signal candidate normalizer | Missing / required | Needed across Editron so family atoms, job role, evidence strength, completeness, risk, and timing anchor are normalized before execution. |
| 3 | Stage-aware layout | Partial | Stage chrome exists; full-frame/split/device are not reliably surviving to visible composition. Caption-aware logic can downgrade full-frame to corner. |
| 4 | Scene atom library | Partial | Numeric/data-viz/concept atoms exist, but families are sparse and repeated. |
| 5 | Generative assembler | Partial | Numeric and data-series slices converted to generate -> gate -> score -> pick. Broader composer fallback remains. |
| 6 | Multi-overlay choreography | Partially wired | Signal curves and atomic decisions are threaded, but real multi-overlay proof with captions/zoom/transitions/SFX is not complete. |
| 7 | Rendered aesthetic gate | Partial | Six-case calibration cohort passed; real-project gate exists; not yet full production blocker. |
| 8 | Calibration | Not done | Calibration merged into Phase 14. Do not tune now. |
| 9 | Semantic fact extractor + ledger | 9A-9E done, still conservative | Candidate ledger, gate, selection, authority metadata, and deterministic fact injection exist. Language/rhetoric extraction remains the bottleneck. |
| 10 | Real-project taste gate | 10A-10E done for probes, not final quality | Probes and semantic replay improved count and auditability. Visual language still failed user taste review. |
| 11 | Kill fallback authority | In progress | `composition-templates.ts` was deleted in the dirty tree. More fallback authority remains: graphicType as source, legacy HTML-scene branch, particle presets, renderer keys used as selectors. |
| 12 | Atom expansion after facts | Started | Quote/proof/refutation and concept relation work began. Number hero, process, comparison, device/search, social proof, timeline, speaker evidence still missing. |
| 13 | Choreography proof + timeline memory | Planned | Needs real clips showing MG+caption+zoom+transition+SFX coordination and repetition memory. |
| 14 | Calibration + holdout | Planned | Blocked until structural form and rendered gates are stable and a human-labeled corpus exists. |

## What Was Done During This MG Session

The following work appears in the current docs/session history and may already be
committed remotely even if the current local worktree is behind. Verify with
`git log`/`git fetch` before relying on local state.

1. Encoding Law section 22 numeric slice:
   - Added declarative wire table in `encoding-wires.ts`.
   - Numeric facts enumerate licensed candidates instead of one classifier result.
   - `90%` -> literal/sweep/length candidates, sweep can win.
   - `100M` -> no dishonest ring candidate.
   - `1/3` -> literal/sweep/length candidates, exact fraction can remain literal.
   - Variety penalty for consecutive identical bounded stats.

2. Data-series classifier conversion:
   - Comparable values license `length + position + label`.
   - Bounded part-of-whole licenses `sweep`.
   - Ordered series licenses `slope`.
   - Renderer keys remain compatibility realization names only.

3. Rendered calibration cohort:
   - Six probes: sparse rate, bounded percent, big magnitude, fraction,
     keyword/concept, speaker intro.
   - These are calibration fixtures, not production presets.
   - The naming is dangerous; keep metadata from ever becoming production
     selection authority.

4. Semantic candidate ledger:
   - Added deterministic candidate ledger with candidates and suppressed
     candidates.
   - Fact kinds include weak stat, bounded stat, magnitude stat, series,
     comparison, quote, identity, concept, refutation, and list.
   - Hard gates block missing source/evidence and weak low-salience stats.

5. Live EDL metadata wiring:
   - EDL persists semantic candidate ledger, semantic candidate selection,
     visual explanation contract, atomic plan/decision, content structure, and
     semantic atoms on MG metadata.

6. Semantic hard gate:
   - Licensed candidates continue.
   - Ledgers where all candidates are suppressed can block the MG before render.
   - No-candidate plain content can still pass to conservative existing authority.

7. Fact extractor:
   - Deterministic transcript/on-screen extractor emits licensed facts from
     transcript evidence.
   - Empty LLM graphic intents can still produce comparison/bounded-stat MG
     decisions from transcript facts.
   - Weak `0.02 ... per day` tiny-rate facts should not be promoted unless
     licensed by better evidence.

8. Real-project audit/replay tools:
   - Real-project MG taste gate and audit script.
   - Semantic MG rerun probe for saved projects.
   - MG-only composition replay to avoid slow full `executeEDL`.

9. Concept renderer work:
   - Relation-aware semantic concept scene atoms.
   - Removed repeated empty node/map shell after user visual review.
   - Added semantic concept text layout override to reduce top-right clipping.

10. Documentation/strategy:
   - Final build plan and calibration-readiness findings were written.
   - Major conclusion: structural first, calibration last.

## Known Verification From This Session

Commands reported as passed in the session docs/history include:

```powershell
npx vitest run tests\editron\mg-composition-planner.test.ts
npx vitest run tests\editron\mg-spine-usability.test.ts tests\editron\mg-atomic-overlay-decision.test.ts tests\editron\mg-composition-planner.test.ts
npx vitest run tests\editron\mg-atomic-overlay-plan.test.ts tests\editron\mg-atomic-overlay-decision.test.ts tests\editron\mg-layer-content-sanitize.test.ts tests\editron\mg-primitive-renderers.test.ts tests\editron\mg-spine-usability.test.ts tests\editron\mg-visual-explanation-contract.test.ts
npx vitest run tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-content-atoms.test.ts tests\editron\mg-visual-explanation-contract.test.ts tests\editron\mg-expression-authority.test.ts
npx vitest run tests\editron\intent-translator-mg-no-preset.test.ts
npx vitest run tests\editron\real-project-mg-taste-gate.test.ts tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-expression-authority.test.ts
npx vitest run tests\editron\mg-stage-composition-renderer.test.ts tests\editron\mg-atomic-render-decision.test.ts
npx eslint . --quiet
```

Important caveat:

```text
Full `npx tsc --noEmit --pretty false` remained baseline-red in unrelated
admin/ThinkForge/shared/script files in prior runs. Touched-file filters passed
for MG changes. Do not claim full repo typecheck green unless re-run and proven.
```

Rendered proof reported:

- Six-case rendered calibration cohort passed after renderer-safe-lane fixes.
- `proj_sH-nZy0DtNOq` saved state failed with one weak MG.
- Semantic replay for `proj_sH-nZy0DtNOq` produced 11 MG decisions and rendered
  11 stills without browser/fit warnings.
- User still rejected the visual language as repetitive/template-like.
- Latest investigation on real outputs still found sparse/repeated MGs.

## Calibration Readiness

Do not calibrate yet.

The calibration-readiness investigation found:

- MG failure is not all calibration. It is structural-leaning.
- The system is not calibration-ready.
- There is no human ground truth corpus.
- The tuner/bandit path is wrong for MG pixels.
- Some gates auto-pass or are observe-only.
- The render harness exists but is not yet a full production blocker.
- Around 108 calibratable values were identified; many are scattered outside the
  central registry.

Correct order:

```text
structural signal/fact/stage/atom fixes
  -> rendered real-project gates
  -> human-labeled corpus and holdout split
  -> offline calibration
```

Never tune to one creator, one video, one screenshot, or one project id.

## Remaining Core Problems

### P1 - Fact extractor and semantic language are still thin

Numeric and some concept facts work, but plain talking-head speech often only
lights literal/text or weak concept facts. Missing or thin:

- fuzzy bounds: most, few, rarely, majority
- transition vs refutation: `X -> Y` vs `not X but Y`
- polarity: good/bad, gain/loss, up/down
- claim strength
- rhetoric/satire
- per-word salience
- speaker identity evidence
- proof/quote source quality

### P2 - Stage modes are not production-grade

Stage mode should be:

- `overlay-on-footage`
- `full-frame-graphic-scene`
- `interstitial-graphic-scene`
- `split-footage-graphic`
- `device-or-screen-scene`
- `mg-led-transition`

Current issue: even when `full-frame-graphic-scene` is selected, caption-aware
layout may force corner/safe-side treatment. Full-frame should coordinate with
captions or stage choreography, not silently become a small card.

### P3 - Atom families are sparse

Need fact-gated families:

- number hero and tiny-rate contextualization
- semantic-valence color
- per-word emphasis
- comparison / before-after / vs / tradeoff
- process / sequence / cause-effect
- quote / proof / refutation
- speaker intro with evidence
- search / device / browser / app scene
- social proof
- timeline / roadmap / chronology
- media/object cutout where evidence exists

### P4 - Authority consumes too little

`mg-expression-authority` must write more than font size, scale contrast, and
center avoidance. It should influence:

- stage mode and layout survival
- atom family candidates
- valence color roles
- per-word emphasis directives
- rhetorical hero selection
- flatness veto
- density/duration/read-time
- caption choreography
- motion band and beat landing

### P5 - Real-project gate is not final production proof

Current gates can catch count/repetition/weak-stat issues, but real upload-to-edit
still needs:

- artifact packs
- rendered stills
- short clips
- caption/MG/zoom/transition/SFX timing windows
- failure taxonomy
- blocking behavior for critical visual failures

### P6 - Path E/D authority is still not unified

Signals are fed, but they do not own executable decisions end to end.

Current behavior:

```text
Creative Brief can choose executable decisions
Path E attaches per-moment signals after that choice
Path D emits many signal decisions
Unified bundle accepts Path E as primary in some modes
Signal decisions must pass confidence + family atom license
Most weak signal decisions become evidence-only
executeEDL can use signals for form only after a decision survives
```

Needed:

- signal candidate normalizer
- one planner over the canonical edited timeline
- Creative Brief as semantic/narrative fact source, not renderer-label authority
- family planners that produce overlay jobs from atoms

## Northstar MG Look

The intended MG output is not "better text boxes."

It should feel like a full motion composition when evidence deserves it:

- full-frame or split-stage moments when footage is busy or the idea needs its
  own visual explanation
- clear focal hierarchy, not a small top-right label by default
- visual metaphor shapes driven by facts: magnitude, boundedness, comparison,
  polarity, negation, sequence, causality
- kinetic emphasis that lands on the actual rhetorical hero
- less dead space, but also no clutter
- data/stat graphics that make the right quantity feel important
- language graphics that emphasize one meaningful word or relation, not the
  whole sentence as a box
- speaker intros that use identity evidence rather than generic name cards
- quote/proof/refutation scenes that show claim and evidence distinctly
- comparison/process scenes that show direction, contrast, or steps
- device/search/social-proof scenes only when evidence exists
- captions, zooms, transitions, and SFX coordinated with the MG beat

Visual references in plain words:

```text
Hormozi-style rhetorical punch: yes, but deterministic and fact-driven.
AutoAE richness: yes, but without template menus.
Enterprise/agency polish: clean, legible, brand-fit, not chaotic creator spam.
Random animated cards: no.
Highlighted caption words masquerading as MG: no.
```

## Next Plan

### Phase A - Signal Consumption Audit Harness

Goal: prove which signals enter each MG and which signals are actually consumed.

For each MG candidate and selected MG, dump:

- incoming `contentSignals`
- `atomicMomentBundle`
- semantic atoms
- content structure
- visual explanation contract inputs/outputs
- semantic candidate ledger and selection
- MG expression authority reasons
- planner decisions
- atomic plan/decision
- renderer stage/scene atoms
- ignored high-value signals

Definition of done:

- One real project report says exactly where signal richness is lost.
- No code is judged from screenshots alone.

### Phase B - Fix Full-Frame / Caption Layout Contradiction

Goal: full-frame stage intent must not downgrade into top-right just because
captions exist.

Rules:

- Caption-aware means coordinate, not corner-fallback.
- Full-frame with captions should choose a stage layout, caption timing/zone
  coordination, or safe full-frame composition.
- Only use side-safe/corner if the contract explicitly chooses overlay mode.

Definition of done:

- A full-frame visual explanation renders full-frame in stills/clips.
- Tests prove `preferFullFrame + captionZoneAware` does not automatically become
  `top-right`.

### Phase C - Hard Gate Weak Tiny Stats

Goal: prevent another `0.02` becoming the only standalone MG unless genuinely
licensed.

Acceptable licenses:

- bounded proportion
- comparison relation
- salience/proof
- truth/rhetoric/satire evidence
- strong source evidence

Definition of done:

- Weak tiny scalar/rate facts are suppressed or contextualized.
- Strong bounded or comparative small values still render.

### Phase D - Expand Authority Output Surface

Goal: use signals and semantic facts to drive more than typography and center
avoidance.

Add authority outputs for:

- stage mode
- atom family hints
- valence
- per-word emphasis
- rhetorical hero
- flatness veto
- motion band/choreography
- density/dwell/read-time

Definition of done:

- The same superficial "concept" shape can choose different scene grammar from
  different facts.
- The same fact can render differently under different screen/caption/moment
  contexts without becoming a preset menu.

### Phase E - Rich Fact-Gated Atom Families

Build only after facts exist. Do not add "search scene preset" or "quote card
preset".

Recommended order:

1. number hero + valence color
2. per-word emphasis
3. comparison / before-after
4. process / sequence / cause-effect
5. quote / proof / refutation
6. speaker intro with evidence
7. device/search/social proof only when product/creator market evidence demands
8. timeline/roadmap

Definition of done:

- Every family emits explanation ledger.
- Every family has rendered still/clip proof.
- Renderer keys are adapters only.

### Phase F - Real-Project Production Gate

Goal: bad rendered MGs cannot silently pass as production quality.

Gate should fail:

- too few MGs for strong evidence
- too many MGs for weak evidence
- repeated form/chrome
- weak tiny stat selected
- top-right card when full-frame was required
- caption collision
- title-safe clipping
- unreadable contrast
- blank/fit failure
- no semantic candidate selection metadata
- no rendered artifact

### Phase G - Choreography And Timeline Memory

Goal: MG does not compete with captions/zoom/transitions/SFX.

Need memory of:

- recent MG forms
- recent stage modes
- recent zoom intensity
- active caption zone
- recent transition style
- SFX density
- overlay count

Definition of done:

- Rendered clips prove coordinated timing, not just stills.

### Phase H - Calibration And Holdout

Only after structural phases pass.

Need:

- 50-100+ human-labeled rendered MG examples
- calibration/holdout split
- render-in-loop eval
- writable MG curve store
- fail-loud VLM gate if used offline
- continuous reward or offline optimizer such as CMA-ES
- no bandit writes from bad rendered runs

## File Map

Core live path:

- `lib/editron/agent/director-agent.ts`
- `lib/editron/services/creative-brief.ts`
- `lib/editron/services/unified-moment-context.ts`
- `lib/editron/services/moment-bundle.ts`
- `lib/editron/services/signal-registry.ts`
- `lib/editron/services/signal-executor.ts`
- `lib/editron/services/edl-executor.ts`
- `components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx`

MG authority/facts:

- `lib/editron/services/mg-expression-authority.ts`
- `lib/editron/services/mg-semantic-fact-extractor.ts`
- `lib/editron/services/mg-semantic-facts.ts`
- `lib/editron/services/mg-content-atoms.ts`

MG engine:

- `lib/editron/motion-graphics/engine/visual-explanation-contract.ts`
- `lib/editron/motion-graphics/engine/content-shape-analyzer.ts`
- `lib/editron/motion-graphics/engine/semantic-mg-candidates.ts`
- `lib/editron/motion-graphics/engine/encoding-wires.ts`
- `lib/editron/motion-graphics/engine/composition-planner.ts`
- `lib/editron/motion-graphics/engine/composition-renderer.tsx`
- `lib/editron/motion-graphics/engine/primitive-renderers.ts`
- `lib/editron/motion-graphics/engine/atomic-overlay-plan.ts`
- `lib/editron/motion-graphics/engine/atomic-overlay-decision.ts`
- `lib/editron/motion-graphics/engine/data-viz-renderers.tsx`
- `lib/editron/motion-graphics/engine/eval/*`

Scoring/overlay data:

- `lib/editron/engine/overlay-definitions.json`
- `lib/editron/engine/utility-scorer.ts`
- `lib/editron/engine/atomic-overlay-core.ts`
- `lib/editron/data/decision-registry.ts`
- `lib/editron/data/threshold-registry.ts`

Scripts/tests:

- `scripts/audit-real-project-mg.ts`
- `scripts/probe-semantic-mg-rerun.ts`
- `scripts/render-mg-stills.ts`
- `scripts/render-mg-motion.ts`
- `scripts/render-editron-aesthetic.ts`
- `scripts/build-mg-rendered-calibration-input.ts`
- `tests/editron/mg-*.test.ts`
- `tests/editron/real-project-mg-taste-gate.test.ts`
- `tests/editron/rendered-aesthetic*.test.ts`

## Guardrails For The Next Agent

Do:

- Read the docs listed in the JSON block before editing.
- Re-read every file before editing because this thread is long and context can
  decay.
- Keep phases to five files or fewer unless the user explicitly approves a
  larger phase.
- Stage exact files only.
- Run focused MG tests and `eslint`.
- Run full `tsc` or honestly report baseline-red unrelated files.
- Render stills/clips for visual claims.
- Keep all selection fact/wire/contract-driven.

Do not:

- Add a new "better looking preset".
- Make `graphicType` the creative brain.
- Use LLM calls in production MG selection.
- Add Penrose/dagre yet.
- Rebuild the existing motion/emphasis engine.
- Calibrate before structure and rendered gates are stable.
- Claim Path E/D are merged without proving one owner.
- Claim a render is good without inspecting pixels.

## Suggested First Command Set In The New Editron Session

```powershell
git -C "D:\google downloads\Front-End-main\editron-worktree" status -sb
git -C "D:\google downloads\Front-End-main\editron-worktree" branch --show-current
git -C "D:\google downloads\Front-End-main\editron-worktree" fetch origin
git -C "D:\google downloads\Front-End-main\editron-worktree" log --oneline -8
```

Then read:

```powershell
Get-Content -Raw "docs\agents\sessions\editron\MG-Final-Build-Plan-2026-06-18.md"
Get-Content -Raw "docs\agents\sessions\editron\MG-Calibration-Readiness-Findings-2026-06-18.md"
Get-Content -Raw "docs\agents\sessions\editron\MG-Encoding-Law-Phase-Ledger-2026-06-16.md"
Get-Content -Raw "D:\google downloads\Encoding-Law (1).md"
```

## Bottom Line

The next work is not "make the box prettier." The next work is:

```text
prove signal loss
  -> fix stage/layout survival
  -> hard-gate weak facts
  -> widen authority from scalar dials to composition decisions
  -> add fact-gated atom families
  -> judge real rendered projects
  -> calibrate only after structure is stable
```

This is how Editron gets from repeated cards to real automatic motion graphics
without drifting back into templates.
