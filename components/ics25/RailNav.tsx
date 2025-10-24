"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  label: string;
};

export default function RailNav({
  sections,
  className,
}: {
  sections: Section[];
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const [clicked, setClicked] = useState<string | null>(null);
  const idleTimer = useRef<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isEdgeProximity, setIsEdgeProximity] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const shouldReduceMotion = useReducedMotion();

  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Debounced IntersectionObserver: pick the element with the highest intersectionRatio,
    // but only commit it after a short stability window to avoid flicker during fast scrolls.
    const DEBOUNCE_MS = 150;
    const MIN_RATIO = 0.06; // ignore tiny intersections
    const candidateRef = { current: null as string | null };
    let candidateTimer: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        // choose the entry with the largest intersectionRatio
        const best = entries.slice().sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];
        if (!best) return;
        const bestId = best.target.id;
        const bestRatio = best.intersectionRatio || 0;

        // ignore if too small to be meaningful
        if (bestRatio < MIN_RATIO) return;

  // if same as current active, no-op (use ref to avoid stale closure)
  if (bestId === activeRef.current) return;

        // schedule candidate commit after debounce window
        candidateRef.current = bestId;
        if (candidateTimer) window.clearTimeout(candidateTimer);
        candidateTimer = window.setTimeout(() => {
          requestAnimationFrame(() => setActive(candidateRef.current));
          candidateTimer = null;
        }, DEBOUNCE_MS);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    elements.forEach((el) => observer.observe(el));

    // Immediate best-pass on mount: choose the element with largest visible ratio
    try {
      const viewportTop = 0;
      const viewportBottom = window.innerHeight || 0;
      const ratios = elements.map((el) => {
        const r = el.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.bottom, viewportBottom) - Math.max(r.top, viewportTop));
        const ratio = visible / (r.height || 1);
        return { id: el.id, ratio };
      });
      const bestNow = ratios.sort((a, b) => b.ratio - a.ratio)[0];
      if (bestNow && bestNow.ratio >= MIN_RATIO) {
        setActive(bestNow.id);
      }
    } catch {
      // ignore measure errors during SSR/hydration edge cases
    }

    return () => {
      observer.disconnect();
      if (candidateTimer) window.clearTimeout(candidateTimer);
    };
  }, [ids]);

  // Detect scroll idle to auto-hide the rail after a short pause
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setIsIdle(false);
          if (idleTimer.current) window.clearTimeout(idleTimer.current);
          idleTimer.current = window.setTimeout(() => setIsIdle(true), 900);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // initialize idle state after load
    idleTimer.current = window.setTimeout(() => setIsIdle(true), 1500);
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  // Reveal rail when cursor approaches the right panel/edge
  useEffect(() => {
    const EDGE_PX = 120; // proximity zone from right edge
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vw = window.innerWidth || 0;
        const nearRight = e.clientX >= Math.max(0, vw - EDGE_PX);
        setIsEdgeProximity(nearRight);
        if (nearRight) {
          setIsIdle(false);
        }
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setClicked(id);
    // Clear click highlight shortly after
    window.setTimeout(() => setClicked((curr) => (curr === id ? null : curr)), 1200);
  };

  const shouldHide = isIdle && !isHovering && !isEdgeProximity;
  const activeLabel = useMemo(() => sections.find((s) => s.id === active)?.label ?? null, [sections, active]);
  const activeIdx = useMemo(() => sections.findIndex((s) => s.id === active), [sections, active]);
  const palette = useMemo(
    () => [
      { from: "#FFFFFF", to: "#F8F8F8" }, // white -> off-white
      { from: "#FFFFFF", to: "#F8F8F8" }, // white -> off-white
      { from: "#FFFFFF", to: "#F8F8F8" }, // white -> off-white
      { from: "#FFFFFF", to: "#F8F8F8" }, // white -> off-white
    ],
    []
  );

  return (
    <motion.div
      initial={{ x: 96, opacity: 0 }}
      animate={mounted && !shouldReduceMotion ? { x: shouldHide ? 96 : -32, opacity: shouldHide ? 0 : 1 } : { x: shouldHide ? 96 : -32, opacity: shouldHide ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
      className={cn(
        "pointer-events-none fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden md:block",
        className
      )}
      whileHover={{ scale: 1.15 }}
    >
      <div
        className="pointer-events-auto relative"
        style={{ width: '2px', height: `${sections.length * 40}px` }}
        onMouseEnter={() => {
          if (idleTimer.current) window.clearTimeout(idleTimer.current);
          setIsHovering(true);
          setIsIdle(false);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
          // start a slight delay before hiding to avoid flicker
          idleTimer.current = window.setTimeout(() => setIsIdle(true), 700);
        }}
      >
        {/* Main vertical line */}
        <div className="absolute left-1/2 top-0 w-1 h-full bg-transparent -translate-x-1/2" />

        {/* Horizontal section marks */}
        {sections.map((s, idx) => {
          const isActive = active === s.id;
          const isClicked = clicked === s.id;
          const isExtended = isActive || isClicked || hovered === s.id;
          // stable palette mapping: map section index modulo palette length
          const si = ((idx % palette.length) + palette.length) % palette.length;
          const colors = palette[si] ?? palette[0];

          return (
            <div key={s.id} className="relative" style={{ height: '40px' }}>
              {/* Horizontal mark line with transparent square hit zone */}
              <motion.button
                aria-label={s.label}
                onClick={() => handleClick(s.id)}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{
                  width: '80px',
                  height: '40px',
                  pointerEvents: 'auto',
                  backgroundColor: 'transparent',
                  border: 'none',
                }}
                animate={{
                  opacity: 1,
                }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                whileTap={{
                  scale: 0.9,
                }}
              >
                {/* Inner visual indicator with embedded text */}
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white flex items-center justify-center overflow-hidden rounded-sm"
                  animate={mounted && !shouldReduceMotion ? {
                    width: isExtended ? '80px' : '24px',
                    height: isExtended ? '12px' : '6px',
                    backgroundColor: isActive || isClicked ? `rgb(255, 255, 255)` : 'rgba(255, 255, 255, 0.6)',
                  } : {
                    width: isExtended ? '80px' : '24px',
                    height: isExtended ? '12px' : '6px',
                    backgroundColor: isActive || isClicked ? `rgb(255, 255, 255)` : 'rgba(255, 255, 255, 0.6)',
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  {/* Text that appears inside the expanded line */}
                  <AnimatePresence>
                    {isExtended && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="text-xs font-bold text-black whitespace-nowrap px-1.5 tracking-wide"
                        style={{
                          fontSize: isExtended ? '12px' : '10px',
                          lineHeight: '1',
                          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          letterSpacing: '0.025em',
                        }}
                      >
                        {s.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Subtle glow for active state - positioned around the line only */}
                <motion.div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: isExtended ? '80px' : '24px',
                    height: isExtended ? '12px' : '6px',
                  }}
                  animate={mounted && !shouldReduceMotion ? {
                    width: isExtended ? '80px' : '24px',
                    height: isExtended ? '12px' : '6px',
                    opacity: isActive || isClicked ? 1 : 0,
                    boxShadow: isActive || isClicked
                      ? `0 0 20px ${colors.from}70, 0 0 40px ${colors.to}50, 0 0 60px ${colors.from}40`
                      : "0 0 0 rgba(0,0,0,0)",
                  } : {
                    width: isExtended ? '80px' : '24px',
                    height: isExtended ? '12px' : '6px',
                    opacity: isActive || isClicked ? 1 : 0,
                    boxShadow: isActive || isClicked
                      ? `0 0 20px ${colors.from}70, 0 0 40px ${colors.to}50, 0 0 60px ${colors.from}40`
                      : "0 0 0 rgba(0,0,0,0)",
                  }}
                  transition={{ type: "spring", stiffness: 200, damping: 22 }}
                />
              </motion.button>

            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
