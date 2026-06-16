# Session 2026-05-27 — Scroll Motion Design

## What Was DONE

### Phase 1b: GSAP ScrollTrigger (infra branch, 8 commits)
- Replaced manual scroll handler (rAF + throttle) with GSAP ScrollTrigger
- Dead code cleanup: LogoBrand, dead keyframes, dead imports (-61 lines)
- Fixed 5 scroll dead zone bugs via investigation (4 root causes found)
- Marketing overlay: always-render architecture (never mount/unmount)

### Motion Design Phases 1-2 (uiux-redesign branch, 8 commits)
- Lenis smooth scroll added (lerp 0.08, momentum/inertia)
- 60fps GSAP visual layer: layers + tracks as direct DOM writes
- Preview phase crossfades via phaseOpacity() system
- Removed scroll throttle (root cause of all jitter)
- Control room dimmer overlay for editor→marketing transition

## What Was DECIDED
- [[D-015-GSAP-Animation-Backbone]] — hybrid GSAP + framer-motion (prior session)
- **"You're In The Control Room"** motion narrative approved — every element's motion tells the production story
- **NEVER throttle setPct** — root cause of all jitter. Rule for all future work.
- **scrub: true** not scrub: 0.5 — Lenis provides momentum, don't double-smooth
- **Always-render marketing** — conditional mount caused 5 cascading bugs
- Plan file: `~/.claude/plans/dazzling-seeking-key.md`

## What's NEXT
- Phase 3: Layer arming (tally light pulse), pipeline routing (radial fill), checkmark draw
- Phase 4: Chat intercom, toast unfold/collapse, phase label split-flap, TimecodeDisplay
- Phase 5: Marketing bespoke reveals (stats curtain, comparison convergence, CTA cascade)
- Phase 6: Polish, scroll-back, mobile, perf guard

## What Went WRONG
- 5 attempts to fix marketing scroll dead zone before finding the architectural root cause (always-render)
- HTML mockup approach failed — can't replicate 2200-line React app in vanilla HTML
- scrub:0.5 + Lenis = double-smoothing bounce (hours to diagnose)
- React reconciliation overwrites GSAP direct DOM writes (caused 3 separate bugs)
- 200ms throttle was premature optimization that destroyed UX

Tags: #session-notes #animation #gsap #lenis #scroll
