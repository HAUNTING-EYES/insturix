---
name: Session feedback — 2026-04-28
description: User feedback on transitions, transcription, Mode 2 expansion paths, and fix list accuracy.
type: feedback
originSessionId: e9517597-4c40-448b-a355-67656f26e0c7
---
# Session Feedback — April 28, 2026

## Transition issues
- Dissolve is "too sudden" and "not a dissolve at all" — confirmed: aliased to soft-cut (HTML dip, not real cross-dissolve)
- Soft-cut also "doesn't work properly" — the semi-transparent dip is visually weak
- Dip-to-black is "nice" — user approves this one
- **Fix dissolve as a real keyframe-based opacity crossfade between overlapping clips (not the HTML overlay hack)**
- **Increase default transition duration from 0.6s to 1-2s for dissolves**

## Transition SFX auto-suggest
- User wants: when user manually adds a transition in the editor → system SUGGESTS a matching SFX (whoosh for wipe, impact for zoom-punch, etc.)
- Accept = places the SFX. Decline = no SFX.
- Currently: SFX placer only runs during Director execution, not on manual edits.

## Transcription preference
- Deepgram transcription quality is "shit"
- User prefers: Whisper or Nova
- **How to apply:** Check if Whisper Large V3 is already wired (commit `9ae52ee1` added it). If so, make it primary. If not, wire it. Deepgram → fallback only.

## Mode 2 expansion — multiple entry paths
User wants Mode 2 to handle MANY combinations, not just "upload 1 video":
- Upload videos AND images/assets (optional)
- Upload a script (optional) — if provided, system uses it as narration context
- Upload a reference video (optional) — if provided, system copies its editing style
- Upload reference images (optional) — for visual consistency
- All these are OPTIONAL and create different paths into Editron
- If a video is already in the Asset Library, its 5-Track analysis should ALREADY be cached

## Master fix list accuracy
- User suspects many fixes are already done (especially Fix 9: narrative arcs)
- User believes Fix 13 (video gen determinism) may not be needed — videos are already similar
- **Rule:** VERIFY each fix against actual current code before claiming status. Don't assume from git history.
