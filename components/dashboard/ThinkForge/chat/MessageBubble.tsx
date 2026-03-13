"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { SidecarCard, SidecarCardAction } from "@/lib/thinkforge/state/types";
import { SidecarCardRenderer } from "./SidecarCardRenderer";
import { ThinkingBlock } from "./ThinkingBlock";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
  selectionText?: string | null;
  card?: SidecarCard | null;
  thinking?: string;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onCardAction?: (action: SidecarCardAction) => void;
  onCardDismiss?: (cardId: string) => void;
}

export function MessageBubble({ message, onCardAction, onCardDismiss }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Message Content */}
      {isUser ? (
        // User message - with bubble, right aligned
        <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm bg-red-500/15 text-white/90 ring-1 ring-red-500/20 space-y-2">
          {message.selectionText && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-red-300/80 font-semibold">Selected</div>
              <div className="text-xs text-red-100/90 italic line-clamp-3">“{message.selectionText}”</div>
            </div>
          )}
          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        </div>
      ) : (
        // Assistant message - no bubble, clean text, left aligned
        <div className="max-w-[90%] text-sm text-zinc-200 space-y-2">
          {/* Thinking block (pre-generation reasoning) */}
          {message.thinking && <ThinkingBlock thinking={message.thinking} />}
          {/* Sidecar Card (structured agent output) */}
          {message.card && (
            <SidecarCardRenderer
              card={message.card}
              onAction={onCardAction}
              onDismiss={onCardDismiss}
            />
          )}
          {/* Text content (conversational output) */}
          {message.content && (
          <div className="leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 mb-3 space-y-1 text-zinc-300">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 mb-3 space-y-1 text-zinc-300">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
                h1: ({ children }) => <h1 className="text-lg font-semibold text-white mb-2 mt-4 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold text-white mb-2 mt-3 first:mt-0">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold text-white mb-1.5 mt-2 first:mt-0">{children}</h3>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-zinc-600 pl-3 my-2 text-zinc-400 italic">{children}</blockquote>
                ),
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match && !className?.includes("language-");
                  return isInline ? (
                    <code
                      className="bg-white/10 rounded px-1.5 py-0.5 font-mono text-xs text-zinc-200"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      className="block bg-black/40 rounded-lg p-3 font-mono text-xs overflow-x-auto my-3 text-zinc-200 ring-1 ring-white/5"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => <pre className="m-0">{children}</pre>,
                a: ({ children, href }) => (
                  <a href={href} className="text-red-400 hover:text-red-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          )}
          {message.streaming && (
            <span className="inline-block align-baseline ml-0.5 w-1.5 h-4 bg-red-400 animate-pulse rounded-sm" />
          )}
        </div>
      )}
    </div>
  );
}
