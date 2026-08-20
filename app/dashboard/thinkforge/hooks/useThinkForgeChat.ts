"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  resolveCompletedGenerationDelivery,
  resolveThinkForgeGenerationFailureMessage,
  shouldReconcileThinkForgeCompletedDocument,
  shouldProbeThinkForgeGeneration,
  shouldScheduleThinkForgeGenerationPolling,
} from "@/lib/thinkforge/client-generation-lifecycle";

const LS_CHAT_PREFIX = "thinkforge_chat_";

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  selectionText?: string | null;
  card?: import('@/lib/thinkforge/state/types').SidecarCard | null;
  thinking?: string;
}

type ChatHookOptions = {
  onRemoteScriptUpdate?: (script: any) => void;
  onScriptCreated?: (scriptId: string) => void;
  getActiveScriptId?: () => string | null;
};

function saveLocal(sessionId: string, threadId: string, data: Partial<{ chat: ChatMessage[] }>) {
  try {
    const key = `${LS_CHAT_PREFIX}${sessionId}_${threadId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data }));
  } catch (e) {
    console.warn('[useThinkForgeChat] saveLocal failed:', e);
  }
}

function normalizeMessage(m: any): ChatMessage {
  return {
    id: m._id || m.id || crypto.randomUUID(),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content || '',
    timestamp: m.timestamp ? new Date(m.timestamp) : (m.ts ? new Date(m.ts) : new Date(m.createdAt || Date.now())),
    streaming: m.streaming || false,
    selectionText: typeof m.selectionText === 'string' ? m.selectionText : null,
  };
}

type RemoteScriptUpdateContext = {
  sessionId?: string | null;
  scriptId?: string | null;
  generationId?: string | null;
  forceSource?: 'ai' | 'editor';
};

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeRemoteScriptUpdate(
  script: any,
  metadata?: Record<string, any> | null,
  fallbackWorkflow = 'create',
  context: RemoteScriptUpdateContext = {},
) {
  const mergedMetadata = {
    ...(script?.metadata && typeof script.metadata === 'object' ? script.metadata : {}),
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  };
  const remoteScriptId = toOptionalString(script?.scriptId) || toOptionalString(mergedMetadata.scriptId) || toOptionalString(context.scriptId);
  const remoteSessionId = toOptionalString(script?.sessionId) || toOptionalString(mergedMetadata.sessionId) || toOptionalString(context.sessionId);
  const remoteGenerationId = toOptionalString(mergedMetadata.generationId) || toOptionalString(context.generationId);

  return {
    ...script,
    ...(remoteScriptId ? { scriptId: remoteScriptId } : {}),
    ...(remoteSessionId ? { sessionId: remoteSessionId } : {}),
    metadata: {
      ...mergedMetadata,
      ...(remoteScriptId ? { scriptId: remoteScriptId } : {}),
      ...(remoteSessionId ? { sessionId: remoteSessionId } : {}),
      ...(remoteGenerationId ? { generationId: remoteGenerationId } : {}),
      workflow: toOptionalString(mergedMetadata.workflow) || fallbackWorkflow,
      source: context.forceSource || 'ai',
    },
  };
}


export function useThinkForgeChat(sessionId: string | null, threadId: string | null, initialMessages?: any[], options?: ChatHookOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef<string | null>(null);
  const activeStreamGenerationIdRef = useRef<string | null>(null);
  const cancelledGenerationIdRef = useRef<string | null>(null);
  const optionsRef = useRef<ChatHookOptions | undefined>(options);
  const generationPollRef = useRef<NodeJS.Timeout | null>(null);
  const lastGenerationKeyRef = useRef<string | null>(null);
  const intentRef = useRef<string | null>(null);
  const rafFlushRef = useRef<number | null>(null);
  const lastEventIdRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    lastGenerationKeyRef.current = null;
  }, [sessionId, threadId]);

  // Track previous sessionId to detect changes
  const prevSessionIdRef = useRef<string | null>(null);

  // Load initial messages
  useEffect(() => {
    // Detect session change
    const sessionChanged = prevSessionIdRef.current !== sessionId;
    prevSessionIdRef.current = sessionId;

    if (!sessionId || !threadId) {
      setMessages([]);
      setIsStreaming(false);
      setCurrentIntent(null);
      intentRef.current = null;
      generationIdRef.current = null;
      activeStreamGenerationIdRef.current = null;
      cancelledGenerationIdRef.current = null;
      lastEventIdRef.current = null;
      setGenerationProgress(null);
      setGenerationMessage(null);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }

    // Clear messages when switching to a NEW session
    if (sessionChanged) {
      setMessages([]);
      setIsStreaming(false);
      setCurrentIntent(null);
      intentRef.current = null;
      generationIdRef.current = null;
      activeStreamGenerationIdRef.current = null;
      cancelledGenerationIdRef.current = null;
      lastEventIdRef.current = null;
      setGenerationProgress(null);
      setGenerationMessage(null);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }

    // Use initial messages if provided
    if (Array.isArray(initialMessages)) {
      const normalized = initialMessages.map(normalizeMessage);
      setMessages(normalized);
      saveLocal(sessionId, threadId, { chat: normalized } as any);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&threadId=${encodeURIComponent(threadId)}&limit=50&offset=0`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const items: any[] = Array.isArray(data?.items) ? data.items : [];
        const normalized = items.map(normalizeMessage);
        if (!cancelled) {
          setMessages(normalized);
          saveLocal(sessionId, threadId, { chat: normalized } as any);
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error);
      }
    };

    loadMessages();
    return () => { cancelled = true; };
  }, [sessionId, threadId, initialMessages]);

  const stopStreaming = useCallback(() => {
    if (rafFlushRef.current) {
      cancelAnimationFrame(rafFlushRef.current);
      rafFlushRef.current = null;
    }
    const activeGenerationId = generationIdRef.current;
    cancelledGenerationIdRef.current = activeGenerationId;
    activeStreamGenerationIdRef.current = null;
    const activeSessionId = sessionId;
    if (activeSessionId && activeGenerationId) {
      // Fire-and-forget stop request so backend halts generation
      void fetch('/api/services/thinkforge/generation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, generationId: activeGenerationId }),
        keepalive: true,
      }).catch(() => { });
    }
    generationIdRef.current = null;
    setCurrentIntent(null);
    intentRef.current = null;

    // CRITICAL: Abort the fetch request to stop backend processing
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    // Mark all streaming messages as stopped
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, [sessionId]);

  const sendMessage = useCallback(async (
    prompt: string,
    options?: {
      script?: any;
      project?: any;
      selection?: string;
      selectionBlocks?: any[]; // Selected blocks from editor
      selectionBlockIds?: string[]; // Selected block IDs from editor
      selectionRange?: { from: number; to: number }; // Selection range from editor
      scriptId?: string; // Active script tab id
      onTokenStream?: (tokens: string) => void; // Callback for streaming tokens
      onScriptCreated?: (scriptId: string) => void;
      intentContext?: {
        editorFocused?: boolean;
        hasSelection?: boolean;
        workspaceMode?: "script" | "whiteboard" | "unknown";
        lastUserAction?: string;
      };
      /** Silent auto-starter draft: trigger generation without showing/persisting a user bubble. */
      silent?: boolean;
    }
  ) => {
    if (!sessionId || !threadId) {
      // STEP 7: Surface errors to UI instead of silent return
      console.error('[useThinkForgeChat.sendMessage] Missing sessionId or threadId - cannot send message');
      toast({
        title: 'Session not ready',
        description: 'Please wait for the session to initialize before sending messages.',
        variant: 'destructive',
      });
      return;
    }
    if (!prompt.trim()) {
      return;
    }
    if (isStreaming) {
      // Cancel any stuck stream to allow new message
      stopStreaming();
    }

    // Stop any background polling while we start a new stream
    if (generationPollRef.current) {
      clearInterval(generationPollRef.current);
      generationPollRef.current = null;
    }

    // Silent auto-starter: no visible user bubble (the server also skips persisting it).
    if (!options?.silent) {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
        timestamp: new Date(),
        selectionText: options?.selection || null,
      };
      setMessages(prev => [...prev, userMsg]);
    }
    setIsStreaming(true);
    setCurrentIntent(null);
    intentRef.current = null;
    setGenerationProgress(null);
    setGenerationMessage(null);

    const assistantId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    let resolvedScriptId = options?.scriptId;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);
    const ownsLiveStream = () => (
      activeStreamGenerationIdRef.current === generationId
      && cancelledGenerationIdRef.current !== generationId
    );

    try {
      cancelledGenerationIdRef.current = null;
      generationIdRef.current = generationId;
      activeStreamGenerationIdRef.current = generationId;

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/services/thinkforge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sessionId,
          script: options?.script,
          project: options?.project,
          selection: options?.selection,
          selectionBlocks: options?.selectionBlocks,
          selectionBlockIds: options?.selectionBlockIds,
          selectionRange: options?.selectionRange,
          scriptId: options?.scriptId,
          generationId,
          threadId,
          intentContext: options?.intentContext,
          silent: options?.silent,
        }),
        signal: controller.signal,
      });


      if (res.status === 429) {
        const errorMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: 'Chat limit reached for this session. Please wait for reset or upgrade your plan.',
          timestamp: new Date(),
        };
        setMessages(prev => prev.map(m => m.id === assistantId ? errorMsg : m));
        toast({
          title: 'Chat limit reached',
          description: 'Please wait until the limit resets or upgrade your plan.',
        });
        return;
      }

      if (!res.ok) throw new Error('Failed to start stream');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let pendingDelta = '';
      let buffer = '';

      const doneReceivedRef = { current: false } as { current: boolean };
      let receivedGeneratedDocumentEvent = false;

      const scheduleFlush = () => {
        if (rafFlushRef.current) return;
        rafFlushRef.current = requestAnimationFrame(() => {
          rafFlushRef.current = null;
          if (!ownsLiveStream()) return;
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: assistantContent, streaming: true } : m
          ));
          if (pendingDelta && options?.onTokenStream) {
            options.onTokenStream(pendingDelta);
          }
          pendingDelta = '';
        });
      };

      const finishWithServerFailure = (error: unknown) => {
        if (!ownsLiveStream()) return;

        const failureMessage = resolveThinkForgeGenerationFailureMessage(error);
        doneReceivedRef.current = true;
        assistantContent = failureMessage;
        pendingDelta = '';
        generationIdRef.current = null;
        setCurrentIntent(null);
        intentRef.current = null;
        setGenerationProgress(null);
        setGenerationMessage(null);
        if (rafFlushRef.current) {
          cancelAnimationFrame(rafFlushRef.current);
          rafFlushRef.current = null;
        }

        setMessages(prev => {
          const updated = prev.map(message => message.id === assistantId
            ? { ...message, content: failureMessage, streaming: false, thinking: undefined }
            : message);
          if (sessionId && threadId) {
            saveLocal(sessionId, threadId, { chat: updated });
          }
          return updated;
        });
        toast({
          title: 'Generation failed',
          description: failureMessage,
          variant: 'destructive',
        });

        activeStreamGenerationIdRef.current = null;
        setIsStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
          controller.abort();
        }
      };

      const applyEventPayload = (data: any, eventId?: number | null) => {
        if (!ownsLiveStream()) return;
        if (typeof eventId === 'number') {
          lastEventIdRef.current = eventId;
        } else if (typeof data?.eventId === 'number') {
          lastEventIdRef.current = data.eventId;
        }

        if (data?.type === 'token' && data.content) {
          assistantContent += data.content;
          pendingDelta += data.content;
          scheduleFlush();
        } else if (data?.type === 'intent') {
          setCurrentIntent(data.intent);
          intentRef.current = data.intent;
        } else if (data?.type === 'progress') {
          if (typeof data.progress === 'number') {
            setGenerationProgress(Math.round(Math.max(0, Math.min(1, data.progress)) * 100));
          }
          if (typeof data.message === 'string') {
            setGenerationMessage(data.message);
          }
        } else if (data?.type === 'script_update') {
          receivedGeneratedDocumentEvent = true;
          const remoteScript = normalizeRemoteScriptUpdate(data.script, data.metadata, data?.metadata?.workflow || 'create', {
            sessionId,
            scriptId: data?.script?.scriptId || data?.metadata?.scriptId || data?.scriptId,
            generationId: data?.metadata?.generationId || generationIdRef.current,
            forceSource: 'ai',
          });
          if (typeof remoteScript.scriptId === 'string') {
            resolvedScriptId = remoteScript.scriptId;
          }
          if (optionsRef.current?.onRemoteScriptUpdate) {
            optionsRef.current.onRemoteScriptUpdate(remoteScript);
          }
        } else if (data?.type === 'thinking') {
          if (data.content) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, thinking: data.content } : m
            ));
          }
        } else if (data?.type === 'script_created') {
          if (typeof data?.scriptId !== 'string') return;
          receivedGeneratedDocumentEvent = true;
          resolvedScriptId = data.scriptId;
          const notifyScriptCreated = options?.onScriptCreated || optionsRef.current?.onScriptCreated;
          notifyScriptCreated?.(data.scriptId);
        } else if (data?.type === 'error') {
          finishWithServerFailure(data?.error);
        } else if (data?.type === 'done') {
          doneReceivedRef.current = true;
          generationIdRef.current = null;
        }
      };

      const handleEvent = (event: string) => {
        const lines = event.split('\n');
        const idLine = lines.find((line) => line.startsWith('id:'));
        const eventId = idLine ? Number(idLine.replace(/^id:\s?/, '')) : null;
        const dataLines = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''));
        if (!dataLines.length) return;
        const payload = dataLines.join('\n');
        try {
          const data = JSON.parse(payload);
          applyEventPayload(data, Number.isFinite(eventId) ? eventId : null);
        } catch {
          // ignore malformed event
        }
      };

      const replayEvents = async (): Promise<boolean> => {
        if (!sessionId || !threadId || lastEventIdRef.current === null) return false;
        try {
          const res = await fetch(`/api/events?sessionId=${encodeURIComponent(sessionId)}&threadId=${encodeURIComponent(threadId)}&since=${encodeURIComponent(String(lastEventIdRef.current))}`, { cache: 'no-store' });
          if (!res.ok) return false;
          const data = await res.json();
          const events: any[] = Array.isArray(data?.events) ? data.events : [];
          events.forEach((evt) => {
            const payload = evt?.data ? { ...evt.data, type: evt.event } : { type: evt.event };
            applyEventPayload(payload, typeof evt?.id === 'number' ? evt.id : null);
          });
          return true;
        } catch (e) {
          console.warn('[useThinkForgeChat] Failed to parse SSE event:', e);
          return false;
        }
      };

      const reconcilePersistedDocument = async (): Promise<boolean> => {
        const recoveryScriptId = resolvedScriptId || options?.scriptId;
        if (!optionsRef.current?.onRemoteScriptUpdate || !sessionId || !recoveryScriptId) return false;

        try {
          const res = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=${encodeURIComponent(recoveryScriptId)}`, { cache: 'no-store' });
          if (!res.ok || !ownsLiveStream()) return false;
          const data = await res.json();
          if (!ownsLiveStream() || typeof data?.version !== 'number') return false;
          const fallbackWorkflow = intentRef.current === 'edit' ? 'edit' : 'create';
          optionsRef.current.onRemoteScriptUpdate(normalizeRemoteScriptUpdate(data, data?.metadata, fallbackWorkflow, {
            sessionId,
            scriptId: recoveryScriptId,
            generationId,
            forceSource: 'ai',
          }));
          return true;
        } catch (e) {
          console.error('[useThinkForgeChat] persisted document reconciliation failed:', e);
          return false;
        }
      };

      const fallbackResync = async (): Promise<boolean> => {
        try {
          await refreshMessages();
        } catch (e) {
          console.error('[useThinkForgeChat] fallbackResync refreshMessages failed:', e);
        }
        return reconcilePersistedDocument();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!ownsLiveStream()) break;
          buffer += decoder.decode(value, { stream: true });
          let idx = buffer.indexOf('\n\n');
          while (idx !== -1) {
            const event = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (event) handleEvent(event);
            idx = buffer.indexOf('\n\n');
          }
        }
      } catch (readError) {
        if (ownsLiveStream() && !(readError instanceof DOMException && readError.name === 'AbortError')) {
          console.error('[useThinkForgeChat] Error reading stream:', readError);
        }
      }

      if (ownsLiveStream()) setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId ? { ...m, content: assistantContent || '[No response received]', streaming: false } : m
        );
        if (sessionId && threadId && assistantContent) {
          saveLocal(sessionId, threadId, { chat: updated } as any);
        }
        return updated;
      });

      let reconciledPersistedDocument = false;
      if (ownsLiveStream() && !doneReceivedRef.current) {
        const replayed = await replayEvents();
        if (!replayed) {
          reconciledPersistedDocument = await fallbackResync();
        }
      }

      if (ownsLiveStream() && !reconciledPersistedDocument && shouldReconcileThinkForgeCompletedDocument({
        doneReceived: doneReceivedRef.current,
        hasDocumentEvent: receivedGeneratedDocumentEvent,
        scriptId: resolvedScriptId,
      })) {
        reconciledPersistedDocument = await reconcilePersistedDocument();
        if (!reconciledPersistedDocument && ownsLiveStream()) {
          toast({
            title: 'Saved draft could not be loaded',
            description: 'The generation completed, but its saved document is not available yet. Please reopen the session before trying again.',
            variant: 'destructive',
          });
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || !ownsLiveStream()) {
        return;
      }
      console.error('[useThinkForgeChat.sendMessage] Error caught:', e?.name, e?.message, e);
      const errorMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: resolveThinkForgeGenerationFailureMessage(e?.message),
        timestamp: new Date(),
      };
      setMessages(prev => prev.map(m => m.id === assistantId ? errorMsg : m));
    } finally {
      if (activeStreamGenerationIdRef.current === generationId) {
        activeStreamGenerationIdRef.current = null;
        setIsStreaming(false);
        abortRef.current = null;
        intentRef.current = null;
        if (rafFlushRef.current) {
          cancelAnimationFrame(rafFlushRef.current);
          rafFlushRef.current = null;
        }
      }
    }
  }, [sessionId, threadId, isStreaming, stopStreaming]);

  const refreshMessages = useCallback(async () => {
    if (!sessionId || !threadId) return;
    try {
      const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&threadId=${encodeURIComponent(threadId)}&limit=100`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const normalized = items.map(normalizeMessage);
      setMessages(normalized);
      saveLocal(sessionId, threadId, { chat: normalized } as any);
    } catch (error) {
      console.error('Failed to refresh messages:', error);
    }
  }, [sessionId, threadId]);

  const pollGenerationStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/services/thinkforge/generation/status?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const gen = data?.generation;

      // If no generation or it's been cleared, reset state
      if (!gen) {
        if (generationIdRef.current) {
          // Generation was cleared server-side
          generationIdRef.current = null;
          setIsStreaming(false);
          setCurrentIntent(null);
          intentRef.current = null;
          setGenerationProgress(null);
          setGenerationMessage(null);
        }
        return;
      }

      const key = `${gen.id}:${gen.status}`;
      if (cancelledGenerationIdRef.current === gen.id) {
        if (gen.status !== 'running') {
          cancelledGenerationIdRef.current = null;
        }
        return;
      }

      if (lastGenerationKeyRef.current === key) return;
      lastGenerationKeyRef.current = key;

      // Don't update if we have a different active generation locally
      if (generationIdRef.current && generationIdRef.current !== gen.id) {
        return;
      }

      generationIdRef.current = gen.id;

      if (gen.status === 'running') {
        setIsStreaming(true);
        const mappedIntent = gen.type === 'script_generate'
          ? 'draft'
          : gen.type === 'script_edit'
            ? 'edit'
            : (gen.intent || null);
        setCurrentIntent(mappedIntent || null);
        intentRef.current = mappedIntent || null;
        const normalizedProgress = typeof gen.progress === 'number'
          ? Math.round(Math.max(0, Math.min(1, gen.progress)) * 100)
          : null;
        setGenerationProgress(normalizedProgress);
        setGenerationMessage(gen.message ?? null);
      } else if (gen.status === 'completed') {
        generationIdRef.current = null;
        setIsStreaming(false);
        setCurrentIntent(null);
        intentRef.current = null;
        setGenerationProgress(null);
        setGenerationMessage(null);
        const completedScriptId = gen.scriptId || data.script?.scriptId;
        const delivery = resolveCompletedGenerationDelivery({
          activeScriptId: optionsRef.current?.getActiveScriptId?.(),
          completedScriptId,
          hasScriptPayload: Boolean(data.script),
        });

        if (delivery.type === 'switch_document') {
          optionsRef.current?.onScriptCreated?.(delivery.scriptId);
        } else if (delivery.type === 'apply_current_document' && optionsRef.current?.onRemoteScriptUpdate) {
          const fallbackWorkflow = gen.type === 'script_edit' ? 'edit' : 'create';
          optionsRef.current.onRemoteScriptUpdate(normalizeRemoteScriptUpdate(data.script, data.script?.metadata, fallbackWorkflow, {
            sessionId,
            scriptId: completedScriptId,
            generationId: gen.id,
            forceSource: 'ai',
          }));
        } else if (delivery.type === 'missing_document') {
          toast({
            title: 'Generated document unavailable',
            description: 'Generation completed, but the saved document could not be loaded. Please retry.',
            variant: 'destructive',
          });
        }
        await refreshMessages();
      } else if (gen.status === 'cancelled') {
        generationIdRef.current = null;
        setIsStreaming(false);
        setCurrentIntent(null);
        intentRef.current = null;
        setGenerationProgress(null);
        setGenerationMessage(null);
        setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
      } else if (gen.status === 'failed') {
        generationIdRef.current = null;
        setIsStreaming(false);
        setCurrentIntent(null);
        intentRef.current = null;
        setGenerationProgress(null);
        setGenerationMessage(null);

        const failureId = `generation-failed:${gen.id}`;
        const failureMessage = resolveThinkForgeGenerationFailureMessage(gen.message);
        const generationLabel = gen.type === 'script_edit' ? 'script revision' : 'script';

        setMessages(prev => {
          if (prev.some(message => message.id === failureId)) return prev;
          const next = [
            ...prev,
            {
              id: failureId,
              role: 'assistant' as const,
              content: `Unable to complete the ${generationLabel}. ${failureMessage}`,
              timestamp: new Date(),
              streaming: false,
            },
          ];
          if (sessionId && threadId) {
            saveLocal(sessionId, threadId, { chat: next } as any);
          }
          return next;
        });
        toast({
          title: 'Generation failed',
          description: failureMessage,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to poll generation status:', error);
    }
  }, [sessionId, refreshMessages]);

  // Keep UI aligned with backend generation status (reconnect / reload resilience).
  // `isStreaming` is UI state; only an owned SSE generation suppresses polling.
  useEffect(() => {
    const hasLiveStream = activeStreamGenerationIdRef.current !== null;
    const pollingInput = {
      hasSession: Boolean(sessionId),
      hasThread: Boolean(threadId),
      hasLiveStream,
      generationId: generationIdRef.current,
    };

    if (generationPollRef.current) {
      clearInterval(generationPollRef.current);
      generationPollRef.current = null;
    }

    if (shouldProbeThinkForgeGeneration(pollingInput)) {
      void pollGenerationStatus();
    }

    if (!shouldScheduleThinkForgeGenerationPolling(pollingInput)) return;

    generationPollRef.current = setInterval(() => {
      const intervalInput = {
        hasSession: Boolean(sessionId),
        hasThread: Boolean(threadId),
        hasLiveStream: activeStreamGenerationIdRef.current !== null,
        generationId: generationIdRef.current,
      };
      if (!shouldScheduleThinkForgeGenerationPolling(intervalInput)) return;
      void pollGenerationStatus();
    }, 5000);

    return () => {
      if (generationPollRef.current) {
        clearInterval(generationPollRef.current);
        generationPollRef.current = null;
      }
    };
  }, [sessionId, threadId, pollGenerationStatus, isStreaming]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    if (sessionId && threadId) {
      saveLocal(sessionId, threadId, { chat: [] } as any);
    }
  }, [sessionId, threadId]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      const next = [...prev, message];
      if (sessionId && threadId) {
        saveLocal(sessionId, threadId, { chat: next } as any);
      }
      return next;
    });
  }, [sessionId, threadId]);

  return {
    messages,
    isStreaming,
    currentIntent,
    generationProgress,
    generationMessage,
    sendMessage,
    stopStreaming,
    refreshMessages,
    clearMessages,
    appendMessage,
  } as const;
}

