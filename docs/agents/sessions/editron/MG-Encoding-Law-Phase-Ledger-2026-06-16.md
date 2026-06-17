# MG Encoding Law Phase Ledger - 2026-06-16

Repo state observed after the section 22 slice:
- Worktree: `D:\google downloads\Front-End-main\editron-worktree`
- Branch: `infrastructure-improvs-+Editron`
- Status caveat: this ledger tracks only the MG encoding-law architecture slice.

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
- Status: calibration cohort pass, real-video proof still pending.
- Evidence: `lib/editron/motion-graphics/engine/eval/rendered-aesthetic.ts` includes a `motion-graphic` dimension that fails sparse-rate MG evidence when it carries generic shell/card atoms (`sm-backdrop`, `semantic-stat-field`, `semantic-stat-axis`) or reserves a large frame area while painting mostly empty/text-only pixels. `tests/editron/rendered-aesthetic.test.ts` covers both the failing old sparse-rate shell and the passing licensed `numeric-sparse-rate-trace` case.
- Calibration cohort: `scripts/build-mg-rendered-calibration-input.ts` generates a deterministic rendered-aesthetic project input through the live planner, token resolver, atomic plan builder, and atomic decision engine. These six probe cases are fixture inputs for calibration only, not style selectors. The cohort covers sparse rate, bounded percent, big magnitude, fraction, keyword/concept, and speaker intro MGs. `tests/editron/mg-rendered-calibration-input.test.ts` proves the cohort exists and that sparse-rate evidence stays out of generic stat shell atoms.
- Rendered calibration run: `npx tsx scripts\render-editron-aesthetic.ts .calibration-temp\mg-rendered-calibration-input.json --tag=mg-rendered-calibration-check --overlay-only --max-samples=24` now completes with `summary: pass score=1 pass=6 warn=0 fail=0`. Report artifacts are `.calibration-temp/rendered-aesthetic/mg-rendered-calibration-check/rendered-aesthetic.json` and `.calibration-temp/rendered-aesthetic/mg-rendered-calibration-check/report.html`.
- Current hard-failure fixes from the calibration run: `composition-planner.ts` keeps text-heavy MGs in wide top lanes when bottom text occupancy is protected, suppresses decorative visual density in those protected frames, and moves bottom identity layouts to a wide top lane when required for fit. `composition-renderer.tsx` suppresses global semantic scene atoms when the atomic visual context says existing text must be protected, uses deterministic safe insets for compact full-width lanes instead of transform-based centering, strips compact-lane horizontal child transforms, reduces compact top-lane type caps, and prevents short speaker phrases from being split into word-by-word fragments. `data-viz-renderers.tsx` adds deterministic text outlines for SVG data labels. This removed hard occlusion/contrast failures and safe-area warnings from the six-case calibration cohort.
- Still needed: rendered quality is not done. The six-case calibration cohort now passes, but Phase 7 still needs real project/video taste gates and current project dumps/stills/clips before claiming live MG quality. This remains calibration/tuning work, not a menu or preset path.

Known live-render blocker - repeated stat shell:
- Symptom observed on a new video: scalar stat MG for `0.02` / `human beings per day` still looks like the same stat shell used elsewhere: centered value, large translucent conic field, horizontal axis bar, and top phrase strip.
- Root cause: `composeNumeric` and data-series selection now avoid the old classifier/menu path, but `composition-renderer.tsx::resolveSemanticContentSceneAtoms` still emits `semantic-stat-magnitude-field`, `semantic-stat-magnitude-field-core`, and `semantic-stat-magnitude-axis` for any numeric content or `counter` role. That renderer scene layer behaves template-like even when the upstream encoding selection is fact/wire based.
- Encoding-law status: this is not a menu/preset in the new selector, but it is still an unlicensed renderer shell and must be treated as a Phase 7 blocker before claiming MG quality.
- Code fix status: `composition-renderer.tsx::resolveSemanticContentSceneAtoms` now gates semantic stat scene atoms through licensed evidence. `semantic-stat-field` needs bounded-proportion / `sweep` evidence; `semantic-stat-axis` needs `sweep` or `length` evidence. Bare scalar/rate content such as `0.02 human beings per day` returns no repeated stat shell.
- Regression coverage: `tests/editron/mg-stage-composition-renderer.test.ts` proves licensed `90%` content still gets stat atoms and unbounded scalar-rate content gets none. `tests/editron/mg-spine-usability.test.ts` also locks the sparse scalar-rate recipe against both one-point data-viz shells and `sm-backdrop`.
- Rendered proof: `.calibration-temp/mg-stills/mg-stat-rate-current/mg00-unknown-0-02.png` was regenerated from the current planner after the fix. It renders `0.02 human beings per day` as `counter + sm-underline + numeric-sparse-rate-trace + numeric-rate-rule + label`, with no conic stat field, no horizontal magnitude axis, no backdrop card, no render errors, and no fit warnings.
- Rendered taste gate: `tests/editron/rendered-aesthetic.test.ts` now fails sparse-rate evidence if it still carries generic shell/card atoms, and passes the licensed trace evidence. This is a deterministic gate over rendered evidence, not a new preset selector.
- Honest visual status: this fixes the repeated shell/card bug class, but the result is still a sparse typographic rate composition, not the final rich full-frame MG standard. The remaining quality work belongs in Phase 7 / calibration: richer licensed atoms for tiny rates and real footage taste gates, not more presets or menu types.

Known real-project blocker - one bad MG in `proj_sH-nZy0DtNOq`:
- Symptom observed on 2026-06-17: the saved project has a 547.57s final timeline but only one `motion-graphic` overlay. The visible MG is `0.02` / `humans spoken to per day`, lasts 72 frames / 2.4s, and sits visually over the talking-head frame while the canonical karaoke caption is also active.
- Evidence: `npx tsx scripts\inspect-project-mg.ts proj_sH-nZy0DtNOq` reports overlay counts `{ video: 38, sound: 3, transition: 3, motion-graphic: 1, caption: 1 }`, `directorProfileUsed: A-01`, `genreParameters.graphic_density: 0.8310666483250496`, one global caption track, and the MG metadata `placementRegion: "middle-right"` with persisted recipe layout `position: "center"`.
- Root cause split:
  - Count/source issue: the deterministic Encoding Law composer only realized the one graphic decision it received. Phase 9E now adds an initial deterministic transcript/on-screen semantic fact extractor for new runs, but the saved project has not been regenerated through that path yet. This was a candidate-source gap, not a renderer preset issue.
  - Bad candidate issue: the upstream decision selected a satirical tiny decimal count as the only stat MG. Current semantic atoms say only `quantity.displayText = "0.02"`, `kind = "count"`, `unit = "people"`; no richer rhetorical/satire/factual-salience facts exist to downrank or replace it.
  - Placement issue: EDL/atomic placement chose `middle-right`, but `mg-expression-authority.ts::regionToLayoutPosition` did not understand `middle-right` / `middle-left`, so the recipe authority silently fell back to `center`.
- Code fix status: `mg-expression-authority.ts` now maps `middle-right` / `center-right` to `top-right` and `middle-left` / `center-left` to `top-left` instead of recentering. This fixes the verified placement vocabulary loss for new runs; existing persisted project recipes must be regenerated.
- Regression coverage: `tests/editron/mg-expression-authority.test.ts` now has `does not recenter middle-right atomic placement when applying recipe authority`, using the same `0.02` / `humans spoken to per day` content shape.
- Still needed: regenerate `proj_sH-nZy0DtNOq` and other real projects through the new extractor path, then inspect candidate ledgers, selected overlays, rendered stills/clips, count, caption safety, and visual richness. This phase should still fail if the extractor produces too few licensed candidates or the rendered compositions remain sparse/box-like.

Phase 8 - Calibration:
- Status: not complete.
- Evidence: numeric scores are deterministic local priors for this slice, and the first six-case rendered calibration cohort now passes after renderer-safe-lane fixes.
- Still needed: offline weight tuning against reference renders, plus real-video calibration cases beyond the six deterministic probes.

## Anti-Overfit Rule For The Next MG Build

The next MG work must not tune production behavior to `proj_sH-nZy0DtNOq`, Hank Green, `0.02`, or any named calibration case. Those are regression probes only. Production branches may only key on general evidence facts and contracts, such as `bounded-proportion`, `comparison`, `named-entity`, `quote`, `negation`, `polarity`, `claim-strength`, `rhetorical-or-satire`, `salience`, `caption-redundancy`, `screen-pressure`, and `available-negative-space`.

Required safeguards:
- Build and judge against a corpus, not one project: include weak stat, strong stat, bounded percent, magnitude, fraction, quote, speaker identity, concept explanation, comparison, list/process, contradiction/refutation, CTA, busy caption footage, and clean negative-space footage.
- Split fixtures into calibration and holdout sets. Tune weights only on calibration; judge robustness on holdout projects and real uploads.
- Keep hard gates semantic and deterministic. Example: a tiny scalar/rate stat needs salience, comparison, or rhetorical-truth evidence before it can become a rich MG. Exact size, duration, density, and motion constants belong to calibration, not hand-tuned case branches.
- Every MG candidate must emit an explanation ledger: source fact, licensed wires, hard gates passed/failed, score reasons, selected atoms, selected stage mode, and rendered gate result.
- Regression tests must assert invariants, not target one screenshot: weak scalar stat suppressed, strong bounded stat licensed, identity requires `name/title`, quote requires source text, concept needs body/context, and compatibility renderer names never become authority.
- Renderer keys and `graphicType` may remain only as compatibility plumbing. Selection authority must come from facts, wires, contracts, gates, and deterministic scores.

## Final Remaining Plan

Phase 9 - Semantic fact extractor and candidate ledger:
- Extract multiple MG candidate facts from transcript/project content: claims, concepts, named entities, comparisons, quotes, stats, negations, polarity, salience, rhetorical/satire markers, and evidence source spans.
- Feed those facts into the existing visual explanation contract, expression authority, encoding wires, and rendered aesthetic gate.
- Add hard gates for low-value facts: weak/tiny/rhetorical stats do not become MGs unless licensed by salience, comparison, boundedness, or truth/rhetorical evidence.
- Output a per-candidate ledger so candidate count, suppression, and selection are inspectable without reading screenshots.

Phase 9A - Done on 2026-06-17:
- Added `lib/editron/motion-graphics/engine/semantic-mg-candidates.ts` as a pure deterministic candidate ledger contract. It emits candidates and suppressed candidates with `sourceSpan`, `evidenceKeys`, fact licenses, hard-gate reasons, and score inputs.
- Covered generic fact kinds only: weak stat, bounded stat, magnitude stat, series, comparison, quote, identity, concept, refutation, and list. It does not emit renderer/menu/preset/template names.
- Added `tests/editron/mg-semantic-candidates.test.ts` for weak scalar suppression, bounded proportion licensing, magnitude separation, concept/identity/quote/comparison extraction, and explicit missing-source-span suppression.
- Verification: `npx vitest run tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-visual-explanation-contract.test.ts tests\editron\mg-expression-authority.test.ts` passed 24 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for `semantic-mg-candidates` passed. Full `npx tsc --noEmit --pretty false` is still baseline-red in unrelated app/ThinkForge/admin files.
- Not done: this ledger is not yet wired into live MG selection. Phase 9B/9D must connect extractor output and authority selection before it changes production MG count or visual choice.

Phase 9B - Done on 2026-06-17:
- `normalizeMotionGraphicContent` now builds a `semanticMgCandidateLedger` from normalized content, source phrase/timing evidence, content structure, and semantic atoms.
- `edl-executor.ts` persists that ledger on live motion-graphic overlay metadata before MG expression authority/recipe selection. This makes real generated MGs auditable without changing visible output yet.
- The ledger was extended with `series` / `series-values` facts so data-series MG moments are represented by facts, not renderer names.
- Added live-path coverage in `tests/editron/mg-content-atoms.test.ts`: normalized semantic atoms expose series/identity candidates, and executed MG overlays persist `metadata.semanticMgCandidateLedger`.
- Verification: `npx vitest run tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-content-atoms.test.ts tests\editron\mg-visual-explanation-contract.test.ts tests\editron\mg-expression-authority.test.ts` passed 26 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for `semantic-mg-candidates|mg-content-atoms|edl-executor` passed. Full `npx tsc --noEmit --pretty false` remains baseline-red in unrelated app/ThinkForge/admin files.
- Not done: Phase 9B is metadata/observability only. Phase 9C/9D still need to use the ledger as a hard gate and then feed selected facts into authority selection.

Phase 9C - Done on 2026-06-17:
- Added `resolveSemanticMgLedgerGate`, a deterministic hard gate over the candidate ledger. It allows no-candidate content to continue through existing authority, allows ledgers with licensed candidates, and blocks ledgers where every semantic candidate was suppressed.
- `edl-executor.ts` now applies this gate before MG expression authority, utility scoring, composition planning, and rendering. Weak/tiny unlicensed stats now stop before becoming visible MGs.
- Added tests proving weak scalar stats produce `semantic-ledger:no-licensed-candidate` / `semantic-ledger:weak-stat-needs-salience-or-relation`, plain non-candidate content still continues to existing authority, and live `executeEDL` does not render a weak unlicensed stat MG.

Phase 9D - Done on 2026-06-17:
- Added `selectSemanticMgCandidate`, a pure deterministic ranking pass over licensed ledger candidates. It ranks by structural strength, salience, evidence strength, render risk, fact-kind priority, then stable id. It returns a fact/license selection report, not a surface renderer or preset name.
- `edl-executor.ts` now selects the ranked semantic candidate after the hard ledger gate, passes it into `resolveMgExpressionAuthority`, and persists `metadata.semanticMgCandidateSelection` next to the full ledger.
- `mg-expression-authority.ts` now accepts the selected semantic candidate as a soft authority input, snapshots the selected fact/license/score metadata, and emits semantic fact/license reasons. It still requires the visual explanation contract and evidence-backed obligations to allow rendering.
- Added authority coverage proving a bounded proportion selects `bounded-stat`, records `bounded-proportion` / `source-span` / `salience` licenses, and does not emit renderer/preset/template terminology.
- Verification: `npx vitest run tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-expression-authority.test.ts tests\editron\mg-content-atoms.test.ts tests\editron\mg-visual-explanation-contract.test.ts` passed 29 tests; `git diff --check` passed with line-ending warnings only; `npx eslint . --quiet` passed; touched-file TypeScript filter for `semantic-mg-candidates|mg-expression-authority|edl-executor|mg-expression-authority.test` passed. Full `npx tsc --noEmit --pretty false` remains baseline-red in unrelated admin/ThinkForge/shared/script files.
- Not done: this still does not make the final rendered composition beautiful by itself. The next gate must run real projects and inspect whether selection count, layout variety, caption safety, and visual richness are actually acceptable.

Phase 9E - Done on 2026-06-17:
- Added `lib/editron/services/mg-semantic-fact-extractor.ts`, a pure deterministic transcript/on-screen text extractor that proposes semantic MG facts and immediately validates them through `semantic-mg-candidates.ts`.
- Wired `intent-translator.ts` to inject only licensed extracted facts into live EDL graphic decisions, with density caps and evidence dedupe. Weak unlicensed facts remain visible in the extractor ledger as suppressed candidates but do not become injected MG decisions.
- Initial extracted fact coverage is deliberately generic: bounded numeric facts, magnitude facts, numeric relations, explicit comparisons, exact quoted text, and connector-backed concept claims. It emits fact/source-span/ledger metadata, not renderer/template/preset names.
- Added regression coverage in `tests/editron/intent-translator-mg-no-preset.test.ts`: empty LLM `graphicIntents` plus transcript evidence emits licensed `comparison` and `bounded-stat` MG decisions, while a weak `0.02 ... per day` tiny-rate fact is not promoted.
- Verification: `npx vitest run tests\editron\intent-translator-mg-no-preset.test.ts` passed 4 tests; `npx vitest run tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-content-atoms.test.ts tests\editron\real-project-mg-taste-gate.test.ts` passed 11 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for `mg-semantic-fact-extractor|intent-translator|intent-translator-mg-no-preset` passed. Full `npx tsc --noEmit --pretty false` remains baseline-red in unrelated app/admin/ThinkForge/shared/script files.
- Not done: this is not final MG taste proof. Real projects still need regeneration and rendered review. The extractor is intentionally conservative and may still under-emit concepts/quotes without richer semantic parsing.

Phase 10 - Real-project taste gate:
- Regenerate current real projects, starting with `proj_sH-nZy0DtNOq` as one probe, not as a special case.
- Dump project MG candidates, selected overlays, recipes, atomic plans, atomic decisions, captions, and rendered stills/clips.
- Fail the gate when a real project produces too few MGs for strong evidence, mostly keyword boxes, repeated shell/card visuals, caption collisions, weak stat selection, or unexplainable stage-mode choices.

Phase 10A - In progress on 2026-06-17:
- Added a deterministic real-project MG taste gate (`real-project-mg-taste-gate-v1`) that evaluates persisted project overlays for MG count versus signal-derived graphic density, missing semantic selection metadata, weak tiny-stat selection, caption-active center/full-frame MGs, placement drift, and repeated recipe form.
- Added `scripts/audit-real-project-mg.ts <projectId>`, which reads the saved project, writes `.calibration-temp/real-project-mg-taste/<projectId>/mg-taste-gate.json`, and writes `.calibration-temp/<projectId>-mgs.json` for `scripts/render-mg-stills.ts`. This lets us render/check MG stills without rendering the entire video.
- Added fixture coverage that fails a generic Hank-like one-MG weak tiny-stat project without keying on the project id/person/video, and passes a varied audited project with licensed semantic selections.
- Current real-project result: `npx tsx scripts\audit-real-project-mg.ts proj_sH-nZy0DtNOq` fails as expected with score `0.23`: one MG versus target `8` / minimum `3`, missing semantic candidate selection metadata on the saved overlay, weak unlicensed tiny scalar stat `0.02`, caption-active center-stage MG, and placement drift from requested `middle-right` to persisted `center`.
- Current render-still result: `npx tsx scripts\render-mg-stills.ts proj_sH-nZy0DtNOq` renders one still at `.calibration-temp/mg-stills/proj_sH-nZy0DtNOq/mg00-atomic-graphic-0-02.png` with no render errors or fit warnings. Visual status: still a sparse typographic rate composition, not final rich full-frame MG quality.
- Verification: `npx vitest run tests\editron\real-project-mg-taste-gate.test.ts tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-expression-authority.test.ts` passed 19 tests; `npx eslint . --quiet` passed; `git diff --check` passed with line-ending warnings only; touched-file TypeScript filter for `real-project-mg-taste-gate|audit-real-project-mg` passed. Full `npx tsc --noEmit --pretty false` remains baseline-red in unrelated admin/ThinkForge/shared/script files.
- Current expectation: the saved `proj_sH-nZy0DtNOq` should continue to fail this gate until it is regenerated through Phase 9E and then passes real-project candidate/count/caption/rendered taste checks.

Phase 10B - In progress on 2026-06-17:
- Added `scripts/probe-semantic-mg-rerun.ts`, a read-only MG rerun probe for saved projects. It loads the saved transcript/timeline, builds scene contexts, reruns the live intent translator with empty LLM `graphicIntents`, and can either dump semantic candidates only or attempt a graphic-only executor replay on cloned overlays. It does not write back to MongoDB.
- Fixed a probe timing bug by treating `startMs` / `endMs` fields as milliseconds and `start` / `startTime` fields as seconds unless the value is already obviously millisecond-scale.
- Candidate-only result for `proj_sH-nZy0DtNOq`: 207 scene contexts and 2868 timed words produced 11 deterministic semantic MG decisions from transcript evidence with empty LLM graphic intents. This confirms the candidate-source gap improved from the saved project state, where the final timeline persisted only one MG.
- Quality fix in `mg-semantic-fact-extractor.ts`: concept facts now focus connector/problem clauses, reject pronoun/contraction-only and vague all-generic titles, and dedupe concepts by stable title evidence instead of raw body text.
- Quality fix in `intent-translator.ts`: semantic MG injection now has a translation-wide evidence dedupe set, so repeated same-title concept candidates are not emitted multiple times across nearby scenes.
- Regression coverage: `tests/editron/intent-translator-mg-no-preset.test.ts` now proves concept extraction promotes claim-focused facts such as `Unacceptable` / `Algorithm Problem` while suppressing pronoun fragments such as `Doesnt Want Express` / `Theyre`, and still emits no `graphicType`, template, or preset authority.
- Verification so far: `npx vitest run tests\editron\intent-translator-mg-no-preset.test.ts` passed 5 tests; `npx vitest run tests\editron\intent-translator-mg-no-preset.test.ts tests\editron\mg-semantic-candidates.test.ts tests\editron\mg-content-atoms.test.ts tests\editron\real-project-mg-taste-gate.test.ts` passed 16 tests; `npx eslint . --quiet` passed; candidate-only `npx tsx scripts\probe-semantic-mg-rerun.ts proj_sH-nZy0DtNOq --candidate-only` passed and wrote `.calibration-temp/semantic-mg-rerun/proj_sH-nZy0DtNOq/semantic-mg-candidates.json`.
- Current blocker: graphic-only executor replay still times out even with `--max-scenes=20 --max-decisions=1`. Do not claim real render proof for Phase 10B until `executeEDL` / `applyGraphic` latency is isolated or a lighter live-render harness proves the selected candidates visually.
- Honest status: this is not a preset/menu/template path, and it does not solve the rich full-frame visual standard by itself. It closes the real candidate-source/debuggability gap and improves fact quality; the next phase must prove rendering/taste on real footage.

Phase 10C - Done on 2026-06-17:
- Replaced the slow full-`executeEDL` replay attempt in `scripts/probe-semantic-mg-rerun.ts` with an MG-only composition replay that still uses the live MG modules: semantic ledger gate/selection, motion tokens, atomic placement, MG expression authority, composition planner, structural gate, atomic overlay plan, and atomic decision.
- Real project proof for `proj_sH-nZy0DtNOq`: 207 transcript scenes / 2868 timed words translated into 11 semantic MG decisions, replayed 11/11, skipped 0, wrote 11 local MG overlays, and passed the real-project taste gate with score 1.
- Render proof: `npx tsx scripts\render-mg-stills.ts proj_sH-nZy0DtNOq-semantic-rerun` rendered 11 stills with no browser errors, no `MG-Fit` warnings, and no cannot-fit warnings.
- Fixed the immediate real-project gap from the user's screenshot: one saved weak center MG no longer represents the current semantic replay path. The current replay emits enough licensed concept MGs and keeps them side-safe instead of center-colliding with captions.
- Added fact-derived structured recipe ids such as `composed-structured-problem`, `composed-structured-negative-claim`, `composed-structured-causal-claim`, and `composed-structured-claim`. These are semantic registers for reporting/variety, not production renderer menus or visual presets.
- Updated MG expression authority so caption-aware full/split/device stage modes preserve or choose side-safe layouts instead of recentering. Added final caption-safe center enforcement at recipe application.
- Verification: `npx vitest run tests\editron\mg-spine-usability.test.ts tests\editron\mg-expression-authority.test.ts tests\editron\real-project-mg-taste-gate.test.ts tests\editron\intent-translator-mg-no-preset.test.ts` passed 40 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for the replay/planner/authority/tests passed; `git diff --check` passed with line-ending warnings only.
- Commit/push: `90c6d045 fix(editron): replay semantic MG stills without executor hang`.
- Honest status: this fixed generation count, replay observability, taste-gate pass, and caption-safe placement. It did not finish the visual language; concept MGs still looked too sparse/repeated after this phase.

Phase 10D - Done on 2026-06-17:
- Added relation-aware semantic concept scene atoms in `composition-renderer.tsx`. Once content has already licensed a concept MG, the renderer now derives visual atom roles from generic semantic text facts: contrast, negation, affirming support, causality, problem/friction, or default claim.
- This is not a preset/menu/template selector: it does not change what MG is picked, does not branch on project IDs, and does not output surface renderer names. It only maps existing concept facts to richer parametric scene atoms inside the current renderer.
- Real rendered result for `proj_sH-nZy0DtNOq-semantic-rerun`: concept frames now show larger stage fields and relation-specific pressure/strike/flow/contrast geometry instead of the same small three-node map. Render stills remained clean: 11 stills, no browser errors, no fit warnings.
- Added renderer tests proving concept scene atoms vary by semantic relation facts and unknown content still emits no invented semantic scene atoms.
- Verification: `npx vitest run tests\editron\mg-stage-composition-renderer.test.ts tests\editron\mg-atomic-render-decision.test.ts` passed 48 tests; broader MG suite `npx vitest run tests\editron\mg-stage-composition-renderer.test.ts tests\editron\mg-atomic-render-decision.test.ts tests\editron\mg-spine-usability.test.ts tests\editron\mg-expression-authority.test.ts tests\editron\real-project-mg-taste-gate.test.ts tests\editron\intent-translator-mg-no-preset.test.ts` passed 88 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for `composition-renderer|mg-stage-composition-renderer|mg-atomic-render-decision` passed; `git diff --check` passed with line-ending warnings only.
- Commit/push: `3dfd3aae feat(editron): vary concept MG scene atoms by semantic facts`.
- Honest status: the system is visibly better than the screenshot path, and it is not preset-based. Remaining visual debt is still real: layout calibration, richer motion choreography, footage compositing, holdout calibration, and avoiding overfitting beyond the current project probe.

Phase 10E - Done on 2026-06-17:
- User visual review showed Phase 10D still read as a template in practice: repeated dark slab, empty rounded nodes, crossing rails, top-right title/body treatment, and title-safe clipping on concept MG stills.
- Corrected the terminology: even if the selector is fact-driven and not a menu/preset branch, repeated renderer chrome can still be visually template-like. Future status reports must distinguish "not menu-selected" from "not visually templated."
- Removed the empty placeholder concept-node shell from `composition-renderer.tsx`. Concept scene atoms now use relation fields, rails, brackets, strikes, and pressure/flow atmospheres instead of the same three empty pill nodes.
- Added semantic concept text layout override so concept-stage atoms no longer leave text in the top-right corner. Text fit now uses a wider safe centered layout when semantic concept stage atoms are active without richer stage chrome.
- Render proof: `npx tsx scripts\render-mg-stills.ts proj_sH-nZy0DtNOq-semantic-rerun` rendered 11 stills with no browser errors and no fit warnings. The repeated empty-node diagram and clipped top-right title were gone on the reviewed frames.
- Verification: `npx vitest run tests\editron\mg-stage-composition-renderer.test.ts tests\editron\mg-atomic-render-decision.test.ts tests\editron\mg-spine-usability.test.ts tests\editron\real-project-mg-taste-gate.test.ts` passed 72 tests; `npx eslint . --quiet` passed; touched-file TypeScript filter for renderer/MG tests passed; `git diff --check` passed.
- Commit/push: `1093f645 fix(editron): remove repeated concept MG map shell`.
- Honest status: this fixes the specific template-looking shell and clipping bug. It still does not complete final MG quality; the next phase must add genuinely different composition families for concept claims, not just relation atmospheres.

Phase 11 - Remaining fallback authority cleanup:
- Convert remaining non-series composer/template fallback authority into fact/wire/contract driven candidate generation.
- Keep compatibility renderer keys only where they are downstream realization names.
- Add tests that production selection does not branch on preset/menu/template/case ids.

Phase 12 - Atom expansion after facts exist:
- Add richer parametric atom families only after the extractor emits evidence for them.
- Prioritize atoms for concept relations, quote/proof, contradiction/refutation, comparison, speaker identity with evidence, and tiny-rate contextualization.
- Each atom family must have rendered before/after proof and invariant tests.

Phase 13 - Multi-overlay choreography proof:
- Verify MG timing with captions, zooms, transitions, SFX, and cuts on real rendered clips.
- Add timeline-memory checks for repeated MG form, recent zoom intensity, caption-zone pressure, and overlay count.
- Fail rendered gates when MG competes with captions or repeats the same form too often.

Phase 14 - Calibration and holdout evaluation:
- Tune invented weights and constants against reference renders and the calibration fixture set.
- Keep a separate holdout set to detect overfit.
- Only promote learned/tuned values when calibration improves the class of examples and does not regress holdout renders.

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
- Do not claim semantic fact extraction is complete until real project reruns prove enough licensed candidates and rendered taste quality.
- Do not add Penrose/dagre.
- Do not rebuild motion/emphasis.
- Do not claim MG is complete without rendered artifacts.
