# D-009: Merge Logic (PARTIALLY SOLVED)

## Status: #partial — Dramatic pause vs dead air solved via EMA. Creative brief vs utility ranking NOT solved (Phase 6).

## The Problem
When TAG suggests cutting a silence gap that the transcript system kept (because it's a deliberate dramatic pause), who wins?

Three types of silence:
1. **Dead air** (speaker disengaged, looking at notes, fidgeting) → SHOULD CUT
2. **Dramatic pause** (speaker pauses for effect, building tension) → SHOULD KEEP
3. **Music break** (instrumental section between verses) → DEPENDS on content type

Simple "both suggest = high confidence" concatenation doesn't work. You need editorial judgment to distinguish these.

## Approaches Being Considered

### A) Confidence-weighted voting
- Each system (transcript, TAG) produces decisions with confidence scores
- Higher confidence wins
- Problem: how do you assign confidence? Both systems may be equally "confident" about opposite decisions.

### B) HIVE-style highlight + prune
- Phase 1: Find ALL interesting moments across ALL modalities (cast wide net)
- Phase 2: Prune moments that don't contribute to story
- "What to keep" is more intuitive than "where to cut"
- Problem: requires multimodal narrative understanding

### C) Context-window analysis
- Look at surrounding content to determine if silence is dramatic or dead
- Rising speech energy before silence → dramatic pause
- Falling energy + long gap → dead air  
- Problem: how much context? 2 seconds? 10 seconds? Varies by content type.

### D) VES-based (Visual Engagement Score)
- Dead air: low VES + no speech = cut
- Dramatic pause: high VES (speaker maintaining eye contact, leaning forward) + no speech = keep
- Problem: VES depends on V-JEPA which is ghost infrastructure

## Research Pointers
- HIVE (EMNLP 2025) — multimodal highlight detection
- EditDuet (SIGGRAPH 2025) — critic agent evaluates decisions

## Related
- [[Visual-Intelligence-Architecture]]
- [[Phase-1C-Failure-Analysis]]

Tags: #open #architecture #critical
