'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageIcon, Video } from 'lucide-react';
import type { AutoEditOptions } from '@/components/editron/project/auto-edit-dialog';
import { EditorialPreferenceControls } from '@/components/editron/project/editorial-preference-controls';
import {
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';

interface FootageBatchIntakeDialogProps {
  files: File[];
  open: boolean;
  onConfirm: (options: AutoEditOptions) => void;
  onCancel: () => void;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function FootageBatchIntakeDialog({
  files,
  open,
  onConfirm,
  onCancel,
}: FootageBatchIntakeDialogProps) {
  const [platform, setPlatform] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [userIntent, setUserIntent] = useState('');
  const [script, setScript] = useState('');
  const [editorialPreferences, setEditorialPreferences] = useState<EditorialPreferences>({});

  const inventory = useMemo(() => {
    let videos = 0;
    let images = 0;
    let bytes = 0;
    for (const file of files) {
      if (file.type.startsWith('video/')) videos += 1;
      if (file.type.startsWith('image/')) images += 1;
      bytes += file.size;
    }
    return { videos, images, bytes };
  }, [files]);

  const reset = useCallback(() => {
    setPlatform('auto');
    setAspectRatio('16:9');
    setUserIntent('');
    setScript('');
    setEditorialPreferences({});
  }, []);

  const close = useCallback(() => {
    reset();
    onCancel();
  }, [onCancel, reset]);

  const confirm = useCallback(() => {
    const options: AutoEditOptions = {};
    if (platform !== 'auto') options.platform = platform;
    if (aspectRatio !== '16:9') options.aspectRatio = aspectRatio;
    if (userIntent.trim()) options.userIntent = userIntent.trim();
    if (script.trim()) options.script = script.trim();
    const normalizedPreferences = normalizeEditorialPreferences(editorialPreferences);
    if (normalizedPreferences) options.editorialPreferences = normalizedPreferences;
    onConfirm(options);
    reset();
  }, [aspectRatio, editorialPreferences, onConfirm, platform, reset, script, userIntent]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
      <DialogContent className="max-h-[92vh] max-w-[680px] overflow-y-auto bg-[#131312] border-[#282724] text-[#ECE9E1]">
        <DialogHeader>
          <DialogTitle>Prepare multi-source footage</DialogTitle>
          <DialogDescription className="text-[#B5B2A8]">
            Confirm the edit intent before Editron uploads and analyzes this batch.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-[#282724] bg-[#1B1A18] p-3">
          <div className="flex flex-wrap gap-2 text-xs text-[#B5B2A8]">
            <span className="inline-flex items-center gap-1 rounded border border-[#282724] px-2 py-1">
              <Video className="h-3.5 w-3.5 text-[#D4A652]" />
              {inventory.videos} video{inventory.videos === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded border border-[#282724] px-2 py-1">
              <ImageIcon className="h-3.5 w-3.5 text-[#D4A652]" />
              {inventory.images} image{inventory.images === 1 ? '' : 's'}
            </span>
            <span className="rounded border border-[#282724] px-2 py-1">{formatMegabytes(inventory.bytes)}</span>
          </div>
          <div className="mt-3 max-h-28 space-y-1 overflow-y-auto text-xs text-[#7A776E]">
            {files.map((file) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0">{file.type || 'unknown'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-[#B5B2A8]">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-[#0B0B0A] border-[#282724]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="instagram">Instagram Reels</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[#B5B2A8]">Aspect ratio</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="bg-[#0B0B0A] border-[#282724]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9 landscape</SelectItem>
                  <SelectItem value="9:16">9:16 vertical</SelectItem>
                  <SelectItem value="1:1">1:1 square</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[#B5B2A8]">What should this become?</Label>
            <Textarea
              className="min-h-[82px] bg-[#0B0B0A] border-[#282724]"
              placeholder="Example: turn these clips into a 45 second founder-style reel with the demo as b-roll."
              value={userIntent}
              onChange={(event) => setUserIntent(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[#B5B2A8]">Optional script / outline</Label>
            <Textarea
              className="min-h-[82px] bg-[#0B0B0A] border-[#282724]"
              placeholder="Paste a script or rough beat list if these assets should be matched to specific points."
              value={script}
              onChange={(event) => setScript(event.target.value)}
            />
          </div>

          <EditorialPreferenceControls value={editorialPreferences} onChange={setEditorialPreferences} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="button" onClick={confirm} disabled={files.length === 0}>
            Upload and analyze batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
