"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

const LS_SESSION_PREFIX = "thinkforge_session_";

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

function saveLocal(sessionId: string, data: Partial<{ chat: ChatMessage[] }>) {
  try {
    const key = `${LS_SESSION_PREFIX}${sessionId}`;
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
  };
}

export function useThinkForgeChat(sessionId: string | null, initialMessages?: any[]) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Track previous sessionId to detect changes
  const prevSessionIdRef = useRef<string | null>(null);
  
  // Load initial messages
  useEffect(() => {
    // Detect session change
    const sessionChanged = prevSessionIdRef.current !== sessionId;
    prevSessionIdRef.current = sessionId;
    
    if (!sessionId) {
      setMessages([]);
      return;
    }

    // Clear messages when switching to a NEW session
    if (sessionChanged) {
      setMessages([]);
    }

    // Use initial messages if provided
    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
      const normalized = initialMessages.map(normalizeMessage);
      setMessages(normalized);
      saveLocal(sessionId, { chat: normalized } as any);
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=50&offset=0`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const items: any[] = Array.isArray(data?.items) ? data.items : [];
        const normalized = items.map(normalizeMessage);
        if (!cancelled) {
          setMessages(normalized);
          saveLocal(sessionId, { chat: normalized } as any);
        }
      } catch (error) {
        console.error('Failed to load chat messages:', error);
      }
    };

    loadMessages();
    return () => { cancelled = true; };
  }, [sessionId, initialMessages]);

  const sendMessage = useCallback(async (
    prompt: string,
    options?: {
      script?: any;
      project?: any;
      selection?: string;
      onScriptUpdate?: (script: any) => void;
    }
  ) => {
    if (!sessionId || !prompt.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'token') {
                assistantContent += data.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m
                ));
              } else if (data.type === 'script_update' && options?.onScriptUpdate) {
                // Handle script update with metadata
                // Backend sends: { type: 'script_update', script: {...}, metadata: {...} }
                const scriptData = {
                  ...(data.script || {}),
                  metadata: data.metadata || {},
                };
                options.onScriptUpdate(scriptData);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              } else if (data.type === 'done') {
                // Stream complete
              }
            } catch (e) {
              console.error('Error parsing SSE chunk:', e);
            }
          }
        }
      }

      // Finalize message
      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === assistantId ? { ...m, content: assistantContent, streaming: false } : m
        );
        // Save to local storage
        if (sessionId && assistantContent) {
          saveLocal(sessionId, { chat: updated } as any);
        }
        return updated;
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const errorMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '[Error fetching response]',
        timestamp: new Date(),
      };
      setMessages(prev => prev.map(m => m.id === assistantId ? errorMsg : m));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [sessionId, isStreaming]);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=100`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const normalized = items.map(normalizeMessage);
      setMessages(normalized);
      saveLocal(sessionId, { chat: normalized } as any);
    } catch (error) {
      console.error('Failed to refresh messages:', error);
    }
  }, [sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    if (sessionId) {
      saveLocal(sessionId, { chat: [] } as any);
    }
  }, [sessionId]);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    refreshMessages,
    clearMessages,
  } as const;
}

