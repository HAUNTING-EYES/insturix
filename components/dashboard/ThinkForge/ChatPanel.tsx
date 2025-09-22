"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Bot, Square, Pencil, X, Check } from 'lucide-react';
import { Idea, Script } from '@/app/dashboard/thinkforge/types';
import { toast } from '@/hooks/use-toast';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; ts: number; streaming?: boolean }

interface ChatPanelProps {
  selectedIdea: Idea;
  script: Script | null;
  onApplyEdit: (updated: Script) => void;
  onRunEdit?: (instruction: string, selection?: string) => Promise<any>;
  sessionId?: string | null;
  // Seed messages from hydrate to avoid empty chat while list loads
  initialMessages?: any[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ selectedIdea, script, onApplyEdit, onRunEdit, sessionId, initialMessages }) => {
  // Use internal API route proxy; no secret exposed client-side
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState<'ask'|'edit'>('ask');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typingRef = useRef<{ queue: string[]; timer: any; active: boolean; mode: 'char' | 'word'; delayMs: number; batchChars: number }>({ queue: [], timer: null, active: false, mode: 'char', delayMs: 7, batchChars: 2 });
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [stickToBottom, setStickToBottom] = useState(true);
  // Pagination state
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  // Minimal HTML composer for export/preview fallbacks only (favor blocks elsewhere)
  const composeHtml = useCallback((title: string, content: string, existingHtml?: string): string => {
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (existingHtml && existingHtml.trim()) return existingHtml;
    const head = `<h1>${escapeHtml(title || 'Untitled')}</h1>`;
    if (!content || !content.trim()) return head;
    const paras = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return [head, ...paras.map(p => `<p>${escapeHtml(p)}</p>`)].join('\n');
  }, []);

  // Initial load: use provided initialMessages if available, else fetch last 10 chats
  useEffect(() => {
    let cancelled = false;
    const mapItems = (items: any[]): ChatMessage[] => items.map((m: any) => ({ id: m._id || m.id || crypto.randomUUID(), role: (m.role === 'assistant' ? 'assistant' : 'user'), content: m.content || '', ts: m.ts || Date.parse(m.createdAt || '') || Date.now() }));
    const loadInitial = async () => {
      if (!sessionId) {
        // Fallback greeting if no session yet
        if (chatMessages.length === 0 && selectedIdea) {
          setChatMessages([{ id: 'greet', role: 'assistant', content: `Let's refine your idea: "${selectedIdea.idea}". Ask for expansions, rewrites, hooks, or structure—I'm ready.`, ts: Date.now() }]);
          seedSuggestions();
        }
        return;
      }
      // Reset pagination state when session changes
      setLoadedCount(0);
      setTotalCount(null);
      setChatMessages([]);
      // Prefer initial messages if provided
      if (Array.isArray(initialMessages)) {
        const mapped = mapItems(initialMessages);
        if (cancelled) return;
        setChatMessages(mapped);
        setLoadedCount(mapped.length);
        setTotalCount(mapped.length);
        if (mapped.length === 0 && selectedIdea) seedSuggestions();
        return;
      }
      try {
        const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=10&offset=0`, { cache: 'no-store' });
        if (!res.ok) throw new Error('chat list failed');
        const data = await res.json();
        if (cancelled) return;
        const items: any[] = Array.isArray(data?.items) ? data.items : [];
        const total: number = typeof data?.total === 'number' ? data.total : items.length;
        const mapped: ChatMessage[] = mapItems(items);
        setChatMessages(mapped);
        setLoadedCount(mapped.length);
        setTotalCount(total);
        if (mapped.length === 0 && selectedIdea) seedSuggestions();
      } catch {
        // ignore; fallback greeting below if empty
        if (chatMessages.length === 0 && selectedIdea) {
          setChatMessages([{ id: 'greet', role: 'assistant', content: `Let's refine your idea: "${selectedIdea.idea}". Ask for expansions, rewrites, hooks, or structure—I'm ready.`, ts: Date.now() }]);
          seedSuggestions();
        }
      }
    };
    void loadInitial();
    return () => { cancelled = true; };
  }, [sessionId, selectedIdea?.idea, initialMessages]);

  // Receive selection from ScriptEditor and prefill chat input for edit
  useEffect(() => {
    const handler = (e: any) => {
      const text = (e?.detail?.text || '').toString();
      if (!text) return;
      setPendingSelection(text);
      const template = `Selected:
---
${text}
---
Describe the change you want:`;
      setChatMode('edit');
      setChatInput(template);
      // focus textarea if possible
      setTimeout(() => {
        const el = document.querySelector('textarea[placeholder*="Describe the edit"], textarea') as HTMLTextAreaElement | null;
        el?.focus();
        el?.setSelectionRange(template.length, template.length);
      }, 0);
    };
    window.addEventListener('tf-selection-to-chat' as any, handler);
    return () => window.removeEventListener('tf-selection-to-chat' as any, handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // If click is inside any open menu, ignore
      if (modeMenuRef.current && modeMenuRef.current.contains(target)) return;
      // Outside clicks for mode menu
      if (showModeMenu && modeBtnRef.current && !modeBtnRef.current.contains(target)) setShowModeMenu(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showModeMenu]);

  useEffect(() => {
    if (stickToBottom && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, stickToBottom]);

  const handleScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const threshold = 64; // px tolerance from bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    setStickToBottom(atBottom);
    // Load older when near top
    if (el.scrollTop <= 16 && !isFetchingMore) {
      void fetchMoreOlder();
    }
  };

  const fetchMoreOlder = useCallback(async () => {
    if (!sessionId) return;
    if (totalCount !== null && loadedCount >= totalCount) return;
    setIsFetchingMore(true);
    try {
      const res = await fetch(`/api/services/thinkforge/chat/list?sessionId=${encodeURIComponent(sessionId)}&limit=10&offset=${loadedCount}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('more failed');
      const data = await res.json();
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const mapped: ChatMessage[] = items.map((m: any) => ({ id: m._id || m.id || crypto.randomUUID(), role: (m.role === 'assistant' ? 'assistant' : 'user'), content: m.content || '', ts: m.ts || Date.parse(m.createdAt || '') || Date.now() }));
      if (mapped.length > 0) {
        // Preserve scroll position while prepending
        const el = chatScrollRef.current;
        const prevHeight = el?.scrollHeight || 0;
        setChatMessages(prev => [...mapped, ...prev]);
        setLoadedCount(prev => prev + mapped.length);
        setTotalCount(typeof data?.total === 'number' ? data.total : totalCount);
        // Restore scroll position after DOM updates
        setTimeout(() => {
          const newHeight = el?.scrollHeight || 0;
          if (el) el.scrollTop = (newHeight - prevHeight) + (el.scrollTop || 0);
        }, 0);
      }
    } catch {
      // ignore
    } finally {
      setIsFetchingMore(false);
    }
  }, [sessionId, loadedCount, totalCount]);

  const flushQueueInstant = (assistantId: string) => {
    if (typingRef.current.queue.length === 0) return;
    const remainder = typingRef.current.queue.join('');
    typingRef.current.queue = [];
    setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + remainder } : m));
  };

  const stopStreaming = useCallback(() => {
    if (!isStreaming || !streamingAssistantId) return;
    abortRef.current?.abort();
    if (typingRef.current.timer) clearTimeout(typingRef.current.timer);
    typingRef.current.active = false;
    flushQueueInstant(streamingAssistantId);
    setIsStreaming(false);
    // mark the assistant message as no longer streaming and append an ellipsis
    setChatMessages(prev => prev.map(m => m.id === streamingAssistantId ? { ...m, content: m.content + ' …', streaming: false } : m));
    setStreamingAssistantId(null);
  }, [isStreaming, streamingAssistantId]);

  // Enrich vague instructions (e.g., "write the script") with the selected idea and meta so the backend stays on-topic
  const buildInstructionWithContext = useCallback((raw: string) => {
    const text = (raw || '').trim();
    if (!selectedIdea) return text;
    const low = text.toLowerCase();
    const vague = /(write( the)? script|generate( the)? script|create( the)? script|draft( the)? script|write it|make the script)/i.test(low) || text.length < 30;
    const alreadyHas = /\bcontext:\b/i.test(text) || /\bidea:\b/i.test(text);
    if (!vague || alreadyHas) return text;
    const bits: string[] = [];
    if (selectedIdea.idea) bits.push(`- Idea: ${selectedIdea.idea}`);
    const platform = (selectedIdea as any)?.platform; if (platform) bits.push(`- Platform: ${platform}`);
    const tone = selectedIdea.tone; if (tone) bits.push(`- Tone: ${tone}`);
    const style = (selectedIdea as any)?.style; if (style) bits.push(`- Style: ${style}`);
    const format = (selectedIdea as any)?.format; if (format) bits.push(`- Format: ${format}`);
    const purpose = (selectedIdea as any)?.purpose; if (purpose) bits.push(`- Purpose: ${purpose}`);
    if (bits.length === 0) return text;
    return `${text}\n\nContext:\n${bits.join('\n')}`;
  }, [selectedIdea]);

  const startTypingLoop = (assistantId: string) => {
    if (typingRef.current.active) return;
    typingRef.current.active = true;
    const step = () => {
      if (typingRef.current.queue.length === 0) {
        typingRef.current.active = false;
        return;
      }
      if (typingRef.current.mode === 'char') {
        const n = Math.max(1, typingRef.current.batchChars || 1);
        const batch = typingRef.current.queue.splice(0, n).join('');
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + batch } : m));
      } else {
        // word mode: dequeue one token (word or whitespace) at a time
        const token = typingRef.current.queue.shift() || '';
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m));
      }
      const delay = Math.max(0, typingRef.current.delayMs || 0);
      typingRef.current.timer = setTimeout(step, delay);
    };
    step();
  };

  // Include sessionId in dependency array so a newly created session is respected for persistence
  const streamAssistantForPrompt = useCallback(async (prompt: string, userMsg: ChatMessage, opts?: { appendUser?: boolean; skipPersistUser?: boolean }) => {
    const assistantId = crypto.randomUUID();
    if (opts?.appendUser !== false) {
      setChatMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }]);
    } else {
      // Only append assistant placeholder; user already placed in UI
      setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }]);
    }
    setIsStreaming(true);
    setStreamingAssistantId(assistantId);
  typingRef.current.queue = [];
  typingRef.current.active = false;
  if (typingRef.current.timer) clearTimeout(typingRef.current.timer);
  typingRef.current.mode = 'char';
  typingRef.current.delayMs = 7;
  typingRef.current.batchChars = 2;
    // Accumulate assistant content so we can persist it even if backend fails to
    let assistantAccum = '';
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/services/thinkforge/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId, skipPersistUser: opts?.skipPersistUser === true }),
        signal: controller.signal
      });
      if (res.status === 429) {
        // Rate limited: surface toast and stop
        try { const data = await res.json(); } catch {}
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Chat limit reached for this session. Please wait for reset or upgrade your plan.', streaming: false } : m));
        setIsStreaming(false);
        setStreamingAssistantId(null);
        toast({ title: 'Chat limit reached', description: 'Please wait until the limit resets or upgrade your plan.', icon: <Bot className="h-4 w-4" /> });
        return;
      }
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          assistantAccum += chunk;
          const chars = chunk.replace(/\r\n/g, '\n').split('');
          typingRef.current.queue.push(...chars);
          startTypingLoop(assistantId);
        }
      }
      // flush any remaining decoder buffer
      const tail = decoder.decode();
      if (tail) {
        assistantAccum += tail;
        const chars2 = tail.replace(/\r\n/g, '\n').split('');
        typingRef.current.queue.push(...chars2);
      }
      flushQueueInstant(assistantId);
      setIsStreaming(false);
      setStreamingAssistantId(null);
      // Best-effort persistence of assistant message to chat history
      try {
        const content = assistantAccum.trim();
        if (sessionId && content) {
          void fetch('/api/services/thinkforge/chat/append', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, role: 'assistant', content, meta: { source: 'fe-ask' } })
          });
        }
      } catch {}
    } catch (e:any) {
      if (e?.name === 'AbortError') return;
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '[Error fetching response]' } : m));
      setIsStreaming(false);
      setStreamingAssistantId(null);
    }
  }, [sessionId]);

  const sendChat = useCallback(async () => {
    // Do not allow sending until a valid session exists
    if (!sessionId) return;
    const text = chatInput.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() };
    setChatInput('');
    // If in edit mode, run inspector -> editor and update script instead of streaming chat
    if (chatMode === 'edit') {
      // Echo user's instruction into chat first
      setChatMessages(prev => [...prev, userMsg]);
      try {
        let assistantText = '';
        if (onRunEdit) {
          // Show a non-thinker placeholder bubble while applying the edit
          const thinkingId = crypto.randomUUID();
          setChatMessages(prev => [...prev, { id: thinkingId, role: 'assistant', content: 'Working…', ts: Date.now(), streaming: true }]);
          // Don't stream thinker; we keep a simple placeholder until summary phase
          setIsStreaming(true);
          setStreamingAssistantId(thinkingId);
          const scriptPayload = {
            title: script?.title || 'Untitled Script',
            content: script?.content || ''
          };
          const projectPayload = {
            idea: selectedIdea?.idea,
            purpose: (selectedIdea as any)?.purpose,
            style: (selectedIdea as any)?.style,
            format: (selectedIdea as any)?.format,
            platform: (selectedIdea as any)?.platform,
            tone: selectedIdea?.tone
          };
          // If a selection was sent from the editor, keep it in the instruction context
          const enrichedRunEdit = pendingSelection ? `Apply this change ONLY to the selected text:
Selected:
---
${pendingSelection}
---
Change:
${text.replace(/^[\s\S]*?---\s*$/m, '').trim() || text}` : buildInstructionWithContext(text);
          // Immediately proceed to run the edit; placeholder ensures the user sees progress

          // Run the actual edit via provided handler and use its returned data to apply immediately
          try {
            const result = await onRunEdit(enrichedRunEdit, pendingSelection || undefined);
            if (result && typeof onApplyEdit === 'function') {
              const newTitle: string = result?.title || script?.title || 'Untitled Script';
              const newContent: string = result?.content || script?.content || '';
              const htmlBody = composeHtml(newTitle, newContent, result?.html);
              // Prefer server-returned blocks directly
              onApplyEdit({ ...(script || {}), title: newTitle, content: newContent, body: htmlBody, blocks: result?.blocks || undefined } as any);
              setPendingSelection(null);
            }
          } catch {}
          // Start summary streaming into the same bubble
          setIsStreaming(true);
          setStreamingAssistantId(thinkingId);
          const summaryController = new AbortController();
          abortRef.current = summaryController;
          let finalSummary = '';
          try {
            const res = await fetch('/api/services/thinkforge/think/summary', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instruction: enrichedRunEdit,
                scriptBefore: { title: script?.title || 'Untitled Script', content: script?.content || '' },
                scriptAfter: null,
                project: { idea: selectedIdea?.idea, platform: (selectedIdea as any)?.platform, tone: selectedIdea?.tone, style: (selectedIdea as any)?.style, format: (selectedIdea as any)?.format, purpose: (selectedIdea as any)?.purpose },
                sessionId
              }),
              signal: summaryController.signal
            });
            if (res.ok && res.body) {
              const reader = res.body.getReader();
              const decoder = new TextDecoder('utf-8');
              let done = false; let leftover = ''; let acc = '';
              // Replace bubble content to start with Summary and configure word streaming
              setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: 'Summary: ', streaming: true } : m));
              typingRef.current.queue = [];
              typingRef.current.active = false;
              if (typingRef.current.timer) clearTimeout(typingRef.current.timer);
              typingRef.current.mode = 'word';
              typingRef.current.delayMs = 35;
              while (!done) {
                const { value, done: d } = await reader.read();
                done = d;
                if (value) {
                  const raw = decoder.decode(value, { stream: true });
                  acc += raw;
                  const textChunk = leftover + raw;
                  let tokens = textChunk.split(/(\s+)/);
                  const last = tokens[tokens.length - 1];
                  if (last && !/\s+/.test(last)) {
                    leftover = tokens.pop() as string;
                  } else {
                    leftover = '';
                  }
                  tokens = tokens.filter(t => t.length > 0);
                  if (tokens.length) {
                    typingRef.current.queue.push(...tokens);
                    startTypingLoop(thinkingId);
                  }
                }
              }
              const tail = decoder.decode();
              if (tail || leftover) {
                acc += (tail || '') + (leftover || '');
                const finalTokens = ((leftover || '') + (tail || '')).split(/(\s+)/).filter(t => t.length > 0);
                if (finalTokens.length) {
                  typingRef.current.queue.push(...finalTokens);
                  startTypingLoop(thinkingId);
                }
              }
              // mark bubble as done
              setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, streaming: false } : m));
              finalSummary = acc.trim();
            } else {
              // Fallback concise summary from instruction
              const concise = text.length > 200 ? text.slice(0, 200) + '…' : text;
              finalSummary = `Applied edit: ${concise}`;
              setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: finalSummary, streaming: false } : m));
            }
          } catch (err:any) {
            if (err?.name !== 'AbortError') {
              const concise = text.length > 200 ? text.slice(0, 200) + '…' : text;
              finalSummary = `Applied edit: ${concise}`;
              setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: finalSummary, streaming: false } : m));
            }
          } finally {
            setIsStreaming(false);
            setStreamingAssistantId(null);
          }
          // Persist both messages if sessionId available
          if (sessionId) {
            void fetch('/api/services/thinkforge/chat/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'user', content: text }) });
            if (finalSummary) {
              void fetch('/api/services/thinkforge/chat/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'assistant', content: 'Summary: ' + finalSummary }) });
            }
          }
          return;
        }
        // Fallback local-only edit flow (legacy)
        // Prepare payloads from current script and selected idea
        const scriptPayload = {
          title: script?.title || 'Untitled Script',
          content: script?.content || '',
          // Include blocks so server can resolve indices when selection provided
          blocks: (script as any)?.blocks || undefined,
        } as any;
        const projectPayload = {
          idea: selectedIdea?.idea,
          purpose: (selectedIdea as any)?.purpose,
          style: (selectedIdea as any)?.style,
          format: (selectedIdea as any)?.format,
          platform: (selectedIdea as any)?.platform,
          tone: selectedIdea?.tone
        };
        // 1) Show a working placeholder while we inspect and edit
        let thinkingId = crypto.randomUUID();
        setChatMessages(prev => [...prev, { id: thinkingId, role: 'assistant', content: 'Working…', ts: Date.now(), streaming: true }]);
        const enrichedLocal = buildInstructionWithContext(text);

        // 2) Inspect the request to confirm it's an edit
        const inspectRes = await fetch('/api/services/thinkforge/script/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: pendingSelection ? `Edit the selection only.\nSelection:\n${pendingSelection}\nInstruction:\n${text}` : enrichedLocal,
            script: scriptPayload, project: projectPayload, sessionId
          })
        });
        if (!inspectRes.ok) throw new Error(`inspect ${inspectRes.status}`);
        const inspect = await inspectRes.json();
        if (inspect?.action !== 'edit') {
          assistantText = 'That looks like a question, not an edit. Use Ask mode for Q&A. I did not change the script.';
          // transform thinking bubble into answer guidance, remove blinker
          setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: assistantText, streaming: false } : m));
          return;
        }
        // 3) Apply the edit using block-targeted endpoint
        const editRes = await fetch('/api/services/thinkforge/script/edit-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: pendingSelection ? `Replace only the selected text with your improved version.\nSelected:\n${pendingSelection}\nChange:\n${text}` : enrichedLocal,
            script: scriptPayload, project: projectPayload, sessionId, selection: pendingSelection || undefined
          })
        });
        if (!editRes.ok) throw new Error(`edit ${editRes.status}`);
        const edited = await editRes.json();
        const newTitle: string = edited?.title || scriptPayload.title;
        let appliedAfterContent: string = scriptPayload.content || '';
        const serverBlocks: any[] | undefined = Array.isArray(edited?.blocks) ? edited.blocks : undefined;
        // Prefer applying server-returned blocks directly
        if (serverBlocks && serverBlocks.length > 0) {
          const combinedContent: string = (edited?.content || scriptPayload.content || '').toString();
          const htmlBody = composeHtml(newTitle, combinedContent, edited?.html);
          onApplyEdit({ ...(script || {}), title: newTitle, content: combinedContent, body: htmlBody, blocks: serverBlocks } as any);
          appliedAfterContent = combinedContent;
        } else {
          // Fallback to content replacement
          const newContent: string = (edited?.content || scriptPayload.content || '').toString();
          const htmlBody = composeHtml(newTitle, newContent, edited?.html);
          onApplyEdit({ ...(script || {}), title: newTitle, content: newContent, body: htmlBody, blocks: undefined } as any);
          appliedAfterContent = newContent;
        }
        setPendingSelection(null);
        // 4) Stream a concise summary into the same bubble
        setIsStreaming(true);
        setStreamingAssistantId(thinkingId);
        const summaryController2 = new AbortController();
        abortRef.current = summaryController2;
        let finalSummary2 = '';
        try {
          const res2 = await fetch('/api/services/thinkforge/think/summary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instruction: enrichedLocal,
              scriptBefore: { title: scriptPayload.title, content: scriptPayload.content || '' },
              scriptAfter: { title: newTitle, content: appliedAfterContent },
              project: { idea: selectedIdea?.idea, platform: (selectedIdea as any)?.platform, tone: selectedIdea?.tone, style: (selectedIdea as any)?.style, format: (selectedIdea as any)?.format, purpose: (selectedIdea as any)?.purpose },
              sessionId
            }),
            signal: summaryController2.signal
          });
          if (res2.ok && res2.body) {
            const reader2 = res2.body.getReader();
            const decoder2 = new TextDecoder('utf-8');
            let done2 = false; let leftover2 = ''; let acc2 = '';
            setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: 'Summary: ', streaming: true } : m));
            typingRef.current.queue = [];
            typingRef.current.active = false;
            if (typingRef.current.timer) clearTimeout(typingRef.current.timer);
            typingRef.current.mode = 'word';
            typingRef.current.delayMs = 35;
            while (!done2) {
              const { value, done } = await reader2.read();
              done2 = done;
              if (value) {
                const raw = decoder2.decode(value, { stream: true });
                acc2 += raw;
                const textChunk2 = leftover2 + raw;
                let tokens2 = textChunk2.split(/(\s+)/);
                const last2 = tokens2[tokens2.length - 1];
                if (last2 && !/\s+/.test(last2)) {
                  leftover2 = tokens2.pop() as string;
                } else {
                  leftover2 = '';
                }
                tokens2 = tokens2.filter(t => t.length > 0);
                if (tokens2.length) {
                  typingRef.current.queue.push(...tokens2);
                  startTypingLoop(thinkingId);
                }
              }
            }
            const tail2 = decoder2.decode();
            if (tail2 || leftover2) {
              acc2 += (tail2 || '') + (leftover2 || '');
              const finalTokens2 = ((leftover2 || '') + (tail2 || '')).split(/(\s+)/).filter(t => t.length > 0);
              if (finalTokens2.length) {
                typingRef.current.queue.push(...finalTokens2);
                startTypingLoop(thinkingId);
              }
            }
            setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, streaming: false } : m));
            finalSummary2 = acc2.trim();
          } else {
            // Fallback to a computed single-line summary
            const oldTitle = scriptPayload.title?.trim() || '';
            const oldText = scriptPayload.content?.trim() || '';
            const newText = appliedAfterContent.trim();
            const oldWords = oldText.split(/\s+/).filter(Boolean).length;
            const newWords = newText.split(/\s+/).filter(Boolean).length;
            const delta = newWords - oldWords;
            const lengthPart = delta === 0 ? 'kept length' : (delta > 0 ? `expanded by ${delta} words` : `condensed by ${Math.abs(delta)} words`);
            const titlePart = newTitle.trim() !== oldTitle ? 'updated title' : '';
            const oldSections = oldText.split(/\n{2,}/).filter(Boolean).length;
            const newSections = newText.split(/\n{2,}/).filter(Boolean).length;
            const secDelta = newSections - oldSections;
            const sectionsPart = secDelta === 0 ? '' : (secDelta > 0 ? `added ${secDelta} section${secDelta===1?'':'s'}` : `removed ${Math.abs(secDelta)} section${Math.abs(secDelta)===1?'':'s'}`);
            const parts = [titlePart, lengthPart, sectionsPart].filter(Boolean);
            finalSummary2 = `Applied edit: ${parts.join(', ')}`;
            setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: finalSummary2, streaming: false } : m));
          }
        } catch (err:any) {
          if (err?.name !== 'AbortError') {
            finalSummary2 = 'Applied your edit to the script.';
            setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, content: finalSummary2, streaming: false } : m));
          }
        } finally {
          setIsStreaming(false);
          setStreamingAssistantId(null);
        }
        if (sessionId) {
          void fetch('/api/services/thinkforge/chat/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'user', content: text }) });
          if (finalSummary2) {
            void fetch('/api/services/thinkforge/chat/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'assistant', content: 'Summary: ' + finalSummary2 }) });
          }
        }
      } catch (e) {
          setChatMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: '[Failed to apply edit]', ts: Date.now(), streaming: false }]);
      }
      return;
    }
    await streamAssistantForPrompt(text, userMsg);
  }, [chatInput, chatMode, script, selectedIdea, streamAssistantForPrompt, onApplyEdit]);

  // Editing logic
  const beginEditMessage = (id: string, existing: string) => {
    if (isStreaming) return; // avoid editing mid-stream for simplicity
    setEditingMessageId(id);
    setEditingContent(existing);
  };
  const cancelEdit = () => { setEditingMessageId(null); setEditingContent(''); };
  const saveEdit = async () => {
    if (!editingMessageId) return;
    const trimmed = editingContent.trim();
    if (!trimmed) { cancelEdit(); return; }
    // Find index of the message to edit (chronological index in current view)
    const current = [...chatMessages];
    const editIdx = current.findIndex(m => m.id === editingMessageId);
    if (editIdx === -1) { cancelEdit(); return; }

  // Update UI: truncate to just before editIdx, then place the edited user message
    const prior = current.slice(0, editIdx);
    const editedUser: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, ts: Date.now() };
    setChatMessages([...prior, editedUser]);
    setEditingMessageId(null); setEditingContent('');

    // Persist branch edit in DB if we have a session
    if (sessionId) {
      try {
        await fetch('/api/services/thinkforge/chat/branch-edit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, editIndex: editIdx, newRole: 'user', newContent: trimmed })
        });
      } catch {}
    }

    // Start new assistant stream from the edited message; backend will include prior context
    await streamAssistantForPrompt(trimmed, editedUser, { appendUser: false, skipPersistUser: true });
  };

  // Rich formatting renderer
  const renderMessage = (text: string) => {
    // If the entire message is JSON, pretty print it as a code block
    const whole = (text || '').trim();
    if ((whole.startsWith('{') && whole.endsWith('}')) || (whole.startsWith('[') && whole.endsWith(']'))) {
      try {
        const obj = JSON.parse(whole);
        return (
          <pre className="mt-2 mb-2 rounded-lg bg-black/60 border border-white/10 p-2 overflow-x-auto text-[11px] leading-snug font-mono text-white/90">
            <code>{JSON.stringify(obj, null, 2)}</code>
          </pre>
        );
      } catch {}
    }
    // Handle code blocks ``` ``` first
    interface Segment { type: 'code' | 'text'; content: string }
    const segments: Segment[] = [];
    const parts = text.split(/```/);
    parts.forEach((p, i) => {
      if (i % 2 === 1) segments.push({ type: 'code', content: p.trim() }); else segments.push({ type: 'text', content: p });
    });
    const nodes: React.ReactNode[] = [];
    const bold = /\*\*(.+?)\*\*/g;
    const italic = /(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g; // single * italics
    const inlineCode = /`([^`]+)`/g;
    segments.forEach((seg, si) => {
      if (seg.type === 'code') {
        nodes.push(
          <pre key={'code-'+si} className="mt-2 mb-2 rounded-lg bg-black/60 border border-white/10 p-2 overflow-x-auto text-[11px] leading-snug font-mono text-white/90">
            <code>{seg.content}</code>
          </pre>
        );
        return;
      }
      // Process text: build paragraphs & lists
      const lines = seg.content.split(/\n+/);
      let listBuffer: string[] = [];
      let ordered = false;
      const flushList = () => {
        if (listBuffer.length === 0) return;
        const listItems = listBuffer.map((li, idx) => <li key={idx} className="mb-1">{formatInline(li)}</li>);
        nodes.push(
          ordered ? <ol key={'ol-'+si+'-'+nodes.length} className="list-decimal ml-5 mt-1 mb-2 space-y-0.5">{listItems}</ol>
                  : <ul key={'ul-'+si+'-'+nodes.length} className="list-disc ml-5 mt-1 mb-2 space-y-0.5">{listItems}</ul>
        );
        listBuffer = [];
        ordered = false;
      };
      const bulletRegex = /^\s*[-*•]\s+/;
      const orderedRegex = /^\s*\d+\.\s+/;
      function formatInline(inline: string) {
        // Bold
        let fragments: React.ReactNode[] = [];
        let cursor = 0; let match: RegExpExecArray | null;
        const pushText = (t: string) => { if (!t) return; fragments.push(t); };
        const processPatterns = (source: string) => {
          // inline code first
          const codeSplit = source.split(inlineCode);
          for (let i=0;i<codeSplit.length;i++) {
            if (i % 2 === 1) {
              fragments.push(<code key={'c'+i+fragments.length} className="px-1 py-0.5 rounded bg-black/50 border border-white/10 text-[11px] font-mono text-white/90">{codeSplit[i]}</code>);
            } else {
              // bold & italic in this segment
              let part = codeSplit[i];
              // Bold
              let boldParts: React.ReactNode[] = [];
              let lastIndex = 0; let m: RegExpExecArray | null;
              while ((m = bold.exec(part)) !== null) {
                boldParts.push(part.slice(lastIndex, m.index));
                boldParts.push(<strong key={'b'+m.index+boldParts.length} className="text-white font-semibold">{m[1]}</strong>);
                lastIndex = m.index + m[0].length;
              }
              boldParts.push(part.slice(lastIndex));
              // Italic pass
              const italicProcessed: React.ReactNode[] = [];
              boldParts.forEach((bp, bpi) => {
                if (typeof bp !== 'string') { italicProcessed.push(bp); return; }
                let str = bp; let im: RegExpExecArray | null; let last = 0; const temp: React.ReactNode[] = [];
                while ((im = italic.exec(str)) !== null) {
                  const prefix = str[im.index];
                  temp.push(str.slice(last, im.index + 1));
                  temp.push(<em key={'i'+im.index+temp.length} className="italic text-white/90">{im[2]}</em>);
                  last = im.index + im[0].length;
                }
                temp.push(str.slice(last));
                italicProcessed.push(...temp);
              });
              fragments.push(...italicProcessed);
              bold.lastIndex = 0; italic.lastIndex = 0; // reset regex stateful
            }
          }
        };
        processPatterns(inline);
        return <>{fragments}</>;
      }
      lines.forEach((ln, li) => {
        if (bulletRegex.test(ln)) {
          const clean = ln.replace(bulletRegex, '').trim();
            if (listBuffer.length === 0) { ordered = false; }
          listBuffer.push(clean); return;
        }
        if (orderedRegex.test(ln)) {
          const clean = ln.replace(orderedRegex, '').trim();
          if (listBuffer.length === 0) { ordered = true; }
          listBuffer.push(clean); return;
        }
        flushList();
        if (ln.trim()) nodes.push(<p key={'p'+si+'-'+li} className="mb-2 last:mb-0 text-[12px] leading-relaxed text-white/85">{formatInline(ln)}</p>);
      });
      flushList();
    });
    return <div className="rich-message text-[12px] leading-relaxed">{nodes}</div>;
  };

  const handleChatKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  };

  const seedSuggestions = () => {
    const baseCommon = ["Add hook","Stronger CTA","Expand section","Shorter version","More data","Story angle","Add humor","Sharpen tone","Cut fluff","Improve flow","Alt headline","Platform tweak"];    
    const modeAdds: Record<typeof chatMode, string[]> = {
      ask: ["What next?","Is pacing ok?","Better opening?","Tone check","Fact check"],
      edit: ["Tighten copy","Condense to 60s","Punchier verbs","Clarify benefit","Remove jargon"],
    };
    const pool = [...baseCommon, ...modeAdds[chatMode]];
    const shuffled = [...new Set(pool)].sort(()=> Math.random()-0.5).slice(0,12);
    setSuggestions(shuffled);
  };

  const handleSuggestionClick = (s: string) => {
    setChatInput(prev => prev ? prev + (prev.endsWith(' ') ? '' : ' ') + s : s);
  };

  return (
  <div className="lg:w-[420px] w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 flex flex-col h-[91vh] relative">
      <div className="mb-3 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-white/90">ForgeAI Chat</h3>
        <span className="text-[10px] text-white/40 uppercase tracking-wide">Idea Refinement</span>
      </div>
  <form onSubmit={(e)=>{e.preventDefault(); sendChat();}} className="flex flex-col flex-1 min-h-0 gap-3">
        {/* Scrollable messages */}
  <div ref={chatScrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {chatMessages.map(m => {
            const isAssistantStreaming = m.id === streamingAssistantId && isStreaming && m.role === 'assistant';
            const isEditing = m.id === editingMessageId && m.role === 'user';
            return (
              <div key={m.id} className={clsx('group/message relative flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={clsx('relative max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow whitespace-pre-wrap break-words', m.role === 'user' ? 'bg-gradient-to-br from-red-600 via-red-500 to-rose-500 text-white shadow-red-900/30' : 'text-white/80 ')}>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editingContent}
                        onChange={(e)=>setEditingContent(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-md bg-white/10 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-white/30"
                      />
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={cancelEdit} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] bg-white/10 hover:bg-white/20 text-white/70"><X className="h-3 w-3"/>Cancel</button>
                        <button type="button" onClick={saveEdit} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] bg-red-500/80 hover:bg-red-500 text-white font-medium"><Check className="h-3 w-3"/>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {isAssistantStreaming && /^Working/.test(m.content) ? (
                        <div className="whitespace-pre-wrap break-words">
                          <span className="shimmer-text">Working…</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{renderMessage(m.content)}</div>
                      )}
                      {(m.streaming || isAssistantStreaming) && (
                        <span className="inline-block align-baseline ml-0.5 w-[6px] h-4 bg-red-400 animate-pulse rounded-sm" />
                      )}
                    </>
                  )}
                  {m.role === 'user' && !isEditing && (
                    <button
                      type="button"
                      onClick={()=>beginEditMessage(m.id, m.content)}
                      className={clsx('absolute -top-2 -right-2 opacity-0 group-hover/message:opacity-100 transition-opacity rounded-md p-1 bg-black/60 border border-white/10 shadow ring-1 ring-white/10 hover:bg-black/80', isStreaming ? 'pointer-events-none opacity-30' : '')}
                      aria-label="Edit message"
                    >
                      <Pencil className="h-3.5 w-3.5 text-white/70" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Local shimmer animation for 'Working…' placeholder */}
        <style jsx>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .shimmer-text {
            background: linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.28) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            background-size: 200% 100%;
            animation: shimmer 1.6s infinite linear;
            letter-spacing: 0.2px;
          }
        `}</style>
        {/* Dynamic suggestion pool just above input */}
        <div ref={suggestionsRef} className="-mx-1 overflow-x-auto flex gap-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent px-1 py-1.5 bg-black/60 rounded-lg border border-white/5">
          {suggestions.map(s => (
            <button key={s} type="button" onClick={()=>handleSuggestionClick(s)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md hover:text-white hover:border-white/25 hover:bg-white/10 transition relative">
              <span>{s}</span>
              <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/5" />
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 group">
          <div className="relative flex-1">
            <textarea
              value={chatInput}
              onChange={(e)=> setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              placeholder={chatMode==='edit' ? 'Describe the edit you want...' : 'Ask about structure, tone, or audience...'}
              rows={2}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-3 pr-16 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 backdrop-blur-md scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              disabled={!sessionId}
            />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
            {/* Mode selector placed below the textarea to avoid overlap */}
            <div className="mt-1">
              <button
                ref={modeBtnRef}
                type="button"
                onClick={()=>{setShowModeMenu(v=>!v);}}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/20 hover:text-white transition"
              >
                <Bot className="h-3 w-3 text-red-300"/> {chatMode} <ChevronDown className="h-3 w-3"/>
              </button>
              {showModeMenu && (createPortal(
                <div ref={modeMenuRef} className="fixed z-[110]" style={{left: modeBtnRef.current?.getBoundingClientRect().left, top: (modeBtnRef.current?.getBoundingClientRect().bottom||0)+4}}>
                  <div className="w-36 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 backdrop-blur-2xl shadow-lg shadow-black/50" onMouseDown={(e)=>e.stopPropagation()}>
                    {(['ask','edit'] as const).map(m => (
                      <button key={m} type="button" onClick={()=>{setChatMode(m); setShowModeMenu(false); seedSuggestions();}} className={clsx('w-full px-3 py-2 text-left text-[11px] font-medium capitalize transition', m===chatMode ? 'bg-red-500/30 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>{m}</button>
                    ))}
                  </div>
                </div>, document.body)
              )}
            </div>
          </div>
          <button type="submit" disabled={!sessionId || !chatInput.trim() || isStreaming} aria-label="Send message" className="relative h-[48px] w-[56px] rounded-2xl overflow-hidden bg-gradient-to-br from-red-600 via-red-500 to-rose-500 text-white shadow-lg shadow-red-900/30 transition-all duration-200 hover:from-red-500 hover:via-rose-500 hover:to-rose-400 hover:shadow-red-800/40 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative flex h-full w-full items-center justify-center text-sm font-semibold">↵</div>
          </button>
          {isStreaming && (
            <button type="button" onClick={stopStreaming} aria-label="Stop generation" className="h-[48px] w-[48px] rounded-2xl border border-white/15 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition flex items-center justify-center">
              <Square className="h-5 w-5" />
            </button>
          )}
        </div>
        {/* removed bottom bar with mode/model selectors; mode moved into input */}
      </form>
    </div>
  );
};
