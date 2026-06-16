---
tags: [research, motion-graphics, design, phase-g]
status: #decided
created: 2026-05-30
related: [[MG-Anchor-System-Tier3]], [[Rules-and-Constraints]]
---

# Motion Graphics — The Craft (Research Reference)

> Durable craft knowledge for building Editron's MG engine to a professional bar.
> Researched 2026-05-30 after real-run screenshots showed amateur output (oversized,
> overflowing text, monotonous, keyword-highlight-only). Read this before any **Phase G** work.
> Session context: [[session_handover_2026_05_30_mg_signals_design]].

## Why this exists
The MG **signal pipeline** is correct (graphics react to per-moment V-JEPA/Wav2Vec signals).
The MG **design/render** layer is amateur. This doc captures the craft principles the engine
must satisfy so the next session designs from knowledge, not guesswork. #decided

---

## The four laws (every source repeats these)

### 1. Hierarchy through scale
Primary = biggest/boldest. Supporting = smaller/subtler. Fine print = simple fade.
A viewer's eye must be *told* what matters by *relative size*.
- **Editron violation:** every word gets the loudest treatment → nothing has weight.
- **Fix direction:** one focal size per graphic; supporting text as ratios (≈0.5×, 0.35×).
- Sources: [ikagency — kinetic typography](https://www.ikagency.com/graphic-design-typography/kinetic-typography/), [Toptal — motion design principles](https://www.toptal.com/designers/ux/motion-design-principles)

### 2. Restraint is the pro/amateur line
"One well-timed scale animation beats ten simultaneous effects." Fewer, better, more deliberate.
- **Editron violation:** fills 30–40% of frame; graphics *every* keyword.
- **Fix direction:** rank-and-cap harder; graphic only the few moments that matter.
- Sources: [Draftss — 10 principles](https://draftss.com/10-key-principles-of-motion-design), [Mockplus — 20 principles](https://www.mockplus.com/blog/post/20-motion-design-principles-with-examples)

### 3. Title-safe + text-fit
Text lives in the inner **80%** (title-safe); action in inner **90%** (action-safe).
Text MUST fit its container — `clamp()` / fit-text — and **never break mid-word**.
- **Editron violation:** "D-BAG" runs off the right edge; "SUPERHER/O" breaks mid-word.
  The 64px global floor + fixed minSize ignore container width entirely.
- **Fix direction:** fit-to-title-safe-box (measure → scale to fit inner 80% → never overflow).
  Handle 9:16 vs 16:9 safe areas separately.
- Sources: [eks.tv — title-safe still matters](https://eks.tv/title-safe-still-matters/), [CSS-Tricks — fitting text to a container](https://css-tricks.com/fitting-text-to-a-container/)

### 4. Variety through sequencing, not repetition
Build in passes (background → supporting → primary). Alternate fast/slow. *Reveal*, don't *pop*.
- **Editron violation:** one identical treatment (gold uppercase word + dark card + underline) every time.
- **Fix direction:** map the (now-working) per-moment signals → distinct treatments + reveals.
- Sources: [Moonb — 18 types of motion graphics](https://www.moonb.io/blog/types-of-motion-graphics), [Wikipedia — kinetic typography](https://en.wikipedia.org/wiki/Kinetic_typography)

---

## The domain is ~18 types — Editron does 1
Kinetic typography · title sequences · animated data-viz / infographics · lower thirds ·
logo stings · animated titles · transitions · flat-design promos · product showcases ·
broadcast packages · and more. Editron collapses all into **"keyword-highlight"** = the
Tier-1 (Canva) reduction that **Rule 11 explicitly forbids**. #open
- Source: [Moonb — 18 types](https://www.moonb.io/blog/types-of-motion-graphics)

## Kinetic typography (the type we're closest to — done right)
Real kinetic typography *reveals* and *builds phrases* — typewriter, mask-wipe, scale-pop,
morph — not a single static word popping onto a card. It follows the audio. A static gold word
is not "wowing"; the motion and the build are the craft.
- Source: [Wikipedia — kinetic typography](https://en.wikipedia.org/wiki/Kinetic_typography), [ikagency](https://www.ikagency.com/graphic-design-typography/kinetic-typography/)

---

## Technical (how to build it right in Remotion)
- **`spring()` physics** for natural easing — not linear frame tables. Choreography is COMPUTED
  from visual-language tokens (stagger × enterOrder × easing), per Rule 11. Never hardcode frame numbers.
- **Text-fit:** measure-then-scale (binary-search font-size to fit box) or CSS `clamp()` / container queries.
- **Audio sync:** land reveals on beats. Essentia beats + word timings already exist in the Editron
  pipeline — "syncing motion to audio multiplies impact."
- **Fail loud:** if text can't fit even at min size → TRUNCATE or switch MG type, never overflow silently.

---

## Defect → principle → fix (the actionable map)
| Screenshot defect | Violated law | Fix direction |
|---|---|---|
| Graphics too big | #1 Hierarchy via scale | scale hierarchy: one focal size, supporting as ratios |
| Text off-screen / mid-word break | #3 Title-safe + text-fit | fit-to-title-safe-box, never break mid-word |
| All look the same | #4 Variety via sequencing | map per-moment signals → distinct treatments + reveals |
| All keyword-highlight | Domain breadth / Rule 11 | numerics→data-viz, phrases→kinetic build, title/lower-third done well |
| Not wowing | #2 Restraint + reveals | fewer/better graphics; reveal animations + audio sync |

---

## How this feeds Phase G (the plan)
See [[session_handover_2026_05_30_mg_signals_design]] §13. In short:
- **G-1** sizing/hierarchy/text-fit (quick visible win — fixes "too big" + "broken text")
- **G-2** visual variety wired to the now-working per-moment signals (makes the moat visible)
- **G-3** beyond keyword-highlight (numerics→data-viz, quotes→kinetic build) — Rule 11
- **G-4** audio-synced reveals (Essentia beats) + caption restyle

## Guardrails (don't undo the thesis)
- NO presets, NO templates, NO hardcoded choreography. Signals drive everything. #decided
- Extend the ENGINE, never add `LowerThird.tsx`-style named components (Rule 11).
- Verify with REAL renders, not the 112-test MG suite (it injects scores → masks render bugs).
- Adversarially test text-fit across ≥8 content types (long words, CJK, all-caps, multiline, 9:16/16:9).
