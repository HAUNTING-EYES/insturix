---
name: KB Hallucination Audit 2026-05-15
description: Full audit of creative_production_knowledge_v3. 14 runtime constraints verified clean. Murch percentages VERIFIED REAL (initially thought hallucinated, web search proved otherwise). 3 fabricated attributions found. 20 C-category engineering defaults documented.
type: project
originSessionId: 7f2af378-6c00-434c-883e-4d6eaef3731a
---
# KB Hallucination Audit - 2026-05-15

## CORRECTION: Murch Percentages ARE REAL
- **File:** `lib/editron/data/creative-doc-rules.ts:167`
- **Values:** Emotion (51%), Story (23%), Rhythm (10%), Eye-trace (7%), Planarity (5%), Spatial (4%)
- **Initial assessment:** Thought hallucinated (percentages summing to 100% seemed LLM-invented)
- **Web verification:** Multiple independent sources (StudioBinder, No Film School, UC Berkeley) confirm these exact percentages from Murch's "In the Blink of an Eye"
- **Action:** Incorrectly removed, then REVERTED. Values restored to code.
- **Lesson:** Verify before removing. "Looks like hallucination" is not evidence.

## VERIFIED CLEAN (14 runtime constraints)

All 14 constraint nodes consumed by `constraint-enforcer.ts` match the source document exactly:
- cut_mid_word, missing_transition_sound, pacing_monotony, metronomic_beat_sync
- transition_repetition, fade_to_black_overuse, transition_during_speech
- visual_clutter, graphic_too_small, flash_rate_violation
- identical_zoom_targets, ai_footage_overheld, dissolve_color_clash, sfx_timing_drift

One systematic naming: graph uses "blocker" where source says "critical" for -15 severity. Same number, different label.

## GRAPH USAGE: 91% IS DEAD DATA

| Category | In graph | Runtime consumed | Dead |
|----------|----------|-----------------|------|
| Constants | 218 | 0 | 218 |
| Constraints | 50 | 14 | 36 |
| Techniques | 115 | 26 | 89 |
| Mappings | 95 | 19 | 76 |
| Signals | 49 | ~40 | ~9 |
| Theory | 71 | 0 | 71 |
| Other | 73 | 0 | 73 |

218 constants loaded into 153KB of memory on every request but zero code paths call `getConstant()`.

## FABRICATED ATTRIBUTIONS (wrong source for real number)

| ID | Claim | Actual Source |
|----|-------|---------------|
| C3 | "800ms event boundary (Zacks 2007)" | Engineering decision, not Zacks. Zacks works at second-to-minute scale. |
| C7 | "4+/-1 working memory (Sweller 1988)" | Number is from Cowan 2001, not Sweller 1988. |
| C6 | "CTA in final 20% = 3x conversion (Wistia 2023)" | Specific "3x" likely fabricated. Wistia publishes engagement data but this exact figure unverifiable. |

## ENGINEERING DECISIONS DISGUISED AS [DETERMINISTIC] (should be [LEARNING_TARGET])

These 20 values are reasonable defaults but are NOT industry standards despite being tagged [DETERMINISTIC]:

1. Silence thresholds: 300/800/2000ms (line 477-484)
2. Speech emphasis: 1.5x volume + 110% stretch (line 490)
3. Ducking attack/release: 200-400ms / 400-800ms (line 5555)
4. Pacing monotony: 10% variance over 5 shots (line 4749)
5. Color temp delta: 1000K/1500K for dissolve blocking (line 4783)
6. Synchresis threshold: 40ms (line 5240) -- real research shows 20-150ms asymmetric
7. Eye-trace jump: 30% of diagonal (line 912)
8. Overlay timing exit = entrance x 0.8 (line 5697)
9. Cosine similarity 0.3 for topic boundary (line 587) -- model-dependent
10. Mix hierarchy dB levels: dialogue -12 to -6, SFX -15 to -9, etc. (line 5542)
11. Shot hold minimum 0.8s (line 4766)
12. Skin tone deviation 5 degrees from I-line (line 5021)
13. Caption 37-42 chars/line (line 5612)
14. Punctuation pause durations: comma 0.2-0.3s, period 0.4-0.6s (line 5627)
15. Voice pacing WPM ranges (line 5640)
16. Min caption gap 0.08s (line 5618)
17. "3+ identical transitions" threshold (line 4788)
18. "6 consecutive beat-aligned cuts" threshold (line 4769)
19. "> 5s AI footage without pressure" threshold (line 5032)
20. "> 2 non-caption overlays for > 1s" threshold (line 4943)

**Recommendation:** Items 1-12 should be migrated from [DETERMINISTIC] to [LEARNING_TARGET] in the source doc and graph. Thompson Sampling should optimize them from user data. Items 13-20 are reasonable enough to keep as defaults with manual override.

## SAFE TO HARDCODE (verified real standards)

- Platform specs (YouTube, Instagram, TikTok resolution/duration/codec)
- LUFS targets (-14 social, -23 EBU, -24 ATSC)
- True peak limits (-1.0 dBTP, -2.0 ATSC)
- WCAG contrast (4.5:1 AA, 7:1 AAA)
- WCAG flash (3/sec, 25% screen)
- Color spaces (sRGB, Rec.709, DCI-P3, Rec.2020)
- Frame rates, sample rates
