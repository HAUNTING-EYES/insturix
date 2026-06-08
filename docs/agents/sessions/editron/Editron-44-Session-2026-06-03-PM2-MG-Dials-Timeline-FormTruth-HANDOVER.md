---
tags: [handover, motion-graphics, signals, dials, timeline, form, monotony, generative-engine, session-notes]
date: 2026-06-03
session: PM2 (dials + timeline-fix + the form truth)
status: 5 commits pushed (origin); the VISIBLE monotony is still unsolved — it's the FORM + FLOOD, not dials
read-first: yes — read §0 and §2 BEFORE touching any code
supersedes-context: Session-2026-06-03-MG-Eval-Library-Build-HANDOVER.md (prior), MG-Monotony-Root-Cause-Dial-Layer-2026-06-03.md, MG-Signals-Robustness-Generative-Motion-Master-Plan-2026-06-03.md
---

# Handover — MG Dials, Timeline Fix, and the FORM Truth (2026-06-03 PM2)

## §0. READ THIS FIRST (the one thing that matters)
**The visible monotony is NOT the entrance animation, NOT the signals, NOT calibration. It is the FORM:
every graphic is a "word in a box" (composed-emphasis), because (a) the FORM is selected from ~9 fixed
template composers via `switch(primary.kind)` and dials only STYLE inside them, and (b) the upstream
FLOODS keyword-highlights (text-only content → emphasis template). The generative form engine that
Rule 11 demands — build any MG from primitives + visual language per the moment — DOES NOT EXIST.**

This session I spent most effort tuning DIALS (entrance, timeline coverage) — styling *inside* the
templates. That work is real and is now solid foundation, but it CANNOT fix the visible monotony, because
a dial can make the word-box gold/bold/pop instead of slide, but it cannot make it *not a word-box*. The
founder looked at the rendered output and said it still looks like "the same monotonous shit" — he is
correct, and the reason is the FORM, not the dial. **Do not start by tuning dials. Start from the FORM +
the FLOOD.**

## §1. The architecture truth (verify these file:line yourself before trusting memory)
- **Form selection is a fixed switch, signal-BLIND:** `composition-planner.ts:88`
  `analyzeContentShape(intent.content, intent.kind, s)` → `detectShapes(content)`
  (`content-shape-analyzer.ts:31`) picks the shape kind from CONTENT FIELDS (has `value`? → numeric;
  `name`? → identity; `quote`? → quotation; else → emphasis/free-text). The declared `intent.kind` is
  passed as `_kind` — **the underscore means it is IGNORED**. Signals only set layout/complexity/hold,
  never the form.
- **The form→composer switch:** `composition-planner.ts:238` `switch (primary.kind)` over
  numeric / identity / quotation / emphasis / brand / structured / data-series / comparison / free-text.
  Each case calls a template composer. **A keyword graphic = `{text:"trolls"}` → no structured field →
  `emphasis` → `composeEmphasis` = a word in a box.**
- **Dials STYLE within the chosen template.** 43 mg-property dials (font size, entrance, color, weight…)
  read signals → curves → values, applied inside whatever composer was selected. They cannot change the
  form. (This is the handover's long-standing "FORM is the production lever" — I drifted from it.)
- **So the engine is PARAMETRIC TEMPLATES, not generation.** It's more than hardcoded React components
  (Tier 1), but the FORM is a fixed menu of 9, dominated by emphasis because the flood feeds it keywords.

## §2. The REAL monotony diagnosis (start here next session)
Two causes, both bigger than anything I touched:
1. **The FLOOD (problem "A")** — `graphic.keyword_highlight` fires on `speech.energy` with **NO salience
   gate**, so it boxes any loud word. Founder's own labels: **8 of 13 MGs on proj_OzG2qgoYudFa are NOT
   warranted** ("these weren't important words"). Gate it → ~8 identical word-boxes vanish, leaving ~5
   warranted, genuinely different graphics (stats, the concept callout). This ALONE collapses the
   monotony. RISK (founder flagged): needs a real importance/salience signal + adversarial testing across
   content types before shipping (Rule 29) — do NOT ship a naive keyword cut.
2. **The FORM is not generative** — even warranted moments all render as the same composer family. The
   real work = dissolve `switch(primary.kind)`; generate the form from primitives + visual language +
   the moment (kinetic typography, data viz, title sequences). This is "Phase 4" in the plan but it is
   actually THE work, not phase 4 of 5.

## §3. Commits this session (ALL pushed to origin = Insturix/Front-End, branch infrastructure-improvs-+Editron)
| hash | what | verified | note |
|----|----|----|----|
| `ef1a60dd` | MG eval library (L1 legibility, L2 correctness, L4 aesthetic, composite) | self-tests | from prior session, pushed here |
| `1059883a` | entrance TYPE dials → per-moment signals (kills 100% slide-up) | real-data score + GIFs | styling, not form |
| `6498ba19` | signals-contract safeguard (tracked CI test) + fix `entrance_speed` constant-binding | 12/12 vitest | the "never again" guard |
| `252a47ed` | Phase 2 timeline fix: cut→original map in signalsAtFrame + brief-executor inverse mapper + loud-fallback | coverage 7/13→12/13, 140/140 | real high-value infra fix |
| `4ccf06ad` | contract test scores entrance dials MULTIPLICATIVELY (real-path fix) | 12/12 vitest | corrected my own error |

NEVER pushed to `haunting`. NEVER `git add scripts/` (untracked Mongo-URI zone) — every commit staged explicit lib/ + tests/ paths.

## §4. What's BUILT (solid foundation — do NOT redo)
- **Eval library** `lib/editron/motion-graphics/engine/eval/{composite,legibility,correctness,aesthetic}.ts` — pure, self-tested.
- **Signals-contract safeguard** `tests/editron/signals-contract.test.ts` (vitest, CI-gateable): INV1 = every
  `mg.animation.entrance_*` dial reads ≥1 per-moment signal (structural, would've caught the slide bug at
  definition time); INV1b teeth-check; INV2 = entrance winner varies across moments (MULTIPLICATIVE — the real method).
- **Timeline fix** — `mapCutFrameToOriginalFrame` (`brief-executor.ts`, inverse of `mapOriginalFrameToCutTimeline`),
  used in `signalsAtFrame` (`director-agent.ts:613`) + the calibration-snapshot lookup; cut→original before the
  V-JEPA find + 5s nearest-segment snap + a loud warning when >15% of decisions find no segment.
- **Entrance dials** read per-moment signals (overlay-definitions.json): slide ← visual_change_rate + ¬visceral_impact (yields at high impact); pop ← visceral_impact + ¬formality; scale ← visceral_impact + visual_significance; etc. entrance_speed ← visceral_impact (was pacing+enthusiasm constant).
- **Round-trip mapper test** `tests/editron/brief-executor-timeline.test.ts`.

## §5. What's NOT built (the real work, in priority order)
1. **The FLOOD / salience gate** (problem A) — the single biggest visible win. Needs a real importance signal + adversarial test.
2. **The generative form engine** — dissolve `switch(primary.kind)`; build forms from primitives. THE core.
3. **Zoom 3.1 — NOT diagnosed** (see §7). I have no verified picture of real zoom behavior.
4. **M1 (genreParams starvation)** — the reverted blend; needs a *branded* project to verify (proj_OzG2qgoYudFa has no genreParams). ICP-relevant; don't forget.
5. **The tuner (Phase 5)** — calibrate the settled form; yt-dlp corpus for overfit. LAST.

## §6. Scoring-methods reference (the gotcha that bit me — internalize this)
`scoreOverlay` (`utility-scorer.ts:30`) has two methods. **WHICH method depends on the dial category:**
- **mg-property dials → ADDITIVE** = `weight * mean(considerations)`.
- **SELECTION dials → MULTIPLICATIVE** = compensated product. `edl-executor.ts:1153-1163` puts
  `mg.animation.entrance_*` + `mg.animation.hold_*` in `SELECTION_IDS` → scored multiplicative.
  `entrance_speed` is NOT a selection dial → additive.
- **zoom = its own category 'zoom'** (overlay-definitions.json top), scored in the signal-executor/Path-D
  path; reads DOTTED signal keys (`speech.energy_delta`), not flat. mgWinner (`composition-planner:28`) is
  a plain argmax over the `entrance_` prefix — and `entrance_speed` shares that prefix (latent collision;
  doesn't bite now, fix in form/dial cleanup).
**I verified the entrance rewire with `additive` first; prod uses `multiplicative`. The numbers happened
to coincide, but the method was wrong. Lesson: check the category's scoring method in edl-executor BEFORE
verifying a dial.**

## §7. Zoom (Phase 3.1) — UNFINISHED, my diagnosis was WRONG
- Code-read claim (UNVERIFIED, likely wrong): "zoom-in-heavy vocabulary, pull_back flips to in."
- Empirical probe (real scorer, `scripts/verify-zoom-direction.ts`, untracked) CONTRADICTED it: `zoom_pull_back`
  *won* most synthetic moments at scaleTo≈1.0 (imperceptible); strong zoom-ins (punch 1.1-1.3) never won.
- **BUT that probe is itself flawed** — I fed only a few signals, so most zoom dials' considerations
  silently SKIPPED (missing signal → ignored), making winners an artifact of my inputs.
- Net: **I do not know zoom's real behavior.** Neither code-reading nor my synthetic probe matched the
  founder's "always zoom-ins." To actually do 3.1: pull REAL zoom decisions from a real project
  (`intelligence.decisionLog` snapshot, or video-overlay scale keyframes) and measure the real
  direction/scaleTo distribution. Zoom dials + direction logic: overlay-definitions.json (12 zoom dials,
  scaleTo ranges) + `edl-executor.ts:839-884` (direction = `scaleTo < scaleFrom(1.0) ? pull-back : push/punch`).

## §8. Open issues / bugs
- **FLOOD**: keyword_highlight ← speech.energy only, no salience gate (intent-translator / upstream). 8/13 unwarranted.
- **FORM**: switch(primary.kind) not dissolved; everything collapses to emphasis word-box.
- **M1**: genreParams graphics get 8 constant personality signals, skip signalsAtFrame, starve. Reverted blend exists in chat history; verify on a branded project.
- **entrance_speed prefix collision** with mgWinner's `mg.animation.entrance_` argmax (could suppress entrance override if it outscores type dials; ~0.45 now, doesn't bite).
- **font_size compression** (M2b): visceral logistic slope 1 + near-saturated enthusiasm + additive ceiling → 144-151px band. Calibration (tuner).
- **skew-lean** in entrance after the rewire (this video has high visual_change_rate) — moment-driven but a tuner balance target.
- **Brand often defaults to gold** (DEFAULT_BRAND) — "bold golden" look; brand frequently doesn't reach render (long-standing).

## §9. Honest mistakes + discipline (so the next me doesn't repeat them)
1. **I PIVOTED constantly** — entrance → timeline → form re-diagnosis → zoom — instead of following the
   agreed plan. Founder: "stop pivoting follow the plan." Pick the plan, execute in order, don't re-derive direction every turn.
2. **I asserted diagnoses from code-READING without measuring — TWICE** (additive-vs-multiplicative; the
   zoom 3.1 claim). Both were wrong/unverified. **Rule 34: a code-read is a hypothesis; verify on real
   data/the real path before claiming "done."**
3. **I confused "signals are now correct" with "output looks good."** They are not the same. The output
   is judged on PIXELS and FORM, not signal correctness.
4. **I over-invested in a micro-lever** (entrance animation = sub-second motion) while the visible problem
   (form + flood) sat untouched. Match effort to visible impact.
5. **My synthetic verification was sloppy** (incomplete signals → skipped considerations). If you build a
   synthetic test, provide ALL signals the dials read, or it lies.

## §10. Verification status (be precise in claims)
- Entrance rewire: Level 2 (real-data score) + recipe-level + pixel render of the composition layer. NOT a full live-Director run.
- Timeline fix: Level 2 (real-data coverage 7→12) + unit round-trip. NOT Level 3 (live pipeline).
- Pixel render: recomposed corrected recipes through the REAL composition engine + rendered GIFs (sent to
  founder). It is the composition layer fed corrected signals — NOT a fresh end-to-end pipeline pass (LLM
  brief + DB write deliberately avoided to not mutate the real project).
- Zoom: UNVERIFIED (see §7).

## §11. What next — the decision the founder/next-session faces
The plan (`07-Roadmap/MG-Signals-Robustness-Generative-Motion-Master-Plan-2026-06-03.md`) says
3 (zoom+dials) → 4 (generative motion/form) → 5 (tuner). **But this session proved the plan's ordering
buries the lever: the FORM (Phase 4) + the FLOOD are what the founder SEES; Phase 3 dial work won't move
the needle on monotony.** Two honest options for the founder to choose:
- **(A) Follow the plan in order** (finish zoom 3.1 properly with real data → 3.2 → 4 → 5). Predictable,
  but the visible monotony persists until Phase 4.
- **(B) Reprioritize to the visible problem NOW**: the FLOOD/salience gate (biggest cheap win) + the
  generative FORM engine. This is what makes the output stop looking the same. Recommend B, gated on the
  salience-gate risk work (real importance signal + adversarial test).
The dial/signal/safeguard/timeline foundation is done and supports either path.

## §12. Footguns / environment (so the session starts smooth)
- **NEVER `git add scripts/` or `git add -A`** — `scripts/` holds untracked probes with a live Mongo URI. Stage explicit `lib/` + `tests/` paths.
- **Push to `origin` ONLY** (Insturix/Front-End). `haunting` (HAUNTING-EYES/insturix) is NOT ours.
- **`.env.local`** (worktree root) holds MONGODB_URI + GEMINI/GOOGLE keys — load via the `loadEnvLocal` pattern in `scripts/probe-proj-rerun.ts`; never print values.
- **DB = `editron_prev`**; test project = `proj_OzG2qgoYudFa` (13 MGs, 204 V-JEPA segs, no genreParams, no brand).
- **The `.calibration-temp/<pid>-mgs.json` dump is PRE-FIX** — its recipes are old (slide-up). To see post-fix output, recompose with `scripts/compose-fixed-mgs.ts` (mirrors edl-executor) → render with `scripts/render-mg-motion.ts`.
- **tsc baseline = 196 errors** — look for +0, not 0. eslint `--quiet` = 0 errors target.
- **Verify on REAL pixels / REAL data**, never the 112-suite (injects scores) and never code-reading alone.
- **aesthetic-gate auto-passes score 100 with no API key** (poison trap — don't trust it).
- Working tree: `D:\google downloads\Front-End-main\editron-worktree` (the deploy/preview branch worktree).

## §13. What I SHOULD have received at session start (so it was smooth — for the next me)
1. **"The FORM is the lever. Dials only style. Do NOT tune dials to fix monotony."** (The prior handover
   said this; I didn't internalize it and wasted the session on dials.)
2. **The scoring-method map** (§6) — additive vs multiplicative per category, with edl-executor:1153-1163.
3. **"The monotony = FLOOD (8/13 unwarranted keywords) + FORM (all word-boxes), with the founder's labels."**
4. **"Verify on real data/the real path, not code-reading — you WILL be wrong otherwise."** (§9.2)
5. **The dump is pre-fix; to see real output you must recompose + render** (§12).
6. **The generative form engine is unbuilt and is THE work** — everything else is foundation.

## §14. Key scripts (untracked, in scripts/ — run, never commit)
- `probe-proj-rerun.ts` — read-only project/rerun-prereq probe (env-load pattern reference).
- `verify-timeline-coverage.ts` — raw vs mapped V-JEPA coverage (proved 7→12).
- `verify-entrance-projection.ts` — corrected signals → entrance winners (multiplicative).
- `compose-fixed-mgs.ts` — recompose corrected recipes via the real engine → FIXED dump.
- `render-mg-motion.ts` — render a dump's MGs to GIFs (the real MotionGraphicLayerContent).
- `verify-zoom-direction.ts` — FLAWED synthetic zoom probe (see §7; fix the signal coverage before trusting).
- `dump-proj-mgs.ts` — dump a project's MGs to .calibration-temp.

## §15. Lens check (CEO + Eng completeness)
- CEO: decisions captured (form-vs-plan tension §11, M1 ICP risk, flood = cheap win); what-next explicit; honest about the session burning effort on the wrong lever.
- Eng: file:line for every claim; verification level stated per item (§10); the scoring-method gotcha (§6); footguns (§12); bugs itemized (§8). The one thing to double-check next session: the zoom real-data measurement (§7) — everything else is grounded.
