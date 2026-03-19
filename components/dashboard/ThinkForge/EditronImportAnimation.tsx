'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface EditronImportAnimationProps {
  sceneCount?: number;
  step: 'exporting' | 'storyboard';
}

/**
 * Animated preview showing Editron "building" the timeline in real-time.
 * Displays during the import/storyboard generation phase.
 */
export function EditronImportAnimation({ sceneCount = 4, step }: EditronImportAnimationProps) {
  const displayCount = Math.min(sceneCount, 6);
  const tiles = Array.from({ length: displayCount }, (_, i) => i);

  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800">
      {/* Frosted glass overlay */}
      <div className="absolute inset-0 z-10 backdrop-blur-[2px] bg-zinc-950/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-green-500"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
          <p className="text-[11px] text-zinc-400 font-medium">
            {step === 'exporting' ? 'Editron is building your timeline...' : 'Generating scene images...'}
          </p>
        </div>
      </div>

      {/* Fake timeline preview */}
      <div className="p-3 space-y-2">
        {/* Fake toolbar */}
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
          <div className="w-3 h-3 rounded-full bg-red-500/40" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
          <div className="w-3 h-3 rounded-full bg-green-500/40" />
          <div className="flex-1" />
          <div className="h-2 w-16 rounded bg-zinc-800" />
        </div>

        {/* Preview viewport */}
        <div className="w-full aspect-video bg-zinc-900 rounded-md overflow-hidden relative">
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                'linear-gradient(135deg, #0f0c29, #302b63)',
                'linear-gradient(135deg, #1a1a2e, #16213e)',
                'linear-gradient(135deg, #7209b7, #f72585)',
                'linear-gradient(135deg, #0f0c29, #302b63)',
              ],
            }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Scene title appearing */}
          <motion.div
            className="absolute top-[12%] left-1/2 -translate-x-1/2"
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <div className="h-3 w-24 rounded bg-white/20" />
          </motion.div>
          {/* Caption bar */}
          <motion.div
            className="absolute bottom-[12%] left-1/2 -translate-x-1/2"
            animate={{ opacity: [0, 0.5, 1, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <div className="h-2 w-40 rounded bg-white/15" />
          </motion.div>
        </div>

        {/* Fake timeline tracks */}
        <div className="space-y-1 pt-1">
          {/* Track labels */}
          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-zinc-600 text-right pr-1">BG</div>
            <div className="flex-1 flex gap-0.5">
              {tiles.map((i) => (
                <motion.div
                  key={`bg-${i}`}
                  className="h-5 rounded-sm flex-1"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  transition={{
                    delay: i * 0.4 + 0.2,
                    duration: 0.5,
                    ease: 'easeOut',
                  }}
                  style={{
                    background: step === 'storyboard'
                      ? `linear-gradient(90deg, hsl(${i * 60 + 200}, 40%, 25%), hsl(${i * 60 + 230}, 40%, 30%))`
                      : `linear-gradient(90deg, hsl(${i * 40 + 220}, 30%, 20%), hsl(${i * 40 + 240}, 30%, 25%))`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-zinc-600 text-right pr-1">Title</div>
            <div className="flex-1 flex gap-0.5">
              {tiles.map((i) => (
                <motion.div
                  key={`title-${i}`}
                  className="h-4 rounded-sm bg-blue-500/20 border border-blue-500/10 flex-1"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    delay: i * 0.4 + 0.5,
                    duration: 0.4,
                    ease: 'easeOut',
                  }}
                  style={{ transformOrigin: 'left' }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-zinc-600 text-right pr-1">Text</div>
            <div className="flex-1 flex gap-0.5">
              {tiles.map((i) => (
                <motion.div
                  key={`text-${i}`}
                  className="h-4 rounded-sm bg-green-500/15 border border-green-500/10 flex-1"
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{
                    delay: i * 0.4 + 0.7,
                    duration: 0.4,
                    ease: 'easeOut',
                  }}
                  style={{ transformOrigin: 'left' }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Playhead */}
        <motion.div
          className="absolute top-12 bottom-0 w-px bg-green-500/50 z-5"
          animate={{ left: ['15%', '85%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
