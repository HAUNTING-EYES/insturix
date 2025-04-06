"use client";

import React, { useEffect, useRef } from 'react';

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const lastProgress = useRef(progress);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Only animate if progress increases
    if (progress > lastProgress.current) {
      const startTime = performance.now();
      const duration = 500; // 500ms animation
      const startProgress = lastProgress.current;
      const progressDiff = progress - startProgress;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentProgress = startProgress + (progressDiff * eased);

        const bar = document.querySelector(`[data-progress-bar]`);
        if (bar) {
          bar.setAttribute('style', `width: ${currentProgress * 100}%`);
        }

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    }

    lastProgress.current = progress;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [progress]);

  return (
    <div className="h-0.5 bg-black/40 w-full overflow-hidden">
      <div
        data-progress-bar
        className="h-full bg-gradient-to-r from-zinc-100/80 to-zinc-100 transition-all duration-300 ease-out-cubic"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}