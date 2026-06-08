---
name: Never re-introduce reverted patterns without checking git history
description: Single-source gate for Mode 2 transitions was tried and reverted (commit a42a358d). Don't re-add blanket kill switches. Use data-driven per-boundary decisions instead.
type: feedback
originSessionId: 6b91e66b-5e93-497e-9695-0376279de350
---
Do NOT add blanket single-source gates that suppress all transitions/SFX/keyframes for Mode 2.

**Why:** Commit `a42a358d` (May 9) already tried and reverted this exact pattern. The revert message: "A single uploaded file can contain multiple distinct scenes (vlog with locations, wedding ceremony+reception, compilation). The right approach: use continuity scores to decide per-boundary."

**How to apply:**
- Before designing ANY Mode 2 gate: run `git log --oneline --all | grep -i "single-source\|isSingleSource"` to check history
- "Single source" does NOT mean "single scene" — a vlog has many scenes in one file
- The correct approach is DATA-DRIVEN per-boundary decisions (feed real per-segment visual data to continuity scoring)
- Never use content-type as a blanket gate either — the system must work for ALL content types (Rule 0)
- The fix implemented: map 5-Track keyframes to segments by timestamp so each segment gets its own colors/energy, letting continuity scoring produce meaningful per-boundary variation
