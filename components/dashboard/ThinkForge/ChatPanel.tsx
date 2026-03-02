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
import type { ScriptModel } from "@/app/dashboard/thinkforge/hooks/useThinkForgeSession";
import { toast } from "@/hooks/use-toast";
import { extractUrls } from "./PromptPanel";

interface ChatPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  scriptId?: string | null;
  onApplyEdit: (updated: Script) => void;
  onRunEdit?: (instruction: string, selection?: string) => Promise<any>;
  sessionId?: string | null;
  initialMessages?: any[];
  onOpenSettings?: () => void;
  onSwitchSession?: (sessionId: string) => Promise<void>;
  onScriptCreated?: (scriptId: string) => void;
  onGetSelection?: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null; // Get current selection from editor
  editingSelection?: { text: string; range: { from: number; to: number }; blocks: any[] } | null;
  onCancelEditSelection?: () => void;
  onGenerationStateChange?: (state: { intent: string | null; isStreaming: boolean }) => void;
  workspaceMode?: 'script' | 'whiteboard';
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
    version: (s as any).version,
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
    version: (m as any).version,
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
  scriptId,
  initialMessages,
  onOpenSettings,
  onSwitchSession,
  onScriptCreated,
  onTokenStream,
  onGetSelection,
  editingSelection,
  onCancelEditSelection,
  onGenerationStateChange,
  workspaceMode = 'script',
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string>('default');
  const [threadRegistry, setThreadRegistry] = useState<Array<{ id: string; name: string; lastEdited: number }>>([]);
  const scriptIdRef = React.useRef<string | null>(scriptId || null);
  const [briefExtracting, setBriefExtracting] = useState(false);

  useEffect(() => {
    scriptIdRef.current = scriptId || null;
  }, [scriptId]);

  const threadRegistryKey = useMemo(() => (
    sessionId ? `thinkforge_chat_threads_${sessionId}` : null
  ), [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      const savedActive = localStorage.getItem(`thinkforge_active_chat_${sessionId}`);
      setActiveThreadId(savedActive || 'default');
    } catch {
      setActiveThreadId('default');
    }
    try {
      const raw = threadRegistryKey ? localStorage.getItem(threadRegistryKey) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      setThreadRegistry(Array.isArray(parsed) ? parsed : []);
    } catch {
      setThreadRegistry([]);
    }
  }, [sessionId, threadRegistryKey]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(`thinkforge_active_chat_${sessionId}`, activeThreadId);
    } catch { }
  }, [sessionId, activeThreadId]);

  const upsertThread = useCallback((id: string, updates: Partial<{ name: string; lastEdited: number }>) => {
    if (!threadRegistryKey) return;
    setThreadRegistry((prev) => {
      const existing = prev.find((t) => t.id === id);
      const next = existing
        ? prev.map((t) => t.id === id ? { ...t, ...updates } : t)
        : [{ id, name: updates.name || `Chat ${String(id).slice(-6)}`, lastEdited: updates.lastEdited || Date.now() }, ...prev];
      try { localStorage.setItem(threadRegistryKey, JSON.stringify(next)); } catch { }
      return next;
    });
  }, [threadRegistryKey]);

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

  const chat = useThinkForgeChat(sessionId || null, activeThreadId || null, initialMessages, {
    onRemoteScriptUpdate: handleScriptUpdate,
    onScriptCreated,
  });

  // Initialize suggestions
  useEffect(() => {
    if (chat.messages.length === 0 && selectedIdea) {
      setSuggestions(getRandomSuggestions());
    }
  }, [chat.messages.length, selectedIdea]);

  // Build project payload from selected idea
  const sessionPayload = useMemo(
    () => ({
      idea: selectedIdea?.idea,
      purpose: (selectedIdea as any)?.purpose,
      style: (selectedIdea as any)?.style,
      format: (selectedIdea as any)?.format,
      platform: (selectedIdea as any)?.platform,
      tone: selectedIdea?.tone,
      sessionName: (selectedIdea as any)?.sessionName,
    }),
    [selectedIdea]
  );

  // Build script payload
  const scriptPayload = useMemo(() => scriptToModel(script), [script]);

  const handleSend = useCallback(() => {
    console.log('[ChatPanel.handleSend] called', { inputValue: inputValue.trim(), sessionId, isStreaming: chat.isStreaming });
    if (!inputValue.trim()) {
      console.log('[ChatPanel.handleSend] No input value, returning');
      return;
    }
    if (!sessionId) {
      console.log('[ChatPanel.handleSend] No sessionId, returning');
      toast({
        title: "Session not ready",
        description: "Please wait a moment while the session loads, then try again.",
      });
      return;
    }

    const originalPrompt = inputValue.trim();

    // Check for URLs in the message
    const urls = extractUrls(originalPrompt);
    if (urls.length > 0) {
      // URL detected — analyze first, then send enriched message
      handleUrlInChat(urls, originalPrompt);
      return;
    }

    // No URLs — normal send flow
    sendChatMessage(originalPrompt);
  }, [inputValue, sessionId, chat.isStreaming]);

  /** Send a normal chat message (no URL processing) */
  const sendChatMessage = useCallback((originalPrompt: string) => {
    if (!sessionId) return;

    if (activeThreadId) {
      upsertThread(activeThreadId, { lastEdited: Date.now(), name: originalPrompt.slice(0, 60) });
    }
    setInputValue("");

    // Get selection from editor if available (for surgical editing)
    let selectionData: { blocks?: any[]; blockIds?: string[]; range?: { from: number; to: number } } | null = null;

    // Prefer explicit editingSelection from edit button
    if (editingSelection) {
      const derivedBlockIds = Array.isArray(editingSelection.blocks)
        ? editingSelection.blocks.map((b: any) => b?.id).filter((id: any) => typeof id === 'string')
        : [];
      selectionData = {
        blocks: editingSelection.blocks,
        blockIds: derivedBlockIds.length > 0 ? derivedBlockIds : undefined,
        range: editingSelection.range,
      };
    } else if (onGetSelection) {
      const selection = onGetSelection();
      if (selection && selection.blocks.length > 0) {
        selectionData = {
          blocks: selection.blocks,
          blockIds: selection.blockIds && selection.blockIds.length > 0 ? selection.blockIds : undefined,
          range: selection.range || undefined,
        };
      }
    }

    const hasSelection = Boolean(
      (selectionData?.blockIds && selectionData.blockIds.length > 0) ||
      (selectionData?.blocks && selectionData.blocks.length > 0)
    );
    const editorFocused = (() => {
      if (typeof document === 'undefined') return false;
      const active = document.activeElement as HTMLElement | null;
      const editorEl = document.querySelector('.ProseMirror') as HTMLElement | null;
      return !!(active && editorEl && (editorEl === active || editorEl.contains(active)));
    })();
    const lastUserAction = editingSelection
      ? 'selection_edit'
      : hasSelection
        ? 'selection_active'
        : 'chat_send';

    const currentScriptId = scriptIdRef.current || undefined;
    chat.sendMessage(originalPrompt, {
      script: scriptPayload,
      project: sessionPayload,
      onScriptUpdate: handleScriptUpdate,
      onTokenStream: onTokenStream,
      onScriptCreated: onScriptCreated,
      selection: editingSelection?.text,
      selectionBlocks: selectionData?.blocks,
      selectionBlockIds: selectionData?.blockIds,
      selectionRange: selectionData?.range,
      scriptId: currentScriptId,
      intentContext: {
        editorFocused,
        hasSelection,
        workspaceMode,
        lastUserAction,
      },
    });

    // Clear editing selection after send
    if (editingSelection && onCancelEditSelection) {
      setTimeout(() => {
        onCancelEditSelection();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('tf-clear-selection'));
        }
      }, 0);
    }
  }, [sessionId, activeThreadId, chat, scriptPayload, sessionPayload, handleScriptUpdate, onTokenStream, onGetSelection, editingSelection, onCancelEditSelection, upsertThread]);

  /** Handle URLs detected in chat input — analyze all, enrich prompt, save to databank */
  const handleUrlInChat = useCallback(async (urls: string[], originalPrompt: string) => {
    if (!sessionId) return;
    setBriefExtracting(true);
    setInputValue("");

    // Show user message immediately
    chat.appendMessage({
      id: `url-user-${Date.now()}`,
      role: 'user',
      content: originalPrompt,
      timestamp: new Date(),
    });

    try {
      // Analyze ALL URLs in parallel
      const results = await Promise.allSettled(
        urls.map(async (url) => {
          const res = await fetch('/api/services/thinkforge/url-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          if (!res.ok) throw new Error('Failed to extract brief');
          const data = await res.json();
          return { url, brief: data.brief };
        })
      );

      const successfulBriefs: Array<{ url: string; brief: any }> = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.brief) {
          successfulBriefs.push(result.value);
        }
      }

      if (successfulBriefs.length > 0) {
        // Build enriched prompt: replace URLs with briefs inline
        let enrichedPrompt = originalPrompt;
        const briefMessages: string[] = [];

        for (const { url, brief } of successfulBriefs) {
          const briefBlock = [
            `**${brief.title}** _(${brief.platform || 'Web'})_`,
            brief.summary,
            `**Key topics:** ${(brief.keyTopics || []).join(', ')}`,
            `**Angles:** ${(brief.suggestedAngles || []).join(' | ')}`,
            `**Audience:** ${brief.targetAudience || 'General'}`,
          ].join('\n');
          enrichedPrompt = enrichedPrompt.replace(url, briefBlock);
          briefMessages.push(`🔗 **Brief from ${url}:**\n${briefBlock}`);

          // Save to databank (fire and forget)
          fetch('/api/services/thinkforge/databank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              type: 'url_brief',
              title: brief.title,
              content: brief,
              sourceUrl: url,
              tags: brief.keyTopics || [],
            }),
          }).catch(err => console.error('[DataBank] Failed to save brief:', err));
        }

        // Show brief as assistant message
        const briefSummary = briefMessages.join('\n\n---\n\n');
        chat.appendMessage({
          id: `url-brief-${Date.now()}`,
          role: 'assistant',
          content: briefSummary + '\n\n_Saved to research databank._',
          timestamp: new Date(),
        });

        // Now send the enriched prompt to chat for actual AI processing
        // Remove the URLs that were already analyzed to avoid double-processing
        const remainingText = originalPrompt;
        // Check if there's non-URL text that should be sent to the AI
        const textWithoutUrls = urls.reduce((text, url) => text.replace(url, '').trim(), remainingText);
        if (textWithoutUrls.length > 10) {
          // There's meaningful text besides URLs — send enriched version to AI
          sendChatMessage(enrichedPrompt);
        }
      } else {
        // All briefs failed — send original message to chat normally
        toast({
          title: 'URL analysis failed',
          description: 'Could not extract content from URLs. Sending message as-is.',
        });
        sendChatMessage(originalPrompt);
      }
    } catch (error) {
      console.error('[ChatPanel] URL analysis failed:', error);
      sendChatMessage(originalPrompt);
    } finally {
      setBriefExtracting(false);
    }
  }, [sessionId, chat, sendChatMessage]);

  // Convert chat messages to the format expected by ChatMessages component
  const formattedMessages = useMemo(() => {
    return chat.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      streaming: msg.streaming,
      selectionText: msg.selectionText || null,
    }));
  }, [chat.messages]);

  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);
  const handleCancelEditSelection = useCallback(() => {
    if (onCancelEditSelection) {
      onCancelEditSelection();
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('tf-clear-selection'));
    }
  }, [onCancelEditSelection]);

  // Bubble generation state up so the editor can react to streaming
  useEffect(() => {
    if (onGenerationStateChange) {
      onGenerationStateChange({
        intent: chat.currentIntent || null,
        isStreaming: chat.isStreaming,
      });
    }
  }, [chat.currentIntent, chat.isStreaming, onGenerationStateChange]);

  const handleNewChat = useCallback(() => {
    if (!sessionId) return;
    const newThreadId = crypto.randomUUID();
    setActiveThreadId(newThreadId);
    upsertThread(newThreadId, { name: `Chat ${String(newThreadId).slice(-6)}`, lastEdited: Date.now() });
    chat.clearMessages();
    setHistoryOpen(true);
  }, [sessionId, chat, upsertThread]);

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
          progressOverride={chat.generationProgress}
          messageOverride={chat.generationMessage}
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
        isStreaming={chat.isStreaming || briefExtracting}
        suggestions={suggestions}
        editingSelection={editingSelection}
        onCancelEditSelection={handleCancelEditSelection}
      />

      {/* Chat History Panel */}
      <ChatHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessionId={sessionId || null}
        currentThreadId={activeThreadId}
        localThreads={threadRegistry}
        onSwitchThread={(id) => {
          setActiveThreadId(id);
          setHistoryOpen(false);
        }}
        onNewChat={handleNewChat}
      />
    </div>
  );
};
