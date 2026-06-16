---
name: Stable Transcript Editor v1
description: STABLE STATE — word-level transcript editor working. Commit 78f39365. 42 clips, 9.3 min, 12% retake rate (down from 37%). DO NOT regress past this.
type: project
last_updated: 2026-05-13
originSessionId: 690ab707-2a82-484d-bb2f-aa2bfa1af88d
---
# ⚠️ STABLE STATE — Transcript Editor v1

**Commit:** `78f39365` on `infrastructure-improvs-+Editron`
**Date:** 2026-05-13
**Deploy:** `dpl_` on Vercel preview (infrastructure branch)

## What It Does
Word-level transcript editor replaces segment-based editorial intent + best-take pipeline. ONE Gemini 3.1 Pro call with full word-level transcript → keep-ranges → removal actions.

## Test Results (Hank Green vlog, 19.6 min)
- **Output:** 9.3 min (557s) — 42 video overlays
- **Retake rate:** 5/42 clips flagged (12%), most are false positives (rhetoric, not retakes)
- **Real retake rate:** ~2-3/42 (5-7%) — down from 18/48 (37%) in old pipeline
- **Meta-commentary:** 4/5 meta sections correctly cut (mic check, "cut that", "note to editors")
- **Duration ratio:** 52.6% removed — reasonable for retake-heavy vlog

## Architecture
1. Grok STT (diarize=true) → cached transcription (2884 words)
2. Silence detection (335 gaps) — NOT merged into plan (caused over-cut bug)
3. Filler detection (77 fillers) — NOT merged into plan
4. **Transcript Editor** (Gemini 3.1 Pro, temperature 0.0) → 46 keep-ranges → 47 removals
5. Content type detection (interview/vlog)
6. Silence removal executor (unchanged)

## Key Files (at this commit)
- `lib/editron/services/transcript-editor.ts` — the new editor (XML structure, rules, CoT, no examples)
- `lib/editron/services/raw-footage-processor.ts` — wired as primary path, fragment pipeline as fallback
- `lib/editron/services/silence-removal-executor.ts` — 1-line ghost segment reason map update

## Commits (5 total)
1. `a124a520` — feat: word-level transcript editor
2. `54ab2236` — fix: don't merge silence/filler when transcript-editor active
3. `c7eac148` — fix: narrow prompt — cut retakes only, not elaboration
4. `841070f9` — fix: Gemini 3 prompt guide — XML structure, data-last, CoT
5. `78f39365` — fix: remove few-shot examples (caused pattern anchoring)

## ⚠️ DO NOT REGRESS
- If any change produces >15% retake rate → REVERT to this commit
- If any change produces <6 min or >12 min output for this video → REVERT
- Test against this video (upload_TwwSJZ34UdcY / upload_KTu0oKzveRZi / upload_zav1RO0MbvPT) before deploying

## Known Limitations
- 78s of dead air within kept content (speaker reading script) — not auto-trimmed, intentional silence concern
- Intro meta-commentary partially kept (borderline — entertaining but production-focused)
- Editorial directives ("I'll put this at the beginning") detected but not acted on
- Not tested on other content types yet
