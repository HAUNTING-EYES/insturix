"use client";

import React from 'react';

interface ProgressBarProps {
  progress: number;
  status: 'processing' | 'completed' | 'failed' | 'queued';
  expectedDurationSeconds?: number;
}

export function ProgressBar({ progress, status }: ProgressBarProps) {
  return (
    <div className="h-0.5 bg-black/40 w-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-zinc-100/80 to-zinc-100 transform origin-left transition-all"
        style={{
          transform: `scaleX(${status === 'completed' ? 1 : progress})`,
          transitionProperty: 'transform',
          transitionDuration: status === 'processing' ? '0.3s' : '0s', // Use a faster transition
          transitionTimingFunction: 'linear',
          transitionDelay: '0s'
        }}
      />
    </div>
  );
}