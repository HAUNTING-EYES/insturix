"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ProgressBar({ className }: { className?: string }) {
  return (
    <div className={cn("h-1 w-full bg-black/20 overflow-hidden rounded-full", className)}>
      <div
        className="h-full bg-zinc-400/50 rounded-full animate-progress"
        style={{ width: '100%' }}
      />
    </div>
  );
}
