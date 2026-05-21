"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Idea, Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeChat } from "@/app/dashboard/thinkforge/hooks/useThinkForgeChat";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatInput } from "./chat/ChatInput";
import { ChatHistoryPanel } from "./chat/ChatHistoryPanel";
import { GenerationProgress } from "./chat/GenerationProgress";
import { SidecarActions, type SidecarActionType } from "./chat/SidecarActions";
import { sanitizeServerScript } from "@/lib/thinkforge/json";
import type { ScriptModel } from "@/app/dashboard/thinkforge/hooks/useThinkForgeSession";
import type { SidecarCard, SidecarCardAction } from "@/lib/thinkforge/state/types";
import { toast } from "@/hooks/use-toast";
import { extractUrls } from "./PromptPanel";
import { logShadowEvent } from "@/lib/thinkforge/services/shadow-logger";
import { BlueprintCustomizer } from "./chat/BlueprintCustomizer";

interface ChatPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  scriptId?: string | null;
  isScriptLoading?: boolean;
  onApplyEdit: (updated: Script) => void;
  onRunEdit?: (instruction: string, selection?: string) => Promise<any>;
  sessionId?: string | null;
  initialMessages?: any[];
  onOpenSettings?: () => void;
  onOpenKnowledge?: () => void;
  onSwitchSession?: (sessionId: string) => Promise<void>;
  onScriptCreated?: (scriptId: string) => void;
  onGetSelection?: () => { blocks: any[]; blockIds: string[]; range: { from: number; to: number } | null } | null;
  editingSelection?: { text: string; range: { from: number; to: number }; blocks: any[] } | null;
  onCancelEditSelection?: () => void;
  onGenerationStateChange?: (state: { intent: string | null; isStreaming: boolean }) => void;
  workspaceMode?: 'script' | 'whiteboard';
}

// Context-aware suggestion pools
const EMPTY_SCRIPT_SUGGESTIONS = [
  "Write a quick 60-second draft for this idea",
  "Create a hook + outline to get me started",
  "Give me 3 scroll-stopping hooks",
  "Draft a content brief I can work from",
];

const HAS_SCRIPT_SUGGESTIONS = [
  "Make this punchier — cut the fluff",
  "Rewrite the opening hook to be more attention-grabbing",
  "Add a call-to-action at the end",
  "Change the tone to feel more conversational",
  "Shorten this to under 60 seconds",
  "Expand on the main point with more detail",
];

// Deliverable-style suggestions the AI shows proactively
const DELIVERABLE_SUGGESTIONS = [
  "📋 Generate a shot list for this script",
  "🎬 Create B-roll ideas to pair with this",
  "📝 Write social media captions for this content",
  "🔄 Create an alternative version of this script",
];

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
    return [...pick(HAS_SCRIPT_SUGGESTIONS, 2), ...pick(DELIVERABLE_SUGGESTIONS, 1)].slice(0, count);
  }
  return pick(hasScript ? HAS_SCRIPT_SUGGESTIONS : EMPTY_SCRIPT_SUGGESTIONS, count);
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
  const justStoppedStreamRef = React.useRef(false);
  const [sidecarLoading, setSidecarLoading] = useState<SidecarActionType | null>(null);
  const [customizingBlueprint, setCustomizingBlueprint] = useState<{
    messageId: string;
    cardId: string;
    artifacts: Array<{ type: string; label: string; description?: string; priority?: string }>;
  } | null>(null);

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

  // Initialize context-aware suggestions
  useEffect(() => {
    const hasContent = !!script?.content;
    setSuggestions(getContextualSuggestions(hasContent, chat.messages.length, 3, selectedIdea?.idea || ''));
  }, [!!script?.content, chat.messages.length, selectedIdea]);

  // Auto-starter: generate a draft ONLY for genuinely new projects (no saved script).
  // Ref tracks the latest script across re-renders so the timer reads fresh state.
  const autoStartFired = React.useRef(false);
  const scriptRef = React.useRef(script);
  scriptRef.current = script;

  useEffect(() => {
    if (autoStartFired.current) return;
    if (!sessionId) return;
    if (isScriptLoading) return;
    if (!selectedIdea?.idea) return;
    if (chat.messages.length > 0) return;
    if (chat.isStreaming) return;

    // Check content AND blocks — ThinkForge stores scripts as Tiptap blocks,
    // so content can be "" while blocks holds the actual data.
    const hasData = !!(script?.content || (Array.isArray(script?.blocks) && script.blocks.length > 0));
    if (hasData) return;

    // Wait long enough for the saved script to load from the server.
    // Vercel cold starts can take 2-3s, so 800ms was too short and caused
    // false auto-drafts on every project open. At fire time, re-read the
    // latest script from the ref (the closure captures the stale value).
    const timer = setTimeout(() => {
      if (autoStartFired.current) return;
      const latest = scriptRef.current;
      const latestHasData = !!(latest?.content || (Array.isArray(latest?.blocks) && latest.blocks.length > 0));
      if (latestHasData) return;

      autoStartFired.current = true;
      const format = selectedIdea.format || 'post';
      const platform = selectedIdea.platform || '';
      const formatIncludesPlatform = platform && format.toLowerCase().includes(platform.toLowerCase());
      const prefix = formatIncludesPlatform ? format : `${platform} ${format}`;
      const purposeLine = selectedIdea.purpose ? `\nPurpose: ${selectedIdea.purpose}` : '';
      const styleLine = selectedIdea.style ? `\nStyle: ${selectedIdea.style}` : '';
      const autoPrompt = `Write a ${prefix}: "${selectedIdea.idea}"${purposeLine}${styleLine}`;
      const currentScriptId = scriptIdRef.current || undefined;
      chat.sendMessage(autoPrompt, {
        script: scriptPayload,
        project: sessionPayload,
        onScriptUpdate: handleScriptUpdate,
        onTokenStream: onTokenStream,
        onScriptCreated: onScriptCreated,
        scriptId: currentScriptId,
        intentContext: {
          editorFocused: false,
          hasSelection: false,
          workspaceMode,
          lastUserAction: 'auto_start',
        },
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [sessionId, selectedIdea?.idea, isScriptLoading]);

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

    try {
      const res = await fetch('/api/services/thinkforge/refinery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, urls }),
      });

      if (!res.ok) throw new Error('Refinery request failed');
      const data = await res.json();
      const result = data.result;
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
    } catch (err) {
      console.error('[Refinery] Processing failed:', err);
      chat.appendMessage({
        id: `url-fail-${Date.now()}`,
        role: 'assistant',
        content: 'Could not analyze the links. Sending your message as-is.',
        timestamp: new Date(),
      });
    } finally {
      setBriefExtracting(false);
    }

    // Now send the prompt — the Databank has been populated, so
    // fetchContextSources will pick up the newly ingested facts.
    const textWithoutUrls = urls.reduce((text, url) => text.replace(url, '').trim(), originalPrompt);
    if (textWithoutUrls.length > 5) {
      sendChatMessage(originalPrompt);
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

  // ---------------------------------------------------------------------------
  // Sidecar Action Handler
  // ---------------------------------------------------------------------------
  const handleSidecarAction = useCallback(async (action: SidecarActionType) => {
    if (!sessionId || sidecarLoading) return;
    setSidecarLoading(action);

    try {
      let content = '';
      let specialistRequest = '';

      if (action === 'storyboard') {
        const selection = onGetSelection?.();
        if (!selection || selection.blocks.length === 0) {
          toast({ title: 'No selection', description: 'Select text in the editor to storyboard.' });
          return;
        }
        content = selection.blocks.map((b: any) => {
          if (b?.content && Array.isArray(b.content)) {
            return b.content.map((n: any) => n?.text || '').join('');
          }
          return b?.text || '';
        }).join('\n');
      } else if (action === 'refine_voice') {
        content = script?.content || '';
        if (!content.trim()) {
          toast({ title: 'No draft', description: 'Write something in the editor first.' });
          return;
        }
      } else if (action === 'deconstruct') {
        content = inputValue.trim() || script?.content || '';
        if (!content) {
          toast({ title: 'No content', description: 'Enter text or drop a link to deconstruct.' });
          return;
        }
        setInputValue('');
      } else if (action === 'summon_specialist') {
        specialistRequest = inputValue.trim();
        if (!specialistRequest) {
          toast({ title: 'Describe the specialist', description: 'Type what kind of expert you need (e.g., "VFX cost estimator").' });
          return;
        }
        setInputValue('');
      } else if (action === 'discover_blueprint') {
        content = selectedIdea?.idea || inputValue.trim() || '';
        if (!content) {
          toast({ title: 'No project description', description: 'Enter a project description first.' });
          return;
        }
      }

      const res = await fetch('/api/services/thinkforge/sidecar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sessionId,
          content,
          scriptId: scriptIdRef.current || undefined,
          specialistRequest,
          threadId: activeThreadId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Sidecar action failed');
      }

      const data = await res.json();

      if (data.card) {
        chat.appendMessage({
          id: `sidecar-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          card: data.card as SidecarCard,
        });
      }
    } catch (err: any) {
      console.error('[Sidecar] Action failed:', err);
      chat.appendMessage({
        id: `sidecar-error-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        card: {
          id: `err-${Date.now()}`,
          type: 'error',
          title: 'Action Failed',
          body: err?.message || 'Something went wrong. Please try again.',
          actions: [{ id: 'retry', label: 'Retry', variant: 'primary' }],
          dismissible: true,
          timestamp: Date.now(),
        } as SidecarCard,
      });
    } finally {
      setSidecarLoading(null);
    }
  }, [sessionId, sidecarLoading, inputValue, script, selectedIdea, onGetSelection, activeThreadId, chat]);

  const handleCardAction = useCallback(async (action: SidecarCardAction) => {
    if (action.id === 'open_tab' && action.payload?.scriptId && onScriptCreated) {
      onScriptCreated(action.payload.scriptId);
    } else if (action.id === 'retry') {
      toast({ title: 'Retry', description: 'Please try the action again.' });
    } else if (action.id === 'initialize_blueprint') {
      if (!sessionId || !action.payload?.artifacts) {
        toast({ title: 'Error', description: 'Missing blueprint data.', variant: 'destructive' });
        return;
      }
      const artifacts: Array<{ type: string; label: string; description?: string; priority?: string }> = action.payload.artifacts;

      setSidecarLoading('discover_blueprint' as SidecarActionType);

      await chat.sendMessage(
        `Initialize blueprint with ${artifacts.length} documents: ${artifacts.map(a => a.label).join(', ')}`,
        {
          blueprintArtifacts: artifacts,
          onScriptCreated: (scriptId: string) => {
            if (onScriptCreated) onScriptCreated(scriptId);
          },
        }
      );

      setSidecarLoading(null);
    } else if (action.id === 'customize_blueprint') {
      const artifacts = action.payload?.artifacts;
      const cardId = action.payload?.cardId;
      if (!artifacts || !cardId) return;
      const matchMsg = chat.messages.find(m => m.card?.id === cardId);
      if (!matchMsg) return;
      setCustomizingBlueprint({ messageId: matchMsg.id, cardId, artifacts });
    } else if (action.id === 'copy_hooks' || action.id === 'copy_shots') {
      toast({ title: 'Copied', description: 'Content copied to clipboard.' });
    }
  }, [onScriptCreated, sessionId, chat]);

  const handleCardDismiss = useCallback((cardId: string) => {
    // Cards are embedded in messages; dismissal is a no-op for now
  }, []);

  const hasEditorSelection = useMemo(() => {
    if (editingSelection) return true;
    return false;
  }, [editingSelection]);

  return (
    <div className="flex flex-col h-full bg-[#0F0F0E] animate-in fade-in-0 duration-300">
      <ChatHeader
        onOpenHistory={handleOpenHistory}
        onOpenSettings={onOpenSettings}
        onOpenKnowledge={onOpenKnowledge}
        onNewChat={handleNewChat}
      />

      {/* Sidecar Action Buttons */}
      <SidecarActions
        onAction={handleSidecarAction}
        disabled={!sessionId || chat.isStreaming}
        hasSelection={hasEditorSelection}
        hasScript={!!script?.content}
        hasContent={!!inputValue.trim() || !!script?.content}
        loading={sidecarLoading}
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

        {customizingBlueprint && (
          <div className="absolute inset-0 z-30 flex items-end p-3 bg-[#0B0B0A] backdrop-blur-sm">
            <BlueprintCustomizer
              artifacts={customizingBlueprint.artifacts}
              onSave={(updated) => {
                chat.updateMessageCard(
                  customizingBlueprint.messageId,
                  customizingBlueprint.cardId,
                  { data: { artifacts: updated } }
                );
                setCustomizingBlueprint(null);
                toast({ title: 'Blueprint Updated', description: `${updated.length} documents configured.` });
              }}
              onCancel={() => setCustomizingBlueprint(null)}
            />
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-neutral-900/60 to-transparent pointer-events-none" />
      </div>

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
