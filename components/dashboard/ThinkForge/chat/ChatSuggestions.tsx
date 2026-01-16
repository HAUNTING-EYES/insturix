"use client";
import React from "react";
import { motion } from "framer-motion";

interface ChatSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export function ChatSuggestions({ suggestions, onSelect }: ChatSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex gap-2 w-max pb-1">
      {suggestions.map((s, i) => (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-400 backdrop-blur-md hover:text-zinc-100 hover:border-white/20 hover:bg-white/10 transition-all active:scale-95"
        >
          {s}
        </motion.button>
      ))}
    </div>
  );
}
