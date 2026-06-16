# D-015: GSAP Animation Backbone — Hybrid Approach

**Status:** #decided
**Date:** 2026-05-27
**Context:** Animation audit found 179 files using framer-motion, GSAP installed but unused (2 files), no shared animation system, duplicated variant declarations across 20+ files, home page re-rendering 60x/sec on scroll.

## Decision

**Hybrid: keep framer-motion for declarative component animations, add GSAP for scroll-driven timelines, coordinated sequences, and shared presets.**

NOT a migration. Framer-motion stays for 179 files of `whileInView`, `AnimatePresence`, `layout` animations. GSAP handles what framer-motion can't do well: scroll-linked timelines, performance-critical scroll handlers, and a shared animation vocabulary.

## Why Not Full Migration to GSAP?

- 179 files, 3038 `motion.*` usages — weeks of rewrite for no visual improvement
- 10 files use framer's `layout` prop — no GSAP equivalent without manual ResizeObserver
- `AnimatePresence` exit animations across 30 files — manual reimplementation
- Bundle impact neutral: both ~34KB gzipped, loaded on different pages

## What Was Built

### Foundation
- `lib/animation/gsap-config.ts` — centralized plugin registration (ScrollTrigger, InertiaPlugin), global defaults (expo.out, 0.5s)
- `lib/animation/presets.ts` — "Confident Mass" manifesto, dual-format exports (GSAP objects + framer variants + spread presets)
- `hooks/useScrollTimeline.ts` — ScrollTrigger React hook with auto-cleanup
- `next.config.ts` — gsap in UI cacheGroup + optimizePackageImports

### "Confident Mass" Animation Personality
1. **Weight** — expo.out everywhere. No linear. No ease-in.
2. **Coordination** — stagger 0.08-0.12s. Parent first, children after.
3. **Purpose** — every animation communicates something. No decoration.
4. **Restraint** — durations locked to 0.25/0.35/0.5s tokens. No bounce.
5. **Alive** — idle states breathe via CSS (no GSAP overhead).

### Performance Fixes
- Home page: 60 → ~10 re-renders/sec (throttled setPct + CSS transitions)
- Products page: 60 → ~20 re-renders/sec (same pattern)
- Pricing page: 60 → ~20 re-renders/sec (same pattern)

### Dashboard Entrances
- Edit Floor, Musitron, UploaderX, Socialize, Org — all got GSAP `fromTo` staggered entrances

### Variant Dedup
- 8 files deduped from local declarations to shared `FRAMER_VARIANTS` or `SPREAD` imports
- Remaining: HeroStatement.tsx, VideoUpload.tsx (variant key mismatch)

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Full GSAP migration | 179 files, weeks of work, layout prop has no equivalent |
| framer-motion only (fix with useMotionValue) | Doesn't solve the shared presets problem, doesn't add ScrollTrigger capability |
| No change | Home page perf bug stays, dashboards remain dead, variant copy-paste continues |

## Boundary Rule

**GSAP and framer-motion must NEVER animate the same DOM element.** The boundary is spatial (different elements), not temporal. If a `motion.div` exists, GSAP doesn't touch it. If GSAP animates an element, it doesn't get a `motion.*` wrapper.

## Key Lessons

1. Never cherry-pick across diverged branches (corrupts pnpm-lock.yaml)
2. Always use `gsap.fromTo()` when CSS sets initial `opacity: 0` — `gsap.from()` reads current state as target → 0→0 bug
3. Centralize `registerPlugin` — rogue per-file registration causes duplicate registrations and makes cleanup impossible

## Files

- Plan: `C:\Users\admin\.claude\plans\vast-brewing-globe.md`
- Foundation: `lib/animation/gsap-config.ts`, `lib/animation/presets.ts`, `hooks/useScrollTimeline.ts`
- Commits: `1d2e6a08` through `62d7d932` (10 commits on infrastructure-improvs-+Editron)
