# MG Encoding Law Phase Ledger - 2026-06-16

Repo state observed after the section 22 slice:
- Worktree: `D:\google downloads\Front-End-main\editron-worktree`
- Branch: `infrastructure-improvs-+Editron`
- Status caveat: this tree has unrelated dirty files; this ledger tracks only the MG encoding-law architecture slice.

## Current Phase Status

Phase 0 - Baseline artifact pack:
- Status: test baseline green, render proof still partial.
- Evidence: `tests/editron/phase0-*.test.ts` exists and passed in the current branch state on 2026-06-16.
- Still needed: current project dumps, rendered stills/clips, and a failure report for the exact branch state.

Phase 1 - Visual explanation contract:
- Status: present, not final.
- Evidence: `lib/editron/motion-graphics/engine/visual-explanation-contract.ts` exists and is tested by `tests/editron/mg-visual-explanation-contract.test.ts`.
- Still needed: validate it against live rendered MG examples and keep it upstream of future semantic extraction.

Phase 2 - Wire contract into MG authority:
- Status: present, not complete.
- Evidence: `lib/editron/services/mg-expression-authority.ts` exists and EDL calls it before planning.
- Still needed: make the authority consume richer semantic facts from the next extractor slice.

Phase 3 - Stage-aware recipe layout:
- Status: partial.
- Evidence: `composition-renderer.tsx` has visual-intent stage chrome and tests exist, but numeric encoding selection only changed `composeNumeric`.
- Still needed: broaden stage-aware layouts beyond this numeric slice and render-check them.

Phase 4 - Scene atom library expansion:
- Status: partial.
- Evidence: atomic overlay plan/decision files exist; data-viz renderers exist; `composeNumeric` now emits fact-channel data-viz roles for licensed numeric encodings.
- Still needed: expand atom coverage after semantic fact extraction, not by adding presets.

Phase 5 - Generative assembler:
- Status: numeric and data-series slices complete; broader assembler partial.
- Evidence: numeric encoding now does generate -> hard gate -> score -> pick, and candidate ranking accepts deterministic `eval/legibility.ts`, `eval/aesthetic.ts`, and composite layer scores before choosing. Data-series now enumerates licensed visual-form candidates from facts (`length`, `sweep`, `slope`, `position`, `label`) before selecting the existing renderer key.
- Still needed: convert remaining non-series composer/template fallback authority and validate with rendered taste gates.

Phase 6 - Multi-overlay choreography:
- Status: partially live.
- Evidence: `edl-executor.ts` builds `atomicOverlayPlan`, calls `decideAtomicOverlay`, stores both on MG overlay metadata, and `motion-graphic-layer-content.tsx` passes `signalCurves`, `atomicPlan`, and `atomicDecision` into `SafeCompositionRenderer`.
- Still needed: rendered artifacts proving the live visual result is good across real projects.

Phase 7 - Rendered aesthetic gate:
- Status: partial, now has a first MG-specific taste regression.
- Evidence: `lib/editron/motion-graphics/engine/eval/rendered-aesthetic.ts` includes a `motion-graphic` dimension that fails sparse-rate MG evidence when it carries generic shell/card atoms (`sm-backdrop`, `semantic-stat-field`, `semantic-stat-axis`) or reserves a large frame area while painting mostly empty/text-only pixels. `tests/editron/rendered-aesthetic.test.ts` covers both the failing old sparse-rate shell and the passing licensed `numeric-sparse-rate-trace` case.
- Still needed: run this gate on actual rendered project frames across sparse rate, bounded percent, big magnitude, fraction, and keyword/concept MGs; then calibrate thresholds against reference renders.

Known live-render blocker - repeated stat shell:
- Symptom observed on a new video: scalar stat MG for `0.02` / `human beings per day` still looks like the same stat shell used elsewhere: centered value, large translucent conic field, horizontal axis bar, and top phrase strip.
- Root cause: `composeNumeric` and data-series selection now avoid the old classifier/menu path, but `composition-renderer.tsx::resolveSemanticContentSceneAtoms` still emits `semantic-stat-magnitude-field`, `semantic-stat-magnitude-field-core`, and `semantic-stat-magnitude-axis` for any numeric content or `counter` role. That renderer scene layer behaves template-like even when the upstream encoding selection is fact/wire based.
- Encoding-law status: this is not a menu/preset in the new selector, but it is still an unlicensed renderer shell and must be treated as a Phase 7 blocker before claiming MG quality.
- Code fix status: `composition-renderer.tsx::resolveSemanticContentSceneAtoms` now gates semantic stat scene atoms through licensed evidence. `semantic-stat-field` needs bounded-proportion / `sweep` evidence; `semantic-stat-axis` needs `sweep` or `length` evidence. Bare scalar/rate content such as `0.02 human beings per day` returns no repeated stat shell.
- Regression coverage: `tests/editron/mg-stage-composition-renderer.test.ts` proves licensed `90%` content still gets stat atoms and unbounded scalar-rate content gets none. `tests/editron/mg-spine-usability.test.ts` also locks the sparse scalar-rate recipe against both one-point data-viz shells and `sm-backdrop`.
- Rendered proof: `.calibration-temp/mg-stills/mg-stat-rate-current/mg00-unknown-0-02.png` was regenerated from the current planner after the fix. It renders `0.02 human beings per day` as `counter + sm-underline + numeric-sparse-rate-trace + numeric-rate-rule + label`, with no conic stat field, no horizontal magnitude axis, no backdrop card, no render errors, and no fit warnings.
- Rendered taste gate: `tests/editron/rendered-aesthetic.test.ts` now fails sparse-rate evidence if it still carries generic shell/card atoms, and passes the licensed trace evidence. This is a deterministic gate over rendered evidence, not a new preset selector.
- Honest visual status: this fixes the repeated shell/card bug class, but the result is still a sparse typographic rate composition, not the final rich full-frame MG standard. The remaining quality work belongs in Phase 7 / calibration: richer licensed atoms for tiny rates and real footage taste gates, not more presets or menu types.

Phase 8 - Calibration:
- Status: not complete.
- Evidence: numeric scores are deterministic local priors for this slice.
- Still needed: offline weight tuning against reference renders.

## Claude Encoding-Law Claim Check

Confirmed problems that still mattered:
- `composeNumeric` had a single `resolveNumericVisualMode` classifier and one fixed text-counter path.
- Data-viz rendering capability existed, but numeric form selection did not enumerate licensed encodings.
- Data-series had a one-form classifier in the first slice; it is now converted to licensed candidate enumeration, but still realizes through existing `data-viz` renderer keys.

Implemented solution shape:
- Added `lib/editron/motion-graphics/engine/encoding-wires.ts`.
- Numeric wires are fact-keyed: `bounded-proportion`, `comparable-magnitude`, `negation-or-refutation`, `salience-or-hierarchy`.
- `composeNumeric` now asks for the licensed candidate set, scores shadow candidate recipes through existing deterministic legibility/aesthetic/composite eval layers, and realizes the selected candidate through existing text/data-viz primitives.
- New numeric data-viz roles are fact-channel roles such as `numeric-sweep`; renderer maps `encodingChannel` to existing realizers.

## Data-Series Classifier Conversion Proof Points

Candidate set checks now covered in `tests/editron/mg-spine-usability.test.ts`:
- Four comparable values license `bar-chart` through `length + position + label`.
- One bounded part-of-whole value licenses `percentage-ring` through `sweep`.
- Five ordered rising values license both `sparkline` and `bar-chart`; `sparkline` wins through `slope + position + label`.
- Five ranked values license both `bar-chart` and `sparkline`; `bar-chart` wins through `length + position + label`.
- The selected renderer key is compatibility only; the test checks candidate forms and selected wire licenses so this does not regress into a one-form menu.

Verification run after the data-series slice:
- `npx vitest run tests\editron\mg-spine-usability.test.ts tests\editron\mg-atomic-overlay-decision.test.ts tests\editron\mg-composition-planner.test.ts` - passed, 75 tests.
- `npx vitest run tests\editron\mg-atomic-overlay-plan.test.ts tests\editron\mg-atomic-overlay-decision.test.ts tests\editron\mg-layer-content-sanitize.test.ts tests\editron\mg-primitive-renderers.test.ts tests\editron\mg-spine-usability.test.ts tests\editron\mg-visual-explanation-contract.test.ts` - passed, 99 tests.
- `npx eslint . --quiet` - passed.
- Touched-file typecheck filter - no errors in `content-shape-analyzer`, `recipe-types`, or `mg-spine-usability`.

## Section 22 Proof Points

Candidate set checks now covered in `tests/editron/mg-composition-planner.test.ts`:
- `90%`: candidates include literal, sweep, and length; selected candidate is sweep.
- `100M`: candidates include literal only; no bounded data-viz candidate is emitted.
- `1/3`: candidates include literal, sweep, and length; selected candidate stays literal to preserve exact fraction reading.
- Repeated bounded stats penalize the previous encoding key, so consecutive `90%` stats vary.
- Deterministic eval layer scores participate in candidate ranking; candidates below the legibility floor lose before final selection.

Verification run:
- `npx vitest run tests\editron\mg-composition-planner.test.ts` - passed, 50 tests.
- `npx vitest run tests\editron\phase0-artifact-paths.test.ts tests\editron\phase0-failure-taxonomy.test.ts tests\editron\phase0-fixture-manifest.test.ts tests\editron\phase0-render-artifact-pack.test.ts` - passed, 16 tests.
- `npx vitest run tests\editron\mg-atomic-overlay-plan.test.ts tests\editron\mg-atomic-overlay-decision.test.ts tests\editron\mg-layer-content-sanitize.test.ts tests\editron\mg-primitive-renderers.test.ts tests\editron\mg-spine-usability.test.ts` - passed, 91 tests.
- `npx tsc --noEmit --pretty false` - full repo still baseline-red in unrelated app/ThinkForge/scripts files.
- Touched-file typecheck filter - no errors in `encoding-wires`, `composition-planner`, `composition-renderer`, or `mg-composition-planner`.
- `npx eslint . --quiet` - passed.

Stop line after this slice:
- Do not build semantic fact extractor yet without review.
- Do not add Penrose/dagre.
- Do not rebuild motion/emphasis.
- Do not claim MG is complete without rendered artifacts.
