---
name: creative-doc-review-round2-designer
description: "Designer review round 2: Confidence Gradient (3-tier progressive disclosure), dim/gold visual grammar for inherited vs overridden, 'Moments' not 'pattern breaks', progressive Voice Signature building, mini sparklines for envelopes, Brand Studio as top-level section, magic moment = FORMAT recommendation card."
metadata:
  type: project
  last_updated: 2026-05-19
---

# Designer Review Round 2 — Creative Content Knowledge Doc

## Confidence Gradient Model (3 Tiers)

### Tier 1 — "The Recommendation" (90% of users)

- FORMAT selected --> single card: "TikTok defaults applied. 15 signals configured."
- One-sentence plain language summary: "Fast cuts, high energy, vertical framing, hook-first structure."
- One gold "Customize" link. That is it. No sliders. No axes.
- Magic: system made 15 good decisions, user did zero work.

### Tier 2 — "The Override Panel" (power users)

- Clicking "Customize" opens panel organized by 10 axes, each collapsed
- Axis headers show micro-indicators: gold dot = user overridden something, dim dot = all inherited
- Expanding reveals signals as horizontal slider rows
- Inherited values: muted tone (#6B6B60), small "FORMAT" origin label in JetBrains Mono
- Overridden values: full gold (#D4A652), visible "Custom" tag
- One-click "x" on origin label resets to inherited
- Collapsed headers show fraction: "3/7 customized" in JetBrains Mono

### Tier 3 — "The Timeline" (experts)

- Signals become lanes, acts become regions, scenes become columns
- Envelopes and pattern breaks live visually here
- Full bezier curve editor for envelopes

## Three Visual States Per Signal Row

| State | Background | Value color | Label | Interaction |
|---|---|---|---|---|
| Inherited | transparent | #6B6B60 (muted) | `FORMAT` or `BRAND` in JetBrains Mono | Hover tooltip: "Set by TikTok format" |
| Overridden | gold tint (#D4A652 at 8%) | #D4A652 (gold) | `CUSTOM` tag | "x" icon to reset |
| Conflicting | amber tint | #C48A30 (amber) | `CONFLICT` tag | Click opens resolution UI |

## UI Metaphor: Properties Inspector, Not Mixing Board

- Film production script breakdown sheet x DaVinci color grading panel
- Signal panel = properties inspector docked right in ThinkForge
- Select scene --> inspector shows scene signals. Select project --> project signals. Brand Studio --> brand signals.
- Hierarchy navigated by SELECTING SCOPE IN MAIN CANVAS, not drilling through nested settings

## Pattern Breaks --> "Moments"

- Right-click scene --> "Make this a moment"
- Three presets: Surprise (spike energy/humor/pace), Pause (drop pace, raise intimacy), Shift (invert dominant tone)
- Each shows one-line description vs project defaults: "Surprise: pace +40%, humor ON, energy +30%"
- Gold diamond icon in scene list marks moments
- "Advanced" link at bottom --> per-signal override panel for experts
- Non-experts never see "pattern break" terminology

## Voice Signature — Progressive Building

### Phase A — "Seed" (required, 2 minutes)

- Paste/upload 1-3 reference samples
- System extracts initial fingerprint, presents as readable card:
  > "Your voice leans: Conversational, medium sentences, question-heavy openings, minimal jargon"
- Each trait is a small pill the user can tap to adjust (spectrum from formal to casual)
- 30 seconds to review/nudge

### Phase B — "Grow" (passive, ongoing)

- Every ThinkForge script feeds back into voice model
- "Voice confidence: 63%" indicator in Brand Studio
- After 10-15 scripts, confidence hits 90%+, indicator turns gold
- No user action required

### Phase C — "Refine" (optional, expert)

- Full radar chart (6-8 dimensions)
- Reference samples listed with influence weight
- Pin samples ("always reference") or exclude them

## Signal Envelopes — Mini Sparklines

### Tier 2 (Override Panel)

- Waveform icon at right end of slider row
- Click: slider transforms into mini sparkline (200px x 32px)
- Three draggable points: start, peak, end
- Gold curve on dark background with subtle grid
- Static value shown as dashed horizontal line for reference
- Covers 90% of envelope use cases

### Tier 3 (Timeline)

- Full-width curves with bezier handles
- Act boundaries as vertical dashed lines
- Freehand drawing or snap to boundaries
- After Effects keyframe graph aesthetic with Insturix dark editorial palette

### Design decisions

- Default to linear interpolation (bezier = Tier 3 only)
- Envelope icon in collapsed axis header when any signal has envelope

## Where This Lives — Three Homes

1. **ThinkForge** — Override Panel (Tier 2) docked right. Scene signals, Moments, per-scene envelopes. FORMAT recommendation card during project creation.
2. **Brand Studio** (NEW top-level section) — Voice Signature, FORMAT presets, brand-level signal presets, brand identity. Gold-heavy design for permanence.
3. **Editron Timeline** — Read-only visualization of signal envelopes. Editron consumes signals, ThinkForge/Brand Studio produce them.

## What's Hidden from 90%

- Individual signal controls (all 47)
- Act and beat scope levels
- Pattern break advanced mode
- Signal envelopes
- Voice Signature Phase C
- Cascade conflict resolution
- Scope hierarchy visualization
- Cross-project signal comparison

## What's Visible to Everyone

- FORMAT selection + recommendation card
- "3 signals customized" indicators
- "Moment" creation (right-click)
- Voice confidence indicator

## The Magic Moment

User picks TikTok. System instantly shows:

> **TikTok Optimized** — 15 signals configured
> Fast cuts (1.2s avg), hook-first structure, high energy, vertical framing.
> *Based on top-performing TikTok content patterns.*

User thinks: "It already knows. I did nothing." That is the moment.

Second magic: returning user creates new project under same brand --> Voice Signature + brand defaults carry over automatically. Zero configuration.

## Design System Alignment

- Dark warm: #0B0B0A canvas, #0F0F0E raised, #131312 deeper
- Gold: #D4A652 for decisions/overrides ONLY
- JetBrains Mono for labels/origin tags
- Plus Jakarta Sans for body
- Radius: 7px buttons, 12px cards
- Motion: 0.25s hover, 0.35s state
- NO gradients, NO blur, NO shadows, NO emoji
