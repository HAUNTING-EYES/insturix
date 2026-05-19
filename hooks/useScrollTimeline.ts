/**
 * useScrollTimeline — GSAP ScrollTrigger-powered timeline hook
 *
 * Creates a GSAP timeline bound to a ScrollTrigger, scoped to a container ref.
 * Automatically cleans up on unmount (via useGSAP context).
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * useScrollTimeline(containerRef, (tl, trigger) => {
 *   tl.from('.hero', { ...PRESETS.fadeUp })
 *     .from('.cards', { ...PRESETS.fadeUp, stagger: STAGGER.default }, '-=0.3');
 * }, {
 *   start: 'top 80%',
 *   // pin: true, scrub: 1, etc.
 * });
 * ```
 */

'use client';

import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger } from '@/lib/animation/gsap-config';

export interface ScrollTimelineConfig {
  /** ScrollTrigger start position. Default: 'top 90%' */
  start?: string;
  /** ScrollTrigger end position. Default: 'bottom top' */
  end?: string;
  /** Pin the trigger element. Default: false */
  pin?: boolean;
  /** Scrub value. true = instant, number = seconds of catchup. Default: false */
  scrub?: boolean | number;
  /** Toggle actions. Default: 'play none none none' */
  toggleActions?: string;
  /** Anticipate pin. Helps prevent jump. Default: 0 */
  anticipatePin?: number;
  /** Markers for debugging. Default: false */
  markers?: boolean;
  /** Dependencies array for re-running the effect. Default: [] */
  dependencies?: unknown[];
}

/**
 * Creates a ScrollTrigger-powered GSAP timeline scoped to a container ref.
 *
 * @param scopeRef - The container ref that scopes all GSAP selectors
 * @param builder - Callback that receives the timeline and trigger element.
 *                  Add your tweens here.
 * @param config - ScrollTrigger configuration options
 */
export function useScrollTimeline(
  scopeRef: RefObject<HTMLElement | null>,
  builder: (tl: gsap.core.Timeline, trigger: HTMLElement) => void,
  config: ScrollTimelineConfig = {},
) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const {
    start = 'top 90%',
    end = 'bottom top',
    pin = false,
    scrub = false,
    toggleActions = 'play none none none',
    anticipatePin = 0,
    markers = false,
    dependencies = [],
  } = config;

  useGSAP(
    () => {
      const trigger = scopeRef.current;
      if (!trigger) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger,
          start,
          end,
          pin,
          scrub,
          toggleActions,
          anticipatePin,
          markers,
        },
      });

      tlRef.current = tl;
      builder(tl, trigger);
    },
    {
      scope: scopeRef,
      dependencies: [start, end, pin, scrub, ...dependencies],
    },
  );

  return tlRef;
}

/**
 * useStaggerReveal — Staggered entrance animation triggered by scroll
 *
 * Animates children of a container with a staggered fadeUp when scrolled into view.
 * The simplest and most common animation pattern across the site.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * useStaggerReveal(ref, '.card');
 *
 * return (
 *   <div ref={ref}>
 *     <div className="card">...</div>
 *     <div className="card">...</div>
 *   </div>
 * );
 * ```
 */
export function useStaggerReveal(
  scopeRef: RefObject<HTMLElement | null>,
  selector: string,
  config: {
    y?: number;
    duration?: number;
    stagger?: number;
    start?: string;
  } = {},
) {
  const {
    y = 24,
    duration = 0.5,
    stagger = 0.08,
    start = 'top 90%',
  } = config;

  useGSAP(
    () => {
      if (!scopeRef.current) return;

      gsap.from(selector, {
        y,
        opacity: 0,
        duration,
        ease: 'expo.out',
        stagger: { each: stagger, from: 'start' },
        scrollTrigger: {
          trigger: scopeRef.current,
          start,
          toggleActions: 'play none none none',
        },
      });
    },
    { scope: scopeRef },
  );
}
