import { Easing } from 'remotion';

let gsapModule: { parseEase: (name: string) => ((t: number) => number) | undefined } | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const g = require('gsap');
  gsapModule = g.gsap || g;
} catch {
  // GSAP not available in this environment — Remotion bezier fallback used
}

const BEZIER_FALLBACKS: Record<string, [number, number, number, number]> = {
  'power1.out': [0, 0, 0.58, 1],
  'power1.in': [0.4, 0, 1, 1],
  'power1.inOut': [0.4, 0, 0.6, 1],
  'power2.out': [0.22, 0.61, 0.36, 1],
  'power2.in': [0.55, 0.09, 0.68, 0.53],
  'power2.inOut': [0.45, 0, 0.55, 1],
  'power3.out': [0.16, 1, 0.3, 1],
  'power3.in': [0.55, 0, 1, 0.45],
  'power4.out': [0.08, 0.82, 0.17, 1],
  'power4.in': [0.7, 0, 0.84, 0],
  'back.out(1.7)': [0.34, 1.56, 0.64, 1],
  'back.in(1.7)': [0.36, 0, 0.66, -0.56],
  'elastic.out(1,0.5)': [0.22, 1, 0.36, 1],
  'circ.out': [0, 0.55, 0.45, 1],
  'circ.in': [0.55, 0, 1, 0.45],
  'expo.out': [0.19, 1, 0.22, 1],
  'expo.in': [0.95, 0.05, 0.8, 0.04],
};

const DEFAULT_EASING = Easing.bezier(0.22, 0.61, 0.36, 1); // power2.out

export function resolveEasingCurve(easingName: string): (t: number) => number {
  if (!easingName) return DEFAULT_EASING;

  if (gsapModule?.parseEase) {
    try {
      const parsed = gsapModule.parseEase(easingName);
      if (typeof parsed === 'function') return parsed;
    } catch {
      console.warn(`[MG-Easing] GSAP parseEase failed for "${easingName}", using Remotion fallback`);
    }
  }

  const fallback = BEZIER_FALLBACKS[easingName];
  if (fallback) return Easing.bezier(...fallback);

  console.warn(`[MG-Easing] Unknown easing "${easingName}", using power2.out default`);
  return DEFAULT_EASING;
}

export function isGSAPAvailable(): boolean {
  return gsapModule?.parseEase != null;
}
