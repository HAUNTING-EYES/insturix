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
      <DialogContent className="max-w-lg p-6">
        <DialogHeader className="pb-2">
          <DialogDescription className="sr-only">
            Configure how AI edits your video
          </DialogDescription>
        </DialogHeader>

        {/* File info strip */}
        <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3">
          <FileVideo className="h-8 w-8 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-200">
              {file?.name}
            </p>
            <p className="text-xs text-neutral-500">{fileSizeMB} MB</p>
          </div>
        </div>

        {/* Large file proxy notice */}
        {file && file.size > 100 * 1024 * 1024 && (
          <div className="rounded-md border border-blue-800/50 bg-blue-950/30 px-3 py-2 text-xs text-blue-300">
            Large file — editor will open with a preview-quality version while the full resolution uploads in the background. Final render uses the original.
          </div>
        )}

        {/* Quick edit CTA */}
        <Button
          onClick={handleQuickEdit}
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          size="lg"
        >
          <Sparkles className="h-4 w-4" />
          Quick Edit — Let AI Decide Everything
        </Button>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
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

        {/* Advanced options — collapsible */}
        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            {/* Platform */}
            <div className="space-y-1.5">
              <Label htmlFor="ae-platform" className="text-xs text-neutral-400">
                Platform
              </Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="ae-platform" className="h-9">
                  <SelectValue placeholder="Auto-detect" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-1.5">
              <Label htmlFor="ae-aspect" className="text-xs text-neutral-400">
                Aspect Ratio
              </Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger id="ae-aspect" className="h-9">
                  <SelectValue placeholder="16:9" />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User Intent */}
            <div className="space-y-1.5">
              <Label htmlFor="ae-intent" className="text-xs text-neutral-400">
                What is this video for?
                <span className="ml-1 text-neutral-600">(optional)</span>
              </Label>
              <Textarea
                id="ae-intent"
                placeholder="e.g. Gym promo for Instagram, product demo for LinkedIn, travel vlog for YouTube..."
                value={userIntent}
                onChange={(e) => setUserIntent(e.target.value)}
                rows={2}
                className="resize-none text-sm"
                maxLength={500}
              />
            </div>

            {/* Script / Narration */}
            <div className="space-y-1.5">
              <Label htmlFor="ae-script" className="text-xs text-neutral-400">
                Script / Narration
                <span className="ml-1 text-neutral-600">(optional — AI generates captions from this)</span>
              </Label>
              <Textarea
                id="ae-script"
                placeholder="Paste your script here if you have one. AI will use it as narration over your footage."
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                maxLength={5000}
              />
            </div>

            {/* Confirm with options */}
            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  onCancel();
                  resetState();
                }}
                className="text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmWithOptions}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Edit with These Settings
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
