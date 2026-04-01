"use client";
import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble, ChatMessage } from "./MessageBubble";
import { LoadingIndicator } from "./LoadingIndicator";
import type { SidecarCardAction } from "@/lib/thinkforge/state/types";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  onCardAction?: (action: SidecarCardAction) => void;
  onCardDismiss?: (cardId: string) => void;
}

export function ChatMessages({
  messages,
  isStreaming = false,
  onCardAction,
  onCardDismiss,
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Smooth scroll to bottom when messages change or streaming
  useEffect(() => {
    if (messagesEndRef.current && containerRef.current) {
      // Small delay to ensure DOM has updated
      const timeoutId = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages.length, isStreaming, messages]);

  return (
    <ScrollArea className="flex-1 px-5 py-4">
      <div ref={containerRef} className="space-y-6">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onCardAction={onCardAction}
            onCardDismiss={onCardDismiss}
          />
        ))}

        {isStreaming && <LoadingIndicator />}

        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
}
