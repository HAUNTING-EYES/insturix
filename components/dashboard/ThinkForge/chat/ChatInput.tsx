"use client";
import React, { useRef, useEffect } from "react";
import { Send, Square, Sparkles, TrendingUp, X } from "lucide-react";
import { ChatSuggestions } from "./ChatSuggestions";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  suggestions?: string[];
  placeholder?: string;
  editingSelection?: { text: string; range: { from: number; to: number }; blocks: any[] } | null;
  onCancelEditSelection?: () => void;
  onOpenTrendWorkflow?: () => void;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  suggestions = [],
  placeholder = "Ask the AI to write, edit, or improve your script...",
  editingSelection,
  onCancelEditSelection,
  onOpenTrendWorkflow,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingSelection && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingSelection]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(value ? `${value} ${suggestion}` : suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-0 shrink-0 bg-[#0B0B0A]/80 border-t border-[#1C1B19] pb-4">
      {/* Selection Context Bar - Above Dynamic Island */}
      <AnimatePresence>
        {editingSelection && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-start justify-between gap-3 px-4 py-2 border-b border-[#1C1B19] bg-[#0F0F0E]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#D4A652]/80 font-semibold">
                <Sparkles className="h-3 w-3" />
                Editing selection
              </div>
              <div className="mt-1 rounded-lg border border-[#282724] bg-[#D4A652]/5 px-3 py-2 text-[11px] text-[#D4A652]/90 italic line-clamp-3">
                &ldquo;{editingSelection.text}&rdquo;
              </div>
            </div>
            <button
              onClick={onCancelEditSelection}
              className="text-[#7A776E] hover:text-[#ECE9E1] transition-colors p-1.5 rounded-full hover:bg-[#1C1B19] mt-1"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pt-3 pb-2 overflow-x-auto no-scrollbar mask-linear-fade">
        {suggestions.length > 0 && (
          <ChatSuggestions suggestions={suggestions} onSelect={handleSuggestionClick} />
        )}
      </div>

      <div className="px-4 relative group">
        <div className={clsx(
          "relative flex flex-col rounded-[10px] bg-[#0F0F0E] border border-[#282724] transition-colors duration-200",
          "group-focus-within:border-[#D4A652]/50"
        )}>
          {onOpenTrendWorkflow && (
            <div className="border-b border-[#282724] px-2 pt-2">
              <button type="button" onClick={onOpenTrendWorkflow} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-[#D4A652] hover:bg-[#D4A652]/10 disabled:opacity-50" aria-label="Open trend workflow">
                <TrendingUp className="h-3.5 w-3.5" />
                Use a trend
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 p-2">
            <div className="flex-1 min-w-0 relative">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={editingSelection ? "Tell me how to change this selection..." : placeholder}
                className={clsx(
                  "w-full max-h-40 min-h-11 py-3 pl-4 pr-2 bg-transparent text-sm text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:outline-none resize-none",
                  disabled && "opacity-80"
                )}
                aria-disabled={disabled}
                rows={1}
              />
            </div>

            <AnimatePresence mode="wait">
              {isStreaming && onStop && !value.trim() ? (
                <motion.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={onStop}
                  disabled={disabled}
                  aria-label="Stop generation"
                  title="Stop generation"
                  className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-[#D4A652]/10 text-[#D4A652] hover:bg-[#D4A652]/20 transition-colors mb-0.5"
                >
                  <Square className="h-4 w-4 fill-current" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={onSend}
                  disabled={disabled || !value.trim()}
                  className={clsx(
                    "h-9 w-9 shrink-0 flex items-center justify-center rounded-[7px] transition-all duration-200 mb-0.5",
                    (!disabled && value.trim())
                      ? "bg-[#D4A652] text-[#0B0B0A] hover:bg-[#e0b765] active:scale-95"
                      : "bg-[#131312] text-[#5F5E5A] cursor-not-allowed"
                  )}
                >
                  <Send className={clsx("h-4 w-4", (!disabled && value.trim()) && "ml-0.5")} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="px-6 mt-2 flex flex-col items-center gap-1">
        <div className="opacity-60 scale-90 origin-center">
          <CreditCostBadge service="thinkforge" action="chat_message" />
        </div>
        <p className="text-[10px] text-[#454340] text-center font-medium">
          Storyboarding Assistant • AI can make mistakes
        </p>
      </div>
    </div>
  );
}
