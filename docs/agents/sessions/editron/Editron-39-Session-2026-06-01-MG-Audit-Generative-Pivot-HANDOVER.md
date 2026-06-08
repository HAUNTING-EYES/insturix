# SESSION HANDOVER — 2026-06-01 (PM) — MG Audit → Generative Pivot decision

> **Canonical handover for this sprint. Read FIRST next session.** This sprint started as "keep going down the frozen-list (emphasis-as-a-dial)" and ended at a strategic decision: **stop hardening thin templates; prove the generative vision on the worst/most-frequent form (keyword-highlight).** Everything below is verified against code / git / real renders this session. Written through CEO + senior-eng + next-me lenses (the /plan-ceo-review + /plan-eng-review framing the founder asked for). #open

---

## 0. TL;DR — the 9 things, if you read nothing else
1. **THE NORTH STAR (clarified, the whole point):** signals must **BUILD** the motion graphic from primitives — **not SELECT** from a menu of graphic types that "look a certain way." Same content can become very different graphics. There are no "graphs that look a fixed way"; the *structure itself* emerges. (§1)
2. **The one caveat that keeps it from being garbage:** "anything as an MG" must be **bounded by LAWS** (one focal point, legible sizes, related things group, motion serves meaning). Generative *within laws* = varied + coherent. Unconstrained = random noise. (§1)
3. **The current system is the opposite of the vision:** it DETECTS a content shape → runs a `composeX` **template** → signals only tune size/colour *inside* a fixed skeleton. The 8 composers ARE 8 templates. **The pivot dissolves them.** (§1, §4)
4. **Production-ready? NO — and not because of bugs.** On a REAL video (`proj_OzG2qgoYudFa`), 13 graphics = **8 keyword-highlights (a single word in a corner), 4 stat-counters, 1 callout. Zero comparisons/quotes/charts** — even though the engine renders all of them. The output is **thin, monotonous, amateur**. Hardening makes it *bug-free thin*. (§4)
5. **The decision:** rebuild **keyword-highlight** (the worst + most-frequent form, 8/13) **richly and generatively** — assemble from primitives + signals + motion, not the thin template. Fixes the most-visible quality problem AND is the proof-of-concept for the vision, on a case verifiable on real data. (§1, §6)
6. **Shipped this sprint: 5 commits, all pushed, all tsc/eslint/render-verified** (cbc97c8a, 6417e819, c2fc4029, 8e717b7f, cb60b736). Emphasis-as-a-scored-dial across all composers, arrangement affordance-gate + aspect fallback, number-format robustness, structured-title fix, and a 4-bug P0 correctness sweep. (§3)
7. **Built a real verification stack:** `scripts/mg-eval.ts` (46-case logic gate, 46/46) + render/montage visual gate + a **live-pipeline runbook** (the real Mongo→Director→render path; `.env.local` is fully provisioned; local render works with zero blockers). (§7)
8. **Full audit done (5 parallel agents), every P0 verified 3× + triaged through 6 lenses.** The biggest finding: the engine's output **doesn't reach a live video** — a dead selection path + a double content-leak starve it (the "5% problem"). (§5, §8)
9. **The founder's working style (internalize it):** catches every preset/overclaim; "looks good on a few renders" = a *good hit*, not proof; demands adversarial verification + brutal honesty + verify-don't-claim; values quality over speed; wants CEO/eng/director/editor lens reviews on big calls. (§9, §12)

---

## 1. THE NORTH STAR — generative, not selective (the clarification that reframed everything)
The founder stated it directly: *"signals don't select what MG to use, they MAKE an MG, so we don't have graphs that look a certain way, we can have like anything as an MG."*

- **Vision:** content gives FACTS (a number, a label, two values, a salient line); signals (+ a visual-language grammar) **assemble** a graphic from raw primitives (text, shapes, lines, motion). The structure, roles, layout, and motion all EMERGE. Same "847 customers" → could be a huge number with a tiny kicker, or inside a ring, or with a drawn underline — because it's *built*, not template-filled.
- **The LAW caveat (do not skip):** pure free generation = incoherent garbage. The reason a stat "looks like big-number+label" is a *legibility convention* that reads instantly. So the real vision = **generate freely from primitives, bounded by LAWS** (one clear focal point; legible sizes; related elements group; motion serves meaning). The laws are physics, not templates; inside them generation is infinite + always coherent. This is the line between *generative* and *random*.
- **Where we are vs the vision:** the engine HAS the raw pieces (text/shape/line/image/chart primitives, a structural-move vocabulary, scored dials, a legibility gate). What's MISSING is the part that **scores the STRUCTURE itself** (which pieces exist, what role each plays, how they're arranged) instead of a composer hardcoding it. The 8 `composeX` functions are the templated layer to **dissolve** into one generative assembler driven by: content-facts (affordances) × signals (scoring) × visual-language grammar × laws (the gate).
- **Consistent with prior arcs:** the previous handover already said "the form emerges from a score," "generate, don't select," "the spine IS the product." This sprint NAMED it cleanly and saw (on real data) why it matters.

---

## 2. THE DECISION ARC — how this session actually went (so you don't re-walk it)
1. **Start:** continue the frozen-list — make "emphasis" (size-contrast between text tiers) a scored signal dial instead of a hardcoded ratio. Shipped for comparison, then all composers.
2. **Founder quality push:** "not all renders look good." I'd overclaimed "render-proven." **Honest re-look proved them right** → found real defects.
3. **Hardening sprint:** fixed numbers ($1,234,567→$1; negatives/EU blank), structured-title inversion, narrow-frame overflow/clip. (commits c2fc4029, 8e717b7f.)
4. **"Is it ACTUALLY production-ready?"** → built a 46-case adversarial harness + ran a **full 5-agent audit.** Answer: **NO** — the engine is good but the *pipeline* only outputs thin text graphics (the 5% problem), plus i18n/silent-render/dead-code issues.
5. **"Verify 3× + review as business owner / agency owner / director / editor / CEO / ENG."** Did it — every P0 confirmed against code; 6-lens triage produced the priority. (§5, §11.)
6. **"Fix ALL, I drive."** → P0 correctness sweep committed (cb60b736).
7. **"Verifiable engine work first"** → then I revealed i18n is actually architectural (fonts are Lambda-gated + chunked), not a quick phase.
8. **"Harden current first, then pivot to generative."** I flagged: the pivot dissolves the composers, so composer-polish is wasted; harden only what survives + blocks shipping.
9. **"Set up the live pipeline"** → mapped + validated it; the real loop runs locally (Mongo→overlays→render), zero blockers; saw the 5% problem on real data.
10. **"It works but the quality is so bad."** → the decisive realization: **the badness is thinness-by-architecture, not bugs.** A word-in-a-corner with no bugs is still a word in a corner.
11. **DECISION:** rebuild keyword-highlight richly/generatively as the proof-of-concept (§6).

---

## 3. WHAT SHIPPED — 5 commits (branch `infrastructure-improvs-+Editron`, all pushed to `origin`)
All: tsc 196 = baseline (+0), eslint clean, render-verified on the harness. Chronological:

| SHA | Plain English | Technical |
|---|---|---|
| `cbc97c8a` | The "important text is bigger" amount is now decided from the video's feel, not hardcoded (comparison graphic). | New `mg.emphasis.scale_contrast` dial → a **modular type-scale ratio** `r`; comparison tiers = `value`, `value/r`, `value/r²`, connector `value/r^1.5`. Guarantees the hierarchy; killed frozen ×0.5/×0.3/×1.3. Also fixed a latent connector>from inversion. |
| `6417e819` | Same auto-sizing for ALL graphic types; and side-by-side layout only when it actually fits the content. | `emphasisRatio()` helper across composeNumeric/Identity/Quotation/Structured (killed the ×0.75 family). **Arrangement affordance-gate**: horizontal licensed only for peer-element shapes (comparison); hero+caption shapes stack vertical. |
| `c2fc4029` | Numbers render correctly (was `$1,234,567`→`$1`; negatives/European blank); callout titles aren't tinier than their body. | `content-shape-analyzer` STATIC_NUMERIC_RE (negative/EU/accounting/range now detected as stats, rendered exact); CountUpText strips thousands separators before parseFloat; `composeStructured` title gets a hero `minSize`. |
| `8e717b7f` | Text no longer overflows/clips in vertical (Reels/TikTok) + square (Instagram). | `fitFontSize` now lets FIT win over the readable floor (a long word keeps its smaller fitting size instead of clamping up + clipping). Horizontal comparison falls back to a vertical stack when aspect < 1.35, and the connector glyph remaps →/↓. |
| `cb60b736` | 4 correctness bugs: keyword graphics rendering as a logo in branded projects; charts colliding; internal signal-wiring + render-ID stability. | (1) edl-executor stops passing brand RENDER-TOKENS as `content.brand` (was mis-firing the brand SHAPE detector). (2) Sparkline gradient `id` now unique (`useId`) — was a global `id="sparkFill"` that collided. (3) `center_avoidance`/`entrance_slide` overlays used dotted `speech.coverage`; live signals are flat `speech_coverage` → fixed. (4) `idEpoch` was `Date.now()` (changed every render, broke Lambda caching) → now FNV-1a of `projectId`. |

(Previous session's last commit was `717a499f` — comparison form + signal-scored layout.)

---

## 4. HONEST STATE OF THE MG SYSTEM
- **Engine capability ≈ 40–60% of pro craft, realized output ≈ 5%** (unchanged diagnosis, now confirmed on real data).
- **Real-data proof (`proj_OzG2qgoYudFa`, dumped + rendered this session):** 13 graphics = **8 keyword-highlight (one word in a corner + underline), 4 stat-counter (number + tiny caption), 1 callout.** Zero comparison/quote/chart/lower-third. All textual, cornered, monotonous, **amateur**. PNGs in `.calibration-temp/mg-stills/proj_OzG2qgoYudFa/`.
- **What genuinely works (verified):** the scoring mechanism (one engine drives ~36 dials), emphasis hierarchy, number-format robustness (incl. `100,000` on real data), text-fit/overflow, the structural-move vocabulary, particles/masks (budget-gated), the gate (observe-only).
- **What's thin / broken:** keyword-highlight over-fires and is impoverished (no kinetic typography, minimal structure, one fixed look); the rich forms (comparison/quote/chart) never get *created* in the live pipeline (see §5/§8); non-English + emoji = tofu.
- **The crux:** the thinness is **architectural** (template + minimal composers + a starved upstream), not a bug list. This is why the founder wants the generative pivot.

---

## 5. THE AUDIT — 5 agents, every P0 verified 3× + 6-lens triaged
Full catalog: `D:\Insturix-Brain\05-Bugs-and-Issues\MG-Production-Readiness-Audit-2026-06-01.md`. Status as of end of sprint (✅ fixed this sprint / ⛔ open):

**P0 (production-breaking):**
- ⛔ **The dead upstream / "5% problem"** — the engine's output doesn't reach a live video. Three independent kills: (a) `director-agent.ts:857` `selectWinners(results, frame)` throws (needs a `Map`), swallowed at `:876`, AND gated off by `USE_UTILITY_LIVE` (default false), AND `:872` discards scorer graphics; (b) **double content-leak**: `unified-edit-intelligence.ts:605/677` type+mapper drop value/label/name/quote/title, then `intent-translator.ts:186` drops them again → engine sees only `{text}`; (c) the only live producer (`signal-executor.ts:346`, regex) emits only number/name → **comparison/quotation/structured composers are UNREACHABLE**; callout is banned (`unified-edit-intelligence.ts:1218`). **This is the #1 thing standing between "engine works" and "a real video gets rich graphics."**
- ✅ **Brand misclassification** (cb60b736) — keyword graphics rendered as wordmarks in branded projects.
- ⛔ **data-viz array `values`** → blank single-value chart (silent). (Sparkline id collision FIXED in cb60b736.)
- ✅ **Signal dot/flat keys** (cb60b736).
- ⛔ **i18n** — only Latin fonts; emoji/CJK/Arabic = tofu on Lambda; no RTL. **Architectural** (see §8).

**P1 (important):**
- ✅ ID-epoch determinism (cb60b736). ⛔ `emphasisLayoutCounter` module-global (order-dependent positions); ⛔ GSAP easing forks by environment + unseeded scramble.
- ⛔ **~300 LOC dead GSAP layer** (scramble/draw/morph unreachable + Lambda-unsafe if it fired); ⛔ dead `composition-templates.ts` (zero registrations); ⛔ resolver CRG map contradicts the planner (64 vs 72); ⛔ dead role-defaults that kill the accent-line's intended `draw`.
- ⛔ **Frozen TASTE (presets-in-disguise):** colour-role assignment (comparison always paints `to` accent), connector-type, split-arrangement (`mg.arrangement.vertical` output is dead — 1-sided spoiler). **NOTE: these dissolve in the generative pivot — do NOT invest in polishing them.**
- ⛔ **3 fully dead dials** (`mg.color.saturation_boost`, `mg.styling.surface_complexity`, `mg.animation.entrance_speed`) — scored every frame, read nowhere.
- ⛔ fps hardcoded 30 (timing drift on non-30fps); ⛔ data-viz edge cases (negative/>100%/>8/sub-1 values).

**P2:** willChange-every-frame, particle cost, count-up % edge, localized number formatting, scene_type='action' hardcode, frozen layout gaps/widths.

---

## 6. THE PLAN / WHAT NEXT
**The decision (next action):** prove the generative vision on **keyword-highlight** — rebuild it to assemble richly from primitives + signals + motion + laws, NOT the thin template. It's the worst + most-frequent form (8/13 on the real project), the most-visible quality win, and verifiable on real data.

**Two tracks (keep them separate):**
- **Generative track (the destination):** keyword-highlight proof → then dissolve the other composers into the generative assembler. This is where richness/quality comes from.
- **Architectural/live-verified track (production plumbing — needed regardless):** fix the dead upstream (the 5% problem — selection path + content-leak) so *anything* reaches a live video; i18n content-aware fonts + RTL; both need the live pipeline (§7), not the harness.

**Explicitly DO NOT do:** polish the composer templates' internals (colour-role/connector/split frozen-list) — the pivot dissolves that layer. (This corrected the original "keep going down the frozen-list" plan.)

**Sequencing question still open with founder:** harden-current-first vs pivot-now. The founder leaned "harden first" but then, seeing the real output quality, leaned toward the generative rebuild. Treat the keyword-highlight generative proof as the agreed next step.

---

## 7. HOW TO VERIFY (the stack — these are your eyes)
**The 112-test suite injects scores and masks render bugs — never trust it. Verify on REAL renders.**
- **Logic gate (deterministic, fast):** `npx tsx scripts/mg-eval.ts` — 46 agency-grade edge cases (number formats, CJK/Arabic/Hindi/emoji, long/short, 5 signal profiles, 4 aspect ratios). Asserts shape-correct / not-blank / value-integrity / hero-sized. **Currently 46/46.** Expand `CASES` freely — it's the standing adversarial corpus.
- **Visual gate:** `npx tsx scripts/render-mg-stills.ts <set>` (self-cleans its dir now) → `npx tsx scripts/mg-montage.ts <set>` → contact-sheet PNGs (read inline; ~16/sheet — scan many cases cheaply). `render-mg-motion.ts <set> [n]` for GIFs (motion is the product; stills are blind to it).
- **Build sets:** `build-emphasis-mgs.ts`, `build-comparison-mg.ts`, `adv2-mgs.ts` (broad adversarial — written by mg-eval.ts).
- **LIVE pipeline (the real Mongo→Director→render path). `.env.local` is FULLY provisioned (Mongo=`editron_prev`, Gemini, Lambda creds).** Full runbook in the audit doc. Key paths:
  - **Read a real project's overlays:** `npx tsx scripts/dump-proj-mgs.ts proj_OzG2qgoYudFa` (works now, zero blockers).
  - **Render real overlays → pixels (no Lambda/AWS):** `render-mg-stills.ts proj_OzG2qgoYudFa` (works now). Verifies *renderer-side* fixes on real data (proved the `100,000` number fix this way). Note: planner-side fixes (emphasis/structured-title) only show after a re-compose (Path A).
  - **Re-run the Director (Path A — to test upstream fixes / does the fix create rich graphics):** a ~15-line harness calling `executeDirectorPlan(projectId, userId, ...)` directly (it persists overlays to Mongo). **BLOCKED ON USER:** the owning `userId` (read off the project doc — confirm OK) + OK to mutate a project (overwrites overlays in `editron_prev`; ~$0.10/~2min, re-invokes Gemini) — recommend cloning the seeded project.
  - **Lambda render of YOUR fixes:** needs `npm run deploy:remotion:prod` first (the live serve-URL runs previously-deployed code). For code verification, prefer local render.
- **Decoys:** `render-mg-real.ts` (old). The 112-suite (masks bugs).
- **Harness gotcha:** Remotion bundler needs the `@/` alias mapped (it's in `render-mg-stills.ts` webpackOverride). U+00A0 nbsp breaks exact-match edits.

---

## 8. OPEN ISSUES / BUGS (prioritized)
1. ⛔ **P0 — Dead upstream ("5% problem").** §5. The #1 production blocker; needs the live pipeline to verify. Mechanical half (selectWinners arity + un-leak the content type/mapper + un-ban callout) + the frontier half (EXTRACTION — making comparison/quote/structured get real content; needs a **Rule-35 eval harness FIRST**, per founder discipline).
2. ⛔ **P0 — i18n (architectural).** Emoji + CJK fonts are split into ~10 unicode-range subset files each; static-loading all blows past the 20-fetch limit + ~50MB/render. Production fix = **content-aware loading** (detect scripts in content → load only needed subsets) — doesn't fit the static-module-eval pattern + needs Lambda verification (local Chromium has system CJK fonts that mask the gap). RTL is font-independent but marginal until fonts load.
3. ⛔ **P0 — data-viz array `values`** → blank single-value chart (silent). Cheap fix (resolve arrays + fail-loud).
4. ⛔ **SECURITY (spawned as a task chip):** several untracked `scripts/*.ts` hardcode a **live Mongo Atlas admin credential** as a plaintext fallback (check-proj-deep, mg-probe, get-transcript, verify-mg-real, check-mg-recipe, check-project-mg, check-proj-overlays). Gitignored but on-disk; rotate + convert to the `.env.local` loader pattern (`dump-proj-mgs.ts` is the clean example).
5. ⛔ **P1 — dead code + determinism:** ~300 LOC GSAP layer, `composition-templates.ts`, resolver CRG dup (64≠72), dead role-defaults, `emphasisLayoutCounter`, GSAP easing fork. (Cleanup that *survives* the pivot + gives it a clean base.)
6. ⛔ **P1 — frozen TASTE** (colour-role/connector/split, 3 dead dials). **Dissolves in the pivot — don't polish.**

---

## 9. TECHNIQUES & LEARNINGS (the meta — what makes work here smooth)
- **LAW vs TASTE** is still the test for "is it a preset": a content-invariant FACT (keep) vs a frozen aesthetic CHOICE (make it scored / let it emerge). The generative vision is the ultimate application — even the STRUCTURE is a choice that should emerge.
- **"Good hit" ≠ proof.** A few friendly renders looking good is a *good hit*. Production-ready needs an **adversarial sweep** (number formats, scripts, aspect ratios, long/short) + honest per-case reading. The founder caught me overclaiming "render-proven" twice; the eval harness + montage is the antidote.
- **Adversarial-verify before claiming production-ready** (Rule 3N/29). The 46-case eval + montage found ~12 defects the happy path missed.
- **The harness can't verify everything.** It drives `planComposition` + the real renderer — great for engine/render fixes — but it CANNOT verify the upstream (selection/content) or Lambda fonts. Those need the live pipeline. Know which layer a fix lives in before claiming it's verified.
- **The "dissolution" insight:** if you're about to harden a layer that an upcoming architecture change will delete, STOP — that's wasted effort. (The composer-template polish.)
- **Verify findings 3× + multi-lens** before a big fix-all: agent-found → read the code yourself → cross-agent corroboration; then triage through CEO/agency/director/editor/eng. It re-prioritized the whole list and caught nuance (e.g. the brand bug is latent-but-fires-on-branded-projects).
- **Modular type-scale** (one ratio `r`, each tier = `prev/r`) is how typographers build hierarchy — it GUARANTEES `value>from>connector>label` and collapses N invented constants into ONE scored parameter. Reuse this pattern for any size-hierarchy.
- **Fit-wins-over-floor:** when text can't reach the readable floor in a narrow box, keep the smaller fitting size (on-frame) rather than clamping up (overflow). Overflow is the worst outcome.
- **Numbers:** count-up must strip thousands separators before `parseFloat` (else `1,234,567`→`1`) and re-format on display; detect negative/EU/accounting/range as static stats (else they fall to blank free-text).
- **Swallowed-error anti-pattern:** a `catch` that logs "skipped/non-fatal" hid a total, long-dead bug (the selectWinners throw). Distrust benign-looking catches; fail loud in dev (R18N).
- **Sub-agent swarming** (5 parallel auditors, own context windows) mapped the whole MG system + the live-pipeline runbook in one pass — essential when a task spans >5 files in a saturated context.
- **Don't `git add -A` / `git add scripts/`** — scripts hold a Mongo URI. Stage source by explicit path. `origin` only, never `haunting`.

---

## 10. RESEARCH DONE THIS SESSION (don't re-do)
- **Font reality for i18n:** `@remotion/google-fonts` HAS NotoColorEmoji / NotoSansArabic / Devanagari / Hebrew / SC / JP. BUT emoji + CJK are chunked into ~10 unicode-range subset files (`subsets:['emoji']` *throws*; you load `[0]`..`[9]`). → static-load-all is infeasible (fetch limit + bundle size); content-aware loading is the production approach.
- **Live-pipeline runbook (full):** entry points (`/api/internal/workers/director` → `executeDirectorPlan` @ director-agent.ts:50 → `executeEDL` → persists to Mongo @ :1688), env (`.env.local` provisioned, DB=`editron_prev`), the script inventory (readers vs planComposition harnesses vs render harnesses), Path A/B1/B3. In the audit doc.
- **The 5-agent audit** (engine / renderer / selection-pipeline / scoring+gate / i18n-determinism-Lambda) — findings in §5 + the audit doc. The `mg.*` dial wiring table (36 wired, 3 dead, the frozen ones) is in the audit doc.

---

## 11. THE 6-LENS REVIEW (CEO / agency-owner / director / editor / eng / self — the /plan-*-review framing)
- **CEO / business:** the moat is "signals generate any MG, no presets." Today a buyer sees thin text-in-a-corner → the moat is invisible + the product looks amateur. The #1 commercial unlock is making real videos get *rich, varied* graphics — which is the upstream fix (so anything appears) + the generative rebuild (so what appears is good). Global = i18n is a market gate.
- **Agency owner (customer):** would reject today — "I uploaded footage and got word-labels in corners, not the comparison/chart graphics you demoed," and non-English = tofu. Wrong numbers (now fixed) would have been an instant trust-killer.
- **Director:** the output is locally-optimal, not authored — same look every keyword, no kinetic energy, no through-line. Generative + laws is the path to "directed."
- **Editor:** value-integrity (numbers) + overflow are now solid; the craft gaps are richness (kinetic type) + timing/placement (not yet built).
- **Eng:** the bugs were real + fixable; the architecture is sound *where wired* (one scoring engine); the debt is the dead upstream, ~300 LOC dead GSAP, the frozen composers (to dissolve), and the i18n font strategy.
- **Self (next-me):** don't get lost in composer micro-fixes; the leverage is upstream (plumbing) + generative (quality). Verify the layer you're claiming.

---

## 12. WHAT NEXT-ME SHOULD HAVE AT SESSION START (the founder's explicit meta-ask)
Reading the chat back, the friction came from NOT having these up front. Put them in front of the next session:
1. **The north star, generative form (§1):** signals BUILD the MG from primitives, bounded by laws — not select+tune a template. The composers are the layer to dissolve.
2. **The real-data picture (§4):** engine 40-60% / output 5%; on a real video it's 8/13 word-in-a-corner. The thinness is architectural, not bugs.
3. **The verification stack (§7):** mg-eval.ts (logic), render+montage (visual), and the live-pipeline runbook — AND which layer each verifies (engine/render = harness; upstream/Lambda = live pipeline only).
4. **The audit (§5/§8)** so you don't re-discover the 5% problem, the dead upstream file:lines, i18n, the security flag.
5. **The "good hit" + adversarial-verify lesson (§9)** — so you don't overclaim "render-proven" again.
6. **The dissolution rule (§6/§9)** — don't polish composer internals; the pivot deletes them.
7. **The founder's working style:** catches every preset + overclaim; wants brutal honesty, adversarial testing, verify-don't-claim, quality-over-speed; wants CEO/eng/director/editor lens reviews on big calls; "ask before committing" (but pre-authorized per-phase commits when he says "I drive"); redirects in free text, not always via the options.
8. **Git/footguns (§14).**

---

## 13. KEY FILES / SYSTEM MAP
- **ENGINE (generative-capable, mostly works):** `lib/editron/motion-graphics/engine/{composition-planner, content-shape-analyzer, composition-renderer.tsx, primitive-renderers, property-resolver, structural-moves, data-viz-renderers.tsx, choreography-computer, gsap-timeline, brand-pattern-generator, composition-templates[DEAD], recipe-types}` + `data/motion-theme-resolver`, `mg-fonts.ts`.
- **THE COMPOSERS (the templates to dissolve):** `composition-planner.ts` `composeNumeric/Identity/Quotation/Emphasis/Brand/Structured/DataSeries/Comparison`.
- **SELECTION/CONTENT (the starved upstream — the 5% problem):** `services/{edl-executor[MG path ~1126], intent-translator[leak ~186], signal-executor[regex producer ~346], unified-edit-intelligence[type/mapper leak ~605/677, callout ban ~1218], creative-brief}`, `agent/director-agent[dead selectWinners ~857, executeDirectorPlan ~50]`, `engine/overlay-bridge`.
- **SCORING/DATA/GATE:** `engine/{utility-scorer, response-curves, overlay-definitions.json[the mg.* dials], overlay-definitions-loader, utility-types}`, `motion-graphics/engine/structural-gate[observe-only]`.
- **RENDER MOUNT + fonts:** `components/.../overlays/motion-graphic/motion-graphic-layer-content.tsx`, `mg-fonts.ts`.
- **VERIFY HARNESS (untracked `scripts/`):** `mg-eval.ts`, `render-mg-stills.ts`, `render-mg-motion.ts`, `mg-montage.ts`, `build-{emphasis,comparison}-mgs.ts`, `adv2-mgs.ts`, `dump-proj-mgs.ts`, `mg-probe.ts` (find test projects), `verify-mg-real.ts`.

---

## 14. FOOTGUNS / HARD RULES
- Push to `origin` (Insturix/Front-End) ONLY, **never** `haunting`. `infrastructure-improvs-+Editron` = the Vercel preview branch.
- **NEVER `git add -A` / `git add scripts/`** — scripts hold a live Mongo URI. Stage real source by explicit path.
- Verify on REAL renders (harness PNGs/montage), never the 112-suite (masks render bugs).
- Know the verification layer: engine/render = harness; upstream selection/content + Lambda fonts = live pipeline only.
- Don't polish the composer templates — the generative pivot dissolves them.
- Curve params / thresholds are INVENTED (calibration deferred — reference videos, no users needed). Don't treat them as tuned.
- `render-mg-real.ts` is a decoy. U+00A0 nbsp breaks exact-match edits.

---

## 15. DOC INDEX (read order next session)
**Read first:** this handover → [[MG-Production-Readiness-Audit-2026-06-01]] (the full P0/P1 catalog + live-pipeline runbook + the mg.* dial table) → [[MG-Master-Plan-v3]] (the plan + frozen-list status, now superseded on the "harden composers" front by the generative decision).
**Reference:** [[MG-Form-Selection-Architecture]], [[MG-Capability-Map]], [[MG-Colour-Engine]], [[Doc-vs-Code-Reconciliation-2026-05-31]].
**Memory mirrors:** `session_emphasis_dial_2026_06_01.md`, `MEMORY.md` (latest-handover bullet), `commit_history_audit`.
