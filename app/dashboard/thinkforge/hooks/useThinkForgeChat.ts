"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

const LS_CHAT_PREFIX = "thinkforge_chat_";

const isScriptIntent = (intent: string | null | undefined) =>
  intent === "draft" || intent === "edit" || intent === "hybrid";

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  selectionText?: string | null;
}

type ChatHookOptions = {
  onRemoteScriptUpdate?: (script: any) => void;
};

function saveLocal(sessionId: string, threadId: string, data: Partial<{ chat: ChatMessage[] }>) {
  try {
    const key = `${LS_CHAT_PREFIX}${sessionId}_${threadId}`;
    const prev = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...prev, ...data }));
  } catch {}
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

export function useThinkForgeChat(sessionId: string | null, threadId: string | null, initialMessages?: any[], options?: ChatHookOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // CRITICAL: Track cancellation state to ignore stale chunks
  const isCancelledRef = useRef<boolean>(false);
  const generationIdRef = useRef<string | null>(null);
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
      isCancelledRef.current = true;
      generationIdRef.current = null;
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
      isCancelledRef.current = true;
      generationIdRef.current = null;
      lastEventIdRef.current = null;
      setGenerationProgress(null);
      setGenerationMessage(null);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    }

    // Use initial messages if provided
    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
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
    // CRITICAL: Set cancellation flag FIRST to prevent processing stale chunks
    isCancelledRef.current = true;
    if (rafFlushRef.current) {
      cancelAnimationFrame(rafFlushRef.current);
      rafFlushRef.current = null;
    }
    const activeGenerationId = generationIdRef.current;
    const activeSessionId = sessionId;
    if (activeSessionId && activeGenerationId) {
      // Fire-and-forget stop request so backend halts generation
      void fetch('/api/services/thinkforge/generation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, generationId: activeGenerationId }),
        keepalive: true,
      }).catch(() => {});
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
      onScriptUpdate?: (script: any) => void;
      onTokenStream?: (tokens: string) => void; // Callback for streaming tokens
      onScriptCreated?: (scriptId: string) => void;
      intentContext?: {
        editorFocused?: boolean;
        hasSelection?: boolean;
        workspaceMode?: "script" | "whiteboard" | "unknown";
        lastUserAction?: string;
      };
    }
  ) => {
    console.log('[useThinkForgeChat.sendMessage] called', { sessionId, prompt: prompt.trim(), isStreaming });
    if (!sessionId || !threadId) {
      console.log('[useThinkForgeChat.sendMessage] No sessionId, returning');
      return;
    }
    if (!prompt.trim()) {
      console.log('[useThinkForgeChat.sendMessage] No prompt, returning');
      return;
    }
    if (isStreaming) {
      console.log('[useThinkForgeChat.sendMessage] Currently streaming, stopping...');
      // Cancel any stuck stream to allow new message
      stopStreaming();
    }

    // Stop any background polling while we start a new stream
    if (generationPollRef.current) {
      clearInterval(generationPollRef.current);
      generationPollRef.current = null;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
      selectionText: options?.selection || null,
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setCurrentIntent(null);
    intentRef.current = null;
    setGenerationProgress(null);
    setGenerationMessage(null);

    const assistantId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      // Reset cancellation state for new generation
      isCancelledRef.current = false;
      generationIdRef.current = generationId;
      
      const controller = new AbortController();
      abortRef.current = controller;

      console.log('[useThinkForgeChat.sendMessage] Making fetch request to /api/services/thinkforge/chat');
      const res = await fetch('/api/services/thinkforge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sessionId,
          script: options?.script,
          project: options?.project,
          selection: options?.selection,
          selectionBlocks: options?.selectionBlocks, // Include selection blocks for surgical editing
          selectionBlockIds: options?.selectionBlockIds,
          selectionRange: options?.selectionRange, // Include selection range for precise replacement
          scriptId: options?.scriptId,
          generationId,
          threadId,
          intentContext: options?.intentContext,
        }),
        signal: controller.signal,
      });

      console.log('[useThinkForgeChat.sendMessage] Fetch response received', { status: res.status, ok: res.ok });

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

      const scheduleFlush = () => {
        if (rafFlushRef.current) return;
        rafFlushRef.current = requestAnimationFrame(() => {
          rafFlushRef.current = null;
          if (isCancelledRef.current) return;
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: assistantContent, streaming: true } : m
          ));
          if (pendingDelta && options?.onTokenStream) {
            options.onTokenStream(pendingDelta);
          }
          pendingDelta = '';
        });
      };

      const applyEventPayload = (data: any, eventId?: number | null) => {
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
          if (options?.onScriptUpdate) {
            options.onScriptUpdate({ ...data.script, metadata: data.metadata || {} });
          }
          if (optionsRef.current?.onRemoteScriptUpdate) {
            optionsRef.current.onRemoteScriptUpdate({ ...data.script, metadata: data.metadata || {} });
          }
        } else if (data?.type === 'script_created') {
          if (options?.onScriptCreated && typeof data?.scriptId === 'string') {
            options.onScriptCreated(data.scriptId);
          }
        } else if (data?.type === 'done') {
          doneReceivedRef.current = true;
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
        } catch {
          return false;
        }
      };

      const fallbackResync = async () => {
        try {
          await refreshMessages();
        } catch {}
        if (optionsRef.current?.onRemoteScriptUpdate && sessionId && options?.scriptId) {
          try {
            const res = await fetch(`/api/services/thinkforge/script/blocks?sessionId=${encodeURIComponent(sessionId)}&scriptId=${encodeURIComponent(options.scriptId)}`, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              optionsRef.current.onRemoteScriptUpdate(data);
            }
          } catch {}
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (isCancelledRef.current) break;
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
        console.error('[useThinkForgeChat] Error reading stream:', readError);
      }

      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId ? { ...m, content: assistantContent || '[No response received]', streaming: false } : m
        );
        if (sessionId && threadId && assistantContent) {
          saveLocal(sessionId, threadId, { chat: updated } as any);
        }
        return updated;
      });

      if (!isCancelledRef.current && !doneReceivedRef.current) {
        const replayed = await replayEvents();
        if (!replayed) {
          await fallbackResync();
        }
      }
    } catch (e: any) {
      console.error('[useThinkForgeChat.sendMessage] Error caught:', e?.name, e?.message, e);
      if (e?.name === 'AbortError' || isCancelledRef.current) {
        // Stream was cancelled - mark message as stopped
        isCancelledRef.current = true;
        setMessages(prev => prev.map(m => 
          m.id === assistantId ? { ...m, streaming: false, content: m.content || '[Stopped]' } : m
        ));
        return;
      }
      const errorMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '[Error fetching response]',
        timestamp: new Date(),
      };
      setMessages(prev => prev.map(m => m.id === assistantId ? errorMsg : m));
    } finally {
      console.log('[useThinkForgeChat.sendMessage] finally block - cleaning up');
      setIsStreaming(false);
      abortRef.current = null;
      generationIdRef.current = null;
      intentRef.current = null;
      if (rafFlushRef.current) {
        cancelAnimationFrame(rafFlushRef.current);
        rafFlushRef.current = null;
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
    // Don't poll if we recently cancelled - let the new stream take over
    if (isCancelledRef.current) {
      console.log('[useThinkForgeChat.pollGenerationStatus] Skipping - cancelled state active');
      return;
    }
    try {
      const res = await fetch(`/api/services/thinkforge/generation/status?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const gen = data?.generation;
      
      // If no generation or it's been cleared, reset state
      if (!gen) {
        if (generationIdRef.current && !isCancelledRef.current) {
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
      if (lastGenerationKeyRef.current === key) return;
      lastGenerationKeyRef.current = key;

      // Don't update if we have a different active generation locally
      if (generationIdRef.current && generationIdRef.current !== gen.id) {
        console.log('[useThinkForgeChat.pollGenerationStatus] Ignoring stale generation', { local: generationIdRef.current, remote: gen.id });
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
        if (data.script && optionsRef.current?.onRemoteScriptUpdate) {
          optionsRef.current.onRemoteScriptUpdate(data.script);
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
      }
    } catch (error) {
      console.error('Failed to poll generation status:', error);
    }
  }, [sessionId, refreshMessages]);

  // Keep UI aligned with backend generation status (reconnect / reload resilience)
  useEffect(() => {
    if (!sessionId || !threadId) return;
    if (!isStreaming) {
      void pollGenerationStatus();
    }
    if (generationPollRef.current) {
      clearInterval(generationPollRef.current);
      generationPollRef.current = null;
    }

    // Only poll in the background when we are NOT streaming but a generation is active
    if (!generationIdRef.current || isStreaming) {
      return;
    }

    generationPollRef.current = setInterval(() => {
      if (!generationIdRef.current || isStreaming) return;
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

