# Phase 1C Failure Analysis

## Status: Lesson learned. MANDATORY reading before any visual intelligence work.

## What Happened (2026-05-15)

Phase 1C added "skip profile transitions when Path D ran." The logic: if the signal-driven path (Path D) already handled transitions, don't let profile actions add more.

The problem: When 5-Track analysis hit Gemini 429 rate limits, Path D had no data to work with. It produced zero transition decisions. The skip gate then blocked profile transitions too. Result: ZERO transitions in the final video.

The system was WORSE than before the change. Basic cutting broke because of visual intelligence logic.

## Root Cause

Visual intelligence logic GATED on data availability. When data wasn't there, the gate blocked EVERYTHING including the existing system that worked fine without visual data.

## The Rule (PERMANENT)

**Any new visual intelligence must be ADDITIVE (suggest), never GATING (block when missing).**

- New capabilities SUGGEST additional actions
- Existing system DECIDES whether to use them  
- If new data is missing, existing system runs EXACTLY as before
- Never use `if (hasVisualData) { skip existing logic }`
- Always use `if (hasVisualData) { add suggestions to decision pool }`

## How This Applies to the Visual Intelligence Architecture

1. L0 signals (silence, beats, scene boundaries) → SUGGEST cut points. Don't gate existing cuts.
2. VES (Visual Engagement Score) → SUGGEST dead segments. Don't block keeping segments.
3. L1 enrichment (Gemini/Qwen3-VL) → ENRICH decisions. Don't gate on availability.
4. Routing (speech/music/visual/hybrid) → SELECT prompt variant. Fall back to speech prompt if detection fails.

## Test for Phase 1C Safety

For ANY new visual intelligence code, ask:
1. What happens when this data source returns null/empty?
2. What happens when the API 429s?
3. Does the existing system produce the SAME output as before when new data is missing?
4. Is there any code path where missing new data causes WORSE output than before?

If answer to #4 is "yes" → REJECT the design. Redesign as additive.

Tags: #architecture #constraint #phase-1c #mandatory
