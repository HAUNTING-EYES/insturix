---
tags: [motion-graphics, eval, answer-key, L2, correctness, founder-label, proj_OzG2qgoYudFa]
date: 2026-06-03
status: AWAITING FOUNDER LABELS — fill the blank cells, then L2 scores against this
grounding: real transcript (204 segs) + real 13 MGs, dumped 2026-06-03 from editron_prev
---

# L2 Correctness Answer-Key — proj_OzG2qgoYudFa

This is the **human ground truth** L2 scores against (plan decision D3: founder labels once; tuner consumes `human-label` rows only). Fill the blank cells. L2 checks two things per moment: **did the graphic show the right VALUE**, and **in the right FORM**. (Colour-semantics + negation are deferred — today's form can't encode them.)

**`form_family`** = `proportion | comparison | trend | negation | magnitude | identity | quote | concept | none`
**`semantic_colour`** (for later, when the form can encode it) = green=good/gain · red=bad/loss/false · amber=warn · blue=info · neutral
**`warranted`** = should an MG appear here at all? `yes` / `no` (the keyword-flood test)
**`value`** = the exact string the graphic must display (`"90%"`, `"1/3"`, `""` if none)

## Table A — structure moments (graphics that SHOULD fire). Real transcript quotes.
| seg | quote (abbrev) | warranted? | value | form_family | semantic_colour | salience 0-1 | notes |
|----|----|----|----|----|----|----|----|
| 155 | "...ninety percent of them, are good" | **yes** `[SEED]` | `90%` | `proportion` | `green` | `0.9` | most people are good |
| 129 | "...a third ... that's not true" | **yes** `[SEED]` | `1/3` | `negation` | `red` | `0.8` | refutes the 1/3 claim |
| 86  | "...0.02 human beings" (verify seg#) |  |  |  |  |  | scarcity/magnitude |
| 137 | "...a hundred thousand or more people" |  |  |  |  |  | magnitude |
| 120 | "...much more nasty place than ... the real world" |  |  |  |  |  | comparison (online vs real) |
| 121 | "...fewer and fewer ... worse and worse" |  |  |  |  |  | decline/trend |
| 134 | "selection bias" (verify seg#) |  |  |  |  |  | concept |
| 77/78 | "...worst IN people → worst people" (verify) |  |  |  |  |  | reframe/negation |
| 145 | "YouTube has ... been promoting discussion rather than [thumbs up]" |  |  |  |  |  | shift/comparison |
| 117 | "...narrative of the hateful internet negatively affects the culture" |  |  |  |  |  | concept (optional) |
| 153 | "...the whole point of a troll is to ... get a rise out of people" |  |  |  |  |  | concept (optional) |
| 128 | "...if we all think the internet is less great ... it will become less great" |  |  |  |  |  | causal (optional) |

## Table B — graphics the system ACTUALLY fired (judge each). For scoring TODAY's output.
| MG# | type | shown value | warranted? | correct value | correct form_family | notes |
|----|----|----|----|----|----|----|
| 0 | keyword-highlight | "editing" |  |  |  | flood? |
| 1 | keyword-highlight | "Internet" |  |  |  | flood? |
| 2 | keyword-highlight | "superhero" |  |  |  | flood? |
| 3 | keyword-highlight | "d-bag" |  |  |  | flood? |
| 4 | stat-counter | "0.02" |  |  |  | seg86 magnitude |
| 5 | keyword-highlight | "trolls" |  |  |  | flood? |
| 6 | stat-counter | "1/3" |  |  |  | seg129 — refuted? |
| 7 | callout | **"" (BLANK)** |  |  |  | ⚠️ empty graphic — bug |
| 8 | stat-counter | "100,000" |  |  |  | seg137 magnitude |
| 9 | keyword-highlight | "YouTube" |  |  |  | flood? |
| 10 | stat-counter | "90%" |  |  |  | seg155 proportion |
| 11 | keyword-highlight | "comment" |  |  |  | flood? |
| 12 | keyword-highlight | "Troll" |  |  |  | flood? |

## How L2 uses this
- Each filled Table-A/B row with `value` and/or `form_family` set + `source: human-label` becomes a `CorrectnessGroundTruth`.
- L2 resolves the rendered recipe and scores: value-match + form-match → [0,1].
- `warranted=no` rows tell us where the system OVER-fired (the flood) — feeds the WHETHER/HOW-MANY decision later.
- Only `human-label` rows are used by the tuner.

## FOUNDER LABELS — recorded 2026-06-03 (in chat, founder remote)
- **A) Stats (0.02, 1/3, 100,000, 90%):** warranted ✓, values correct ✓. BUT the **depiction is brand/video/user-dependent** — 90% → a number, a pie, or a donut with bars animating 0→90; the graphic + entrance/exit/animation all vary by brand+content. → **L2 grades structure+value ONLY; the encoding+animation are GENERATED (brand-driven), never graded right/wrong.** (Extend L2's form-family→multiple-kinds mapping; add it to the brand-signal work.)
- **B) The 8 keyword boxes:** **NOT warranted** — they weren't important words. ROOT (code-confirmed): `graphic.keyword_highlight ← speech.energy(INV)` ONLY — **no salience/importance gate**, so it fires on any energetic word. Fix = a WHETHER/salience gate (the EYES "is this worth showing"), NOT L2.
- **C) The "blank" callout (MG[7]):** **NOT blank** — it's a real "Selection Bias / When your sample isn't random" concept callout (composed-structured, binds title+body). The "blank" was a bug in `eval-real.ts` display tooling (didn't check `content.title`) — FIXED. The MG system handled it fine. (Lesson: investigate, don't assume.)
- **D) Structure moments:** "online much nastier than the real world" = **a STATEMENT with emphasis** (highlight "nastier", semantic colour e.g. red per brand), NOT a comparison graphic (founder corrected my guess). "fewer and fewer / worse and worse" = **a trend/decline graphic**, warranted.
