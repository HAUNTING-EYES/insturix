---
name: Session Handover — 2026-05-05 (Editron Mode 2)
description: Mode 2 signal-driven architecture built + creative doc v3 graph. Multiple deploy test rounds. Core remaining issue — 260MB video OOMs on 2048MB Vercel function because Gemini URL limit is 100MB.
type: project
originSessionId: 2026-05-05-editron
---

# Session Handover — May 5, 2026 (Editron Mode 2)

## CRITICAL BLOCKER — Fix This First

**260MB video exceeds Gemini's 100MB external URL limit → falls to buffer path → downloads 260MB into RAM → OOM kill at 2048MB.**

CDN URL direct works for ≤100MB. This video is 260MB. The old download path is the ONLY option for >100MB and it OOMs.

**Why is the video 260MB?** Client-side compression (`COMPRESS_THRESHOLD = 100MB`) should have compressed this to 720p (~60MB) before upload. It DIDN'T fire. Investigate why. If compression works, ALL videos on CDN are <100MB → CDN URL direct handles everything → no buffer → no OOM.

**Quick check for next session:** Look at `lib/editron/client/video-compressor.ts` and `components/editron/project/project-dashboard.tsx` upload flow. The `shouldCompress(file)` function checks `file.size > 100MB`. If the video was uploaded via a path that bypasses this check (e.g., drag-and-drop, or the Auto-Edit dialog upload), compression never triggers.

## What Was Built (15 commits)

### Creative Knowledge Graph v3
- 671 nodes, 799 edges, 883KB JSON
- 49 signals, 95 mappings, 115 techniques, 50 constraints, 71 theory, 218 constants
- Queryable at runtime by signal executor (Rule 25N)
- Location: `lib/editron/data/creative-knowledge-graph.json`

### Mode 2 Signal-Driven Architecture (Path D)
7 new services + director Path D + worker modifications.
Signal executor evaluates content-driven mappings only (structural skipped for Mode 2).
3193 decisions → 43. The content drives editing, not timers.

### Key Fixes
- Silence removal shift order bug (ROOT CAUSE of 34→1 merge) — `361d7bc7`
- CDN URL direct for Gemini (≤100MB skips download entirely)
- Grok STT integration ($0.10/hr, word-level) — FormData fix applied
- Duration correction from transcript
- Asset registration in worker
- Temporal smoothing for "over 2s" triggers
- Structural mapping skip for Mode 2
- Frame clamp to video extent
- Signal-driven caption style

## What's Broken (for next session)

1. **OOM on >100MB videos** — CDN URL path is blocked by Gemini 100MB limit. Fix: ensure client compression fires.
2. **Grok STT** — "Could not detect audio format from file header" on CDN URL. May need file upload not URL.
3. **Silence removal fix not deployed** — commit `361d7bc7` wasn't in the latest test deploy.

## Graphify/CRG
663 nodes, 1193 edges, 48 communities. Updated end of session.

## Architecture Understanding

Mode 2 editing philosophy (established this session):
- **Content-driven ONLY.** The speaker's energy, entities, topic shifts drive editing.
- **No structural rules** (pacing timers, position zones). Those are Mode 1 assembly concepts.
- **An editor responds to what's happening in the video, not to a clock.**
- TRIBE v2 will add editorial intent detection ("put this bit in the start").

## Env Vars Needed
- `XAI_API_KEY` — Grok STT ($0.10/hr transcription)
- `FAL_AI_API_KEY` — Wizper fallback + video gen
- `DEEPGRAM_API_KEY` — final fallback transcription
