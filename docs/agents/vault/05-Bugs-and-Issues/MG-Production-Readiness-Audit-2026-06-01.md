# MG Production-Readiness Audit — 2026-06-01 (adversarial, agency-grade)

Verdict: **NOT production-ready.** A 33-case adversarial sweep (real `planComposition`, every composer, number-formats + scripts + long/short text, 5 signal profiles, 16:9 / 9:16 / 1:1) surfaced ~12 defects in 4 root categories. The clean short/landscape cases were a "good hit." Harness: `scripts/adv2-mgs.ts` → `scripts/render-mg-stills.ts adv2` → `scripts/mg-montage.ts adv2` (contact sheets). #open

The emphasis dial (`cbc97c8a`) + arrangement gate (`6417e819`) are sound and NOT the cause — the GOOD cases prove them. These are pre-existing content/render-robustness gaps (one interacts with the arrangement gate: B1).

## Category A — number handling (stat composer + count-up). Highest damage, most common in business content.
- **A1 (damage 10):** `$1,234,567` renders **`$1`**. CountUpText does `parseFloat("1,234,567")` → stops at comma → counts to 1. ANY thousands-separated number shows the wrong figure. Cases [0][1].
- **A2 (damage 9):** `-15%` (negative) → NOT detected as numeric → falls to `free-text` → **BLANK** (free-text has no `text` field). Case [5]. Root: `COUNTABLE_VALUE_RE` (content-shape-analyzer.ts ~124) rejects leading `-`.
- **A3 (damage 8):** `€1.234,56` (EU format) → free-text → **BLANK**. Case [7]. Same regex rejects EU decimal/grouping.
- **A4 (damage 4, unconfirmed):** `3.14159` decimal may show an interpolated/rounded count value, not the exact figure. Case [6].
- OK: `2/3`, `100M`, `10x` render static + correct (isCountUpValue excludes them).
- Root files: `content-shape-analyzer.ts` numericValueForm/COUNTABLE_VALUE_RE; `composition-planner.ts:370` count-up gate; CountUpText parseFloat in `composition-renderer.tsx`; free-text fallback analyzer:105-112.

## Category B — aspect / box overflow (fit + arrangement). Systemic across aspect ratios.
- **B1 (damage 7):** horizontal comparison **clips in 1:1** — `12% BEFORE → 47% AFTE[R]`, "AFTER" off-frame. Case [21]. The arrangement gate (composition-planner.ts:197) licenses horizontal for comparison regardless of frame WIDTH; a square/portrait row overflows. Fix: gate horizontal also on aspect/row-fit.
- **B2 (damage 7):** long single word overflows the **9:16 corner (486px)** — name/keyword/hashtag. Cases [8][23][26]. Root: `computeFittedSize:314` `minReadable = 36*(canvasHeight/1080)` scales by HEIGHT → 64px in portrait, too big for a width-narrow box. min-font should scale by the SMALLER dimension / box width.

## Category C — script & glyph coverage (i18n). Systemic.
- **C1 (damage 5):** emoji → **tofu** (◆?◆?). Case [24]. Only Latin fonts loaded (mg-fonts.ts).
- **C2 (risk):** CJK [15][25] + Arabic [16] render via local Chromium system-font fallback but will likely **tofu on Lambda** (no CJK/Arabic font bundled); Arabic **RTL direction** not explicitly handled. Needs Lambda-font verification + `direction:rtl`.

## Category D — composer-specific.
- **D1 (damage 8):** structured/callout **title has no `minSize`** → ~16px, smaller than its body. Cases [28][29]. composition-planner.ts:701-712. (Task spawned earlier.)
- **D2:** `free-text` fallback renders BLANK when content lacks `text` (compounds A2/A3) — should fall back to the value or not fire.
- **D3 (damage 4):** 30-word quote → many dense lines (esp 9:16). Content-aware line-fit (attempted, fragile) belongs here. Cases [12][13].
- **D4 (damage 3):** data-viz (sparkline/bars) render SMALL relative to frame. Cases [30][32].

## GOOD (engine works on clean cases): fraction/suffix/mult stats, accented + single + allcaps names, short quote, comparison VERTICAL (9:16) + numbers-horizontal (16:9), "breaking news" keyword, bars + ring charts, all landscape short content.

## Proposed hardening order (by damage): A (numbers — robust parse+format incl. count-up) → B (aspect-aware fit + horizontal gate) → D1 (structured title) → C (i18n fonts + RTL) → D3/D4 (polish). Re-run adv2 after each. Keep adv2 as the regression gate.
