"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Compass, Loader2 } from "lucide-react";

export type SidecarActionType = 'deconstruct' | 'storyboard' | 'refine_voice' | 'summon_specialist' | 'discover_blueprint';

interface SidecarActionsProps {
  onAction: (action: SidecarActionType, extra?: Record<string, any>) => void;
  disabled?: boolean;
  hasSelection?: boolean;
  hasScript?: boolean;
  hasContent?: boolean;
  loading?: SidecarActionType | null;
}

export function SidecarActions({
  onAction,
  disabled = false,
  loading = null,
}: SidecarActionsProps) {
  const isLoading = loading === 'discover_blueprint';

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.04]">
      <button
        onClick={() => !disabled && !isLoading && onAction('discover_blueprint')}
        disabled={disabled || isLoading}
        title="Auto-generate a full set of project documents (scripts, briefs, shot lists)"
        className={cn(
          "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all",
          disabled
            ? "text-[#454340] cursor-not-allowed"
            : "text-[#B5B2A8] hover:text-[#ECE9E1] hover:bg-white/[0.08] ring-1 ring-white/[0.06] hover:ring-white/[0.12]",
          isLoading && "animate-pulse"
        )}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Compass className="h-3.5 w-3.5" />
        )}
        <span>Generate Documents</span>
      </button>
    </div>
  );
}
