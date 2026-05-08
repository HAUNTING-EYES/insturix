"use client";

import { ChevronRight } from "lucide-react";

interface SuggestedPromptsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ prompts, onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex-none px-4 pb-3 flex flex-col gap-1.5">
      <p className="text-[10px] text-[#454340] uppercase tracking-widest mb-0.5 font-medium">
        Suggested
      </p>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="
            group flex items-center justify-between w-full
            px-3 py-2.5 rounded-lg text-left text-sm
            bg-[#0F0F0E]/60 hover:bg-[#131312]
            border border-[#1C1B19] hover:border-[#282724]
            text-[#7A776E] hover:text-[#ECE9E1]
            transition-all duration-150
          "
        >
          <span>{prompt}</span>
          <ChevronRight
            className="h-3.5 w-3.5 text-[#454340] group-hover:text-[#D4A652]/70 group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </button>
      ))}
    </div>
  );
}