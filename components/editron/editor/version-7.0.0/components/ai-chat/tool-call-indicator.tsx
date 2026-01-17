"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, CheckCircle2, Wand2, Palette, Music, Film, Zap, Scissors, Copy, Trash2, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallIndicatorProps {
  toolName: string;
  isComplete?: boolean;
  className?: string;
}

// Fun loading messages for generative/slow tools only
const GENERATIVE_MESSAGES: Record<string, string[]> = {
  generate_html_scene: [
    "Crafting your scene",
    "Painting with code",
    "Weaving magic",
    "Almost ready",
  ],
  generate_html_sticker: [
    "Creating sticker",
    "Adding sparkle",
    "Making it pop",
    "Finishing up",
  ],
  generate_image: [
    "Imagining visuals",
    "Rendering art",
    "Creating magic",
  ],
};

// Classify tools: 'quick' (instant), 'generative' (slow, needs fun messages)
const TOOL_TYPE: Record<string, "quick" | "generative"> = {
  // Quick tools - minimal UI
  add_overlay: "quick",
  update_overlay: "quick",
  delete_overlay: "quick",
  batch_update_overlays: "quick",
  trim_overlay: "quick",
  split_overlay: "quick",
  sync_style: "quick",
  read_project_file: "quick",
  get_timeline_view: "quick",
  visual_inspect_frame: "quick",
  
  // Generative tools - show fun messages
  generate_html_scene: "generative",
  generate_html_sticker: "generative",
  generate_image: "generative",
};

// Icons for different tools
const TOOL_ICONS: Record<string, React.ReactNode> = {
  generate_html_scene: <Palette className="h-3.5 w-3.5" />,
  generate_html_sticker: <Sparkles className="h-3.5 w-3.5" />,
  add_overlay: <Wand2 className="h-3.5 w-3.5" />,
  update_overlay: <Zap className="h-3.5 w-3.5" />,
  delete_overlay: <Trash2 className="h-3.5 w-3.5" />,
  generate_image: <Sparkles className="h-3.5 w-3.5" />,
  add_video_overlay: <Film className="h-3.5 w-3.5" />,
  add_sound_overlay: <Music className="h-3.5 w-3.5" />,
  trim_overlay: <Scissors className="h-3.5 w-3.5" />,
  split_overlay: <Scissors className="h-3.5 w-3.5" />,
  sync_style: <Copy className="h-3.5 w-3.5" />,
  visual_inspect_frame: <Eye className="h-3.5 w-3.5" />,
  read_project_file: <FileText className="h-3.5 w-3.5" />,
  get_timeline_view: <FileText className="h-3.5 w-3.5" />,
};

// Short friendly names
const TOOL_NAMES: Record<string, string> = {
  generate_html_scene: "Scene",
  generate_html_sticker: "Sticker",
  add_overlay: "Add",
  update_overlay: "Update",
  delete_overlay: "Remove",
  batch_update_overlays: "Batch",
  generate_image: "Image",
  trim_overlay: "Trim",
  split_overlay: "Split",
  sync_style: "Sync",
  get_timeline_view: "Timeline",
  read_project_file: "Read",
  visual_inspect_frame: "Inspect",
};

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
  toolName,
  isComplete = false,
  className,
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  
  const toolType = TOOL_TYPE[toolName] || "quick";
  const isGenerative = toolType === "generative";
  const messages = GENERATIVE_MESSAGES[toolName] || ["Working"];
  const icon = TOOL_ICONS[toolName] || <Zap className="h-3.5 w-3.5" />;
  const friendlyName = TOOL_NAMES[toolName] || toolName.replace(/_/g, " ");

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
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs transition-colors",
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
        {isComplete && <span className="opacity-60">✓</span>}
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
        {/* Icon */}
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

        {/* Content */}
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
              className="text-xs text-muted-foreground animate-pulse" 
              key={messageIndex}
            >
              {messages[messageIndex]}...
            </p>
          )}
          
          {isComplete && (
            <p className="text-xs text-emerald-500/70">Done</p>
          )}
        </div>
      </div>
    </div>
  );
};
