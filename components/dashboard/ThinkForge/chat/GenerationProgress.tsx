"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface GenerationProgressProps {
  active: boolean;
  label?: string;
}

/**
 * Optimistic, retention-first progress widget for script generation streams.
 * - Never blocks rendering; purely visual feedback.
 * - Soft target window with easing; accuracy is secondary to reassurance.
 * - Rotates supportive micro-messages to keep users engaged on long runs.
 */
export function GenerationProgress({ active, label = "Forging your script..." }: GenerationProgressProps) {
  const [percent, setPercent] = useState(0);
  const [messageIdx, setMessageIdx] = useState(0);
  const startRef = useRef<number | null>(null);
  const targetRef = useRef<number>(60000); // Start with 60s baseline
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef<NodeJS.Timeout | null>(null);

  const messages = useMemo(
    () => [
      "Analyzing project context...",
      "Aligning narrative parameters...",
      "Structuring logical flow...",
      "Drafting core action steps...",
      "Synthesizing execution guidance...",
      "Injecting expert insights...",
      "Refining instructional tone...",
      "Generating practical examples...",
      "Validating clarity and pacing...",
      "Polishing final output...",
    ],
    []
  );

  // Reset when activation flips on
  useEffect(() => {
    if (active) {
      startRef.current = Date.now();
      // Target between 50s and 80s initially
      targetRef.current = 50000 + Math.random() * 30000;
      setPercent(0);
      setMessageIdx(0);
      
      if (settleRef.current) {
        clearTimeout(settleRef.current);
        settleRef.current = null;
      }
    } else {
      // Completion sequence
      setPercent((prev) => (prev > 0 ? 100 : 0));
      
      if (settleRef.current) {
        clearTimeout(settleRef.current);
      }
      settleRef.current = setTimeout(() => {
        setPercent(0);
        settleRef.current = null;
      }, 1500);
    }
    return () => {
      if (settleRef.current) {
        clearTimeout(settleRef.current);
        settleRef.current = null;
      }
    };
  }, [active]);

  // Rotate messages
  useEffect(() => {
    if (!active) return;
    // Rotate every 4.5 seconds based on message length/complexity
    const interval = setInterval(() => {
      setMessageIdx((idx) => (idx + 1) % messages.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [active, messages.length]);

  // Animation loop
  useEffect(() => {
    if (!active) return;

    const tick = () => {
      if (!startRef.current) return;
      const now = Date.now();
      const elapsed = now - startRef.current;
      let target = targetRef.current;

      // Dynamic extension: if we're getting close (80%) or over, extend target
      // Cap at 130s (2m 10s)
      if (elapsed > target * 0.8) {
         // Gently push target away to prevent stalling
         const extension = 1000; 
         target = Math.min(target + extension, 130000);
         targetRef.current = target;
      }

      // Base progress on time
      const timeProgress = (elapsed / target) * 100;
      
      setPercent((prev) => {
        // Ensure strictly monotonic visual progress
        // We want to approach 98% but never hit 100% until done.
        
        // Target visual % based on time progress, capped at 98%
        const targetVisual = Math.min(98, timeProgress);
        
        // Smooth catchup
        const delta = (targetVisual - prev) * 0.05;
        
        // Always add a tiny creep so it never looks frozen
        const creep = 0.02;
        
        const next = prev + Math.max(delta, creep);
        return Math.min(99, Math.max(0, next));
      });
      
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  if (!active && percent === 0) return null;

  return (
    <div className="px-4 pb-3 pt-2 w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2 text-xs h-5">
        <div className="flex items-center gap-2 font-medium text-zinc-200">
          <Sparkles className="h-3.5 w-3.5 text-violet-400 fill-violet-400/20 animate-pulse" />
          <span>{label}</span>
        </div>
        
        <div className="relative w-64 h-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={messageIdx}
              initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -5, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute right-0 top-0 text-zinc-400 font-medium text-right w-full truncate"
            >
              {messages[messageIdx % messages.length]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      
      <div className="h-1.5 rounded-full bg-zinc-800/50 overflow-hidden border border-zinc-700/30 relative">
        {/* Background shimmer effect */}
        <div className="absolute inset-0 bg-zinc-800/50" />
        
        {/* Progress Fill */}
        <div
          className="h-full bg-linear-to-r from-violet-500 via-fuchsia-500 to-cyan-500 shadow-[0_0_12px_rgba(167,139,250,0.35)] relative"
          style={{ width: `${percent}%` }}
        >
          {/* Glint animation on the bar itself */}
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
      </div>
    </div>
  );
}
