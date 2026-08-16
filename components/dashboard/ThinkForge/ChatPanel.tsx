"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeChat } from "@/app/dashboard/thinkforge/hooks/useThinkForgeChat";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatHistoryPanel } from "./chat/ChatHistoryPanel";
import { GenerationProgress } from "./chat/GenerationProgress";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
import type { ScriptModel } from "@/app/dashboard/thinkforge/hooks/useThinkForgeSession";
import type { IdeaCardData, SidecarCardAction } from "@/lib/thinkforge/state/types";
import { toast } from "@/hooks/use-toast";
import { extractUrls } from "./PromptPanel";
import { logShadowEvent } from "@/lib/thinkforge/services/shadow-logger";
import { TrendWorkflowPanel } from "./TrendWorkflowPanel";
import type { SelectedTrend } from "@/lib/thinkforge/trends/selected-trend";
import {
  ThinkForgeAuthoringRequestSchema,
  buildThinkForgeAuthoringCompatibilityMetadata,
  type ThinkForgeAuthoringRequest,
} from "@/lib/thinkforge/schemas/authoring-request";

interface ChatPanelProps {
  selectedIdea: IdeaCardData;
  script: Script | null;
  scriptId?: string | null;
  isScriptLoading?: boolean;
  onApplyEdit: (updated: Script) => void;
  sessionId?: string | null;
  initialMessages?: any[];
  onOpenSettings?: () => void;
  onOpenKnowledge?: () => void;
  onScriptCreated?: (scriptId: string) => void;
  onGetSelection?: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null;
  editingSelection?: { text: string; range: { from: number; to: number }; blocks: any[] } | null;
  onCancelEditSelection?: () => void;
  onGenerationStateChange?: (state: { intent: string | null; isStreaming: boolean }) => void;
  workspaceMode?: 'script' | 'whiteboard';
}

// Context-aware suggestion pools
const EMPTY_DOCUMENT_SUGGESTIONS = [
  "Create the complete first draft for this idea",
  "Build a clear structure before drafting",
  "Give me 3 distinct opening approaches",
  "Draft a creative brief I can work from",
];

const HAS_DOCUMENT_SUGGESTIONS = [
  "Make this more specific and remove generic language",
  "Give the opening a sharper point of view",
  "Strengthen the ending without forcing a CTA",
  "Adjust the voice while preserving the brand constraints",
  "Tighten this without changing the requested duration",
  "Develop the central idea with stronger evidence",
];

const ADVANCED_DOCUMENT_SUGGESTIONS = [
  "Create an alternative opening approach",
  "Turn the strongest evidence into a concrete example",
  "Adapt this for a different audience segment",
  "Flag anything generic, unsupported, or off-brand",
];

const PROJECT_META_PASSTHROUGH_KEYS = [
  'brandId',
  'brandBrief',
  'clientId',
  'clientName',
  'campaignId',
  'campaignName',
  'seriesId',
  'calendarItemId',
  'contentCardId',
] as const;

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickProjectMetaPassthrough(source: unknown): Record<string, string> {
  if (!source || typeof source !== 'object') return {};
  const input = source as Record<string, unknown>;
  return PROJECT_META_PASSTHROUGH_KEYS.reduce<Record<string, string>>((acc, key) => {
    const value = toNonEmptyString(input[key]);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function resolveSelectedIdeaAuthoringRequest(idea: IdeaCardData): ThinkForgeAuthoringRequest | null {
  if (idea.authoringRequest === undefined) return null;
  return ThinkForgeAuthoringRequestSchema.parse(idea.authoringRequest);
}

function getContextualSuggestions(hasScript: boolean, messageCount: number = 0, count: number = 3, seed: string = ''): string[] {
  // Deterministic selection seeded by idea text — prevents re-randomization on every render.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const pick = (arr: readonly string[], n: number) => {
    const out: string[] = [];
    const idx = arr.map((_, i) => i);
    for (let i = 0; i < Math.min(n, idx.length); i++) {
      const j = Math.abs(h + i * 7) % idx.length;
      out.push(arr[idx[j]]);
      idx.splice(j, 1);
    }
    return out;
  };
  if (hasScript && messageCount >= 3) {
    return [...pick(HAS_DOCUMENT_SUGGESTIONS, 2), ...pick(ADVANCED_DOCUMENT_SUGGESTIONS, 1)].slice(0, count);
  }
  return pick(hasScript ? HAS_DOCUMENT_SUGGESTIONS : EMPTY_DOCUMENT_SUGGESTIONS, count);
}

const STYLE_CORRECTION_RE = /\b(too formal|too casual|punchier|more concise|shorter|longer|simpler|friendlier|serious|tone|less wordy|rewrite|rephrase|sound more|sound less)\b/i;

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
  isScriptLoading,
  onApplyEdit,
  sessionId,
  scriptId,
  initialMessages,
  onOpenSettings,
  onOpenKnowledge,
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
  const initialDraftClaimedSessionRef = React.useRef<string | null>(null);
  const [briefExtracting, setBriefExtracting] = useState(false);
  const justStoppedStreamRef = React.useRef(false);
  const [trendWorkflowOpen, setTrendWorkflowOpen] = useState(false);

  useEffect(() => {
    scriptIdRef.current = scriptId || null;
  }, [scriptId]);

  const threadRegistryKey = useMemo(() => (
    sessionId ? `thinkforge_chat_threads_${sessionId}` : null
  ), [sessionId]);
  const selectedAuthoringRequest = useMemo(
    () => resolveSelectedIdeaAuthoringRequest(selectedIdea),
    [selectedIdea],
  );
  const hasDocumentContent = Boolean(
    script?.content || (Array.isArray(script?.blocks) && script.blocks.length > 0),
  );

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
    getActiveScriptId: () => scriptIdRef.current,
  });

  // Initialize context-aware suggestions
  useEffect(() => {
    const hasContent = !!script?.content;
    setSuggestions(getContextualSuggestions(hasContent, chat.messages.length, 3, selectedIdea?.idea || ''));
  }, [!!script?.content, chat.messages.length, selectedIdea]);

  // Build project payload from selected idea
  const sessionPayload = useMemo(
    () => {
      const authoringMetadata = selectedAuthoringRequest
        ? buildThinkForgeAuthoringCompatibilityMetadata(selectedAuthoringRequest)
        : undefined;
      return {
        idea: selectedIdea.idea,
        purpose: selectedIdea.purpose,
        style: selectedIdea.style,
        format: selectedIdea.format,
        platform: selectedIdea.platform,
        durationSec: selectedIdea.durationSec,
        ...(authoringMetadata || {}),
        tone: selectedIdea.tone,
        sessionName: selectedIdea.sessionName,
        originalPrompt: selectedIdea.originalPrompt,
        ...pickProjectMetaPassthrough(selectedIdea),
      };
    },
    [selectedIdea, selectedAuthoringRequest]
  );

  // Build script payload
  const scriptPayload = useMemo(() => scriptToModel(script), [script]);

  // An initial document draft is created only after an explicit Start Drafting action
  // persists a pending intent on the session. Mounting an old session never creates one.
  useEffect(() => {
    if (!sessionId || isScriptLoading) return;
    if (initialDraftClaimedSessionRef.current === sessionId) return;
    if (!selectedIdea?.idea || chat.messages.length > 0 || chat.isStreaming) return;

    if (hasDocumentContent || !selectedAuthoringRequest) return;

    void (async () => {
      try {
        const response = await fetch('/api/services/thinkforge/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, claimInitialDraft: true }),
        });
        if (!response.ok) {
          throw new Error(`Initial draft claim failed: ${response.status}`);
        }

        const claim = await response.json();
        initialDraftClaimedSessionRef.current = sessionId;
        if (claim?.initialDraftClaimed !== true) return;

        const initialDraftPrompt = `Create the complete first draft for the persisted authoring request and this selected idea: "${selectedIdea.idea}". Preserve the exact deliverable, platform, duration or slide count, brand constraints, and evidence attached to the session.`;
        void chat.sendMessage(initialDraftPrompt, {
          silent: true,
          script: scriptPayload,
          project: sessionPayload,
          onTokenStream,
          onScriptCreated,
          scriptId: scriptIdRef.current || undefined,
          intentContext: {
            editorFocused: false,
            hasSelection: false,
            workspaceMode,
            lastUserAction: 'initial_draft_claim',
          },
        });
      } catch (error) {
        console.error('[ThinkForge] Initial draft claim failed:', error);
        toast({
          title: 'Could not start the first draft',
          description: 'Please try again from the editor.',
          variant: 'destructive',
        });
      }
    })();
  }, [
    sessionId,
    isScriptLoading,
    selectedIdea?.idea,
    script?.content,
    script?.blocks,
    hasDocumentContent,
    selectedAuthoringRequest,
    chat.messages.length,
    chat.isStreaming,
    chat.sendMessage,
    scriptPayload,
    sessionPayload,
    onTokenStream,
    onScriptCreated,
    workspaceMode,
  ]);
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) {
      return;
    }
    if (!sessionId) {
      toast({
        title: "Session not ready",
        description: "Please wait a moment while the session loads, then try again.",
      });
      return;
    }
    if (!selectedAuthoringRequest && !hasDocumentContent) {
      toast({
        title: 'Confirm output settings',
        description: 'Choose the output type, destination, and required length in session settings before drafting.',
        variant: 'destructive',
      });
      onOpenSettings?.();
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
  }, [inputValue, sessionId, chat.isStreaming, selectedAuthoringRequest, hasDocumentContent, onOpenSettings]);

  /** Send a normal chat message (no URL processing) */
  const sendChatMessage = useCallback((originalPrompt: string, authoringRequestOverride?: ThinkForgeAuthoringRequest) => {
    if (!sessionId) return;
    const effectiveAuthoringRequest = authoringRequestOverride
      ? ThinkForgeAuthoringRequestSchema.parse(authoringRequestOverride)
      : selectedAuthoringRequest;
    if (!effectiveAuthoringRequest && !hasDocumentContent) {
      toast({
        title: 'Confirm output settings',
        description: 'This empty session has no authoritative authoring request. Confirm its output settings before drafting.',
        variant: 'destructive',
      });
      onOpenSettings?.();
      return;
    }

    // Shadow Logger: detect regeneration (user stopped AI then sent a new message)
    if (justStoppedStreamRef.current) {
      justStoppedStreamRef.current = false;
      logShadowEvent({
        projectId: sessionId,
        sessionId,
        type: 'regeneration_requested',
        payload: { followUpPrompt: originalPrompt.slice(0, 200) },
      });
    }

    // Shadow Logger: detect style corrections
    if (STYLE_CORRECTION_RE.test(originalPrompt)) {
      logShadowEvent({
        projectId: sessionId,
        sessionId,
        type: 'style_corrected',
        payload: { feedback: originalPrompt.slice(0, 300) },
      });
    }

    // Observer pipeline: extract facts from chat messages in the background
    if (originalPrompt.length >= 50) {
      fetch('/api/services/thinkforge/events/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalPrompt.slice(0, 500), sessionId, source: 'chat' }),
      }).catch(() => { });
    }

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
    const projectPayload = effectiveAuthoringRequest
      ? {
          ...sessionPayload,
          ...buildThinkForgeAuthoringCompatibilityMetadata(effectiveAuthoringRequest),
        }
      : sessionPayload;
    chat.sendMessage(originalPrompt, {
      script: scriptPayload,
      project: projectPayload,
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
  }, [sessionId, selectedAuthoringRequest, hasDocumentContent, onOpenSettings, activeThreadId, chat, scriptPayload, sessionPayload, handleScriptUpdate, onTokenStream, onGetSelection, editingSelection, onCancelEditSelection, upsertThread]);

  /**
   * Handle URLs detected in chat input.
   * Awaits Refinery Agent processing so the AI has access to the extracted
   * facts before generating a response.
   */
  const handleUrlInChat = useCallback(async (urls: string[], originalPrompt: string) => {
    if (!sessionId) return;
    setBriefExtracting(true);
    setInputValue("");

    chat.appendMessage({
      id: `url-user-${Date.now()}`,
      role: 'user',
      content: originalPrompt,
      timestamp: new Date(),
    });

    chat.appendMessage({
      id: `url-processing-${Date.now()}`,
      role: 'assistant',
      content: `Analyzing ${urls.length} link${urls.length > 1 ? 's' : ''} and saving to your research databank...`,
      timestamp: new Date(),
    });

    let researchReady = false;
    try {
      const res = await fetch('/api/services/thinkforge/refinery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, urls }),
      });

      const queued = await res.json().catch(() => null);
      if (!res.ok || !queued?.job?.id) {
        throw new Error(queued?.error || 'Research processing could not be started.');
      }

      const deadline = Date.now() + 10 * 60_000;
      let job = queued.job;
      while (job.status === 'queued' || job.status === 'running') {
        if (Date.now() >= deadline) {
          throw new Error('Research processing is taking longer than expected. Please try again shortly.');
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        const status = await fetch(`/api/services/thinkforge/refinery?jobId=${encodeURIComponent(job.id)}`);
        const payload = await status.json().catch(() => null);
        if (!status.ok || !payload?.job) {
          throw new Error(payload?.error || 'Research processing status could not be loaded.');
        }
        job = payload.job;
      }
      if (job.status !== 'completed' || !job.result || job.result.processed < 1) {
        throw new Error(job.error?.message || 'None of the supplied research sources could be analyzed.');
      }

      const result = job.result;
      const successCount = result?.processed ?? 0;
      const failCount = result?.failed ?? 0;
      const titles = (result?.entries || []).map((e: any) => e.title).filter(Boolean);

      let msg = `Research saved: ${successCount} source${successCount !== 1 ? 's' : ''} analyzed`;
      if (titles.length > 0) msg += ` (${titles.join(', ')})`;
      if (failCount > 0) msg += `. ${failCount} URL${failCount !== 1 ? 's' : ''} could not be processed.`;

      chat.appendMessage({
        id: `url-done-${Date.now()}`,
        role: 'assistant',
        content: msg,
        timestamp: new Date(),
      });
      researchReady = true;
    } catch (err) {
      console.error('[Refinery] Processing failed:', err);
      chat.appendMessage({
        id: `url-fail-${Date.now()}`,
        role: 'assistant',
        content: err instanceof Error ? `Could not analyze the links: ${err.message}` : 'Could not analyze the links.',
        timestamp: new Date(),
      });
    } finally {
      setBriefExtracting(false);
    }

    // Now send the prompt — the Databank has been populated, so
    // fetchContextSources will pick up the newly ingested facts.
    const textWithoutUrls = urls.reduce((text, url) => text.replace(url, '').trim(), originalPrompt);
    if (researchReady && textWithoutUrls.length > 5) {
      sendChatMessage(textWithoutUrls);
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
      card: (msg as any).card || null,
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

  const handleCardAction = useCallback(async (action: SidecarCardAction) => {
    if (action.id === 'open_tab' && action.payload?.scriptId && onScriptCreated) {
      onScriptCreated(action.payload.scriptId);
    } else if (action.id === 'retry') {
      toast({ title: 'Retry', description: 'Please try the action again.' });
    } else if (action.id === 'copy_hooks' || action.id === 'copy_shots') {
      toast({ title: 'Copied', description: 'Content copied to clipboard.' });
    }
  }, [onScriptCreated]);

  const handleCardDismiss = useCallback((cardId: string) => {
    // Cards are embedded in messages; dismissal is a no-op for now
  }, []);

  const handleGenerateFromTrend = useCallback((prompt: string, _sessionId: string, _target: import('./TrendWorkflowPanel').TrendTarget, _selectedTrend: SelectedTrend, trendAuthoringRequest: ThinkForgeAuthoringRequest) => {
    sendChatMessage(prompt, trendAuthoringRequest);
  }, [sendChatMessage]);

  return (
    <div className="flex flex-col h-full bg-[#0F0F0E] animate-in fade-in-0 duration-300">
      <ChatHeader
        onOpenHistory={handleOpenHistory}
        onOpenSettings={onOpenSettings}
        onOpenKnowledge={onOpenKnowledge}
        onNewChat={handleNewChat}
      />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
        <ChatMessages
          messages={formattedMessages}
          isStreaming={chat.isStreaming}
          onCardAction={handleCardAction}
          onCardDismiss={handleCardDismiss}
        />
        <GenerationProgress
          active={chat.isStreaming}
          intent={chat.currentIntent}
          progressOverride={chat.generationProgress}
          messageOverride={chat.generationMessage}
        />

        <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-900/60 to-transparent pointer-events-none" />
      </div>

      <TrendWorkflowPanel
        open={trendWorkflowOpen}
        sessionId={sessionId}
        initialAuthoringRequest={selectedIdea.authoringRequest || null}
        onClose={() => setTrendWorkflowOpen(false)}
        onGenerate={handleGenerateFromTrend}
      />

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        onStop={() => {
          justStoppedStreamRef.current = true;
          chat.stopStreaming();
        }}
        disabled={!sessionId}
        isStreaming={chat.isStreaming || briefExtracting}
        suggestions={suggestions}
        editingSelection={editingSelection}
        onCancelEditSelection={handleCancelEditSelection}
        onOpenTrendWorkflow={() => setTrendWorkflowOpen(true)}
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
