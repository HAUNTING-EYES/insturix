---
name: Creative Content Doc — Signal Scope System (FINAL — CEO + Eng reviewed)
description: >
  The hierarchical scope system for 47 content signals. 6-level hierarchy + 3 orthogonal concepts.
  CEO review added BRAND above CAMPAIGN, FORMAT layer, SEGMENT TYPE, AUDIENCE overlay.
  Eng review provided TypeScript schema, cascade algorithm, MongoDB storage, performance analysis.
  Both agree: cascade model correct, BEAT deferred, progressive disclosure for UI.
type: project
last_updated: 2026-05-19
priority: HIGH
status: REVIEWED AND LOCKED — ready for doc writing
originSessionId: 06e29f3e-3816-4c0e-8acc-4d2fb1ebae47
---
# Signal Scope System — FINAL

## THE HIERARCHY (CEO + Eng reviewed)

```
BRAND DNA ─────── immortal (voice, visual identity, sonic signature, kill list)
  CAMPAIGN ────── time-bound strategic overlay (seasonal tone, campaign messaging)
    FORMAT ─────── system-managed platform defaults (TikTok/LinkedIn/YouTube/Email)
      PROJECT ──── one deliverable
        ACT ────── groups of scenes (long-form only, configurable threshold)
          SCENE ── per-segment (tagged with SEGMENT TYPE)
            BEAT ─ within-scene micro-moments (DEFERRED to post-MVP)

TRANSITION ────── between adjacent items (persistence + delta + rate + easing + style)
SEGMENT TYPE ──── concrete categories (interview, b-roll, title_card, product_shot, CTA, hook)
AUDIENCE ──────── orthogonal overlay modifying signals for target demographic
```

## CASCADE RULE
More specific wins. Child inherits from parent unless overridden.
Campaign-locked signals are ABSOLUTE — cannot be overridden at any lower level.
CSS specificity model: BRAND → CAMPAIGN → FORMAT → PROJECT → ACT → SCENE → BEAT

## KEY CEO INSIGHTS

### BRAND above CAMPAIGN (single biggest insight)
Agency managing Nike doesn't start with "Campaign." They start with "Nike." Brand is the permanent home screen. Campaigns are time-bound overlays. Without this, every new campaign starts from scratch.

### FORMAT layer (the "one brief, every format" mechanism)
System-managed, not user-created. "TikTok" automatically means: pacing +30%, formality -2 levels, max 60s, vertical. Without FORMAT, users manually adjust 10+ signals per platform — that's the Adobe workflow we're killing.

### SEGMENT TYPE replaces GROUP
Concrete: interview, b-roll, title_card, product_shot, testimonial, CTA, hook. Learnable signal defaults per type. "All my interview segments across all projects share these signals."

### AUDIENCE as orthogonal overlay
Same brand + campaign + platform, but Gen Z vs C-suite = different signals. Agencies think: "Nike Summer 2026, TikTok, for 18-24 athletes."

### Progressive disclosure for UI
- Default view (90%): Brand board + Project. Two levels.
- Power view: Timeline with scenes visible, per-scene overrides
- Expert view: Acts and beats (5% of users)
Never expose ACT/BEAT/TRANSITION terminology to brand managers.

### Additional CEO requirements
- Signal LOCKING with approval workflows (locked = deviation requires explicit unlock)
- Brand DNA VERSIONING (project pins to version at creation, refresh = diff + approval)
- Conflict resolution UI ("overridden from Brand default" with one-click revert)
- Competitive reference (analyze competitor video → extract signal fingerprint → use as starting point)

## KEY ENG FINDINGS

### Schema: Sparse overrides (CSS model)
Each scope level only stores what it explicitly sets. Not all 47 signals at every level. Storage proportional to actual customization.

### MongoDB storage
- Embedded hierarchy within project document (one findOne loads entire tree)
- Campaigns as separate collection (cross-project)
- 10-scene video with all overrides = ~5KB scope data. Well under 16MB limit.

### Performance: Non-issue
- 10 scenes × 47 signals = 470 resolutions × 5 levels = 2,350 lookups = sub-millisecond
- Even 50 scenes with beats = under 1ms
- Pre-resolve all signals per-scene once, cache result

### Cascade resolution algorithm
Bottom-up walk: Beat → Scene → Act → Project → Campaign → Brand
Phase 1: Find winning value (first explicit override from bottom)
Phase 2: Lock enforcement (campaign locks override everything)
Phase 3: Group/Segment Type overlay (explicit priority wins)
Phase 4: Default fallback (schema-defined neutral value)

### Transition model (enriched)
```
{
  resets: string[],           // signals that reset (default: all persist)
  delta: Record<signal, number>,  // additive per-signal shift, clamped to range
  blendDurationMs: number,    // absolute duration
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out',
  rate: number,               // portion of next scope's duration
  style: TransitionStyle      // hard_cut | dissolve | j_cut | l_cut | match | etc
}
```

### BEAT deferred to post-MVP
- Existing signal executor already handles sub-frame granularity
- Beat scope = hierarchical overrides for within-scene, separate concern
- Low cost to add later (cascade algorithm already supports it, schema has optional beats)
- Ship: Brand → Campaign → Format → Project → Act → Scene first

### ACT threshold configurable
Not hardcoded at 5. Different content types have different breakpoints. Store in project config.

### Validation requirements
- Orphan scenes (not in any act when acts exist) = construction error
- Groups with equal priority on overlapping signals = validation error
- Locked signal without campaign value = configuration error
- Transition blendDuration > next scope duration = clamp + warning
- Signal type mismatch across scopes = runtime validation error

### Signal metadata registry
Each signal tagged with:
- defaultScope (where it's typically set)
- minMeaningfulScope (lowest level it makes sense)
- campaignLockable (can it be locked by creative director?)

## DURATION-DEPENDENT ACTIVATION (updated)

| Duration | Active Scopes |
|----------|--------------|
| <30s (TikTok/Reel) | BRAND → CAMPAIGN → FORMAT → PROJECT → SCENE |
| 30-90s (short ad) | + TRANSITION |
| 90s-5min (explainer) | + ACT |
| 5-30min (YouTube) | + ACT (all scopes except BEAT) |
| Series/campaign | BRAND → CAMPAIGN → FORMAT → per-piece |
| Post-MVP | + BEAT for sub-scene overrides |

## WHAT THIS ENABLES (10-star features)

1. **One brief, every format**: Brief → BRAND + CAMPAIGN + AUDIENCE → FORMAT auto-adapts → 8 pieces simultaneously
2. **Brand mixing board**: Visual sliders per signal, content regenerates in real-time
3. **Campaign orchestration**: Signals evolve across drip sequences (awareness climbs, persuasion increases)
4. **Drift detection**: Alert when new content deviates from approved brand envelope
5. **Competitive intelligence**: Decompose competitor video → signal fingerprint → starting point
6. **Governance**: Locked signals + versioned DNA + approval workflows
