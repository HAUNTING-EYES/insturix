"use client";

import { useState, useEffect, useRef, useLayoutEffect, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Idea } from "@/app/dashboard/thinkforge/types";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import { getToneColorClass } from "@/lib/thinkforge/tone";

interface SessionMetadataSettingsProps {
  idea: Idea;
  onProceedToChat: (updatedIdea?: Idea) => void;
  onGoBack: () => void;
  onUpdateIdea: (updatedIdea: Idea) => void;
  /** When true, hides the navigation buttons (used when opened from chat settings) */
  hideNavigation?: boolean;
  /** Total session count for default naming (used for "Session #N") */
  sessionCount?: number;
}

// Small pill buttons for tone selection
const TONE_OPTIONS: { value: Idea['tone']; label: string; desc: string; swatch: string }[] = [
  { value: 'white', label: 'White', desc: 'Facts & Data', swatch: 'bg-white border border-[#282724]' },
  { value: 'red', label: 'Red', desc: 'Emotion & Feel', swatch: 'bg-[#D4A652]' },
  { value: 'black', label: 'Black', desc: 'Caution & Risk', swatch: 'bg-black border border-white/30' },
  { value: 'yellow', label: 'Yellow', desc: 'Benefits & Value', swatch: 'bg-yellow-400' },
  { value: 'green', label: 'Green', desc: 'Creative Expansion', swatch: 'bg-green-500' },
  { value: 'blue', label: 'Blue', desc: 'Process & Control', swatch: 'bg-blue-500' }
];

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

export default function SessionMetadataSettings({ idea, onProceedToChat, onGoBack, onUpdateIdea, hideNavigation = false, sessionCount = 0 }: SessionMetadataSettingsProps) {
  // Generate default Session Name if not set
  const getDefaultSessionName = (incoming: Idea) => (incoming.sessionName && incoming.sessionName.trim().length > 0)
    ? incoming.sessionName
    : `Session #${sessionCount + 1}`;
  const [localIdea, setLocalIdea] = useState<Idea>({ ...idea, sessionName: getDefaultSessionName(idea) });
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved'>('clean');
  const [nameError, setNameError] = useState<string | null>(null);
  // Multi-value chip states (parsed from idea on mount)
  const [platforms, setPlatforms] = useState<string[]>(() => idea.platform.split(/,\s*/).filter(Boolean));
  const [styles, setStyles] = useState<string[]>(() => idea.style.split(/,\s*/).filter(Boolean));
  const [formats, setFormats] = useState<string[]>(() => idea.format.split(/,\s*/).filter(Boolean));
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedIdeaRef = useRef<Idea>(idea);

  useEffect(() => {
    // Sync when idea prop changes (e.g., returning from script or switching session)
    const prev = lastSavedIdeaRef.current;
    const changed = (
      idea.id !== prev.id ||
      idea.sessionName !== prev.sessionName ||
      idea.idea !== prev.idea ||
      idea.purpose !== prev.purpose ||
      idea.style !== prev.style ||
      idea.format !== prev.format ||
      idea.platform !== prev.platform ||
      idea.tone !== prev.tone
    );
    if (changed) {
      const normalizedIdea = { ...idea, sessionName: getDefaultSessionName(idea) };
      setLocalIdea(normalizedIdea);
      setPlatforms(idea.platform.split(/,\s*/).filter(Boolean));
      setStyles(idea.style.split(/,\s*/).filter(Boolean));
      setFormats(idea.format.split(/,\s*/).filter(Boolean));
      if (!idea.sessionName || !idea.sessionName.trim()) {
        setSaveState('dirty');
      } else {
        setSaveState('clean');
      }
      lastSavedIdeaRef.current = normalizedIdea;
      setNameError(null);
    }
  }, [idea, sessionCount]);

  // Debounce propagate changes
  useEffect(() => {
    const isActuallyChanged = JSON.stringify(localIdea) !== JSON.stringify(lastSavedIdeaRef.current);

    if (!isActuallyChanged) {
      setSaveState('clean');
      return;
    }

    setSaveState('dirty');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await onUpdateIdea(localIdea);
        lastSavedIdeaRef.current = localIdea;
        setSaveState('saved');

        if (savedIndicatorTimeoutRef.current) clearTimeout(savedIndicatorTimeoutRef.current);
        savedIndicatorTimeoutRef.current = setTimeout(() => {
          setSaveState('clean');
        }, 2000);
      } catch (error) {
        console.error('Error saving idea:', error);
        setSaveState('clean');
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [localIdea, onUpdateIdea]);

  // When multi-value arrays change, reflect into localIdea fields
  useEffect(() => {
    const newVal = platforms.join(', ');
    if (newVal !== localIdea.platform) {
        setLocalIdea(prev => ({ ...prev, platform: newVal }));
        setSaveState('dirty');
    }
  }, [platforms]);
  
  useEffect(() => {
    const newVal = styles.join(', ');
    if (newVal !== localIdea.style) {
        setLocalIdea(prev => ({ ...prev, style: newVal }));
        setSaveState('dirty');
    }
  }, [styles]);
  
  useEffect(() => {
    const newVal = formats.join(', ');
    if (newVal !== localIdea.format) {
        setLocalIdea(prev => ({ ...prev, format: newVal }));
        setSaveState('dirty');
    }
  }, [formats]);

  const handleChange = (key: keyof Idea) => (e: ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;
    if (key === 'sessionName') {
      value = value.slice(0, 100);
      const trimmed = value.trim();
      if (!trimmed) {
        setNameError('Session Name is required');
      } else {
        setNameError(null);
      }
    }
    setLocalIdea(prev => ({ ...prev, [key]: value }));
    setSaveState('dirty');
  };

  const issessionNameValid = (() => {
    const name = (localIdea.sessionName || '').trim();
    return name.length > 0 && name.length <= 100;
  })();

  const handleTone = (tone: Idea['tone']) => {
    setLocalIdea(prev => ({ ...prev, tone }));
    setSaveState('dirty');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="space-y-8 max-w-5xl mx-auto"
    >
      {/* Header / Navigation */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          {!hideNavigation && (
            <Button
              onClick={onGoBack}
              size="sm"
              variant="outline"
              className="border-[#282724] bg-[#0F0F0E] hover:bg-[#131312] text-[#B5B2A8] transition-all hover:border-[#D4A652]/30"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Generate Ideas
            </Button>
          )}
          <div className="space-y-0.5">
            <h2 className="text-xl font-semibold tracking-tight text-[#ECE9E1] flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#D4A652]" />
              Session Settings
            </h2>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#5F5E5A]">Configure your project parameters</p>
          </div>
        </div>
        
          <div className="flex items-center gap-3">
          {/* Save Status */}
          <AnimatePresence mode="wait">
            {saveState === 'saving' && (
              <motion.div 
                key="saving"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-medium text-blue-300 whitespace-nowrap"
              >
                <motion.div 
                  className="h-2 w-2 rounded-full bg-blue-400"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                Saving…
              </motion.div>
            )}
            {saveState === 'saved' && (
              <motion.div
                key="saved"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="rounded-full border border-green-400/30 bg-green-500/10 px-3 py-1.5 text-[11px] font-medium text-green-300 whitespace-nowrap"
              >
                ✓ Auto-saved
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Start Session Button - only show when not hideNavigation */}
          {!hideNavigation && (
            <Button
              onClick={async () => {
                const trimmed = (localIdea.sessionName || '').trim();
                if (!trimmed || trimmed.length > 100) {
                  setNameError('Session Name is required (max 100 chars)');
                  return;
                }
                const payload = { ...localIdea, sessionName: trimmed };
                // Push latest idea to parent BEFORE proceeding
                try {
                  await onUpdateIdea(payload);
                  lastSavedIdeaRef.current = payload;
                  setSaveState('saved');
                  setNameError(null);
                } catch (e) {
                  setNameError('Failed to save Session Name');
                  return;
                }
                onProceedToChat(payload);
              }}
              className="group relative overflow-hidden rounded-[7px] bg-[#D4A652] px-5 py-2.5 text-sm font-extrabold text-[#0B0B0A] shadow-lg transition-all hover:bg-[#e0b765]"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Play className="h-4 w-4 fill-current" /> 
                Start Session
              </span>
              <span className="absolute inset-0 -z-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Glass Panel */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="relative rounded-xl border border-[#1C1B19] bg-[#0F0F0E] shadow-2xl shadow-black/40"
      >
        <div className="relative rounded-[inherit] overflow-hidden">
          <div className="relative z-10 rounded-[inherit] p-8 space-y-8">
            {/* Session Name Field */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                 <div className={`h-4 w-4 flex-shrink-0 rounded-full ${getToneColorClass(localIdea.tone)}`}></div>
                 <h3 className="text-lg font-semibold leading-snug text-[#ECE9E1]">Session Name</h3>
              </div>
              <EditableArea
                label="Session Name"
                placeholder="Enter a name for your project..."
                value={localIdea.sessionName || ''}
                onChange={handleChange('sessionName')}
                rows={1}
                maxLength={100}
              />
              <div className="flex items-center justify-between text-[11px] text-[#5F5E5A]">
                <span className={nameError ? "text-[#D4A652]" : "text-[#5F5E5A]"}>
                  {nameError ? nameError : 'Max 100 characters'}
                </span>
                <span className="text-[#454340]">{(localIdea.sessionName || '').length}/100</span>
              </div>
            </div>

            {/* Core Concept (Now Editable) */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                 <h3 className="text-lg font-semibold leading-snug text-[#ECE9E1]">Title (Core Concept)</h3>
              </div>
              <EditableArea
                label="Core Concept"
                placeholder="Enter the main idea or title..."
                value={localIdea.idea}
                onChange={handleChange('idea')}
              />
            </div>

            {/* Editable Fields Grid */}
            <div className="grid gap-5 md:grid-cols-2">
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-[#7A776E] uppercase">Thinking Approach</span>
                <span className="text-[10px] font-medium text-[#5F5E5A]">{getToneDescription(localIdea.tone)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(t => {
                  const active = t.value === localIdea.tone;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => handleTone(t.value)}
                      className={`group relative flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-all border ${active ? 'border-[#D4A652]/60 bg-[#D4A652]/15 text-[#ECE9E1]' : 'border-[#1C1B19] bg-[#131312] text-[#7A776E] hover:text-[#ECE9E1] hover:border-[#282724]'}`}
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
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-[#1C1B19]" />
        </div>
      </motion.div>
    </motion.div>
  );
} 

interface EditableAreaProps {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

function EditableArea({ label, value, onChange, placeholder, rows = 3, maxLength }: EditableAreaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group relative"
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#D4A652]/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300" />
      <div className="relative rounded-xl border border-[#1C1B19] bg-[#131312] p-4 hover:border-[#282724] group-focus-within:border-[#282724] transition-all duration-300">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[#7A776E]">
          {label}
        </label>
        <textarea
          value={value}
          onChange={onChange}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full resize-none bg-transparent text-sm leading-relaxed text-[#ECE9E1] outline-none placeholder:text-[#454340] focus-visible:ring-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#282724] hover:scrollbar-thumb-[#454340] transition-colors ${rows === 1 ? 'h-8 max-h-8' : 'h-20 max-h-40'}`}
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
    setDropdownStyle({top: rect.bottom + window.scrollY + 6, left: rect.left + window.scrollX + 16, width: rect.width - 32});
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
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#D4A652]/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300" />
      <div className="relative rounded-xl border border-[#1C1B19] bg-[#131312] p-4 hover:border-[#282724] group-focus-within:border-[#282724] transition-all duration-300">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-[#7A776E]">{label}</label>
  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#282724] hover:scrollbar-thumb-[#454340] scrollbar-track-transparent transition-colors">
          {values.map(v => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-full border border-[#282724] bg-[#1C1B19] px-3 py-1 text-xs font-medium text-[#ECE9E1] shadow-sm"
            >
              <span>{v}</span>
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => remove(v)}
                className="ml-0.5 rounded-full p-0.5 text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724] transition"
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
            className="min-w-[100px] flex-1 bg-transparent text-sm text-[#ECE9E1] placeholder:text-[#454340] focus:outline-none"
          />
        </div>
      </div>
      {open && suggestionList.length > 0 && createPortal(
        <div
          style={{ top: dropdownStyle.top, left: dropdownStyle.left, width: dropdownStyle.width, position: 'absolute' }}
          className="z-[200] max-h-72 overflow-y-auto rounded-xl border border-[#282724] bg-[#0B0B0A]/98 p-1 backdrop-blur-2xl shadow-2xl shadow-black/60 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#282724]"
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
                className={`w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-[#D4A652]/30 text-[#ECE9E1]' : 'text-[#B5B2A8] hover:bg-[#1C1B19] hover:text-[#ECE9E1]'} ${isCustom ? 'opacity-60 italic' : ''}`}
              >
                {s}
                {isCustom && <span className="ml-2 text-[10px] uppercase tracking-wide text-[#5F5E5A]">New</span>}
              </button>
            );
          })}
        </div>, document.body
      )}
    </motion.div>
  );
}
