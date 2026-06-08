# D-002: L0 Deterministic Stack

## Status: #decided (editron 26, 2026-05-23)

## Decision
L0 uses JS-only, zero-ML components:
- **Silence**: Local RMS computation from raw audio PCM via audio-decode (NOT Gemini energyCurve)
- **Beats**: Essentia.js (WASM, Node.js compatible)
- **Scene boundaries**: Frame histogram diff on existing keyframeAnalyses.dominantColors via sharp

## Why NOT Gemini energyCurve for silence?
energyCurve is populated by Gemini beat analysis (five-track-analysis.ts:644-658). When Gemini 429s, energyCurve is empty. TRUE L0 must use LOCAL computation that can't fail. Verified 2026-05-24 session.

## Why NOT ffmpeg silencedetect?
ffmpeg is in the stack (@ffmpeg-installer/ffmpeg, @ffmpeg/ffmpeg WASM) but:
- WASM version is 3-10x slower than native
- silencedetect has never been used in the codebase
- Local RMS on PCM buffer is simpler and sufficient

## Implementation Estimate
- Local RMS silence detection: ~30 LOC (audio-decode → PCM → RMS per window → threshold)
- Essentia.js integration: need to add to package.json, write adapter (~100 LOC)
- Scene boundary detection: ~40 LOC (sharp histogram diff on dominantColors)

Tags: #decided #architecture #l0
