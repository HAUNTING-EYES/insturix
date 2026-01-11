"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Idea, Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeChat } from "@/app/dashboard/thinkforge/hooks/useThinkForgeChat";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatHistoryPanel } from "./chat/ChatHistoryPanel";
import { GenerationProgress } from "./chat/GenerationProgress";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
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
  onGetSelection?: () => { blocks: any[]; range: { from: number; to: number } | null } | null; // Get current selection from editor
  editingSelection?: { text: string; range: { from: number; to: number }; blocks: any[] } | null;
  onCancelEditSelection?: () => void;
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

export const ChatPanel: React.FC<ChatPanelProps & { onTokenStream?: (tokens: string) => void }> = ({
  selectedIdea,
  script,
  onApplyEdit,
  sessionId,
  initialMessages,
  onOpenSettings,
  onSwitchSession,
  onTokenStream,
  onGetSelection,
  editingSelection,
  onCancelEditSelection,
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
    
    // Get selection from editor if available (for surgical editing)
    let selectionData: { blocks?: any[]; range?: { from: number; to: number } } | null = null;
    
    // Prefer explicit editingSelection from edit button
    if (editingSelection) {
      selectionData = {
        blocks: editingSelection.blocks,
        range: editingSelection.range,
      };
    } else if (onGetSelection) {
      const selection = onGetSelection();
      if (selection && !selection.isEmpty && selection.blocks.length > 0) {
        selectionData = {
          blocks: selection.blocks,
          range: selection.range || undefined,
        };
      }
    }
    
    // Display the original message to user (no enrichment visible)
    // Backend will handle enrichment internally using project payload
    chat.sendMessage(originalPrompt, {
      script: scriptPayload,
      project: projectPayload,
      onScriptUpdate: handleScriptUpdate,
      onTokenStream: onTokenStream, // Stream tokens for progressive rendering
      selectionBlocks: selectionData?.blocks, // Include selection blocks for surgical editing
      selectionRange: selectionData?.range, // Include selection range
    });
    
    // Clear editing selection after send
    if (editingSelection && onCancelEditSelection) {
      // Ensure state update happens
      setTimeout(() => {
        onCancelEditSelection();
      }, 0);
    }
  }, [inputValue, sessionId, chat, scriptPayload, projectPayload, handleScriptUpdate, onTokenStream, onGetSelection, editingSelection, onCancelEditSelection]);

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

  const handleNewChat = useCallback(async () => {
    // CRITICAL: Create a new chat thread (new session)
    // This does NOT affect script state - script stays in old session
    if (onSwitchSession && selectedIdea) {
      try {
        // Create new session for chat with same project meta
        const response = await fetch('/api/services/thinkforge/hydrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectMeta: {
              idea: selectedIdea.idea,
              purpose: (selectedIdea as any)?.purpose,
              style: (selectedIdea as any)?.style,
              format: (selectedIdea as any)?.format,
              platform: (selectedIdea as any)?.platform,
              tone: selectedIdea.tone,
              projectName: (selectedIdea as any)?.projectName
            }
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.sessionId) {
            await onSwitchSession(data.sessionId);
          }
        }
      } catch (error) {
        console.error('Failed to create new chat:', error);
      }
    } else {
      // Fallback: clear messages if no session switching available
      chat.clearMessages();
    }
  }, [chat, onSwitchSession, selectedIdea]);

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
        <GenerationProgress 
          active={chat.isStreaming} 
          intent={chat.currentIntent}
        />
        
        {/* Decorative gradient at bottom of messages */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-900/60 to-transparent pointer-events-none" />
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
        currentProjectMeta={{
          idea: selectedIdea?.idea,
          purpose: (selectedIdea as any)?.purpose,
          tone: selectedIdea?.tone,
          projectName: (selectedIdea as any)?.projectName,
        }}
        onNewChat={handleNewChat}
      />
    </div>
  );
};
