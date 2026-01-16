"use client";
import React, { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Square, Sparkles, X } from "lucide-react";
import { ChatSuggestions } from "./ChatSuggestions";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

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
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  suggestions = [],
  placeholder = "Describe changes, ask for ideas, or refine content...",
  editingSelection,
  onCancelEditSelection,
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
      if (!disabled && value.trim() && !isStreaming) {
        onSend();
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(value ? `${value} ${suggestion}` : suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-0 shrink-0 bg-neutral-900/50 backdrop-blur-sm border-t border-white/5 pb-4">
        {/* Selection Context Bar - Above Dynamic Island */}
        <AnimatePresence>
          {editingSelection && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-start justify-between gap-3 px-4 py-2 border-b border-white/5 bg-neutral-900/80 backdrop-blur-md"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-red-300/80 font-semibold">
                  <Sparkles className="h-3 w-3" />
                  Editing selection
                </div>
                <div className="mt-1 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100/90 italic line-clamp-3">
                  “{editingSelection.text}”
                </div>
              </div>
              <button 
                onClick={onCancelEditSelection}
                className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10 mt-1"
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
            "relative flex flex-col rounded-3xl bg-neutral-950 border border-white/10 shadow-xl shadow-black/20 transition-colors duration-200",
            "group-focus-within:border-white/20 group-focus-within:ring-1 group-focus-within:ring-white/5"
        )}>
            <div className="flex items-end gap-2 p-2">
                <div className="flex-1 min-w-0 relative">
                     <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={editingSelection ? "Tell me how to change this selection..." : placeholder}
                        className="w-full max-h-[160px] min-h-[44px] py-3 pl-4 pr-2 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none resize-none scrollbar-thin scrollbar-thumb-zinc-700/50 scrollbar-track-transparent"
                        disabled={disabled || isStreaming}
                        rows={1}
                    />
                </div>
              
                <AnimatePresence mode="wait">
                    {isStreaming && onStop ? (
                    <motion.button
                        key="stop"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        type="button"
                        onClick={onStop}
                        disabled={disabled}
                        className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors mb-0.5"
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
                            "h-10 w-10 shrink-0 flex items-center justify-center rounded-full transition-all duration-200 mb-0.5",
                            (!disabled && value.trim())
                                ? "bg-red-600 text-white shadow-lg shadow-red-900/30 hover:bg-red-500 hover:scale-105 active:scale-95" 
                                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        )}
                    >
                        <Send className={clsx("h-4 w-4", (!disabled && value.trim()) && "ml-0.5")} />
                    </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
      </div>
      
      <div className="px-6 mt-2 flex justify-center">
         <p className="text-[10px] text-zinc-600 text-center font-medium">
            Storyboarding Assistant • AI can make mistakes
         </p>
      </div>
    </div>
  );
}
