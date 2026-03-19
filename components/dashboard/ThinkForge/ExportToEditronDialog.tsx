'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Loader2, ArrowRight, Palette, ImageIcon, Film, Check, Sparkles } from 'lucide-react';
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
  /** Optional plain text of the script (for timestamped format detection) */
  plainText?: string;
  /** Optional session/script IDs for tracking */
  sessionId?: string;
  scriptId?: string;
}

type ExportStep =
  | 'configure'
  | 'exporting'        // parsing scenes
  | 'storyboard'       // generating AI images
  | 'generating-videos' // generating AI video clips
  | 'finalizing'       // creating Editron project
  | 'done';

export function ExportToEditronDialog({
  open,
  onOpenChange,
  blocks,
  plainText,
  sessionId,
  scriptId,
}: ExportToEditronDialogProps) {
  const [step, setStep] = useState<ExportStep>('configure');
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [generateStoryboard, setGenerateStoryboard] = useState(true); // ON by default
  const [generateVideos, setGenerateVideos] = useState(true); // ON by default
  const [artStyle, setArtStyle] = useState('cinematic');
  const [error, setError] = useState('');

  // Results
  const [scenes, setScenes] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [storyboardId, setStoryboardId] = useState('');
  const [storyboardScenes, setStoryboardScenes] = useState<any[]>([]);
  const [videoProgress, setVideoProgress] = useState({ done: 0, total: 0 });
  const [videosGenerated, setVideosGenerated] = useState(false);

  const reset = () => {
    setStep('configure');
    setTitle('');
    setAspectRatio('16:9');
    setGenerateStoryboard(true);
    setGenerateVideos(true);
    setArtStyle('cinematic');
    setError('');
    setScenes([]);
    setProjectId('');
    setStoryboardId('');
    setStoryboardScenes([]);
    setVideoProgress({ done: 0, total: 0 });
    setVideosGenerated(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Calculate total credit cost
  const estimateCredits = () => {
    const sceneCount = blocks.length > 0 ? Math.max(1, Math.ceil(blocks.length / 3)) : 4; // rough estimate
    let total = 1; // base import cost
    if (generateStoryboard) total += sceneCount * 2; // 2 credits/scene for images
    if (generateStoryboard && generateVideos) total += sceneCount * 3; // 3 credits/scene for videos
    return total;
  };

  const handleExport = async () => {
    setStep('exporting');
    setError('');

    try {
      // ─── Step 1: Parse script into scenes ─────────────────────
      const exportRes = await fetch('/api/services/thinkforge/script/export-for-editron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, plainText, sessionId, scriptId }),
      });

      if (!exportRes.ok) {
        const data = await exportRes.json();
        throw new Error(data.error || 'Failed to export script');
      }

      const exportData = await exportRes.json();
      setScenes(exportData.scenes);
      const projectTitle = title || exportData.title || 'Untitled Script';
      setTitle(projectTitle);

      // ─── Step 2: Generate storyboard images (optional) ────────
      let sbImages: Array<{ sceneIndex: number; imageUrl: string; assetId?: string }> = [];
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

          sbImages = sbScenes
            .filter((s: any) => s.imageUrl)
            .map((s: any) => ({ sceneIndex: s.sceneIndex, imageUrl: s.imageUrl, assetId: s.imageAssetId }));
        }
        // Don't fail if storyboard generation fails
      }

      // ─── Step 3: Generate AI video clips (optional) ───────────
      // Only if storyboard was generated and videos toggle is ON
      if (generateVideos && sbId && sbImages.length > 0) {
        setStep('generating-videos');
        setVideoProgress({ done: 0, total: sbImages.length });

        try {
          const videoRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/generate-videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aspectRatio,
              // Generate for all scenes that have images
            }),
          });

          if (videoRes.ok) {
            const videoData = await videoRes.json();
            const succeeded = videoData.summary?.succeeded || 0;
            setVideoProgress({ done: succeeded, total: sbImages.length });
            setVideosGenerated(succeeded > 0);
          }
        } catch (videoErr) {
          console.error('Video generation failed:', videoErr);
          // Don't fail the whole export — continue with storyboard images
        }
      }

      // ─── Step 4: Create Editron project ───────────────────────
      setStep('finalizing');

      if (sbId) {
        // Use finalize endpoint — it reads storyboard from DB
        // and prefers videoUrl > imageUrl for backgrounds
        const finalizeRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aspectRatio,
            includeVoiceover: true,
            includeCaptions: true,
          }),
        });

        if (!finalizeRes.ok) {
          const data = await finalizeRes.json();
          throw new Error(data.error || 'Failed to finalize storyboard');
        }

        const finalizeData = await finalizeRes.json();
        setProjectId(finalizeData.projectId);
      } else {
        // No storyboard — use import-from-script (images/gradients only)
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
      }

      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
    }
  };

  const stepDescription = () => {
    switch (step) {
      case 'configure': return 'Convert your script into a video project';
      case 'exporting': return 'Parsing scenes from your script...';
      case 'storyboard': return 'Generating AI storyboard images...';
      case 'generating-videos': return 'Generating AI video clips...';
      case 'finalizing': return 'Building your Editron project...';
      case 'done': return 'Your project is ready!';
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
            {stepDescription()}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ─── Configure Step ─────────────────────────────────── */}
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

              {/* Storyboard Toggle */}
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  generateStoryboard
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                }`}
                onClick={() => {
                  const next = !generateStoryboard;
                  setGenerateStoryboard(next);
                  if (!next) setGenerateVideos(false); // can't gen videos without storyboard
                }}
              >
                <ImageIcon className={`h-5 w-5 ${generateStoryboard ? 'text-green-500' : 'text-zinc-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Generate Storyboard</p>
                  <p className="text-xs text-zinc-500">AI images for each scene (2 credits/scene)</p>
                </div>
                {generateStoryboard && <Check className="h-4 w-4 text-green-500" />}
              </div>

              {/* Art Style (when storyboard enabled) */}
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
                    <SelectContent className="bg-zinc-800 border-zinc-700 max-h-72 overflow-y-auto">
                      {/* Realistic */}
                      <SelectItem value="cinematic">Cinematic / Film</SelectItem>
                      <SelectItem value="photorealistic">Photorealistic</SelectItem>
                      <SelectItem value="documentary">Documentary / Raw</SelectItem>
                      <SelectItem value="noir">Noir / Black &amp; White</SelectItem>
                      <SelectItem value="neon-noir">Neon Noir / Blade Runner</SelectItem>
                      <SelectItem value="vintage">Vintage / Retro Film</SelectItem>
                      {/* Animated / Illustrated */}
                      <SelectItem value="anime">Anime / Manga</SelectItem>
                      <SelectItem value="cartoon">Cartoon / Toon</SelectItem>
                      <SelectItem value="comic-book">Comic Book / Graphic Novel</SelectItem>
                      <SelectItem value="pixel-art">Pixel Art / Retro</SelectItem>
                      <SelectItem value="claymation">Claymation / Stop Motion</SelectItem>
                      <SelectItem value="storybook">Storybook / Fairy Tale</SelectItem>
                      {/* Stylized */}
                      <SelectItem value="watercolor">Watercolor / Painterly</SelectItem>
                      <SelectItem value="oil-painting">Oil Painting / Classical</SelectItem>
                      <SelectItem value="impressionist">Impressionist / Monet</SelectItem>
                      <SelectItem value="sketch">Pencil Sketch / Line Art</SelectItem>
                      <SelectItem value="pop-art">Pop Art / Bold Colors</SelectItem>
                      <SelectItem value="ukiyo">Ukiyo-e / Japanese Woodblock</SelectItem>
                      <SelectItem value="surrealism">Surrealism / Dreamlike</SelectItem>
                      <SelectItem value="expressionism">Expressionism / Angular</SelectItem>
                      {/* Genre-specific */}
                      <SelectItem value="cyberpunk">Cyberpunk / Neon</SelectItem>
                      <SelectItem value="fantasy">Fantasy / Concept Art</SelectItem>
                      <SelectItem value="horror">Horror / Dark</SelectItem>
                      <SelectItem value="steampunk">Steampunk / Victorian</SelectItem>
                      <SelectItem value="gothic">Gothic / Dark Cathedral</SelectItem>
                      <SelectItem value="concept-art">Concept Art / Matte Painting</SelectItem>
                      {/* Modern / Aesthetic */}
                      <SelectItem value="vaporwave">Vaporwave / Synthwave</SelectItem>
                      <SelectItem value="lo-fi">Lo-Fi / Cozy Nostalgic</SelectItem>
                      <SelectItem value="pastel">Pastel / Soft Dreamy</SelectItem>
                      <SelectItem value="grunge">Grunge / Urban Decay</SelectItem>
                      <SelectItem value="glitch-art">Glitch Art / Digital</SelectItem>
                      <SelectItem value="art-deco">Art Deco / 1920s Glamour</SelectItem>
                      {/* Cinematic Genres */}
                      <SelectItem value="action-blockbuster">Action / Blockbuster</SelectItem>
                      <SelectItem value="sci-fi">Sci-Fi / Futuristic</SelectItem>
                      <SelectItem value="thriller">Thriller / Suspense</SelectItem>
                      <SelectItem value="western">Western / Frontier</SelectItem>
                      <SelectItem value="war-film">War Film / Military</SelectItem>
                      <SelectItem value="superhero">Superhero / Marvel Style</SelectItem>
                      <SelectItem value="rom-com">Romantic / Light</SelectItem>
                      <SelectItem value="indie-film">Indie Film / A24</SelectItem>
                      {/* Technical */}
                      <SelectItem value="3d-render">3D Render</SelectItem>
                      <SelectItem value="isometric">Isometric / Flat 3D</SelectItem>
                      <SelectItem value="minimalist">Minimalist / Flat</SelectItem>
                      <SelectItem value="brutalist">Brutalist / Raw</SelectItem>
                      <SelectItem value="collage">Collage / Mixed Media</SelectItem>
                      <SelectItem value="motion-graphics">Motion Graphics / Flat Design</SelectItem>
                      <SelectItem value="architectural">Architectural / Technical</SelectItem>
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {/* Video Generation Toggle (when storyboard enabled) */}
              {generateStoryboard && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      generateVideos
                        ? 'bg-purple-500/10 border-purple-500/30'
                        : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                    }`}
                    onClick={() => setGenerateVideos(!generateVideos)}
                  >
                    <Film className={`h-5 w-5 ${generateVideos ? 'text-purple-400' : 'text-zinc-400'}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-200">Generate AI Videos</p>
                      <p className="text-xs text-zinc-500">
                        Animate storyboard images into video clips (3 credits/scene)
                      </p>
                    </div>
                    {generateVideos && <Check className="h-4 w-4 text-purple-400" />}
                  </div>
                </motion.div>
              )}

              {/* Credit cost estimate */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-zinc-500">Estimated cost</span>
                <span className="text-xs font-medium text-amber-400">
                  ~{estimateCredits()} credits
                </span>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </motion.div>
          )}

          {/* ─── Processing Steps ──────────────────────────────── */}
          {(step === 'exporting' || step === 'storyboard' || step === 'generating-videos' || step === 'finalizing') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2 space-y-4"
            >
              <EditronImportAnimation
                sceneCount={scenes.length || 4}
                step={step === 'generating-videos' ? 'storyboard' : step === 'finalizing' ? 'exporting' : step}
              />

              {/* Step progress indicator */}
              <div className="space-y-2">
                <StepIndicator label="Parse scenes" active={step === 'exporting'} done={step !== 'exporting'} />
                {generateStoryboard && (
                  <StepIndicator label="Generate storyboard images" active={step === 'storyboard'} done={['generating-videos', 'finalizing', 'done'].includes(step)} />
                )}
                {generateStoryboard && generateVideos && (
                  <StepIndicator
                    label={
                      step === 'generating-videos' && videoProgress.total > 0
                        ? `Generating video clips (${videoProgress.done}/${videoProgress.total})`
                        : 'Generate AI video clips'
                    }
                    active={step === 'generating-videos'}
                    done={['finalizing', 'done'].includes(step)}
                  />
                )}
                <StepIndicator label="Create Editron project" active={step === 'finalizing'} done={step === 'done'} />
              </div>

              <p className="text-xs text-zinc-500 text-center">
                {step === 'exporting' && 'Parsing scenes and building timeline...'}
                {step === 'storyboard' && `Generating images for ${scenes.length} scenes...`}
                {step === 'generating-videos' && 'Animating storyboard images into video clips — this takes a few minutes...'}
                {step === 'finalizing' && 'Assembling your video project...'}
              </p>
            </motion.div>
          )}

          {/* ─── Done Step ─────────────────────────────────────── */}
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
                    {storyboardId && ` • Storyboard`}
                    {videosGenerated && ` • AI Videos`}
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
                <Sparkles className="h-4 w-4 mr-2" />
                {generateStoryboard && generateVideos
                  ? 'Generate Full AI Video'
                  : generateStoryboard
                  ? 'Export with Storyboard'
                  : 'Export to Editron'}
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

// ─── Step Progress Indicator ───────────────────────────────────
function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {done ? (
        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
      ) : active ? (
        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-zinc-600 shrink-0" />
      )}
      <span className={done ? 'text-zinc-500 line-through' : active ? 'text-zinc-200 font-medium' : 'text-zinc-500'}>
        {label}
      </span>
    </div>
  );
}
