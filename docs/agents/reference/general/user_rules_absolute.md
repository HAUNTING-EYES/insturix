---
name: Absolute Rules (User-Stated, Non-Negotiable)
description: Hard rules from the user. Violating these = session failure. Added 2026-05-15.
type: feedback
originSessionId: d72a2bcb-7e10-464e-b42e-c0d56a550793
---
# ABSOLUTE RULES — NEVER VIOLATE

## Rule A: No Stubs, No Hallucinated Constants, No Unverified Logic

- NEVER put stub code, placeholder logic, or TODO comments in shipped code
- NEVER hallucinate constants, thresholds, values, or data — if you don't know it, READ THE CODE or ASK
- NEVER write logic you haven't verified against the actual codebase
- If a value doesn't exist in the code, don't invent it
- If a function signature is unclear, READ IT, don't guess
- "I'll fill this in later" is NOT acceptable — fill it in NOW or don't write it

## Rule B: Every Decision Must Pass the Production Test

Before every logic/design/architecture decision, ask:

1. **Is this production-level?** Would a senior engineer at a top company approve this for production?
2. **Is this scalable?** Does this work at 10x users, 100x data, 1000x requests?
3. **Is this the right direction?** Not just "does it work" but "is this how it SHOULD work"?

If any answer is NO, stop and redesign before writing code.

No MVPs. No "good enough for now." No shortcuts that create debt.
Every line of code ships as if it's the final version.
