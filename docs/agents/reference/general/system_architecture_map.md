---
name: System Architecture Map — Complete Pipeline Reference
description: Full trace of ThinkForge→Editron pipeline. How every system connects, what data flows where, what user inputs affect what. Updated 2026-04-13.
type: project
---

# System Architecture Map (2026-04-13)

## Pipeline Stages (7)
```
SCRIPT → PARSE → STORYBOARD → VIDEO GEN → AUDIO → FINALIZE → DIRECTOR → RENDER
```

## User Input Impact Matrix
| Input | Parser | Storyboard | Video Gen | Audio | Director | Render |
|-------|--------|-----------|-----------|-------|----------|--------|
| Script text | PRIMARY | via scenes | via scenes | via moods | via storyboard | via project |
| Aspect ratio | — | image dims | aspect param | — | canvas | dimensions |
| Art style | quality tokens | prompt | cinema hardware | mood | — | — |
| Video model | — | — | endpoint+params+nativeAudio | — | — | — |
| VO toggle | — | — | disables native audio | TTS gen/skip | caption decision | include/omit |
| Caption toggle | — | — | — | — | add_captions | render |
| Profile | — | — | — | — | ALL 13 steps | edit style |

## hasNativeAudio: SET FROM MODEL CONFIG, NOT ACTUAL DETECTION
- Seedance 1.5/2.0: nativeAudio.default=true
- Kling 2.1/2.6, Veo 3.1: false/undefined
- NO ffprobe, NO audio stream check, NO fal.ai response metadata inspected
- Gap: if generate_audio=true but model fails → hasNativeAudio still true → SFX skipped → silent scene
- Gap: if hasVoiceover → generate_audio=false sent to fal.ai BUT modelHasNativeAudio() still returns true

## Profile System: 54 profiles, SIGNIFICANT differences
- Pacing: 3 cuts/min (D-08 Luxury) to 50 cuts/min (B-13 Gaming) = 16x range
- Music: 10% volume (B-13) to 95% volume (C-01) = 9.5x range
- Graphics: 0-1/30s (D-01) to 5-8/30s (B-13) = 5-8x range
- Transitions: dip-to-black vs glitch vs zoom-punch vs dissolve vs hard-cut
- Captions: none vs subtitle vs word-by-word vs kinetic/fancy

## Dependency Chain
5-Track Analysis → EDL Generation → EDL Execution → Post-Processing → Director Actions → Render
