"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Idea, Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeChat } from "@/app/dashboard/thinkforge/hooks/useThinkForgeChat";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatHistoryPanel } from "./chat/ChatHistoryPanel";
import { sanitizeServerScript, ensureBlockIds } from "@/lib/thinkforge/json";
import type { ScriptModel } from "@/app/dashboard/thinkforge/hooks/useThinkForgeClient";

interface ChatPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  onApplyEdit: (updated: Script) => void;
  onRunEdit?: (instruction: string, selection?: string) => Promise<any>;
  sessionId?: string | null;
  initialMessages?: any[];
  onOpenSettings?: () => void;
  onSwitchSession?: (sessionId: string) => Promise<void>;
}

// Seed suggestions
const SUGGESTIONS_POOL = [
  "Add hook",
  "Stronger CTA",
  "Expand section",
  "Shorter version",
  "More data",
  "Story angle",
  "Add humor",
  "Sharpen tone",
  "Cut fluff",
  "Improve flow",
  "Alt headline",
  "Platform tweak",
  "What next?",
  "Is pacing ok?",
  "Better opening?",
  "Tone check",
  "Fact check",
  "Tighten copy",
  "Condense to 60s",
  "Punchier verbs",
  "Clarify benefit",
  "Remove jargon",
];

function getRandomSuggestions(count: number = 12): string[] {
  const shuffled = [...SUGGESTIONS_POOL].sort(() => Math.random() - 0.5);
  return [...new Set(shuffled)].slice(0, count);
}

// Convert Script to ScriptModel format
function scriptToModel(s: Script | null): ScriptModel | null {
  if (!s) return null;
  return {
    title: s.title || null,
    content: s.content || null,
    blocks: Array.isArray((s as any).blocks) && (s as any).blocks.length > 0 ? (s as any).blocks : null,
    metadata: s.metadata || null,
  };
}

// Convert ScriptModel to Script format
function modelToScript(m: ScriptModel | null): Script | null {
  if (!m) return null;
  const title = m.title || "Untitled Script";
  const content = m.content || "";
  const paras = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const htmlBody = [`<h1>${title}</h1>`, ...paras.map((p) => `<p>${p}</p>`)].join("\n");
  return {
    title,
    content,
    body: htmlBody,
    blocks: Array.isArray(m.blocks) && m.blocks.length > 0 ? (m.blocks as any) : undefined,
    metadata: m.metadata || undefined,
    sections: [],
    tips: [],
    duration: undefined,
    targetAudience: undefined,
    tone: undefined,
  } as Script;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  selectedIdea,
  script,
  onApplyEdit,
  sessionId,
  initialMessages,
  onOpenSettings,
  onSwitchSession,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const chat = useThinkForgeChat(sessionId || null, initialMessages);

  // Initialize suggestions
  useEffect(() => {
    if (chat.messages.length === 0 && selectedIdea) {
      setSuggestions(getRandomSuggestions());
    }
  }, [chat.messages.length, selectedIdea]);

  // Handle script updates from chat
  const handleScriptUpdate = useCallback(
    (scriptData: any) => {
      try {
        const sanitized = sanitizeServerScript(scriptData);
        if (sanitized && Array.isArray(sanitized.blocks)) {
          sanitized.blocks = ensureBlockIds(sanitized.blocks as any);
        }
        // Preserve metadata if provided
        if (scriptData.metadata) {
          sanitized.metadata = { ...sanitized.metadata, ...scriptData.metadata };
        }
        const scriptUpdate = modelToScript(sanitized);
        if (scriptUpdate) {
          onApplyEdit(scriptUpdate);
        }
      } catch (error) {
        console.error("Error applying script update:", error);
      }
    },
    [onApplyEdit]
  );

  // Build project payload from selected idea
  const projectPayload = useMemo(
    () => ({
      idea: selectedIdea?.idea,
      purpose: (selectedIdea as any)?.purpose,
      style: (selectedIdea as any)?.style,
      format: (selectedIdea as any)?.format,
      platform: (selectedIdea as any)?.platform,
      tone: selectedIdea?.tone,
    }),
    [selectedIdea]
  );

  // Build script payload
  const scriptPayload = useMemo(() => scriptToModel(script), [script]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !sessionId) return;
    const originalPrompt = inputValue.trim();
    setInputValue("");
    
    // Display the original message to user (no enrichment visible)
    // Backend will handle enrichment internally using project payload
    chat.sendMessage(originalPrompt, {
      script: scriptPayload,
      project: projectPayload,
      onScriptUpdate: handleScriptUpdate,
    });
  }, [inputValue, sessionId, chat, scriptPayload, projectPayload, handleScriptUpdate]);

  // Convert chat messages to the format expected by ChatMessages component
  const formattedMessages = useMemo(() => {
    return chat.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      streaming: msg.streaming,
    }));
  }, [chat.messages]);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  const handleNewChat = useCallback(() => {
    // Clear current messages to start fresh
    chat.clearMessages();
  }, [chat]);

  return (
    <div className="flex flex-col h-full bg-neutral-900/40 backdrop-blur-xl animate-in fade-in-0 duration-300">
      <ChatHeader 
        onOpenHistory={handleOpenHistory}
        onOpenSettings={onOpenSettings}
        onNewChat={handleNewChat}
      />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
        <ChatMessages
          messages={formattedMessages}
          isStreaming={chat.isStreaming}
        />
        
        {/* Decorative gradient at bottom of messages */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-neutral-900/60 to-transparent pointer-events-none" />
      </div>

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onStop={chat.stopStreaming}
        disabled={!sessionId}
        isStreaming={chat.isStreaming}
        suggestions={suggestions}
      />

      {/* Chat History Panel */}
      <ChatHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessionId={sessionId || null}
        currentMessages={formattedMessages}
        onSwitchSession={onSwitchSession}
      />
    </div>
  );
};
