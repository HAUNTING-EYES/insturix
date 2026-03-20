'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Loader2, ArrowRight, Palette, ImageIcon, Film, Check, Sparkles, Users, RefreshCw, X, Eye, MessageSquare, Send, Trash2, Pencil } from 'lucide-react';
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
  | 'exporting'              // parsing scenes
  | 'extracting-subjects'    // LLM extracting key subjects
  | 'generating-references'  // generating reference images
  | 'reviewing-references'   // user approves/rejects reference images
  | 'storyboard'             // generating AI storyboard images (with IP-adapter if refs approved)
  | 'reviewing-storyboard'   // user reviews storyboard images before video gen
  | 'generating-videos'      // generating AI video clips
  | 'generating-voiceover'   // generating AI voiceover
  | 'finalizing'             // creating Editron project
  | 'done';

interface SubjectRef {
  subjectId: string;
  name: string;
  category: string;
  imageUrl?: string;
  status: string;
  scenesAppearingIn: number[];
  visualDescription?: string;
}

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
  const [imageModel, setImageModel] = useState('flux-schnell');
  const [videoModel, setVideoModel] = useState('kling-1.6');
  const [error, setError] = useState('');

  // Results
  const [scenes, setScenes] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [storyboardId, setStoryboardId] = useState('');
  const [storyboardScenes, setStoryboardScenes] = useState<any[]>([]);
  const [videoProgress, setVideoProgress] = useState({ done: 0, total: 0 });
  const [videosGenerated, setVideosGenerated] = useState(false);

  // Reference image state
  const [refSetId, setRefSetId] = useState('');
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [approvedSubjectIds, setApprovedSubjectIds] = useState<Set<string>>(new Set());
  const [regeneratingSubjectId, setRegeneratingSubjectId] = useState<string | null>(null);
  const [feedbackSubjectId, setFeedbackSubjectId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [overallMusicPrompt, setOverallMusicPrompt] = useState('');

  // Request notification permission on mount
  React.useEffect(() => {
    if (open && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [open]);

  const sendNotification = (title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  const reset = () => {
    setStep('configure');
    setTitle('');
    setAspectRatio('16:9');
    setGenerateStoryboard(true);
    setGenerateVideos(true);
    setArtStyle('cinematic');
    setImageModel('flux-schnell');
    setVideoModel('kling-1.6');
    setError('');
    setScenes([]);
    setProjectId('');
    setStoryboardId('');
    setStoryboardScenes([]);
    setVideoProgress({ done: 0, total: 0 });
    setVideosGenerated(false);
    setRefSetId('');
    setSubjects([]);
    setApprovedSubjectIds(new Set());
    setRegeneratingSubjectId(null);
    setFeedbackSubjectId(null);
    setFeedbackText('');
    setEditingSubjectId(null);
    setEditingDescription('');
    setOverallMusicPrompt('');
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Calculate total credit cost
  const estimateCredits = () => {
    // Count actual scene headers — not total blocks. Header blocks are real
    // scene boundaries; paragraphs/examples/actions within them are content.
    // Also skip meta headers (overview, creative direction, etc.)
    const META_RE = /\b(overview|introduction|creative direction|aesthetic|production notes|branding|key message|target audience|format|guidelines|style guide|tone|direction|deliverables|platforms?|conclusion|summary|notes|credits|appendix)\b/i;
    let sceneCount = 0;
    if (blocks.length > 0) {
      for (const block of blocks) {
        if (block.kind === 'header') {
          const text = typeof block.content === 'string' ? block.content :
            Array.isArray(block.content) ? block.content.map((c: any) => c.text || '').join('') : '';
          if (!META_RE.test(text)) sceneCount++;
        }
      }
      // If no headers found, estimate from timestamps in plain text
      if (sceneCount === 0 && plainText) {
        const timestamps = plainText.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g);
        sceneCount = timestamps ? timestamps.length : Math.max(1, Math.ceil(blocks.length / 5));
      }
      sceneCount = Math.max(1, sceneCount);
    } else {
      sceneCount = 3; // default estimate
    }
    let total = 1; // base import cost
    if (generateStoryboard) {
      total += sceneCount * 1; // ~1 credit/subject for reference images (est: 1 subject per scene)
      total += sceneCount * 2; // 2 credits/scene for storyboard images
    }
    if (generateStoryboard && generateVideos) total += sceneCount * 3; // 3 credits/scene for videos
    total += sceneCount * 1; // 1 credit/scene for voiceover
    return total;
  };

  // ─── Phase 1: Parse scenes → Extract subjects → Generate reference images → Pause for review
  const handleExport = async () => {
    setStep('exporting');
    setError('');

    try {
      // ─── Step 1: Parse script into scenes ─────────────────────
      const exportRes = await fetch('/api/services/thinkforge/script/export-for-editron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, plainText, sessionId, scriptId, aspectRatio, artStyle }),
      });

      if (!exportRes.ok) {
        const data = await exportRes.json();
        throw new Error(data.error || 'Failed to export script');
      }

      const exportData = await exportRes.json();
      setScenes(exportData.scenes);
      setOverallMusicPrompt(exportData.overallMusicPrompt || '');
      const projectTitle = title || exportData.title || 'Untitled Script';
      setTitle(projectTitle);

      // ─── Step 2: Extract subjects via LLM (if storyboard enabled) ──
      if (generateStoryboard && exportData.scenes.length > 0) {
        setStep('extracting-subjects');

        const extractRes = await fetch('/api/services/pipeline/reference-images/extract-subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: exportData.scenes, artStyle }),
        });

        if (extractRes.ok) {
          const extractData = await extractRes.json();
          const extractedSubjects = extractData.subjects || [];

          if (extractedSubjects.length > 0) {
            // ─── Step 3: Generate reference images ────────────────
            setStep('generating-references');

            const genRes = await fetch('/api/services/pipeline/reference-images/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subjects: extractedSubjects,
                artStyle,
                sourceScriptId: scriptId,
              }),
            });

            if (genRes.ok) {
              const genData = await genRes.json();
              setRefSetId(genData.refSetId || '');
              setSubjects(genData.subjects || []);
              // Auto-approve all initially (user can reject individually)
              const allIds = new Set<string>((genData.subjects || []).map((s: SubjectRef) => s.subjectId));
              setApprovedSubjectIds(allIds);

              sendNotification('Reference Images Ready', `${genData.subjects?.length || 0} character/subject references generated. Review them now.`);

              // ─── PAUSE: Show review UI ──────────────────────────
              setStep('reviewing-references');
              return; // Stop here — user must approve and click Continue
            } else {
              console.warn('[ExportToEditron] Reference image generation failed, skipping');
            }
          } else {
            console.log('[ExportToEditron] No subjects extracted, skipping reference images');
          }
        } else {
          console.warn('[ExportToEditron] Subject extraction failed, skipping reference images');
        }
      }

      // If no storyboard or reference image extraction failed, go straight to phase 2
      await handlePhase2(exportData.scenes, title || exportData.title || 'Untitled Script');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
      sendNotification('Export Failed', err.message || 'Something went wrong during export.');
    }
  };

  // ─── Phase 2: Generate storyboard images → Pause for review
  const handlePhase2 = async (parsedScenes?: any[], projectTitle?: string) => {
    const currentScenes = parsedScenes || scenes;
    const currentTitle = projectTitle || title || 'Untitled Script';
    setError('');

    try {
      // Build approved references for IP-adapter + video prompt refinement
      const approved = subjects
        .filter((s) => approvedSubjectIds.has(s.subjectId) && s.imageUrl)
        .map((s) => ({
          subjectId: s.subjectId,
          name: s.name,
          category: s.category,
          visualDescription: s.visualDescription || '',
          imageUrl: s.imageUrl!,
          scenesAppearingIn: s.scenesAppearingIn,
        }));

      // ─── Step 4: Generate storyboard images ─────────────────
      if (generateStoryboard && currentScenes.length > 0) {
        setStep('storyboard');

        // Approve all refs in DB if we have a refSetId
        if (refSetId && approved.length > 0) {
          await fetch(`/api/services/pipeline/reference-images/${refSetId}/approve-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => {}); // non-blocking
        }

        const sbRes = await fetch('/api/services/pipeline/storyboard/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenes: currentScenes,
            title: currentTitle,
            sourceScriptId: scriptId,
            aspectRatio,
            modelId: imageModel !== 'flux-schnell' ? imageModel : undefined,
            overallMusicPrompt,
            styleGuide: {
              artStyle,
              colorPalette: [],
            },
            refSetId: refSetId || undefined,
            approvedReferences: approved.length > 0 ? approved : undefined,
          }),
        });

        if (sbRes.ok) {
          const sbData = await sbRes.json();
          const sbId = sbData.storyboardId || '';
          setStoryboardId(sbId);
          const sbScenes = sbData.scenes || [];
          setStoryboardScenes(sbScenes);

          const generatedCount = sbScenes.filter((s: any) => s.imageUrl).length;
          sendNotification('Storyboard Ready', `${generatedCount}/${sbScenes.length} scene images generated. Review them now.`);

          if (generatedCount > 0) {
            // ─── PAUSE: Show storyboard review UI ────────────
            setStep('reviewing-storyboard');
            return; // Stop here — user reviews storyboard and clicks Continue
          }
        } else {
          const errData = await sbRes.json().catch(() => ({}));
          console.error('[ExportToEditron] Storyboard generation failed:', errData.error);
          setError(errData.error || 'Storyboard generation failed');
        }
      }

      // If no storyboard or generation failed, skip to phase 3
      await handlePhase3();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
      sendNotification('Export Failed', err.message || 'Something went wrong during export.');
    }
  };

  // ─── Phase 3: Videos → Voiceover → Finalize (after storyboard review)
  const handlePhase3 = async () => {
    setError('');
    const sbId = storyboardId;
    const sbImages = storyboardScenes.filter((s: any) => s.imageUrl);

    try {
      // ─── Step 5: Generate AI video clips (optional) ────────
      if (generateVideos && sbId && sbImages.length > 0) {
        setStep('generating-videos');
        setVideoProgress({ done: 0, total: sbImages.length });

        let succeeded = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < sbImages.length; i++) {
          const sceneIdx = sbImages[i].sceneIndex;
          try {
            const videoRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/generate-videos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                aspectRatio,
                sceneIndices: [sceneIdx],
                videoModel: videoModel !== 'kling-1.6' ? videoModel : undefined,
              }),
            });

            const videoData = await videoRes.json().catch(() => ({}));

            if (videoRes.ok && (videoData.summary?.succeeded || 0) > 0) {
              succeeded++;
              console.log(`[ExportToEditron] Scene ${sceneIdx} video generated`);
            } else {
              failed++;
              const errMsg = videoData.error || `Scene ${sceneIdx} failed (${videoRes.status})`;
              errors.push(errMsg);
              console.error(`[ExportToEditron] Scene ${sceneIdx} video failed:`, errMsg);
            }
          } catch (videoErr: any) {
            failed++;
            errors.push(`Scene ${sceneIdx}: ${videoErr.message}`);
            console.error(`[ExportToEditron] Scene ${sceneIdx} video exception:`, videoErr);
          }

          setVideoProgress({ done: succeeded + failed, total: sbImages.length });
        }

        setVideosGenerated(succeeded > 0);
        console.log(`[ExportToEditron] Video generation complete: ${succeeded} succeeded, ${failed} failed`);
        sendNotification('Video Clips Generated', `${succeeded} of ${sbImages.length} video clips ready. Generating voiceover next...`);

        if (succeeded === 0 && failed > 0) {
          setError(`Videos: ${errors.join('; ')}. Continuing with storyboard images.`);
        } else if (failed > 0) {
          setError(`Videos: ${failed}/${sbImages.length} clips failed. Continuing with available clips.`);
        }
      }

      // ─── Step 6: Generate AI voiceover ─────────────────────
      if (sbId) {
        setStep('generating-voiceover');
        try {
          const voRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/voiceover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: 'aura-asteria-en' }),
          });
          const voData = await voRes.json().catch(() => ({}));
          if (voRes.ok && voData.scenesProcessed > 0) {
            console.log(`[ExportToEditron] Voiceover: ${voData.scenesProcessed}/${voData.totalScenes} scenes`);
          } else {
            const voErr = voData.error || `Voiceover failed (${voRes.status})`;
            console.error('[ExportToEditron] Voiceover failed:', voErr);
            setError((prev) => prev ? `${prev} | Voiceover: ${voErr}` : `Voiceover: ${voErr}`);
          }
        } catch (voErr: any) {
          console.error('[ExportToEditron] Voiceover error:', voErr.message);
          setError((prev) => prev ? `${prev} | Voiceover error: ${voErr.message}` : `Voiceover error: ${voErr.message}`);
        }
      }

      // ─── Step 7: Create Editron project ────────────────────
      setStep('finalizing');

      if (sbId) {
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
        // No storyboard — import scenes directly
        const importRes = await fetch('/api/services/editron/projects/import-from-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenes,
            title: title || 'Untitled Script',
            aspectRatio,
            sourceScriptId: scriptId,
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
      sendNotification('Video Project Ready!', 'Your AI video has been generated and is ready to edit in Editron.');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
      sendNotification('Export Failed', err.message || 'Something went wrong during export.');
    }
  };

  // ─── Regenerate a single subject's reference image (with optional feedback)
  const handleRegenerateSubject = async (subjectId: string, feedback?: string) => {
    if (!refSetId || regeneratingSubjectId) return;
    setRegeneratingSubjectId(subjectId);
    setFeedbackSubjectId(null);
    setFeedbackText('');

    try {
      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artStyle, feedback: feedback || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubjects((prev) =>
          prev.map((s) =>
            s.subjectId === subjectId
              ? { ...s, imageUrl: data.imageUrl, status: 'generated' }
              : s,
          ),
        );
        // Auto-approve after regeneration
        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(subjectId);
          return next;
        });
      }
    } catch (err) {
      console.error('[ExportToEditron] Regenerate subject failed:', err);
    } finally {
      setRegeneratingSubjectId(null);
    }
  };

  // Toggle feedback prompt for a subject
  const toggleFeedbackPrompt = (subjectId: string) => {
    if (feedbackSubjectId === subjectId) {
      setFeedbackSubjectId(null);
      setFeedbackText('');
    } else {
      setFeedbackSubjectId(subjectId);
      setFeedbackText('');
      setEditingSubjectId(null); // close edit if open
    }
  };

  // Delete a subject entirely (remove from list)
  const handleDeleteSubject = (subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.subjectId !== subjectId));
    setApprovedSubjectIds((prev) => {
      const next = new Set(prev);
      next.delete(subjectId);
      return next;
    });
    if (feedbackSubjectId === subjectId) { setFeedbackSubjectId(null); setFeedbackText(''); }
    if (editingSubjectId === subjectId) { setEditingSubjectId(null); setEditingDescription(''); }
  };

  // Start editing a subject's visual description
  const handleStartEditDescription = (subjectId: string) => {
    const subject = subjects.find((s) => s.subjectId === subjectId);
    if (!subject) return;
    setEditingSubjectId(subjectId);
    setEditingDescription(subject.visualDescription || '');
    setFeedbackSubjectId(null); // close feedback if open
  };

  // Save edited description and regenerate
  const handleSaveDescriptionAndRegenerate = async (subjectId: string) => {
    if (!editingDescription.trim()) return;
    // Update the subject's description locally
    setSubjects((prev) =>
      prev.map((s) =>
        s.subjectId === subjectId
          ? { ...s, visualDescription: editingDescription.trim() }
          : s,
      ),
    );
    setEditingSubjectId(null);
    // Regenerate with the new description (send it as feedback override)
    await handleRegenerateSubject(subjectId, editingDescription.trim());
  };

  const stepDescription = () => {
    switch (step) {
      case 'configure': return 'Convert your script into a video project';
      case 'exporting': return 'Parsing scenes from your script...';
      case 'extracting-subjects': return 'Identifying key subjects for visual consistency...';
      case 'generating-references': return 'Generating reference images for subjects...';
      case 'reviewing-references': return 'Review and approve reference images';
      case 'storyboard': return 'Generating AI storyboard images...';
      case 'reviewing-storyboard': return 'Review storyboard images before video generation';
      case 'generating-videos': return 'Generating AI video clips...';
      case 'generating-voiceover': return 'Generating AI voiceover...';
      case 'finalizing': return 'Building your Editron project...';
      case 'done': return 'Your project is ready!';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`${step === 'reviewing-references' ? 'sm:max-w-[600px]' : 'sm:max-w-[520px]'} bg-zinc-900 border-zinc-700 text-zinc-100`}>
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

              {/* Image Model Selector (when storyboard enabled) */}
              {generateStoryboard && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pl-8"
                >
                  <label className="text-sm text-zinc-400 mb-1 block">Image Model</label>
                  <Select value={imageModel} onValueChange={setImageModel}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="flux-schnell">FLUX Schnell (Fast)</SelectItem>
                      <SelectItem value="flux-dev">FLUX Dev (Quality)</SelectItem>
                      <SelectItem value="flux-pro">FLUX Pro 1.1</SelectItem>
                      <SelectItem value="imagen4">Google Imagen 4</SelectItem>
                      <SelectItem value="seedream-v4">Seedream V4</SelectItem>
                      <SelectItem value="seedream-v4.5">Seedream V4.5</SelectItem>
                      <SelectItem value="recraft-v3">Recraft V3</SelectItem>
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

              {/* Video Model Selector (when videos enabled) */}
              {generateStoryboard && generateVideos && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pl-8"
                >
                  <label className="text-sm text-zinc-400 mb-1 block">Video Model</label>
                  <Select value={videoModel} onValueChange={setVideoModel}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="kling-1.6">Kling 1.6 Pro (Default)</SelectItem>
                      <SelectItem value="kling-1.5">Kling 1.5 Pro</SelectItem>
                      <SelectItem value="minimax">MiniMax Video</SelectItem>
                      <SelectItem value="runway-gen3">Runway Gen-3 Turbo</SelectItem>
                      <SelectItem value="luma-ray2">Luma Ray 2</SelectItem>
                    </SelectContent>
                  </Select>
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
          {(step === 'exporting' || step === 'extracting-subjects' || step === 'generating-references' || step === 'storyboard' || step === 'generating-videos' || step === 'generating-voiceover' || step === 'finalizing') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2 space-y-4"
            >
              <EditronImportAnimation
                sceneCount={scenes.length || 4}
                step={step === 'exporting' ? 'exporting' : step === 'storyboard' ? 'storyboard' : step === 'finalizing' ? 'exporting' : 'storyboard'}
              />

              {/* Step progress indicator */}
              <div className="space-y-2">
                <StepIndicator label="Parse scenes" active={step === 'exporting'} done={step !== 'exporting'} />
                {generateStoryboard && (
                  <>
                    <StepIndicator label="Extract key subjects" active={step === 'extracting-subjects'} done={!['exporting', 'extracting-subjects'].includes(step)} />
                    <StepIndicator label="Generate reference images" active={step === 'generating-references'} done={!['exporting', 'extracting-subjects', 'generating-references'].includes(step)} />
                    <StepIndicator label="Generate storyboard images" active={step === 'storyboard'} done={['reviewing-storyboard', 'generating-videos', 'generating-voiceover', 'finalizing', 'done'].includes(step)} />
                  </>
                )}
                {generateStoryboard && generateVideos && (
                  <StepIndicator
                    label={
                      step === 'generating-videos' && videoProgress.total > 0
                        ? `Generating video clips (${videoProgress.done}/${videoProgress.total})`
                        : 'Generate AI video clips'
                    }
                    active={step === 'generating-videos'}
                    done={['generating-voiceover', 'finalizing', 'done'].includes(step)}
                  />
                )}
                <StepIndicator label="Generate AI voiceover" active={step === 'generating-voiceover'} done={['finalizing', 'done'].includes(step)} />
                <StepIndicator label="Create Editron project" active={step === 'finalizing'} done={(step as string) === 'done'} />
              </div>

              <p className="text-xs text-zinc-500 text-center">
                {step === 'exporting' && 'Parsing scenes and building timeline...'}
                {step === 'extracting-subjects' && 'AI is identifying characters, locations, and key subjects...'}
                {step === 'generating-references' && 'Generating reference images for visual consistency...'}
                {step === 'storyboard' && `Generating storyboard images for ${scenes.length} scenes...`}
                {step === 'generating-videos' && 'Animating storyboard images into video clips — this takes a few minutes...'}
                {step === 'generating-voiceover' && 'Generating AI voiceover narration...'}
                {step === 'finalizing' && 'Assembling your video project with music & voiceover...'}
              </p>
              {error && (
                <p className="text-xs text-amber-400 text-center mt-1">{error}</p>
              )}
            </motion.div>
          )}

          {/* ─── Reference Image Review Step ───────────────────── */}
          {step === 'reviewing-references' && (
            <motion.div
              key="review-refs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-2 space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-purple-400" />
                <p className="text-sm font-medium text-zinc-200">
                  Review Reference Images ({approvedSubjectIds.size}/{subjects.length} approved)
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                These reference images will guide AI to maintain visual consistency across all scenes. Toggle to approve/reject, or regenerate any subject.
              </p>

              <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {subjects.map((subject) => {
                  const isApproved = approvedSubjectIds.has(subject.subjectId);
                  const isRegenerating = regeneratingSubjectId === subject.subjectId;
                  const showFeedback = feedbackSubjectId === subject.subjectId;

                  return (
                    <div
                      key={subject.subjectId}
                      className={`relative rounded-lg border overflow-hidden transition-all ${
                        isApproved
                          ? 'border-green-500/40 bg-green-500/5'
                          : 'border-red-500/30 bg-red-500/5'
                      }`}
                    >
                      {/* Image */}
                      <div className="aspect-square bg-zinc-800 relative">
                        {subject.imageUrl ? (
                          <img
                            src={subject.imageUrl}
                            alt={subject.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}

                        {/* Regenerating overlay */}
                        {isRegenerating && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center flex-col gap-1">
                            <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                            <span className="text-[10px] text-zinc-400">Regenerating...</span>
                          </div>
                        )}

                        {/* Approve/reject toggle */}
                        <button
                          onClick={() => {
                            setApprovedSubjectIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(subject.subjectId)) {
                                next.delete(subject.subjectId);
                              } else {
                                next.add(subject.subjectId);
                              }
                              return next;
                            });
                          }}
                          className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-colors ${
                            isApproved
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500/80 text-white hover:bg-red-600'
                          }`}
                          title={isApproved ? 'Approved — click to reject' : 'Rejected — click to approve'}
                        >
                          {isApproved ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </button>

                        {/* Top-left: Regenerate + Delete */}
                        <div className="absolute top-1.5 left-1.5 flex gap-1">
                          <button
                            onClick={() => handleRegenerateSubject(subject.subjectId)}
                            disabled={isRegenerating}
                            className="p-1 rounded-full bg-zinc-700/80 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200 transition-colors"
                            title="Regenerate (random)"
                          >
                            <RefreshCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDeleteSubject(subject.subjectId)}
                            className="p-1 rounded-full bg-zinc-700/80 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
                            title="Remove this subject"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Bottom-right: Edit description + Feedback */}
                        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
                          <button
                            onClick={() => handleStartEditDescription(subject.subjectId)}
                            disabled={isRegenerating}
                            className={`p-1 rounded-full transition-colors ${
                              editingSubjectId === subject.subjectId
                                ? 'bg-blue-500 text-white'
                                : 'bg-zinc-700/80 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
                            }`}
                            title="Edit description & regenerate"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => toggleFeedbackPrompt(subject.subjectId)}
                            disabled={isRegenerating}
                            className={`p-1 rounded-full transition-colors ${
                              showFeedback
                                ? 'bg-purple-500 text-white'
                                : 'bg-zinc-700/80 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
                            }`}
                            title="Quick feedback"
                          >
                            <MessageSquare className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-2">
                        <p className="text-xs font-medium text-zinc-200 truncate">{subject.name}</p>
                        <p className="text-[10px] text-zinc-500">
                          {subject.category} · Scenes {subject.scenesAppearingIn?.join(', ')}
                        </p>
                        {/* Show visual description preview (truncated) */}
                        {subject.visualDescription && editingSubjectId !== subject.subjectId && (
                          <p className="text-[9px] text-zinc-600 mt-0.5 line-clamp-2">{subject.visualDescription}</p>
                        )}
                      </div>

                      {/* Edit description UI */}
                      {editingSubjectId === subject.subjectId && (
                        <div className="px-2 pb-2 space-y-1">
                          <p className="text-[10px] text-blue-400 font-medium">Edit description & regenerate:</p>
                          <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-600 text-zinc-200 text-[11px] rounded p-1.5 resize-none focus:outline-none focus:border-blue-500"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditingSubjectId(null); setEditingDescription(''); }}
                              className="text-zinc-400 h-6 px-2 text-[10px]"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveDescriptionAndRegenerate(subject.subjectId)}
                              disabled={!editingDescription.trim() || isRegenerating}
                              className="bg-blue-600 hover:bg-blue-700 text-white h-6 px-2 text-[10px]"
                            >
                              {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save & Regenerate'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Quick feedback prompt input */}
                      {showFeedback && editingSubjectId !== subject.subjectId && (
                        <div className="px-2 pb-2">
                          <div className="flex gap-1">
                            <Input
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="e.g. make it darker, remove text..."
                              className="bg-zinc-800 border-zinc-600 text-zinc-200 text-xs h-7 flex-1"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && feedbackText.trim()) {
                                  handleRegenerateSubject(subject.subjectId, feedbackText.trim());
                                }
                              }}
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => handleRegenerateSubject(subject.subjectId, feedbackText.trim())}
                              disabled={!feedbackText.trim() || isRegenerating}
                              className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-2"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
            </motion.div>
          )}

          {/* ─── Storyboard Review Step ──────────────────────── */}
          {step === 'reviewing-storyboard' && (
            <motion.div
              key="review-storyboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-2 space-y-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <ImageIcon className="h-4 w-4 text-green-400" />
                <p className="text-sm font-medium text-zinc-200">
                  Review Storyboard ({storyboardScenes.filter((s: any) => s.imageUrl).length}/{storyboardScenes.length} generated)
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                These images will be used as starting frames for AI video generation. Review them before proceeding.
              </p>

              <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {storyboardScenes.map((scene: any) => (
                  <div
                    key={scene.sceneIndex}
                    className={`relative rounded-lg border overflow-hidden ${
                      scene.imageUrl
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="aspect-video bg-zinc-800 relative">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <X className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-medium text-zinc-200 truncate">{scene.title}</p>
                      <p className="text-[9px] text-zinc-500">
                        {scene.imageUrl ? 'Ready' : 'Failed'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {storyboardScenes.some((s: any) => !s.imageUrl) && (
                <p className="text-xs text-amber-400">
                  {storyboardScenes.filter((s: any) => !s.imageUrl).length} scene(s) failed to generate. Videos will only be created for successful scenes.
                </p>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}
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

              {/* Warnings from video generation or other steps */}
              {error && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400">{error}</p>
                </div>
              )}

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
          {step === 'reviewing-references' && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  // Skip references entirely — proceed without IP-adapter
                  setApprovedSubjectIds(new Set());
                  handlePhase2();
                }}
                className="text-zinc-400"
              >
                Skip References
              </Button>
              <Button
                onClick={() => handlePhase2()}
                disabled={regeneratingSubjectId !== null}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Continue with {approvedSubjectIds.size} Reference{approvedSubjectIds.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {step === 'reviewing-storyboard' && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  // Skip video gen — go straight to voiceover + finalize
                  setGenerateVideos(false);
                  handlePhase3();
                }}
                className="text-zinc-400"
              >
                Skip Videos
              </Button>
              <Button
                onClick={() => handlePhase3()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {generateVideos
                  ? `Generate ${storyboardScenes.filter((s: any) => s.imageUrl).length} Videos`
                  : 'Continue to Finalize'}
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
