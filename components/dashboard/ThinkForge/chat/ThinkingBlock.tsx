"use client";
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
  thinking: string;
  defaultCollapsed?: boolean;
}

export function ThinkingBlock({ thinking, defaultCollapsed = true }: ThinkingBlockProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!thinking || !thinking.trim()) return null;

  const lines = thinking
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-1.5 text-[11px] text-[#5F5E5A] hover:text-[#7A776E] transition-colors select-none"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            collapsed && "-rotate-90"
          )}
        />
        <span className="italic font-medium tracking-wide">Thinking</span>
      </button>

      {!collapsed && (
        <div className="mt-1.5 ml-1 border-l-2 border-[#282724] pl-3 space-y-0.5">
          {lines.map((line, i) => (
            <p
              key={i}
              className="text-[11px] text-[#5F5E5A] italic leading-relaxed animate-in fade-in duration-300"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
