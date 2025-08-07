"use client";

import React, { useCallback, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Upload, X, ArrowRight, Sparkles } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { UploadProgress } from './UploadProgress';
import { formatFileSize } from '@/app/dashboard/alyzitron/utils/progress';
import { useToast } from '@/hooks/use-toast';
import { UsageLimitPopup } from './UsageLimitPopup';
import { ContextSelector, type ContextValues } from './ContextSelector';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  activeAnalyses: Set<string>;
}

type Source =
  | { type: 'none' }
  | { type: 'file'; file: File; duration: number }
  | { type: 'link'; url: string; preview?: { title: string; thumbnail: string; videoId: string } };

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
const MAX_DURATION_SECONDS = 55 * 60; // 55 minutes

const defaultContext: ContextValues = {
  niche: "",
  audience: "",
  tone: "",
};

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.2, ease: 'easeIn' as const } }
};

export function VideoUpload({ onSubmit, onComplete }: VideoUploadProps) {
  const [source, setSource] = useState<Source>({ type: 'none' });
  const [context, setContext] = useState<ContextValues>(defaultContext);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [limitPopup, setLimitPopup] = useState<{
    isOpen: boolean;
    limitType: 'total' | 'long_video' | 'general';
    currentUsage?: number;
    maxUsage?: number;
    savedFormData?: { source: Source; context: ContextValues };
  }>({ isOpen: false, limitType: 'general' });

  // Immersive flow modal state
  const [immersiveOpen, setImmersiveOpen] = useState(false);

  // Local input state to ensure a visible, controlled URL input when source.type === 'none'
  const [inputUrl, setInputUrl] = useState<string>('');

  const pasteCatcherRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const { uploadStates, analyzeFile, submitAnalysis, cancelUpload } = useVideoAnalysis();
  const currentUploadState = currentAnalysisId ? uploadStates.get(currentAnalysisId)?.uploadState : null;
  const currentAnalysisState = currentAnalysisId ? uploadStates.get(currentAnalysisId)?.analysisState || { status: 'idle' as const, progress: 0 } : null;

  const reset = useCallback(() => {
    setSource({ type: 'none' });
    setContext(defaultContext);
    setCurrentAnalysisId(null);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // Paste handler for unified intake
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (!text) return;
      const url = text.trim();
      if (isYouTubeUrl(url)) {
        e.preventDefault();
        queuePreview(url);
      }
    };
    const node = pasteCatcherRef.current ?? document;
    node.addEventListener('paste', handler as any);
    return () => node.removeEventListener('paste', handler as any);
  }, []);

  const isYouTubeUrl = (url: string): boolean => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(url);

  const extractYouTubeVideoId = useCallback((url: string): string | null => {
    const regexes = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const r of regexes) {
      const m = url.match(r);
      if (m && m[1]) return m[1];
    }
    return null;
  }, []);

  const fetchPreview = useCallback(async (url: string) => {
    const id = extractYouTubeVideoId(url);
    if (!id) {
      setSource({ type: 'link', url });
      return;
    }
    try {
      // Use our link-preview endpoint for robustness (title/image fallback)
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      const meta = await res.json();
      const title = meta.title || 'YouTube Video';
      const thumbnail = meta.image || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
      setSource({ type: 'link', url, preview: { title, thumbnail, videoId: id } });
    } catch {
      setSource({ type: 'link', url, preview: { title: 'YouTube Video', thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, videoId: id } });
    }
  }, [extractYouTubeVideoId]);

  const queuePreview = (url: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Only update local input; do not set source automatically
    setInputUrl(url);
    // Intentionally do not auto setSource or fetch; waiting for Enter or button click
  };

  // Open immersive modal with current link/file context
  const openImmersive = (val?: string) => {
    const trimmed = (val ?? inputUrl).trim();

    // If a file was chosen, just open without touching preview/state
    if (source.type === 'file') {
      setImmersiveOpen(true);
      return;
    }

    if (!trimmed) {
      // Nothing to open with; just open if we already have a link source
      if (source.type === 'link') {
        setImmersiveOpen(true);
      }
      return;
    }

    // If we already have the same link selected, avoid resetting state or refetching
    if (source.type === 'link' && source.url === trimmed) {
      setImmersiveOpen(true);
      return;
    }

    // Set or update the link source only if different
    const next: Source = { type: 'link', url: trimmed, preview: source.type === 'link' && source.url === trimmed ? source.preview : source.type === 'link' ? source.preview : undefined };
    setSource(next);

    // Only fetch preview when needed:
    // - URL is YouTube AND
    // - we don't already have a preview for this specific video id
    if (isYouTubeUrl(trimmed)) {
      const existingId = source.type === 'link' ? source.preview?.videoId : undefined;
      const incomingId = extractYouTubeVideoId(trimmed);
      if (!existingId || (incomingId && existingId !== incomingId)) {
        void fetchPreview(trimmed);
      }
    }

    setImmersiveOpen(true);
  };

  // File handling
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({ title: "File Too Large", description: `File size cannot exceed ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`, variant: "destructive" });
      e.target.value = '';
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      const duration = Math.round(video.duration);
      URL.revokeObjectURL(url);
      if (duration > MAX_DURATION_SECONDS) {
        toast({ title: "Video Too Long", description: `Video duration cannot exceed ${MAX_DURATION_SECONDS / 60} minutes.`, variant: "destructive" });
        e.target.value = '';
        return;
      }
      setSource({ type: 'file', file, duration });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      toast({ title: "Error Processing File", description: "Could not read video metadata.", variant: "destructive" });
      e.target.value = '';
    };
    video.src = url;
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fakeEvent = { target: { files: [file] } } as any as React.ChangeEvent<HTMLInputElement>;
      onPickFile(fakeEvent);
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text && isYouTubeUrl(text.trim())) queuePreview(text.trim());
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const canSubmit = source.type === 'file' || (source.type === 'link' && !!source.url);

  const begin = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);

    const savedSource = source;
    const savedContext = context;

    const submissionId = crypto.randomUUID();
    setCurrentAnalysisId(submissionId);

    try {
      let result;
      if (source.type === 'file') {
        result = await analyzeFile(source.file, submissionId, { additional_details: JSON.stringify({}) });
        if (!result) {
          setIsSubmitting(false);
          return;
        }
      } else if (source.type === 'link') {
        if (!isYouTubeUrl(source.url)) {
          toast({ title: "Invalid URL", description: "Please paste a valid YouTube link.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        result = await submitAnalysis(source.url, submissionId, { additional_details: JSON.stringify({}) });
      }

      if (result?.analysisId) {
        setCurrentAnalysisId(result.analysisId);
        onSubmit(result.analysisId, {
          analysisId: result.analysisId,
          title: source.type === 'file' ? source.file.name : (source.preview?.title || source.url),
          videoUrl: source.type === 'link' ? source.url : (source.type === 'file' ? source.file.name : ''),
          status: 'queued',
          progress: 0,
          estimatedTime: result.estimatedTime || 60,
          queuePosition: 1,
        });
      }
    } catch (err) {
      let description = "An unexpected error occurred. Please try again.";
      let restore = true;

      if (err instanceof Error) {
        if (err.message.includes('limit exceeded') || err.message.includes('LIMIT_EXCEEDED')) {
          let limitType: 'total' | 'long_video' | 'general' = 'general';
          if (err.message.includes('Total analyses limit exceeded')) limitType = 'total';
          else if (err.message.includes('Long video limit exceeded')) limitType = 'long_video';
          setLimitPopup({ isOpen: true, limitType, savedFormData: { source: savedSource, context: savedContext } });
          setIsSubmitting(false);
          return;
        } else if (err.message === 'Upload cancelled') {
          setIsSubmitting(false);
          return;
        }
      }

      if (restore) {
        setSource(savedSource);
        setContext(savedContext);
      }
      toast({ title: "Submission Failed", description, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [source, context, canSubmit, isSubmitting, analyzeFile, submitAnalysis, onSubmit, toast]);

  useEffect(() => {
    if (currentAnalysisId && currentUploadState && currentAnalysisState?.status === 'completed') {
      const title = source.type === 'file' ? source.file.name : source.type === 'link' ? source.preview?.title || source.url : '';
      const videoUrl = source.type === 'link' ? source.url : source.type === 'file' ? source.file.name : '';
      onComplete(currentAnalysisId, { analysisId: currentAnalysisId, title, videoUrl, status: 'completed', progress: 1 });
      reset();
    }
  }, [currentAnalysisId, currentUploadState, currentAnalysisState?.status, onComplete, source, reset]);

  const clearSelection = () => setSource({ type: 'none' });

  return (
    <div ref={pasteCatcherRef}>
      {/* Base Card stays, but immersive flow moves preview/questions into a modal */}
      <Card className="relative bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80 backdrop-blur-xl shadow-elevated">
        <CardContent className="relative p-5 sm:p-7 min-h-[340px] sm:min-h-[380px] overflow-hidden">
          {/* Step A: Greeting lives on page.tsx */}

          {/* Step B: Unified Upload */}
          <div className="w-full">
            {/* Fixed-height viewport to avoid layout shift between states */}
            <motion.div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="group relative rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/40 p-6 sm:p-8 overflow-hidden cursor-pointer hover:border-zinc-700/50 transition-colors duration-200"
              style={{ minHeight: '300px' }}
            >
              {/* Center states vertically within the fixed viewport */}
              <div className="flex min-h-[300px] items-center w-full">
                <div className="w-full">
                  <AnimatePresence initial={false} mode="wait">
                {source.type === 'none' && (
                  <motion.div key="none" {...fadeIn} className="flex flex-col items-center text-center">
                    <div className="mb-4 relative">
                      <div className="absolute inset-0 rounded-full bg-blue-500/40 blur-2xl scale-90 opacity-0 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100 ring-2 ring-blue-400/30 group-hover:ring-4"></div>
                      <Upload className="h-12 w-12 text-zinc-600 relative z-10 transition-colors duration-300 group-hover:text-white" />
                    </div>
                    <p className="text-zinc-300 text-sm sm:text-base">
                      Drag your video file here, or paste a video link
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">Max size 1GB • Max duration 55 minutes</p>

                    {/* Always-visible typed URL input in initial state */}
                    <div className="mt-4 w-full max-w-3xl">
                      <div className="flex items-center gap-2">
                        <Input
                          value={inputUrl}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputUrl(v);
                          }}
                          placeholder="Type or paste a YouTube URL, then press Enter"
                          className="bg-zinc-900/50 border-zinc-800 w-full"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              openImmersive((e.target as HTMLInputElement).value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="shrink-0"
                          onClick={e => { e.stopPropagation(); openImmersive(); }}
                          aria-label="Proceed"
                          title="Proceed"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={onPickFile}
                    />
                  </motion.div>
                )}

                {source.type === 'file' && (
                  <motion.div key="file" {...fadeIn} className="flex items-center justify-between gap-4">
                    <div className="flex items-center min-w-0">
                      <div className="h-12 w-12 rounded-lg bg-zinc-800/60 flex items-center justify-center mr-4">
                        <Upload className="h-6 w-6 text-zinc-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-zinc-200 font-medium text-sm sm:text-base truncate">{source.file.name}</p>
                        <p className="text-zinc-500 text-xs sm:text-sm">Ready to analyze</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={clearSelection} className="text-zinc-400 hover:text-zinc-200">
                      <X className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}

                {source.type === 'link' && (
                  <motion.div key="link" {...fadeIn} className="grid grid-cols-1 sm:grid-cols-[200px,1fr] gap-4 items-center">
                    <div className="relative aspect-video w-full sm:w-[160px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 flex-shrink-0">
                      {source.preview?.thumbnail ? (
                        <Image
                          src={source.preview.thumbnail}
                          alt={source.preview.title || 'Video thumbnail'}
                          fill
                          className="object-cover"
                          sizes="160px"
                        />
                      ) : (
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800/50 to-zinc-700/30" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base text-zinc-200 truncate">{source.preview?.title || 'Loading preview...'}</p>
                          <p className="text-xs text-zinc-500 mt-1 break-all">{source.url}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={clearSelection} className="text-zinc-400 hover:text-zinc-200 flex-shrink-0">
                          <X className="h-5 w-5" />
                        </Button>
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mt-0">
                          <Input
                            value={source.url}
                            onChange={(e) => {
                              const v = e.target.value;
                              setInputUrl(v);
                            }}
                            placeholder="Type or paste a YouTube URL, then press Enter"
                            className="bg-zinc-900/50 border-zinc-800"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                openImmersive((e.target as HTMLInputElement).value);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="shrink-0"
                            onClick={e => { e.stopPropagation(); openImmersive(source.url); }}
                            aria-label="Proceed"
                            title="Proceed"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Step C: Inline context is removed in favor of immersive modal */}
            <ContextSelector show={false} value={context} onChange={setContext} />

          </div>

          {/* Immersive modal with smoother feel and constrained height */}
          <Dialog open={immersiveOpen} onOpenChange={setImmersiveOpen}>
            <DialogContent className="max-w-3xl w-[92vw] max-h-[88vh] p-0 rounded-2xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/70 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
              {/* Make only the interior body scrollable; keep header fixed */}
              <div className="relative flex min-h-[320px] max-h-[88vh] flex-col">
                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/80 to-zinc-900/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-400/20">
                      <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                    </span>
                    <h3 className="text-zinc-100 font-medium tracking-tight">Review & refine before analysis</h3>
                  </div>
                </motion.div>

                {/* Scroll area */}
                <div className="px-5 pb-5 pt-4 overflow-y-auto">
                  {/* Compact row: thumbnail left (capped height), meta right */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
                    className="w-full"
                  >
                    <div className="w-full rounded-xl border border-zinc-800/70 bg-zinc-950/50 ring-1 ring-white/5 p-3">
                      <div className="flex items-start gap-3">
                        {/* Fixed-size thumbnail box */}
                        <div className="relative shrink-0 w-[220px] max-w-[40%] aspect-[16/9] overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-900/60">
                          {source.type === 'link' && source.preview?.thumbnail ? (
                            <Image src={source.preview.thumbnail} alt={source.preview.title || 'Video thumbnail'} fill className="object-cover" />
                          ) : source.type === 'link' ? (
                            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800/50 to-zinc-700/30" />
                          ) : source.type === 'file' ? (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs">
                              <Upload className="h-4 w-4 mr-2" /> {source.file.name}
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                              Add a link or file to preview
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5 rounded-lg" />
                        </div>

                        {/* Meta */}
                        <div className="min-w-0 pt-0.5">
                          <p className="text-[13px] text-zinc-200 leading-snug line-clamp-2">
                            {source.type === 'link' ? (source.preview?.title || 'Loading preview...') : source.type === 'file' ? 'Local video' : '—'}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-1 truncate">
                            {source.type === 'link' ? source.url : source.type === 'file' ? `${Math.round((source.duration || 0) / 60)} min approx.` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Context card below preview */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut', delay: 0.08 }}
                    className="min-w-0 mt-5"
                  >
                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/60 p-4 md:p-5 ring-1 ring-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-zinc-400/80">Context</p>
                          <p className="text-[11px] text-zinc-500">Tune the analysis for audience, tone and niche.</p>
                        </div>
                      </div>

                      {/* Polished ContextSelector inline, expanded by default */}
                      <div className="mt-3.5">
                        <ContextSelector show={true} value={context} onChange={setContext} />
                      </div>

                      <div className="mt-5 border-t border-zinc-800/60 pt-4 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-zinc-500">
                          This helps the AI better understand your content's context.
                        </p>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            onClick={() => setImmersiveOpen(false)}
                            className="text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/40 rounded-lg"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              setImmersiveOpen(false);
                              void begin();
                            }}
                            disabled={!canSubmit || isSubmitting}
                            className="rounded-lg bg-zinc-100 text-zinc-900 hover:bg-zinc-200 shadow-sm ring-1 ring-inset ring-white/5 disabled:opacity-60"
                          >
                            Start Analysis
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Progress overlay */}
          <AnimatePresence>
            {currentAnalysisId && currentUploadState && (
              <motion.div
                key="progress-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 rounded-xl overflow-hidden"
              >
                <div className="pointer-events-none absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" />
                <div className="pointer-events-auto relative z-10">
                  <UploadProgress uploadState={currentUploadState} onCancel={() => { if (currentAnalysisId) cancelUpload(currentAnalysisId); reset(); }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <UsageLimitPopup
            isOpen={limitPopup.isOpen}
            onClose={() => {
              const saved = limitPopup.savedFormData;
              if (saved) {
                setSource(saved.source);
                setContext(saved.context);
              }
              setLimitPopup(prev => ({ ...prev, isOpen: false, savedFormData: undefined }));
            }}
            limitType={limitPopup.limitType}
            currentUsage={limitPopup.currentUsage}
            maxUsage={limitPopup.maxUsage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
