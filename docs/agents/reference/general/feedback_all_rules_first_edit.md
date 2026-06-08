---
name: feedback-all-rules-first-edit
description: Follow ALL 67 rules from the FIRST edit — checking after wastes tokens and time
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a57fdda9-46a8-4ea2-9d98-c16600953870
---

# Follow ALL Rules From First Edit

**Why:** Session 2026-05-26. Phase 1 and Phase 2 of overlay system fix had 8 rule violations caught after the fact. Each violation → user asks "did you follow rules?" → check → find violations → fix → re-check. This cycle burned ~3 exchanges worth of tokens and time per phase. Doing it right the first time saves everything.

**How to apply:** Before EVERY code edit, run this mental checklist as ONE block (not piecemeal):

## The Full Pre-Edit Checklist (compressed)

```
BEFORE: Rule 1 (dead code if >300 LOC refactor), Rule 9 (re-read file), Rule 6 (re-read if 10+ msgs)
EVIDENCE: E1 (graph), E2 (docs), E3 (deps/blast radius), E4 (threshold sources), E5 (rule check)
QUALITY: R17N (deliberate), R19N (domain expert), R23N (never MVP), R18N (deterministic)
SAFETY: R10N (verify assumptions), R3N/R29 (adversarial edge cases), R2N (no fallbacks), A9 (check existing)
CREATIVE: R25N (CRG query if creative), R22N (graphify if structural)
ALL PATHS: A4 (all code paths), A5 (downstream consumers)
AFTER: Rule 9 (re-read file), R20N (document findings in vault), R34 (verify with run logs if possible)
```

## What Gets Missed Most Often
1. **Rule 9 (re-read AFTER)** — tests passing ≠ re-reading the file
2. **R3N (adversarial)** — edge cases for new functions (empty input, NaN, duplicates, overflow)
3. **A4 (all code paths)** — if 3 call sites exist, verify all 3, not just the one you touched
4. **R20N (document)** — write to vault DURING the session, not "later"
5. **A9 (check existing)** — grep for similar functions before writing new ones

## The Cost of Checking After
- User asks → 1 exchange
- Identify violations → 1 exchange
- Fix violations → 1-2 exchanges
- Re-verify → 1 exchange
= 4-5 exchanges wasted per phase

## The Cost of Checking Before
- Run compressed checklist → 30 seconds of thinking before the edit
= 0 exchanges wasted

Related: [[feedback_rules_upfront]] (same principle, different session)
