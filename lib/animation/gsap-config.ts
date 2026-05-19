/**
 * GSAP Configuration — Central Plugin Registration & Global Defaults
 *
 * Import this module ONCE at the app level (layout or provider).
 * Individual components should never call gsap.registerPlugin() directly.
 *
 * @see lib/animation/presets.ts for shared animation presets
 * @see hooks/useScrollTimeline.ts for React scroll integration
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

// ─── Plugin Registration (one-time, SSR-safe) ──────────────────
// Only register in browser. gsap handles duplicate registration gracefully,
// but we guard anyway to be explicit.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, InertiaPlugin);
}

// ─── Global Defaults ────────────────────────────────────────────
// These apply to every gsap.to(), gsap.from(), gsap.fromTo() call
// unless overridden per-tween. Derived from design-system.ts motion tokens.
gsap.defaults({
  ease: 'expo.out',    // Brand easing: equivalent to cubic-bezier(0.16, 1, 0.3, 1)
  duration: 0.5,       // Atmosphere duration (design token: motion.atmosphere)
});

// ─── SSR Safety ─────────────────────────────────────────────────
// Suppress warnings when GSAP encounters null targets during SSR/hydration.
// This is expected in Next.js App Router where refs are null on the server.
gsap.config({
  nullTargetWarn: false,
});

// ─── ScrollTrigger Defaults ─────────────────────────────────────
if (typeof window !== 'undefined') {
  ScrollTrigger.defaults({
    // "play none none none" = play once on enter, don't reverse
    toggleActions: 'play none none none',
  });
}

// ─── Exports ────────────────────────────────────────────────────
// Re-export so consumers import from here, not directly from 'gsap'.
// This ensures plugins are always registered before use.
export { gsap, ScrollTrigger, InertiaPlugin };
