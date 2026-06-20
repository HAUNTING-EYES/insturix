"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, CheckCircle2, Wand2, Palette, Music, Film, Zap, Scissors, Copy, Trash2, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getChatToolLoadingMessages,
  getChatToolMetadata,
  getChatToolShortLabel,
  type ChatToolIconCategory,
} from "@/lib/editron/agent/chat-tool-registry";

interface ToolCallIndicatorProps {
  toolName: string;
  isComplete?: boolean;
  className?: string;
}

const CATEGORY_ICONS: Record<ChatToolIconCategory, React.ReactNode> = {
  timeline: <FileText className="h-3.5 w-3.5" />,
  add: <Wand2 className="h-3.5 w-3.5" />,
  update: <Zap className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  trim: <Scissors className="h-3.5 w-3.5" />,
  style: <Copy className="h-3.5 w-3.5" />,
  caption: <FileText className="h-3.5 w-3.5" />,
  motion: <Palette className="h-3.5 w-3.5" />,
  transition: <Film className="h-3.5 w-3.5" />,
  audio: <Music className="h-3.5 w-3.5" />,
  visual: <Eye className="h-3.5 w-3.5" />,
  search: <FileText className="h-3.5 w-3.5" />,
  file: <FileText className="h-3.5 w-3.5" />,
  keyframe: <Zap className="h-3.5 w-3.5" />,
  stock: <Film className="h-3.5 w-3.5" />,
  script: <FileText className="h-3.5 w-3.5" />,
  sparkles: <Sparkles className="h-3.5 w-3.5" />,
};

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
  toolName,
  isComplete = false,
  className,
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const metadata = getChatToolMetadata(toolName);
  const isGenerative = metadata?.executionType === "generative";
  const messages = getChatToolLoadingMessages(toolName);
  const icon = metadata ? CATEGORY_ICONS[metadata.iconCategory] : <Zap className="h-3.5 w-3.5" />;
  const friendlyName = getChatToolShortLabel(toolName);

  // Cycle through messages for generative tools only
  useEffect(() => {
    if (isComplete || !isGenerative) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [messages.length, isComplete, isGenerative]);

  // Quick tools: ultra minimal pill
  if (!isGenerative) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] transition-colors",
          isComplete
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-muted text-muted-foreground",
          className
        )}
      >
        {isComplete ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          icon
        )}
        <span className="font-medium">{friendlyName}</span>
        {isComplete && <span className="opacity-60">done</span>}
      </span>
    );
  }

  // Generative tools: slightly more prominent with rotating message
  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-300",
        isComplete
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-muted/50 border-border",
        className
      )}
    >
      <div className="px-3 py-2 flex items-center gap-2.5">
        <div
          className={cn(
            "p-1.5 rounded-md transition-colors",
            isComplete
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-primary/10 text-primary"
          )}
        >
          {isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <div className="animate-pulse">{icon}</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span
            className={cn(
              "text-sm font-medium",
              isComplete ? "text-emerald-500" : "text-foreground"
            )}
          >
            {friendlyName}
          </span>

          {!isComplete && (
            <p
              className="text-[11px] text-muted-foreground animate-pulse"
              key={messageIndex}
            >
              {messages[messageIndex]}...
            </p>
          )}

          {isComplete && (
            <p className="text-[11px] text-emerald-500/70">Done</p>
          )}
        </div>
      </div>
    </div>
  );
};
