# Creators Section - Visual Design Reference

## Section Layout

```
┌────────────────────────────────────────────────────────────────┐
│  HERO ROW                                                      │
│  ┌────────────────────────────────┐  ┌──────────────────────┐  │
│  │ META / STORY PANEL             │  │ SPOTLIGHT CREATOR    │  │
│  │ - Lineup chip                  │  │ - Spotlight tag      │  │
│  │ - Headline copy                │  │ - Drop label         │  │
│  │ - Meta stats (3 cards)         │  │ - Large avatar       │  │
│  │                                │  │ - Name / handle      │  │
│  │                                │  │ - Quick chips        │  │
│  └────────────────────────────────┘  └──────────────────────┘  │
│                                                                │
│  SUPPORTING GRID                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ creator #2 │  │ creator #3 │  │ creator #4 │ → gradient     │
│  │  - tag     │  │  - tag     │  │  - tag     │   bloom        │
│  │  - avatar  │  │  - avatar  │  │  - avatar  │                │
│  │  - chips   │  │  - chips   │  │  - chips   │                │
│  │  - socials │  │  - socials │  │  - socials │                │
│  └────────────┘  └────────────┘  └────────────┘                │
│                 ┌────────────┐  ┌────────────┐                │
│                 │ creator #5 │  │ creator #6 │                │
│                 └────────────┘  └────────────┘                │
│                                                                │
│  • More creator drops unlocked every Friday                    │
└────────────────────────────────────────────────────────────────┘
```

Legend:
- Meta panel = storyline + stats block
- Spotlight = hero creator tile
- Supporting grid = modern cards with gradient bloom
- Footer capsule = cadence teaser

## Design Elements

### Color Palette
```
Background:     #0A0A0C (Dark charcoal)
Card BG:        rgba(255,255,255,0.05) (Translucent white)
Border:         rgba(255,255,255,0.1) (Subtle white)
Primary Blue:   #3A9EFF
Primary Pink:   #FF2EE6
Text White:     #FFFFFF
Text Muted:     rgba(255,255,255,0.6-0.8)
```

### Hover / Motion
1. **Spotlight Card**
   - Gradient bloom intensifies
   - Footer chips glow subtly

2. **Supporting Cards**
   - Card lifts 4px on hover
   - Dual radial gradients animate in
   - Border rim becomes visible

3. **Social Pills**
   - Spring scale to 1.07
   - Maintain minimalist outline aesthetic

### Responsive Breakpoints
- **Mobile**: hero stack vertical, supporting grid 1 column
- **Tablet**: hero uses two rows, supporting grid 2 columns
- **Desktop**: hero splits into 2 columns, supporting grid 3 columns

### Animation Sequence
1. Section fades in when scrolled into view
2. Cards stagger in from bottom (0.08s delay each)
3. Hover effects trigger on mouse enter
4. Reduced motion respected for accessibility

## Component Structure

```
Creators.tsx
├── Radial gradient backdrop layers
├── Hero row (motion)
│   ├── Meta panel card
│   │   ├── Eyebrow chip
│   │   ├── Headline + copy
│   │   └── Meta stat cards (x3)
│   └── Spotlight card
│       ├── Spotlight label + drop id
│       ├── Large avatar + verified badge
│       ├── Name / handle / category
│       └── Role chips (Chip component)
├── Supporting grid (motion)
│   ├── CreatorCard component (x5)
│   │   ├── Gradient overlays
│   │   ├── Avatar block + badge
│   │   ├── Meta chips (followers, role)
│   │   └── SocialLink pills
└── Footer capsule teaser
```

## Typography

```
Section Header (from parent SectionHeader)
Meta Headline:   text-3xl/4xl, semi-bold
Summary Copy:    text-base, 65% opacity white
Meta Stat Label: text-[11px], tracking 0.18em, uppercased
Spotlight Name:  text-2xl, semi-bold
Supporting Name: text-xl, semi-bold
Chips:           text-[11px], tracking 0.18em uppercased
```

## Spacing

```
Section padding:   py-20 md:py-28
Meta card padding:    px-5 py-4
Spotlight padding:    p-8
Supporting padding:   px-6 py-8
Supporting grid gap:  gap-5
Spotlight avatar:     96px (w-24 h-24)
Supporting avatar:    64px (w-16 h-16)
Social pill height:   36px (h-9)
```

## States

### Default
- Card: semi-transparent white background
- Border: subtle white (10% opacity)
- Text: white with varying opacity

### Hover
- Spotlight: chips glow, copy lifts slightly
- Supporting: card lifts, gradient overlay fades in
- Social pills: spring scale, maintain outline aesthetic

### Focus (Keyboard Navigation)
- Same as hover state
- Focus ring on social links

### Loading
- Skeleton placeholder with shimmer
- "Loading creators..." text

## Accessibility Features

✓ Alt text on all images
✓ ARIA labels on social links  
✓ Keyboard navigable social buttons
✓ Semantic HTML structure
✓ Respects prefers-reduced-motion
✓ Sufficient color contrast ratios

## Implementation Notes

- Uses Framer Motion for animations
- Lazy loaded for performance
- Next.js Image for optimization
- Error handling for missing images
- Graceful fallback to initials

---

**Design Philosophy**: Premium, modern, with subtle motion and depth. The section should feel like a high-end product showcase while maintaining the bold, energetic ICS'25 aesthetic.
