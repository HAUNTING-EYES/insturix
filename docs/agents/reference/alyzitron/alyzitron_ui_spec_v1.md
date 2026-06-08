---
name: Alyzitron UI/UX Spec v1.0 — Locked
description: Alyzitron analysis tool spec. Intake → analyzing → report. One number + one sentence + three fixes. Source at D:\google downloads\alyzitron-spec (1).md. Companion JSX at D:\google downloads\Alyzitron (2).jsx (1128 lines)
type: project
originSessionId: 8d7e7000-8452-489c-81f8-105084b2ef5c
---
# Alyzitron UI Spec v1.0

**Source:** `D:\google downloads\alyzitron-spec (1).md` (830 lines)
**Prototype:** `D:\google downloads\Alyzitron (2).jsx` (1128 lines, working)

## Core UX
- One number + one sentence = the whole answer
- Three timestamped fixes (click timestamp → scrub to that point)
- Everything else hidden under "Show everything ↓"

## Intake Screen
- Hero: "Let's analyze what you made." (44px, 800 weight, -0.035em tracking)
- Input: URL paste + drag file, inline "Analyze" button (gold when has content, disabled when empty)
- Format support line: "YouTube · Instagram · TikTok · MP4 · MOV" (mono 10px faint)
- Job list below with live animated rows

## Job Row (3 states)
- Analyzing: gold bar fill (0%→100% through 4 stages), pulsing dot, stage labels ("Watching"→"Listening"→"Reading your brand"→"Judging")
- Done: score pill (green/gold/red by bucket), verdict preview inline, clickable
- Error: red border, "Retry" ghost button (TODO)

## Report Screen
- Above fold: video player (left) + score 110px + verdict sentence (right)
- Verdict: first half primary, second half danger red
- Three fixes: timestamp (gold mono, clickable) + title + note
- "Show everything ↓": titles, description, per-metric scores

## Score Buckets
- ≥85 → green (#5EC97E) | 70-84 → gold (#D4A652) | <70 → red (#D46A5C)
