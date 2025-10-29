# Creators Section - Setup Guide

## Overview
The ICS'25 Creators section now runs as a cinematic, horizontal showcase between the About and Highlights blocks. Each creator occupies a widescreen slide with parallax motion, glassmorphic overlays, and neon gradients for a festival-ready vibe.

## Location
- **Component**: `Front-End/components/ics25/Creators.tsx`
- **Integration**: `Front-End/components/ICS25ClientContent.tsx`
- **Section Order**: About -> **Creators** -> Highlights -> GameOn -> ...

## Experience Highlights
- Immersive gradient mesh backdrop with conic glow accents.
- **Infinite auto-scroll carousel** that loops seamlessly and pauses on hover/touch.
- Horizontal scroll / swipe track with smooth continuous browsing—no end, no beginning.
- Subtle hover lift on slides without heavy animations (respects `prefers-reduced-motion`).
- Large background portrait/promo art with layered glass overlay for legibility.
- Optimized for 60fps performance—no backdrop-blur lag, CSS animations over JS motion.
- Chips, social pills, and CTA copy tuned for high-energy studio vibes.
- Footer capsule teasing weekly lineup drops.

## Structure
1. **Infinite scroll track** – creators array is tripled via `infiniteCreators` to create seamless loop; middle set is the active viewport.
2. **Footer pulse** – ambient capsule reminding visitors about upcoming reveals.

## Managing Creator Data

### Step 1: Prep assets
1. Add portrait images to `/Front-End/public/creators/`.
   - 3:4 or 1:1 ratio works; minimum 800 px on the smallest side for crisp hero backdrops.
   - Use optimized JPG/WEBP if possible (<400 KB).
   - Naming: `creator-name.jpg` (lowercase, hyphenated).

### Step 2: Update the data array
Open `Creators.tsx` and edit the `creators` array:

```typescript
const creators = [
  {
    id: 1,
    name: "Creator Full Name",
    handle: "@creatorhandle",
    avatar: "/creators/creator-name.jpg",
    category: "Gaming",
    followers: "1M+",
    verified: true,
    socials: {
      instagram: "https://instagram.com/handle",
      youtube: "https://youtube.com/@handle",
      twitter: "https://twitter.com/handle",
      twitch: "https://twitch.tv/handle",
    },
  },
  // more creators
];
```

### Step 3: Example entry
```typescript
{
  id: 7,
  name: "Tanmay Bhat",
  handle: "@tanmayBhat",
  avatar: "/creators/tanmay-bhat.jpg",
  category: "Comedy",
  followers: "5M+",
  verified: true,
  socials: {
    youtube: "https://youtube.com/@tanmaybhat",
    instagram: "https://instagram.com/tanmaybhat",
    twitter: "https://twitter.com/tanmaybhat",
  },
},
```

## Customize the Showcase
1. **Headline intel** – Adjust the `headlineMeta` array (inside `Creators`) to rewrite the three stat cards.
2. **Slide order** – Reordering the `creators` array changes the carousel sequence; the first entry is the "Drop 01" hero.
3. **Slide sizing** – Modify the `min-w-[85vw] sm:min-w-[70vw] xl:min-w-[55vw]` classes on the `article` element to change how much of the viewport each slide occupies.
4. **Auto scroll pace** – Update `AUTO_SCROLL_SPEED_PX_PER_SEC` in `Creators.tsx` to change the idle pan speed (set to `80` by default for smooth 60fps performance).
5. **Copy & chips** – Update the `categoryBlurbs` record and the chip text (`Immersive studio session`, `Live Q&A`) to match the real programming.
6. **Disable auto-scroll** – Comment out the `useEffect` that handles auto-scroll if manual-only navigation is desired.

## Navigation
- The section already appears in the floating RailNav under id `creators`.
- No additional routing changes required.

## Accessibility
- Alt text = creator name; social links carry `aria-label`s.
- Keyboard users can tab into social pills and the horizontal track (scroll via Shift+mouse wheel or trackpad).
- All motion obeys `prefers-reduced-motion` (tilt stops, fades remain).

## Troubleshooting
- **Images missing**: ensure `/creators/filename.ext` exists; remember the path is relative to `/public`.
- **Scroll jumps/stutters**: the infinite loop resets position when crossing boundaries; this should be imperceptible at 80px/sec.
- **Auto-scroll not working**: confirm `mounted` state is true and `shouldReduceMotion` is false.
- **Performance/lag**: ensure no additional `backdrop-blur` classes were added; use browser DevTools Performance tab to profile.
- **Touch devices**: auto-scroll pauses on `touchStart` and resumes on `touchEnd`/`touchCancel`.
- **Infinite loop breaks**: verify `infiniteCreators` is rendering 3 copies and scroll position initializes to middle set.

## Color / Motion Reference
- Primary gradient: `#3A9EFF` -> `#7C4DFF` -> `#FF2EE6`
- Background wash: `#0A0A0C` with layered radial gradients.
- Chips & pills: translucent white (`bg-white/[0.08]`) with border `white/18`.
- Hover lift uses CSS `transition-transform` with scale `1.01` to keep motion lightweight (300ms duration).
- Slide entrance uses CSS `@keyframes fadeInUp` animation instead of Framer Motion for better performance.

## Next Steps
1. Gather real creator portraits, follower stats, and social URLs.
2. Populate the `creators` array and blurbs.
3. Review on trackpad, mouse, and touch devices for scroll feel.
4. QA in both light/dark modes (component neutralizes backgrounds automatically).
5. Ship and tease the lineup across socials.
