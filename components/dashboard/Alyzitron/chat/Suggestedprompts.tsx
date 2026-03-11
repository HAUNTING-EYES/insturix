"use client";

import { ChevronRight } from "lucide-react";

interface SuggestedPromptsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ prompts, onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex-none px-4 pb-3 flex flex-col gap-1.5">
      <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5 font-medium">
        Suggested
      </p>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="
            group flex items-center justify-between w-full
            px-3 py-2.5 rounded-lg text-left text-sm
            bg-zinc-900/60 hover:bg-zinc-800/80
            border border-zinc-800 hover:border-zinc-700
            text-zinc-400 hover:text-zinc-200
            transition-all duration-150
          "
        >
          <span>{prompt}</span>
          <ChevronRight
            className="h-3.5 w-3.5 text-zinc-700 group-hover:text-blue-500/70 group-hover:translate-x-0.5 transition-all flex-shrink-0"
          />
        </button>
      ))}
    </div>
  );
}