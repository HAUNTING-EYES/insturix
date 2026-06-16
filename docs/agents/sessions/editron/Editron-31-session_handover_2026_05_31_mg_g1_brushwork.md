# Session Handover — MG Phase G kickoff: diagnosis, the spine plan, G-1 brushwork (size + word-break)

**Date:** 2026-05-31 (long multi-hour session)
**Branch:** `infrastructure-improvs-+Editron` (PRIMARY deploy branch)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Prior HEAD:** `ceb6ae8f` (from the 2026-05-30 signals-design session). **This session made NO git commits — all changes are UNCOMMITTED in the worktree (see §7).**
**Predecessor handover:** `session_handover_2026_05_30_mg_signals_design.md`
**The durable plan doc (READ IT):** `D:\Insturix-Brain\02-Architecture\MG-Generative-Spine-Phase-G.md`

---

## 0. HOW TO USE THIS DOC (read this first, 90 seconds)

We spent ~last session proving the MG *signal pipeline* works (signals vary per moment). THIS session diagnosed *why the MG output still looks amateur*, designed the fix (a generative "visual-language spine"), and started building **G-1 (brushwork: size + word-break)**. If you read one thing:

> The MG engine **occupies a single fixed point in an expressive space it should traverse** — every graphic is the same oversized (145px) gold uppercase keyword card. The deepest cause, verified in code: **a customer's brand never reaches the renderer** (`decision.params.brand` is always `{}` → Insturix gold default 100% of the time, even for paying users). The plan is to make the engine **generate** designs from `brand bounds × content × per-moment signals × Graphiti`, never **select** from presets. We built G-1 (text now fits its box + words never break mid-letter; verified on real data 145px→97px) but **have NOT rendered a video to look at the pixels yet.**

**Behavioral rules the user enforces (they said each multiple times):**
- **Generate, never select.** No presets, no templates, no "register menu." Iman-style is a *capability the engine performs*, not a preset to apply. (Rule 29N, Rule 11.)
- **Verify, don't claim.** "Works" = proven on REAL renders / REAL data, never an import or a type-check alone. Don't say fixed until you've seen it.
- **Root fix, not bandaid.** They explicitly caught me shipping a `nowrap` bandaid and made me do the real word-grouping.
- **Follow ALL rules from the first edit** (Evidence Block per code file, tsc+eslint before "done", re-read before edit). Quality > speed, don't rush.
- **Brushwork is correctness, not MVP.** Broken text is a bug; fixing it isn't lowering the bar.

---

## 1. TL;DR — what shipped, what's proven, ship-state

**Built this session (G-1, UNCOMMITTED):**
- Text **fit-to-box**: a deterministic `fitFontSize`/`estimateTextWidth` + a per-element `computeFittedSize` (caps focal text to ~9% of frame height, fits it to the title-safe box, floors at readable). 
- **Word-break root fix**: `SplitTextElement` now groups chars per WORD (`white-space:nowrap` per word) so a word wraps at spaces but NEVER splits mid-letter. (Replaced an earlier `nowrap`-everything bandaid.)
- **Title-safe insets** 4%→5%; a `layoutMaxWidthFraction` helper; `buildTextStyle` takes an optional `fittedSizePx` (backward-compatible).

**Verified:** `tsc --noEmit` and `eslint --quiet` BOTH clean on the 2 changed files (0 errors mine; 196 pre-existing project errors elsewhere, untouched). Real-data check (`check-mg-recipe.ts` on `proj_OzG2qgoYudFa`): **all 13 focal words 145px → 97px (9% of frame), 0 overflow.** "superhero" 145→97 FITS, "d-bag" 147→97 FITS, "Internet" 145→97 FITS.

**NOT verified:** an actual VIDEO RENDER (pixels). The numbers say it's fixed; nobody has watched it. Also owed: adversarial ≥8 content types (Rule 29 — long words, CJK, multiline, 9:16, all-caps).

**Ship-state:** G-1 ~80% — size + word-break done & real-data-verified; visual render + adversarial test owed. Everything else (brand-wire, color/intensity mobility, captions, transitions, fusion, calibration) is planned, not built.

---

## 2. READ-FIRST LIST (what I wish I'd had at minute one, in order)

1. **This doc.**
2. **`D:\Insturix-Brain\02-Architecture\MG-Generative-Spine-Phase-G.md`** — THE plan (rewritten after 6-agent code verification; risk-ordered G-1..G-7; the bombshell; injection points). #decided.
3. **Rule 11** (CLAUDE.md, Front-End) + **Rule 29N** (AGENT_RULES.md: signals-not-presets — the keystone). The thesis.
4. `D:\Insturix-Brain\01-Research\Motion-Graphics-Craft.md` — the 4 craft laws.
5. `MG-Signal-Overlay-Architecture.md` + `project_mg_overlay_architecture.md` — "CRG = bounds, overlay = value, 64≠base"; the spine composes WITH this.
6. `project_graphiti_signal_bridge.md` — brand prefs as signal overrides (dormant; relevant G-6).
7. `insturix_vision.md` — production tool, rule-driven, reduce LLM dependency.
8. The predecessor handover (`...2026_05_30_mg_signals_design.md`) — the signal pipeline fixes.
9. **§11 of this doc — the nbsp footgun.** Will save you an hour.

---

## 3. CEO LENS — strategy, ICP, why this matters

- **ICP = brands and agencies. Pre-launch, zero users today.** (User-stated.) This is the single most important strategic fact and it reframes everything.
- **The spine IS the product, not a polish phase.** What a brand/agency buys is "videos that are on-brand, every time, without an in-house editor." That *is* the brand-wire + visual-language spine. An agency runs ~20 clients; "drop in the client's brand → every video auto-nails their look, varied per moment" is the wedge that removes their need for a human editor per client.
- **The thesis is the business model, not craft purity.** "Generate, never select" matters because a preset library gives every client the *same* look; brand-bounded generation gives each client *their* look. 20 clients = 20 identities, impossible with presets, natural with the spine.
- **The revenue inversion (what makes Editron fail):** selling "on-brand AI video" and shipping gold-gold-gold because brand never reaches the render. Not a fire *today* (pre-launch) but it's the #1 capability for the ICP.
- **Quality bar = "Iman Gadzhi level," but as a RANGE not a look.** Iman uses the full mute→loud spectrum in ONE video (whisper-script intro → red 3D-bold "LOCKED"). The system must traverse that range, signal-driven, bounded by brand. Minimalism is one END, not the target.
- **CEO sequencing call (made this session):** brushwork (G-1) first because it's cheap/safe/visible and pre-launch has no brand users to serve yet; the spine (the real product) right behind it.
- **Screencast / SaaS-demo (Phase F)** is a real adjacent market (same agency ICP), separate track, built on OpenScreen (MIT, `reference-repos/openscreen-main/`). The old `phase_f_g_saas_motion.md` "component library / rigs" framing is DEAD (it's the preset jukebox Rule 11 forbids).

---

## 4. SENIOR-DEV LENS — technical state, architecture, gotchas

- **The render path (as-built):** `planComposition` (pipeline-time, Node, canvas-agnostic) → `recipe` stored on the overlay → at render-time `composition-renderer.tsx` (`CompositionRenderer` → `PrimitiveElement` → `TextElement`/`SplitTextElement`) builds CSS via `buildTextStyle`/`buildShapeStyle` (`primitive-renderers.ts`). MG overlays are FULL-FRAME (`edl-executor.ts:1159-1162` left:0/top:0/canvas WxH), so `%` layout = the whole frame, and `useVideoConfig()` gives true px at render time.
- **Recipe is pre-computed at pipeline time and canvas-agnostic** → text-fit MUST run at render time (where px + text + font are known). That's why G-1's fit lives in `TextElement` (has `useVideoConfig` via the threaded `boxWidthPx`/`canvasHeight`), passing a computed size into the pure `buildTextStyle`.
- **The spine composes WITH the existing overlay system, doesn't replace it.** 40 `mg.*` overlays in `overlay-definitions.json` produce per-moment values; the spine adds brand bounds + semantic roles + resolution-relative sizing. `overlay value → spine bound → final`. Boundary: spine owns brand-scoped bounds; overlays own signal→value within them; `motion-theme-resolver` gets refactored to emit bounds so there's ONE bounds layer.
- **Blast radius of G-1:** `buildTextStyle` is called by composition-renderer ×4 (TextElement, SplitText, GSAPScramble, groupChild) + 1 untracked script. The optional `fittedSizePx` arg = zero callers break. The threading touched `CompositionRenderer`/`PrimitiveElement`/`TextElement`/`resolveLayout` — all internal to composition-renderer.
- **THE GOTCHA (§11): invisible non-breaking space (U+00A0) in source** broke every multi-line exact-match edit for ~an hour. Diagnose + fix described in §11. This is the single biggest time sink of the session.
- **196 pre-existing tsc errors** project-wide = the baseline. My changes added 0. Always filter `tsc` output for the files you touched + compare the total to 196.

---

## 5. THE SESSION ARC (what we did, in order)

1. Read context (handover, vault, Rule 11, craft research). Deep-read the MG engine: `property-resolver`, `primitive-renderers`/`buildTextStyle`, `composition-planner`, `composition-renderer`, `motion-theme-resolver`, `content-shape-analyzer`, `overlay-definitions.json`, the CRG graph, `edl-executor` (applyGraphic), `layer.tsx`/`layer-content.tsx`.
2. Drafted a G-1 text-fit plan. User pushed back repeatedly and correctly: "why the preset?" (title-safe → format-derived, not a magic number); "step back, what's the actual problem, what's Phase G, we never sorted transitions/SFX/MG-timing/the logs."
3. **Read the prior-test logs** (`front-end-log-export-2026-05-30T10-38-14.csv`, 1407 lines). Found: transitions=0 (clip-boundary gate), captions logged "0 segments" (a LYING counter — captions actually render), SFX partial, all-keyword MGs, Mongo 5s timeouts, embedding API failure, Clerk warning. (Logs-first, Rule 27.)
4. User corrected me: **captions DO render** (my error, the "0 segments" log misled me); the real problems are **MG design + transitions**. Latest project = `proj_OzG2qgoYudFa`.
5. **Verified in Mongo** (`check-proj-overlays`/`check-proj-deep`/`check-mg-recipe`): 43 video, 43 captions (work, font-bungee-inline red highlight), 13 MGs (8 keyword/4 stat/1 callout), **0 transitions**, brand always gold.
6. Diagnosed the MG design root causes on REAL data (`check-mg-recipe.ts`): focal font **~145px** (the `mg.typography.font_size` overlay maps signals to **36-160px ABSOLUTE**, `overlay-definitions.json:2018`); **color hardcoded** to 2 tokens (`composeEmphasis` accent / others textPrimary); **char-split flex-wrap** = the "SUPERHER/O" mid-word break; **same treatment** every time (backdrop+underline+pattern+particles), entrance slide-up 13/13, textSplit chars 13/13.
7. Synthesis with the user: "we have inputs + idea + canvas but no paints" → the engine sits at ONE fixed point; needs MOBILITY through expressive space (intensity / voice / color / motion / composition / sound / density).
8. Researched "Iman level" (web): Montserrat light+bold, white lowercase captions with light→bold on the spoken word, ONE cohesive palette per video, subtle glow (Deep Glow), alternating pacing. User SHARPENED it: not minimalism-for-everything — **intensity is a signal-driven dial (mute/mid/loud)**, color signal+brand-driven, SFX is part of the "moment," and **Iman-style is a CAPABILITY not a preset**.
9. User clarified the **defaults system**: no-brand users get Insturix-themed graphics; even the defaults are bad; defaults-as-preset is the wrong shape.
10. **/investigate** the defaults → THE BOMBSHELL (verified by 6 parallel agents): **brand never reaches the render.** `decision.params.brand` is never written → `resolveMotionTokens(…, {})` → `DEFAULT_BRAND` (gold) 100% of runs, even for a paying brand. Brand-registry feeds only the Gemini prompt (`director-agent.ts:1060-1083`) and dies there. `composition-planner.ts:268` builds "brand" from the already-resolved default tokens (circular). Captions = a 9-preset hardcoded jukebox (`caption-service.ts:221-231`). Graphiti = one read (transition-type only, `director-agent.ts:2152`).
11. Wrote the plan: **MG-Generative-Spine-Phase-G.md.**
12. **/plan-eng-review** — phasing crux. User: "enrich context, read ALL docs/rules/research/memory/CLAUDE.md/roadmap/vision/todo/phases/bugs, VERIFY FROM CODEBASE, don't assume." → 6 parallel agents enriched + verified everything against code. Findings flipped the plan to **brushwork-first** (the bombshell + the fragile-signal-pipeline risk made spine-first too risky to go first).
13. "analyze everything, create a final doc after ultrathinking" → **rewrote** the spine doc (risk-ordered phasing, the bombshell as the spine's reason to exist, verified injection points, must-not-regress, risks).
14. **/plan-ceo-review** — ICP = brands/agencies, pre-launch. The spine IS the product; generate-not-select = the agency business model. Confirmed brushwork-first. Added agency requirements (per-client brand, brand-extraction-ready, hero-moment demo).
15. **Executed G-1** (see §7), including the nbsp saga (§11) and the user catching the `nowrap` bandaid → root word-grouping fix.
16. **Verified** (tsc/eslint clean; real-data 145→97 fit). Added **G-7 (Selection + Calibration)** to the plan after the user flagged "not every word / not every video should be a keyword" + "did calibration happen fully?" (Answer: NO — signals vary, but the thresholds acting on them are mostly ⚠️ INVENTED; that's why it over-fires keywords 8/13.)

---

## 6. DIAGNOSIS — root causes (verified, file:line)

The engine sits at ONE fixed point. Five pins hold it there:
| Pin | Verified fact | Location |
|---|---|---|
| Color hardcoded | 2 tokens only; `composeEmphasis` binary accent/textPrimary; no semantic palette roles (alarm/warm = 0 matches) | `composition-planner.ts:507,545,367,615` |
| Size absolute | `mg.typography.font_size` → **36-160px ABSOLUTE**, resolution-blind; `buildTextStyle` `max(minSize,64×sizeScale)`, zero width logic; `title-safe` = 0 matches | `overlay-definitions.json:2018`, `primitive-renderers.ts:501` |
| **Brand never reaches render** | nothing writes `decision.params.brand` → `DEFAULT_BRAND` gold 100% even for paying brands; dies at the Gemini prompt | `edl-executor.ts:1104,1376`; `director-agent.ts:1060-1083`; `composition-planner.ts:268` |
| Captions = jukebox | 9 hardcoded creator presets, brand-blind; +3 drifting "caption style" definitions | `caption-service.ts:221-231` |
| Transitions gated + brand-blind | placement needs a clip cut within 45 frames; signal moments aren't cuts → 0 placed | `edl-executor.ts:590`; `transition-layer-content.tsx` |

**Works / do not rebuild:** the 40 `mg.*` overlays + utility-scorer + planner consumption (`useCompositionEngine:true`); per-moment V-JEPA/Wav2Vec/Essentia signals genuinely vary; SFX runs through the SAME `EditDecision` stream as MG; `choreography-computer` computes stagger from tokens+beats.

---

## 7. WHAT WAS BUILT THIS SESSION (G-1) — exact, UNCOMMITTED

**All changes are uncommitted in the worktree. No `git add`/`commit` ran. Next session: review the diff before continuing; don't double-edit.**

### `lib/editron/motion-graphics/engine/primitive-renderers.ts`
- NEW `estimateTextWidth(text, fontSizePx, opts)` — conservative single-line width estimate (over-estimates → never overflows). ⚠️ glyph-advance ratios (0.6 / 0.68 caps / ×1.05 bold) INVENTED.
- NEW `fitFontSize(text, boxWidthPx, desiredPx, minReadablePx, opts)` — largest size that fits the longest WORD in the box (`safeFraction` 0.9); fail-loud `console.warn` + floor if it can't.
- `buildTextStyle(el, anim, fittedSizePx?)` — optional 3rd arg overrides the legacy `max(minSize, 64×sizeScale)` floor (backward-compatible).
- Added `overflowWrap:'normal'; wordBreak:'normal'` to the text style.

### `lib/editron/motion-graphics/engine/composition-renderer.tsx`
- `SplitTextElement` ROOT FIX: split into WORDS first; each word a `white-space:nowrap` inline-block; chars animate inside via a `renderAtom` helper; container back to `flexWrap:'wrap'`. (Replaced the `nowrap`-everything bandaid.)
- `CompositionRenderer`: `useVideoConfig()` now `{ fps, width, height }`; computes `boxWidthPx = width × layoutMaxWidthFraction(position)`; threads `boxWidthPx`/`canvasHeight` to `PrimitiveElement`.
- `PrimitiveElement`: accepts + forwards `boxWidthPx`/`canvasHeight` to `TextElement`.
- `TextElement`: NEW `FOCAL_FRAC` + `computeFittedSize` (desired = `max(minSize,64×ss)` capped to `canvasH × FOCAL_FRAC[role]`, fit to box, floored at `36 × canvasH/1080`); passes `fittedSizePx` to `buildTextStyle` + `SplitTextElement`.
- NEW `layoutMaxWidthFraction(position)` helper (0.45 corners / 0.70 center / 0.90 full-width).
- `resolveLayout` insets 4% → 5% (title-safe).
- Imported `fitFontSize`.
- **Fixed 1 non-breaking space (U+00A0) at line 362** via PowerShell (see §11).

### `scripts/check-mg-recipe.ts` (UNTRACKED — holds the Mongo URI, must stay untracked, never `git add -A`)
- Extended to import the REAL `fitFontSize` and print OLD→NEW focal sizes per MG (the verification that produced 145→97).

### `D:\Insturix-Brain\02-Architecture\MG-Generative-Spine-Phase-G.md`
- Written, then rewritten after the 6-agent verification (risk-ordered). Added **G-7 (Selection + Calibration)** + a risks pointer.

---

## 8. VERIFICATION STATE (honest — what's proven vs not)

| Claim | Verified? | How |
|---|---|---|
| Code compiles | ✅ | `tsc --noEmit` → 0 errors in my 2 files (196 pre-existing elsewhere, unchanged) |
| Code lints | ✅ | `eslint --quiet` → exit 0 |
| Oversize fixed | ✅ on real data | `check-mg-recipe.ts proj_OzG2qgoYudFa` → all 13 focal 145px→97px (9% of frame), 0 overflow |
| Word-break fixed | ⚠️ code-only | word-grouping logic + tsc; NOT pixel-confirmed |
| Looks right on screen | ❌ | **NO video render done.** This is the owed proof. |
| Holds on hard cases | ❌ | adversarial ≥8 types (long words, CJK, multiline, 9:16, all-caps) NOT run — Rule 29 owed |

**Caveat the next session must hold:** all 13 words landed at exactly 97px (the focal cap is the binding constraint for short keywords; the box-fit only bites for long words). So size is now *uniform* (not oversized, fits) — size *variety* by importance is G-3, not G-1. And 97px (9% of frame) is an ⚠️ INVENTED guess → G-7 calibration + your eyeball.

---

## 9. OPEN ISSUES / BUGS (the honest list)

**G-1 remaining (finish before declaring done):**
- Visual render of `proj_OzG2qgoYudFa` (the pixel proof). NOT done.
- Adversarial ≥8 content types (Rule 29). NOT done.
- `mg.typography.font_size` overlay is still 36-160px ABSOLUTE in `overlay-definitions.json` — G-1 capped it in the renderer (`computeFittedSize`) but the doc's G-1 also wanted the overlay range made frame-fraction. Decide: is the renderer cap sufficient, or also fix the overlay range? (Probably also fix it for cleanliness; flag.)

**The big ones (next phases):**
- **Brand never reaches render** (the bombshell) → G-2. Injection points: `edl-executor:1104/1376`, `director-agent:1060-1083` (thread `UnifiedBrand.visual` into `params.brand`), `composition-planner:268` (break circular brand), `motion-theme-resolver:185-204` (`hierarchyOverrides` seam).
- **Over-firing keywords** (8/13 on the test video; "not every word / not every video") → G-7a selection gate (signal-gated keyword trigger + per-video "wants graphics?" gate).
- **Calibration is NOT done** — nearly every threshold is ⚠️ INVENTED → G-7b (test harness) + G-7c (tune via bandit/real renders). See §15.
- **Transitions = 0** (clip-boundary gate, `edl-executor:590`) → G-5 snap-to-nearest-cut.
- **Captions** render fine but are a 9-preset jukebox, brand-blind → G-4 (kill the jukebox, onto the spine).
- All-same look (color/entrance/treatment) → G-3 (color roles + intensity).

**Infra / lower priority (from the logs):** Mongo `MongoServerSelectionError` 5s timeouts (×2); `text-embedding-004` embedContent failure (asset-analysis); Clerk middleware auth warning; compressor 91MB>90MB; keep-half partial results for V-JEPA/Wav2Vec (single batch failure discards all).

---

## 10. WHAT'S NEXT (prioritized)

1. **Finish G-1:** render `proj_OzG2qgoYudFa` and LOOK at it (superhero/d-bag/INTERNET); adversarial ≥8 types; decide on the overlay font_size range. Then commit G-1.
2. **G-7a (quick, high-value):** stop over-firing keywords — signal-gate the keyword trigger + a per-video gate (your "not every word/video" ask). Build **G-7b** (the calibration test harness) early so later phases are measured, not eyeballed.
3. **G-2:** the brand wire + the `VisualLanguage` spine (the bombshell fix; the actual product for the agency ICP).
4. **G-3:** generative color + intensity (the mobility — makes the moat visible).
5. **G-4/G-5/G-6:** captions onto spine; fusion + transitions snap-to-cut + SFX; Graphiti.
Phased ≤5 files each, real-render verify each, user approval before each code phase.

---

## 11. ⚠️ THE NBSP FOOTGUN (the #1 time-saver for next session)

Source files in this repo can contain **invisible non-breaking spaces (U+00A0)** that look identical to a normal space but break EVERY exact-string multi-line edit (`Edit` tool "string not found" even when you just read the exact text). This cost ~an hour.
- **Symptom:** single-line edits work; any multi-line block fails to match for no visible reason.
- **Diagnose:** PowerShell — find the line, then `0..($line.Length-1) | Where { [char]::IsWhiteSpace($line[$_]) -and [int]$line[$_] -ne 0x20 } | % { 'pos {0}: U+{1:X4}' -f $_, [int]$line[$_] }`. (It was U+00A0 at `composition-renderer.tsx:362`, exactly 1 instance.)
- **Fix:** PowerShell `.Replace([char]0x00A0, ' ')` + write back UTF-8 **no-BOM** via `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))`. Then re-Read (refresh harness state) before editing.
- **Workaround tool:** **Desktop Commander `mcp__Desktop_Commander__edit_block`** (fuzzy match) handled the emoji fine and pinpointed the nbsp diff (`'{- -}{+ +}'`). Reach for it on stubborn multi-line JSX edits. (You can't *type* a U+00A0 — the tool pipeline normalizes it back to a normal space.)
- **Also:** the ⚠️ emoji in comments is fine for `edit_block` but tripped the standard `Edit` once. Prefer `edit_block` for blocks containing emoji/special chars.

---

## 12. TECHNIQUES / WAYS THAT WORKED (reuse these)

- **6 parallel verification agents** (Agent tool, `general-purpose`, read-only) to enrich context across rules/architecture/roadmap/bugs/code-truth/memory AND verify doc claims against code with file:line. This is what caught the bombshell and flipped the phasing. Do this for any big decision: "read X, VERIFY against code, return file:line + contradictions."
- **Real-data Mongo inspection, not unit tests** — `check-mg-recipe.ts` / `check-proj-deep.ts` / `check-proj-overlays.ts` / `check-mg-signals.ts` (all `npx tsx scripts/<name>.ts <projectId>`, default `proj_OzG2qgoYudFa`, DB `editron_prev`). The 112/184-test MG suite injects scores → masks render bugs. Verify on real data.
- **Real-FUNCTION verification:** import the actual `fitFontSize` into the check script and run it on real recipe data (produced the 145→97 proof). Far stronger than re-implementing the logic.
- **Logs-first** (Rule 27): `scripts/read-logs.ts` parses the Vercel CSV export. The logs are ground truth (and the "0 segments" lesson: a log counter can LIE).
- **tsc filtered:** `npx tsc --noEmit > out.txt; Select-String out.txt 'myfile1|myfile2'; total = (Select-String out.txt ': error TS').Count`. Compare total to the **196 baseline** to prove you added 0.
- **`edit_block` fuzzy editor** for stubborn edits (see §11).

---

## 13. LEARNINGS (process — codified)

1. **The nbsp footgun** (§11) — invisible U+00A0 breaks exact-match edits. Biggest single lesson.
2. **Don't let tooling friction drive design.** I switched the word-break fix to a `nowrap` bandaid because the edits kept failing; the user (rightly) rejected it. Tooling pain ≠ a reason to ship a worse design. Fix the tooling (the nbsp), then do the root fix.
3. **Brand never reaches the render** — verify wiring end-to-end, not "the brand system exists." A loaded brand that dies at a prompt boundary is not wired.
4. **Iman-style is a capability, not a preset; intensity is a signal-driven dial.** Don't collapse "premium" into "always minimal" — that's itself a preset.
5. **Captions render fine — I was misled by a lying "0 segments" log.** Always confirm against Mongo/render, not a log counter (echoes the prior session's "0/39 analyzed" lesson).
6. **Code-verified ≠ pixel-verified.** tsc/eslint/real-data-math prove the logic; only a render proves the look. Say which level you're at.
7. **The 196-error baseline** — a big legacy codebase has pre-existing tsc debt; isolate YOUR errors, don't try to fix all 196 (out of scope).
8. **For an agency ICP, no-presets is the business model** (20 clients = 20 looks). The architecture purity has a revenue reason.

---

## 13B. RESEARCH — craft findings, calibration state, sources

**Premium / "Iman-style" editing craft (web research this session):**
- Type: geometric sans (Montserrat family), **weight contrast light↔bold** as the primary expressive lever (not size alone). White lowercase captions with the *spoken* word emphasized (weight jump or color pop).
- Color: **ONE cohesive palette per video** (not rainbow). Restraint. A single accent that recurs.
- Glow: subtle (After Effects "Deep Glow" ≈ CSS text-shadow/blur) on emphasis only.
- Pace: **alternating** — fast cuts then a breath. SFX punctuates each graphic entrance (the screenshots the user sent all had SFX on the MG hits).
- **THE REFRAME (user, load-bearing):** this is a RANGE / capability, not a fixed look. The engine must traverse **mute → mid → loud**, signal-driven, bounded by brand. "Iman-style is a capability our system performs, content-dependent — not a preset." Minimalism is ONE end of the dial, never the universal target.

**Craft laws — `D:\Insturix-Brain\01-Research\Motion-Graphics-Craft.md` (4):** (1) hierarchy-via-scale; (2) restraint / one focal point; (3) title-safe + text-fit; (4) variety-via-sequencing. G-1 implements (3); G-3 implements (1)+(4); the spine enforces (2).

**Screencast / SaaS-demo research (Phase F, adjacent track, same ICP):** OpenScreen (MIT) vendored at `Front-End-main\reference-repos\openscreen-main\` — screen-recording → polished product-demo video; startup demos behave differently from talking-head content (zoom-to-cursor, UI callouts, faster pace). NOTE: the old `phase_f_g_saas_motion.md` "component library / template rigs" framing is **DEAD** — it's the preset jukebox Rule 11 forbids. Rebuild on the same generative spine.

**Calibration state (the honest research finding):** per-moment signals (V-JEPA visual / Wav2Vec prosody / Essentia music) genuinely VARY per moment (verified prior session, `check-mg-signals.ts`). But the **thresholds that act on them are mostly ⚠️ INVENTED / uncalibrated** (this session's finding) — that's the real reason graphics over-fire (keyword 8/13) and look samey even though the inputs vary. Calibration is NOT done. → G-7 (harness + bandit + real-render tuning). See §15 registry.

**Sources:** web (Iman Gadzhi / premium short-form editing breakdowns); vault `Motion-Graphics-Craft.md`; CRG `creative-knowledge-graph.json` (title-safe ← SMPTE ST 2046-1, 90%/5% action/title-safe). Title-safe is format-derived, NOT a magic number (the user pushed on this — don't present it as one).

## 14. REVIEWS RUN (outcomes)

- **/investigate ×2** (Iron Law, root-cause-first): the defaults system → the bombshell; the design issue → the 5 pins, verified on real data.
- **/plan-eng-review:** phasing crux → **brushwork-first** (verification showed the glaring bugs are contained correctness fixes, the signal pipeline is fragile, and the spine is bigger/riskier than the draft said). Architecture findings folded into the doc.
- **/plan-ceo-review:** **ICP = brands/agencies, pre-launch.** The spine IS the product. Generate-not-select = the agency business model. Confirmed brushwork-first; added per-client-brand / brand-extraction-ready / hero-moment-demo to the G-2 spec.
- (gstack Unix telemetry/onboarding preambles were skipped each time — Windows-incompatible, don't advance the work; the review *methodology* was applied.)

---

## 15. INVENTED THRESHOLDS REGISTRY (Rule 31 / E4 — for G-7 calibration)

Guessed numbers introduced this session (each ⚠️ INVENTED, calibrate on real renders / bandit, do NOT hand-tune-and-ship):
- **Focal size cap** `FOCAL_FRAC`: 0.09 (primary/counter) / 0.055 (secondary/label) of frame height — produced 97px for keywords. The "how big" knob.
- `estimateTextWidth` glyph-advance ratios: 0.6 normal / 0.68 caps / ×1.05 bold (conservative-by-design).
- `fitFontSize` `safeFraction` 0.9 (title-safe margin inside the box).
- `minReadable` = 36px × canvasH/1080 (universal type-min floor, resolution-scaled; should be role-aware later).
- Title-safe inset 5% ← CRG `safe_zone.title_safe` 90% (this one is sourced, not invented).
Pre-existing INVENTED (still owed): the `mg.typography.font_size` 36-160 range, intensity floor/ceiling (G-3), palette role ranges (G-3), the keyword-fire / per-video selection gates (G-7a), stagger ratio 0.6.

---

## 16. MUST-NOT-REGRESS (verified fixed earlier; don't break)

`color.surfaceOpacity` backdrop fix (`structural-moves.ts:62`) · fraction/suffix static-stat fix (`StatCounter.tsx:97`) · transition dedup/`afterOverlayId` stability · per-moment signal injection (`8017a70a`) · rank-and-cap calibration. And now: the G-1 size-fit + word-grouping (don't revert to the 64px floor or char-flex-wrap).

---

## 17. ENVIRONMENT / HOW TO RUN

- **Worktree:** `D:\google downloads\Front-End-main\editron-worktree\` → `infrastructure-improvs-+Editron`.
- **DB:** `editron_prev`. **Test project:** `proj_OzG2qgoYudFa` (16:9, 13 MGs, signals vary). Others: `proj_-BouQMiMnZf3`, `proj_l5q1RKJNgiYF`, `proj_XbI_NCq181A2`.
- **Type-check:** `npx tsc --noEmit` (expect 196 baseline; isolate your files). **Lint:** `npx eslint <files> --quiet`.
- **Diagnostics:** `npx tsx scripts/check-mg-recipe.ts proj_OzG2qgoYudFa` (now shows OLD→NEW fit). `check-proj-deep.ts`, `check-mg-signals.ts`, `read-logs.ts "<csv>"`.
- **Screencast repo:** `D:\google downloads\Front-End-main\Front-End-main\reference-repos\openscreen-main\` (MIT; in the `main` worktree, not editron).
- **DO NOT:** `git add -A` (untracked `scripts/*.ts` hold the Mongo URI; `.env.local.*` are secrets). Don't edit code during a verify/get-to-know pass. Don't claim "works" without a real render.
- **PowerShell gotcha:** never `2>&1` on native exes (PS 5.1 wraps output + corrupts filters). Write to a temp file and `Select-String` it instead.

---

## 18. ONE-PARAGRAPH RESUME (if you read nothing else)

Editron's MG engine is stuck at one point in expressive space — every graphic is the same 145px gold uppercase keyword card — and the deepest cause (verified) is that **a customer's brand never reaches the renderer** (always Insturix gold, even for paying brands). The fix is a **generative visual-language spine** (`MG-Generative-Spine-Phase-G.md`): generate designs from `brand bounds × content × per-moment signals × Graphiti`, never select from presets — which, for the brands/agencies ICP, IS the product. Risk-ordered phases G-1 (brushwork) → G-2 (brand wire + spine) → G-3 (color/intensity) → G-4 (captions) → G-5 (fusion/transitions/SFX) → G-6 (Graphiti) → G-7 (selection + calibration). This session built **G-1 (size + word-break)**, UNCOMMITTED, tsc/eslint clean, real-data-verified (145px→97px, 0 overflow) — but **NOT yet rendered to look at the pixels**, and the visual render + adversarial test are owed before G-1 is done. Watch out for the **non-breaking-space footgun (§11)**. Don't re-fix what works; finish G-1's render, then stop the keyword over-firing (G-7a), then build the spine (G-2).
