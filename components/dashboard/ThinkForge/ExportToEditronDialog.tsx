'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Loader2, ArrowRight, Palette, ImageIcon, Check } from 'lucide-react';
import { EditronImportAnimation } from './EditronImportAnimation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExportToEditronDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ThinkForge blocks from the current script */
  blocks: any[];
  /** Optional session/script IDs for tracking */
  sessionId?: string;
  scriptId?: string;
}

type ExportStep = 'configure' | 'exporting' | 'storyboard' | 'done';

export function ExportToEditronDialog({
  open,
  onOpenChange,
  blocks,
  sessionId,
  scriptId,
}: ExportToEditronDialogProps) {
  const [step, setStep] = useState<ExportStep>('configure');
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [generateStoryboard, setGenerateStoryboard] = useState(false);
  const [artStyle, setArtStyle] = useState('cinematic');
  const [error, setError] = useState('');

  // Results
  const [scenes, setScenes] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [storyboardId, setStoryboardId] = useState('');
  const [storyboardScenes, setStoryboardScenes] = useState<any[]>([]);

  const reset = () => {
    setStep('configure');
    setTitle('');
    setAspectRatio('16:9');
    setGenerateStoryboard(false);
    setArtStyle('cinematic');
    setError('');
    setScenes([]);
    setProjectId('');
    setStoryboardId('');
    setStoryboardScenes([]);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleExport = async () => {
    setStep('exporting');
    setError('');

    try {
      // Step 1: Convert blocks to scenes
      const exportRes = await fetch('/api/services/thinkforge/script/export-for-editron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, sessionId, scriptId }),
      });

      if (!exportRes.ok) {
        const data = await exportRes.json();
        throw new Error(data.error || 'Failed to export script');
      }

      const exportData = await exportRes.json();
      setScenes(exportData.scenes);
      const projectTitle = title || exportData.title || 'Untitled Script';
      setTitle(projectTitle);

      // Step 2: Optionally generate storyboard images BEFORE creating the project
      // so we can place them directly on the timeline
      let sbImages: Array<{ sceneIndex: number; imageUrl: string }> = [];
      let sbId = '';

      if (generateStoryboard && exportData.scenes.length > 0) {
        setStep('storyboard');

        const sbRes = await fetch('/api/services/pipeline/storyboard/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenes: exportData.scenes,
            title: projectTitle,
            sourceScriptId: scriptId,
            aspectRatio,
            styleGuide: {
              artStyle,
              colorPalette: [],
            },
          }),
        });

        if (sbRes.ok) {
          const sbData = await sbRes.json();
          sbId = sbData.storyboardId || '';
          setStoryboardId(sbId);
          const sbScenes = sbData.scenes || [];
          setStoryboardScenes(sbScenes);

          // Collect successfully generated images for timeline placement
          sbImages = sbScenes
            .filter((s: any) => s.imageUrl)
            .map((s: any) => ({ sceneIndex: s.sceneIndex, imageUrl: s.imageUrl }));
        }
        // Don't fail the whole export if storyboard fails
      }

      // Step 3: Import into Editron with storyboard images on the timeline
      setStep('exporting');
      const importRes = await fetch('/api/services/editron/projects/import-from-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: exportData.scenes,
          title: projectTitle,
          aspectRatio,
          sourceScriptId: scriptId,
          storyboardImages: sbImages.length > 0 ? sbImages : undefined,
        }),
      });

      if (!importRes.ok) {
        const data = await importRes.json();
        throw new Error(data.error || 'Failed to create Editron project');
      }

      const importData = await importRes.json();
      setProjectId(importData.projectId);

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] bg-zinc-900 border-zinc-700 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Video className="h-5 w-5 text-green-500" />
            Export to Editron
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === 'configure' && 'Convert your script into a video project'}
            {step === 'exporting' && 'Creating your Editron project...'}
            {step === 'storyboard' && 'Generating storyboard images...'}
            {step === 'done' && 'Your project is ready!'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Configure Step */}
          {step === 'configure' && (
            <motion.div
              key="configure"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 py-2"
            >
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Project Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-detected from script..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-200"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Aspect Ratio</label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                    <SelectItem value="9:16">9:16 (Shorts/Reels)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="4:5">4:5 (Instagram)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  generateStoryboard
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                }`}
                onClick={() => setGenerateStoryboard(!generateStoryboard)}
              >
                <ImageIcon className={`h-5 w-5 ${generateStoryboard ? 'text-green-500' : 'text-zinc-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Generate Storyboard</p>
                  <p className="text-xs text-zinc-500">AI images for each scene (2 credits/scene)</p>
                </div>
                {generateStoryboard && <Check className="h-4 w-4 text-green-500" />}
              </div>

              {generateStoryboard && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pl-8"
                >
                  <label className="text-sm text-zinc-400 mb-1 block">Art Style</label>
                  <Select value={artStyle} onValueChange={setArtStyle}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 max-h-64">
                      {/* Realistic */}
                      <SelectItem value="cinematic">Cinematic / Film</SelectItem>
                      <SelectItem value="photorealistic">Photorealistic</SelectItem>
                      <SelectItem value="documentary">Documentary / Raw</SelectItem>
                      <SelectItem value="noir">Noir / Black &amp; White</SelectItem>
                      {/* Animated / Illustrated */}
                      <SelectItem value="anime">Anime / Manga</SelectItem>
                      <SelectItem value="cartoon">Cartoon / Toon</SelectItem>
                      <SelectItem value="comic-book">Comic Book / Graphic Novel</SelectItem>
                      <SelectItem value="pixel-art">Pixel Art / Retro</SelectItem>
                      {/* Stylized */}
                      <SelectItem value="watercolor">Watercolor / Painterly</SelectItem>
                      <SelectItem value="oil-painting">Oil Painting / Classical</SelectItem>
                      <SelectItem value="sketch">Pencil Sketch / Line Art</SelectItem>
                      <SelectItem value="pop-art">Pop Art / Bold Colors</SelectItem>
                      <SelectItem value="cyberpunk">Cyberpunk / Neon</SelectItem>
                      <SelectItem value="fantasy">Fantasy / Concept Art</SelectItem>
                      <SelectItem value="horror">Horror / Dark</SelectItem>
                      {/* Technical */}
                      <SelectItem value="3d-render">3D Render</SelectItem>
                      <SelectItem value="isometric">Isometric / Flat 3D</SelectItem>
                      <SelectItem value="minimalist">Minimalist / Flat</SelectItem>
                      <SelectItem value="collage">Collage / Mixed Media</SelectItem>
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}
            </motion.div>
          )}

          {/* Exporting / Storyboard Step — animated timeline preview */}
          {(step === 'exporting' || step === 'storyboard') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2 space-y-3"
            >
              <EditronImportAnimation
                sceneCount={scenes.length || 4}
                step={step}
              />
              <p className="text-xs text-zinc-500 text-center">
                {step === 'exporting'
                  ? 'Parsing scenes and building timeline...'
                  : `Generating images for ${scenes.length} scenes — this may take a moment...`}
              </p>
            </motion.div>
          )}

          {/* Done Step */}
          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 py-2"
            >
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <Check className="h-6 w-6 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-zinc-200">Project Created</p>
                  <p className="text-xs text-zinc-400">
                    {scenes.length} scenes • {aspectRatio}
                    {storyboardId && ` • Storyboard generated`}
                  </p>
                </div>
              </div>

              {/* Storyboard preview */}
              {storyboardScenes.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Storyboard Preview</p>
                  <div className="grid grid-cols-3 gap-2">
                    {storyboardScenes.slice(0, 6).map((s: any) => (
                      <div
                        key={s.sceneIndex}
                        className="aspect-video bg-zinc-800 rounded overflow-hidden relative"
                      >
                        {s.imageUrl ? (
                          <img
                            src={s.imageUrl}
                            alt={s.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-zinc-300 px-1 py-0.5 truncate">
                          {s.title}
                        </span>
                      </div>
                    ))}
                  </div>
                  {storyboardScenes.length > 6 && (
                    <p className="text-[10px] text-zinc-500 mt-1">+{storyboardScenes.length - 6} more scenes</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          {step === 'configure' && (
            <>
              <Button variant="ghost" onClick={handleClose} className="text-zinc-400">
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                disabled={blocks.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Export to Editron
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <Button variant="ghost" onClick={handleClose} className="text-zinc-400">
                Close
              </Button>
              {storyboardId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = `/dashboard/storyboard/${storyboardId}`;
                  }}
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Edit Storyboard
                </Button>
              )}
              <Button
                onClick={() => {
                  window.location.href = `/dashboard/editron/project/${projectId}`;
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Video className="h-4 w-4 mr-2" />
                Open in Editron
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
