---
name: Audit Lessons — Self-Rules from 4-Week Commit Audit
description: MANDATORY READ. Rules derived from patterns of failure found in 480-commit audit. Every rule exists because it was violated and caused production breakage.
type: feedback
---

# Audit Lessons — Self-Rules (2026-04-14)

**READ THESE BEFORE EVERY CODE CHANGE. Each rule exists because violating it caused real breakage.**

---

## Rule A1: Never Ship a Model ID Without Testing It Against the Actual API First
**Why:** Analysis model was changed 5 times. gemma-4-31b-it was shipped as default without verifying it supports audio input — it doesn't. Every Seedance video's 5-Track analysis silently failed for weeks.
**How to apply:** Before changing ANY model ID in code:
1. Check the model's actual capabilities (what modalities it supports)
2. Test with a real API call using the exact input format the code sends
3. If you can't test, state that explicitly and flag it as unverified

## Rule A2: Config Changes Are NOT Code Changes
**Why:** editron-config.ts was updated to `gemini-3.1-flash` but gemini-model-factory.ts still hardcoded `gemma-4-31b-it`. The config fix was dead code.
**How to apply:** After changing ANY config/default value:
1. grep for EVERY place that value is read (env var name, hardcoded string, import path)
2. Update ALL locations, not just the config file
3. Verify with grep that zero hardcoded references to the old value remain in active code (comments are OK)

## Rule A3: Never Change a Value Reactively Without Understanding WHY
**Why:** Parser timeout was changed 4 times (90→60→45→90→120). Each change was reactive to the last failure. The root cause (complex Zod schema + Gemini structured output slowness) was never analyzed.
**How to apply:** When something times out or fails:
1. STOP. Read the error. Read the code path. Understand the actual bottleneck.
2. Is the timeout the problem, or is the operation genuinely too slow?
3. If the operation is too slow, fix the operation (simplify schema, use faster model, reduce data). Bumping the timeout is a band-aid.

## Rule A4: Every Fix Must Reach ALL Code Paths
**Why:** "Kill duplicate transitions" was committed but only killed one of two transition systems. The dual transition fix in `edit-direction-applier.ts` was committed while `edl-executor.ts` still placed transitions too.
**How to apply:** After fixing a bug:
1. grep for the PATTERN you fixed, not just the one file
2. If 3 files have the same bug, fix all 3 in the same commit
3. Verify with grep that zero instances of the broken pattern remain

## Rule A5: Never Ship a Feature Without Verifying Downstream Consumers Are Ready
**Why:** Montage sub-shots were added, reverted, re-added (3 times). The first add broke because finalize didn't handle sub-shots. The second add broke because generate-videos didn't dispatch per sub-shot.
**How to apply:** Before committing a feature:
1. Trace the data flow from creation to final consumption
2. Every consumer must handle the new data shape
3. If consumers aren't ready, DON'T ship the feature — ship the consumer support first

## Rule A6: One Source of Truth for Every Value
**Why:** ROW constants hardcoded in 13+ files. Model IDs hardcoded in 4+ files. Timeouts hardcoded in 6+ files. When the value needed to change, only 1 of N locations was updated.
**How to apply:** Before adding ANY constant, config value, or default:
1. Check if it already exists as a constant/config elsewhere
2. If yes, import and use the existing one
3. If no, create ONE source of truth and import it everywhere
4. NEVER duplicate a value with a hardcoded copy

## Rule A7: Verify After EVERY Edit, Not Just Type-Check
**Why:** StoryboardWorkspace.tsx sub-shot thumbnails were committed but the user couldn't see them. Type-check passed but the component might not render due to data issues, conditional rendering, or the feature being behind a toggle.
**How to apply:** After editing UI code:
1. Type-check is necessary but NOT sufficient
2. If a preview server is available, verify visually
3. If not, trace the render path: does the data exist? Is the condition true? Is the component mounted?
4. Read the PARENT component to verify the child is actually rendered

## Rule A8: Do Not Stack Fixes Without Testing Between Them
**Why:** Multiple fixes were batched into "Bundle" commits (Phase A3 Bundle 1-4) with 5-15 changes each. When something broke, it was impossible to isolate which fix caused it, leading to hasty reverts and re-applies.
**How to apply:**
1. One fix, one commit, one verification
2. If the user asks for multiple fixes, do them sequentially with verification between each
3. Never batch more than 3 closely-related changes in one commit

## Rule A9: Before Changing Architecture, Check What Exists
**Why:** Video generation went through 4 architectures in 3 hours (blocking → Redis → Redis+fallback → QStash). QStash was the correct answer from the start — it was already used by Clickatron in the same codebase.
**How to apply:** Before building infrastructure:
1. Search the codebase for existing patterns that solve the same problem
2. If a pattern exists (like QStash for async jobs), use it
3. Don't reinvent what already works

## Rule A10: After Committing, ALWAYS Verify the Deployed Result
**Why:** The analysis model "fix" (555b90ab) was committed, pushed, and declared done. But the factory still used gemma-4. If I had checked Vercel logs after deploy, I would have seen "gemma-4-31b-it" in the analysis calls immediately.
**How to apply:** After pushing a fix:
1. Wait for Vercel deploy
2. Check Vercel logs for the specific code path you changed
3. Verify the fix is actually active, not dead code
