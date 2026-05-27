import { useRef, useEffect } from 'react';

// GSAP timeline types — dynamic import since GSAP may not be in all environments.
// Follows same require() pattern as gsap-easing.ts for consistency.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GSAPModule = { timeline: (config: Record<string, unknown>) => GSAPTimeline; registerPlugin: (...args: unknown[]) => void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GSAPTimeline = { seek: (time: number) => void; kill: () => void; to: (...args: any[]) => GSAPTimeline; fromTo: (...args: any[]) => GSAPTimeline; set: (...args: any[]) => GSAPTimeline; duration: () => number };

let gsapModule: GSAPModule | null = null;
let pluginsRegistered = false;

function ensureGSAPWithPlugins(): GSAPModule | null {
  if (gsapModule) return gsapModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const g = require('gsap');
    gsapModule = g.gsap || g;

    if (!pluginsRegistered && gsapModule?.registerPlugin) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ScrambleTextPlugin } = require('gsap/ScrambleTextPlugin');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DrawSVGPlugin } = require('gsap/DrawSVGPlugin');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MorphSVGPlugin } = require('gsap/MorphSVGPlugin');
        gsapModule.registerPlugin(ScrambleTextPlugin, DrawSVGPlugin, MorphSVGPlugin);
        pluginsRegistered = true;
      } catch {
        // Premium timeline plugins not available — CSS fallbacks used in renderer
      }
    }
    return gsapModule;
  } catch {
    return null;
  }
}

export type TimelineBuilder = (tl: GSAPTimeline, container: HTMLElement) => void;

/**
 * Bridge between Remotion's per-frame rendering and GSAP's timeline-based animation.
 * Creates a paused GSAP timeline on mount, seeks to frame/fps each frame.
 * GSAP computes correct state for that time and applies to DOM.
 *
 * For effects CSS cannot handle: text scrambling, SVG stroke drawing, path morphing.
 */
export function useGSAPTimeline(
  frame: number,
  fps: number,
  builder: TimelineBuilder | null,
  startFrame?: number,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<GSAPTimeline | null>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    const g = ensureGSAPWithPlugins();
    if (!g || !containerRef.current || !builder || builtRef.current) return;

    const tl = g.timeline({ paused: true });
    builder(tl, containerRef.current);
    timelineRef.current = tl;
    builtRef.current = true;

    return () => {
      tl.kill();
      timelineRef.current = null;
      builtRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timelineRef.current) {
      const seekTime = startFrame != null ? Math.max(0, (frame - startFrame) / fps) : frame / fps;
      timelineRef.current.seek(seekTime);
    }
  }, [frame, fps, startFrame]);

  return containerRef;
}

// --- Timeline builders ---

export function buildScrambleEntrance(
  tl: GSAPTimeline,
  textEl: Element,
  finalText: string,
  durationSec: number,
  chars?: string,
): void {
  // CRG technique:animation.typewriter — 30-50ms/char, scramble extends with random substitution
  const scrambleChars = chars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  tl.fromTo(textEl,
    { opacity: 0 },
    {
      duration: durationSec,
      opacity: 1,
      scrambleText: {
        text: finalText,
        chars: scrambleChars,
        revealDelay: 0.3,  // ⚠️ INVENTED — CRG typewriter 30-50ms/char maps to 0.2-0.5s delay range
        speed: 0.4,        // ⚠️ INVENTED — moderate scramble update rate
      },
    },
    0,
  );
}

export function buildScrambleExit(
  tl: GSAPTimeline,
  textEl: Element,
  durationSec: number,
  chars?: string,
): void {
  const scrambleChars = chars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  tl.to(textEl, {
    duration: durationSec,
    opacity: 0,
    scrambleText: {
      text: '',
      chars: scrambleChars,
      revealDelay: 0,
      speed: 0.6,  // ⚠️ INVENTED — faster scramble on exit for urgency (CRG exit_speed_rule governs duration, not this param)
    },
  }, 0);
}

export function buildDrawSVGEntrance(
  tl: GSAPTimeline,
  pathEl: SVGElement,
  durationSec: number,
): void {
  tl.fromTo(pathEl,
    { drawSVG: '0%' },
    { duration: durationSec, drawSVG: '100%', ease: 'power2.out' },
    0,
  );
}

export function buildDrawSVGExit(
  tl: GSAPTimeline,
  pathEl: SVGElement,
  durationSec: number,
  offset?: number,
): void {
  tl.fromTo(pathEl,
    { drawSVG: '100%' },
    { duration: durationSec, drawSVG: '0%', ease: 'power2.in' },
    offset ?? 0,
  );
}

export function buildMorphHold(
  tl: GSAPTimeline,
  pathEl: SVGElement,
  targetPath: string,
  holdDurationSec: number,
  offset?: number,
): void {
  // Morph: current shape → target → back. Full cycle over hold duration.
  // ⚠️ 50/50 split INVENTED — equal time forward and back for organic breathing morph
  const halfDur = holdDurationSec / 2;
  const start = offset ?? 0;
  tl.to(pathEl, {
    duration: halfDur,
    morphSVG: targetPath,
    ease: 'power1.inOut',
  }, start);
  tl.to(pathEl, {
    duration: halfDur,
    morphSVG: pathEl,
    ease: 'power1.inOut',
  }, start + halfDur);
}

export function areTimelinePluginsAvailable(): boolean {
  ensureGSAPWithPlugins();
  return pluginsRegistered;
}
