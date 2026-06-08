---
name: mg-reviews-2026-05-19
description: "CEO + Eng + Design reviews of Motion Graphics Visual Identity Engine architecture. 5 eng blocking issues, CEO 10-star vision, design gaps. All three agree on tiered signal rollout."
metadata: 
  node_type: memory
  type: project
  date: 2026-05-19
  originSessionId: 608fad11-f7dd-4801-a6f5-a3bbb1378ea4
---

# Motion Graphics Architecture Reviews — 2026-05-19

## CEO REVIEW VERDICTS

1. **Right product, wrong label.** User-facing: "Set your brand once. Every graphic on-brand forever." Not "Visual Identity Engine."
2. **Ship 8-12 dominant signals, not 47.** Combinatorial explosion risk. 564 mapping decisions. Tier the rollout.
3. **TG = brands and agencies** (user clarified). Creators lower priority. BRAND DNA and CAMPAIGN are PRIMARY entry points, not optional.
4. **10-star features:** Star 8 = Brand Learning (upload 5 videos, reverse-engineer visual language). Star 9 = Real-Time Preview. Star 10 = Cross-Video Continuity.
5. **MVP: 3 structures, 5 signals, 2 scope levels, 3 weeks.** Prove signal→visual mapping produces intentional output.
6. **Moat = tuned signal-to-visual mapping database.** 12-18 month window. Architecture describable, mappings not copyable.
7. **Biggest risk: Uncanny Valley of Design.** Almost-right output worse than random templates.

## ENG REVIEW — 5 BLOCKING ISSUES

| # | Issue | Fix |
|---|-------|-----|
| E1 | No async I/O in render path | Template resolution at PIPELINE time. Overlays fully serialized. |
| E2 | useEffect timing on Lambda | Codebase documents this at html-scene-layer-content.tsx:122. GSAP via useEffect fires after screenshot. Need sync init or CSS variable scrubbing. |
| E3 | Z-index row assignment | ROW.BGM hack (z-index 90) must be replicated for new overlay type. |
| E4 | 254 Remotion components not on disk | Reference material only; build custom components. |
| E5 | GSAP license | Check Business Green for video-output SaaS ($250/yr). |

## ENG REVIEW — 5 NON-BLOCKING

| # | Finding |
|---|---------|
| E6 | Token resolution: 141 microseconds for 50 scenes. Non-issue. |
| E7 | @remotion/google-fonts already installed. Load once at composition root. |
| E8 | GSAP seek deterministic with immediateRender: false, no side-effect callbacks. |
| E9 | 4-phase migration. Shadow DOM lives forever for legacy. New overlays use React. |
| E10 | MongoDB regex fallback + serial Gemini slot-fill break at scale. Fix with indexing + batching. |

## DESIGN REVIEW — Gaps (6/10)

| Gap | What's Missing |
|-----|---------------|
| D1 | Signal-to-visual mapping function undefined (IS the product) |
| D2 | No visual preview of archetype output |
| D3 | User iteration flow missing |
| D4 | Token conflict resolution when signals disagree |
| D5 | 3 Laws enforcement mechanism |

## AGREED IMPLEMENTATION ORDER

1. Fix pipeline disconnect (route applyGraphic through templates)
2. Build one end-to-end proof (StatCounter + minimal-tech theme + mapping function)
3. Plan everything properly (full phased implementation)

## LAUNCH SIGNAL SET (8 dominant signals)

formality, enthusiasm, warmth, emotional_arousal, pacing_velocity, humor, visceral_impact, visual_dependency
Plus brand colors/fonts as direct inputs.

## CROSS-REFERENCES
- [[motion-graphics-investigation]] — Full investigation findings
- [[creative_content_doc_research]] — 47 signal taxonomy
- [[creative_doc_scope_system]] — Scope hierarchy
