---
tags: [session, handover, motion-graphics, eval, calibration, signals, source-of-truth, decided]
date: 2026-06-03
covers: 2026-06-03 (eval-library build sprint, follows Session-2026-06-03-MG-Calibration-DeepMap)
branch: infrastructure-improvs-+Editron
commit: ef1a60dd (eval library)
status: HANDOVER — read this FIRST next session
---

# ★ HANDOVER — MG Eval Library Build + Signal Source-of-Truth — 2026-06-03

> **If you read ONE thing:** we built the **deterministic core of the automated MG quality eval** (L1 legibility, L2 correctness, L4 aesthetic-variety, + the composite spine) — all verified by behavior self-tests, committed `ef1a60dd`, but **NOT wired into production** (consumed only by offline runners). Then a 5-agent signal investigation produced the **[[Editron-Signals-Source-of-Truth]]** and found the **ROOT CAUSE of MG monotony: the 43 MG dials read the 8 personality GLOBALS (near-constant per video), not the per-moment signals that vary.** That single fact is the lead for the generative-form work.

---

## 0. TL;DR — where we are, what's next
- **Built + committed (`ef1a60dd`):** the eval library `lib/editron/motion-graphics/engine/eval/` — `composite.ts`, `legibility.ts` (L1), `correctness.ts` (L2), `aesthetic.ts` (L4). Pure, deterministic, self-tested. **Not production-wired.**
- **Eval status:** L1 ✅ · L2 ✅ (code; needs founder labels to grade the real video) · L4 ✅ (variety v1; catches monotony on real data) · **L3 ❌ not built** (needs render + VLM round-trip).
- **The one root-cause finding:** MG dials feed off personality globals → near-constant styling → monotony. Fix-direction = feed the dials **per-moment** signals. (§7.)
- **Immediate next:** (a) get founder's L2 labels (auto-draft from transcript → founder verifies) → L2 scores the real 13; (b) build L3; (c) the generative-form work (feed dials per-moment signals) + brand-vault expansion. Sequence still **form → curves → calibration**.
- **Do NOT:** wire the eval to the broken bandit; tune today's template-dials; trust the agents' inferred numbers without the 2× re-count (§8).

---

## 1. North star + locked decisions (carry-forward — do NOT relitigate)
North star (unchanged): signals **MAKE** an MG from primitives bounded by legibility LAWS ("anything as an MG"); priority = footage editing (Mode 2). The 8 composers + dial-blind `analyzeContentShape` are templates to DISSOLVE; **the FORM is the production lever.** Sequence: **form → curves → calibration** (you calibrate something that exists).

| # | Decision (this session) | Status |
|---|---|---|
| D1 | Eval + tuning are **AUTOMATED**; human review is an OPTION, not the gate (overrides earlier "human ground-truth mandatory") | LOCKED |
| D2 | Layer 4 (taste) = automated proxy **+ optional periodic human weight-calibration** | LOCKED |
| D3 | Founder labels a fixed test set ONCE (but auto-drafted from transcript → founder verifies, not hand-typed) | LOCKED |
| D4 | Weights = **laws fixed, taste brand/video-dependent** — but LEARNED/calibrated, not hand-set; gated on the brand-signal expansion | LOCKED |
| (carry) | Build **B** (open extractor + generative form, no menu); composers kept as fallback | LOCKED (prior) |

---

## 2. What was built (the eval = the automated JUDGE)
The eval scores an MG as a continuous composite ∈ [0,1] of 4 layers. Built the deterministic 3 (L1/L2/L4) + the spine; L3 deferred.

| File (committed `ef1a60dd`) | Layer | What it does | Verified |
|---|---|---|---|
| `eval/composite.ts` | spine | combines layer scores; **E1** invalid-render→null (never 0), **E2** null-layer renormalize→`degraded`, legibility floor, **E3** ground-truth-source tag | self-test 15/15 |
| `eval/legibility.ts` | L1 | wraps `structural-gate` → [0,1]; **forwards frameContext** to revive the dead footage-contrast check | self-test 12/12 |
| `eval/correctness.ts` | L2 | value-match + form-family-match vs ground truth (the deterministic "is it right" anchor). Colour-semantics + negation DEFERRED (today's form can't encode them) | self-test 8/8 vs REAL composer output |
| `eval/aesthetic.ts` | L4 | variety / anti-monotony v1 (penalize repeated form/position in a window). Distributional-match + motion-congruence DEFERRED | self-test 7/7 + real-13 monotony demo |

**Composite weights** (`composite.ts`, all ⚠️INVENTED, calibration targets): legibility 0.30, correctness 0.40 (highest = the anchor), communication 0.15, aesthetic 0.15. Legibility floor 0.6.

**Honest scope:** the eval runs on real DATA (real recipes) but is still **L1-recipe + L2(if labeled) + L4 only**, NOT real pixels except via the pixel-path runner. It does NOT yet grade a real graphic end-to-end with all layers. It catches: illegibility (L1), wrong value/form (L2), monotony (L4). It does NOT catch: the blank callout (only L2-value does, needs labels), communication failures (L3 not built).

---

## 3. Artifacts (code + untracked runners + vault docs)
**Tracked code (committed `ef1a60dd`):** the 4 `eval/*.ts` files above.
**UNTRACKED runners/tooling (in `scripts/` — do NOT `git add`, the dir holds Mongo-URI scripts):**
- `eval-composite-selftest.ts`, `eval-legibility-selftest.ts`, `eval-correctness-selftest.ts`, `eval-aesthetic-selftest.ts` — behavior gates (each known-bad case must trip; against REAL `planComposition` where relevant).
- `eval-real.ts` — runs L1+L4 over the dumped real MGs → per-MG scores + composite (no Mongo; reads the dump).
- `eval-pixel.ts` — measures a real frame's brightness via **sharp** → feeds L1 footage-contrast (the "pixel path").
- `mg-eval.ts` — EDITED (E6): the canonical 46-case runner now also computes the eval-library scores + writes `adv2-scores.json`.
**Vault docs created this session:**
- `07-Roadmap/MG-Automated-Eval-Calibration-Plan-2026-06-03.md` — **THE PLAN** (§11 = CEO+Eng amendments, BINDING).
- `02-Architecture/Editron-Signals-Source-of-Truth.md` — **every signal/weight/threshold**, file:line, with the 2× verification (§9).
- `02-Architecture/Brand-Vault-Signals.md` — what the brand vault holds + the expansion TODO.
- `07-Roadmap/MG-L2-AnswerKey-proj_OzG2qgoYudFa.md` — the L2 labeling sheet (awaiting founder labels).

---

## 4. The plan (form → curves → calibration) + the 4-layer eval design
Plan = `MG-Automated-Eval-Calibration-Plan-2026-06-03.md`. Shape (Approach B, CEO-set):
- The **eval harness** is built EARLY (regression floor + automated "beats baseline?" judge); measures whatever form exists.
- The **tuner** (curve-param optimization) is built LATE, gated on the generative form existing. Optimizer = **black-box (CMA-ES/Bayesian/coordinate-descent), seeded, offline**, NOT the bandit (the bandit can't tune curves + its 3-value reward zeroes a float + `Math.random`).
- Reward = continuous composite. The deterministic layers (L1/L2/L4) are render-FREE → tune on them cheaply; L3 (render+VLM) only at validation checkpoints.

---

## 5. Phase status
| Phase | Status |
|---|---|
| Deterministic core (composite, L1, L2, L4) | ✅ built + verified + committed |
| `mg-eval` integration (E6) + golden snapshot | ✅ |
| Real-data run (L1+L4 on the 13) | ✅ (catches monotony; L1 all 1.00 = legible-but-blind) |
| Pixel path (footage brightness → L1) | ✅ plumbing built + verified on test frames; needs the real Hank frame for the real run/composite |
| L2 on the real 13 | ⏳ gated on founder labels (auto-draft + verify) |
| L3 (communication, render→VLM round-trip) | ❌ not started |
| The generative FORM (feed dials per-moment signals) | ❌ not started — the real lever |
| The tuner (P5-7) | ❌ deferred (after the form + curves exist) |
| Brand-vault structured signals | ❌ TODO (gates brand-dependent weights) |

---

## 6. Reviews (CEO + Eng, both REVISE → approved, folded into plan §11)
- **CEO:** premise SOUND (the form→curves→calibration sequencing genuinely defuses the "build-then-rebuild" fear). Shape = **Approach B** (deterministic core first, extend `mg-eval`, no parallel fork). Changes C1 (reconcile with existing eval scripts), C2 (specify L3 comparison + fail-loud fallback), C3 (L2 ground-truth = founder labels; tuner on labeled set only).
- **Eng:** 8 file-level changes E1-E8 closing **4 silent-failure landmines**: E1 render-validity gate (broken render must not blame the curve), E2 null-layer renormalize, E4 seed everything (the `Math.random` break), E5 L3 = structured readback + deterministic compare + fail-loud (kill `aesthetic-gate` auto-pass-100), E6 one eval library / two callers, E8 who-evals-the-evaluator tests. E1/E2/E5/E6/E8 are the must-haves; the tuner ones (E4/E7) gate on P5-7.

---

## 7. ★★★ KEY ARCHITECTURE FINDINGS (the things to have at minute 1) ★★★
1. **ROOT CAUSE of monotony (the headline):** the **43 MG dials read the 8 personality GLOBALS** (formality/enthusiasm/warmth/…), which are **near-constant for a whole video**, and barely touch the per-moment signals (motion/significance/face) that DO vary (`signal-executor.ts` SIGNAL_MAP; the dials' considerations in `overlay-definitions.json`). So the dials get a near-constant vector → near-constant styling → monotony. **Fix-direction: feed the dials per-moment signals.** This is corroborated by the eval (L4 caught the monotony) + the signal source-of-truth. Single most actionable finding.
2. **Form is chosen DIAL-BLIND** (carry-forward, still true): `analyzeContentShape` picks the kind from CONTENT FIELDS only → `switch(primary.kind)` → 8 fixed composers (`composition-planner.ts:238`). Dials style INSIDE the chosen template. The `content` object IS the EYES→form interface (populate `from`/`to`/`value`/… → the right composer fires; today only `text` gets populated → keyword flood).
3. **Brand vault is thin** (`UnifiedBrand`, `brand-registry.ts:19-42`): structured = `colors[]` only; `visualStyle`/`typography` are FREE-TEXT strings (not dials); `formality` is NOT a brand field (it's a content heuristic). → no structured visual brand signals for form decisions ([[Brand-Vault-Signals]], TODO).
4. **The signal landscape** ([[Editron-Signals-Source-of-Truth]]): 49 designed signals (graph) / ~66 emitted / **34 flat keys reach the MG planner**; 91 overlays (43 mg-property); 74-76 thresholds (only **3 literally INVENTED** in code — the agents' "21" was inference); 6 curve types; multiplicative scoring → single lerp.
5. **The content-leak** (carry-forward): `intent-translator.ts:186-201` puts only `text` in `params` → rich structure is flattened before the composer. The upstream half of the "5% problem".

---

## 8. Real-data findings (verified on proj_OzG2qgoYudFa's real 13 MGs + the Hank frame)
- The 13 = 8 keyword-highlights (editing/Internet/superhero/d-bag/trolls/YouTube/comment/Troll) + 4 stat-counters (0.02/1/3/100,000/90%) + 1 BLANK callout.
- **L1 = 1.00 on all 13** = they ARE legible (gold-on-dark), but L1 is **blind** to the real problems (flood/blank/monotony). Legible ≠ good.
- **L4 catches the monotony:** the keyword-flood decays 1.00→0.85→0.70→0.55; bounces up for fresh forms. With L4 wired, the composite drops to ~0.83-0.85 on repeats (modest — L4 weight is only 0.15).
- **MG[7] is NOT blank** (corrected): a real "Selection Bias" concept callout; the "blank" was an `eval-real.ts` display-tooling bug (missed `content.title`), fixed. The real bug is the keyword-flood salience gap (§9). Lesson: investigate, don't assume.
- **Footage-contrast is NOT the real problem here:** Hank sits on a dark bookshelf; the bottom-left graphics are on the dark region → light text reads fine. AND the 13 all have surface backings (the gate flags but doesn't penalize when a scrim provides contrast). The pixel-path runner confirmed the mechanism (bright test frame → flags all 13; dark → flags 0). **Refinement found:** footage-contrast should sample LOCAL brightness under the graphic's bbox, not the global average (the Hank frame is split dark-left/light-right).

---

## 9. Bugs / open issues
- **~~MG[7] blank callout~~ RETRACTED 2026-06-03:** MG[7] is NOT blank — it's a real "Selection Bias / When your sample isn't random" concept callout (title+body, `composed-structured`, binds `content:title`/`content:body`). The "blank" was a display bug in MY `eval-real.ts` (label only checked value/text/name/quote, not `title`) — FIXED. The MG system handled it correctly. (Founder was right to insist on investigating.)
- **Keyword-flood salience gap (the REAL P1 bug):** `graphic.keyword_highlight ← speech.energy(INV) ONLY` (`overlay-definitions.json`) — NO importance/salience consideration, so it fires on any energetic word (founder confirmed the 8 keywords "weren't important words"). The WHETHER/salience gate (the EYES "is this worth showing") is the real fix — NOT L2.
- **Bandit `Math.random`** (`threshold-bandit.ts:100-102`) — non-deterministic, Rule-18N violation. Don't reuse for curves; the new tuner must be seeded.
- **Content-leak** (`intent-translator.ts:186-201`) — only `text` survives to the composer.
- **3 MG dials wired-but-were-dead** historically (saturation_boost, surface_complexity, entrance_speed) — verify live.
- **`aesthetic-gate` auto-passes score 100 with no API key** (`:68-72`) — poison trap; kill when building L3.
- **structural-gate footage-contrast** dead in prod (no frameContext passed at `edl-executor.ts:1194`) — revived in the eval layer, still dead in the live path.
- **L3 not built; L2 needs labels; the generative form not started.**
- INVENTED everywhere: composite weights, L4 weights/window, ~21 unsourced thresholds, the structural-gate deductions.

---

## 10. Research / learnings (this session)
- **VLM-as-judge unreliable for holistic scoring** (prior research, applied): L3 must be structured-readback + deterministic-compare, never a 0-100 rating; raw LLM confidence ≈ random.
- **No auto-metric for "meaningful"** — but it decomposes: correctness (deterministic, vs the EYES extraction = ground truth), communication (VLM round-trip), legibility (deterministic), aesthetic-taste (proxy only). That decomposition is the unlock that makes the eval automatable (vs the research's pessimism).
- **The 2× verification earned its keep:** the 5 agents got 2 numbers wrong (thresholds 74 not 76; only 3 literal INVENTED not 21). LESSON: agent reports mix code-fact with inference — re-count load-bearing numbers from source (grep) before trusting.
- **"Good hit" ≠ proof:** L1's all-1.00 on the real 13 looked like a win but is "legible-but-blind". Adversarial-verify what a green result is actually saying.

---

## 11. Techniques / how-to (so next session doesn't re-learn)
- **Run the eval self-tests** (from the worktree): `npx tsx scripts/eval-{composite,legibility,correctness,aesthetic}-selftest.ts` (each exits ≠0 on failure).
- **Real-data eval:** `npx tsx scripts/dump-proj-mgs.ts proj_OzG2qgoYudFa` (read-only Mongo → `.calibration-temp/<pid>-mgs.json`) → `npx tsx scripts/eval-real.ts proj_OzG2qgoYudFa` (L1+L4 scores).
- **Transcript:** `npx tsx scripts/dump-transcript.ts proj_OzG2qgoYudFa` (★ = the crude structure regex; it MISSES several — proof EYES needs meaning).
- **Pixel path:** save a real frame PNG → `npx tsx scripts/eval-pixel.ts proj_OzG2qgoYudFa <frame.png>` (sharp brightness → L1 footage-contrast). `sharp`, `ffmpeg`, `yt-dlp` all present in the worktree.
- **Verify code:** `npx tsc --noEmit` (196-error BASELINE — look for +0) + `npx eslint <file>`. Run from the worktree.
- **2× number verification:** regex-count from source, e.g. `[regex]::Matches($json,'"category"\s*:\s*"([^"]+)"')` for overlays.
- **MG dials read the 8 personality globals** — to make MG vary per-moment, the dials' `considerations` (in `overlay-definitions.json`) must reference per-moment signal keys, and those keys must be in the SIGNAL_MAP (`signal-executor.ts`).

---

## 12. What next (ordered)
1. **Founder L2 labels** — auto-draft the answer-key from the transcript (this IS a first EYES extraction), founder verifies → L2 scores the real 13 (catches the blank + the flood form-mismatches). Sheet: `MG-L2-AnswerKey-proj_OzG2qgoYudFa.md`; the founder's A/B/C/D answers are still pending in chat.
2. **The generative FORM (the lever) — B IN PROGRESS:** **Root cause PRECISELY located** (`director-agent.ts:636`): the `if (!d.params.signals)` guard SKIPS creative-brief MG decisions (they arrive with personality `genreParams`) → they never get the per-moment override → monotony. Also `signalsAtFrame` (`:613`) only overrides ~5 intensity signals (visceral_impact/enthusiasm/emotional_arousal/visual_significance/visual_change_rate), not the full set. **★ B step 1 DONE but UNCOMMITTED + UNVERIFIED-EFFECT:** added an `else if (d.type==='graphic')` branch that BLENDS the moment's intensity signals with the video baseline — `(1−W)·identity + W·moment`, **W=0.6 ⚠️INVENTED (calibration-target, decision D4)** — founder's call: BLEND, not hard-override (identity signals formality/warmth/visual_dependency/pacing/humor stay video-level). tsc +0 / eslint +0-new, BUT the actual per-moment MG variation **needs a LIVE pipeline re-run to verify** (offline harness reads the OLD dumped signals — it cannot show the new variation). **Do NOT commit `director-agent.ts` until the live run confirms it.** **B step 2 (next):** expand `signalsAtFrame` to the full per-moment set (narrative_pressure/cinematic_moment/motion_intensity — needs the gridSignals timeline plumbed into the Director) + add per-moment dial considerations. Then dissolve `switch(primary.kind)`.
3. **L3 (communication):** render → cold VLM structured readback `{value,claim,polarity}` → deterministic compare to ground truth; measure its error-rate vs labels before trusting; kill aesthetic-gate's auto-pass-100.
4. **Brand-vault expansion** (gates brand-dependent weights): extract structured signals from free-text `visualStyle`/`typography` (LLM, Rule-30 OK) or add schema fields or learn per-brand.
5. **The tuner** (after form+curves exist): seeded black-box opt over the curve params, offline, on the labeled set, candidate-store + beat-baseline promotion gate.
6. **Pixel-path refinement:** local brightness under the graphic bbox, not global.

---

## 13. Footguns (DO NOT repeat)
- **NEVER `git add -A` / `git add scripts/`** — `scripts/` holds Mongo-URI scripts (`dump-proj-mgs.ts` etc.). Stage explicit `lib/` paths only (this session committed `ef1a60dd` with 4 explicit paths — correct pattern).
- **Push to `origin` ONLY** (`Insturix/Front-End`), NEVER `haunting`. `infrastructure-improvs-+Editron` push = Vercel PREVIEW (fine); prod = main via dashboard only.
- **The deep-research VERIFIER breaks** (subagents don't call StructuredOutput → all claims mislabeled "killed"); SEARCH works; treat findings primary-sourced-not-double-checked.
- **Agent reports mix fact + inference** — re-count load-bearing numbers from source (the 2× pass).
- **mgScores is LIVE** (not dormant). `aesthetic-gate` auto-passes 100 with no key. `render-mg-real.ts` = decoy.
- proj_OzG2qgoYudFa is in `editron_prev` (NOT `_prod`). 13 MGs, 204 transcript segments. The 4 stat moments: seg86 (0.02), seg129 (1/3), seg137 (100k), seg155 (90%).
- Don't write the pasted image to disk (can't); ask the founder to save frames to a path.

---

## 14. Docs / paths / IDs
- **Worktree (PRIMARY, deploy branch):** `D:\google downloads\Front-End-main\editron-worktree` → `infrastructure-improvs-+Editron`. Commit `ef1a60dd`.
- **Eval library:** `lib/editron/motion-graphics/engine/eval/{composite,legibility,correctness,aesthetic}.ts`.
- **Key code:** `engine/overlay-definitions.json` (91 overlays/43 dials), `engine/utility-scorer.ts` + `response-curves.ts` (scoring/curves), `services/signal-registry.ts` + `signal-executor.ts` (signals + SIGNAL_MAP), `data/threshold-registry.ts` + `services/threshold-bandit.ts`, `motion-graphics/engine/composition-planner.ts` (8 composers) + `content-shape-analyzer.ts` (dial-blind) + `structural-gate.ts`/`aesthetic-gate.ts`, `lib/shared/brand-registry.ts` (UnifiedBrand), `services/intent-translator.ts:186` (content-leak).
- **Vault (read `00-Index.md` first):** THE PLAN `07-Roadmap/MG-Automated-Eval-Calibration-Plan-2026-06-03.md`; SIGNALS `02-Architecture/Editron-Signals-Source-of-Truth.md`; BRAND `02-Architecture/Brand-Vault-Signals.md`; LABELS `07-Roadmap/MG-L2-AnswerKey-proj_OzG2qgoYudFa.md`; prior handover `04-Session-Notes/Session-2026-06-03-MG-Calibration-DeepMap-HANDOVER.md`.
- **IDs:** real project `proj_OzG2qgoYudFa` (editron_prev). Vercel `prj_uAwH5pAHMWaOiRNbS7FZuejWXUuc`.

---

## 15. ★ What minute-1-you should have (the smooth-start checklist)
1. **§7 — the root-cause finding** (MG dials read personality globals, not per-moment signals). #1 thing; it's the lever for fixing real output.
2. **The eval library exists + is committed (`ef1a60dd`) but NOT production-wired** — it's the JUDGE; run the self-tests + `eval-real.ts` to see it work.
3. **The decisions (§1) are settled** — automate eval+tuning, laws-fixed/taste-brand-dependent, founder labels auto-drafted. Don't relitigate.
4. **[[Editron-Signals-Source-of-Truth]] is your map** — every signal/weight/threshold, file:line. Don't re-derive.
5. **Sequence: form → curves → calibration.** The form (feed per-moment signals / dissolve the switch) is next; the tuner waits.
6. **L2 needs the founder's labels** (auto-draft + verify) to grade the real 13; the A/B/C/D answers are pending in chat.
7. **Footguns (§13)** — never git-add scripts/, origin-only, re-count agent numbers, verify on real renders/pixels.
8. **Discipline:** deep-read before reviewing; verify on real data + look at the pixels; "good hit" ≠ proof; agent reports mix fact + inference.

### Session arc (honest)
Read prior §4 + plan §13 → verified §4 from code → designed automated eval+tuning → decisions (automate, layer-4=B, founder-labels) → wrote the plan → CEO+Eng review (REVISE applied) → built the deterministic eval core (L1/L2/L4 + spine, each self-tested) → wired mg-eval (E6) → committed `ef1a60dd` → real-data (dump 13 + transcript, L1 all-legible, L4 caught monotony, pixel-path, the Hank frame) → brand-vault recon (thin; formality≠brand) → 5-agent signal investigation → **[[Editron-Signals-Source-of-Truth]]** + the root-cause monotony finding → 2× verification (caught 2 wrong agent numbers). Smooth session, methodical, lots verified. The lever for next time is the FORM.
