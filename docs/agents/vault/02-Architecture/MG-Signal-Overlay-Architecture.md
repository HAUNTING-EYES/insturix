# MG Properties as Overlay Definitions

**Status:** #decided (2026-05-26)
**Principle:** MG visual properties use the SAME overlay→signal infrastructure as zooms, transitions, and filters. No separate system. No hardcoded thresholds in composition-planner.ts.

## The Problem

Current composition-planner.ts has hardcoded thresholds pretending to be signal-driven:
- `formality >= 0.4` → container (binary threshold, not response curve)
- `formality > 0.7` → font switch (binary, not graduated)
- `budget >= 3` → accent line (fixed threshold)
- `minSize: 64` → font floor (hardcoded, not signal-computed)
- `position: 'center'` → always center for numeric/quote (not content-aware)

These are profile values with if-statements. Not signal-driven design.

## The Architecture

MG properties become overlay definitions in `overlay-definitions.json`, alongside existing zoom/transition/filter/caption/cut overlays.

```
overlay-definitions.json
  ├── zoom overlays (11) — already done
  ├── transition overlays (20) — already done
  ├── filter overlays (5) — already done
  ├── caption overlays (4) — already done
  ├── cut overlays (3) — already done
  └── MG property overlays (NEW)
        ├── mg.font_size
        ├── mg.position
        ├── mg.container_opacity
        ├── mg.animation_intensity
        ├── mg.font_weight
        ├── mg.font_family
        ├── mg.line_height
        ├── mg.letter_tracking
        ├── mg.color_temperature
        ├── mg.accent_presence
        ├── mg.hold_duration
        ├── mg.entry_speed
        ├── mg.exit_speed
        └── ... every visual property
```

Each MG overlay definition has:
- `considerations[]` — signal IDs with response curves (logistic, polynomial, etc.)
- `outputParams[]` — property values with proportional/fixed modes and min/max ranges

CRG constants are `minValue`/`maxValue` bounds on output params — not the values themselves.

## Example: Font Size

```json
{
  "id": "mg.font_size_stat_counter",
  "category": "mg-property",
  "considerations": [
    { "signalId": "visceral_impact", "curveType": "polynomial", "params": { "slope": 1, "exponent": 1.5 } },
    { "signalId": "enthusiasm", "curveType": "linear", "params": { "slope": 0.8 } },
    { "signalId": "speech.emphasis_word", "curveType": "logistic", "params": { "xShift": 0.5 } }
  ],
  "outputParams": [
    { "name": "fontSize", "mode": "proportional", "minValue": 32, "maxValue": 200 }
  ]
}
```

- 64px CRG readability floor can be a soft constraint, not the min
- A quiet "0.02% margin" → ~40px clean
- A high-energy "100 MILLION!" → ~160px bold
- Signals determine size, CRG constrains it for readability when needed

## Example: Position

```json
{
  "id": "mg.position_stat_counter",
  "category": "mg-property",
  "considerations": [
    { "signalId": "visual.face_present", "curveType": "logistic" },
    { "signalId": "visual.complexity", "curveType": "linear", "invert": true },
    { "signalId": "structural.active_overlays_count", "curveType": "linear", "invert": true }
  ],
  "outputParams": [
    { "name": "position", "mode": "zone-select", "zones": ["center", "top-left", "top-right", "bottom-left", "bottom-right"] }
  ]
}
```

Face present → avoid center (face zone). High complexity → simpler position. Many overlays → avoid crowded zones.

## What This Replaces

The composition planner stops being a decision-maker with thresholds. It becomes a recipe ASSEMBLER that reads overlay scoring results:

```
Utility Scorer → evaluates MG overlay definitions against signal snapshot
    → "font_size scored 0.82 → 148px"
    → "container_opacity scored 0.6 → 0.57 opacity"
    → "position scored for top-right zone"
    
Composition Planner → reads scored results → assembles recipe
    → no thresholds, no if-statements, no hardcoded values
```

## Why This Is Right

1. **One system** — zooms, transitions, filters, MG all use same overlay→signal pipeline
2. **Calibratable** — threshold bandit adapts MG properties same as editing decisions
3. **Per-brand** — Graphiti signal bridge (D-015) injects brand preferences, MG responds
4. **No templates** — every property is a continuous function of signals, not a binary gate
5. **Composable** — new properties just need a new overlay definition, no code changes

## Implementation Order

1. Define MG property overlay schema (extend current overlay schema for property outputs)
2. Add 12-15 MG overlay definitions to overlay-definitions.json
3. Wire utility scorer to evaluate MG overlays at composition time
4. Refactor composition-planner to READ scored results instead of threshold logic
5. Remove all hardcoded thresholds from composition-planner.ts
6. Test with 5 content types (product ad, tutorial, vlog, brand, data-viz)

Tags: #decided #architecture #motion-graphics #signals #overlays
