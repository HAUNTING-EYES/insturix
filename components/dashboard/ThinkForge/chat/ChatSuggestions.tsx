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
          className="shrink-0 rounded-full border border-[#282724] bg-[#0F0F0E] px-3 py-1.5 text-[11px] font-medium text-[#7A776E] hover:text-[#ECE9E1] hover:border-[#D4A652]/30 hover:bg-[#D4A652]/5 transition-all active:scale-95"
        >
          {s}
        </motion.button>
      ))}
    </div>
  );
}
