---
name: Phase completion verification rule
description: After completing any phase/feature, ALWAYS run a verification scan before moving on — check for broken, unwired, placeholder, or conflicting code
type: feedback
---

After completing ANY phase or feature, ALWAYS verify before moving on:

1. **Broken**: Does the code compile? Are there import errors, missing types, undefined references?
2. **Unwired**: Is every new function/type actually called from where it needs to be? Trace the full data flow end-to-end.
3. **Placeholder**: Are there stub functions, TODO comments, hardcoded values that should be dynamic?
4. **Conflicting**: Does the new code conflict with existing patterns? Does it break any existing functionality?

**Why:** Multiple times during the ThinkForge→Editron pipeline work, code was written but critical wiring was missing (e.g., editDirections extracted by LLM parser but dropped at the export route, Redis client initialized at module level causing cold-start failures, video URLs stripped by saveProject but not restored for video overlays). Each gap caused a production failure that could have been caught by tracing the data flow before committing.

**How to apply:** After each phase commit, run a targeted verification:
- Grep for new types/functions and confirm they're imported and called
- Trace data from source → destination (e.g., LLM output → API response → frontend state → next API call → database → reader)
- Check for TypeScript `any` casts that might hide type mismatches
- Verify no existing tests/patterns are broken by the changes

## Rule 2: No Fallbacks as Solutions
Creating a fallback is NOT a solution. Fix the root cause. Fallbacks mask problems and create technical debt.

## Rule 3: Adversarial Testing Before Deploy
Before declaring any feature done, find every way it can fail:
- Deep analysis of all code paths
- Document failures with file + line + trigger + user impact + severity
- Fix all CRITICAL and HIGH issues before moving on
- Repeat until no new failures found
- No loopholes in this process

## Rule 4: Gemini Call Optimization
Batch related AI calls into single structured prompts where possible:
- 5-track analysis: merge 5 separate calls into 1 structured prompt
- Scene parser + consistency scoring: chain into 1 call
- Style transfer + media analysis: batch if same video
- Reference image analysis: batch all images into 1 multi-image call

**Why:** Each Gemini call adds ~2-15s latency + token cost. Batching saves 4+ calls per pipeline run = 8-60s faster + cheaper.
**How to apply:** Before adding any new Gemini call, check if it can be merged into an existing call by extending the prompt schema.
