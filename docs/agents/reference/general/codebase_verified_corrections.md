---
name: codebase-verified-corrections
description: 2026-05-31 8-agent code-verified sweep — where docs/memory/handovers drifted from code (trust code)
metadata: 
  node_type: memory
  type: reference
  originSessionId: 024cf1ed-a7cf-4684-b03c-46c8321337c8
---

**Full read-everything pass cross-checked against code (`editron-worktree`, `infrastructure-improvs-+Editron`), 2026-05-31. Trust code over older docs. Full note: vault `02-Architecture/Doc-vs-Code-Reconciliation-2026-05-31.md`.**

STALE FACTS (stop repeating):
- Creative graph = **671 nodes / 533 edges** (JSON stats block), NOT "799 edges" (MEMORY.md + graph-query.ts:8 comment stale). File 859KB.
- Signals: 49 graph Signal nodes (+9 ContentSignal); 8 in PlannerSignals; "47/35" imprecise.
- `cinematic_moment` IS computed (signal-registry.ts:391) — "absent on real data" was a fresh-ingest DATA gap, not code.
- **108** INVENTED thresholds (not 77/86). Mode 3 (hybrid) does NOT exist in code (FUTURE). graphicType footprint 163/19 is indicative not exact.

DEAD CODE (believed live) — CORRECTED 2026-05-31, confirmed ×2 (ripgrep+git grep+raw grep):
- `aesthetic-gate.ts` (Gemini Tier-2 `runAestheticGate`) = TRULY DEAD (zero refs anywhere) → safe to delete.
- `crg-constraint-validator.ts` `validateRecipeConstraints` = dead IN PRODUCTION (composition-planner does NOT call it — header claim FALSE; its 72/per-role floors + 3-pass correction never run in the pipeline) BUT it IS called by the untracked test harness `scripts/verify-composition-engine.ts:135,149` + named in threshold-registry.ts:545. NOT a clean delete (earlier "never called" was scoped to lib/, missed scripts/). Its applyCorrections logic = blueprint for the Phase-E enforce flip → keep as reference.
- The ONLY live MG gate = `structural-gate.ts` (edl-executor.ts:1169), OBSERVE-only; does NOT check the caption font floor.

LINE DRIFT (handovers):
- `signalsAtFrame` = Path E (director-agent.ts:612), NOT Path D (Path D uses 15-frame grid signalTimeline). 8017a70a fixed Path E.
- brand stamp = edl-executor.ts:253-274 (:1128 is the consumer). G-2 holds.
- keyword-highlight EDL default = edl-executor.ts:**1051** (not 1027) + a 2nd injection at :492.

DECIDED≠IMPLEMENTED:
- D-016 profiles "removed" = PARTIAL: director-agent still reads graphicsDensity/cutsPerMinRange/pacing/captionStyle/filterPresetId; edit-profiles.ts (54) on disk; Phase 3B deferred.
- D-017 graphicType enum still LIVE (unified-edit-intelligence.ts:420 + prose default 1210-1218) — undissolved. BUT GraphicIntentSchema.kind (:421) already wired = extraction half partly done.
- useCompositionEngine:true is DEFAULT (editron-config.ts:499); LLM `kind` IGNORED at engine (content-shape-analyzer.ts:14-19, `_kind` never read) → type genuinely emerges. VERIFIED.

PLAN IMPACT:
- **Phase 0.2 lower-urgency**: the 72 floor isn't enforced anywhere live (validator dead). Graph self-contradicts (caption.min_font_size=48 vs typography.captions_min_font=72). Resolve when Phase E wires a real gate, not standalone.
- **Phase C smaller for Path D**: overlay-bridge has 4 resolvers + JSON emits only those 4 → nothing dropped; "add 4 missing resolvers" largely obsolete. Remaining = remove fixed-type output, route via analyzeContentShape.

OPEN P0 BUGS (non-MG, verified): 6 unguarded JSON.parse in five-track-analysis.ts (427/536/621/734/792/843); getCleanImageUrl strips signed-URL (video-generation-service.ts:89); Promise.race no-cancel + no fal circuit breaker.

See [[session_phase0_1_fonts]], [[session_handover_2026_05_31_mg_spine_pivot]].
