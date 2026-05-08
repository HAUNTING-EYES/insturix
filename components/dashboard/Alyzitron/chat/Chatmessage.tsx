"use client";

import { useState } from "react";
import { Copy, Check, Bot, User } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Message } from "./ChatPanel";

interface ChatMessageProps {
  message: Message;
  isLast: boolean;
}

export default function ChatMessage({ message, isLast }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isEmpty = message.content === "";

  async function copyText() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formattedTime = message.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`group flex gap-2.5 py-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg mt-0.5
          ${isUser
            ? "bg-[#D4A652]/15 border border-[#D4A652]/25"
            : "bg-[#131312] border border-[#282724]"
          }
        `}
      >
        {isUser
          ? <User className="h-3.5 w-3.5 text-[#D4A652]" strokeWidth={2} />
          : <Bot className="h-3.5 w-3.5 text-[#7A776E]" strokeWidth={1.75} />
        }
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`
            relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
            ${isUser
              ? "bg-[#D4A652]/15 border border-[#D4A652]/20 text-[#ECE9E1] rounded-tr-sm"
              : "bg-[#0F0F0E] border border-[#1C1B19] text-[#B5B2A8] rounded-tl-sm"
            }
          `}
        >
          {isEmpty ? (
            // Empty assistant bubble — handled by TypingIndicator in parent
            null
          ) : (
            <FormattedContent content={message.content} isUser={isUser} />
          )}

          {/* Copy button — assistant only */}
          {!isUser && !isEmpty && (
            <Tooltip.Root>
              {/* <Tooltip.Trigger asChild>
                <button
                  onClick={copyText}
                  className="
                    absolute -top-2 -right-2
                    opacity-0 group-hover:opacity-100
                    flex h-6 w-6 items-center justify-center rounded-md
                    bg-[#131312] border border-[#282724]
                    text-[#5F5E5A] hover:text-[#ECE9E1]
                    transition-all duration-150
                  "
                >
                  {copied
                    ? <Check className="h-3 w-3 text-[#5EC97E]" />
                    : <Copy className="h-3 w-3" />
                  }
                </button>
              </Tooltip.Trigger> */}
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-[#0F0F0E] border border-[#282724] text-[#B5B2A8] text-xs px-2 py-1 rounded-lg shadow-xl"
                  sideOffset={4}
                >
                  {copied ? "Copied!" : "Copy"}
                  <Tooltip.Arrow className="fill-[#282724]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-[#454340] px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {formattedTime}
        </span>
      </div>
    </div>
  );
}

// ─── Formatted content ─────────────────────────────────────────────────────
// Handles **bold**, `code`, and [MM:SS] timestamps without a markdown library
function FormattedContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  // Split by lines, then parse inline formatting
  const lines = content.split("\n");

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line === "") return <div key={i} className="h-1" />;

        // Bullet lines
        if (line.match(/^[-•]\s/)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-[#D4A652]/60 mt-0.5 flex-shrink-0">·</span>
              <span className="break-words">{renderInline(line.slice(2))}</span>
            </div>
          );
        }

        // Numbered lines
        if (line.match(/^\d+\.\s/)) {
          const match = line.match(/^(\d+)\.\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-2">
                <span className="text-[#D4A652]/60 font-mono text-xs mt-0.5 flex-shrink-0 w-4">
                  {match[1]}.
                </span>
                <span className="break-words">{renderInline(match[2])}</span>
              </div>
            );
          }
        }

        return (
          <p key={i} className="break-words">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Pattern: **bold**, `code`, [MM:SS] timestamps
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{2}:\d{2}\])/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[#ECE9E1]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-[#131312] border border-[#282724] font-mono text-[12px] text-[#D4A652]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.match(/^\[\d{2}:\d{2}\]$/)) {
      return (
        <span
          key={i}
          className="font-mono text-[11px] text-[#D4A652]/80 bg-[#D4A652]/10 border border-[#D4A652]/20 px-1.5 py-0.5 rounded"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}