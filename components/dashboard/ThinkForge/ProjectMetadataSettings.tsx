"use client";

import { useState, useEffect, useRef, useLayoutEffect, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Idea } from "@/app/dashboard/thinkforge/types";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import { getToneColorClass } from "@/lib/thinkforge/tone";

interface ProjectMetadataSettingsProps {
  idea: Idea;
  onProceedToChat: () => void;
  onGoBack: () => void;
  onUpdateIdea: (updatedIdea: Idea) => void;
  /** When true, hides the navigation buttons (used when opened from chat settings) */
  hideNavigation?: boolean;
  /** Total project count for default naming (used for "Project #N") */
  projectCount?: number;
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

export default function ProjectMetadataSettings({ idea, onProceedToChat, onGoBack, onUpdateIdea, hideNavigation = false, projectCount = 0 }: ProjectMetadataSettingsProps) {
  // Generate default project name if not set
  const defaultProjectName = idea.projectName || `Project #${projectCount + 1}`;
  const [localIdea, setLocalIdea] = useState<Idea>({ ...idea, projectName: idea.projectName || defaultProjectName });
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved'>('clean');
  // Multi-value chip states (parsed from idea on mount)
  const [platforms, setPlatforms] = useState<string[]>(() => idea.platform.split(/,\s*/).filter(Boolean));
  const [styles, setStyles] = useState<string[]>(() => idea.style.split(/,\s*/).filter(Boolean));
  const [formats, setFormats] = useState<string[]>(() => idea.format.split(/,\s*/).filter(Boolean));
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedIdeaRef = useRef<Idea>(idea);

  useEffect(() => {
    // sync when idea prop changes (e.g., returning from script)
    // Only if ID changed or we are initializing, to avoid overwriting local edits if prop updates from self
    if (idea.id !== localIdea.id) {
        setLocalIdea(idea);
        setPlatforms(idea.platform.split(/,\s*/).filter(Boolean));
        setStyles(idea.style.split(/,\s*/).filter(Boolean));
        setFormats(idea.format.split(/,\s*/).filter(Boolean));
        setSaveState('clean');
        lastSavedIdeaRef.current = idea;
    }
  }, [idea]);

  // Debounce propagate changes
  useEffect(() => {
    // Check if actually changed from last saved state
    const isActuallyChanged = JSON.stringify(localIdea) !== JSON.stringify(lastSavedIdeaRef.current);

    if (!isActuallyChanged) {
        if (saveState === 'dirty') setSaveState('clean');
        return;
    }
    
    // Only proceed if we marked it as dirty (which we do on input change)
    if (saveState !== 'dirty') return;
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    setSaveState('saving');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onUpdateIdea(localIdea);
        lastSavedIdeaRef.current = localIdea;
        setSaveState('saved');
        
        // Show "saved" indicator for 2 seconds, then go back to clean
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
  }, [localIdea, saveState, onUpdateIdea]);

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
    setLocalIdea(prev => ({ ...prev, [key]: e.target.value }));
    setSaveState('dirty');
  };

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
              className="border-white/10 bg-white/5 hover:bg-white/10 text-white/80 backdrop-blur-xl transition-all hover:border-white/20"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Generate Ideas
            </Button>
          )}
          <div className="space-y-0.5">
            <h2 className="text-xl font-semibold tracking-tight bg-gradient-to-br from-white via-white to-white/70 bg-clip-text text-transparent flex items-center gap-2">
              <Settings className="h-5 w-5 text-red-500" />
              Project Settings
            </h2>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Configure your project parameters</p>
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
                ✓ Saved
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Create Project Button - only show when not hideNavigation */}
          {!hideNavigation && (
            <Button
              onClick={onProceedToChat}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-rose-700 via-red-500 to-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-900/40 transition-all hover:from-red-500 hover:via-rose-500 hover:to-red-600 hover:shadow-xl hover:shadow-red-900/50"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Play className="h-4 w-4 fill-current" /> 
                Create Project
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
        className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-white/[0.01] p-[1px] shadow-2xl shadow-black/40 backdrop-blur-2xl"
      >
        <div className="relative rounded-[inherit] overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,0,0,0.15),transparent_60%)] opacity-50" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.1),transparent_70%)] opacity-30" />
          <div className="relative z-10 backdrop-blur-3xl rounded-[inherit] p-8 space-y-8">
            {/* Project Name Field */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                 <div className={`h-4 w-4 flex-shrink-0 rounded-full ${getToneColorClass(localIdea.tone)}`}></div>
                 <h3 className="text-lg font-semibold leading-snug text-white/90">Project Name</h3>
              </div>
              <EditableArea
                label="Project Name"
                placeholder="Enter a name for your project..."
                value={localIdea.projectName || ''}
                onChange={handleChange('projectName')}
                rows={1}
              />
            </div>

            {/* Core Concept (Now Editable) */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                 <h3 className="text-lg font-semibold leading-snug text-white/90">Title (Core Concept)</h3>
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
}

function EditableArea({ label, value, onChange, placeholder, rows = 3 }: EditableAreaProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group relative"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.12] via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300" />
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl shadow-inner shadow-black/40 hover:border-white/20 group-focus-within:border-white/30 transition-all duration-300">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-white/50">
          {label}
        </label>
        <textarea
          value={value}
          onChange={onChange}
          rows={rows}
          placeholder={placeholder}
          className={`w-full resize-none bg-transparent text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/30 focus-visible:ring-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 transition-colors ${rows === 1 ? 'h-8 max-h-8' : 'h-20 max-h-40'}`}
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
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.12] via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300" />
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl shadow-inner shadow-black/40 hover:border-white/20 group-focus-within:border-white/30 transition-all duration-300">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-white/50">{label}</label>
  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scrollbar-track-transparent transition-colors">
          {values.map(v => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 shadow-sm backdrop-blur-md"
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
            className="min-w-[100px] flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
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
