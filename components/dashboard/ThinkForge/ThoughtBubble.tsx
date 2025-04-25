"use client"

import { cn } from "@/lib/utils"

export function ThoughtBubble({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start px-4 py-6", className)}>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">AI</span>
        </div>
        <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 text-sm flex items-center">
          <div className="flex space-x-1">
            <div className="h-2 w-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="h-2 w-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="h-2 w-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
