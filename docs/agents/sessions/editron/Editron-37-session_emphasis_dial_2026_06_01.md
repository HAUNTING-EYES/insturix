---
name: session-emphasis-dial-2026-06-01
description: "MG generative pivot session — emphasis emergent across all composers, arrangement affordance-gate, number+structured robustness, AND a standing adversarial eval harness. 3 commits pushed; Cat B (fit) + C (i18n) remain."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6b271cc9-3560-4d8e-82f8-349ac5cc6458
---

**3 commits pushed to origin (`infrastructure-improvs-+Editron`):**
- `cbc97c8a` — emphasis as a scored dial in the comparison composer (frozen ×0.5/×0.3/×1.3 → one `mg.emphasis.scale_contrast` modular type-scale ratio).
- `6417e819` — rolled the dial to ALL composers (numeric/identity/quotation/structured via shared `emphasisRatio()` helper) + **arrangement AFFORDANCE-GATE** (horizontal licensed only for peer shapes=comparison; hero+caption stack vertical).
- `c2fc4029` — **content robustness**: number formats + structured-title hierarchy.

**THE BIG LESSON (founder drove this):** "looks good" from a few friendly renders is a "good hit," NOT production-ready. Agencies don't forgive mistakes. An adversarial sweep across number-formats/scripts/aspects found ~12 defects the happy-path missed. ALWAYS adversarially verify (Rule 3N/29) before claiming production-ready.

**THE STANDING EVAL HARNESS (the founder's ask: "make adv2 the normal, expand it"):**
- `scripts/mg-eval.ts` — CANONICAL regression gate. 46 agency-grade edge cases (number formats, CJK/Arabic/Hindi/emoji/ZWJ, long/short text, 5 signal profiles E/F/N/X/C, aspects 16:9/9:16/1:1/4:5). Deterministic per-case PASS/FAIL: shape-correct, not-blank, value-integrity, hero-sized. **Currently 46/46 logic-gate pass.** Run: `npx tsx scripts/mg-eval.ts`.
- VISUAL gate: `scripts/render-mg-stills.ts adv2` (self-cleans its dir now) → `scripts/mg-montage.ts adv2` (sharp contact sheets, ~16/sheet — read the montage PNGs to scan many cases cheaply). Covers overflow/tofu/wrap/alignment the logic gate can't.
- Expand CASES in mg-eval.ts freely — it's the standing adversarial corpus.

**RESOLVED + render-confirmed:** emphasis emergent (all composers); arrangement gate (energetic stat/lower-third/quote stack cleanly, comparison still horizontal); numbers ($1,234,567/£4,500/₹/EU/negative/accounting/range/0 all correct — were "$1" or BLANK); structured callout title now hero-sized (was ~16px inverted).

**REMAINING (founder: "resolve ALL"). Full catalog: `D:\Insturix-Brain\05-Bugs-and-Issues\MG-Production-Readiness-Audit-2026-06-01.md`:**
- **Cat B — fit/overflow (visual gate):** (B2) 9:16/portrait corner overflow — `computeFittedSize` minReadable = `36*(canvasHeight/1080)` scales by HEIGHT → 64px in portrait, too big for the 486px-wide box; fix = scale by box WIDTH / smaller dim. (B1) horizontal comparison CLIPS in 1:1 ("AFTER" off-frame) — arrangement gate (composition-planner.ts ~197) licenses horizontal regardless of frame width; add a row-fit/aspect check. (D3) dense long-quote wrap.
- **Cat C — i18n:** emoji → tofu (ZWJ explodes to 6 boxes); CJK/Arabic/Hindi render via local Chromium fallback but risk tofu on Lambda (only Latin fonts in mg-fonts.ts); Arabic RTL direction unhandled. Needs fallback fonts (emoji/CJK/Arabic) + `direction:rtl` + Lambda font verification.
- (D4) data-viz renders small (polish).

**Footguns held:** staged source by explicit path only, never `git add -A`/`scripts/` (Mongo URI); origin only never haunting; verified on REAL renders not the 112-suite. Reverted a fragile content-aware line-budget (greedy line-count was a no-op + CSS-wrap prediction unreliable) — fit will be done properly in Cat B (width-aware min-font). Curve params still INVENTED (calibration deferred). Form-selection path STILL DEAD (director-agent.ts:857) — fix before extraction.
