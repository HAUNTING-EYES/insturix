import React, { useRef, useEffect, useState, useCallback } from "react";
import { Overlay, OverlayType } from "../../types";
import { useSidebar } from "../../contexts/sidebar-context";
import {
  Trash2,
  Copy,
  Scissors,
  Type,
  Palette,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Maximize2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Terminal,
  Check,
  X,
  AlertCircle,
  Send,
} from "lucide-react";
import {
  parseAndExecuteCommand,
  type CommandResult,
} from "../../utils/shorthand-commands";

/**
 * ContextualActionBar Component
 *
 * A floating toolbar that appears above a selected timeline clip,
 * providing quick-access actions relevant to the overlay type.
 * Actions are type-aware: video clips, text, audio, and images
 * each get a tailored set of buttons.
 *
 * Includes an inline shorthand command input at the right end
 * for fast keyboard-driven editing (e.g. "louder", "speed 2x",
 * "trim start 2s"). Unrecognised commands are forwarded to AI chat.
 */

interface ActionItem {
  /** Unique key for the action */
  id: string;
  /** Icon component from lucide-react */
  icon: React.ElementType;
  /** Tooltip label shown on hover */
  label: string;
  /** Handler executed on click */
  onClick: () => void;
}

interface ContextualActionBarProps {
  /** The currently selected overlay item */
  item: Overlay;
  /** Total duration of the timeline in frames (used for positioning) */
  totalDuration: number;
  /** Callback to delete the item */
  onDelete: (id: number) => void;
  /** Callback to duplicate the item */
  onDuplicate: (id: number) => void;
  /** Callback to split the item at the playhead */
  onSplit: (id: number) => void;
  /** Callback to update the overlay (for mute/volume changes) */
  onOverlayChange?: (overlay: Overlay) => void;
  /** Project FPS for command time parsing (default 30) */
  fps?: number;
}

// ---------------------------------------------------------------------------
// Toast sub-component
// ---------------------------------------------------------------------------

interface ToastMessage {
  text: string;
  type: "success" | "error" | "info";
}

const ToastBubble: React.FC<{ toast: ToastMessage; onDone: () => void }> = ({
  toast,
  onDone,
}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 2200);
    return () => clearTimeout(timer);
  }, [onDone]);

  const iconMap = {
    success: Check,
    error: AlertCircle,
    info: Send,
  };
  const colorMap = {
    success: "text-emerald-400",
    error: "text-red-400",
    info: "text-sky-400",
  };

  const Icon = iconMap[toast.type];

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5
        px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap
        text-[11px] font-medium text-zinc-200 animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        bottom: "calc(100% + 6px)",
        backgroundColor: "#111122",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        zIndex: 70,
      }}
    >
      {React.createElement(Icon, {
        className: `w-3 h-3 ${colorMap[toast.type]}`,
      })}
      {toast.text}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ContextualActionBar: React.FC<ContextualActionBarProps> = ({
  item,
  totalDuration,
  onDelete,
  onDuplicate,
  onSplit,
  onOverlayChange,
  fps = 30,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [nudgeX, setNudgeX] = useState(0);
  const [cmdInputVisible, setCmdInputVisible] = useState(false);
  const [cmdValue, setCmdValue] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const { setActivePanel, setIsOpen } = useSidebar();

  // Reposition the bar if it overflows the viewport horizontally
  useEffect(() => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    let offset = 0;
    if (rect.right > window.innerWidth - 8) {
      offset = window.innerWidth - 8 - rect.right;
    }
    if (rect.left < 8) {
      offset = 8 - rect.left;
    }
    setNudgeX(offset);
  }, [item.id, item.from, item.durationInFrames, totalDuration, cmdInputVisible]);

  // Auto-focus the input when it becomes visible
  useEffect(() => {
    if (cmdInputVisible) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [cmdInputVisible]);

  // Show a toast message
  const showToast = useCallback(
    (text: string, type: ToastMessage["type"] = "success") => {
      setToast({ text, type });
    },
    []
  );

  // Helper: open the sidebar panel for complex edits
  const openPanel = useCallback(
    (panelType: OverlayType) => {
      setActivePanel(
        panelType === OverlayType.HTML_STICKER
          ? OverlayType.HTML_SCENE
          : panelType
      );
      setIsOpen(true);
    },
    [setActivePanel, setIsOpen]
  );

  // Helper: toggle mute for video/sound overlays
  const toggleMute = useCallback(() => {
    if (!onOverlayChange) return;
    if (
      item.type === OverlayType.VIDEO ||
      item.type === OverlayType.SOUND
    ) {
      const currentVolume = (item.styles as any)?.volume ?? 1;
      const updated = {
        ...item,
        styles: {
          ...item.styles,
          volume: currentVolume === 0 ? 1 : 0,
        },
      } as Overlay;
      onOverlayChange(updated);
    }
  }, [item, onOverlayChange]);

  // Helper: adjust volume for sound overlays
  const adjustVolume = useCallback(
    (delta: number) => {
      if (!onOverlayChange) return;
      if (item.type === OverlayType.SOUND) {
        const currentVolume = (item.styles as any)?.volume ?? 1;
        const newVolume = Math.max(0, Math.min(2, currentVolume + delta));
        const updated = {
          ...item,
          styles: {
            ...item.styles,
            volume: Math.round(newVolume * 100) / 100,
          },
        } as Overlay;
        onOverlayChange(updated);
      }
    },
    [item, onOverlayChange]
  );

  // -----------------------------------------------------------------------
  // Shorthand command execution
  // -----------------------------------------------------------------------

  const executeCommand = useCallback(() => {
    if (!cmdValue.trim()) return;

    const result: CommandResult = parseAndExecuteCommand(cmdValue, item, fps);

    // Handle external actions
    switch (result.action) {
      case "delete":
        onDelete(item.id);
        showToast(result.message, "success");
        break;
      case "duplicate":
        onDuplicate(item.id);
        showToast(result.message, "success");
        break;
      case "split":
        onSplit(item.id);
        showToast(result.message, "success");
        break;
      case "open-caption":
        openPanel(OverlayType.CAPTION);
        showToast(result.message, "success");
        break;
      case "ai-fallback":
        // Open AI chat sidebar with contextual prompt
        setActivePanel(OverlayType.AI_CHAT as OverlayType);
        setIsOpen(true);
        showToast(result.message, "info");
        break;
      default:
        // Overlay mutation — apply via onOverlayChange
        if (result.updatedOverlay && onOverlayChange) {
          onOverlayChange(result.updatedOverlay);
          showToast(result.message, "success");
        } else if (result.status === "error") {
          showToast(result.message, "error");
        } else if (result.updatedOverlay && !onOverlayChange) {
          showToast("Cannot update overlay (handler missing)", "error");
        }
        break;
    }

    // Clear input after execution
    setCmdValue("");
    setCmdInputVisible(false);
  }, [
    cmdValue,
    item,
    fps,
    onDelete,
    onDuplicate,
    onSplit,
    onOverlayChange,
    openPanel,
    setActivePanel,
    setIsOpen,
    showToast,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        executeCommand();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setCmdValue("");
        setCmdInputVisible(false);
      }
    },
    [executeCommand]
  );

  // Build action list based on overlay type
  const actions: ActionItem[] = [];

  const isMuted =
    (item.type === OverlayType.VIDEO || item.type === OverlayType.SOUND) &&
    (item.styles as any)?.volume === 0;

  switch (item.type) {
    case OverlayType.VIDEO:
      actions.push(
        {
          id: "split",
          icon: Scissors,
          label: "Split at playhead",
          onClick: () => onSplit(item.id),
        },
        {
          id: "trim",
          icon: Maximize2,
          label: "Trim clip",
          onClick: () => openPanel(OverlayType.VIDEO),
        },
        {
          id: "mute",
          icon: isMuted ? VolumeX : Volume2,
          label: isMuted ? "Unmute" : "Mute",
          onClick: toggleMute,
        },
        {
          id: "caption",
          icon: MessageSquare,
          label: "Add caption",
          onClick: () => openPanel(OverlayType.CAPTION),
        },
        {
          id: "duplicate",
          icon: Copy,
          label: "Duplicate",
          onClick: () => onDuplicate(item.id),
        },
        {
          id: "regenerate",
          icon: RefreshCw,
          label: "Regenerate with AI",
          onClick: () => openPanel(OverlayType.AI_CHAT as OverlayType),
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: () => onDelete(item.id),
        }
      );
      break;

    case OverlayType.TEXT:
      actions.push(
        {
          id: "edit-text",
          icon: Type,
          label: "Edit text",
          onClick: () => openPanel(OverlayType.TEXT),
        },
        {
          id: "change-style",
          icon: Palette,
          label: "Change style",
          onClick: () => openPanel(OverlayType.TEXT),
        },
        {
          id: "duplicate",
          icon: Copy,
          label: "Duplicate",
          onClick: () => onDuplicate(item.id),
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: () => onDelete(item.id),
        }
      );
      break;

    case OverlayType.SOUND:
      actions.push(
        {
          id: "trim",
          icon: Scissors,
          label: "Trim audio",
          onClick: () => openPanel(OverlayType.SOUND),
        },
        {
          id: "vol-down",
          icon: Minus,
          label: "Volume down",
          onClick: () => adjustVolume(-0.1),
        },
        {
          id: "vol-up",
          icon: Plus,
          label: "Volume up",
          onClick: () => adjustVolume(0.1),
        },
        {
          id: "mute",
          icon: isMuted ? VolumeX : Volume2,
          label: isMuted ? "Unmute" : "Mute",
          onClick: toggleMute,
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: () => onDelete(item.id),
        }
      );
      break;

    case OverlayType.IMAGE:
      actions.push(
        {
          id: "resize",
          icon: Maximize2,
          label: "Resize",
          onClick: () => openPanel(OverlayType.IMAGE),
        },
        {
          id: "duplicate",
          icon: Copy,
          label: "Duplicate",
          onClick: () => onDuplicate(item.id),
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: () => onDelete(item.id),
        }
      );
      break;

    // Caption, Sticker, HTML Scene, HTML Sticker, and any other types
    default:
      actions.push(
        {
          id: "edit",
          icon: Sparkles,
          label: "Edit",
          onClick: () => openPanel(item.type),
        },
        {
          id: "duplicate",
          icon: Copy,
          label: "Duplicate",
          onClick: () => onDuplicate(item.id),
        },
        {
          id: "delete",
          icon: Trash2,
          label: "Delete",
          onClick: () => onDelete(item.id),
        }
      );
      break;
  }

  // Position: centered above the item
  const leftPercent = ((item.from + item.durationInFrames / 2) / totalDuration) * 100;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        top: "-4px",
        transform: `translateX(calc(-50% + ${nudgeX}px)) translateY(-100%)`,
        zIndex: 60,
      }}
    >
      {/* Toast notification bubble */}
      {toast && (
        <ToastBubble toast={toast} onDone={() => setToast(null)} />
      )}

      <div
        ref={barRef}
        className="pointer-events-auto flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-lg"
        style={{
          backgroundColor: "#1a1a2e",
          boxShadow:
            "0 4px 16px rgba(0, 0, 0, 0.35), 0 1px 4px rgba(0, 0, 0, 0.2)",
        }}
        // Prevent clicks from bubbling to the timeline (which would deselect)
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className="relative group flex items-center justify-center w-7 h-7 rounded-md
              text-zinc-400 hover:text-white hover:bg-white/10
              transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label={action.label}
          >
            {React.createElement(action.icon, {
              className: "w-3.5 h-3.5",
            })}
            {/* Tooltip */}
            <span
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                px-2 py-0.5 text-[10px] font-medium leading-tight text-white whitespace-nowrap
                bg-zinc-900 rounded shadow-md
                opacity-0 group-hover:opacity-100 pointer-events-none
                transition-opacity duration-150"
            >
              {action.label}
            </span>
          </button>
        ))}

        {/* Separator before command input */}
        <div className="w-px h-5 bg-white/10 mx-0.5" />

        {/* Command input toggle / inline input */}
        {cmdInputVisible ? (
          <div className="flex items-center gap-0.5">
            <input
              ref={inputRef}
              type="text"
              value={cmdValue}
              onChange={(e) => setCmdValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type command..."
              className="w-[200px] h-6 px-2 text-[11px] text-zinc-200 placeholder-zinc-500
                bg-white/5 border border-white/10 rounded-md
                focus:outline-none focus:border-white/25 focus:bg-white/8
                transition-colors duration-150"
              style={{ caretColor: "#a78bfa" }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {/* Execute button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                executeCommand();
              }}
              className="flex items-center justify-center w-6 h-6 rounded-md
                text-zinc-400 hover:text-emerald-400 hover:bg-white/10
                transition-colors duration-150 focus:outline-none"
              aria-label="Execute command"
            >
              {React.createElement(Check, { className: "w-3 h-3" })}
            </button>
            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCmdValue("");
                setCmdInputVisible(false);
              }}
              className="flex items-center justify-center w-6 h-6 rounded-md
                text-zinc-400 hover:text-red-400 hover:bg-white/10
                transition-colors duration-150 focus:outline-none"
              aria-label="Close command input"
            >
              {React.createElement(X, { className: "w-3 h-3" })}
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCmdInputVisible(true);
            }}
            className="relative group flex items-center justify-center w-7 h-7 rounded-md
              text-zinc-400 hover:text-violet-400 hover:bg-white/10
              transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label="Open command input"
          >
            {React.createElement(Terminal, { className: "w-3.5 h-3.5" })}
            {/* Tooltip */}
            <span
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                px-2 py-0.5 text-[10px] font-medium leading-tight text-white whitespace-nowrap
                bg-zinc-900 rounded shadow-md
                opacity-0 group-hover:opacity-100 pointer-events-none
                transition-opacity duration-150"
            >
              Command (/)
            </span>
          </button>
        )}

        {/* Small arrow pointing down toward the clip */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45"
          style={{ backgroundColor: "#1a1a2e" }}
        />
      </div>
    </div>
  );
};

export default ContextualActionBar;
