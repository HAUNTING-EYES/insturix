"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Loader2, CheckCircle2, Wand2, Palette, Music, Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallIndicatorProps {
  toolName: string;
  isComplete?: boolean;
  className?: string;
}

// Magical loading messages for different tools
const TOOL_MESSAGES: Record<string, string[]> = {
  generate_html_scene: [
    "Crafting your visual magic...",
    "Painting with pixels...",
    "Weaving colors and shapes...",
    "Bringing your vision to life...",
    "Adding the finishing touches...",
  ],
  add_overlay: [
    "Placing your element...",
    "Positioning perfectly...",
    "Adding to timeline...",
  ],
  generate_image: [
    "Imagining possibilities...",
    "Creating your visual...",
    "Rendering artwork...",
  ],
  default: [
    "Working on it...",
    "Processing...",
    "Almost there...",
  ],
};

// Icons for different tools
const TOOL_ICONS: Record<string, React.ReactNode> = {
  generate_html_scene: <Palette className="h-5 w-5" />,
  add_overlay: <Wand2 className="h-5 w-5" />,
  generate_image: <Sparkles className="h-5 w-5" />,
  add_video_overlay: <Film className="h-5 w-5" />,
  add_sound_overlay: <Music className="h-5 w-5" />,
};

// Friendly names for tools
const TOOL_NAMES: Record<string, string> = {
  generate_html_scene: "Creating Custom Scene",
  add_overlay: "Adding Element",
  update_overlay: "Updating Element",
  delete_overlay: "Removing Element",
  batch_update_overlays: "Batch Update",
  generate_image: "Generating Image",
  trim_overlay: "Trimming Clip",
  split_overlay: "Splitting Clip",
  sync_style: "Syncing Styles",
  get_timeline_view: "Analyzing Timeline",
};

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
  toolName,
  isComplete = false,
  className,
}) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  const messages = TOOL_MESSAGES[toolName] || TOOL_MESSAGES.default;
  const icon = TOOL_ICONS[toolName] || <Sparkles className="h-5 w-5" />;
  const friendlyName = TOOL_NAMES[toolName] || toolName.replace(/_/g, " ");

  // Cycle through messages for long-running tools
  useEffect(() => {
    if (isComplete) return;
    
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [messages.length, isComplete]);

  // Animate dots
  useEffect(() => {
    if (isComplete) return;
    
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [isComplete]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border transition-all duration-500",
        isComplete
          ? "bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border-emerald-500/30"
          : "bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 border-violet-500/30",
        className
      )}
    >
      {/* Animated background shimmer */}
      {!isComplete && (
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      )}

      <div className="relative p-4">
        <div className="flex items-center gap-3">
          {/* Icon with animation */}
          <div
            className={cn(
              "p-2.5 rounded-lg transition-all duration-300",
              isComplete
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-violet-500/20 text-violet-400"
            )}
          >
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 animate-in zoom-in-50 duration-300" />
            ) : (
              <div className="animate-pulse">{icon}</div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-semibold text-sm",
                  isComplete ? "text-emerald-400" : "text-violet-300"
                )}
              >
                {friendlyName}
              </span>
              {!isComplete && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400/70" />
              )}
            </div>

            <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">
              {isComplete ? (
                <span className="text-emerald-400/70">✓ Complete</span>
              ) : (
                <span className="animate-in fade-in duration-300" key={messageIndex}>
                  {messages[messageIndex]}{dots}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Progress bar for incomplete */}
        {!isComplete && (
          <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 animate-[progress_2s_ease-in-out_infinite] w-1/2 rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
};

// Add keyframes to tailwind config or use inline styles
const styles = `
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
@keyframes progress {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-100%);
  }
}
`;

// Inject styles
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
