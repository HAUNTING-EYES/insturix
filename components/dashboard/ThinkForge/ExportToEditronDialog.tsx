'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Loader2, ArrowRight, Palette, ImageIcon, Film, Check, Sparkles, Users, RefreshCw, X, Eye, MessageSquare, Send, Trash2, Pencil, Plus, Upload } from 'lucide-react';
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
import { getAutoSelectedProfile } from '@/lib/editron/services/profile-detection-service';
import { EDIT_PROFILES } from '@/lib/editron/data/edit-profiles';
import type { DetectionResult, ProfileId } from '@/lib/editron/data/edit-profile-types';

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
  | 'profile-selection'      // user confirms/overrides detected edit profile
  | 'extracting-subjects'    // LLM extracting key subjects
  | 'generating-references'  // generating reference images
  | 'reviewing-references'   // user approves/rejects reference images
  | 'storyboard'             // generating AI storyboard images (with IP-adapter if refs approved)
  | 'reviewing-storyboard'   // user reviews storyboard images before video gen
  | 'generating-videos'      // generating AI video clips
  | 'generating-voiceover'   // generating AI voiceover
  | 'finalizing'             // creating Editron project
  | 'directing'              // Director Agent applying edit profile
  | 'done';

interface SubjectRef {
  subjectId: string;
  name: string;
  category: string;
  imageUrl?: string;
  status: string;
  scenesAppearingIn: number[];
  visualDescription?: string;
  priority?: 'hero' | 'suggested';
}

/** Suggested subject from script analysis — no image yet, one-click to generate */
interface SuggestedSubject {
  id: string;
  name: string;
  category: string;
  visualDescription: string;
  scenesAppearingIn: number[];
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
  const [videoModel, setVideoModel] = useState('auto');
  const prewarmFiredRef = useRef(false);
  const [selectedVoice, setSelectedVoice] = useState('aura-asteria-en');
  const [availableVoices, setAvailableVoices] = useState<Array<{ id: string; name: string; gender: string; style: string }>>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState('');

  // Profile detection
  const [detectedProfile, setDetectedProfile] = useState<{ profileId: string; confidence: number; reasoning: string[]; name: string; description: string } | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [directorProgress, setDirectorProgress] = useState<{ step: number; total: number; desc: string }>({ step: 0, total: 0, desc: '' });

  // Results
  const [scenes, setScenes] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [audioGenerating, setAudioGenerating] = useState(false);
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

  // Suggested subjects from script analysis (not yet generated)
  const [suggestedSubjects, setSuggestedSubjects] = useState<SuggestedSubject[]>([]);
  const [generatingSuggestedId, setGeneratingSuggestedId] = useState<string | null>(null);
  const [scriptSearchQuery, setScriptSearchQuery] = useState('');

  // Add new subject state (manual entry)
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCategory, setNewSubjectCategory] = useState<string>('character');
  const [newSubjectDescription, setNewSubjectDescription] = useState('');
  const [newSubjectScenes, setNewSubjectScenes] = useState('');

  // Style guide metadata from export (persisted across phases)
  const [colorPalette, setColorPalette] = useState<string[]>([]);
  const [characterDescriptions, setCharacterDescriptions] = useState<string | undefined>(undefined);
  const [environmentNotes, setEnvironmentNotes] = useState<string | undefined>(undefined);
  const [globalEditDirections, setGlobalEditDirections] = useState<any>(undefined);

  // Storyboard scene edit state
  const [regeneratingSceneIdx, setRegeneratingSceneIdx] = useState<number | null>(null);
  const [sceneFeedbackIdx, setSceneFeedbackIdx] = useState<number | null>(null);
  const [sceneFeedbackText, setSceneFeedbackText] = useState('');

  // Request notification permission on mount
  React.useEffect(() => {
    if (open && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [open]);

  // Fetch available TTS voices
  React.useEffect(() => {
    if (open) {
      fetch('/api/services/pipeline/voices')
        .then((res) => res.ok ? res.json() : ({ voices: [] }))
        .then((data: any) => {
          if (data.voices?.length > 0) {
            setAvailableVoices(data.voices);
          }
        })
        .catch(() => {});
    }
    return () => {
      // Stop any playing preview on close
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, [open]);

  // Pre-warm fal.ai video model worker on dialog open (fire-and-forget, once per session)
  React.useEffect(() => {
    if (open && !prewarmFiredRef.current) {
      prewarmFiredRef.current = true;
      try {
        // Resolve the model to prewarm: if "auto", warm the default (kling-2.1)
        const modelToWarm = videoModel === 'auto' ? 'kling-2.1' : videoModel;
        fetch('/api/services/pipeline/prewarm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelToWarm }),
        }).catch(() => {});
      } catch {
        // Silent — prewarm is best-effort
      }
    }
    if (!open) {
      // Reset so re-opening the dialog triggers a new prewarm
      prewarmFiredRef.current = false;
    }
  }, [open, videoModel]);

  const handlePreviewVoice = async (voiceId: string) => {
    // Stop current preview if playing
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingVoice === voiceId) {
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voiceId);
    try {
      const res = await fetch('/api/services/pipeline/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId }),
      });
      if (!res.ok) throw new Error('Preview failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewingVoice(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPreviewingVoice(null);
    }
  };

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
    setVideoModel('auto');
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
    setColorPalette([]);
    setCharacterDescriptions(undefined);
    setEnvironmentNotes(undefined);
    setSuggestedSubjects([]);
    setGeneratingSuggestedId(null);
    setScriptSearchQuery('');
    setShowAddSubject(false);
    setAddingSubject(false);
    setNewSubjectName('');
    setNewSubjectCategory('character');
    setNewSubjectDescription('');
    setNewSubjectScenes('');
    setRegeneratingSceneIdx(null);
    setSceneFeedbackIdx(null);
    setSceneFeedbackText('');
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
        const data = await exportRes.json().catch(() => ({}));
        throw new Error(data.error || `Failed to export script (${exportRes.status})`);
      }

      const exportData = await exportRes.json().catch(() => null);
      if (!exportData) throw new Error('Invalid response from export service');
      setScenes(exportData.scenes);
      setOverallMusicPrompt(exportData.overallMusicPrompt || '');
      setColorPalette(exportData.colorPalette || []);
      setCharacterDescriptions(exportData.characterDescriptions || undefined);
      setEnvironmentNotes(exportData.environmentNotes || undefined);
      setGlobalEditDirections(exportData.globalEditDirections || undefined);
      const projectTitle = title || exportData.title || 'Untitled Script';
      setTitle(projectTitle);

      // ─── Profile Auto-Detection ─────────────────────────────────
      // Detect the best edit profile from the parsed script metadata.
      // This is a pure client-side function (no API call).
      try {
        const metadata = {
          scenes: (exportData.scenes || []).map((s: any) => ({
            narration: s.narration,
            visualDescription: s.visualDescription,
            mood: s.mood,
            audioDescription: s.audioDescription,
            rawProductionNotes: s.rawProductionNotes,
          })),
          overallMusicPrompt: exportData.overallMusicPrompt,
          characterDescriptions: exportData.characterDescriptions,
          colorPalette: exportData.colorPalette,
          environmentNotes: exportData.environmentNotes,
          globalEditDirections: exportData.globalEditDirections,
        };
        const detected = getAutoSelectedProfile(metadata);
        setDetectedProfile({
          profileId: detected.detection.profileId,
          confidence: detected.detection.confidence,
          reasoning: detected.detection.reasoning,
          name: detected.profile.name,
          description: detected.profile.description,
        });
        setSelectedProfileId(detected.detection.profileId);
        console.log(`[ExportToEditron] Profile detected: ${detected.profile.name} (${(detected.detection.confidence * 100).toFixed(0)}%)`);

        // ─── PAUSE: Show profile selection step ──────────────────
        if (generateStoryboard) {
          setStep('profile-selection');
          return; // Stop here — user reviews profile and clicks Continue → handlePostProfileSelection()
        }
      } catch (profileErr) {
        console.warn('[ExportToEditron] Profile detection failed, using default:', profileErr);
        setSelectedProfileId('G-01');
      }

      // ─── Steps 2+3: Extract subjects AND generate hero references in parallel ──
      // (Also called by handlePostProfileSelection after profile is confirmed)
      await runSubjectExtractionAndReferences();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
      sendNotification('Export Failed', err.message || 'Something went wrong during export.');
    }
  };

  // ─── Resume after profile selection confirmed ───────────────────
  const handlePostProfileSelection = async () => {
    setError('');
    try {
      await runSubjectExtractionAndReferences();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStep('configure');
    }
  };

  // ─── Subject extraction + reference image generation ────────────
  // Extracted into its own function so it can be called from both
  // handleExport (no profile pause) and handlePostProfileSelection.
  const runSubjectExtractionAndReferences = async () => {
      // ─── Steps 2+3: Extract subjects AND generate hero references in parallel ──
      // As soon as extraction returns, we kick off hero reference image generation
      // immediately — no separate waiting step. This parallelizes the pipeline.
      if (generateStoryboard && scenes.length > 0) {
        setStep('extracting-subjects');

        const extractRes = await fetch('/api/services/pipeline/reference-images/extract-subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes, artStyle }),
        });

        if (extractRes.ok) {
          const extractData = await extractRes.json().catch(() => ({}));
          const allExtracted = extractData.subjects || [];

          if (allExtracted.length > 0) {
            // Split into hero (auto-generate) and suggested (show as options)
            const heroSubjects = allExtracted.filter((s: any) => s.priority === 'hero');
            const suggestedOnly = allExtracted.filter((s: any) => s.priority !== 'hero');

            // Store suggested subjects for the review UI
            setSuggestedSubjects(suggestedOnly.map((s: any) => ({
              id: s.id,
              name: s.name,
              category: s.category,
              visualDescription: s.visualDescription,
              scenesAppearingIn: s.scenesAppearingIn || [],
            })));

            // Only generate images for hero subjects (1-2 max)
            const subjectsToGenerate = heroSubjects.length > 0 ? heroSubjects : allExtracted.slice(0, 2);

            // Immediately kick off hero reference generation — no separate step wait.
            // The UI transitions to 'generating-references' while extraction data is already available.
            setStep('generating-references');

            const genRes = await fetch('/api/services/pipeline/reference-images/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subjects: subjectsToGenerate,
                artStyle,
                sourceScriptId: scriptId,
                modelId: imageModel !== 'flux-schnell' ? imageModel : undefined,
              }),
            });

            if (genRes.ok) {
              const genData = await genRes.json().catch(() => ({}));
              setRefSetId(genData.refSetId || '');
              setSubjects((genData.subjects || []).map((s: any) => ({ ...s, priority: 'hero' })));
              // Auto-approve all initially (user can reject individually)
              const allIds = new Set<string>((genData.subjects || []).map((s: SubjectRef) => s.subjectId));
              setApprovedSubjectIds(allIds);

              // Remove any suggested subjects that were actually generated as heroes
              const generatedIds = new Set(subjectsToGenerate.map((s: any) => s.id));
              setSuggestedSubjects((prev) => prev.filter((s) => !generatedIds.has(s.id)));

              sendNotification('Reference Images Ready', `${genData.subjects?.length || 0} references generated. ${suggestedOnly.length} more suggestions from your script.`);

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
      await handlePhase2(scenes, title);
  };

  // ─── Phase 2: Generate storyboard images → Pause for review
  const handlePhase2 = async (parsedScenes?: any[], projectTitle?: string) => {
    const currentScenes = parsedScenes || scenes;
    const currentTitle = projectTitle || title || 'Untitled Script';
    setError('');

    if (!currentScenes || currentScenes.length === 0) {
      setError('No scenes available. Please restart the export process.');
      setStep('configure');
      return;
    }

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
              colorPalette: colorPalette,
              characterDescriptions: characterDescriptions,
              environmentNotes: environmentNotes,
            },
            refSetId: refSetId || undefined,
            approvedReferences: approved.length > 0 ? approved : undefined,
            globalEditDirections: globalEditDirections || undefined,
          }),
        });

        if (sbRes.ok) {
          const sbData = await sbRes.json().catch(() => ({}));
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
          const errorMsg = errData.error || 'Storyboard generation failed';
          console.error('[ExportToEditron] Storyboard generation failed:', errorMsg);
          setError(errorMsg);
          // Don't just fall through — give user a clear message
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
    let createdProjectId = '';

    try {
      // ─── Step 5: Generate AI video clips (optional) ────────
      // ─── Step 5: Enqueue video generation (async, parallel) ────
      // Enqueue all scenes for parallel processing, then poll for completion.
      // No more browser timeout issues — the enqueue call returns in <10s.
      if (generateVideos && sbId && sbImages.length > 0) {
        setStep('generating-videos');
        setVideoProgress({ done: 0, total: sbImages.length });

        try {
          const allSceneIndices = sbImages.map((s: any) => s.sceneIndex);
          console.log(`[ExportToEditron] Enqueuing ${allSceneIndices.length} scenes for video generation`);

          // Step 5a: Enqueue (fast — builds prompts + pushes to Redis queue)
          const enqueueRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/generate-videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aspectRatio,
              sceneIndices: allSceneIndices,
              videoModel,
            }),
          });

          const enqueueData = await enqueueRes.json().catch(() => ({}));

          if (!enqueueData.success) {
            throw new Error(enqueueData.error || 'Failed to start video generation');
          }

          // ─── Handle direct fallback mode (Redis unavailable) ──────
          if (enqueueData.async === false && enqueueData.isComplete) {
            // Direct generation completed — no polling needed
            const completed = enqueueData.completed || 0;
            const failed = enqueueData.failed || 0;
            console.log(`[ExportToEditron] Videos generated directly (fallback): ${completed} done, ${failed} failed`);
            setVideoProgress({ done: completed + failed, total: enqueueData.totalScenes || allSceneIndices.length });
            setVideosGenerated(completed > 0);
            if (failed > 0 && completed > 0) {
              setError(`${failed} of ${enqueueData.totalScenes} video clips failed. Continuing with available clips.`);
            } else if (completed === 0) {
              const sceneErrors = enqueueData.scenes?.filter((s: any) => s.error).map((s: any) => `Scene ${s.sceneIndex}: ${s.error}`).join('; ') || '';
              setError(`Video generation failed for all scenes. ${sceneErrors.substring(0, 200)}`);
            }
            // Skip polling — go straight to voiceover
          } else if (enqueueData.batchId) {
            // ─── Async queue mode — poll for completion ──────────────
            const batchId = enqueueData.batchId;
            console.log(`[ExportToEditron] Video batch enqueued: ${batchId} (${enqueueData.totalScenes} scenes)`);

            const MAX_POLL_ATTEMPTS = 90; // 90 × 10s = 15 minutes max
            const POLL_INTERVAL_MS = 10_000;

            let videosCompleted = false;
            for (let poll = 0; poll < MAX_POLL_ATTEMPTS; poll++) {
              await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

              try {
                const statusRes = await fetch(
                  `/api/services/pipeline/storyboard/${sbId}/generate-videos/status?batchId=${batchId}`,
                );
                const statusData = await statusRes.json().catch(() => ({}));

                if (statusData.success) {
                  const completed = statusData.completed || 0;
                  const failed = statusData.failed || 0;
                  setVideoProgress({ done: completed + failed, total: statusData.totalScenes || sbImages.length });

                  console.log(`[ExportToEditron] Video poll #${poll + 1}: ${completed} done, ${failed} failed, status=${statusData.status}`);

                  if (statusData.isComplete) {
                    setVideosGenerated(completed > 0);
                    sendNotification('Video Clips Generated', `${completed} of ${statusData.totalScenes} video clips ready.`);

                    if (completed === 0 && failed > 0) {
                      const sceneErrors = statusData.scenes?.filter((s: any) => s.error).map((s: any) => `Scene ${s.sceneIndex}: ${s.error}`).join('; ') || '';
                      setError(`Video generation failed for all ${failed} scenes. ${sceneErrors.substring(0, 200) || 'The AI video model may be temporarily unavailable.'}`);
                    } else if (failed > 0) {
                      setError(`${failed} of ${statusData.totalScenes} video clips failed. Continuing with available clips.`);
                    }
                    videosCompleted = true;
                    break;
                  }
                }
              } catch (pollErr: any) {
                console.warn(`[ExportToEditron] Video poll #${poll + 1} failed:`, pollErr.message);
              }
            }

            if (!videosCompleted) {
              console.warn('[ExportToEditron] Video generation polling timed out after 15 minutes');
              setError('Video generation is still processing in the background. Your videos will appear in Editron when ready.');
              setVideosGenerated(false);
            }
          }
        } catch (videoErr: any) {
          console.error(`[ExportToEditron] Video generation exception:`, videoErr);
          setError(`Videos: ${videoErr.message}. Continuing with storyboard images.`);
        }
      }

      // ─── Step 6: Generate AI voiceover ─────────────────────
      if (sbId) {
        setStep('generating-voiceover');
        try {
          const voRes = await fetch(`/api/services/pipeline/storyboard/${sbId}/voiceover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: selectedVoice || undefined }),
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
          const data = await finalizeRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to finalize storyboard (${finalizeRes.status})`);
        }

        const finalizeData = await finalizeRes.json().catch(() => null);
        if (!finalizeData) throw new Error('Invalid response from finalize service');
        createdProjectId = finalizeData.projectId;
        setProjectId(createdProjectId);
        if (finalizeData.audioGenerating) setAudioGenerating(true);
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
          const data = await importRes.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create Editron project (${importRes.status})`);
        }

        const importData = await importRes.json().catch(() => null);
        if (!importData) throw new Error('Invalid response from import service');
        createdProjectId = importData.projectId;
        setProjectId(createdProjectId);
      }

      // ─── Step 8: Director Agent — Apply edit profile ───────
      const currentProjectId = createdProjectId;
      if (selectedProfileId && currentProjectId) {
        setStep('directing');
        setDirectorProgress({ step: 0, total: 0, desc: 'Starting...' });

        try {
          const directorRes = await fetch('/api/services/editron/director/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: currentProjectId,
              editProfileId: selectedProfileId,
              brief: {
                selectedProfileId,
                overrides: {},
              },
            }),
          });

          const directorData = await directorRes.json().catch(() => ({}));
          if (directorData.success) {
            console.log(`[ExportToEditron] Director Agent complete: ${directorData.actionsExecuted} actions, ${directorData.executionMs}ms`);
            if (directorData.warnings?.length > 0) {
              setError(`Edit profile applied with ${directorData.warnings.length} warning(s): ${directorData.warnings[0]}`);
            }
          } else {
            console.warn('[ExportToEditron] Director Agent failed:', directorData.error);
            setError(`Edit profile partially applied. You can fine-tune in the Editron editor.`);
          }
        } catch (directorErr: any) {
          console.warn('[ExportToEditron] Director Agent error:', directorErr.message);
          setError('Edit profile could not be applied. Your project is ready for manual editing.');
        }
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
        body: JSON.stringify({ artStyle, feedback: feedback || undefined, modelId: imageModel !== 'flux-schnell' ? imageModel : undefined }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubjects((prev) =>
          prev.map((s) =>
            s.subjectId === subjectId
              ? { ...s, imageUrl: data.imageUrl || s.imageUrl, status: 'generated' }
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

  // ─── Upload a real image as reference for a subject
  const handleUploadSubjectImage = async (subjectId: string, file: File) => {
    if (!refSetId) return;
    setRegeneratingSubjectId(subjectId); // Reuse loading state

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imageUrl) {
        setSubjects((prev) =>
          prev.map((s) =>
            s.subjectId === subjectId
              ? { ...s, imageUrl: data.imageUrl, visualDescription: data.visualDescription || s.visualDescription, status: 'generated' }
              : s,
          ),
        );
        // Auto-approve uploaded images
        setApprovedSubjectIds((prev) => {
          const next = new Set(prev);
          next.add(subjectId);
          return next;
        });
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      console.error('[ExportToEditron] Upload subject image failed:', err);
      setError(`Upload failed: ${err.message}`);
    } finally {
      setRegeneratingSubjectId(null);
    }
  };

  // ─── Upload a real image for a storyboard scene
  const handleUploadSceneImage = async (sceneIndex: number, file: File) => {
    if (!storyboardId) return;
    setRegeneratingSceneIdx(sceneIndex);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/services/pipeline/storyboard/${storyboardId}/scene/${sceneIndex}/upload-image`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imageUrl) {
        setStoryboardScenes((prev: any[]) =>
          prev.map((s: any) =>
            s.sceneIndex === sceneIndex
              ? { ...s, imageUrl: data.imageUrl, imageAssetId: data.assetId }
              : s,
          ),
        );
      } else {
        setError(data.error || 'Scene image upload failed');
      }
    } catch (err: any) {
      console.error('[ExportToEditron] Upload scene image failed:', err);
    } finally {
      setRegeneratingSceneIdx(null);
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

  // Delete a subject entirely (remove from list + persist to DB)
  const handleDeleteSubject = async (subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.subjectId !== subjectId));
    setApprovedSubjectIds((prev) => {
      const next = new Set(prev);
      next.delete(subjectId);
      return next;
    });
    if (feedbackSubjectId === subjectId) { setFeedbackSubjectId(null); setFeedbackText(''); }
    if (editingSubjectId === subjectId) { setEditingSubjectId(null); setEditingDescription(''); }

    // Persist deletion to DB
    if (refSetId) {
      try {
        await fetch(`/api/services/pipeline/reference-images/${refSetId}/subject/${subjectId}/delete`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('[ExportToEditron] Delete subject DB error:', err);
      }
    }
  };

  // Generate a suggested subject (one-click from script analysis)
  const handleGenerateSuggested = async (suggested: SuggestedSubject) => {
    if (!refSetId || generatingSuggestedId) return;
    setGeneratingSuggestedId(suggested.id);
    setError('');

    try {
      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/add-subject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggested.name,
          category: suggested.category,
          visualDescription: suggested.visualDescription,
          scenesAppearingIn: suggested.scenesAppearingIn,
          artStyle,
          modelId: imageModel !== 'flux-schnell' ? imageModel : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      if (!data.subject) throw new Error('Invalid response');
      const newSubject: SubjectRef = {
        subjectId: data.subject.subjectId,
        name: data.subject.name,
        category: data.subject.category,
        imageUrl: data.subject.imageUrl,
        status: 'generated',
        scenesAppearingIn: data.subject.scenesAppearingIn,
        visualDescription: data.subject.visualDescription,
        priority: 'suggested',
      };

      setSubjects((prev) => [...prev, newSubject]);
      setApprovedSubjectIds((prev) => {
        const next = new Set(prev);
        next.add(newSubject.subjectId);
        return next;
      });
      // Remove from suggestions
      setSuggestedSubjects((prev) => prev.filter((s) => s.id !== suggested.id));
    } catch (err: any) {
      setError(`Generate "${suggested.name}" failed: ${err.message}`);
    } finally {
      setGeneratingSuggestedId(null);
    }
  };

  // Add a new custom subject reference
  const handleAddSubject = async () => {
    if (!refSetId || !newSubjectName.trim() || !newSubjectDescription.trim()) return;
    setAddingSubject(true);
    setError('');

    try {
      // Parse scene numbers from comma-separated string
      const sceneNums = newSubjectScenes
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1)
        .map((n) => n - 1); // Convert to 0-based

      const res = await fetch(`/api/services/pipeline/reference-images/${refSetId}/add-subject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSubjectName.trim(),
          category: newSubjectCategory,
          visualDescription: newSubjectDescription.trim(),
          scenesAppearingIn: sceneNums.length > 0 ? sceneNums : scenes.map((_: any, i: number) => i),
          artStyle,
          modelId: imageModel !== 'flux-schnell' ? imageModel : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      if (!data.subject) throw new Error('Invalid response from add-subject');
      const newSubject: SubjectRef = {
        subjectId: data.subject.subjectId,
        name: data.subject.name,
        category: data.subject.category,
        imageUrl: data.subject.imageUrl,
        status: 'generated',
        scenesAppearingIn: data.subject.scenesAppearingIn,
        visualDescription: data.subject.visualDescription,
      };

      setSubjects((prev) => [...prev, newSubject]);
      setApprovedSubjectIds((prev) => {
        const next = new Set(prev);
        next.add(newSubject.subjectId);
        return next;
      });

      // Reset form
      setNewSubjectName('');
      setNewSubjectCategory('character');
      setNewSubjectDescription('');
      setNewSubjectScenes('');
      setShowAddSubject(false);
    } catch (err: any) {
      setError(`Add subject failed: ${err.message}`);
    } finally {
      setAddingSubject(false);
    }
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

  // ─── Storyboard Scene Regeneration ─────────────────────────────
  const handleRegenerateStoryboardScene = async (sceneIndex: number, feedback?: string) => {
    if (!storyboardId) return;
    setRegeneratingSceneIdx(sceneIndex);
    setError('');
    try {
      const res = await fetch(
        `/api/services/pipeline/storyboard/${storyboardId}/scene/${sceneIndex}/regenerate-with-context`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedback: feedback || undefined,
            userId: undefined, // auth handled server-side
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      // API returns { success, scene } — scene has imageUrl and imageAssetId
      const updatedScene = data.scene || data;
      setStoryboardScenes((prev: any[]) =>
        prev.map((s: any) =>
          s.sceneIndex === sceneIndex
            ? { ...s, imageUrl: updatedScene.imageUrl || s.imageUrl, imageAssetId: updatedScene.imageAssetId || s.imageAssetId }
            : s,
        ),
      );
      setSceneFeedbackIdx(null);
      setSceneFeedbackText('');
    } catch (err: any) {
      setError(`Scene ${sceneIndex + 1} regeneration failed: ${err.message}`);
    } finally {
      setRegeneratingSceneIdx(null);
    }
  };

  const stepDescription = () => {
    switch (step) {
      case 'configure': return 'Convert your script into a video project';
      case 'exporting': return 'Parsing scenes from your script...';
      case 'profile-selection': return 'Confirm your edit profile';
      case 'extracting-subjects': return 'Identifying key subjects for visual consistency...';
      case 'generating-references': return 'Generating reference images for subjects...';
      case 'reviewing-references': return 'Review and approve reference images';
      case 'storyboard': return 'Generating AI storyboard images...';
      case 'reviewing-storyboard': return 'Review storyboard images before video generation';
      case 'generating-videos': return 'Generating AI video clips...';
      case 'generating-voiceover': return 'Generating AI voiceover...';
      case 'finalizing': return 'Building your Editron project...';
      case 'directing': return `Applying edit profile${directorProgress.desc ? ': ' + directorProgress.desc : '...'}`;
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
                      <SelectItem value="nano-banana">Nano Banana (Fast)</SelectItem>
                      <SelectItem value="nano-banana-2">Nano Banana 2 (Quality)</SelectItem>
                      <SelectItem value="nano-banana-pro">Nano Banana Pro (Best)</SelectItem>
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
                      <SelectItem value="auto">Auto (best per scene) — Default</SelectItem>
                      <SelectItem value="kling-2.6">Kling 2.6 Pro</SelectItem>
                      <SelectItem value="kling-2.1">Kling 2.1 Pro</SelectItem>
                      <SelectItem value="kling-1.5">Kling 1.5 Pro</SelectItem>
                      <SelectItem value="veo-3">Google Veo 3</SelectItem>
                      <SelectItem value="veo-2">Google Veo 2</SelectItem>
                      <SelectItem value="luma-ray2">Luma Ray 2</SelectItem>
                      <SelectItem value="luma-dream-machine">Luma Dream Machine</SelectItem>
                      <SelectItem value="minimax">MiniMax Hailuo</SelectItem>
                    </SelectContent>
                  </Select>
                  {videoModel === 'auto' && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Auto mode picks the best model per scene based on mood and motion. For maximum visual consistency across scenes, select a specific model instead.
                    </p>
                  )}
                </motion.div>
              )}

              {/* Voice Selector with Preview */}
              {availableVoices.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <label className="text-sm text-zinc-400 mb-1 block">Narrator Voice</label>
                  <div className="flex gap-2">
                    <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 flex-1">
                        <SelectValue placeholder="Select voice" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 max-h-60">
                        {availableVoices.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <span className="flex items-center gap-2">
                              <span className={v.gender === 'female' ? 'text-pink-300' : 'text-blue-300'}>
                                {v.gender === 'female' ? '♀' : '♂'}
                              </span>
                              <span>{v.name}</span>
                              <span className="text-zinc-500 text-xs">— {v.style}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreviewVoice(selectedVoice)}
                      disabled={!selectedVoice || step !== 'configure'}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-700 px-3"
                      title="Preview voice"
                    >
                      {previewingVoice === selectedVoice ? (
                        <span className="h-4 w-4 rounded-full bg-red-500 animate-pulse" />
                      ) : (
                        <span className="text-sm">▶</span>
                      )}
                    </Button>
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
                <StepIndicator label="Generate AI voiceover" active={step === 'generating-voiceover'} done={['finalizing', 'directing', 'done'].includes(step)} />
                <StepIndicator label="Create Editron project" active={step === 'finalizing'} done={['directing', 'done'].includes(step)} />
                {selectedProfileId && (
                  <StepIndicator label="Apply edit profile" active={step === 'directing'} done={(step as string) === 'done'} />
                )}
              </div>

              <p className="text-xs text-zinc-500 text-center">
                {step === 'exporting' && 'Parsing scenes and building timeline...'}
                {step === 'extracting-subjects' && 'AI is identifying characters, locations, and key subjects...'}
                {step === 'generating-references' && 'Generating reference images for visual consistency...'}
                {step === 'storyboard' && `Generating storyboard images for ${scenes.length} scenes...`}
                {step === 'generating-videos' && 'Animating storyboard images into video clips — this takes a few minutes...'}
                {step === 'generating-voiceover' && 'Generating AI voiceover narration...'}
                {step === 'finalizing' && 'Assembling your video project with music & voiceover...'}
                {step === 'directing' && `Applying edit profile: ${detectedProfile?.name || 'auto'}...`}
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
                These reference images guide AI for visual consistency. Approve, reject, regenerate, or add more from script suggestions below.
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

                        {/* Top-left: Upload + Regenerate + Delete */}
                        <div className="absolute top-1.5 left-1.5 flex gap-1">
                          <label
                            className={`p-1 rounded-full bg-emerald-700/80 text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer ${isRegenerating ? 'opacity-50 pointer-events-none' : ''}`}
                            title="Upload your own image"
                          >
                            <Upload className="h-3 w-3" />
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadSubjectImage(subject.subjectId, file);
                                e.target.value = ''; // Reset so same file can be re-selected
                              }}
                            />
                          </label>
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

              {/* ─── Suggested from Script ─────────────────────── */}
              {suggestedSubjects.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
                    More from your script ({suggestedSubjects.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedSubjects
                      .filter((s) =>
                        !scriptSearchQuery ||
                        s.name.toLowerCase().includes(scriptSearchQuery.toLowerCase()) ||
                        s.visualDescription.toLowerCase().includes(scriptSearchQuery.toLowerCase()) ||
                        s.category.toLowerCase().includes(scriptSearchQuery.toLowerCase())
                      )
                      .map((suggested) => (
                        <button
                          key={suggested.id}
                          onClick={() => handleGenerateSuggested(suggested)}
                          disabled={generatingSuggestedId !== null}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all text-left group disabled:opacity-50"
                          title={suggested.visualDescription}
                        >
                          {generatingSuggestedId === suggested.id ? (
                            <Loader2 className="h-3 w-3 text-purple-400 animate-spin flex-shrink-0" />
                          ) : (
                            <Plus className="h-3 w-3 text-zinc-500 group-hover:text-purple-400 flex-shrink-0" />
                          )}
                          <span className="text-[11px] text-zinc-300 group-hover:text-zinc-100">{suggested.name}</span>
                          <span className="text-[9px] text-zinc-600 group-hover:text-zinc-500">{suggested.category}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* ─── Search + Manual Add ───────────────────────── */}
              <div className="space-y-1.5">
                {/* Search box — filters suggestions and doubles as custom entry */}
                <div className="flex gap-1.5">
                  <Input
                    value={scriptSearchQuery}
                    onChange={(e) => setScriptSearchQuery(e.target.value)}
                    placeholder={suggestedSubjects.length > 0
                      ? 'Search suggestions or type a new subject...'
                      : 'Type a subject to add (e.g. "red sports car")...'
                    }
                    className="bg-zinc-800 border-zinc-600 text-zinc-200 text-xs h-7 flex-1"
                  />
                  {!showAddSubject && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowAddSubject(true);
                        if (scriptSearchQuery.trim()) {
                          setNewSubjectName(scriptSearchQuery.trim());
                        }
                      }}
                      className="h-7 px-2 text-[10px] border-zinc-600 text-zinc-400 hover:text-purple-400 hover:border-purple-500/50"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Custom
                    </Button>
                  )}
                </div>

                {/* Expanded manual add form */}
                {showAddSubject && (
                  <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium text-purple-400">Add Custom Subject</p>
                      <button
                        onClick={() => { setShowAddSubject(false); setNewSubjectName(''); setNewSubjectCategory('character'); setNewSubjectDescription(''); setNewSubjectScenes(''); }}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-0.5">Name</label>
                        <Input
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="e.g. Main Character"
                          className="bg-zinc-800 border-zinc-600 text-zinc-200 text-xs h-7"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-500 block mb-0.5">Category</label>
                        <Select value={newSubjectCategory} onValueChange={setNewSubjectCategory}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-600 text-zinc-200 text-xs h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                            <SelectItem value="character">Character</SelectItem>
                            <SelectItem value="product">Product</SelectItem>
                            <SelectItem value="location">Location</SelectItem>
                            <SelectItem value="object">Object</SelectItem>
                            <SelectItem value="vehicle">Vehicle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 block mb-0.5">Visual Description (AI will refine this into a generation prompt)</label>
                      <textarea
                        value={newSubjectDescription}
                        onChange={(e) => setNewSubjectDescription(e.target.value)}
                        placeholder="Describe the subject — can be brief, AI will expand it using your script context"
                        className="w-full bg-zinc-800 border border-zinc-600 text-zinc-200 text-[11px] rounded p-1.5 resize-none focus:outline-none focus:border-purple-500"
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={handleAddSubject}
                      disabled={addingSubject || !newSubjectName.trim() || !newSubjectDescription.trim()}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs h-7"
                    >
                      {addingSubject ? (
                        <><Loader2 className="h-3 w-3 animate-spin mr-1" />Generating...</>
                      ) : (
                        <><Plus className="h-3 w-3 mr-1" />Generate & Add</>
                      )}
                    </Button>
                  </div>
                )}
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

              <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {storyboardScenes.map((scene: any) => (
                  <div
                    key={scene.sceneIndex}
                    className={`relative rounded-lg border overflow-hidden ${
                      scene.imageUrl
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="aspect-video bg-zinc-800 relative group">
                      {scene.imageUrl ? (
                        <>
                          <img
                            src={scene.imageUrl}
                            alt={scene.title}
                            className="w-full h-full object-cover"
                          />
                          {/* Hover overlay with upload + regenerate actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                            <label
                              className={`p-1.5 rounded-md bg-emerald-700/80 hover:bg-emerald-600 text-emerald-200 transition-colors cursor-pointer ${regeneratingSceneIdx !== null ? 'opacity-50 pointer-events-none' : ''}`}
                              title="Upload your own image"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadSceneImage(scene.sceneIndex, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            <button
                              onClick={() => handleRegenerateStoryboardScene(scene.sceneIndex)}
                              disabled={regeneratingSceneIdx !== null}
                              className="p-1.5 rounded-md bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
                              title="Regenerate this scene"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${regeneratingSceneIdx === scene.sceneIndex ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={() => setSceneFeedbackIdx(sceneFeedbackIdx === scene.sceneIndex ? null : scene.sceneIndex)}
                              disabled={regeneratingSceneIdx !== null}
                              className="p-1.5 rounded-md bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
                              title="Regenerate with feedback"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-600">
                          <X className="h-4 w-4" />
                          <button
                            onClick={() => handleRegenerateStoryboardScene(scene.sceneIndex)}
                            disabled={regeneratingSceneIdx !== null}
                            className="text-[9px] text-blue-400 hover:text-blue-300 underline"
                          >
                            {regeneratingSceneIdx === scene.sceneIndex ? 'Regenerating...' : 'Retry'}
                          </button>
                        </div>
                      )}
                      {regeneratingSceneIdx === scene.sceneIndex && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 text-green-400 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-medium text-zinc-200 truncate">{scene.title}</p>
                      <p className="text-[9px] text-zinc-500">
                        {scene.imageUrl ? 'Ready' : 'Failed'}
                      </p>
                    </div>
                    {/* Feedback input for scene regeneration */}
                    {sceneFeedbackIdx === scene.sceneIndex && (
                      <div className="p-1.5 pt-0 space-y-1">
                        <textarea
                          className="w-full text-[10px] p-1.5 rounded bg-zinc-800 border border-zinc-600 text-zinc-200 placeholder-zinc-500 resize-none"
                          rows={2}
                          placeholder="e.g. Make it darker, add more contrast..."
                          value={sceneFeedbackText}
                          onChange={(e) => setSceneFeedbackText(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            handleRegenerateStoryboardScene(scene.sceneIndex, sceneFeedbackText.trim());
                          }}
                          disabled={regeneratingSceneIdx !== null || !sceneFeedbackText.trim()}
                          className="w-full text-[10px] py-1 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          Regenerate with feedback
                        </button>
                      </div>
                    )}
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

          {/* ─── Profile Selection Step ─────────────────────────── */}
          {step === 'profile-selection' && detectedProfile && (
            <motion.div
              key="profile-selection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 py-2"
            >
              <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{detectedProfile.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{detectedProfile.description}</p>
                  </div>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    detectedProfile.confidence >= 0.60 ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {(detectedProfile.confidence * 100).toFixed(0)}% match
                  </span>
                </div>

                {/* Reasoning */}
                {detectedProfile.reasoning.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {detectedProfile.reasoning.slice(0, 4).map((reason, i) => (
                      <p key={i} className="text-[10px] text-zinc-500">→ {reason}</p>
                    ))}
                  </div>
                )}

                {/* Profile override — searchable grouped list */}
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Search profiles..."
                    className="w-full h-8 px-3 text-xs bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    onChange={(e) => {
                      const q = e.target.value.toLowerCase();
                      setProfileSearchQuery(q);
                    }}
                  />
                  <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-md bg-zinc-900">
                    {Object.entries(
                      Object.entries(EDIT_PROFILES)
                        .filter(([, p]) => {
                          if (!profileSearchQuery) return true;
                          return p.name.toLowerCase().includes(profileSearchQuery)
                            || p.description.toLowerCase().includes(profileSearchQuery)
                            || p.category?.toLowerCase().includes(profileSearchQuery);
                        })
                        .reduce<Record<string, Array<[string, any]>>>((groups, entry) => {
                          const cat = entry[1].category || 'Other';
                          if (!groups[cat]) groups[cat] = [];
                          groups[cat].push(entry);
                          return groups;
                        }, {}),
                    ).map(([category, profiles]) => (
                      <div key={category}>
                        <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/50 sticky top-0">
                          {category}
                        </div>
                        {profiles.map(([id, p]) => (
                          <button
                            key={id}
                            onClick={() => {
                              setSelectedProfileId(id);
                              const prof = EDIT_PROFILES[id as keyof typeof EDIT_PROFILES];
                              if (prof) setDetectedProfile({ ...detectedProfile, profileId: id, name: prof.name, description: prof.description });
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors ${selectedProfileId === id ? 'bg-emerald-900/30 text-emerald-300' : 'text-zinc-300'}`}
                          >
                            <span className="font-medium">{p.name}</span>
                            <span className="text-zinc-500 ml-1.5">— {p.description?.substring(0, 50)}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handlePostProfileSelection()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Continue with {detectedProfile.name} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* ─── Directing Step ──────────────────────────────────── */}
          {step === 'directing' && (
            <motion.div
              key="directing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 gap-3"
            >
              <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
              <p className="text-sm text-zinc-300">Applying edit profile...</p>
              {directorProgress.desc && (
                <p className="text-xs text-zinc-500">{directorProgress.desc}</p>
              )}
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

              {/* Audio generating in background indicator */}
              {audioGenerating && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                  <div>
                    <p className="text-xs font-medium text-blue-300">Music & Sound Effects generating</p>
                    <p className="text-[10px] text-blue-400/70">Audio will appear in your Editron project automatically. Refresh the editor after a few minutes.</p>
                  </div>
                </div>
              )}

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
