"use client";

import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-2.5 py-1">
      {/* Avatar */}
      <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-[#131312] border border-[#282724] mt-0.5">
        <Bot className="h-3.5 w-3.5 text-[#7A776E]" strokeWidth={1.75} />
      </div>

      {/* Bubble */}
      <div className="bg-[#0F0F0E] border border-[#1C1B19] rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#D4A652]/60 animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#D4A652]/60 animate-bounce"
            style={{ animationDelay: "180ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#D4A652]/60 animate-bounce"
            style={{ animationDelay: "360ms", animationDuration: "900ms" }}
          />
        </div>
      </div>
    </div>
  );
}