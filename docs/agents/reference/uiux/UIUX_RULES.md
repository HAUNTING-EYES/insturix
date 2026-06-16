---
name: UI/UX Rules Extension — MANDATORY for frontend work
description: READ BEFORE ANY UI/UX WORK. Extends AGENT_RULES.md with design-system-specific rules. Applies to ALL products (Editron, Alyzitron, Clickatron, ThinkForge, Musitron, Socialize, landing pages, marketing).
type: feedback
originSessionId: 8d7e7000-8452-489c-81f8-105084b2ef5c
---
# UI/UX RULES — MANDATORY FOR FRONTEND WORK

**These extend AGENT_RULES.md. Both files apply simultaneously.**

---

## DESIGN SYSTEM COMPLIANCE

### Rule UI-1: Token-Only Values (MANDATORY)
Every color, font, spacing, radius, and motion value MUST come from the locked design system (v1.0, Apr 19 2026). Source: `memory/design_system_v1.md` and `D:\google downloads\design-system (2).md`.

**Before writing ANY CSS/Tailwind class, check:**
- Is the color in the palette? (`#0B0B0A`, `#0F0F0E`, `#131312`, `#1B1A18`, `#1C1B19`, `#282724`, `#ECE9E1`, `#B5B2A8`, `#7A776E`, `#5F5E5A`, `#454340`, `#D4A652`, `#5EC97E`, `#D46A5C`, `#9088D4`, `#D088B4`, `#5CB8CC`)
- Is the font size in the scale? (10/11/13/14/18/24/32/44/110px ONLY)
- Is the spacing in the rhythm? (4/8/12/16/24/32/48/64px ONLY)
- Is the radius in the set? (4/7/12px ONLY)
- Is the weight allowed? (400/500/800 ONLY)

If the value isn't in the system, you're wrong. Either find the right token or ask.

### Rule UI-2: Anti-Pattern Checklist (MANDATORY before shipping ANY UI)
Check EVERY item. If you catch yourself doing any of these, stop and fix:

- [ ] Using zinc/slate grays (`#27272a`, `#3f3f46`, etc.)
- [ ] Using `backdrop-blur` / frosted glass
- [ ] Using blue as an accent
- [ ] Using font-weight 600 or 700
- [ ] Using pure white `#FFFFFF` or pure black `#000000`
- [ ] Using gradients (background gradients, text gradients)
- [ ] Using drop shadows (except focus rings: `box-shadow: 0 0 0 2px #D4A65240`)
- [ ] Using emoji as visual elements
- [ ] Using Title Case ("Sign In") instead of sentence case ("Sign in")
- [ ] Using ALL CAPS except for mono labels
- [ ] Using more than 2 font families (Plus Jakarta Sans + JetBrains Mono)
- [ ] Using sizes not in the type scale (no 12px, no 16px, no 20px)
- [ ] Using spacing values not in the rhythm (no 5px, 6px, 10px, 14px, 18px, 20px, 28px)
- [ ] Using `rounded-full` on non-avatar / non-dot elements
- [ ] Using shadcn/ui default styling without overriding to design system
- [ ] Using "Loading..." — use descriptive stage labels ("Watching", "Listening")
- [ ] Using full-screen loading spinners for async ops
- [ ] Using tooltips as primary information delivery
- [ ] Animating things that don't need to move
- [ ] Using toast notifications for actions the user just performed

### Rule UI-3: Gold is for Decisions (MANDATORY)
`#D4A652` (accent gold) is ONLY for decision moments. Never decorative.

**Legitimate:** Primary action buttons, selected state indicators, active tab underlines, timestamp links, chat pill dot, progress indicators, hover affordances on clickable elements.
**Illegitimate:** Background colors of large areas, body text, borders by default, any element occurring >5 times on a screen.

---

## TYPOGRAPHY

### Rule UI-4: Two Fonts, Three Weights
- **Body:** Plus Jakarta Sans (Google Fonts: `Plus+Jakarta+Sans:wght@400;500;800`)
- **System/Mono:** JetBrains Mono (for timecodes, percentages, system labels, keyboard hints)
- **Weights:** 400 (body), 500 (emphasis/headers), 800 (hero ONLY — page titles, wordmark)
- **NO Inter, NO Space Grotesk, NO Caveat** — these are the current codebase fonts, they get replaced

### Rule UI-5: Mono Label Pattern
System labels use this exact recipe:
```css
font-family: 'JetBrains Mono', monospace;
font-size: 10px;
color: #5F5E5A;
letter-spacing: 0.08em;
font-weight: 500;
text-transform: uppercase;
```
Example: `RECENT · 4`, `PIPELINE`, `METRICS`, `TITLES`

### Rule UI-6: Letter Spacing Rules
- Hero headlines: `-0.035em`
- Large numbers (scores): `-0.06em`
- Section headings: `-0.015em` to `-0.02em`
- Body: `0` (default)
- Mono labels (uppercase): `0.08em`

---

## MOTION & ANIMATION

### Rule UI-7: Three Durations, One Easing
- Micro (hover, color): `0.25s`
- Response (open/close, tab switch): `0.35s`
- Atmosphere (page transition, reveal): `0.5s`
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` EVERYWHERE — no `ease-in`, no `linear`, no bouncy

### Rule UI-8: Five Animations Only
```css
fadeIn, slideUpFade, slideDown, pulse, shimmer
```
If you need a new animation, justify why none of these 5 work.

---

## INTERACTION PATTERNS

### Rule UI-9: Progressive Disclosure
Default view shows ≤3 primary actions/data points. More hides behind "More controls →" or "Show everything ↓". Never use multiple accordions on one screen. One expand-region max.

### Rule UI-10: Chat as Escape Hatch
Chat pill is bottom-right, `⌘K` to summon. Never the primary interface. Every gallery/picker has "Or describe a custom one →" as fallback. Chat is never modal.

### Rule UI-11: UI for Picking, Chat for Describing
If the thing has a catalog (transitions, fonts, LUTs, stock footage) → gallery. If it's open-ended ("make the intro punchier") → chat. Never force a user to type when a dropdown would do.

### Rule UI-12: Row-Based Progress (No Full-Screen Buffers)
Long operations live in a row in the list, not a full-screen loading state. Gold bar fills, stage labels cycle, percentage shows, user keeps browsing.

### Rule UI-13: Timestamp-Click-to-Scrub
Any timestamp in the UI that references video content is a clickable link. Mono 11px gold, cursor pointer.

---

## COMPONENT PATTERNS

### Rule UI-14: Floating Panel → Drawer Escalation
1. Layer/item selected → floating quick-panel (200-240px, 3-5 props)
2. "More controls →" → drawer slides in (300px, Basic|Advanced tabs)
3. Backend learns: if user opens drawer >3x without using floating → skip to drawer

### Rule UI-15: Topbar Pattern
44-48px. Layout: `[traffic lights] | [Insturix wordmark 800w 14px] | [context] ... [actions] [avatar 24px]`

### Rule UI-16: Card Pattern
`bg: #0F0F0E`, `border: 1px solid #1C1B19`, `border-radius: 12px`. No blur, no shadows.

### Rule UI-17: Score Color Buckets
`score >= 85 → #5EC97E (green)` | `70-84 → #D4A652 (gold)` | `<70 → #D46A5C (red)`
Applied to pill bg at 8% opacity (`{color}14`) + full color text.

---

## DOMAIN EXPERT EXTENSION (Rule 19N for UI)

### Rule UI-18: Would a UI Designer Do It This Way?
Before proposing UI architecture, ask:
- **Typography?** → How does a typographer pair weights? (contrast, not similarity)
- **Color?** → How does a brand designer use accent? (restraint, not decoration)
- **Layout?** → How does an information designer organize? (hierarchy, not symmetry)
- **Motion?** → How does an interaction designer animate? (purpose, not spectacle)
- **Spacing?** → How does a print designer use whitespace? (silence does the work)

### Rule UI-19: No Product Names in UI
Editron, Alyzitron, ThinkForge etc. appear ONLY in topbar mono labels. User-facing copy uses verbs: "Analyze", "Edit", "Write", not product names. Exception: marketing/landing pages.

---

## ACCESSIBILITY

### Rule UI-20: Focus & Keyboard
- Every focusable element: `box-shadow: 0 0 0 2px #D4A65240`
- Tab order: visual top-to-bottom, left-to-right
- Esc closes any overlay (drawer, modal, gallery, chat)
- Primary action = first or last tab stop

---

## SKILLS USAGE

### When to invoke which skill:
| Skill | When |
|---|---|
| `frontend-design` | Starting ANY new page/component — creative direction first |
| `bencium-controlled-ux-designer` | Design decisions, layout questions, accessibility |
| `web-design-guidelines` | Review pass before shipping UI code |
| `vercel-react-best-practices` | React/Next.js perf concerns |
| `vercel-composition-patterns` | Component API design, boolean prop cleanup |
| `vercel-react-view-transitions` | Page transitions, route animations |
| `ui-ux-pro-max` | Style lookups, color/font queries, UX guidelines |
| `ckm-design-system` | Token architecture questions |
| `ckm-ui-styling` | shadcn/ui + Tailwind patterns |

### Skill override:
The `frontend-design` skill bans Inter, Roboto, Arial, Space Grotesk as "overused by AI." Our design system ALSO bans these but replaces with Plus Jakarta Sans + JetBrains Mono specifically. When `frontend-design` suggests a font, override with our locked pair.

---

## DESIGN PHILOSOPHY — THE FIVE LENSES (MANDATORY)

**See `memory/design_philosophy.md` for full reference. Apply ALL five to every UI decision:**

1. **RAMS** — "Good design is as little design as possible." Every element earns its place or dies. Ask: "Does removing this make the product worse?" If no → remove it.
2. **JOBS** — "Design is how it works." Start with the user experience, work backwards. Ask: "Would a first-time user understand in 3 seconds?"
3. **IVE** — "True simplicity is not the absence of clutter." Reduction that reveals. When something feels empty, ask: "Is this emptiness communicating focus?"
4. **VIGNELLI** — "Discipline of restraint." Systems over one-offs. Before adding any new value, ask: "Is this already in the system?"
5. **MÜLLER-BROCKMANN** — "Communication over decoration." For every screen, ask: "What is the ONE thing the user should notice?" If two things compete → one is wrong.

**The Kill Test (before shipping ANY element):**
1. Why does this exist? (not "what" — "why")
2. What happens if I remove it? (if nothing breaks → remove it)
3. Does it respect the hierarchy? (ONE clear focal point?)
4. Is it in the system? (uses design tokens, not custom values?)
5. Would Rams approve? (as little design as possible?)

---

## PRE-UI-EDIT CHECKLIST (extends the code pre-edit checklist)

Before writing or editing ANY UI component:
1. **Is every color from the design system?** (no zinc, no blue, no pure white/black)
2. **Is every font Plus Jakarta Sans or JetBrains Mono?** (no Inter, no Space Grotesk)
3. **Is every weight 400, 500, or 800?** (no 600, no 700)
4. **Is every size in the type scale?** (10/11/13/14/18/24/32/44/110 only)
5. **Is every spacing in the rhythm?** (4/8/12/16/24/32/48/64 only)
6. **Is gold used only for decisions?** (not decorative)
7. **Is there any blur, gradient, or shadow?** (remove it)
8. **Does it follow progressive disclosure?** (≤3 actions visible by default)
9. **Would a domain expert approve?** (Rule UI-18)
10. **Does it work on mobile?** (CSS not canvas, lazy load, bandwidth-sensitive)
11. **Does it pass the Kill Test?** (5 questions above — every element justified)
