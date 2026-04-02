'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorContext } from '../contexts/editor-context';
import {
  Layers,
  Type,
  Image,
  Film,
  Music,
  Scissors,
  Paintbrush,
  LayoutGrid,
  Search,
  Sparkles,
  Captions,
  Move,
  Trash2,
  Eye,
  Globe,
  CheckCircle2,
  Loader2,
  Bot,
} from 'lucide-react';

// Map tool names to icons and friendly descriptions
const TOOL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  // Adding elements
  add_overlay: { icon: Layers, label: 'Adding element to timeline', color: 'text-blue-400' },
  add_text_overlay: { icon: Type, label: 'Adding text overlay', color: 'text-blue-400' },
  add_image_overlay: { icon: Image, label: 'Adding image', color: 'text-emerald-400' },
  add_video_overlay: { icon: Film, label: 'Adding video clip', color: 'text-purple-400' },
  add_audio_overlay: { icon: Music, label: 'Adding audio track', color: 'text-pink-400' },

  // Modifying
  update_overlay: { icon: Paintbrush, label: 'Updating element', color: 'text-amber-400' },
  batch_update_overlays: { icon: LayoutGrid, label: 'Batch updating elements', color: 'text-amber-400' },
  delete_overlay: { icon: Trash2, label: 'Removing element', color: 'text-red-400' },

  // Editing operations
  split_overlay: { icon: Scissors, label: 'Splitting clip', color: 'text-orange-400' },
  trim_overlay: { icon: Scissors, label: 'Trimming clip', color: 'text-orange-400' },
  sync_style: { icon: Paintbrush, label: 'Syncing styles across elements', color: 'text-violet-400' },
  close_gaps: { icon: Move, label: 'Closing gaps in timeline', color: 'text-cyan-400' },

  // Timeline
  get_timeline_view: { icon: LayoutGrid, label: 'Reading timeline layout', color: 'text-zinc-400' },

  // Creative generation
  generate_html_scene: { icon: Sparkles, label: 'Creating custom scene', color: 'text-fuchsia-400' },
  generate_html_sticker: { icon: Sparkles, label: 'Creating custom sticker', color: 'text-fuchsia-400' },
  generate_image: { icon: Image, label: 'Generating image with AI', color: 'text-emerald-400' },

  // Captions
  add_captions: { icon: Captions, label: 'Adding captions', color: 'text-teal-400' },
  add_fancy_captions: { icon: Captions, label: 'Adding animated captions', color: 'text-teal-400' },
  refresh_fancy_captions: { icon: Captions, label: 'Refreshing captions', color: 'text-teal-400' },
  refresh_captions: { icon: Captions, label: 'Refreshing captions', color: 'text-teal-400' },

  // Analysis
  visual_inspect_frame: { icon: Eye, label: 'Inspecting video frame', color: 'text-sky-400' },
  get_video_duration: { icon: Film, label: 'Checking video duration', color: 'text-zinc-400' },
  analyze_clip_video: { icon: Eye, label: 'Analyzing video clip', color: 'text-sky-400' },
  analyze_clip_audio: { icon: Music, label: 'Analyzing audio', color: 'text-pink-400' },

  // Other
  search_web: { icon: Globe, label: 'Searching the web', color: 'text-blue-300' },
  read_project_file: { icon: Search, label: 'Reading project data', color: 'text-zinc-400' },
  list_project_files: { icon: Search, label: 'Listing project files', color: 'text-zinc-400' },
  apply_project_patch: { icon: Paintbrush, label: 'Applying changes', color: 'text-amber-400' },
};

const DEFAULT_META = { icon: Sparkles, label: 'Processing', color: 'text-zinc-400' };

/**
 * Full-screen overlay that shows AI tool execution in real-time
 * with a frosted glass effect over the editor.
 */
export function AIActivityOverlay() {
  const { isAIProcessing, aiActions } = useEditorContext();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer for elapsed time
  useEffect(() => {
    if (!isAIProcessing) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isAIProcessing]);

  const runningActions = aiActions.filter((a) => a.status === 'running');
  const doneActions = aiActions.filter((a) => a.status === 'done');

  return (
    <AnimatePresence>
      {isAIProcessing && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Backdrop blur */}
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />

          {/* Content */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-6 max-w-md w-full mx-4"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Header card */}
            <div className="w-full rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 shadow-2xl overflow-hidden">
              {/* Animated gradient top bar */}
              <div className="h-1 w-full relative overflow-hidden">
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6)',
                    backgroundSize: '200% 100%',
                  }}
                  animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>

              {/* Main content */}
              <div className="p-6">
                {/* Bot icon with pulse */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="relative">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/20"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    <div className="relative w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Editron AI is editing</h3>
                    <p className="text-xs text-muted-foreground">
                      {elapsedSeconds > 0 ? `${elapsedSeconds}s elapsed` : 'Starting...'}
                    </p>
                  </div>
                </div>

                {/* Activity log */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {/* Running actions */}
                  <AnimatePresence mode="popLayout">
                    {runningActions.map((action) => {
                      const meta = TOOL_META[action.toolName] || DEFAULT_META;
                      const Icon = meta.icon as any;
                      return (
                        <motion.div
                          key={action.id}
                          className="flex items-center gap-3 rounded-lg bg-muted/50 border border-border/30 px-3 py-2.5"
                          initial={{ opacity: 0, x: -20, height: 0 }}
                          animate={{ opacity: 1, x: 0, height: 'auto' }}
                          exit={{ opacity: 0, x: 20, height: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          layout
                        >
                          <div className={`shrink-0 ${meta.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-xs text-foreground flex-1 truncate">
                            {meta.label}
                          </span>
                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Completed actions (show last 5) */}
                  <AnimatePresence mode="popLayout">
                    {doneActions.slice(-5).map((action) => {
                      const meta = TOOL_META[action.toolName] || DEFAULT_META;
                      const Icon = meta.icon as any;
                      return (
                        <motion.div
                          key={action.id}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 opacity-60"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 0.5 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          layout
                        >
                          <div className="shrink-0 text-muted-foreground">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs text-muted-foreground flex-1 truncate">
                            {meta.label}
                          </span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* No actions yet - show waiting state */}
                  {aiActions.length === 0 && (
                    <motion.div
                      className="flex items-center justify-center gap-2 py-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-primary"
                            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                            transition={{
                              duration: 1.2,
                              repeat: Infinity,
                              delay: i * 0.2,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </motion.div>
                  )}
                </div>

                {/* Progress summary */}
                {aiActions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{doneActions.length} action{doneActions.length !== 1 ? 's' : ''} completed</span>
                      {runningActions.length > 0 && (
                        <span>{runningActions.length} running</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: '0%' }}
                        animate={{
                          width: aiActions.length > 0
                            ? `${(doneActions.length / aiActions.length) * 100}%`
                            : '0%',
                        }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hint text */}
            <p className="text-[10px] text-muted-foreground/60">
              AI is modifying your project. Changes will appear when complete.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
