# Doc-vs-Code Reconciliation — 2026-05-31 (8-agent verified sweep)

A full read-EVERYTHING pass (vault + memory + rules + repo docs) **cross-checked against the actual code** in `editron-worktree\` on `infrastructure-improvs-+Editron`. Below = where the docs/memory/handovers DRIFTED from code. `[ME]` = re-verified directly this session; `[A]` = agent-verified with file:line. #decided (these are corrections, trust code over the older docs). #open where flagged.

## A. Stale FACTS to stop repeating
1. **Creative graph = 671 nodes / `533` edges** (JSON stats block, graph file `:7-10`: totalNodes 671, totalEdges 533, edgesReconciled 112, danglingEdgeRefs 34). The "**799 edges**" in MEMORY.md + `graph-query.ts:8` comment is STALE. Node types: Signal 49, Mapping 95, Technique 115, Constraint 50, Theory 71, Constant 218, **+ Part-0 intent nodes** (AuthorityDecision 30, IntentParameter 9, ContentSignal 9, ComputationStage 5, ModeSpec 3, …) the memory omits. File is 859KB (not 883KB). `[ME]`
2. **Signal taxonomy "47/35" is imprecise:** 49 graph `Signal` nodes (+9 `ContentSignal`); the "34 signals" in Signal-Registry-Deep-Dive = the MG-perceptual subset reaching `planComposition`; `PlannerSignals` interface has only **8** named fields + index signature. `[A]`
3. **`cinematic_moment` IS computed** (`signal-registry.ts:391`, "2+ tracks peaking within 500ms"). The "absent on real data" finding was a **fresh-ingest DATA gap, not a code gap**. `[A]`
4. **108 `INVENTED` thresholds** across 12 MG engine files (grep count). The "77" (MG-Engine-State) and "86" tallies are stale undercounts. `[A]`
5. **Mode 3 (hybrid) does NOT exist in code** — FUTURE only; no `lib/pipeline` hybrid impl. `[A]`
6. **Footprint "163 occ / 19 files"** for the type-menu is indicative, not exact (tight selection-pattern = 122/17; broad = 301/38). Don't treat 163/19 as a measured constant (Rule 31). `[A]`

## B. DEAD / UNWIRED code (believed-live in docs)
7. **`crg-constraint-validator.ts` `validateRecipeConstraints` is dead IN PRODUCTION (but NOT a clean delete).** CORRECTED 2026-05-31 (confirmed ×2: ripgrep + git grep + raw grep): its header says "Called by composition-planner after building a Recipe" — **FALSE** (zero hits there), so its `CRG_MIN_FONTS` (counter 64 / primary 48 / secondary 36 / label 36), `GENERAL_MIN_FONT = 72`, and 3-pass auto-correction **never run in the pipeline.** BUT it IS imported + called by the untracked test harness **`scripts/verify-composition-engine.ts:9,135,149`** and named as a string in `threshold-registry.ts:545`. So: production-dead, test-referenced — removing it must also handle the script + registry string. (Earlier note "NEVER CALLED" was scoped to `lib/` and missed `scripts/`.) NOTE: its `applyCorrections` per-issue auto-fix logic is the blueprint for the Phase-E ENFORCE flip → keep as reference, don't rush-delete. `[ME]`
8. **`aesthetic-gate.ts` `runAestheticGate` (Gemini Tier-2) = DEAD** (zero importers). `[A]`
9. ⇒ **The ONLY live MG gate is `structural-gate.ts` `checkCompositionStructure`** — wired at `edl-executor.ts:1169`, **OBSERVE-ONLY** (logs `[MG-StructuralGate] FAIL`, never blocks; `PASS_THRESHOLD=60`). Checks contrast (WCAG <3:1/-30, <4.5:1/-15), per-element `minSize<24px`, foregroundCount>6, frame-brightness mismatch. It does **NOT** check the 72px caption floor. `[A]`

## C. Wrong LINE NUMBERS / mislocations in the handovers
10. **`signalsAtFrame` is Path E, not Path D.** The closure is `director-agent.ts:612` inside `executeEDLPathE`. Path D uses grid `signalTimeline` snapshots (every 15 frames). Commit `8017a70a`'s "per-frame signal injection" fixed **Path E**. `[A]`
11. **Brand stamp = `edl-executor.ts:253-274`** (`brandInputsFromUnifiedBrand` → `d.params.brand`); `:1128` is the *consumer* (`resolveMotionTokens`). G-2 logic HOLDS. `[A]`
12. **`keyword-highlight` EDL default = `edl-executor.ts:1051`** (`|| 'keyword-highlight'`), not the handover's `:1027`. A **second injection at `:492`** (emphasis-word → keyword-highlight graphic) is undocumented and also feeds the monotony. `[ME]`

## D. Decisions: decided ≠ implemented
13. **D-016 "profiles removed" = PARTIAL.** `director-agent.ts` still has ~37 `effectiveProfile/profileId` refs and still reads `graphicsDensity / cutsPerMinRange / pacing / captionStyle / filterPresetId` (≈ lines 644/1010/1078-1166/1289/1324). `edit-profiles.ts` (54 profiles) still on disk. **Phase 3B genuinely deferred.** Profiles still supply fallbacks; Utility-AI is supposed to win but the cascade isn't gone. `[A]`
14. **D-017 graphicType enum still LIVE / undissolved.** `unified-edit-intelligence.ts:420` enum + prose default (`:1210-1218`, "default keyword-highlight, DO NOT use callout"). BUT `GraphicIntentSchema` already has a **`kind`** field (`:421`, numeric/identity/quotation/emphasis/…) — the content-extraction half Phase D wants is **partly already wired**; lean on it. `[A]`
15. **Generative engine is the DEFAULT + the LLM `kind` hint is IGNORED at the engine.** `useCompositionEngine: true` (`editron-config.ts:499`); `content-shape-analyzer.ts:14-19` — the `_kind` param is underscore-prefixed and **never read**; `detectShapes(content)` duck-types purely from content fields. ⇒ "type emerges from content" is CODE-TRUE today. `kindMap`/`buildShapeFromKind` = 0 matches (removed). `[A]`
16. **D-008 status conflict** (file #open vs Index "deployed/verified" — Index wins, file stale). **Two D-015 files** (Graphiti bridge + GSAP backbone, unrelated). **Thompson Sampling**: 05-08 audit "STUBBED" vs Index 05-26 "live/wired" — fresh-grep before relying. `[A]`

## E. Plan-scope IMPACT (this changes the build)
- **Phase 0.2 (caption 48-vs-72) is lower-urgency than written.** The 72 floor is **not enforced anywhere live** (validator §7 dead; the live structural-gate §9 doesn't check it). The conflict is real *inside the graph* (`constant:caption.min_font_size`=48 [BBC/FB] vs `constant:typography.captions_min_font`=72 [Editron]) and must be resolved **when Phase E wires a real gate**, not as a standalone pre-req. Decide the canonical floor + fix the graph self-contradiction; don't assume "72 is enforced."
- **Phase C (dissolve the menu) is SMALLER for Path D than the plan says.** `overlay-bridge.ts` has **4** resolvers (stat_graphic, lower_third, keyword_highlight, callout) and the overlay JSON emits **only those 4** fixed types (quote_card/logo_reveal never emitted) ⇒ **nothing is silently dropped**; "add the 4 missing resolvers" is largely OBSOLETE. Remaining Path-D move = remove the `"mode":"fixed"` graphicType output + route content through `analyzeContentShape`. `[A]`
- **Phase D (LLM→extractor) can lean on the existing `GraphicIntentSchema.kind`** (already wired) rather than building extraction from scratch.

## F. Open P0 bugs found (not MG, but real — verified still open)
- **6 unguarded `JSON.parse(jsonMatch[0])` in `five-track-analysis.ts`** (lines 427/536/621/734/792/843) → a malformed Gemini response throws SyntaxError and kills the whole 5-Track analysis. `[A]`
- **`getCleanImageUrl` strips the GCS signed-URL token on fallback** (`video-generation-service.ts:89`) → fal.ai gets a dead URL → silent garbage video. `[A]`
- **`Promise.race` timeout doesn't cancel `fal.subscribe`** + **no circuit breaker** (`fal-circuit-breaker.ts` does not exist) → orphaned jobs + concurrency exhaustion at scale. `[A]`

See [[MG-Spine-Build-Plan]], [[D-017-MG-Dissolve-Type-Preset-Menu]], [[Session-2026-05-31-Phase0.1-Fonts-Render-Verified]], [[Session-2026-05-31-MG-Spine-Pivot-HANDOVER]].
