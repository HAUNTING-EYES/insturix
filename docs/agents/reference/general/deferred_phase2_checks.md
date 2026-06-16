---
name: Deferred Phase 2 Quality Checks + Bandit Tuning
description: 4 quality checks blocked by missing data + 2 invented bandit constants needing validation. Track for Phase 2.
type: project
originSessionId: 8169aa5e-3ba3-4807-9fea-d5cb2afaac37
---
## Deferred Quality Checks (need Essentia.js / enhanced Vision)

1. **Audio pops at cut points** — Needs audio waveform analysis (Essentia.js)
2. **Caption over video text (OCR)** — Needs OCR/text detection in AI-generated frames (5-Track Vision enhancement)
3. **Music energy vs visual energy mismatch** — Needs music energy curve (Essentia.js `constraint:rhythm.energy_mismatch`, >10s opposite trajectories, warning, -5)
4. **Metronomic beat sync (6+ cuts ±1 frame)** — Needs beat grid from music analysis (Essentia.js `constraint:temporal.metronomic_beat_sync`, 6 consecutive, warning, -5)

**Why:** All 4 require real signal data (audio waveform, beat grid, frame-level OCR) that only exists after Essentia.js integration and enhanced Gemini Vision analysis.

**How to apply:** When Essentia.js is integrated (Phase 2 item 8 in master plan), build these 4 checks in quality-review-service.ts using the actual analysis data. CRG constraint IDs and thresholds are documented above.

## Invented Bandit Constants (need validation with real data)

5. **OBSERVATION_PRECISION = 0.5** in `genre-parameter-bandit.ts:79` — Controls learning rate for Normal-Normal conjugate update. Standard Bayesian practice but not sourced from any doc/constraint. Too high = overfits to early projects, too low = learns too slowly. Validate after 20+ real project outcomes.

6. **maxAdj per dial** in `genre-parameter-bandit.ts:86-94` — Maximum adjustment each dial can receive from the bandit (e.g., pacing ±3, energy ±0.15). Set at ~20% of each dial's range as engineering judgment. If too large, bandit could override signal computation too aggressively. Validate by monitoring adjustment magnitudes in production.

**How to apply:** After accumulating real project outcome data, analyze the distribution of effective adjustments and tune these constants empirically. Both are conservative defaults that won't cause harm but may be suboptimal.
