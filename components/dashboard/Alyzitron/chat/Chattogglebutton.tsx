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
              bg-[#0F0F0E] border border-[#282724]
              hover:border-[#D4A652]/50 hover:bg-[#131312]
              text-[#7A776E] hover:text-[#D4A652]
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
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#D4A652] border-2 border-[#0B0B0A]" />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-[#0F0F0E] border border-[#282724] text-[#B5B2A8] text-[11px] px-3 py-1.5 rounded-lg shadow-xl"
            side="left"
            sideOffset={8}
          >
            {open ? "Close chat" : "Chat about this video"}
            <Tooltip.Arrow className="fill-[#282724]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}