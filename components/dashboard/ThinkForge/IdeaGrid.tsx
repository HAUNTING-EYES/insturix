"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, ArrowRight } from "lucide-react";
import { getToneColorClass } from "@/lib/thinkforge/tone";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import ReactMarkdown from "react-markdown";

export interface IdeaCardData {
  id: string;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: string;
  sessionName?: string;
}

interface IdeaGridProps {
  ideas: IdeaCardData[];
  loading: boolean;
  hasSubmitted: boolean;
  prompt: string;
  onSelect: (idea: IdeaCardData) => void;
}

/** Inline markdown renderer that strips <p> wrappers to avoid layout issues in cards */
const InlineMarkdown = ({ children }: { children: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children: c }) => <>{c}</>,
      strong: ({ children: c }) => <strong className="font-semibold text-white/90">{c}</strong>,
      em: ({ children: c }) => <em>{c}</em>,
    }}
  >
    {children}
  </ReactMarkdown>
);

export const IdeaGrid: React.FC<IdeaGridProps> = ({ ideas, loading, hasSubmitted, prompt, onSelect }) => {
  const [expandedIdea, setExpandedIdea] = useState<IdeaCardData | null>(null);

  return (
    <>
      <AnimatePresence mode="wait">
        {hasSubmitted && (
          <motion.div
            key="ideas-grid"
            className="relative z-0 mt-12 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {loading && ideas.length === 0 && Array.from({ length: 4 }).map((_, i) => (
                <IdeaSkeleton key={`skeleton-${i}`} />
              ))}
              {!loading && (
                <AnimatePresence>
                  {ideas.map((idea, i) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      index={i}
                      onClick={() => setExpandedIdea(idea)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
            {loading && ideas.length > 0 && (
              <motion.div
                className="flex justify-center pt-4 text-xs text-white/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Refreshing ideas...
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idea Detail Modal */}
      <AnimatePresence>
        {expandedIdea && (
          <motion.div
            key="idea-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setExpandedIdea(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-neutral-950/95 p-6 shadow-2xl backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={() => setExpandedIdea(null)}
                className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-red-300/70 mb-3">
                <Lightbulb className="h-4 w-4" />
                Idea Details
                <div
                  className={`ml-auto h-3 w-3 rounded-full ${getToneColorClass(expandedIdea.tone)} shadow shadow-black/40`}
                  title={getToneDescription(expandedIdea.tone as any)}
                />
              </div>

              {/* Title */}
              <h2 className="text-lg font-semibold text-white mb-4 leading-snug">
                <InlineMarkdown>{expandedIdea.idea}</InlineMarkdown>
              </h2>

              {/* Full Details — no truncation */}
              <div className="space-y-3 text-sm text-white/70 max-h-[50vh] overflow-y-auto pr-1">
                <DetailRow label="Purpose" value={expandedIdea.purpose} />
                <DetailRow label="Style" value={expandedIdea.style} />
                <DetailRow label="Format" value={expandedIdea.format} />
                <DetailRow label="Platform" value={expandedIdea.platform} />
                <div className="border-t border-white/10 pt-3 text-xs text-white/50">
                  {getToneDescription(expandedIdea.tone as any)}
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => {
                  setExpandedIdea(null);
                  onSelect(expandedIdea);
                }}
                className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-900/30 hover:from-red-500 hover:to-rose-400 transition-all active:scale-[0.98]"
              >
                Start Generating Draft
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="font-semibold text-white/40 text-xs uppercase tracking-wide">{label}</span>
    <p className="text-white/70 mt-0.5">
      <InlineMarkdown>{value}</InlineMarkdown>
    </p>
  </div>
);

export const IdeaCard = ({ idea, index, onClick }: { idea: IdeaCardData; index: number; onClick?: () => void }) => {
  const toneDescription = getToneDescription(idea.tone as any);
  return (
    <motion.div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/[0.04] to-white/[0.02] p-4 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.5)] backdrop-blur-xl cursor-pointer"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 20,
        delay: index * 0.05
      }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
      <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide">
        <div className="flex items-center gap-2 text-red-300/70">
          <Lightbulb className="h-4 w-4" /> Idea {index + 1}
        </div>
        <div
          className={`h-3 w-3 rounded-full ${getToneColorClass(idea.tone)} shadow shadow-black/40`}
          title={toneDescription}
        />
      </div>
      <h3 className="mb-3 line-clamp-2 bg-gradient-to-br from-white via-white to-rose-100 bg-clip-text text-base font-semibold leading-tight text-transparent group-hover:from-rose-50 group-hover:to-white">
        <InlineMarkdown>{idea.idea}</InlineMarkdown>
      </h3>
      <div className="space-y-2 text-xs text-white/70">
        <div>
          <span className="font-semibold text-white/40">Purpose</span>
          <p className="text-white/70 line-clamp-2"><InlineMarkdown>{idea.purpose}</InlineMarkdown></p>
        </div>
        <div>
          <span className="font-semibold text-white/40">Style</span>
          <p className="text-white/70 line-clamp-1"><InlineMarkdown>{idea.style}</InlineMarkdown></p>
        </div>
        <div>
          <span className="font-semibold text-white/40">Format</span>
          <p className="text-white/70 line-clamp-1"><InlineMarkdown>{idea.format}</InlineMarkdown></p>
        </div>
        <div>
          <span className="font-semibold text-white/40">Platform</span>
          <p className="text-white/70 line-clamp-1"><InlineMarkdown>{idea.platform}</InlineMarkdown></p>
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-2 text-[11px] text-white/50 line-clamp-2">
        {toneDescription}
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-br from-red-400/10 via-transparent to-transparent" />
      </div>
    </motion.div>
  );
};

export const IdeaSkeleton = () => (
  <motion.div
    className="relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
    initial={{ opacity: 0, y: 24, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
  >
    <div className="mb-3 h-4 w-24 animate-pulse rounded bg-white/10" />
    <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-white/15" />
    <div className="mb-5 h-5 w-2/3 animate-pulse rounded bg-white/10" />
    <div className="space-y-2">
      <div className="h-3 w-full animate-pulse rounded bg-white/10" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-4/6 animate-pulse rounded bg-white/10" />
    </div>
    <div className="mt-auto flex gap-2 pt-4">
      <div className="h-5 w-14 animate-pulse rounded-full bg-white/10" />
      <div className="h-5 w-12 animate-pulse rounded-full bg-white/10" />
      <div className="h-5 w-16 animate-pulse rounded-full bg-white/10" />
    </div>
  </motion.div>
);
