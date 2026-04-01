"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, RefreshCw, Send, CornerDownLeft, Settings, Link2, ExternalLink, Lightbulb } from "lucide-react";
import clsx from "clsx";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";

/**
 * Extract all HTTP(S) URLs from text.
 * Handles query params, fragments, ports, and encoded characters.
 * Rejects localhost, file://, ftp://, and other non-http protocols.
 */
const URL_EXTRACT_REGEX = /https?:\/\/(?!localhost\b)[^\s<>"')\]]+/gi;

/** Check if a string is a standalone URL (nothing else meaningful) */
export function isStandaloneUrl(text: string): boolean {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Extract all valid URLs from text */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_EXTRACT_REGEX) || [];
  // Validate each match and deduplicate
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of matches) {
    // Clean trailing punctuation that got captured
    let clean = match.replace(/[.,;:!?)]+$/, '');
    try {
      const url = new URL(clean);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } catch {
      // Invalid URL, skip
    }
  }
  return urls;
}

/** Check if text contains any URLs */
export function hasUrls(text: string): boolean {
  return extractUrls(text).length > 0;
}

export interface UrlBriefResult {
  title: string;
  summary: string;
  keyTopics?: string[];
  targetAudience?: string;
  suggestedAngles?: string[];
  platform?: string;
  contentType?: string;
}

interface PromptPanelProps {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onRegenerate: () => void;
  onManualSetup?: () => void;
  /** Called when URLs are found in prompt on submit — analyzes all URLs, rebuilds prompt, then generates ideas */
  onUrlSubmit?: (urls: string[], originalPrompt: string) => void;
  /** Whether URL brief extraction is in progress */
  briefLoading?: boolean;
  /** Brief results after extraction (one per URL) */
  briefResults?: UrlBriefResult[] | null;
}

export const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  onSubmit,
  onRegenerate,
  onManualSetup,
  onUrlSubmit,
  briefLoading = false,
  briefResults = null,
}) => {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [detectedUrls, setDetectedUrls] = React.useState<string[]>([]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && !briefLoading) {
        formRef.current?.requestSubmit();
      }
    }
  };

  /** On change, detect URLs for visual indicator only */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    setDetectedUrls(extractUrls(value));
  };

  /** On submit: if URLs found, analyze them first. Otherwise normal submit. */
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = extractUrls(prompt);
    if (urls.length > 0 && onUrlSubmit) {
      // URLs detected — analyze them first, then generate ideas
      onUrlSubmit(urls, prompt);
    } else {
      // No URLs — normal idea generation
      onSubmit(e);
    }
  };

  // Clear detected URLs when brief results come in
  React.useEffect(() => {
    if (briefResults && briefResults.length > 0) {
      setDetectedUrls([]);
    }
  }, [briefResults]);

  const isProcessing = loading || briefLoading;
  const urlCount = detectedUrls.length;

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
        <Header hasSubmitted={hasSubmitted} briefLoading={briefLoading} briefResults={briefResults} />
        <form ref={formRef} onSubmit={handleFormSubmit} className="group relative">
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <textarea
                required
                value={prompt}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe your content idea, paste a URL, or just type your niche (e.g. Fitness)..."
                rows={hasSubmitted ? 2 : 4}
                className={clsx(
                  "w-full resize-none rounded-2xl border bg-white/5 px-4 py-4 text-sm/relaxed text-white placeholder:text-white/30 shadow-inner",
                  "focus:outline-none focus:ring-2 focus:border-red-300/40",
                  hasSubmitted && "transition-[height] duration-300",
                  briefLoading
                    ? "border-blue-500/40 focus:ring-blue-500/30"
                    : urlCount > 0
                      ? "border-emerald-500/40 focus:ring-emerald-500/30"
                      : "border-white/10 focus:ring-red-900/30"
                )}
              />

              {/* URL detection indicator */}
              <AnimatePresence>
                {(briefLoading || urlCount > 0) && !hasSubmitted && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={clsx(
                      "absolute top-2 right-3 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium",
                      briefLoading
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    )}
                  >
                    {briefLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Analyzing {urlCount > 1 ? `${urlCount} URLs` : 'URL'}...</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3 w-3" />
                        <span>{urlCount} URL{urlCount > 1 ? 's' : ''} detected</span>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Keyboard hint */}
              {!briefLoading && urlCount === 0 && (
                <div className="pointer-events-none absolute bottom-2 right-3 hidden text-[10px] font-medium text-white/40 sm:flex items-center gap-1">
                  <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5">Enter</span>
                  <CornerDownLeft className="h-3 w-3" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            </div>
            <button
              type="submit"
              disabled={isProcessing}
              aria-label={hasSubmitted ? "Regenerate ideas" : urlCount > 0 ? "Analyze URLs & generate ideas" : "Generate ideas"}
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
                {isProcessing ? (
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

        {/* Brief results preview */}
        <AnimatePresence>
          {briefResults && briefResults.length > 0 && !hasSubmitted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden -mt-2 space-y-2"
            >
              {briefResults.map((brief, i) => (
                <div key={i} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 backdrop-blur-sm">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-medium text-emerald-300 truncate">{brief.title}</p>
                      <p className="text-[11px] text-white/60 line-clamp-2">{brief.summary}</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Brainstorm / Enhance Niche Button */}
        {!hasSubmitted && (
          <motion.button
            type="button"
            disabled={briefLoading || loading}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={async () => {
              const niche = prompt.trim();
              if (!niche) {
                // Focus the textarea and show a hint
                formRef.current?.querySelector('textarea')?.focus();
                return;
              }

              // New Functionality: "Enhance Idea" (Magic Wand)
              // Streams a rich, detailed prompt back into the textarea
              try {
                const res = await fetch('/api/services/thinkforge/enhance', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: niche }),
                });

                if (!res.ok) throw new Error('Failed to enhance prompt');

                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                if (!reader) return;

                setPrompt(''); // Clear before streaming new content
                let enhancedPrompt = '';

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  // Decode the raw text chunk
                  const chunkStr = decoder.decode(value, { stream: true });
                  enhancedPrompt += chunkStr;
                  setPrompt(enhancedPrompt);
                }
              } catch (error) {
                console.error('Enhance error:', error);
                setPrompt(niche); // Restore if failed
              }
            }}
            className={clsx(
              "w-full flex items-center justify-center gap-2 py-3 px-4 -mt-1",
              "rounded-2xl border border-dashed",
              "text-sm font-medium transition-all duration-200",
              prompt.trim()
                ? "border-amber-500/30 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-200"
                : "border-white/10 bg-white/[0.02] text-white/30 hover:bg-white/[0.04]"
            )}
          >
            <Lightbulb className={clsx("h-4 w-4", prompt.trim() && "text-amber-400")} />
            {prompt.trim()
              ? `Enhance with AI: "${prompt.trim().slice(0, 30)}${prompt.trim().length > 30 ? '…' : ''}"`
              : "Type a short idea above, then click here to enhance it with AI"
            }
          </motion.button>
        )}

        {/* Manual Setup Link */}
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

const Header = ({ hasSubmitted, briefLoading, briefResults }: { hasSubmitted: boolean; briefLoading?: boolean; briefResults?: UrlBriefResult[] | null }) => (
  <div className="space-y-2">
    <motion.h1
      className="bg-gradient-to-br from-white via-white to-red-900 bg-clip-text text-center font-semibold text-2xl tracking-tight text-transparent sm:text-3xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      {briefLoading ? "Analyzing URLs..." : hasSubmitted ? "Refine Your Vision" : "ThinkForge"}
    </motion.h1>
    <motion.p
      className="mx-auto max-w-md text-center text-xs font-medium text-white/50 sm:text-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {briefLoading
        ? "Extracting content briefs from URLs..."
        : briefResults && briefResults.length > 0
          ? "Briefs extracted — generating ideas from this content"
          : hasSubmitted
            ? "Adjust the prompt or regenerate"
            : "Describe your idea, or type your niche to brainstorm"}
    </motion.p>
  </div>
);
