/**
 * ═══════════════════════════════════════════════════════════════════
 * INSTURIX ANIMATION PRESETS — "Confident Mass"
 * ═══════════════════════════════════════════════════════════════════
 *
 * THE FIVE PRINCIPLES (read before adding ANY animation):
 *
 * 1. WEIGHT — Elements have mass. Fast out, controlled deceleration.
 *    Use "expo.out" (GSAP) or cubic-bezier(0.16, 1, 0.3, 1) (CSS).
 *    No linear. No ease-in. Nothing accelerates into a stop.
 *
 * 2. COORDINATION — Choreographed sequences, never simultaneous.
 *    Stagger 0.08s between siblings. Parent reveals first, children after.
 *
 * 3. PURPOSE — Every animation communicates something.
 *    Entrance = "this is now relevant." Exit = "this is leaving."
 *    If you can't state what it communicates, delete it.
 *
 * 4. RESTRAINT — Professional tools don't bounce or jiggle.
 *    No elastic easing on UI. No overshoot.
 *    Durations: 0.25s (micro), 0.35s (response), 0.5s (atmosphere).
 *    Nothing else without explicit justification in a code comment.
 *
 * 5. ALIVE — Idle states breathe. Status dots pulse. Gold accents shimmer.
 *    Use CSS for idle loops (no GSAP overhead). The tool feels ready.
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * This file exports BOTH formats:
 *   - GSAP presets: spread into gsap.from() / gsap.to()
 *   - Framer-motion variants: use with <motion.div variants={...}>
 *
 * Derived from: lib/design-system.ts (motion tokens)
 * Consumed by: every page and component that animates
 *
 * @example GSAP usage:
 *   gsap.from(el, { ...PRESETS.fadeUp })
 *   gsap.from(els, { ...PRESETS.fadeUp, stagger: STAGGER.default })
 *
 * @example Framer-motion usage:
 *   <motion.div variants={FRAMER_VARIANTS.staggerContainer}>
 *     <motion.div variants={FRAMER_VARIANTS.fadeUp}>
 */

// ─── Durations (from design-system.ts motion tokens) ────────────

export const DURATIONS = {
  micro: 0.25,       // Quick feedback: button press, toggle, badge
  response: 0.35,    // Standard transition: card entrance, panel slide
  atmosphere: 0.5,   // Dramatic: page entrance, hero reveal, section appear
} as const;

// ─── Easings ────────────────────────────────────────────────────

export const EASINGS = {
  /** Brand easing. Use for EVERYTHING unless you have a documented reason. */
  out: 'expo.out',
  /** For exit animations only. Elements leaving should accelerate away. */
  in: 'expo.in',
  /** For continuous/looping animations (rare in UI). */
  inOut: 'expo.inOut',
  /** CSS equivalent of the brand easing. Use in inline styles / Tailwind. */
  css: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

// ─── Stagger ────────────────────────────────────────────────────

export const STAGGER = {
  /** Default: 0.08s between siblings. For most list/grid animations. */
  default: { each: 0.08, from: 'start' as const },
  /** Wide: 0.12s. For fewer, larger elements (cards, sections). */
  wide: { each: 0.12, from: 'start' as const },
  /** Tight: 0.04s. For many small elements (icons, dots, letters). */
  tight: { each: 0.04, from: 'start' as const },
} as const;

// ─── GSAP Presets ───────────────────────────────────────────────
// Spread these into gsap.from() for entrance animations.
// gsap.from(element, { ...PRESETS.fadeUp })

export const PRESETS = {
  /** Fade up from 24px below. The workhorse entrance animation. */
  fadeUp: {
    y: 24,
    opacity: 0,
    duration: DURATIONS.atmosphere,
    ease: EASINGS.out,
  },
  /** Pure opacity fade. For overlays, backgrounds, subtle reveals. */
  fadeIn: {
    opacity: 0,
    duration: DURATIONS.response,
    ease: EASINGS.out,
  },
  /** Scale from 92% + fade. For cards, modals, focused elements. */
  scaleIn: {
    scale: 0.92,
    opacity: 0,
    duration: DURATIONS.atmosphere,
    ease: EASINGS.out,
  },
  /** Slide from left. For panels, sidebars, drawers. */
  slideRight: {
    x: -24,
    opacity: 0,
    duration: DURATIONS.atmosphere,
    ease: EASINGS.out,
  },
  /** Slide from right. For opposite-direction panels. */
  slideLeft: {
    x: 24,
    opacity: 0,
    duration: DURATIONS.atmosphere,
    ease: EASINGS.out,
  },
  /** Quick micro feedback. For buttons, toggles, badges. */
  micro: {
    y: 8,
    opacity: 0,
    duration: DURATIONS.micro,
    ease: EASINGS.out,
  },
} as const;

// ─── Framer-Motion Variants ─────────────────────────────────────
// Same values as GSAP presets, formatted for framer-motion's variant system.
// Use: <motion.div variants={FRAMER_VARIANTS.fadeUp} initial="hidden" animate="visible">

const FM_TRANSITION = {
  duration: DURATIONS.atmosphere,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

const FM_TRANSITION_RESPONSE = {
  duration: DURATIONS.response,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

export const FRAMER_VARIANTS = {
  /** Stagger container. Wrap parent element. */
  staggerContainer: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: STAGGER.default.each,
        delayChildren: 0.1,
      },
    },
  },

  /** Wide stagger container. For fewer, larger children. */
  staggerContainerWide: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: STAGGER.wide.each,
        delayChildren: 0.1,
      },
    },
  },

  /** Fade up from 24px. Child variant. */
  fadeUp: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: FM_TRANSITION },
  },

  /** Pure fade. Child variant. */
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: FM_TRANSITION_RESPONSE },
  },

  /** Scale + fade. Child variant. */
  scaleIn: {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1, transition: FM_TRANSITION },
  },

  /** Slide right + fade. Child variant. */
  slideRight: {
    hidden: { opacity: 0, x: -24 },
    visible: { opacity: 1, x: 0, transition: FM_TRANSITION },
  },
} as const;

// ─── ScrollTrigger Presets ──────────────────────────────────────
// Common ScrollTrigger configurations. Spread into ScrollTrigger.create() or timeline scrollTrigger.

export const SCROLL_TRIGGERS = {
  /** Standard reveal: trigger when element is 90% from top of viewport. */
  reveal: {
    start: 'top 90%',
    toggleActions: 'play none none none' as const,
  },
  /** Earlier reveal: trigger at 80%. For important content. */
  earlyReveal: {
    start: 'top 80%',
    toggleActions: 'play none none none' as const,
  },
  /** Pin + scrub: for scroll-driven timeline sections. */
  pinScrub: {
    pin: true,
    scrub: 1,
    anticipatePin: 1,
  },
} as const;
