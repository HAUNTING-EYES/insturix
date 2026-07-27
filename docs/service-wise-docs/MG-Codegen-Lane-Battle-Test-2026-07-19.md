---
tags: [battle-test, editron, mg, codegen, design-then-code, #open]
date: 2026-07-19
---
# MG Codegen Lane (design-then-code) — Battle Test 2026-07-19

Battle-tested per `Production-Service-Battle-Testing-Playbook.md`. The lane is **DARK** (isLiveMgCodegenEnabled=false)
and **not deployed** (no worker snapshot), so the live layers (C: real provider, D: browser QA, E: backend
triangulation) are **blocked on the founder's P5-5 deploy**. This run covers the layers that are valid dark:
**Layer A (static control-flow audit), Layer B (automated contract tests), §2 flow map, §5/§6 adversarial + contract-mutation.**

## 1. Test truth
- Repo/worktree: `editron-worktree` · Branch: `infrastructure-improvs-+Editron` · Commit: **e4f5cea1**
- Scope: the design-then-code MG lane (Phases C + D + this run's F1 fix).
- State: DARK. No deployed commit to verify (Layers C/D/E deferred to P5-5).
- Baseline-red (NOT this lane): 5-7 fluctuating pre-existing tsc errors (2 .next generated, 2 chat-attachment-picker,
  3 tmp/) + 1 from another session's shot-planning commit (`shot-guide-battle.test.ts:163` dup key — chip filed).

## 2. Producer → consumer map (verified in code)
```
upload → auto-edit (Director EDL, graphic decisions)
  → edl-executor.runMgDesignPrepass  [PRODUCER, video-level, once/video, dark-gated]
      derive designer beats (pure: normalize→ledger gate→select candidate→expression authority→placement)
      → computeMgDensityBudget → runDesignPrepass → runVideoDesignSession → defaultGeminiDesignerGenerate (gemini-3.1-pro)
      → Map<EditDecision, MgMomentDesign>  [SOURCE OF TRUTH: validated MgVideoDesignPlan + licensed SemanticMgCandidate]
  → applyGraphic  [per moment]  design = mgDesignPlans.get(decision)  → buildMgMomentInput → MgMomentInput.design
  → runDurableMgRenderJob  [idempotencyKey canonicalizes the whole moment incl. design → distinct designs = distinct jobs]
      → mgMomentInputSchema (.strict — design must be declared or the request fails LOUD)  [BOUNDARY]
  → sandbox worker (tsx over snapshot) → generateMoment → resolveMomentPrompt
      overlay-kit + design → buildCoderPrompt ;  else → buildCodegenPrompt (free-form)   [CONSUMER]
      → scan → compile → render → judge (parseJudgeResponse caps) → MG_SEQUENCE overlay
```
Retry: durable idempotency key. Failure: design null → free-form; render fail → fallback; all logged. No silent family change.

## 3. Layer B — automated (PASS)
- 15 MG lane test files, **170/170 green** (design-session, design-prepass, designer-frames, codegen-service,
  moment-input, production-runtime, render-worker-contract, render-job-runner, render-moment, scan, placement-gate,
  live-codegen-seam, motion-intensity, density-budget, design-plan). After F1: codegen-service **29/29**.
- tsc: 0 errors in any lane file. eslint: clean.

## 4. Findings (severity-ranked, §9 format)

### F1 — P1 — FIXED (e4f5cea1)
- **Workflow:** worker prompt routing for a design.
- **Expected:** a design only takes the coder path if that lane can actually render.
- **Observed:** illustrated-overlay designs routed to buildCoderPrompt, which binds `data.backdropSrc` — a generated
  backdrop NOTHING produces until P5-3. → blank Scene → sanity-gate fail → fallback, after wasting a design+render cycle.
- **Root cause:** resolveMomentPrompt guarded only `lane !== 'cutaway-scene'`; illustrated-overlay slipped through.
- **Fix:** coder path ONLY for `lane === 'overlay-kit'`; illustrated + cutaway fall back to free-form until P5-3.
- **Regression test:** "illustrated-overlay design falls back to free-form until backdrop persistence exists (P5-3)".
- **Verification:** 29/29, tsc+eslint clean.

### F2 — P2 — OPEN (design decision)
- **Workflow:** design-session budget validation.
- **Observed:** if the designer designs > budget.maxMoments, validateDesignPlan rejects the WHOLE plan → (after one
  feedback retry) plan null → EVERY moment falls back to free-form. One over-design forfeits the entire video's design.
- **Mitigation in place:** the session retries once with the budget error fed back, so it usually self-corrects.
- **Options:** (a) keep all-or-nothing (simplest, retry mitigates); (b) TRIM to top-N by salience instead of voiding.
- **Decision owner:** founder. No code change made — needs the trim-vs-reject call.

### F3 — P2 — OPEN — **the P5-2 blocker** (premise conflict, needs founder)
- **Workflow:** MG placement / subject-clearance ("guardrails + freedom" decision).
- **Observed:** the chosen hard veto ("resolver hard-vetoes covering any V-JEPA face/subject") assumes a reliable
  face/subject box. Code reality: **NO face bounding box exists anywhere** (only `face_present`/`face_count` booleans);
  the only box is `main_subject_x/y/w/h`, which mg-placement-gate.ts documents as a **"coarse motion-blob — do NOT
  assume we know where the face is."** A deterministic subject-overlap veto was **already built and REMOVED (2026-07-15,
  founder-directed)** because it HARD-FAILS legitimate full-frame/large MGs (a Rule-29 damage-6 corpse); subject-coverage
  is currently handled by a SOFT prompt prior + the vision judge (which sees the real composite).
- **Why not built:** re-introducing the removed veto against a coarse blob, blind (no real-render calibration), would
  re-create the exact over-rejection Rule 29 forbids. Refused to ship a 2am rule.
- **Real options to move the 7→7.5 lever:** (a) add a real FACE DETECTOR to the analysis pipeline → then a conservative
  face-only veto is defensible; (b) keep the veto soft but STRENGTHEN it: feed the subject box to the designer as explicit
  context + tighten the judge's subject-collision check (the judge is the correct owner — it sees the composite); (c) both.
- **Decision owner:** founder. Recommend (b) now (cheap, safe, no new infra) + (a) as the real fix.

### F4 — P2 — OPEN (documented, bounded)
- Pre-pass derives designer beats from PRE-LOOP decision state (un-enriched; enrichDecisionSignals runs per-decision
  INSIDE the loop with mutated overlays). So the designer sees a slightly less-enriched view than the final render.
- Bounded: only affects the designer's INPUT view + which beats get designed — NEVER a wrong render (render uses
  applyGraphic's own enriched momentInput). Enriching real decisions in the pre-pass would POISON the loop's own
  enrichment (existing-signals-win). Future refinement: enrich CLONES. Not a correctness bug.

### F5 — P3 — OPEN
- The designer session gets FOOTAGE frames (D-1) but NOT the moodboard (professional "level reference" stills).
  buildDesignerParts supports moodboard; nothing supplies it. Deferred (moodboard is optional; footage is the higher lever).

### F6 — P2 — OPEN (= P5-3, planned)
- illustrated-overlay + cutaway-scene lanes cannot render until backdrop persistence exists (generate via imagery-client
  → R2 → data.backdropSrc for illustrated; a full-frame video-track asset for cutaway). Until then F1 routes them to
  free-form. P5-3 unblocks them.

## 5. §11 promotion gates (dark status)
| Gate | Status |
|---|---|
| Core workflow end-to-end on deployed commit | ⛔ BLOCKED — not deployed (P5-5) |
| Two-user authorization negative matrix | n/a this lane (server-side; runDurableMgRenderJob scopes userId/orgId) — verify at deploy |
| Recovery (idle/generating/completed/failed/cancelled) | ⛔ needs live run (durable job has idempotency + fallback; unproven live) |
| Duplicate submission → one operation | ✅ idempotencyKey canonicalizes the moment (incl. design) — unit-level; confirm live |
| Billing one terminal charge/refund | n/a design step (no charge); render job billing unchanged |
| Provider fault → visible terminal state, bounded | ✅ design: fail → free-form; judge: bounded retries → fallback (tested) |
| Cross-service contracts preserve explicit intent | ✅ .strict worker boundary; design keyed by decision reference |
| Held-out AI quality ≥ threshold (multi-run) | ⛔ NOT MET — never run live; the honest 7→7.5 gap remains (F3 lever) |

## 6. Verdict
The lane is **structurally sound and safe to sit dark**: producer→consumer contract is clean, the boundary fails loud,
every failure degrades to free-form (never a worse video than today), and 170 automated tests hold it. **One P1 (F1) was
found and fixed** during this run. It is **NOT promotable**: the live layers (C/D/E) require the P5-5 deploy, and the
headline quality lever (F3 / P5-2) is blocked on a real face detector — the chosen hard veto cannot be built safely
against the coarse subject blob without re-creating a deliberately-removed over-rejection.

**Next (founder):** decide F2 (trim vs reject) and F3 (face detector vs strengthen-soft-path), then P5-3, then P5-5 deploy → first live battle test (Layers C/D/E).
