"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Hammer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface GenerationProgressProps {
  active: boolean;
  intent?: string | null;
  label?: string;
  progressOverride?: number | null;
  messageOverride?: string | null;
}

/**
 * Sleek, ThinkForge-branded progress indicator.
 * Only appears for script-related intents (generation/refinement).
 * Uses a "forging" aesthetic with red/neutral tones.
 */
export function GenerationProgress({ 
  active, 
  intent, 
  label = "Forging Script...",
  progressOverride,
  messageOverride 
}: GenerationProgressProps) {
  const [percent, setPercent] = useState(0);
  const [messageIdx, setMessageIdx] = useState(0);
  const startRef = useRef<number | null>(null);
  const targetRef = useRef<number>(60000);
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef<NodeJS.Timeout | null>(null);

  // Only show for script-related intents
  const isScriptIntent = intent === 'draft' || intent === 'edit' || intent === 'hybrid';
  const hasBackendSignal = progressOverride !== null && progressOverride !== undefined || !!messageOverride;
  const shouldShow = active && (isScriptIntent || hasBackendSignal);

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

  // Display logic: Prefer backend message/progress if provided
  const currentMessage = messageOverride || messages[messageIdx % messages.length];
  const normalizedOverride = progressOverride !== null && progressOverride !== undefined
    ? (() => {
        const raw = progressOverride <= 1 ? progressOverride * 100 : progressOverride;
        return Math.max(0, Math.min(100, Math.round(raw)));
      })()
    : null;

  // Reset when activation flips on
  useEffect(() => {
    if (shouldShow) {
      startRef.current = Date.now();
      targetRef.current = 45000 + Math.random() * 25000; // 45-70s
      setPercent(0);
      setMessageIdx(0);
      
      if (settleRef.current) {
        clearTimeout(settleRef.current);
        settleRef.current = null;
      }
    } else if (!active) {
      // Completion sequence
      setPercent((prev) => (prev > 0 ? 100 : 0));
      
      if (settleRef.current) {
        clearTimeout(settleRef.current);
      }
      settleRef.current = setTimeout(() => {
        setPercent(0);
        settleRef.current = null;
      }, 1000);
    }
    return () => {
      if (settleRef.current) {
        clearTimeout(settleRef.current);
        settleRef.current = null;
      }
    };
  }, [shouldShow, active]);

  // Rotate messages
  useEffect(() => {
    if (!shouldShow) return;
    const interval = setInterval(() => {
      setMessageIdx((idx) => (idx + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [shouldShow, messages.length]);

  // Animation loop for baseline progress
  useEffect(() => {
    if (!shouldShow) return;

    const tick = () => {
      if (!startRef.current) return;
      const now = Date.now();
      const elapsed = now - startRef.current;
      let target = targetRef.current;

      if (elapsed > target * 0.85) {
         const extension = 800; 
         target = Math.min(target + extension, 120000);
         targetRef.current = target;
      }

      if (normalizedOverride !== null) {
        setPercent((prev) => {
          const delta = normalizedOverride - prev;
          const next = prev + delta * 0.12;
          return Math.max(0, Math.min(100, next));
        });
      } else {
        const timeProgress = (elapsed / target) * 100;
        
        setPercent((prev) => {
          const targetVisual = Math.min(98, timeProgress);
          const delta = (targetVisual - prev) * 0.04;
          const creep = 0.015;
          const next = prev + Math.max(delta, creep);
          return Math.min(99, Math.max(0, next));
        });
      }
      
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldShow, normalizedOverride]);

  if (!shouldShow && percent === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="px-6 py-4 w-full border-t border-neutral-800/50 bg-neutral-900/20 backdrop-blur-md"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Hammer className="h-4 w-4 text-red-500" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-red-500 rounded-full blur-md -z-10"
              />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              {label}
            </span>
          </div>
          
          <div className="h-4 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={currentMessage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-[11px] font-medium text-neutral-500 italic block"
              >
                {currentMessage}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        
        <div className="h-[2px] w-full bg-neutral-800 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-red-600 relative"
            style={{ width: `${percent}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          >
            {/* Forging Glow */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-full bg-linear-to-r from-transparent to-red-400 blur-sm" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_#ef4444]" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

