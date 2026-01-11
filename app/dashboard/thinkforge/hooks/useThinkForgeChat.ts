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
  const [currentIntent, setCurrentIntent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // CRITICAL: Track cancellation state to ignore stale chunks
  const isCancelledRef = useRef<boolean>(false);
  const generationIdRef = useRef<string | null>(null);

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
      selectionBlocks?: any[]; // Selected blocks from editor
      selectionRange?: { from: number; to: number }; // Selection range from editor
      onScriptUpdate?: (script: any) => void;
      onTokenStream?: (tokens: string) => void; // Callback for streaming tokens
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
    setCurrentIntent(null);

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
          selectionRange: options?.selectionRange, // Include selection range for precise replacement
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
      let buffer = ''; // Buffer for incomplete SSE messages
      let isScriptGeneration = false; // Track if this is script generation
      // Assume script generation if onTokenStream callback is provided
      // This allows streaming to start immediately, even before intent is received
      if (options?.onTokenStream) {
        isScriptGeneration = true;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // CRITICAL: Check if cancelled before processing chunks
        if (isCancelledRef.current || generationIdRef.current !== generationId) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process complete SSE messages (ending with \n\n)
        let lastIndex = 0;
        while (true) {
          // CRITICAL: Check cancellation again inside loop
          if (isCancelledRef.current || generationIdRef.current !== generationId) {
            break;
          }
          
          const messageEnd = buffer.indexOf('\n\n', lastIndex);
          if (messageEnd === -1) break; // No complete message found
          
          const message = buffer.slice(lastIndex, messageEnd);
          lastIndex = messageEnd + 2; // Skip \n\n
          
          if (message.startsWith('data: ')) {
            try {
              const jsonStr = message.slice(6);
              // Skip empty lines
              if (!jsonStr.trim()) continue;
              
              // Quick validation: check if JSON appears complete
              // (basic check - proper validation happens in JSON.parse)
              const trimmed = jsonStr.trim();
              if (trimmed.length > 0) {
                // Check if it starts and ends with valid JSON delimiters
                const startsValid = trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"');
                const endsValid = trimmed.endsWith('}') || trimmed.endsWith(']') || trimmed.endsWith('"') ||
                  trimmed.endsWith('true') || trimmed.endsWith('false') || trimmed.endsWith('null') ||
                  /^\d+$/.test(trimmed);
                
                // If it doesn't look complete, it might be split - skip for now
                if (startsValid && !endsValid && trimmed.length > 1000) {
                  // Large JSON that doesn't end properly - likely incomplete
                  continue;
                }
              }
              
              const data = JSON.parse(jsonStr);

              // CRITICAL: Ignore stale chunks after cancellation
              if (isCancelledRef.current || generationIdRef.current !== generationId) {
                break;
              }

              if (data.type === 'token') {
                assistantContent += data.content;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m
                ));
                // Stream tokens to callback if provided (stream immediately if callback exists)
                if (options?.onTokenStream && isScriptGeneration) {
                  options.onTokenStream(data.content);
                }
              } else if (data.type === 'intent') {
                setCurrentIntent(data.intent);
                // Update streaming flag based on intent
                isScriptGeneration = data.intent === 'SCRIPT_GENERATE' || data.intent === 'SCRIPT_EDIT';
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
            } catch (e: any) {
              // Only log if it's not an incomplete JSON error (which is expected for large payloads)
              if (e instanceof SyntaxError) {
                // Check if JSON appears incomplete (doesn't end with } or ])
                const trimmed = jsonStr.trim();
                const isIncomplete = trimmed.length > 0 && 
                  !trimmed.endsWith('}') && 
                  !trimmed.endsWith(']') && 
                  !trimmed.endsWith('"') &&
                  !trimmed.endsWith('true') &&
                  !trimmed.endsWith('false') &&
                  !trimmed.endsWith('null');
                
                if (isIncomplete) {
                  // This is expected - more data will arrive
                  continue;
                }
              }
              console.error('Error parsing SSE message:', e);
              // Log a sample of the problematic JSON for debugging (first 500 chars)
              if (message.length > 0) {
                const sample = message.slice(0, Math.min(500, message.length));
                console.error('Message sample:', sample);
                if (message.length > 500) {
                  console.error('... (truncated, total length:', message.length, ')');
                }
              }
            }
          }
        }
        
        // Keep remaining incomplete message in buffer
        buffer = buffer.slice(lastIndex);
      }
      
      // Process any remaining buffer (should be empty if stream ended properly)
      if (buffer.trim()) {
        if (buffer.startsWith('data: ')) {
          try {
            const jsonStr = buffer.slice(6);
            if (jsonStr.trim()) {
              const data = JSON.parse(jsonStr);
              
              if (data.type === 'script_update' && options?.onScriptUpdate) {
                const scriptData = {
                  ...(data.script || {}),
                  metadata: data.metadata || {},
                };
                options.onScriptUpdate(scriptData);
              }
            }
          } catch (e) {
            console.error('Error parsing final buffer:', e);
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
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [sessionId, isStreaming]);

  const stopStreaming = useCallback(() => {
    // CRITICAL: Set cancellation flag FIRST to prevent processing stale chunks
    isCancelledRef.current = true;
    generationIdRef.current = null;
    
    // CRITICAL: Abort the fetch request to stop backend processing
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    // Mark all streaming messages as stopped
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
    currentIntent,
    sendMessage,
    stopStreaming,
    refreshMessages,
    clearMessages,
  } as const;
}

