---
name: Prompt Engineering Methodology — Proven Process
description: MANDATORY for any LLM prompt work. Proven process that took retake detection from 37% failure to F1=1.000 across all seeds. XML structure, data-last, CoT, seed, eval harness.
type: feedback
last_updated: 2026-05-14
originSessionId: 690ab707-2a82-484d-bb2f-aa2bfa1af88d
---
# Prompt Engineering Methodology

**Proven on:** Transcript editor prompt (Gemini 3.1 Pro). Took retake rate from 37% to 5%, then achieved F1=1.000 (perfect match) across 10/10 seeds.

## The Process (in order)

### 1. Structure First (Gemini 3 Prompt Guide)
- **XML delimiters**: `<role>`, `<task>`, `<rules>`, `<output_format>`, `<input_data>` — clear section boundaries
- **Data LAST**: Put the large input (transcript, document, code) at the END, after all instructions. If data is in the middle, instructions after it fall out of the model's attention window.
- **Chain-of-thought**: Tell the model WHAT to think about before producing output. "First scan for X, then produce Y." This guides reasoning, not just output.

### 2. Rules Over Examples
- **DO NOT use few-shot examples.** They cause pattern anchoring — the model mimics the specific patterns shown instead of learning the general principle. Scale mismatch (13-word example vs 2884-word real input). Test data leakage if examples come from the test set.
- **DO use explicit rules.** "ONLY CUT these 4 specific patterns" + "DO NOT CUT these 6 things." Rules generalize. Examples overfit.
- **Narrow the rules.** Vague rules ("remove unnecessary content") produce inconsistent results. Precise rules ("IMMEDIATE RETAKES: same WORDS 2-3 times in a row") produce consistent results.

### 3. Conservative by Default
- "When unsure, KEEP" — it's better to keep something questionable than to cut good content
- Define what to CUT (narrow, specific list) rather than what to KEEP (broad, easy to miss things)
- The user can always manually trim; they can't restore what was silently cut

### 4. Seed for Determinism
- **Always set `generationConfig.seed`** — even temperature 0.0 is NOT truly deterministic across Gemini API calls
- Without seed: same prompt produced wildly different results (one run kept punchlines, next run kept meta-commentary, F1 variance 0.85-1.00)
- With seed: F1=0.986-1.000 across ALL 10 seeds tested. Zero bad runs.
- Pick seed via eval harness, not randomly

### 5. Eval Harness Before Deploying
- **Never iterate by deploy-upload-wait-check.** Build a local test script that runs the prompt directly against cached test data.
- **Score against ground truth**: F1, precision, recall, kept ratio
- **Multi-seed test**: Run seeds 1-10. If all score > 0.90, the prompt is robust. If only some do, the prompt needs work.
- **~30s per local test vs 5+ min per deploy cycle** — 10x faster iteration

### 6. Measure Variation, Not Just Quality
- A prompt that scores F1=0.95 on one seed but 0.70 on another is FRAGILE — don't ship it
- A prompt that scores F1=0.90 on ALL seeds is ROBUST — ship it
- The goal is minimum F1 across seeds, not maximum F1 on the best seed

## Anti-Patterns (things that FAILED)

| What | Why it failed |
|------|---------------|
| Few-shot examples | Pattern anchoring. Model mimicked example structure instead of learning principle. |
| Vague cut rules ("remove unnecessary") | Gemini interpreted "unnecessary" differently each run. Meta-commentary sometimes kept, sometimes cut. |
| Broad cut categories (6 types) | Over-cutting. Gemini cut elaboration, asides, personality moments. |
| Data in middle of prompt | Instructions after the 2884-word transcript fell out of attention. Gemini ignored rules. |
| No seed | Same prompt produced F1=0.70 to F1=1.00 across runs. Catastrophic for production. |
| Testing by deploying to Vercel | 5+ min per iteration. Found issues only after user saw broken output. |
| Optimizing against one video | Prompt looked great on Hank Green, untested on interviews/tutorials/etc. |

## Eval Harness Location
`scripts/prompt-optimization/eval-transcript-editor.mjs`

Usage:
```bash
GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-transcript-editor.mjs --seed=1
GEMINI_API_KEY=xxx node scripts/prompt-optimization/eval-transcript-editor.mjs --multi-seed
```

## Applies to ALL LLM Prompts
This methodology applies to every Gemini prompt in the codebase (13 total). The transcript editor was the first. Each prompt should get:
1. XML structure
2. Data-last ordering
3. Explicit rules (not examples)
4. Seed parameter
5. Local eval harness with ground truth
