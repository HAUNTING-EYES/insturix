"use client";

import { MessageSquare, X } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

interface ChatToggleButtonProps {
  open: boolean;
  onClick: () => void;
  unread?: boolean;
}

export default function ChatToggleButton({
  open,
  onClick,
  unread = false,
}: ChatToggleButtonProps) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            aria-label={open ? "Close chat" : "Open analysis chat"}
            className="
              relative flex h-10 w-10 items-center justify-center rounded-xl
              bg-zinc-900 border border-zinc-700
              hover:border-blue-500/50 hover:bg-zinc-800
              text-zinc-400 hover:text-blue-400
              shadow-lg shadow-black/30
              transition-all duration-200
              active:scale-95
            "
          >
            {open
              ? <X className="h-4 w-4" />
              : <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
            }

            {/* Unread dot */}
            {unread && !open && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-400 border-2 border-zinc-950" />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded-lg shadow-xl"
            side="left"
            sideOffset={8}
          >
            {open ? "Close chat" : "Chat about this video"}
            <Tooltip.Arrow className="fill-zinc-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}