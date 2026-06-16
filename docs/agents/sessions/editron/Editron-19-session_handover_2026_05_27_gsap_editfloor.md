---
name: session-handover-2026-05-27-gsap-animation-backbone-edit-floor
description: Full GSAP animation system shipped. Edit Floor dashboard redesigned. 10 phases executed. Phase 1b (ScrollTrigger home page rewrite) deferred.
metadata: 
  node_type: memory
  type: project
  originSessionId: 303267ab-621d-450e-a927-690210ad05fa
---

# Session Handover — 2026-05-27 (GSAP + Edit Floor)

## TL;DR FOR NEXT SESSION

Two things shipped: (1) Edit Floor dashboard redesigned as a broadcast control room (Monitor Wall), (2) GSAP animation backbone with 10 phases across the whole site. Phase 1b (full ScrollTrigger home page rewrite) is the ONE remaining GSAP task. Everything else is done.

**Branch:** `infrastructure-improvs-+Editron`
**Latest commit:** `62d7d932` (refactor: Clickatron dedup) — but `29a319a6` is HEAD (overlay signal bridge from a different work stream)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`

---

## CRITICAL: What Went Wrong This Session

### 1. Cherry-Pick Lockfile Corruption (FIXED)
Cherry-picked commits from `main` → `infrastructure-improvs-+Editron`. The `pnpm-lock.yaml` conflict was resolved with `git checkout --theirs` which took main's lockfile. This **downgraded packages across the board** (AWS SDK 3.1045→3.936 and many others), breaking Musitron and Clickatron UIs.

**Fix:** Reverted ALL cherry-picked commits. Re-applied all changes DIRECTLY on infra branch with `pnpm add @gsap/react` (clean +14 line lockfile diff, zero downgrades).

**RULE FOR NEXT SESSION: NEVER cherry-pick across diverged branches. Work directly on the target branch.**

### 2. gsap.from() Opacity Bug (FIXED)
Used `gsap.from('.ef-stagger', { opacity: 0 })` when CSS already set `.ef-stagger { opacity: 0 }`. GSAP `from()` reads the element's CURRENT state as the animation TARGET. So it animated FROM 0 TO 0. Everything was invisible.

**Fix:** Always use `gsap.fromTo()` with explicit start AND end values when CSS sets initial hidden state.

**RULE FOR NEXT SESSION: ALWAYS use `gsap.fromTo()`, never `gsap.from()`, when elements start hidden via CSS.**

---

## What Shipped

### Edit Floor Dashboard (Monitor Wall Design)

**File:** `components/editron/project/project-dashboard.tsx` (1067 lines)
**Commit:** `fc738481` (original), survived the revert, lives on infra

**The design:**
- SMPTE color bars on a hero broadcast monitor (upload zone) with CRT power-on animation, scanlines, drift overlay, curvature vignette
- AI/GPU system meters (left side) — respond to auto-edit pipeline stages
- Script teleprompter monitor (right side) with scrolling text + From Script form
- Phase-continuous oscilloscope strip (Canvas, 5 harmonics, irrational frequency ratios) — one continuous waveform, red chaos → green calm as pipeline stages progress. One label below showing current stage.
- Horizontal scrollable project strip with monitor-style cards, tally lights, processing noise canvas
- Running 30fps timecode, ambient screen glow
- Background atmospheric oscilloscope SVG at 0.03 opacity
- All business logic preserved: upload flow (6-step pipeline), AutoEditDialog, UploadProgressBar, delete confirmation, project CRUD, polling

**The oscilloscope math (important for Phase 1b or future tuning):**
- Phase advances by `speed * dt` each frame (never resets — phase-continuous)
- 5 harmonics always present, each with independent amplitude envelope that lerps
- Irrational frequency ratios: [2.0, 3.17, 5.43, 8.71, 13.29] (wave never repeats)
- Phase speed multipliers per harmonic: [1.0, 1.31, 0.73, 1.67, 2.09]
- Three lerp rates: color 0.06 (leads), amplitudes 0.035 (follows), speed 0.025 (slowest)
- Stage mapping from `autoEditProgress` string → stage index (0-5) or -1 (idle)
- Color stops: red (#E05252) → red-orange → gold → yellow-gold → lime → green (#5EC97E)
- Labels: 'Uploading...', 'Analyzing...', 'Generating captions...', 'Applying transitions...', 'Assembling...', 'Delivering...'

**Mockup files (for reference, in uiux-redesign worktree):**
- Approved final: `uiux-redesign/public/mockups/editron-dashboard-Definitive-v2.html`
- All 14 iterations: `editron-dashboard-{A..H,MonitorWall,FloorPlan,Moviola,Gate,Signal,Take,ScreeningRoom,EditSuite,MonitorWallV2,Configurator,Definitive,Definitive-v2}.html`

---

### GSAP Animation Backbone — 10 Phases

**Plan file:** `C:\Users\admin\.claude\plans\vast-brewing-globe.md`
**Decision doc:** `D:\Insturix-Brain\03-Decisions\D-015-GSAP-Animation-Backbone.md`

| Phase | Commit | What | Files Changed | Lines |
|-------|--------|------|---------------|-------|
| 0+8 | `1d2e6a08` | GSAP foundation + rogue cleanup | 8 | +423 -10 |
| 1 | `be7b1d75` | Home page scroll perf (60→10 re-renders/sec) | 1 | +35 -11 |
| 2 | `670e4de3` | Edit Floor GSAP entrance (gsap.fromTo) | 1 | +26 -10 |
| 3A | `40c863d7` | Musitron + UploaderX entrance | 2 | +33 -5 |
| 3B | `73166e7a` | Socialize + Org entrance | 2 | +33 -3 |
| 4 | `797b6c59` | Products page scroll throttle (60→20/sec) | 1 | +22 -2 |
| 5 | `44aea957` | Pricing scroll throttle + variant dedup | 1 | +29 -10 |
| 6 | `9e9d9cbb` | About page variant dedup | 1 | +7 -12 |
| 7A | `38b3c3e5` | Newsroom + Support + Products-vertical dedup | 3 | +15 -24 |
| 7B | `62d7d932` | Spread presets + Clickatron dedup | 4 | +49 -15 |

**Total: 24 files, +672 -102 lines across 10 commits.**

---

## New Files Created

| File | Purpose |
|------|---------|
| `lib/animation/gsap-config.ts` | Centralized GSAP plugin registration (ScrollTrigger, InertiaPlugin), global defaults (expo.out, 0.5s), SSR safety |
| `lib/animation/presets.ts` | "Confident Mass" manifesto pinned as header. Exports: DURATIONS, EASINGS, STAGGER, PRESETS (GSAP), FROM (GSAP initial states), FRAMER_VARIANTS (variant format), SPREAD (prop-spread format), SCROLL_TRIGGERS |
| `hooks/useScrollTimeline.ts` | React hook wrapping useGSAP with ScrollTrigger. Also exports useStaggerReveal. |
| `D:\Insturix-Brain\03-Decisions\D-015-GSAP-Animation-Backbone.md` | Obsidian decision doc |

---

## "Confident Mass" Animation Personality (THE MANIFESTO)

Pinned at the top of `lib/animation/presets.ts`. Every future animation decision should reference this:

1. **Weight** — Elements have mass. Fast out, controlled deceleration. `expo.out` everywhere. No linear. No ease-in.
2. **Coordination** — Choreographed sequences, never simultaneous. Stagger 0.08-0.12s. Parent first, children after.
3. **Purpose** — Every animation communicates something. If you can't state what it communicates, delete it.
4. **Restraint** — No bounce, no elastic, no overshoot. Durations locked: 0.25s (micro), 0.35s (response), 0.5s (atmosphere).
5. **Alive** — Idle states breathe via CSS. The tool feels ready, not dead.

---

## Design Tokens → GSAP Mapping

| Design Token | CSS Variable | GSAP |
|---|---|---|
| motion.micro (0.25s) | `--motion-micro` | `{ duration: 0.25, ease: "expo.out" }` |
| motion.response (0.35s) | `--motion-response` | `{ duration: 0.35, ease: "expo.out" }` |
| motion.atmosphere (0.5s) | `--motion-atmosphere` | `{ duration: 0.5, ease: "expo.out" }` |
| stagger default | N/A | `{ each: 0.08, from: "start" }` |
| stagger wide | N/A | `{ each: 0.12, from: "start" }` |
| Brand easing CSS | `cubic-bezier(0.16, 1, 0.3, 1)` | `"expo.out"` |

---

## Performance Fixes Applied

| Page | Before | After | Method |
|------|--------|-------|--------|
| Home (`landing-page-a.tsx`) | 60 React re-renders/sec on scroll | ~10/sec | setPct throttled to 100ms, CSS `--pct` custom property at 60fps, scrollend listener, Chat scrollTo changed to [visibleMsgCount] dep |
| Products (`products-page.tsx`) | 60 re-renders/sec | ~20/sec | setScrollPct throttled to 50ms, existing CSS transition smooths, scrollend listener |
| Pricing (`pricing-page.tsx`) | 60 re-renders/sec | ~20/sec | Same throttle pattern on CostAccumulation scroll handler |

**Pattern for scroll throttle (reusable):**
```tsx
const lastRef = useRef(0);
// Inside scroll handler:
const now = performance.now();
if (now - lastRef.current > 100) { // 100ms = ~10fps, 50ms = ~20fps
  setState(newValue);
  lastRef.current = now;
}
// Plus scrollend listener to catch final frame:
el.addEventListener("scrollend", syncFinalState, { passive: true });
```

---

## Dashboard Pages Animation Status

| Dashboard | Before | After | Method |
|-----------|--------|-------|--------|
| Edit Floor | CSS @keyframes efStaggerIn with manual delays | GSAP fromTo with shared presets | `useGSAP` + `STAGGER.wide` |
| Musitron | Zero animation | GSAP staggered fadeUp | `data-animate` + `gsap.fromTo` |
| UploaderX | Zero animation | GSAP staggered fadeUp | `data-ux-animate` + `gsap.fromTo` |
| Socialize | Zero animation | GSAP staggered fadeUp | `data-soc-animate` + `gsap.fromTo` |
| Org | Zero animation | GSAP staggered fadeUp | `data-animate` + `gsap.fromTo` |
| Billing | framer-motion entrance (already had) | Unchanged | Skipped — GSAP+framer boundary rule |

---

## Variant Dedup Status

| File | Status | Notes |
|------|--------|-------|
| about-page.tsx | ✅ Deduped | fadeUp + staggerContainer + scaleIn → shared. Local fadeIn kept (y:16) |
| pricing-page.tsx | ✅ Deduped | fadeUp + stagger → shared. Local fadeIn kept (y:12) |
| newsroom-broadcast.tsx | ✅ Deduped | fadeUp + staggerContainer → shared. Local staggerItem kept (y:20, 0.45s) |
| support-credits.tsx | ✅ Deduped | fadeUp + staggerContainer → shared |
| products-page-vertical.tsx | ✅ Deduped | fadeUp + stagger → shared (y:32→24, duration:0.6→0.5 standardized) |
| ClickatronHistory.tsx | ✅ Deduped | fadeIn → SPREAD.fadeUp |
| CanvasStage.tsx | ✅ Deduped | fadeIn → SPREAD.fadeUp |
| FineTuningPanel.tsx | ✅ Deduped | fadeIn → SPREAD.slideFromRight |
| HeroStatement.tsx | ❌ Skipped | Dead code — exported but never imported anywhere |
| VideoUpload.tsx | ❌ Skipped | Has `exit` state that SPREAD presets don't cover |

---

## What's Left (Prioritized)

### 1. Phase 1b: Full GSAP ScrollTrigger for Home Page (DEFERRED)
**File:** `components/landing-a/landing-page-a.tsx` (974 lines)
**Effort:** 6-8 hours dedicated session
**Risk:** HIGH — CEO flagged timing differences with scrub:1

**Current state:** Throttle fix shipped (Phase 1, 83% fewer re-renders). Phase 1b replaces `setPct` entirely with GSAP ScrollTrigger timeline → zero React re-renders during scroll.

**What needs to happen:**
1. Record before-video of full scroll sequence at 60fps
2. Map every `pct` consumer to a ScrollTrigger tween:
   - `editorFade` (opacity + transform at pct 0.55-0.58) → tl.to at scroll position
   - `mktPct` (marketing opacity at pct 0.57-1.0) → tl.from at scroll position
   - `phase` labels → timeline onUpdate with label callbacks
   - `toasts` → ScrollTrigger onEnter/onLeave for each toast threshold
   - `elapsed` timer → ScrollTrigger onUpdate
   - Track `width` fills in TL component → tl.to with scaleX (compositor-friendly)
   - Chat messages → ScrollTrigger callbacks for message visibility
3. Keep `pct` as throttled state (~4fps) ONLY for conditional renders (showMkt, toast filtering)
4. Record after-video, frame-by-frame comparison at 6 key scroll points
5. Mobile: ScrollTrigger disabled, static rendering

**Key complexity:** `pct` drives EVERYTHING — 15+ sub-components, conditional rendering, text content. Can't fully eliminate React state. The hybrid approach: GSAP for visuals (60fps compositor), throttled React for logic (~4fps for text/conditional).

**Sub-components that consume pct:**
- `TL` (timeline) — receives `pct` for track fill widths
- `Chat` — receives `pct` for message filtering + auto-scroll
- `PreviewVisualInsturix` — receives `pct` + `sub()` for preview state
- Toast stack — `useMemo` filters TOASTS by `pipePct >= t.at`

**The `--pct` CSS custom property** is already being set at 60fps (from Phase 1). Future opportunity: use CSS `calc(var(--pct))` for some visual properties, eliminating even the throttled React state for those.

### 2. LCP Investigation (NOT STARTED)
User asked about Largest Contentful Paint. The GSAP work doesn't help LCP — it helps INP/TBT (interaction responsiveness). LCP improvement needs: bundle splitting, image optimization, font loading, critical CSS. Separate workstream.

### 3. HeroStatement.tsx Cleanup
Dead code. Exported but never imported. Can be deleted or left as-is.

---

## Architecture: GSAP + Framer-Motion Boundary

**Spatial boundary:** GSAP and framer-motion NEVER animate the same DOM element.
- If an element has `motion.*` wrapper → framer-motion owns it
- If an element has `data-animate` / `data-ux-animate` → GSAP owns it
- If a page uses both → different elements, clear separation

**Two preset formats for two patterns:**
1. `FRAMER_VARIANTS` — for `<motion.div variants={fadeUp} initial="hidden" animate="visible">` (the variant pattern)
2. `SPREAD` — for `<motion.div {...SPREAD.fadeUp}>` (the prop-spread pattern)

**Why both exist:** The codebase uses both patterns. Some components use variants with stagger containers. Others use prop spreading for standalone entrances. Forcing one pattern would require rewriting JSX across 30+ files.

---

## Key Packages

| Package | Version | Role |
|---------|---------|------|
| gsap | ^3.13.0 | Animation engine (was already installed, now used) |
| @gsap/react | ^2.1.2 | React integration (useGSAP hook) — ADDED this session |
| framer-motion | ^12.23.24 | Declarative component animations (179 files, unchanged) |

**Webpack chunking:** gsap + @gsap/react added to the `ui` cacheGroup in `next.config.ts` alongside framer-motion and Radix. Also added to `optimizePackageImports` for tree-shaking.

---

## Techniques & Patterns (for future reference)

### Scroll Throttle Pattern
```tsx
const lastRef = useRef(0);
const onScroll = () => {
  const now = performance.now();
  if (now - lastRef.current > 100) { // adjust: 100ms=10fps, 50ms=20fps
    setState(value);
    lastRef.current = now;
  }
};
// Always pair with scrollend to catch final frame:
el.addEventListener("scrollend", () => setState(getCurrentValue()));
```

### GSAP Dashboard Entrance Pattern
```tsx
import { useGSAP } from '@gsap/react';
import { gsap } from '@/lib/animation/gsap-config';
import { DURATIONS, STAGGER } from '@/lib/animation/presets';

const pageRef = useRef<HTMLDivElement>(null);

useGSAP(() => {
  gsap.fromTo('[data-animate]',
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out',
      stagger: { each: STAGGER.wide.each, from: 'start' } }
  );
}, { scope: pageRef });

// JSX: <div ref={pageRef}> ... <div data-animate style={{ opacity: 0 }}>
```

### CSS Custom Property for 60fps Scroll Values
```tsx
// In scroll handler (runs every rAF frame):
el.style.setProperty("--pct", String(newPct));
// No React re-render. CSS can read: opacity: clamp(0, calc(...var(--pct)...), 1)
```

---

## Learnings (HARD-WON)

1. **NEVER cherry-pick across diverged branches.** pnpm-lock.yaml conflicts will corrupt package resolutions. Work directly on the target branch.

2. **ALWAYS use gsap.fromTo(), never gsap.from()** when CSS sets initial opacity:0. `from()` reads current DOM state as the animation TARGET — so `from({opacity:0})` on an element that's already `opacity:0` animates FROM 0 TO 0.

3. **scrollend event** is essential when throttling scroll handlers. Without it, the last frame of scroll gets dropped and the final state doesn't sync.

4. **Variant key names matter.** Some components use `hidden`/`visible`, others use `hidden`/`show`, others use `initial`/`animate`. The shared presets can't cover all patterns without multiple export formats.

5. **Additive changes to >300 LOC files** don't require dead code cleanup (Rule 1). Dead code cleanup is for STRUCTURAL REFACTORS, not for adding an import + hook + data attributes.

6. **ESLint must run alongside tsc.** Both are required by CLAUDE.md Rule 4. Missing eslint was caught in self-audit mid-session.

7. **The `ui` webpack cacheGroup** must include gsap. Without it, gsap falls into the generic `vendor` chunk and loads on every page regardless of whether animations are used.

8. **Lockfile diffs should be TINY.** If `pnpm-lock.yaml` changes more than ~50 lines for a single package addition, something is wrong. The correct diff for adding `@gsap/react` was +14 lines.

---

## Files Modified This Session (Complete List)

**New files:**
- `lib/animation/gsap-config.ts`
- `lib/animation/presets.ts`
- `hooks/useScrollTimeline.ts`
- `D:\Insturix-Brain\03-Decisions\D-015-GSAP-Animation-Backbone.md`

**Modified files:**
- `next.config.ts` — gsap in UI chunk + optimizePackageImports
- `package.json` — +@gsap/react
- `pnpm-lock.yaml` — +14 lines
- `components/editron/project/project-dashboard.tsx` — GSAP entrance (Edit Floor)
- `components/landing-a/landing-page-a.tsx` — scroll throttle
- `components/shared/products/products-page.tsx` — scroll throttle
- `components/shared/pricing-page.tsx` — scroll throttle + variant dedup
- `components/shared/about-page.tsx` — variant dedup
- `components/shared/newsroom/newsroom-broadcast.tsx` — variant dedup
- `components/shared/support-us/support-credits.tsx` — variant dedup
- `components/shared/products/products-page-vertical.tsx` — variant dedup
- `components/dashboard/Musitron/MusitronLayout.tsx` — GSAP entrance
- `components/dashboard/UploaderX/ClientWrapper.tsx` — GSAP entrance
- `components/dashboard/Socialize/SocializeDashboard.tsx` — GSAP entrance
- `app/dashboard/org/page.tsx` — GSAP entrance
- `components/dashboard/Clickatron/ClickatronHistory.tsx` — spread dedup
- `components/dashboard/Clickatron/stages/CanvasStage.tsx` — spread dedup
- `components/dashboard/Clickatron/canvas/FineTuningPanel.tsx` — spread dedup
- `components/DotGrid.tsx` — centralized gsap import
- `components/dashboard/ThinkForge/animations/scroll-up.tsx` — centralized gsap import + scoped cleanup fix

**Mockup files (uiux-redesign worktree, NOT on infra):**
- `uiux-redesign/public/mockups/editron-dashboard-Definitive-v2.html` (approved final)
- 13 other mockup iterations (A through MonitorWallV2)

---

## Open Issues / Known Gaps

1. **Phase 1b not done** — home page still uses throttled setPct (83% fix), not full ScrollTrigger (100% fix)
2. **HeroStatement.tsx is dead code** — exported, never imported
3. **VideoUpload.tsx fadeIn has exit state** — shared SPREAD presets don't cover `exit` animations
4. **4 files still have local fadeIn declarations** (about-page, pricing-page, newsroom staggerItem, VideoUpload) — all with documented reasons for keeping them local
5. **No LCP investigation done** — user asked about it, explained it's a different metric from scroll perf
6. **Obsidian vault session note not written** — spawned task chip but may not have been executed

---

## For the CEO

This session shipped the animation infrastructure that makes Insturix feel like a premium tool. Every competitor (Runway, Pika, Kling) has the same generic framer-motion fade-ups. Insturix now has:
- A documented animation personality ("Confident Mass")
- Shared presets that enforce brand consistency
- 5 dashboard pages that feel alive instead of dead
- 3 scroll performance fixes on the most-visited pages
- A foundation (GSAP + hooks + presets) that makes future animation work 10x faster

The Edit Floor dashboard specifically communicates "professional production tool" through its broadcast control room aesthetic. Agencies evaluating the platform will notice.

---

## For the Senior Dev

The key architectural decisions:
- **Hybrid, not migration.** framer-motion stays for 179 files. GSAP for scroll + sequences + shared presets. Spatial boundary (different DOM elements).
- **Dual-format presets.** `FRAMER_VARIANTS` for variant pattern, `SPREAD` for prop-spread pattern. Same values, different shapes. One source of truth.
- **Throttle over rewrite.** Home page got a throttle (safe, 83% improvement) instead of a ScrollTrigger rewrite (risky, 100% improvement). Phase 1b deferred for dedicated session.
- **expo.out ≈ cubic-bezier(0.16, 1, 0.3, 1).** GSAP's `expo.out` is near-identical to the brand easing. Not exact (GSAP uses a parametric function, CSS uses a bezier), but the visual difference is imperceptible.

The scroll throttle pattern is dead simple and reusable. The GSAP entrance pattern is 10 lines. Both are documented in this handover and in the presets.ts comments.
