"use client";

import { useState, useEffect, useRef, useLayoutEffect, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/app/dashboard/thinkforge/types";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import { getToneColorClass } from "@/lib/thinkforge/tone";

interface SelectedIdeaDisplayProps {
  idea: Idea;
  onProceedToChat: () => void;
  onGoBack: () => void;
  onUpdateIdea: (updatedIdea: Idea) => void;
}

// Small pill buttons for tone selection
const TONE_OPTIONS: { value: Idea['tone']; label: string; desc: string; swatch: string }[] = [
  { value: 'white', label: 'White', desc: 'Facts & Data', swatch: 'bg-white border border-zinc-300' },
  { value: 'red', label: 'Red', desc: 'Emotion & Feel', swatch: 'bg-red-500' },
  { value: 'black', label: 'Black', desc: 'Caution & Risk', swatch: 'bg-black border border-white/30' },
  { value: 'yellow', label: 'Yellow', desc: 'Benefits & Value', swatch: 'bg-yellow-400' },
  { value: 'green', label: 'Green', desc: 'Creative Expansion', swatch: 'bg-green-500' },
  { value: 'blue', label: 'Blue', desc: 'Process & Control', swatch: 'bg-blue-500' }
];

// (Removed auto-resize; using scrollable textareas now)

// Predefined option sets
const PLATFORM_OPTIONS = [
  'YouTube','Instagram','TikTok','LinkedIn','Twitter/X','Reddit','Medium','Blog','Podcast','Newsletter','Facebook','Pinterest'
];
const STYLE_OPTIONS = [
  'Educational','Entertaining','Inspirational','Analytical','Storytelling','Tutorial','Conversational','Humorous','Professional','Casual'
];
const FORMAT_OPTIONS = [
  'Short-form Video','Long-form Video','Blog Post','Tweet Thread','Carousel','Podcast Episode','Newsletter Issue','Script Outline','Listicle','Case Study','How-To Guide','Explainer'
];

export default function SelectedIdeaDisplay({ idea, onProceedToChat, onGoBack, onUpdateIdea }: SelectedIdeaDisplayProps) {
  const [localIdea, setLocalIdea] = useState<Idea>(idea);
  const [dirty, setDirty] = useState(false);
  // Multi-value chip states (parsed from idea on mount)
  const [platforms, setPlatforms] = useState<string[]>(() => idea.platform.split(/,\s*/).filter(Boolean));
  const [styles, setStyles] = useState<string[]>(() => idea.style.split(/,\s*/).filter(Boolean));
  const [formats, setFormats] = useState<string[]>(() => idea.format.split(/,\s*/).filter(Boolean));
  // (Removed individual refs for auto-resize)

  useEffect(() => {
    // sync when idea prop changes (e.g., returning from script)
    setLocalIdea(idea);
  setPlatforms(idea.platform.split(/,\s*/).filter(Boolean));
  setStyles(idea.style.split(/,\s*/).filter(Boolean));
  setFormats(idea.format.split(/,\s*/).filter(Boolean));
  }, [idea]);

  // Removed initial auto-resize effect

  // Debounce propagate changes
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      onUpdateIdea(localIdea);
      setDirty(false);
    }, 450);
    return () => clearTimeout(t);
  }, [localIdea, dirty, onUpdateIdea]);

  // When multi-value arrays change, reflect into localIdea fields
  useEffect(() => {
    setLocalIdea(prev => ({ ...prev, platform: platforms.join(', ') }));
    setDirty(true);
  }, [platforms]);
  useEffect(() => {
    setLocalIdea(prev => ({ ...prev, style: styles.join(', ') }));
    setDirty(true);
  }, [styles]);
  useEffect(() => {
    setLocalIdea(prev => ({ ...prev, format: formats.join(', ') }));
    setDirty(true);
  }, [formats]);

  const handleChange = (key: keyof Idea) => (e: ChangeEvent<HTMLTextAreaElement>) => {
    setLocalIdea(prev => ({ ...prev, [key]: e.target.value }));
    setDirty(true);
  };

  const handleTone = (tone: Idea['tone']) => {
    setLocalIdea(prev => ({ ...prev, tone }));
    setDirty(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="space-y-10"
    >
      {/* Header / Navigation */}
      <div className="flex flex-wrap items-start gap-6 justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={onGoBack}
            size="sm"
            variant="outline"
            className="border-white/10 bg-white/5 hover:bg-white/10 text-white/80 backdrop-blur-xl"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Ideas
          </Button>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-transparent flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-red-500" />
              Your Selected Idea
            </h2>
            <p className="text-xs uppercase tracking-[0.15em] text-white/40">Refine context before scripting</p>
          </div>
        </div>
        {dirty && (
          <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-[11px] font-medium text-amber-300 shadow-inner shadow-amber-500/10">
            Saving…
          </div>
        )}
      </div>

      {/* Main Glass Panel */}
      <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.04] to-white/[0.02] p-[1px] shadow-xl shadow-black/50">
        <div className="relative rounded-[inherit] overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,0,0,0.18),transparent_60%)] opacity-70" />
          <div className="relative z-10 backdrop-blur-2xl rounded-[inherit] p-8 space-y-10">
            {/* Fixed Core Idea */}
            <div className="space-y-3">
              <div className="flex items-start gap-4">
                <div className={`mt-1 h-4 w-4 flex-shrink-0 rounded-full ${getToneColorClass(localIdea.tone)}`}></div>
                <h3 className="text-xl font-semibold leading-snug text-white/90">{localIdea.idea}</h3>
              </div>
              <p className="text-xs text-white/40 ml-8 -mt-1">Core concept locked. Adjust supporting parameters below.</p>
            </div>

            {/* Editable Fields Grid */}
            <div className="grid gap-6 md:grid-cols-2">
              <EditableArea
                label="Purpose"
                placeholder="Clarify what you want to achieve"
                value={localIdea.purpose}
                onChange={handleChange('purpose')}
              />
              <MultiValueEditor
                label="Style"
                placeholder="Add styles"
                values={styles}
                onChange={setStyles}
                options={STYLE_OPTIONS}
              />
              <MultiValueEditor
                label="Format"
                placeholder="Add formats"
                values={formats}
                onChange={setFormats}
                options={FORMAT_OPTIONS}
              />
              <MultiValueEditor
                label="Platform"
                placeholder="Add platforms"
                values={platforms}
                onChange={setPlatforms}
                options={PLATFORM_OPTIONS}
              />
            </div>

            {/* Tone Selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-white/50 uppercase">Thinking Approach</span>
                <span className="text-[10px] font-medium text-white/30">{getToneDescription(localIdea.tone)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(t => {
                  const active = t.value === localIdea.tone;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => handleTone(t.value)}
                      className={`group relative flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-all backdrop-blur-xl border ${active ? 'border-red-400/60 bg-red-500/20 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)]' : 'border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.12]'}`}
                      title={t.desc}
                    >
                      <span className={`h-3 w-3 rounded-full ${t.swatch} shadow ring-1 ring-black/30`}></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Subtle edge light */}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-white/5" />
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={onProceedToChat}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-700 via-red-500 to-rose-700 px-10 py-5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-red-900/40 transition hover:from-red-500 hover:via-rose-500 hover:to-rose-400 focus:ring-2 focus:ring-red-500/40"
        >
          <span className="relative z-10 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Begin Script Phase
          </span>
          <span className="absolute inset-0 -z-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
        </Button>
      </div>
    </motion.div>
  );
} 

interface EditableAreaProps {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

function EditableArea({ label, value, onChange, placeholder }: EditableAreaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group relative"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-inner shadow-black/40 hover:border-white/20 transition-colors">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
          {label}
        </label>
        <textarea
          value={value}
          onChange={onChange}
          rows={4}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/25 focus-visible:ring-0 h-24 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        />
      </div>
    </motion.div>
  );
}

interface MultiValueEditorProps {
  label: string;
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  options: string[];
}

function MultiValueEditor({ label, values, onChange, placeholder, options }: MultiValueEditorProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{top:number;left:number;width:number}>({top:0,left:0,width:0});

  const lcInput = input.toLowerCase();
  const filtered = options.filter(o => o.toLowerCase().includes(lcInput) && !values.includes(o));
  const customCandidate = input.trim() && !options.some(o => o.toLowerCase() === lcInput) && !values.some(v => v.toLowerCase() === lcInput) ? input.trim() : '';
  const suggestionList = [...filtered, ...(customCandidate ? [customCandidate] : [])].slice(0, 8);

  const commit = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    if (values.some(v => v.toLowerCase() === clean.toLowerCase())) return;
    onChange([...values, clean]);
    setInput('');
    setHighlight(0);
    setOpen(false);
  };

  const remove = (val: string) => onChange(values.filter(v => v !== val));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (input.trim() === '') {
        // Do nothing if no input content; prevent accidental first-suggestion add
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (suggestionList[highlight]) commit(suggestionList[highlight]);
      else commit(input);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(suggestionList.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Backspace' && input === '') {
      remove(values[values.length - 1]);
    }
  };

  // Outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  // Dropdown positioning using portal
  const recalc = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownStyle({top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX + 20, width: rect.width - 40});
  };
  useLayoutEffect(() => { if (open) recalc(); }, [open, values, input]);
  useEffect(() => {
    if (!open) return;
    const onWin = () => recalc();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => { window.removeEventListener('resize', onWin); window.removeEventListener('scroll', onWin, true); };
  }, [open]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group relative"
      ref={containerRef}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-inner shadow-black/40 hover:border-white/20 transition-colors">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</label>
  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {values.map(v => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 shadow-sm backdrop-blur-md"
            >
              <span>{v}</span>
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => remove(v)}
                className="ml-0.5 rounded-full p-0.5 text-white/40 hover:text-white hover:bg-white/10 transition"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true); setHighlight(0); }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            onFocus={() => { if (input) setOpen(true); }}
            className="min-w-[120px] flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
          />
        </div>
      </div>
      {open && suggestionList.length > 0 && createPortal(
        <div
          style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width, position: 'absolute' }}
          className="z-[200] max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/95 p-1 backdrop-blur-2xl shadow-2xl shadow-black/60 ring-1 ring-white/5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        >
          {suggestionList.map((s, idx) => {
            const isCustom = customCandidate && s === customCandidate;
            const active = idx === highlight;
            return (
              <button
                type="button"
                key={s + idx}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => commit(s)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-red-500/40 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'} ${isCustom ? 'opacity-60 italic' : ''}`}
              >
                {s}
                {isCustom && <span className="ml-2 text-[10px] uppercase tracking-wide text-white/40">New</span>}
              </button>
            );
          })}
        </div>, document.body
      )}
    </motion.div>
  );
}