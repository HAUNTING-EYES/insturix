'use client';

/**
 * AutoEditDialog — Mode 2 options dialog.
 *
 * Opens AFTER the user picks a video file. Presents optional configuration
 * fields that the backend already supports but the old upload flow never sent.
 *
 * Pattern: DaVinci Resolve "New Timeline Using Selected Clips" — file first,
 * options second, all optional, smart defaults, one-click quick path.
 *
 * The dialog emits editorialPreferences as user policy: auto/brand authority,
 * hard family vetoes, or soft frequency/intensity direction. Legacy named-style
 * fields remain API compatibility inputs for older clients and are not emitted here.
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileVideo, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import {
  EDITORIAL_FAMILIES,
  type EditorialFamily,
  type EditorialFamilyPreference,
  type EditorialPreferences,
  type EditorialPreferenceMode,
} from '@/lib/editron/production-brief/editorial-preferences';

/** Options forwarded to the from-asset backend endpoint. */
export interface AutoEditOptions {
  userIntent?: string;
  platform?: string;
  script?: string;
  aspectRatio?: string;
  editorialPreferences?: EditorialPreferences;
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  captionStyle?: 'word_by_word' | 'sentence' | 'key_phrases' | 'none';
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  transitionPreference?: 'minimal' | 'subtle' | 'dynamic' | 'energetic';
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  zoomBehavior?: 'none' | 'subtle' | 'moderate' | 'aggressive';
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  motionGraphics?: 'none' | 'stats_only' | 'full';
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  pacingFeel?: 'calm' | 'balanced' | 'energetic' | 'fast';
  /** @deprecated Compatibility input for batch/older clients; new intake emits editorialPreferences. */
  musicPreference?: 'none' | 'subtle_bed' | 'energetic' | 'match_video';
}

interface AutoEditDialogProps {
  /** The video file the user selected. null = dialog closed. */
  file: File | null;
  /** Called when user confirms — file + chosen options. */
  onConfirm: (file: File, options: AutoEditOptions) => void;
  /** Called when user cancels / closes dialog. */
  onCancel: () => void;
}

const PLATFORM_OPTIONS = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'facebook', label: 'Facebook' },
] as const;

const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9 — Landscape (YouTube, LinkedIn)' },
  { value: '9:16', label: '9:16 — Portrait (Reels, TikTok, Shorts)' },
  { value: '1:1', label: '1:1 — Square (Instagram, Facebook)' },
] as const;

const FAMILY_LABELS: Record<EditorialFamily, { label: string; description: string }> = {
  captions: { label: 'Captions', description: 'Speech coverage and visual emphasis' },
  motionGraphics: { label: 'Motion graphics', description: 'How often ideas receive visual explanation' },
  zoom: { label: 'Camera motion', description: 'Signal-licensed pushes, pulls, and reframing' },
  transitions: { label: 'Transitions', description: 'Visible treatment at meaningful boundaries' },
  sfx: { label: 'Sound effects', description: 'Impacts, accents, and transition support' },
  music: { label: 'Background music', description: 'Music presence and prominence' },
};

const DEFAULT_PREFERENCE: EditorialFamilyPreference = { mode: 'auto' };

export function AutoEditDialog({ file, onConfirm, onCancel }: AutoEditDialogProps) {
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [platform, setPlatform] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [userIntent, setUserIntent] = useState('');
  const [script, setScript] = useState('');
  const [familyPreferences, setFamilyPreferences] = useState<Partial<Record<EditorialFamily, EditorialFamilyPreference>>>({});
  const [pacingMode, setPacingMode] = useState<'auto' | 'prefer'>('auto');
  const [pacingIntensity, setPacingIntensity] = useState(0.5);
  const [musicPrompt, setMusicPrompt] = useState('');
  const [creativeNotes, setCreativeNotes] = useState('');

  const resetState = useCallback(() => {
    setShowAdvanced(true);
    setPlatform('auto');
    setAspectRatio('16:9');
    setUserIntent('');
    setScript('');
    setFamilyPreferences({});
    setPacingMode('auto');
    setPacingIntensity(0.5);
    setMusicPrompt('');
    setCreativeNotes('');
  }, []);

  const handleQuickEdit = useCallback(() => {
    if (!file) return;
    // Explicit opt-out path: skip preferences and let the planner decide.
    onConfirm(file, {});
    resetState();
  }, [file, onConfirm, resetState]);

  const handleConfirmWithOptions = useCallback(() => {
    if (!file) return;
    const options: AutoEditOptions = {};
    if (platform && platform !== 'auto') options.platform = platform;
    if (aspectRatio && aspectRatio !== '16:9') options.aspectRatio = aspectRatio;
    if (userIntent.trim()) options.userIntent = userIntent.trim();
    if (script.trim()) options.script = script.trim();
    const selectedFamilies = Object.fromEntries(
      Object.entries(familyPreferences).filter(([, preference]) => preference?.mode !== 'auto'),
    ) as NonNullable<EditorialPreferences['families']>;
    if (Object.keys(selectedFamilies).length > 0 || pacingMode === 'prefer' || musicPrompt.trim() || creativeNotes.trim()) {
      options.editorialPreferences = {
        ...(Object.keys(selectedFamilies).length > 0 ? { families: selectedFamilies } : {}),
        ...(pacingMode === 'prefer' ? { pacing: { mode: 'prefer', intensity: pacingIntensity } } : {}),
        ...(musicPrompt.trim() ? { musicPrompt: musicPrompt.trim() } : {}),
        ...(creativeNotes.trim() ? { notes: creativeNotes.trim() } : {}),
      };
    }
    onConfirm(file, options);
    resetState();
  }, [file, platform, aspectRatio, userIntent, script, familyPreferences, pacingMode, pacingIntensity, musicPrompt, creativeNotes, onConfirm, resetState]);

  const updateFamilyMode = useCallback((family: EditorialFamily, mode: EditorialPreferenceMode) => {
    setFamilyPreferences((current) => ({
      ...current,
      [family]: mode === 'prefer'
        ? { mode, frequency: current[family]?.frequency ?? 0.5, intensity: current[family]?.intensity ?? 0.5 }
        : { mode },
    }));
  }, []);

  const updateFamilyValue = useCallback((family: EditorialFamily, key: 'frequency' | 'intensity', value: number) => {
    setFamilyPreferences((current) => ({
      ...current,
      [family]: { ...(current[family] ?? DEFAULT_PREFERENCE), mode: 'prefer', [key]: value },
    }));
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCancel();
      resetState();
    }
  }, [onCancel, resetState]);

  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(1) : '0';

  return (
    <Dialog open={file !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[680px] max-h-[92vh] overflow-y-auto p-0 bg-[#131312] border-[#282724] rounded-lg">
        <DialogHeader className="sr-only">
          <DialogDescription>
            Configure how AI edits your video
          </DialogDescription>
        </DialogHeader>

        {/* Top gold accent line */}
        <div className="absolute top-0 left-[20%] right-[20%] h-px" style={{ background: 'linear-gradient(90deg, transparent, #D4A652, transparent)', opacity: 0.4 }} />

        {/* Keyframe animations */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes ae-pulse { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }
          @keyframes ae-shimmer { 0% { left: -50%; } 100% { left: 150%; } }
          @keyframes ae-energy { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          .ae-icon-ring { position: absolute; inset: -3px; border-radius: 11px; border: 1px solid rgba(212,166,82,0.1); animation: ae-pulse 3s ease-in-out infinite; }
          .ae-cta { position: relative; overflow: hidden; }
          .ae-cta::after { content: ''; position: absolute; top: 0; left: -50%; width: 50%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); animation: ae-shimmer 3s ease-in-out infinite; }
          .ae-energy-line { position: relative; overflow: hidden; }
          .ae-energy-line::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, #D4A652 50%, transparent 100%); background-size: 200% 100%; animation: ae-energy 4s linear infinite; opacity: 0.3; }
        `}} />

        <div className="px-5 pt-4 pb-3">
          {/* File card */}
          <div className="flex items-center gap-3.5 rounded-md border border-[#282724] bg-[#1B1A18] px-4 py-3 relative">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 relative" style={{ background: 'linear-gradient(135deg, rgba(212,166,82,0.06), rgba(212,166,82,0.12))', border: '1px solid rgba(212,166,82,0.18)' }}>
              <div className="ae-icon-ring" />
              <FileVideo className="h-5 w-5 text-[#D4A652] relative z-[1]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#ECE9E1]">
                {file?.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] text-[#5F5E5A]">{fileSizeMB} MB</span>
                <span className="font-mono text-[9px] font-semibold tracking-[0.06em] uppercase text-[#D4A652] bg-[#D4A652]/8 border border-[#D4A652]/12 px-1.5 py-px rounded-sm">Video</span>
              </div>
            </div>
          </div>

          {/* Large file proxy notice */}
          {file && file.size > 100 * 1024 * 1024 && (
            <div className="ae-energy-line mt-2.5 rounded-[5px] border border-[#D4A652]/12 px-3.5 py-2.5 text-[11px] leading-relaxed text-[#7A776E]" style={{ background: 'rgba(212,166,82,0.03)' }}>
              <span className="font-semibold text-[#D4A652]">Large file</span> — editor opens with a preview-quality version while the full resolution uploads in the background. Final render uses the original.
            </div>
          )}

          {/* Skip-preferences path. Settings are visible by default below. */}
          <button
            type="button"
            onClick={handleQuickEdit}
            className="flex w-full items-center justify-center gap-2.5 mt-3 px-4 py-2.5 rounded-md border border-[#282724] bg-[#1B1A18] hover:border-[#D4A652]/45 text-[#B5B2A8] hover:text-[#D4A652] text-[13px] font-semibold transition-colors"
          >
            <Sparkles className="h-[16px] w-[16px]" />
            <span>Skip Preferences - Let AI Decide Everything</span>
          </button>

          {/* "or" divider */}
          <div className="flex items-center gap-3 my-1.5">
            <div className="flex-1 h-px bg-[#1C1B19]" />
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-[#454340]">or</span>
            <div className="flex-1 h-px bg-[#1C1B19]" />
          </div>

          {/* Customize toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`flex w-full items-center justify-center gap-1.5 py-2 rounded text-[12px] transition-all ${
              showAdvanced
                ? 'text-[#B5B2A8] border border-[#1C1B19] bg-[#1B1A18]/40'
                : 'text-[#7A776E] border border-transparent hover:text-[#B5B2A8] hover:border-[#1C1B19] hover:bg-[#1B1A18]/40'
            }`}
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Hide options
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show edit settings
              </>
            )}
          </button>

          {/* Advanced options panel */}
          {showAdvanced && (
            <div className="mt-2 rounded-md border border-[#282724] bg-[#0F0F0E] p-4 relative">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-[#D4A652]/20 rounded-tl-md pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-[#D4A652]/20 rounded-br-md pointer-events-none" />

              {/* Platform + Aspect Ratio side by side */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="ae-platform" className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">
                    Platform
                  </Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="ae-platform" className="h-[34px] bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[13px] focus:border-[#D4A652]/35 focus:ring-1 focus:ring-[#D4A652]/6">
                      <SelectValue placeholder="Auto-detect" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1B1A18] border-[#282724]">
                      {PLATFORM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ae-aspect" className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">
                    Aspect Ratio
                  </Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger id="ae-aspect" className="h-[34px] bg-[#1B1A18] border-[#282724] text-[#ECE9E1] text-[13px] focus:border-[#D4A652]/35 focus:ring-1 focus:ring-[#D4A652]/6">
                      <SelectValue placeholder="16:9" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1B1A18] border-[#282724]">
                      {ASPECT_RATIO_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* User Intent */}
              <div className="mt-3">
                <Label htmlFor="ae-intent" className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">
                  What is this video for?
                  <span className="ml-1 text-[#454340] normal-case tracking-normal">(optional)</span>
                </Label>
                <Textarea
                  id="ae-intent"
                  placeholder="e.g. Gym promo for Instagram, product demo for LinkedIn, travel vlog for YouTube..."
                  value={userIntent}
                  onChange={(e) => setUserIntent(e.target.value)}
                  rows={2}
                  className="resize-none text-[13px] bg-[#1B1A18] border-[#282724] text-[#ECE9E1] placeholder:text-[#454340] focus:border-[#D4A652]/35 focus:ring-1 focus:ring-[#D4A652]/6"
                  maxLength={500}
                />
              </div>

              {/* Script / Narration */}
              <div className="mt-3">
                <Label htmlFor="ae-script" className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-1 block">
                  Script / Narration
                  <span className="ml-1 text-[#454340] normal-case tracking-normal">(optional — AI generates captions)</span>
                </Label>
                <Textarea
                  id="ae-script"
                  placeholder="Paste your script here if you have one."
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={3}
                  className="resize-none text-[13px] bg-[#1B1A18] border-[#282724] text-[#ECE9E1] placeholder:text-[#454340] focus:border-[#D4A652]/35 focus:ring-1 focus:ring-[#D4A652]/6"
                  maxLength={5000}
                />
              </div>

              {/* Editorial policy controls. These constrain planners; they never select forms. */}
              <div className="mt-3.5 pt-3 border-t border-[#1C1B19]">
                <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-2">
                  Creative direction
                </p>
                <div className="divide-y divide-[#1C1B19]">
                  {EDITORIAL_FAMILIES.map((family) => {
                    const preference = familyPreferences[family] ?? DEFAULT_PREFERENCE;
                    return (
                      <div key={family} className="py-2.5 first:pt-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-[#D8D4CA]">{FAMILY_LABELS[family].label}</p>
                            <p className="truncate text-[10px] text-[#5F5E5A]">{FAMILY_LABELS[family].description}</p>
                          </div>
                          <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded border border-[#282724]" role="group" aria-label={`${FAMILY_LABELS[family].label} policy`}>
                            {(['auto', 'off', 'prefer'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => updateFamilyMode(family, mode)}
                                className={`h-7 px-2.5 text-[10px] font-medium transition-colors ${preference.mode === mode ? 'bg-[#D4A652] text-[#0B0B0A]' : 'bg-[#1B1A18] text-[#77736A] hover:text-[#D4A652]'}`}
                              >
                                {mode === 'auto' ? 'AI + brand' : mode === 'off' ? 'Off' : 'Prefer'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {preference.mode === 'prefer' && (
                          <div className="mt-2 grid grid-cols-2 gap-5 pl-1 pr-2">
                            <PreferenceSlider
                              label="Frequency"
                              value={preference.frequency ?? 0.5}
                              onChange={(value) => updateFamilyValue(family, 'frequency', value)}
                            />
                            <PreferenceSlider
                              label="Intensity"
                              value={preference.intensity ?? 0.5}
                              onChange={(value) => updateFamilyValue(family, 'intensity', value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[#1C1B19] pt-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-[#D8D4CA]">Pacing</p>
                    <div className="grid grid-cols-2 overflow-hidden rounded border border-[#282724]">
                      {(['auto', 'prefer'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPacingMode(mode)}
                          className={`h-7 px-3 text-[10px] font-medium transition-colors ${pacingMode === mode ? 'bg-[#D4A652] text-[#0B0B0A]' : 'bg-[#1B1A18] text-[#77736A] hover:text-[#D4A652]'}`}
                        >
                          {mode === 'auto' ? 'AI + brand' : 'Prefer'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pacingMode === 'prefer' && (
                    <div className="mt-2 px-1">
                      <PreferenceSlider label="Calm to fast" value={pacingIntensity} onChange={setPacingIntensity} />
                    </div>
                  )}
                </div>

                {familyPreferences.music?.mode === 'prefer' && (
                  <Textarea
                    aria-label="Music preference"
                    placeholder="Music preference, mood, instruments, or uploaded-track instruction"
                    value={musicPrompt}
                    onChange={(event) => setMusicPrompt(event.target.value)}
                    rows={2}
                    maxLength={500}
                    className="mt-2 resize-none bg-[#1B1A18] text-[12px] text-[#ECE9E1] border-[#282724] placeholder:text-[#454340]"
                  />
                )}
                <Textarea
                  aria-label="Additional creative direction"
                  placeholder="Additional creative direction (optional)"
                  value={creativeNotes}
                  onChange={(event) => setCreativeNotes(event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="mt-2 resize-none bg-[#1B1A18] text-[12px] text-[#ECE9E1] border-[#282724] placeholder:text-[#454340]"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 mt-3.5 pt-3 border-t border-[#1C1B19]">
                <Button
                  variant="ghost"
                  onClick={() => {
                    onCancel();
                    resetState();
                  }}
                  className="bg-transparent border border-[#282724] text-[#7A776E] hover:border-[#D4A652] hover:text-[#D4A652] rounded text-[13px]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmWithOptions}
                  className="gap-1.5 bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold rounded text-[13px] border-none"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Edit with These Settings
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreferenceSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.06em] text-[#5F5E5A]">
        <span>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) => onChange(next / 100)}
        className="[&_[role=slider]]:border-[#D4A652]/60 [&_[role=slider]]:bg-[#151411] [&_[data-orientation=horizontal]>span]:bg-[#D4A652]"
      />
    </div>
  );
}
