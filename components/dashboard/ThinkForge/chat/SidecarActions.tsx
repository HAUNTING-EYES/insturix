"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Hammer, Camera, Mic, UserPlus, Loader2, Compass
} from "lucide-react";

export type SidecarActionType = 'deconstruct' | 'storyboard' | 'refine_voice' | 'summon_specialist' | 'discover_blueprint';

interface SidecarActionsProps {
  onAction: (action: SidecarActionType, extra?: Record<string, any>) => void;
  disabled?: boolean;
  hasSelection?: boolean;
  hasScript?: boolean;
  hasContent?: boolean;
  loading?: SidecarActionType | null;
}

const ACTIONS: Array<{
  id: SidecarActionType;
  label: string;
  icon: React.ComponentType<any>;
  tooltip: string;
  requiresSelection?: boolean;
  requiresScript?: boolean;
  requiresContent?: boolean;
}> = [
  {
    id: 'deconstruct',
    label: 'Deconstruct',
    icon: Hammer,
    tooltip: 'Shatter content into Atomic Facts & Viral Hooks',
    requiresContent: true,
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    icon: Camera,
    tooltip: 'Generate shot list from selected text',
    requiresSelection: true,
  },
  {
    id: 'refine_voice',
    label: 'Refine Voice',
    icon: Mic,
    tooltip: 'Check your draft against Brand DNA',
    requiresScript: true,
  },
  {
    id: 'summon_specialist',
    label: 'Summon Specialist',
    icon: UserPlus,
    tooltip: 'Spawn a one-shot expert agent',
  },
  {
    id: 'discover_blueprint',
    label: 'Blueprint',
    icon: Compass,
    tooltip: 'Detect project scope and propose document set',
  },
];

export function SidecarActions({
  onAction,
  disabled = false,
  hasSelection = false,
  hasScript = false,
  hasContent = false,
  loading = null,
}: SidecarActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-white/[0.04]">
      {ACTIONS.map((action) => {
        const isDisabled = disabled
          || (action.requiresSelection && !hasSelection)
          || (action.requiresScript && !hasScript)
          || (action.requiresContent && !hasContent && !hasScript);
        const isLoading = loading === action.id;
        const Icon = action.icon;

        return (
          <button
            key={action.id}
            onClick={() => !isDisabled && !isLoading && onAction(action.id)}
            disabled={isDisabled || isLoading}
            title={action.tooltip}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all",
              isDisabled
                ? "text-zinc-700 cursor-not-allowed"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.06] ring-1 ring-white/[0.04] hover:ring-white/[0.08]",
              isLoading && "animate-pulse"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
