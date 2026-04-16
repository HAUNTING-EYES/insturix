"use client";

import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="flex gap-2.5 py-1">
      {/* Avatar */}
      <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.75} />
      </div>

      {/* Bubble */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400/60 animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400/60 animate-bounce"
            style={{ animationDelay: "180ms", animationDuration: "900ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-400/60 animate-bounce"
            style={{ animationDelay: "360ms", animationDuration: "900ms" }}
          />
        </div>
      </div>
    </div>
  );
}