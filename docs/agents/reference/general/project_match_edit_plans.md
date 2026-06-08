---
name: Match Edit + Auto Edit Plans (Teammate Proposals)
description: Two architecture plans for Mode 2 (user footage → AI edit) and Match Edit (reference-guided style transfer). Source files on Desktop.
type: project
originSessionId: e9517597-4c40-448b-a355-67656f26e0c7
---
# Match Edit + Auto Edit Plans

Two plans from teammate, stored at:
- `C:\Users\admin\OneDrive\Desktop\EDITRON_MATCH_EDIT_PLAN.md` — Match Edit (Mode A: reference-guided + Mode B: auto edit)
- `C:\Users\admin\OneDrive\Desktop\editron_auto_edit_plan2.md` — Auto Edit from Asset (Reverse Storyboard approach)

**Key architectural insight (both plans agree):** "If you can fake a storyboard from a real video, the entire Director pipeline runs as-is." The missing piece is `video-understanding-service.ts` (Gemini Vision → SyntheticStoryboard).

**Mode B (Auto Edit) is nearly free:** Deepgram transcription ($0.01/min) + profile detection (rule-based, $0) + Director (deterministic, $0) = ~$0.05 total.

**Mode A (Reference-Guided) adds:** 1 Gemini call for EditDNA+contentMap ($0.03) + per-gap video gen ($0.60 each).

**How to apply:** When building Mode 2 UI, follow Plan 2's "Auto-Edit This" button approach for V1. Plan 1's MatchEditDialog is the full V2 vision.
