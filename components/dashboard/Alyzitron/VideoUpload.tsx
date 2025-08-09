"use client";

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, ArrowRight, Loader2 } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { UsageLimitPopup } from './UsageLimitPopup';
import { ContextSelector, type ContextValues } from './ContextSelector';
import { ImmersiveModal } from './ImmersiveModal';
import { useToast } from '@/hooks/use-toast';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  activeAnalyses: Set<string>;
}

type Source =
  | { type: 'none' }
  | { type: 'file'; file: File; duration: number }
  | { type: 'link'; url: string; preview?: { title: string; thumbnail: string; videoId: string } };


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
  const [limitPopup, setLimitPopup] = useState<{
    isOpen: boolean;
    limitType: 'total' | 'long_video' | 'general';
    currentUsage?: number;
    maxUsage?: number;
    savedFormData?: { source: Source; context: ContextValues };
  }>({ isOpen: false, limitType: 'general' });

  // Immersive flow modal state
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  
  // Loading state for preview fetching
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  const { toast } = useToast();

  // Local input state to ensure a visible, controlled URL input when source.type === 'none'
  const [inputUrl, setInputUrl] = useState<string>('');

  const pasteCatcherRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const { uploadStates } = useVideoAnalysis();

  // YouTube URL validation and video ID extraction
  const isYouTubeUrl = (url: string): boolean => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(url);

  const extractYouTubeVideoId = (url: string): string | null => {
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
  };

  // Basic UI functions - simplified versions
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fakeEvent = { target: { files: [file] } } as any as React.ChangeEvent<HTMLInputElement>;
      onPickFile(fakeEvent);
      return;
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setInputUrl(text.trim());
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSource({ type: 'file', file, duration: 0 });
    // Automatically open the immersive modal after file selection
    setImmersiveOpen(true);
  };

  const openImmersive = (val?: string) => {
    const trimmed = (val ?? inputUrl).trim();
    if (trimmed) {
      setIsPreviewLoading(true);
      
      // Check if it's a YouTube URL
      if (isYouTubeUrl(trimmed)) {
        // Fetch preview for YouTube URLs
        const fetchYouTubePreview = async () => {
          try {
            const id = extractYouTubeVideoId(trimmed);
            if (id) {
              // Use our link-preview endpoint for robustness (title/image fallback)
              const res = await fetch(`/api/link-preview?url=${encodeURIComponent(trimmed)}`);
              const meta = await res.json();
              
              // Check if the response indicates an error (e.g., video not accessible)
              if (res.status !== 200 || !meta.title) {
                throw new Error('Video not accessible or invalid');
              }
              
              const title = meta.title || 'YouTube Video';
              const thumbnail = meta.image || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
              setSource({ type: 'link', url: trimmed, preview: { title, thumbnail, videoId: id } });
              // Only open modal after successful preview fetch
              setImmersiveOpen(true);
            } else {
              // If no video ID found, don't open modal
              throw new Error('Invalid YouTube URL');
            }
          } catch (error) {
            console.error('Failed to fetch preview:', error);
            // Don't open the modal if preview fetch fails
            setSource({ type: 'none' });
            setInputUrl(''); // Clear the input on error
            // Show error message to user
            toast({
              title: "Invalid YouTube Link",
              description: "Please make sure the video is publicly accessible and try again.",
              variant: "destructive",
            });
          } finally {
            setIsPreviewLoading(false);
          }
        };
        fetchYouTubePreview();
      } else {
        // For non-YouTube URLs, we can open the modal directly
        setSource({ type: 'link', url: trimmed });
        setImmersiveOpen(true);
        setIsPreviewLoading(false);
      }
    } else {
      setIsPreviewLoading(false);
    }
  };

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
                            if (e.key === 'Enter' && !isPreviewLoading) {
                              openImmersive((e.target as HTMLInputElement).value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isPreviewLoading}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="shrink-0"
                          onClick={e => { e.stopPropagation(); openImmersive(); }}
                          aria-label="Proceed"
                          title="Proceed"
                          disabled={isPreviewLoading}
                        >
                          {isPreviewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={onPickFile}
                      disabled={isPreviewLoading}
                    />
                  </motion.div>
                )}

                {source.type === 'file' && (
                  <motion.div key="file" {...fadeIn} className="flex flex-col items-center text-center">
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
                            if (e.key === 'Enter' && !isPreviewLoading) {
                              openImmersive((e.target as HTMLInputElement).value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isPreviewLoading}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="shrink-0"
                          onClick={e => { e.stopPropagation(); openImmersive(); }}
                          aria-label="Proceed"
                          title="Proceed"
                          disabled={isPreviewLoading}
                        >
                          {isPreviewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={onPickFile}
                      disabled={isPreviewLoading}
                    />
                  </motion.div>
                )}

                {source.type === 'link' && (
                  <motion.div key="link" {...fadeIn} className="flex flex-col items-center text-center">
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
                            if (e.key === 'Enter' && !isPreviewLoading) {
                              openImmersive((e.target as HTMLInputElement).value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={isPreviewLoading}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="shrink-0"
                          onClick={e => { e.stopPropagation(); openImmersive(); }}
                          aria-label="Proceed"
                          title="Proceed"
                          disabled={isPreviewLoading}
                        >
                          {isPreviewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={onPickFile}
                      disabled={isPreviewLoading}
                    />
                  </motion.div>
                )}


                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Step C: Inline context is removed in favor of immersive modal */}
            <ContextSelector show={false} value={context} onChange={setContext} />

          </div>

          {/* Immersive modal - simplified interface */}
          <ImmersiveModal
            open={immersiveOpen}
            onOpenChange={setImmersiveOpen}
            source={source}
            onSubmit={onSubmit}
            onComplete={onComplete}
            uploadStates={uploadStates}
          />

          {/* Progress overlay - moved to ImmersiveModal */}

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
