---
name: session-handover-2026-05-27-scroll-motion-design
description: "Phase 1b GSAP ScrollTrigger + Lenis smooth scroll + Control Room motion design plan. 16 commits across 2 branches. Scroll dead zone investigation (4 root causes). Throttle removal = root cause of all jitter."
metadata:
  node_type: memory
  type: project
  originSessionId: current
---

# Session Handover — 2026-05-27 (Scroll Motion Design)

## TL;DR FOR NEXT SESSION

Two workstreams shipped: (1) Phase 1b GSAP ScrollTrigger replacing manual scroll handler on `infrastructure-improvs-+Editron`, (2) Lenis smooth scroll + "Control Room" motion design Phases 1-2 on `uiux-redesign`. The approved plan "You're In The Control Room" has 4 remaining phases (3-6). The single biggest learning: **NEVER throttle setPct** — it was the root cause of ALL jitter complaints. Scroll is now smooth at 60fps.

**Active branch:** `uiux-redesign` (merged from `infrastructure-improvs-+Editron`)
**Worktree:** `D:\google downloads\Front-End-main\uiux-redesign\`
**Latest commit:** `79062603` (fix: faster mount + welcome dissolve)
**Plan file:** `C:\Users\admin\.claude\plans\dazzling-seeking-key.md`

---

## CRITICAL LEARNINGS (READ THESE FIRST — each cost hours to discover)

### L1: NEVER Throttle setPct
The 200ms throttle on `setPct` was the root cause of ALL "jittery," "blocky," "state to state" complaints. `phaseOpacity()`, `sub()`, preview content, chat, toasts — ALL read from React `pct`. At 200ms (5fps), everything IS blocks. CSS transitions can't hide 5fps. GSAP can't hide 5fps. The fix: remove the throttle entirely. `setPct(p)` on every scroll frame. Layers+tracks are GSAP-owned (60fps direct DOM) so they don't trigger extra re-renders. The remaining React consumers (preview, chat, toasts, elapsed) are lightweight enough for 60fps.

### L2: React Reconciliation Overwrites GSAP Direct DOM Writes
If you set a CSS property via both React inline style AND `gsap.set()` or `el.style.x`, React wins on every re-render. This caused:
- **Track fill flicker**: `width: "0%"` in JSX overwriting GSAP's 60fps width
- **pointerEvents race**: `pointerEvents: "none"` in JSX overwriting GSAP's "auto"
- **Editor opacity conflict**: inline opacity fighting mount animation
**RULE:** If GSAP owns a property, REMOVE IT from the React inline style entirely. Use data attributes for GSAP targeting. React provides structure, GSAP owns visual properties.

### L3: Lenis + GSAP scrub = Double Smoothing
Lenis smooths the scroll position (lerp 0.08). GSAP `scrub: 0.5` adds another 500ms of catchup. Two springs fighting = visible bounce/stagger. **FIX:** Use `scrub: true` (instant tracking). Lenis alone provides the momentum feel. Never combine Lenis smoothing with GSAP scrub smoothing.

### L4: useGSAP Scope Must NOT Be scrollRef
When `useGSAP({ scope: scrollRef })`, GSAP limits all CSS selectors to children of scrollRef. But `.editor-root-animated` and the marketing overlay are siblings (position: fixed), not children. GSAP finds zero elements → mount animation never fires → blank page. **FIX:** Omit scope entirely. `useGSAP({ dependencies: [] })`.

### L5: Marketing Must ALWAYS Be In DOM (Never Conditional Mount)
Conditional `{showMkt && (...)}` caused a cascade of 5 bugs:
1. Wheel handler torn down/re-attached on every mount cycle → event gaps
2. React reconciliation overwrote GSAP pointerEvents on re-render → flickering interactivity
3. One-frame gap where mktRef.current was null → GSAP couldn't target it
4. Invisible editor children (z:2, opacity:0, pointerEvents:auto) absorbed events → scroll dead zone
5. Second scroll-down reproduced all bugs
**FIX:** Always render marketing. Toggle `visibility: showMkt ? "visible" : "hidden"` + `pointerEvents: showMkt && pct > 0.59 ? "auto" : "none"`.

### L6: phaseOpacity Math at Boundary
`(pct - r.lo) / fadeInW` = `(0 - 0) / 0.001` = 0 for welcome at pct=0. The first phase was invisible on page load. **FIX:** `r.lo === 0 ? 1 : ...` — skip fadeIn for the initial phase.

### L7: Dimmer Overlay Too Strong = Black Flicker
15% opacity dimmer at pct 0.54→0.58 created visible black flash on scroll-back. **FIX:** 8% max, narrower window 0.55→0.58.

### L8: Mount Animation Delay = Blank Screen
0.6s delay + 0.5s animation = 1.1s of invisible editor on page load. User sees "text disappears." **FIX:** 0.1s delay + 0.4s = 0.5s total. Near-instant.

---

## WHAT SHIPPED (16 commits)

### On `infrastructure-improvs-+Editron` (Phase 1b — 8 commits)

| Commit | What |
|---|---|
| `28bb712a` | Step 0: dead code cleanup (LogoBrand, dead keyframes, dead imports) -61 lines |
| `0722af37` | Phase 1b: GSAP ScrollTrigger replaces manual scroll handler |
| `b979ceb7` | Fix: remove useGSAP scope (blank page — L4) |
| `286b61b6` | Fix: event-driven showMkt + scrub:0.5 momentum |
| `1db25240` | Fix: instant pointerEvents + lower threshold |
| `c31991a8` | Root cause fix: 4 scroll dead zone issues (investigation agent found them) |
| `8de0dfdb` | Always-render marketing (architectural fix — L5) |
| `d5e937c7` | Delay marketing interactivity until visible (pct > 0.59) |

### On `uiux-redesign` (Motion design — 8 commits)

| Commit | What |
|---|---|
| `d5bd2a69` | Lenis smooth scroll + next.config.ts build config |
| `ef03cee8` | Progressive layer reveals + throttle 200ms→100ms |
| `a2d1404a` | Phase 1: 60fps GSAP visual layer + control room dimmer |
| `0783dfe5` | Kill double-smoothing bounce (scrub:true + track ownership — L2, L3) |
| `844051fb` | Phase 2: Preview phase crossfades + dimmer fix (L7) |
| `3945c2e3` | Remove scroll throttle entirely — ROOT CAUSE of all jitter (L1) |
| `2f7df74e` | Welcome phase invisible fix (L6) |
| `79062603` | Faster mount (L8) + welcome dissolve instead of CUT |

---

## ARCHITECTURE: How Scroll Works Now

```
Lenis (smooth scroll, momentum, lerp 0.08)
  ↓ drives
ScrollTrigger (scrub: true = instant tracking)
  ↓ fires onUpdate at 60fps
  ├── GSAP direct DOM: layers opacity/color, track fill widths, playhead position, dimmer
  ├── CSS custom property: --pct (for any future CSS consumers)
  ├── React state: setPct(p) — every frame, no throttle
  └── Event-driven: setShowMkt (immediate at pct > 0.57)

React state (pct) drives:
  ├── pipePct = Math.min(1, pct / 0.55)
  ├── phase = derived from pipePct thresholds
  ├── phaseOpacity() = per-phase opacity for preview crossfades
  ├── sub() = eased sub-progress for preview internal animations
  ├── toasts = filtered by pipePct threshold
  ├── elapsed = formatted time string
  └── chat messages = filtered by threshold

GSAP scrub timeline (on the spacerRef):
  └── Editor fade-out: opacity 1→0, scale 1→0.95, y 0→-20 at pct 0.55→0.58

GSAP onUpdate marketing:
  └── gsap.to(mktRef, { opacity: mktProgress * 10 }) with 0.3s smooth overwrite
```

### Key DOM Structure (z-index stack)
```
z:1    scrollRef (position:fixed, overflowY:auto) → spacerRef (2800vh)
z:2    editor-root-animated (position:fixed, top:64) → topbar + sidebar + preview + timeline + chat
z:2    controlRoomDimmer (position:fixed, inset:0, background:#000, max 8% opacity)
z:3    mktRef (position:fixed, always in DOM, visibility toggled)
z:200  toast-container (position:fixed)
z:10000 film grain overlay (body::after)
```

---

## FILES CHANGED THIS SESSION

| File | Lines | What |
|---|---|---|
| `components/landing-a/landing-page-a.tsx` | 1084 | GSAP ScrollTrigger, Lenis, 60fps layers/tracks, dimmer, no throttle, always-render marketing |
| `components/landing-a/preview-visual.tsx` | 1263 | phaseOpacity() crossfade system, always-render all 8 phases |
| `lib/animation/gsap-config.ts` | 48 | Centralized GSAP plugin registration (unchanged this session) |
| `lib/animation/presets.ts` | 225 | "Confident Mass" manifesto + shared presets (unchanged this session) |
| `hooks/useScrollTimeline.ts` | 159 | ScrollTrigger React hook (unchanged this session) |
| `next.config.ts` | +3 lines | Lenis in optimizePackageImports + UI cacheGroup |
| `package.json` | +1 line | `lenis` dependency |

---

## THE APPROVED PLAN: "You're In The Control Room"

**Full plan:** `C:\Users\admin\.claude\plans\dazzling-seeking-key.md`

**Narrative:** The user isn't scrolling a website. They're scrubbing a production timeline. Like dragging the playhead in DaVinci Resolve. Every motion reinforces this metaphor.

**Reference quality bar:** `components/shared/products/logo-condense.tsx` — 4-layer choreographed scroll-driven reveal where arcs = rooms converging, path draw = platform being built, fill = completion, text = brand emerges. User said: "I want THAT level of deep thinking for every element."

### Motion Lexicon
| Motion | Meaning | For |
|---|---|---|
| ARM | Track going live, tally light on | Layers |
| ROUTE | Signal flowing through pipeline | Pipeline steps |
| CUT/DISSOLVE/IRIS | Program monitor switching feeds | Preview phases |
| INTERCOM | Director calling shots | Chat messages |
| UNFOLD/COLLAPSE | Status display expanding/closing | Toasts |
| SCREENING | Walking from control room to screening room | Editor→marketing |
| PRESENT | Slides in agency pitch | Marketing sections |
| TIMECODE | Running production clock | Elapsed timer |
| CONFIRM | Green light, check draws itself | Checkmarks |

### What's Done vs Remaining

| Phase | Status | What |
|---|---|---|
| 1: 60fps Foundation | ✅ DONE | GSAP direct DOM for layers/tracks, dimmer overlay, Lenis |
| 2: Preview Crossfades | ✅ DONE | phaseOpacity() system, all 8 phases always-render |
| 3: Layers + Pipeline + Checkmarks | ❌ TODO | Layer "arming" tally light pulse, pipeline radial fill, checkmark draw |
| 4: Chat + Toasts + Phase Label | ❌ TODO | Intercom behavior, unfold/collapse, split-flap display, TimecodeDisplay |
| 5: Marketing Reveals | ❌ TODO | Stats curtain, AI editing demo reel, comparison convergence, CTA cascade |
| 6: Polish + Edge Cases | ❌ TODO | Scroll-back, mobile reduced motion, perf guard |

### Phase 3 Detail (next to implement)
- **Layers "arming":** Ghost state (opacity 0.05) → tally light pulse on color bar (scale 1→1.15→1 over 0.3s) → name becomes readable. At doneAt: bar flashes green, checkmark draws via stroke-dashoffset.
- **Pipeline "routing":** Dot fills radially from center (clip-path circle or inner scale). Check draws on completion.
- Currently: layers are GSAP-driven ghost→visible (done in Phase 1). Missing: tally light pulse, checkmark draw animation. Pipeline steps: already have CSS transitions on color/border. Missing: radial fill, check draw.

### Phase 4 Detail
- **Chat "intercom":** Status messages get "on air" dot blink before appearing. Done messages: checkmark draws first, THEN text fades. Complete message: 0.8s slow fade, scale 0.96→1.0 (the "wrap call").
- **Toast "unfold":** Height 0→auto instead of translateY slide. Previous toast shifts up + compresses. Exit: collapse sequence, not binary vanish.
- **Phase label "split-flap":** rotateX 0→90→0 with text swap at midpoint. 3D perspective(400px).
- **TimecodeDisplay:** Per-digit slot-machine roll (old digit slides up, new slides in from below, 0.15s).

### Phase 5 Detail
- **Stats "curtain":** clip-path inset(100% 0 0 0) → inset(0) over 0.5s per cell, stagger 0.1s
- **AI Editing "demo reel":** Left column first, tags stagger 0.04s, right column 0.2s after, arrow draws downward, "91" score pulses
- **Comparison "convergence":** Traditional from left, Insturix from right, translateX ±40→0, steps stagger 0.06s
- **CTA "the ask":** Slowest entrance. Label → heading (0.3s after) → paragraph (0.2s after) → buttons with gold glow pulse (0.3s after) → tagline (0.5s after)

---

## INVESTIGATION: Marketing Scroll Dead Zone (4 Root Causes)

An investigation agent was dispatched and found 4 issues combining to create a multi-second scroll dead zone when marketing appeared:

1. **React reconciliation overwrites GSAP DOM writes** (CRITICAL) — pointerEvents set via `el.style.pointerEvents` was reset to "none" on every React re-render (~5fps). Fix: use React state for pointerEvents.

2. **Invisible editor children absorb events** (CRITICAL) — Editor at opacity:0 (GSAP scrub) still had children with `pointerEvents:"auto"` (topbar, pipeline, chat, drag handle at z:2). Events passed through marketing (z:3, pointerEvents:"none") and were absorbed. Fix: CSS `[data-hidden] * { pointer-events: none !important }`.

3. **Wheel handler no dependency array** (MEDIUM) — useEffect with no deps torn down/re-attached on every render. Fix: `[showMkt]` dependency, then `[]` (always-render architecture).

4. **z-index stacking trap** (CRITICAL) — When marketing had pointerEvents:"none" (React override), events fell through to invisible editor children (z:2) instead of scroll driver (z:1). Fixed by items 1+2.

---

## TECHNIQUES & PATTERNS (reusable)

### Lenis + GSAP Integration Pattern
```tsx
const lenis = new Lenis({ wrapper: scroller, content: spacer, smoothWheel: true, lerp: 0.08, wheelMultiplier: 1 });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```
Lenis wraps a custom scroll container (not the page). GSAP ticker drives Lenis. ScrollTrigger.update fires on every Lenis scroll event. Use `scrub: true` (not 0.5) to avoid double-smoothing.

### GSAP Direct DOM for 60fps Visual Properties
```tsx
// In onUpdate (60fps):
for (let i = 0; i < 6; i++) {
  const el = document.querySelector(`[data-layer-idx="${i}"]`) as HTMLElement;
  if (!el) continue;
  gsap.set(el, { opacity: computedValue });
}
```
React provides structure (JSX elements with data attributes). GSAP owns visual properties (opacity, transform, width). React inline style must NOT include the GSAP-owned properties.

### phaseOpacity() for Preview Crossfades
```tsx
function phaseOpacity(name: string): number {
  const r = phaseRanges[name]; // { lo: 0.06, hi: 0.15 } in pipePct
  const fadeInW = cutIn.has(name) ? 0.001 : 0.02; // CUT vs DISSOLVE
  const inProgress = r.lo === 0 ? 1 : pct < r.lo ? 0 : pct < r.lo + fadeInW ? (pct - r.lo) / fadeInW : 1;
  const fadeOutW = cutOut.has(name) ? 0.001 : 0.02;
  const outProgress = pct < r.hi - fadeOutW ? 1 : pct < r.hi ? 1 - (pct - (r.hi - fadeOutW)) / fadeOutW : 0;
  return Math.min(inProgress, outProgress);
}
```
All phases always rendered. Opacity drives visibility. CUT = 0.001 window (near-instant). DISSOLVE = 0.02 window (2% overlap). `r.lo === 0` special case for welcome.

### Always-Render Pattern (Marketing)
```tsx
<div ref={mktRef} style={{
  visibility: showMkt ? "visible" : "hidden",
  pointerEvents: showMkt && pct > 0.59 ? "auto" : "none",
  opacity: 0, // GSAP owns this
}}>
```
Never mount/unmount. Toggle CSS visibility + pointerEvents via React state. GSAP controls opacity. Eliminates all mount timing bugs.

---

## OPEN ISSUES / KNOWN GAPS

1. **Phases 3-6 not implemented** — all motion design specs are in the plan but not coded
2. **Performance at 60fps React** — no throttle means 60 React re-renders/sec. Currently fine (layers+tracks GSAP-owned). Monitor if more components are added.
3. **Mobile scroll** — Lenis on touch devices needs testing. `smoothWheel: true` may not affect touch scroll.
4. **Scroll-back behavior** — preview crossfades work in reverse (opacity math is bidirectional). Marketing reveals (Phase 5) should NOT reverse (IntersectionObserver fires once).
5. **HeroStatement.tsx** — dead code (exported, never imported). Can be deleted.
6. **uiux-redesign branch** — merged from infra. Has all GSAP foundation + Editron backend work. Landing page changes are on top.
7. **Before-video recorded** — user has an OBS recording of the scroll before changes. Compare after Phase 6.

---

## FOR THE CEO

This session transformed the landing page from a jittery, state-machine-feeling demo into a smooth scroll experience. The approved motion design plan ("You're In The Control Room") treats the scroll as a production timeline — every element's motion tells the story of a video being produced. Layer "arming," pipeline "routing," preview "program monitor switching," chat "director intercom," marketing "agency pitch." The reference bar is the logo-condense.tsx scroll reveal — that level of intentionality for every element.

What shipped: smooth scroll (Lenis), 60fps visual layer (GSAP), preview phase crossfades, no more jitter. What remains: the deep motion work — tally light pulses, split-flap displays, checkmark draws, marketing curtain reveals, CTA glow cascades. 4 phases, ~8 hours.

The user explicitly said: "I don't want classic swipe in or that stuff animation. Each element should have a meaning, a purpose, equal and full attention." The plan delivers exactly that.

---

## FOR THE SENIOR DEV

Key architectural decisions:
- **Hybrid GSAP + React**: GSAP owns continuous visual properties at 60fps (layers, tracks, dimmer, marketing opacity). React owns structure + discrete consumers (phase string, toast filter, chat messages, preview content). No throttle — React renders every frame for discrete consumers.
- **Lenis + scrub:true**: Lenis provides scroll momentum. GSAP tracks instantly. Don't combine both smoothing mechanisms.
- **phaseOpacity()**: All 8 preview phases always in DOM. Opacity-driven crossfades. Each transition type (CUT/DISSOLVE) chosen for narrative meaning. `visibility: hidden` on transparent phases for zero render cost.
- **Always-render marketing**: Conditional mount/unmount caused 5 cascading bugs. Always in DOM with visibility toggle is the stable architecture.
- **data attributes for GSAP targeting**: `data-layer-idx`, `data-track-fill`, `data-track-row`, `data-track-playhead`, `data-layer-bar`, `data-layer-name`. React provides structure, GSAP queries via `document.querySelector`.

The scrollend listener is still present as a safety net but may be unnecessary now that there's no throttle. Can be removed if it causes issues.

---

## WORKTREE MAP

| Path | Branch | Notes |
|---|---|---|
| `D:\google downloads\Front-End-main\Front-End-main\` | `main` | NOT deploy branch |
| `D:\google downloads\Front-End-main\editron-worktree\` | `infrastructure-improvs-+Editron` | PRIMARY deploy. Phase 1b GSAP shipped here. |
| `D:\google downloads\Front-End-main\uiux-redesign\` | `uiux-redesign` | ACTIVE. Merged from infra. Motion design work here. |
| `D:\google downloads\Front-End-main\thinkforge-worktree\` | `thinkforge-enhancementsV2` | Diverged, do NOT cherry-pick |

**RULE: NEVER cherry-pick across branches.** Caused lockfile corruption in prior session. Work directly on target branch or merge.
