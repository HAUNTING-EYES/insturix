---
name: Design System v1.0 — Locked
description: MANDATORY. Single source of truth for ALL visual/interaction decisions. Warm editorial dark palette, Plus Jakarta Sans + JetBrains Mono, gold accent for decisions only. No gradients, no blur, no zinc grays, no blue. Source file at D:\google downloads\design-system (2).md
type: feedback
originSessionId: 8d7e7000-8452-489c-81f8-105084b2ef5c
---
# Design System v1.0 — Key Tokens

**Source:** `D:\google downloads\design-system (2).md` (full 628-line spec)

## Color
- Canvas: `#0B0B0A` | Raised: `#0F0F0E` | Deeper: `#131312` | Well: `#1B1A18`
- Borders: subtle `#1C1B19` | emphasis `#282724`
- Text: primary `#ECE9E1` | secondary `#B5B2A8` | muted `#7A776E` | dim `#5F5E5A` | faint `#454340`
- Accent gold: `#D4A652` — ONLY for decision moments, never decorative
- Status: success `#5EC97E` | warning = gold | danger `#D46A5C`
- Category: purple `#9088D4` (analyze) | pink `#D088B4` (music) | cyan `#5CB8CC` (distribution)

## Anti-palette (NEVER use)
- Zinc grays, blue accent, pure white/black, gradients, drop shadows, backdrop-blur/frosted glass, neon glows

## Typography
- Body: Plus Jakarta Sans (400/500/800 only — NO 600/700)
- Mono: JetBrains Mono (system labels, timecodes)
- Scale: 10/11/13/14/18/24/32/44/110px ONLY
- Mono labels: 10px, 500 weight, `#5F5E5A`, `letter-spacing: 0.08em`, ALL CAPS

## Spacing (4px rhythm)
- 4/8/12/16/24/32/48/64 ONLY

## Radius
- Tag: 4px | Button: 7px | Card: 12px

## Motion
- Micro: 0.25s | Response: 0.35s | Atmosphere: 0.5s
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` everywhere

## Key Patterns
- Progressive disclosure (3 actions default, "More controls →" for depth)
- Floating panel → drawer escalation (learn user preference, skip floating after 3x)
- Chat pill at rest (bottom-right, ⌘K), never modal
- UI for picking, chat for describing
- Hover-to-preview on user's actual content
- Timestamp-click-to-scrub (mono 11px gold)
- Row-based progress (no full-screen loading)
