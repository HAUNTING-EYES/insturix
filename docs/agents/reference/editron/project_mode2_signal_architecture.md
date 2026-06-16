---
name: Mode 2 Signal-Driven Architecture — NO PROFILES
description: Mode 2 is fully signal-driven (7 services + Path D). Zero profile dependency. Content-driven ONLY. Profiles are ONLY a fallback if Path D fails.
type: project
last_updated: 2026-05-07
originSessionId: 8169aa5e-3ba3-4807-9fea-d5cb2afaac37
---
# Mode 2 Architecture — Signal-Driven, NOT Profile-Driven

**CRITICAL: Mode 2 does NOT use the 54-profile system.** It was deliberately moved away from profiles to signal-driven content editing (commits c67b839f + 74709152, May 2026).

## Philosophy (from May 5 2026 session)
- **Content-driven ONLY.** The speaker's energy, entities, topic shifts drive editing.
- **No structural rules** (pacing timers, position zones). Those are Mode 1 assembly concepts.
- **An editor responds to what's happening in the video, not to a clock.**

## 7 Signal-Driven Services (Path D)
1. **signal-registry.ts** — Dual-timing signal collection (grid every 15 frames + event at word timestamps). Speech, visual, audio, structural, composite signals.
2. **signal-executor.ts** — Evaluates 95 mappings from creative knowledge graph. Skips `structural`, `title-card`, `music-editing` categories for Mode 2.
3. **genre-parameter-computer.ts** — Computes 9 parameters from signals (pacing_tolerance, energy_baseline, transition_density, graphic_density, silence_tolerance, zoom_budget, sfx_density, color_temperature, formality). NO profiles.
4. **moment-weight-service.ts** — TRIBE-compatible multi-source weighting. Currently flat/Gemini. Future: thompson, vjepa, wav2vec, eml.
5. **humanize-pass.ts** — Post-signal-execution organic variation (±3 frame jitter, ±15% duration). Seeded by projectId (deterministic).
6. **constraint-enforcer.ts** — 8-pass validation of 50 constraints from creative knowledge graph Part 4. Includes transition_repetition and fade_to_black_overuse.
7. **content-type-detector.ts** — Rule-based content classification from transcript signals. Maps to content types, NOT profiles.

## Path D in Director Agent
```
D.1: Compute genre parameters from signals
D.2: Build moment weight map (flat if no Gemini)
D.3: Build signal timeline (grid + event)
D.4: Execute signal-driven edit (95 mappings)
D.5: Humanize pass (organic imperfection)
D.6: Constraint enforcement (50 constraints, 8 passes)
→ Execute EDL
```

## Where Profiles STILL Appear (post-Path D actions)
- video-analysis worker line 295-323: detects profile for Director Agent
- Director Agent lines 417-419: falls through to Unified Intelligence (profile-based) ONLY if Path D throws
- **After Path D EDL executes:** profile-based actions STILL RUN (filters, transitions, captions, motion graphics, audio ducking, SFX, quality review)
- Mode 2-specific: fancy_captions→standard add_captions for editability (line 713)
- Profile step `add_transition` checks for existing EDL transitions and SKIPs boundaries that already have them

## Editorial Intent Detection (NEW 2026-05-08)
- **editorial-intent-detector.ts** — Gemini Flash classifies segments as CONTENT/META_DISCARD/META_KEEP
- Wired into raw-footage-processor.ts Step 4.5 (after segmentation, before best-take detection)
- META_DISCARD segments added to silence removal plan as `reason: 'meta-discard'`
- Retroactive flagging: "that last shot was bad" → marks PREVIOUS segment for removal
- Anti-overfire: confidence threshold 0.7, default is CONTENT, charged silence protection

## Known Issues (2026-05-08)
- ~~Transitions all dip-to-black~~ **FIXED** (2026-05-08): signal executor now propagates transitionType from technique ID to params
- Motion graphics broken GLOBALLY — root cause: `findBestTemplate()` returns null (query text doesn't match MongoDB template tags), LottieFiles fallback unreliable, CSS fallback may not render. Key files: motion-graphics-service.ts:368, tools.ts:4422
- ~~SFX gate blocks Mode 2~~ **FALSE** (verified 2026-05-08): no hasNativeAudio gate exists in director-agent. SFX runs for all modes via transition-sfx-placer (step 3.6). hasNativeAudio is only used in audio ducking logic.
