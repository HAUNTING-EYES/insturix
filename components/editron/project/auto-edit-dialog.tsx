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
 * Backend fields supported (from-asset/route.ts):
 *   script, referenceAssetId, imageAssetIds, userIntent, platform
 *
 * Phase 1 scope: userIntent, platform, script, aspectRatio.
 * Phase 2 (future): referenceAssetId picker, imageAssetIds picker.
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FileVideo, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

/** Options forwarded to the from-asset backend endpoint. */
export interface AutoEditOptions {
  userIntent?: string;
  platform?: string;
  script?: string;
  aspectRatio?: string;
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

export function AutoEditDialog({ file, onConfirm, onCancel }: AutoEditDialogProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [platform, setPlatform] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [userIntent, setUserIntent] = useState('');
  const [script, setScript] = useState('');

  const resetState = useCallback(() => {
    setShowAdvanced(false);
    setPlatform('auto');
    setAspectRatio('16:9');
    setUserIntent('');
    setScript('');
  }, []);

  const handleQuickEdit = useCallback(() => {
    if (!file) return;
    // Quick path — no options, just go
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
    onConfirm(file, options);
    resetState();
  }, [file, platform, aspectRatio, userIntent, script, onConfirm, resetState]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCancel();
      resetState();
    }
  }, [onCancel, resetState]);

  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(1) : '0';

  return (
    <Dialog open={file !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        className="p-0 border-[#282724] overflow-hidden [&>button]:hidden"
        style={{ background: '#131312', width: 440, maxWidth: '92vw', borderRadius: 8 }}
      >
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

        <div className="px-5 pt-5 pb-4">
          {/* File card */}
          <div className="flex items-center gap-3.5 rounded-md border border-[#282724] bg-[#1B1A18] px-4 py-3.5 relative">
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

          {/* Quick Edit CTA — solid gold with shimmer */}
          <button
            type="button"
            onClick={handleQuickEdit}
            className="ae-cta flex w-full items-center justify-center gap-2.5 mt-4 px-4 py-3.5 rounded-md bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] text-[14px] font-bold transition-colors"
          >
            <Sparkles className="h-[18px] w-[18px] relative z-[1]" />
            <span className="relative z-[1]">Quick Edit — Let AI Decide</span>
          </button>

          {/* "or" divider */}
          <div className="flex items-center gap-3 my-2.5">
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
                Customize edit settings
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
