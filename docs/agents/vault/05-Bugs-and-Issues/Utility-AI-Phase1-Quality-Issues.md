# Utility AI Phase 1 Quality Issues

## Status: KNOWN. Fix in Phase 3 (response curves).

## Found by: test-utility-integration.ts (2026-05-24)

### Issue 1: Inverted linear curves score wrong for zero/neutral signals
- `zoom_pull_back` fires at `speech.energy_delta = 0.0` with score 1.000
- Should only fire when delta is negative (energy falling)
- Cause: `inverted_linear(0.0) = 1.0 - 0.0 = 1.0`. Treats "no change" as "maximum"
- Fix: logistic curve with xShift at threshold value. Only scores high BELOW threshold.

### Issue 2: `< threshold` conversions produce aggressive scores
- `camera_shake_impact` fires at `formality = 0.3` with score 1.000
- `transition.flash` fires at `formality = 0.3` with score 1.000
- Cause: CRG rules are binary gates (fire/don't fire). Converted to linear scores, common signal values (formality < 0.6) score maximum.
- Fix: logistic curve that transitions sharply near threshold, not linearly across full range.

### Issue 3: evaluateCurve clamps [0,1] but some signals are negative
- `speech_energy_delta` ranges -0.5 to +0.5. Clamping to [0,1] maps -0.2 → 0.0.
- System can't distinguish "falling energy" from "no change"
- Fix: either normalize negative signals to [0,1] before scoring, or allow curves to accept [-1,1] input.

### Phase 1 status
- Engine works correctly (32/32 unit tests)
- Performance excellent (4.8ms for 10,560 evaluations)
- Decision QUALITY requires Phase 3 curves to be meaningful
- Phase 1 proves the ARCHITECTURE works, not that decisions are good yet

Tags: #bugs #utility-ai #known #phase-3-fix
