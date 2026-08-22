'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EditorImportAnimationProps {
  sceneCount?: number;
  step: 'exporting' | 'storyboard';
}

/**
 * Animated preview showing Editor "building" the timeline in real-time.
 * Tiles slide, snap into place, and shimmer while a frosted overlay
 * communicates that Editor is working behind the scenes.
 */
export function EditorImportAnimation({ sceneCount = 4, step }: EditorImportAnimationProps) {
  const displayCount = Math.min(sceneCount, 6);
  const tiles = Array.from({ length: displayCount }, (_, i) => i);

  // Colors per track
  const bgColors = [
    'from-violet-900/60 to-indigo-900/60',
    'from-blue-900/60 to-cyan-900/60',
    'from-[#D4A652]/60 to-pink-900/60',
    'from-emerald-900/60 to-teal-900/60',
    'from-[#D4A652]/60 to-orange-900/60',
    'from-purple-900/60 to-fuchsia-900/60',
  ];

  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-[#0B0B0A] border border-[#1C1B19]">
      {/* Frosted glass overlay with activity indicator */}
      <motion.div
        className="absolute inset-0 z-10 flex items-center justify-center"
        initial={{ backdropFilter: 'blur(0px)' }}
        animate={{ backdropFilter: 'blur(3px)' }}
        transition={{ duration: 1 }}
      >
        <div className="absolute inset-0 bg-[#0B0B0A]/40" />
        <motion.div
          className="relative flex flex-col items-center gap-3"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Pulsing ring */}
          <div className="relative">
            <motion.div
              className="w-10 h-10 rounded-full border-2 border-green-500/30"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-green-500" />
            </motion.div>
          </div>

          <p className="text-[11px] text-[#B5B2A8] font-medium tracking-wide">
            {step === 'exporting' ? 'Editor is arranging your timeline...' : 'Generating & placing scene images...'}
          </p>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-green-500"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Underlying animated timeline */}
      <div className="p-3 space-y-2">
        {/* Fake toolbar */}
        <div className="flex items-center gap-2 pb-2 border-b border-[#1C1B19]/50">
          <div className="w-2.5 h-2.5 rounded-full bg-[#D4A652]/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
          <div className="flex-1" />
          <motion.div
            className="h-2 w-20 rounded bg-[#1C1B19]"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>

        {/* Preview viewport with cycling gradients */}
        <div className="w-full aspect-video bg-[#0F0F0E] rounded-md overflow-hidden relative">
          <motion.div
            className="absolute inset-0"
            animate={{
              background: [
                'linear-gradient(135deg, #0f0c29, #302b63)',
                'linear-gradient(135deg, #1a1a2e, #16213e)',
                'linear-gradient(135deg, #302b63, #24243e)',
                'linear-gradient(135deg, #7209b7, #f72585)',
                'linear-gradient(135deg, #0f0c29, #302b63)',
              ],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Scene title sliding in */}
          <motion.div
            className="absolute top-[12%] left-1/2"
            animate={{
              x: ['-200%', '-50%', '-50%', '200%'],
              opacity: [0, 1, 1, 0],
            }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.15, 0.8, 1] }}
          >
            <div className="h-3 w-28 rounded bg-white/25" />
          </motion.div>

          {/* Caption sliding up */}
          <motion.div
            className="absolute bottom-[10%] left-1/2 -translate-x-1/2"
            animate={{
              y: [20, 0, 0, -10],
              opacity: [0, 0.8, 0.8, 0],
            }}
            transition={{ duration: 3, repeat: Infinity, delay: 0.5, times: [0, 0.15, 0.8, 1] }}
          >
            <div className="h-2 w-44 rounded bg-white/15" />
          </motion.div>

          {/* Image appearing effect (for storyboard step) */}
          {step === 'storyboard' && (
            <motion.div
              className="absolute inset-4 rounded border border-[#1C1B19]"
              animate={{
                opacity: [0, 0.15, 0.15, 0],
                scale: [0.95, 1, 1, 1.02],
              }}
              transition={{ duration: 3.5, repeat: Infinity, delay: 1 }}
            >
              <div className="w-full h-full bg-gradient-to-br from-white/5 to-transparent rounded" />
            </motion.div>
          )}
        </div>

        {/* Timeline tracks with sliding tiles */}
        <div className="space-y-1 pt-1">
          {/* BG Track — tiles slide in from left */}
          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-[#454340] text-right pr-1">BG</div>
            <div className="flex-1 flex gap-0.5 overflow-hidden">
              {tiles.map((i) => (
                <motion.div
                  key={`bg-${i}`}
                  className={`h-5 rounded-sm flex-1 bg-gradient-to-r ${bgColors[i % bgColors.length]} border border-[#1C1B19]`}
                  initial={{ x: -100, opacity: 0, scaleX: 0.3 }}
                  animate={{
                    x: 0,
                    opacity: 1,
                    scaleX: 1,
                  }}
                  transition={{
                    delay: i * 0.5 + 0.3,
                    duration: 0.6,
                    type: 'spring',
                    stiffness: 120,
                    damping: 14,
                  }}
                >
                  {/* Shimmer effect */}
                  <motion.div
                    className="w-full h-full rounded-sm overflow-hidden"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.3 + 1,
                      repeatDelay: 3,
                    }}
                  />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Title Track — tiles snap in from above */}
          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-[#454340] text-right pr-1">Title</div>
            <div className="flex-1 flex gap-0.5 overflow-hidden">
              {tiles.map((i) => (
                <motion.div
                  key={`title-${i}`}
                  className="h-4 rounded-sm bg-blue-500/20 border border-blue-500/15 flex-1"
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: i * 0.5 + 0.6,
                    duration: 0.4,
                    type: 'spring',
                    stiffness: 200,
                    damping: 15,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Narration Track — tiles expand from center */}
          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-[#454340] text-right pr-1">Text</div>
            <div className="flex-1 flex gap-0.5 overflow-hidden">
              {tiles.map((i) => (
                <motion.div
                  key={`text-${i}`}
                  className="h-4 rounded-sm bg-green-500/15 border border-green-500/10 flex-1"
                  initial={{ scaleX: 0, scaleY: 0.3, opacity: 0 }}
                  animate={{ scaleX: 1, scaleY: 1, opacity: 1 }}
                  transition={{
                    delay: i * 0.5 + 0.9,
                    duration: 0.5,
                    type: 'spring',
                    stiffness: 150,
                    damping: 12,
                  }}
                  style={{ transformOrigin: 'center' }}
                />
              ))}
            </div>
          </div>

          {/* Audio Track — appears last, slides from right */}
          <div className="flex items-center gap-1">
            <div className="w-10 shrink-0 text-[8px] text-[#454340] text-right pr-1">Audio</div>
            <div className="flex-1 flex gap-0.5 overflow-hidden">
              {tiles.map((i) => (
                <motion.div
                  key={`audio-${i}`}
                  className="h-3 rounded-sm bg-purple-500/15 border border-purple-500/10 flex-1"
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{
                    delay: i * 0.5 + 1.2,
                    duration: 0.5,
                    type: 'spring',
                    stiffness: 120,
                    damping: 14,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Animated playhead sweeping across */}
        <motion.div
          className="absolute top-14 bottom-2 w-px z-5"
          style={{ background: 'linear-gradient(to bottom, transparent, #22c55e, transparent)' }}
          animate={{ left: ['12%', '88%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
        />

        {/* Green glow at playhead position */}
        <motion.div
          className="absolute top-14 bottom-2 w-4 z-4 -ml-2"
          style={{ background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.1) 0%, transparent 70%)' }}
          animate={{ left: ['12%', '88%'] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
        />
      </div>
    </div>
  );
}
