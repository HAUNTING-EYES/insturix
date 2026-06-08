# Session Handover — MG Signal Pipeline FIXED, Design Layer is the New Front

**Date:** 2026-05-30 (afternoon/evening session, continues the morning MG-realdata session)
**Branch:** `infrastructure-improvs-+Editron` (PRIMARY deploy branch)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Commits this session:** 8 (`5d2e1223` → `ceb6ae8f`), all pushed
**Author tag:** Claude Opus
**Predecessor:** [session_handover_2026_05_30_mg_realdata_verification.md](session_handover_2026_05_30_mg_realdata_verification.md)

---

## 0. HOW TO USE THIS DOC (read this first, 60 seconds)

You are continuing a long, multi-run debugging-then-design arc on Editron's **Motion Graphics (MG) engine** in **Mode 2** (upload footage → AI edits). If you read only ONE paragraph, read this:

> **The MG *data/signal* pipeline is now CORRECT** — after 4 real pipeline runs + 8 commits, graphics now (a) render at all, (b) react to per-moment signals that genuinely vary across the video. **The MG *design/render* layer is now the bottleneck** — the user looked at rendered screenshots and the graphics are **too big (no scale hierarchy), text overflows/breaks mid-word (no title-safe / text-fit), they all look the same, and they're all "keyword-highlight"** (1 of ~18 MG types). That is the next mountain, and it is **Phase G** (the SaaS Motion-Graphics engine), not a bug fix.

**The single most important behavioral rule for this arc** (the user said it ~8 times):
> **NO presets. NO templates. NO hardcoded choreography.** Signals drive everything. "you cant put everyone's needs in a box, its creativity, unbounded." If you catch yourself writing `LowerThird.tsx` or a frame-number animation table, STOP — that's Rule 11 (Motion Graphics is a full domain) and you're violating the thesis.

**Quality bar the user enforces every session:** don't rush, follow ALL rules, quality > speed, deep investigation, **verify with real run logs + real MongoDB data, not claims** (Rule 34), **logs first** (Rule 27), Evidence Block per code edit, **never** report "works" from an import check.

---

## 1. EXECUTIVE SUMMARY (CEO lens — what shipped, what it's worth, ship-state)

**What we set out to do:** Verify the MG Tier-3 engine produces good, varied motion graphics in a *real* Mode-2 run (the #1 owed item: "end-to-end real render not yet verified").

**What actually happened:** The first real run produced **0 graphics**. Peeling that revealed a 4-layer "monotony onion" — each fix exposed the next failure. We peeled all 4 layers. **The signal pipeline is fixed.** Then the user's screenshots revealed the *design* layer is bad — which is a fundamentally different (and bigger) problem.

**Business framing:**
- **The moat is real but unexpressed.** Path D/E + per-moment signals (V-JEPA visual significance, Wav2Vec prosody, Essentia music) are now flowing correctly into graphics decisions. No competitor wires per-moment multi-modal signals into motion-graphics choreography. **But the user can't *see* the moat** because the render layer makes every graphic look like the same oversized gold keyword card. **We have a Ferrari engine bolted to a tricycle body.**
- **Ship-state: NOT shippable as a "wow" feature.** Graphics render without crashing (table-stakes), but they are visually amateur (oversize, broken text, monotonous, one-type-only). A user would not pay for these. The honest CEO read: **we fixed the plumbing; the product is still pre-launch on MG.**
- **The value of this session** = we eliminated 4 invisible data-layer bugs that would have made ANY design work look broken (you can't judge design when graphics are averaged to a constant). The design layer can now be built on a correct foundation. That's necessary, not sufficient.

**One-line status:** *MG signal pipeline VERIFIED-WORKING on real data; MG visual design is the new P0 and needs a real Phase-G plan, not a patch.*

---

## 2. WHERE WE ARE — the MG journey in one picture

```
Tier 1 (Canva)         Tier 2                    Tier 3 (where we are)         Phase G (where we're going)
named components   →   signal-gated presets  →   signal-driven vocabulary  →   craft-grade MG system
LowerThird.tsx         "if energetic: preset5"    structural moves +            scale hierarchy, text-fit,
                                                  rank-and-cap, duck-typing      18 MG types, kinetic typo,
                                                  ✅ DATA LAYER CORRECT          audio-synced, restraint
                                                  ❌ DESIGN LAYER AMATEUR        ← THE WORK STARTS HERE
```

We finished proving Tier 3's **data** path. The user's screenshots proved Tier 3's **design** path is still effectively Tier 1 *visually* (everything looks like one template) even though *architecturally* it's signal-driven. **The gap is craft, not wiring.**

---

## 3. THE SESSION ARC — what we did, in order (the "monotony onion")

This is the narrative the next session needs to not re-walk. Four real pipeline runs, each on the same Vlog-Brothers-style upload, each revealing one layer:

| Run | Project ID | Result | Root cause found | Fix |
|---|---|---|---|---|
| 1 | `proj_XbI_NCq181A2` | **0 graphics** | `graphicsDensity` ReferenceError at edl-executor.ts:1092 — undefined var threw, killing 100% of graphics silently | Thread `graphicsDensity` param through `executeEDL→applyDecision→applyGraphic` (commit `5021666b`) |
| 2 | `proj_l5q1RKJNgiYF` | 17 graphics, **monotonous** | V-JEPA aborted mid-run (QStash redelivered the long TRIBE worker → double-fire → corruption); per-moment visual signals missing | QStash `Upstash-Timeout` + idempotency guard (`b83832c1`→`14f9a0a1`, `ceb6ae8f`) |
| 3 | `proj_-BouQMiMnZf3` | 25 graphics, **still monotonous** | Director assigned ONE flat `signalCtx` (video-level average) to *every* decision; Wav2Vec also aborted | Per-frame `signalsAtFrame()` injection (`8017a70a`) |
| 4 | `proj_OzG2qgoYudFa` | **13 graphics, signals VARY** ✅ | Monotony FIXED at data level: 4/4 per-moment signals vary, 5–8 distinct values, complexity 2/5↔4/5, elements 3↔6 | — (this run was the verification) |

**Then:** user posts 5 screenshots → graphics are **too big, text broken, all look the same, all keyword-highlight, not wowing**. → We pivoted from debugging to **researching the craft of motion graphics** (web/papers/technical) → synthesized a redesign direction → **this handover**.

**Critical nuance the next session must hold:** Run 4 fixed the *signals feeding the decision*. It did NOT fix *what the decision renders*. The screenshots are from a run with correct signals and bad design. **Do not "re-fix" the signal pipeline — it works. Fix the design.**

---

## 4. COMMIT LEDGER (git-verified — `git log 25371c4d..HEAD`)

All 8 pushed to `infrastructure-improvs-+Editron`. Listed oldest→newest (execution order):

1. **`5d2e1223`** `fix(editron): MG backdrop opacity — surfaceOpacity is under color, not surface`
   *2 files, +9/-4.* `structural-moves.ts` `moveBackdropCard` bound `opacity: 'token:surface.surfaceOpacity'` — **wrong namespace**; MotionTokens has it under `color`. Backdrop silently emitted invalid `rgba(11,11,10,)` (empty alpha) → most-fired structural move painted nothing. Also fixed `structural-gate.ts` (`tokens.surface.surfaceOpacity`→`tokens.color.surfaceOpacity`) + removed unused `RecipeElement` import. **112 MG tests pass.**

2. **`4eb80496`** `fix(editron): MG numeric stat rendering — fractions/suffixed values + legible labels`
   *2 files, +39/-5.* `content-shape-analyzer.ts`: broadened `hasNumericValue` + added exported `isCountUpValue` — recognizes fractions ("1/3"), ratios, magnitude-suffixed ("100M","10x"). These previously rendered **BLANK** (charset rejected `/`). `composition-planner.ts`: `animation: isCountUpValue(shape.value) ? 'count-up' : 'none'` (fractions render static, not as a broken count-up), label `minSize` CRG-floored, quotation author `minSize`. **User-approved + pushed.**

3. **`93ea08cb`** `chore(editron): remove dead code in composition-planner (unused import + params)`
   *1 file, +2/-3.* Step-0 cleanup (the "remove dead code before structural work" rule).

4. **`5021666b`** `fix(editron): MG 0-graphics — thread graphicsDensity through the EDL graphic path` **← THE P0**
   *1 file, +5/-3.* `edl-executor.ts`: `graphicsDensity?: 'heavy'|'moderate'|'minimal'` threaded `executeEDL`→`applyDecision` (:412 sig, :352 call)→`applyGraphic` (:1010 sig, :439/:470 calls). Was a `ReferenceError` at :1092 → **100% of graphics killed**. This is why Run 1 had 0 graphics.

5. **`b83832c1`** `fix(editron): TRIBE worker double-fire — set QStash Upstash-Timeout to match 8min runtime` **← I BROKE IT HERE**
   *1 file, +7.* Set `'Upstash-Timeout': '800'` on the TRIBE dispatch. **BUG: bare `'800'` — QStash parses Go-duration, needs a unit → HTTP 400 "missing unit in duration '800'". I shipped a broken header and the user caught it.**

6. **`14f9a0a1`** `fix(editron): QStash Upstash-Timeout needs a unit — '800'->'800s', '300'->'300s' (HTTP 400)` **← THE FIX FOR #5**
   *2 files, +6/-2.* `video-analysis/route.ts` `'800'`→`'800s'`; also caught sibling bug in `media/upload/route.ts` `'300'`→`'300s'`. **Lesson codified: verify value FORMAT, not just magnitude.**

7. **`8017a70a`** `fix(editron): MG monotony — inject per-frame signals into Path-E decisions (not a flat average)` **← THE MONOTONY FIX**
   *1 file, +28/-1.* `director-agent.ts:607-638`. Replaced flat `signalCtx` (one video-level average on every decision) with per-frame `signalsAtFrame(frameNum)` that looks up the V-JEPA segment + Wav2Vec segment at each decision's timestamp and injects motion/significance/arousal/enthusiasm. (Code in §7.)

8. **`ceb6ae8f`** `fix(editron): TRIBE idempotency guard — duplicate QStash delivery bails instead of double-running GPU`
   *1 file, +25.* `tribe-analysis/route.ts:~52`. Atomic claim: `TRIBE_LOCK_STALE_MS=15min`; `updateOne({projectId, $or:[no-lock/null/stale]}, {$set:{tribeLockAt:new Date()}})`; `if (claim.matchedCount===0) return {success:true, skipped:'duplicate-delivery'}`. Stops QStash at-least-once redelivery from double-running the GPU worker (the corruption source in Runs 2-3).

**Pre-session baseline:** `25371c4d` (gitignore hardening) / `4fbac832` (gradient text). These are from the *morning* session, already in the predecessor handover.

---

## 5. BUGS FOUND + FIXED (with root cause — so they're not re-debugged)

| # | Symptom | Root cause | Why it was invisible | Fixed in |
|---|---|---|---|---|
| B1 | Backdrop card paints nothing | `token:surface.surfaceOpacity` — wrong namespace, resolves `undefined` → `rgba(11,11,10,)` | Invalid CSS fails *silently*; no throw, no log | `5d2e1223` |
| B2 | Numeric stat "1/3", "100M", "10x" render BLANK | `hasNumericValue` charset rejected `/` and suffixes; count-up animator can't tween a fraction | Looked like "no graphic" not "broken graphic" | `4eb80496` |
| B3 | Labels/authors render too small to read (~16px) | no `minSize` floor on label/author text | Subjective; only caught on real render | `4eb80496` |
| B4 | **0 graphics, whole run** | `graphicsDensity` referenced but never threaded into `applyGraphic` scope → `ReferenceError` at :1092 | `try/catch` around graphic application swallowed the throw | `5021666b` |
| B5 | **I introduced:** TRIBE dispatch HTTP 400 | `Upstash-Timeout:'800'` missing Go-duration unit | Only failed at QStash publish; I verified magnitude (800≈8min) not FORMAT | `14f9a0a1` |
| B6 | TRIBE worker double-fires → V-JEPA/Wav2Vec corruption → monotony | QStash at-least-once redelivery of an 8-min worker with no timeout header + no idempotency | Looked like "signals missing" not "worker ran twice" | `b83832c1`+`14f9a0a1`+`ceb6ae8f` |
| B7 | **Monotony:** every graphic identical despite varied content | Director assigned one flat video-level `signalCtx` to all decisions | Signals *present* but *constant*; easy to miss without per-MG variation check | `8017a70a` |

**The meta-lesson across B1/B2/B4:** the MG pipeline **fails silent** — invalid CSS, blank values, and swallowed throws all produce "no/blank graphic" with no error. **Add fail-loud validation** (see §13 backlog).

---

## 6. BUGS / ISSUES STILL OPEN (the honest list — nothing hidden)

### 6A. The NEW P0 — MG visual design (from the screenshots)
1. **Oversize / no scale hierarchy** — graphics fill ~30-40% of frame; every word gets the "biggest boldest" treatment so nothing has visual weight. (Research §12: hierarchy via scale is law #1.)
2. **Text overflow / breaks mid-word** — "D-BAG" runs off the right edge; "SUPERHER/O" wraps mid-word. No title-safe (inner 80%) clamp, no text-fit. The 64px global floor + fixed `minSize` ignore container width.
3. **Monotonous *look*** — even with signals now varying, the *treatment* is identical (gold uppercase word + dark card + underline) every time. Variety must reach the render, not just the data.
4. **All keyword-highlight** — the engine collapses ~18 MG types into one. Violates Rule 11. A static word on a card is not "wowing."
5. **Captions UI** — user finds default caption styling not great on video (subjective, user flagged as a "later thing").

### 6B. Data/pipeline (lower priority now, but real)
6. **V-JEPA / Wav2Vec all-or-nothing discard** — services return `null` on ANY batch failure (`vjepa-service.ts:189-194`, `wav2vec-service.ts:170-172`). **"keep-half" partial-results fix deferred.** The user explicitly asked "if we fix the crash entirely we won't need keep-half right?" — answer: the idempotency guard (`ceb6ae8f`) fixes the *double-fire* crash, but a *single* batch failure still discards everything. Keep-half is still worth doing for resilience.
7. **Per-moment signals were ABSENT on older real data** — `cinematic_moment` ABSENT everywhere historically; only 13/35 signals populated (prior handover finding). Run 4 confirmed the *current* pipeline DOES populate the V-JEPA/Wav2Vec per-moment signals now — **but confirm on a FRESH ingest** that this holds (true Level-4 check).
8. **`transitions: 0`** in the latest run — no transitions were placed. Investigate whether that's correct for the content or another silent gate.
9. **Meta-commentary left in transcript** — user noticed; said "idts we can really work on that." Low priority.

### 6C. Infra / warnings (housekeeping)
10. Clerk middleware auth warning in logs.
11. Compressor bundle 91MB > 90MB warning.
12. `graphicsDensity` is currently a 3-bucket string (`heavy/moderate/minimal`) — the user asked "isn't the density fix a preset?" **Answer given: it's a computed budget from `entity_rate + formality`, not a preset — but the bucket boundaries are INVENTED thresholds (see §15).** Long-term it should be an overlay score, per [project_mg_overlay_architecture.md](project_mg_overlay_architecture.md).

---

## 7. ARCHITECTURE MAP (as-built, post-session — file:line)

### 7A. The signal → graphic pipeline (the moat)
```
UPLOAD ──> video-analysis worker ──QStash──> TRIBE worker (Modal GPU)
                                              ├─ V-JEPA  → per-segment {motionIntensity, visualSignificance}
                                              ├─ Wav2Vec → per-segment {emotionIntensity, energy}
                                              └─ Essentia → music/beats
                                                     │
                                                     ▼ (written to project.tribeSignals / segments)
Director Agent (Path E / creative-brief) ──> EDL decisions
   │  director-agent.ts:607-638  signalsAtFrame(frame):
   │     timeMs = frame/fps*1000
   │     v = vjepaSegs.find(s => timeMs in [startMs,endMs))  → visual_change_rate, visual_significance, visceral_impact
   │     w = w2vSegs.find(...)                               → emotional_arousal, enthusiasm
   │     ⇒ d.params.signals = signalsAtFrame(d.frame)   // PER-FRAME, not flat average
   ▼
EDL Executor (edl-executor.ts)
   executeEDL(graphicsDensity) → applyDecision(graphicsDensity) → applyGraphic(graphicsDensity)   // :412/:352/:1010
   ▼
applyGraphic ──> planComposition (composition-planner.ts)
   ├─ content-shape-analyzer.ts  → classify shape (numeric/quotation/keyword/structured...), computeComplexityBudget
   ├─ runStructuralMoves (structural-moves.ts)  → 10-move vocabulary, rank-and-cap selection (fixes over-decoration)
   ├─ structural-gate.ts  → validate recipe elements against MotionTokens
   └─ property-resolver + primitive-renderers (buildTextStyle/buildShapeStyle)
   ▼
recipe (composable elements) ──> composition-renderer.ts ──> Remotion render
```

### 7B. The per-frame signal injection (commit `8017a70a`, the monotony fix) — exact code
```js
// director-agent.ts ~607-638
const signalsAtFrame = (frameNum: number): Record<string, number> => {
  const timeMs = (frameNum / pathEFps) * 1000;            // pathEFps confirmed in scope :366
  const out: Record<string, number> = { ...signalCtx };   // start from video-level, then override per-moment
  if (vjepaSegs?.length) {                                 // vjepaSegs :479
    const v = vjepaSegs.find((s: any) => timeMs >= s.startMs && timeMs < s.endMs);
    if (v) {
      out.visual_change_rate  = v.motionIntensity     ?? out.visual_change_rate;
      out.visual_significance = v.visualSignificance  ?? 0;
      out.visceral_impact     = Math.max(out.visceral_impact, v.visualSignificance ?? 0);
    }
  }
  if (w2vSegs?.length) {                                   // w2vSegs :560
    const w = w2vSegs.find((s: any) => timeMs >= s.startMs && timeMs < s.endMs);
    if (w) {
      out.emotional_arousal = w.emotionIntensity ?? out.emotional_arousal;
      out.enthusiasm        = Math.min(1, (w.energy ?? 0) * 1.2);
    }
  }
  return out;
};
for (const d of briefResult.edl.decisions) {
  if (!d.params.signals) { d.params.signals = signalsAtFrame(d.frame); }
}
```
**Why this is the right design (not a preset):** it READS multi-modal signals at the decision's timestamp and lets them flow to the existing scoring. It doesn't decide anything — the downstream planner still does. Aligns with [project_mg_overlay_architecture.md](project_mg_overlay_architecture.md) (composition planner reads scores, doesn't decide).

### 7C. The worker reliability fix (QStash)
- **Problem:** QStash = at-least-once delivery. An 8-min GPU worker with no `Upstash-Timeout` → QStash assumes failure, redelivers → two GPU runs race → corrupt/partial signals.
- **Fix:** `Upstash-Timeout: '800s'` (Go-duration, MUST have unit) on dispatch + atomic idempotency claim in the worker (`ceb6ae8f`). Belt + suspenders.

---

## 8. KEY ROOT-CAUSE CHAIN (the "why" behind the whole session)

```
Why were graphics monotonous/absent?
└─ Run1: 0 graphics ─────────── graphicsDensity ReferenceError (silent throw)         → 5021666b
└─ Run2: 17 monotonous ──────── V-JEPA aborted (QStash double-fire, no timeout)       → b83832c1/14f9a0a1
└─ Run3: 25 monotonous ──────── (a) Wav2Vec aborted (same double-fire)                → ceb6ae8f (guard)
                                 (b) signals averaged flat across all decisions        → 8017a70a (per-frame)
└─ Run4: 13, signals VARY ───── DATA LAYER CORRECT ✅
└─ Screenshots: still bad ────── DESIGN LAYER amateur (oversize/overflow/mono/1-type)  → Phase G (next)
```
**The insight:** 3 of the 4 "monotony" causes were *infrastructure* (silent throw, worker double-fire ×2), 1 was *design of the data flow* (flat averaging). The 5th and now-dominant cause is *visual craft*. **You cannot see or fix design problems while the data is averaged to a constant** — which is why all 4 data fixes had to land first. They were prerequisites, not detours.

---

## 9. TECHNIQUES / METHODS THAT WORKED (reuse these — they saved the session)

These are the diagnostic "ways" that cracked it. The next session should reach for these first.

1. **Logs-first, chronological reconstruction (Rule 27).** The Vercel CSV exports ARE ground truth. Built `scripts/read-logs.ts` (RFC-4180 CSV parser → `time [level] (fn) message` ascending) — turns a 500-line CSV into a readable pipeline narrative + function-by-message-count histogram. **Always run this before theorizing.**
2. **Real-data MongoDB inspection, not unit tests.** The morning lesson ("unit tests inject mgScores → masked miscalibration") held all session. Every claim was checked against `editron_prev` real project docs via throwaway scripts.
3. **Per-MG signal-variation check** (`scripts/check-mg-signals.ts`) — the single most valuable diagnostic. For each signal key, counts DISTINCT values across all graphics in a project, flags per-moment signals that are CONSTANT (= monotony) vs VARYING (= fixed). **This is how we proved Run 4 actually fixed monotony** (4/4 per-moment signals varying) rather than claiming it.
4. **Render-correctness check, not just "has a graphic."** Checked the resolved recipe elements would paint valid CSS (caught the `rgba(11,11,10,)` backdrop + blank fractions). "Has an overlay row in Mongo" ≠ "renders something visible."
5. **Onion discipline** — fix ONE layer, re-run REAL pipeline, re-inspect, only then go deeper. Resisted the urge to fix 4 things at once. Each run isolated exactly one cause.
6. **Format-vs-magnitude verification** (learned the hard way via B5) — for any value crossing a system boundary (HTTP header, API param), verify it's the right *shape*, not just the right *number*.

**Helper scripts created this session (all untracked, read-only, in `scripts/`):**
| Script | Purpose | Notes |
|---|---|---|
| `read-logs.ts` | CSV log export → chronological text + fn histogram | args: `<input.csv> [output.txt]` |
| `check-mg-signals.ts` | per-MG signal variation (monotony detector) | arg: `<projectId>`, defaults to proj_-Bou |
| `check-proj-overlays.ts` | dump all overlays for a project | arg: `<projectId>` |
| `check-proj-deep.ts` | deep project inspection (signals, decisions, errors) | arg: `<projectId>` |
| `mg-probe.ts`, `verify-mg-real.ts`, `mg-signal-coverage.ts`, `render-mg-real.ts` | morning-session MG harnesses | real scorer + resolveElements render check |

> ⚠️ **SECURITY:** these scripts hardcode the MongoDB URI. They are **untracked and must stay untracked** (`.env.local.*` and these helpers are gitignored). **Never `git add -A`.** Never commit/expose the URI.

---

## 10. LEARNINGS / LESSONS (process — codified so they're not re-learned)

Added to `D:\Insturix-Brain\02-Architecture\Rules-and-Constraints.md` this session:

1. **"Don't edit code during a verification / get-to-know sprint."** The user: *"no you shouldn't have been editing in verification or like get to know sprint."* When the task is "verify" or "understand," produce findings — don't start fixing mid-audit. If you find fixes, LIST them, then get approval, then fix in a dedicated pass.
2. **"Verify value FORMAT, not just magnitude."** Born from B5 (the `'800'` vs `'800s'` HTTP 400 I shipped). A value can be the right number and the wrong shape.
3. **The pipeline fails SILENT** (B1/B2/B4) — invalid CSS, blank values, swallowed throws. Treat "no graphic" as "possibly a broken graphic," and add fail-loud validation.
4. **You can't judge design on averaged data.** All 4 data fixes were prerequisites to even *seeing* the design problem. Don't skip the boring data-correctness work to get to the fun design work.
5. **Screenshots > claims.** The user's 5 screenshots instantly revealed what no amount of "signals now vary ✅" could: the output still looks bad. **Always close the loop on the actual rendered pixels.**
6. **Honesty about ship-state.** Reporting "signals fixed ✅" was true but would have been *misleading* as "MG works" — because the user sees video, not signal variance. Report what the USER experiences.

---

## 11. THE REVIEWS — CEO + Senior-Dev lenses on the next step (the `/plan-*-review` framing)

The user asked for CEO + eng-review thinking. Applied to the **MG redesign (Phase G)** plan in §13:

### CEO lens (`/plan-ceo-review` — scope, ambition, moat, is-this-a-10-star-product)
- **Is this ambitious enough?** Fixing sizing/text-fit alone = table stakes (it just stops looking *broken*). The 10-star version is the full Phase-G craft system (kinetic typography, data-viz, title sequences, audio-synced reveals). **Don't declare victory at "text fits."**
- **What's the moat?** The per-moment signal pipeline we just fixed. The CEO mandate: *make the moat visible.* Variety must be driven by the (now-working) signals — that's the defensible thing no template library can do. If the redesign hardcodes treatments, we've thrown away the moat to look prettier.
- **Sequencing risk:** the user oscillates between "fix the glaring stuff fast" and "do it right, never MVP." Resolve with: **quick visible win FIRST (sizing/text-fit — these are *correctness*, not MVP-shortcuts), THEN the real Phase-G plan.** Sizing/text-fit aren't an MVP of design — broken text is a *bug*. Fixing it isn't lowering the bar.
- **What would make the user say "wow"?** Not "the text fits now." It's seeing a stat animate as a real data-viz, a quote build as kinetic typography on the beat, a title sequence — *variety that obviously tracks the content*. Aim there.

### Senior-Dev lens (`/plan-eng-review` — architecture, blast radius, edge cases, failure modes)
- **Architecture:** the sizing/hierarchy fix belongs in `property-resolver` / `primitive-renderers` (`buildTextStyle`), NOT scattered. Replace the **64px global floor + fixed `minSize`** with a **fit-to-title-safe-box** model: measure text → scale to fit inner 80% width → never overflow, never break mid-word → enforce a scale *hierarchy* (one focal size, supporting sizes as ratios). One source of truth for sizing.
- **Edge cases that WILL break it:** very long words (no break point), CJK/emoji, all-caps wide glyphs ("D-BAG"), 9:16 vs 16:9 safe areas, multi-line phrases, numbers with suffixes. The fit algorithm must handle each. **Adversarially test (Rule 29) across ≥8 content types before shipping** — exactly the discipline that caught 106 false positives last time.
- **Blast radius:** `buildTextStyle`/`property-resolver` are called by every MG. Changing the size model touches 100% of graphics. 112 MG tests exist — they inject scores, so they'll PASS even if rendering is wrong (the morning lesson). **Verify with the REAL resolver + a real render, not the unit suite.**
- **Failure mode to design for:** fail-loud. If text can't fit even at min size, that's a signal to TRUNCATE or pick a different MG type — not to overflow silently.
- **Don't regress the signal work.** The render layer consumes `d.params.signals`; keep that contract. Variety = map signals→treatment, don't rebuild the signal layer.

---

## 12. RESEARCH — Motion Graphics craft (the user asked me to "read about MG from web, books, pdfs, github, researches")

Full research synthesis. **Save target:** `D:\Insturix-Brain\01-Research\Motion-Graphics-Craft.md` (offer to user; not yet written).

### The four laws every source repeats
1. **Hierarchy through scale.** Primary = biggest/boldest; supporting = smaller/subtler; fine print = simple fade. *Editron violates this — every word gets the loudest treatment, so nothing has weight.* ([ikagency — kinetic typography](https://www.ikagency.com/graphic-design-typography/kinetic-typography/), [Toptal — motion design principles](https://www.toptal.com/designers/ux/motion-design-principles))
2. **Restraint is the pro/amateur line.** "One well-timed scale animation beats ten simultaneous effects." *Editron has no scale restraint (fills 30-40% of frame) and graphics every keyword instead of the few that matter.* ([Draftss — 10 principles](https://draftss.com/10-key-principles-of-motion-design), [Mockplus — 20 principles](https://www.mockplus.com/blog/post/20-motion-design-principles-with-examples))
3. **Title-safe + text-fit.** Text in inner **80%** (title-safe), action in inner 90%; text MUST fit its box (`clamp()`/fit-text), never break mid-word. *Editron's "D-BAG" overflows, "SUPERHER/O" breaks mid-word — 64px floor ignores width.* ([eks.tv — title-safe still matters](https://eks.tv/title-safe-still-matters/), [CSS-Tricks — fitting text to a container](https://css-tricks.com/fitting-text-to-a-container/))
4. **Variety through sequencing, not repetition.** Build in passes (background → supporting → primary); alternate fast/slow; reveal don't pop. *Editron uses one identical treatment.* ([Moonb — 18 types of motion graphics](https://www.moonb.io/blog/types-of-motion-graphics), [Wikipedia — kinetic typography](https://en.wikipedia.org/wiki/Kinetic_typography))

### The domain is ~18 types — Editron does 1
Kinetic typography, **title sequences**, **animated data-viz / infographics**, lower thirds, logo stings, animated titles, transitions, flat-design promos, product showcases, broadcast packages… Editron collapses all into "keyword-highlight" = the Tier-1 reduction **Rule 11 explicitly forbids**. ([Moonb — 18 types](https://www.moonb.io/blog/types-of-motion-graphics))

### Technical (how to build it right)
- **Remotion `spring()` physics** for natural easing (not linear frame tables). Choreography = COMPUTED from tokens (stagger × enterOrder × easing), per Rule 11 — never hardcoded frame numbers.
- **Text-fit:** measure-then-scale (binary search font-size to fit box) or CSS `clamp()`/container queries.
- **Audio sync:** land reveals on beats — Essentia beats + word timings already exist in the pipeline. "Syncing motion to audio multiplies impact."
- Real kinetic typography *reveals* (typewriter, mask-wipe, scale-pop, morph) and builds *phrases*, not single popped words.

### How each researched principle maps to a screenshot defect
| Screenshot defect | Violated principle | Fix direction |
|---|---|---|
| Graphics too big | Hierarchy via scale (#1) | scale hierarchy: one focal size, supporting as ratios |
| "D-BAG" off-screen, "SUPERHER/O" mid-word | Title-safe + text-fit (#3) | fit-to-title-safe-box, never break mid-word |
| All look the same | Variety via sequencing (#4) | map now-working signals → distinct treatments + reveals |
| All keyword-highlight | Domain breadth / Rule 11 | promote numerics→data-viz, phrases→kinetic build, add title/lower-third done well |
| Not wowing | Restraint (#2) + reveals | fewer/better graphics; reveal animations + audio sync |

---

## 13. WHAT'S NEXT — the MG redesign plan (Phase G), prioritized

> This is the real Phase-G work. It is **multi-session**. Do NOT one-shot it. Each phase ends with a REAL render verification (not unit tests). **Get user approval before each code phase** (user enforces phased execution, ≤5 files/phase).

### Phase G-1 — Sizing, hierarchy, text-fit (THE QUICK VISIBLE WIN — do first)
*Fixes "too big" + "broken text" — the two most glaring, most contained, lowest-risk.*
- Replace 64px global floor + fixed `minSize` with **fit-to-title-safe-box** (measure → scale to inner 80% width → never overflow/break-mid-word).
- Introduce **scale hierarchy**: one focal size per graphic, supporting text as ratios (e.g. 0.5×, 0.35×).
- Enforce title-safe (inner 80%) + action-safe (inner 90%); handle 9:16 vs 16:9.
- **Files (est.):** `property-resolver`, `primitive-renderers` (`buildTextStyle`), maybe `composition-planner`. ≤5 files.
- **Verify:** REAL resolver + real render of the same Vlog clip; eyeball the screenshots that were broken ("D-BAG", "SUPERHERO"). Adversarial test ≥8 content types (long words, CJK, all-caps, multiline).

### Phase G-2 — Visual variety wired to the (now-working) signals
*Fixes "all look the same." This is where the moat becomes visible.*
- Map per-moment signals → **distinct treatments**: reveal animation (typewriter/mask/scale-pop/morph), layout, register, color emphasis — driven by `visual_significance`, `emotional_arousal`, `enthusiasm`, energy.
- Use `spring()` physics + the existing GSAP/keyframe engine. NO hardcoded frame tables.
- **Verify:** `check-mg-signals.ts` already proves signals vary; now prove the *render* varies (visual diff across graphics).

### Phase G-3 — Beyond keyword-highlight (domain breadth, Rule 11)
*Fixes "all keyword highlights" + "not wowing."*
- Promote richer shapes already detected by `content-shape-analyzer`: numerics → animated **data-viz / stat reveal**; quotations → **kinetic-typography build**; structured → clean **title card / lower-third done well**.
- Add restraint: DON'T graphic every keyword — rank-and-cap is already there; tune it down. Fewer, better, more varied.
- Possibly add 1-2 genuinely new types (title-sequence treatment, animated stat).

### Phase G-4 — Audio sync + polish
- Land reveals on Essentia beats + word timings (already in pipeline).
- Captions UI restyle (user-flagged, subjective, later).

### Parallel / smaller debt (can interleave)
- **Keep-half partial results** in `vjepa-service.ts` / `wav2vec-service.ts` (resilience — single batch failure shouldn't discard all).
- Investigate **`transitions: 0`** (silent gate?).
- Confirm fresh-ingest populates per-moment signals (Level-4).
- `graphicsDensity` buckets → overlay score (kill the last preset-ish thing).

---

## 14. OPEN BACKLOG / DEFERRED (full list — nothing dropped)

| Item | Priority | Notes |
|---|---|---|
| MG redesign Phase G-1..G-4 | **P0** | §13 |
| Keep-half partial results (vjepa/wav2vec all-or-nothing) | P1 | user asked; idempotency guard fixes double-fire but not single-batch-fail |
| Confirm fresh-ingest populates per-moment signals | P1 | true Level-4 verification |
| `transitions: 0` investigation | P2 | latest run placed none |
| `graphicsDensity` buckets → overlay score | P2 | last preset-ish piece; [project_mg_overlay_architecture.md] |
| Fail-loud validation for silent MG failures (B1/B2/B4 class) | P2 | invalid CSS / blank value / swallowed throw |
| Captions UI restyle | P3 | user-flagged, subjective |
| Meta-commentary in transcript | P3 | user: "idts we can really work on that" |
| Clerk middleware auth warning | P3 | infra noise |
| Compressor 91MB > 90MB | P3 | bundle size |
| Quote detection (needs CRG mapping + prosody) | deferred | from morning handover |
| Multi-step sequences (recursive timing) | deferred | from morning handover |

---

## 15. INVENTED THRESHOLDS REGISTRY (Rule 31 / E4 — values without a graph/doc source, flag for validation)

These are knobs introduced/touched this session that are **invented**, not graph-derived. Tune later:
- `TRIBE_LOCK_STALE_MS = 15 * 60 * 1000` ← worker max runtime ~8min + margin (domain estimate, ⚠️ INVENTED)
- `Upstash-Timeout: '800s'` ← ~8min worker + margin (⚠️ INVENTED, but format now correct)
- `Upstash-Timeout: '300s'` (media/upload) ← pre-existing, just unit-fixed
- `enthusiasm = min(1, energy * 1.2)` ← the 1.2 gain is ⚠️ INVENTED
- `graphicsDensity` bucket boundaries (heavy/moderate/minimal from entity_rate+formality) ← ⚠️ INVENTED, should become overlay score
- label/author `minSize` floors (commit `4eb80496`) ← CRG-floored where possible; confirm against creative-knowledge-graph constants
- 64px global text floor (EXISTING, to be REMOVED in G-1) ← the thing causing oversize/overflow

---

## 16. ENVIRONMENT / HOW TO RUN (so the next session is productive in 2 min)

- **Worktree (deploy branch):** `D:\google downloads\Front-End-main\editron-worktree\` → `infrastructure-improvs-+Editron`
- **DB:** `editron_prev` (Vercel preview). NOT `insturix_preview`, NOT `editron_prod`.
- **Run a diagnostic script:** `npx tsx scripts/check-mg-signals.ts <projectId>` (from the worktree). Most are `npx tsx scripts/<name>.ts <projectId>`.
- **Parse a log export:** `npx tsx scripts/read-logs.ts "<path-to-csv>" [out.txt]` → writes `.calibration-temp/logs-parsed.txt`.
- **Type-check (CLAUDE.md rule 4 — FORCED VERIFICATION):** `npx tsc --noEmit` before claiming done.
- **MG tests:** the 112-test MG suite (passes — but injects scores, so does NOT prove rendering; verify with real render).
- **Test project IDs (real runs this session, in `editron_prev`):** `proj_XbI_NCq181A2` (0 MGs), `proj_l5q1RKJNgiYF` (17), `proj_-BouQMiMnZf3` (25), `proj_OzG2qgoYudFa` (13, signals vary — the GOOD data run). Use these to inspect/compare.
- **Test asset:** same Vlog-Brothers-style upload the user reuses each run.
- **DO NOT:** `git add -A` (secrets + untracked URI scripts); trigger prod deploys (Rule 24N — this branch push is deploy-safe, confirmed); edit code during a verify/get-to-know sprint.

---

## 17. MUST-READ DOCS (the reading list, in order — what I wish I'd had at minute one)

1. **This doc** (you're in it).
2. [session_handover_2026_05_30_mg_realdata_verification.md](session_handover_2026_05_30_mg_realdata_verification.md) — the morning predecessor (real-data MG Tier-3 verification, the calibration findings, the "unit tests masked miscalibration" lesson).
3. [session_handover_2026_05_30_mg_tier3.md](session_handover_2026_05_30_mg_tier3.md) — the MG Tier-3 build sprint (NO presets thesis, structural-moves, rank-and-cap, duck-typing).
4. **Rule 11** (CLAUDE.md, Front-End) — Motion Graphics is a full domain. The thesis. Re-read before ANY MG code.
5. [project_mg_overlay_architecture.md](project_mg_overlay_architecture.md) — MG visual properties use the overlay→signal infra; planner READS scores, doesn't decide. The G-2/G-3 architecture.
6. [phase_f_g_saas_motion.md](phase_f_g_saas_motion.md) — **Phase G spec** (the SaaS Motion-Graphics engine). The redesign IS this.
7. **Creative Knowledge Graph** — `lib/editron/data/creative-knowledge-graph.json` (671 nodes). QUERY before any creative/threshold decision (E1).
8. [AGENT_RULES.md](AGENT_RULES.md) — Rule 17N, 18N, 19N, 23N (never MVP), 27 (logs first), 29 (adversarial), 33, 34, 35.
9. [project_graphiti_signal_bridge.md](project_graphiti_signal_bridge.md) — brand prefs as signal overrides (dormant; relevant to G-2 variety).
10. `D:\Insturix-Brain\02-Architecture\Rules-and-Constraints.md` — the 2 new process rules from this session.
11. `D:\Insturix-Brain\00-Index.md` — vault entry point (read every session start).

---

## 18. THE ONE-PARAGRAPH RESUME (if you read nothing else)

The MG **signal/data pipeline is fixed and verified on real data** (8 commits: 0-graphics ReferenceError, QStash double-fire ×2 reliability, flat-signal-averaging monotony, backdrop/numeric/label render bugs). Graphics now react to per-moment V-JEPA/Wav2Vec signals that genuinely vary across the video (proved via `check-mg-signals.ts`: 4/4 per-moment signals varying on `proj_OzG2qgoYudFa`). **But the rendered output is still bad** — the user's screenshots show oversized graphics (no scale hierarchy), text that overflows/breaks mid-word (no title-safe/text-fit), a monotonous identical look, and only "keyword-highlight" (1 of ~18 MG types, violating Rule 11). The next work is **Phase G — the MG craft/render redesign**, starting with **G-1 (sizing/hierarchy/text-fit — the quick visible win)**, grounded in researched principles (hierarchy-via-scale, restraint, title-safe/text-fit, domain breadth, audio-synced reveals via Remotion `spring()`). **Do NOT re-fix the signal pipeline — it works. Fix the design.** Get user approval before each code phase; verify with REAL renders, not the 112-test unit suite (it injects scores and masks render bugs).
