"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Bot, Sparkles, Square, Pencil, X, Check } from 'lucide-react';
import { Idea } from '@/app/dashboard/thinkforge/types';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; ts: number }

interface ChatPanelProps {
  selectedIdea: Idea;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ selectedIdea }) => {
  // Use internal API route proxy; no secret exposed client-side
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState<'agent'|'ask'|'edit'>('agent');
  const [chatModel, setChatModel] = useState<'gpt-4o'|'sonnet'|'claude-3-5'|'local'>('gpt-4o');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typingRef = useRef<{ queue: string[]; timer: any; active: boolean }>({ queue: [], timer: null, active: false });
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (chatMessages.length === 0 && selectedIdea) {
      setChatMessages([{
        id: 'greet',
        role: 'assistant',
        content: `Let's refine your idea: "${selectedIdea.idea}". Ask for expansions, rewrites, hooks, or structure—I'm ready.`,
        ts: Date.now()
      }]);
      seedSuggestions();
    }
  }, [selectedIdea, chatMessages.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // If click is inside any open menu, ignore
      if (modeMenuRef.current && modeMenuRef.current.contains(target)) return;
      if (modelMenuRef.current && modelMenuRef.current.contains(target)) return;
      // Outside clicks for mode menu
      if (showModeMenu && modeBtnRef.current && !modeBtnRef.current.contains(target)) setShowModeMenu(false);
      // Outside clicks for model menu
      if (showModelMenu && modelBtnRef.current && !modelBtnRef.current.contains(target)) setShowModelMenu(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showModeMenu, showModelMenu]);

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
  };

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
    setStreamingAssistantId(null);
    setChatMessages(prev => prev.map(m => m.id === streamingAssistantId ? { ...m, content: m.content + ' …' } : m));
  }, [isStreaming, streamingAssistantId]);

  const startTypingLoop = (assistantId: string) => {
    if (typingRef.current.active) return;
    typingRef.current.active = true;
    const step = () => {
      if (typingRef.current.queue.length === 0) {
        typingRef.current.active = false;
        return;
      }
      // Pull a small batch (2 chars) for smoothness
      const batch = typingRef.current.queue.splice(0, 2).join('');
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + batch } : m));
      typingRef.current.timer = setTimeout(step, 7);
    };
    step();
  };

  const streamAssistantForPrompt = useCallback(async (prompt: string, userMsg: ChatMessage) => {
    const assistantId = crypto.randomUUID();
    setChatMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }]);
    setIsStreaming(true);
    setStreamingAssistantId(assistantId);
    typingRef.current.queue = [];
    typingRef.current.active = false;
    if (typingRef.current.timer) clearTimeout(typingRef.current.timer);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch('/api/services/thinkforge/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const chars = chunk.replace(/\r\n/g, '\n').split('');
          typingRef.current.queue.push(...chars);
          startTypingLoop(assistantId);
        }
      }
      // flush any remaining decoder buffer
      const tail = decoder.decode();
      if (tail) {
        const chars = tail.replace(/\r\n/g, '\n').split('');
        typingRef.current.queue.push(...chars);
      }
      flushQueueInstant(assistantId);
      setIsStreaming(false);
      setStreamingAssistantId(null);
    } catch (e:any) {
      if (e?.name === 'AbortError') return;
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '[Error fetching response]' } : m));
      setIsStreaming(false);
      setStreamingAssistantId(null);
    }
  }, []);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() };
    setChatInput('');
    await streamAssistantForPrompt(text, userMsg);
  }, [chatInput, streamAssistantForPrompt]);

  // Editing logic
  const beginEditMessage = (id: string, existing: string) => {
    if (isStreaming) return; // avoid editing mid-stream for simplicity
    setEditingMessageId(id);
    setEditingContent(existing);
  };
  const cancelEdit = () => { setEditingMessageId(null); setEditingContent(''); };
  const saveEdit = () => {
    if (!editingMessageId) return;
    const trimmed = editingContent.trim();
    if (!trimmed) { cancelEdit(); return; }
    setChatMessages(prev => {
      const idx = prev.findIndex(m => m.id === editingMessageId);
      if (idx === -1) return prev;
      const prior = prev.slice(0, idx); // everything before the edited user message
      // Build new user message (new id) appended at end of truncated conversation
      const newUser: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, ts: Date.now() };
      return [...prior, newUser];
    });
    const promptText = trimmed; // capture before clearing
    setEditingMessageId(null); setEditingContent('');
    // Kick off fresh assistant stream after state commit (microtask)
    queueMicrotask(() => {
      const newUserMsg: ChatMessage | undefined = undefined; // placeholder (we'll create inside stream function)
      // We need the last user message we just inserted
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'user' && last.content === promptText) {
          // Start streaming referencing this last message
          streamAssistantForPrompt(promptText, last);
        }
        return prev;
      });
    });
  };

  // Rich formatting renderer
  const renderMessage = (text: string) => {
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
      agent: ["List beats","Re-sequence flow","Suggest B-roll","Add tension","Audience tweak"],
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
                      <div className="whitespace-pre-wrap break-words">{renderMessage(m.content)}</div>
                      {isAssistantStreaming && (
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
              placeholder={chatMode==='edit' ? 'Describe the edit you want...' : chatMode==='ask' ? 'Ask about structure, tone, or audience...' : 'Direct the agent to refine, expand, or orchestrate.'}
              rows={2}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-3 pr-16 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-red-500/30 backdrop-blur-md scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"/>
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
          </div>
          <button type="submit" disabled={!chatInput.trim() || isStreaming} aria-label="Send message" className="relative h-[48px] w-[56px] rounded-2xl overflow-hidden bg-gradient-to-br from-red-600 via-red-500 to-rose-500 text-white shadow-lg shadow-red-900/30 transition-all duration-200 hover:from-red-500 hover:via-rose-500 hover:to-rose-400 hover:shadow-red-800/40 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative flex h-full w-full items-center justify-center text-sm font-semibold">↵</div>
          </button>
          {isStreaming && (
            <button type="button" onClick={stopStreaming} aria-label="Stop generation" className="h-[48px] w-[48px] rounded-2xl border border-white/15 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition flex items-center justify-center">
              <Square className="h-5 w-5" />
            </button>
          )}
        </div>
  <div className="flex items-center gap-3 pt-1">
          <div className="relative">
            <button ref={modeBtnRef} type="button" onClick={()=>{setShowModeMenu(v=>!v); setShowModelMenu(false);}} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition"><Bot className="h-3.5 w-3.5 text-red-400"/> {chatMode} <ChevronDown className="h-3 w-3"/></button>
            {showModeMenu && (createPortal(
              <div ref={modeMenuRef} className="fixed z-[110]" style={{left: modeBtnRef.current?.getBoundingClientRect().left, top: (modeBtnRef.current?.getBoundingClientRect().bottom||0)+4}}>
                <div className="w-40 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 backdrop-blur-2xl shadow-lg shadow-black/50" onMouseDown={(e)=>e.stopPropagation()}>
                  {(['agent','ask','edit'] as const).map(m => (
                    <button key={m} type="button" onClick={()=>{setChatMode(m); setShowModeMenu(false); seedSuggestions();}} className={clsx('w-full px-3 py-2 text-left text-[11px] font-medium capitalize transition', m===chatMode ? 'bg-red-500/30 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>{m}</button>
                  ))}
                </div>
              </div>, document.body)
            )}
          </div>
          <div className="relative">
            <button ref={modelBtnRef} type="button" onClick={()=>{setShowModelMenu(v=>!v); setShowModeMenu(false);}} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition"><Sparkles className="h-3.5 w-3.5 text-rose-400"/> {chatModel} <ChevronDown className="h-3 w-3"/></button>
            {showModelMenu && (createPortal(
              <div ref={modelMenuRef} className="fixed z-[110]" style={{left: modelBtnRef.current?.getBoundingClientRect().left, top: (modelBtnRef.current?.getBoundingClientRect().bottom||0)+4}}>
                <div className="w-44 overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 backdrop-blur-2xl shadow-lg shadow-black/50" onMouseDown={(e)=>e.stopPropagation()}>
                  {(['gpt-4o','sonnet','claude-3-5','local'] as const).map(m => (
                    <button key={m} type="button" onClick={()=>{setChatModel(m); setShowModelMenu(false);}} className={clsx('w-full px-3 py-2 text-left text-[11px] font-medium transition uppercase', m===chatModel ? 'bg-red-500/30 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>{m}</button>
                  ))}
                </div>
              </div>, document.body)
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
