"use client";
import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2, RefreshCw, Send, CornerDownLeft, Settings } from "lucide-react";
import clsx from "clsx";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";

interface PromptPanelProps {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onRegenerate: () => void;
  onManualSetup?: () => void;
}

export const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  onSubmit,
  onRegenerate,
  onManualSetup
}) => {
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Submit on Enter (Shift+Enter => newline)
      e.preventDefault();
      if (!loading) {
        formRef.current?.requestSubmit();
      }
    }
  };

  return (
    <motion.div
      className={clsx(
        "z-10 w-full max-w-2xl",
        "rounded-3xl border border-white/15 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl",
        "relative"
      )}
      initial={{ y: 0, scale: 1 }}
      animate={hasSubmitted ? { y: -40, scale: 0.92, boxShadow: "0 4px 24px -6px rgba(0,0,0,0.55)" } : { y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-transparent to-transparent" />
      <div className="relative flex flex-col gap-5">
        <Header hasSubmitted={hasSubmitted} />
        <form ref={formRef} onSubmit={onSubmit} className="group relative">
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <textarea
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the content vision, problem, or opportunity..."
                rows={hasSubmitted ? 2 : 4}
                className={clsx(
                  "w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm/relaxed text-white placeholder:text-white/30 shadow-inner",
                  "focus:outline-none focus:ring-2 focus:ring-red-900/30 focus:border-red-300/40",
                  "backdrop-blur-md",
                  hasSubmitted && "transition-[height] duration-300"
                )}
              />
              {/* Keyboard hint */}
              <div className="pointer-events-none absolute bottom-2 right-3 hidden text-[10px] font-medium text-white/40 sm:flex items-center gap-1">
                <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">Enter</span>
                <CornerDownLeft className="h-3 w-3" />
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            </div>
            <button
              type="submit"
              disabled={loading}
              aria-label={hasSubmitted ? "Regenerate ideas" : "Generate ideas"}
              className={clsx(
                "relative self-end h-[54px] w-[54px] rounded-2xl overflow-hidden",
                "bg-gradient-to-br from-red-600 via-red-500 to-rose-500",
                "text-white shadow-lg shadow-red-900/30",
                "transition-all duration-200",
                "hover:from-red-500 hover:via-rose-500 hover:to-rose-400 hover:shadow-red-800/40",
                "active:scale-95",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
              <div className="relative flex h-full w-full items-center justify-center">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : hasSubmitted ? (
                  <RefreshCw className="h-5 w-5" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </div>
            </button>
          </div>
        </form>
        
        {/* Manual Setup Link - Only show if not submitted */}
        {!hasSubmitted && onManualSetup && (
          <div className="flex justify-between items-center -mt-2">
            <CreditCostBadge service="thinkforge" action="chat_message" variant="tooltip" />
            <button 
              type="button"
              onClick={onManualSetup}
              className="group flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition-colors"
            >
              <span>Or configure manually</span>
              <Settings className="w-3 h-3 transition-transform group-hover:rotate-45" />
            </button>
          </div>
        )}
        {hasSubmitted && (
          <div className="flex justify-center -mt-2">
            <CreditCostBadge service="thinkforge" action="chat_message" variant="tooltip" />
          </div>
        )}

      </div>
    </motion.div>
  );
};

const Header = ({ hasSubmitted }: { hasSubmitted: boolean }) => (
  <div className="space-y-2">
    <motion.h1
      className="bg-gradient-to-br from-white via-white to-red-900 bg-clip-text text-center font-semibold text-2xl tracking-tight text-transparent sm:text-3xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      {hasSubmitted ? "Refine Your Vision" : "ThinkForge"}
    </motion.h1>
    <motion.p
      className="mx-auto max-w-md text-center text-xs font-medium text-white/50 sm:text-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {hasSubmitted
        ? "Adjust the prompt or regenerate"
        : "Your creative sandbox"}
    </motion.p>
  </div>
);
