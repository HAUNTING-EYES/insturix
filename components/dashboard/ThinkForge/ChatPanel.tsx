"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown, Bot, Sparkles } from 'lucide-react';
import { Idea } from '@/app/dashboard/thinkforge/types';

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; ts: number }

interface ChatPanelProps {
  selectedIdea: Idea;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ selectedIdea }) => {
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
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const generateAssistantStub = (prompt: string) => {
    const lowers = prompt.toLowerCase();
    if (lowers.includes('hook')) return 'Here are 3 hook variants focusing on tension + curiosity...';
    if (lowers.includes('expand')) return 'Expanded detail: adding deeper context & narrative beats...';
    return 'Noted. I can propose structure, hooks, CTA suggestions, or polish. Specify what you want next.';
  };

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, ts: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setTimeout(() => {
      setChatMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: generateAssistantStub(text), ts: Date.now() }]);
    }, 550);
  }, [chatInput]);

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
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {chatMessages.map(m => (
            <div key={m.id} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[85%] rounded-2xl px-4 py-2 text-xs leading-relaxed shadow', m.role === 'user' ? 'bg-gradient-to-br from-red-600 via-red-500 to-rose-500 text-white shadow-red-900/30' : 'bg-white/7 text-white/80 backdrop-blur-md border border-white/10')}>{m.content}</div>
            </div>
          ))}
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
          <button type="submit" disabled={!chatInput.trim()} aria-label="Send message" className="relative h-[48px] w-[56px] rounded-2xl overflow-hidden bg-gradient-to-br from-red-600 via-red-500 to-rose-500 text-white shadow-lg shadow-red-900/30 transition-all duration-200 hover:from-red-500 hover:via-rose-500 hover:to-rose-400 hover:shadow-red-800/40 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative flex h-full w-full items-center justify-center text-sm font-semibold">↵</div>
          </button>
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
