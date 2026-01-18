"use client";

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, ArrowRight, Loader2 } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { CreditsErrorPopup } from '@/components/shared/CreditsErrorPopup';
import { CreditsTopupModal } from '@/components/shared/CreditsTopupModal';
import { ContextSelector } from './ContextSelector';
import { ContextValues } from '@/app/api/services/alyzitron/types';
import { ImmersiveModal } from './ImmersiveModal';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/useCredits';

interface VideoUploadProps {
  onSubmit: (analysisId: string, analysis: Analysis) => void;
  onComplete: (analysisId: string, analysis: Analysis) => void;
  activeAnalyses: Set<string>;
}

type Source =
  | { type: 'none' }
  | { type: 'file'; file: File; duration: number }
  | { type: 'link'; url: string; preview?: { title: string; thumbnail: string; videoId: string; duration: number } };

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.2, ease: 'easeIn' as const } }
};


export default function VideoUpload({ onSubmit, onComplete, activeAnalyses }: VideoUploadProps) {
  const [source, setSource] = useState<Source>({ type: 'none' });
  const [context, setContext] = useState<ContextValues>({
    niche: '',
    audience: '',
    tone: '',
    additionalDetails: '',
  });
  const [showTopup, setShowTopup] = useState(false);
  const [creditsError, setCreditsError] = useState<{
    isOpen: boolean;
    required: number;
    available: number;
    savedFormData?: {
      source: Source;
      context: ContextValues;
    };
  }>({ isOpen: false, required: 0, available: 0 });

  // Track upload states from useVideoAnalysis
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  
  // Loading state for preview fetching
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  const { toast } = useToast();

  // Use shared credits hook with React Query (auto-refreshes on invalidation)
  const { balance, invalidateCredits } = useCredits();
  const usageData = balance ? {
    creditsAvailable: balance.totalCredits,
    subscriptionCredits: balance.subscriptionCredits,
    topupCredits: balance.topupCredits,
  } : {
    creditsAvailable: 0,
    subscriptionCredits: 0,
    topupCredits: 0,
  };

  // Local input state to ensure a visible, controlled URL input when source.type === 'none'
  const [inputUrl, setInputUrl] = useState<string>('');

  const pasteCatcherRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    
    // Validate file type
    const isValidVideoType = file.type.startsWith('video/');
    if (!isValidVideoType) {
      toast({
        title: "Invalid File Type",
        description: "Please select a valid video file (MP4, WebM, AVI, MOV, etc.)",
        variant: "destructive",
      });
      return;
    }
    
    // Extract duration from local video file
    const getVideoDuration = (file: File): Promise<number> => {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > 0) {
            resolve(video.duration);
          } else {
            reject(new Error('Video file is corrupted or has invalid duration'));
          }
        };
        
        video.onerror = () => {
          window.URL.revokeObjectURL(video.src);
          reject(new Error('Failed to load video metadata'));
        };
        
        video.src = URL.createObjectURL(file);
      });
    };

    // Validate video file before opening modal
    getVideoDuration(file)
      .then(duration => {
        // Check duration constraints
        if (duration > 55 * 60) { // 55 minutes in seconds
          toast({
            title: "Video Too Long",
            description: "Video duration exceeds 55 minutes limit",
            variant: "destructive",
          });
          return;
        }
        
        if (duration <= 0) {
          toast({
            title: "Invalid Video",
            description: "The selected video file appears to be corrupted or invalid",
            variant: "destructive",
          });
          return;
        }
        
        // Video is valid, open modal
        setSource({ type: 'file', file, duration });
        setImmersiveOpen(true);
      })
      .catch(error => {
        console.error('Error validating video file:', error);
        toast({
          title: "Invalid Video File",
          description: error.message || "The selected video file could not be processed. Please try a different file.",
          variant: "destructive",
        });
      });
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
            if (!id) {
              throw new Error('Invalid YouTube URL format');
            }
            
            // Use our YouTube validation API to ensure video is accessible and get duration
            const validationRes = await fetch(`/api/services/alyzitron/utils/youtube?url=${encodeURIComponent(trimmed)}`);
            const validationData = await validationRes.json();
            
            if (!validationRes.ok || !validationData.valid) {
              throw new Error(validationData.error || 'YouTube video validation failed');
            }
            
            // Use our link-preview endpoint for title and thumbnail
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(trimmed)}`);
            const meta = await res.json();
            
            if (res.status !== 200 || !meta.title) {
              throw new Error('Could not fetch video title');
            }
            
            const duration = validationData.duration;
            if (!duration || duration <= 0) {
              throw new Error('Invalid video duration');
            }
            
            if (duration > 55 * 60) { // 55 minutes limit
              throw new Error('Video duration exceeds 55 minutes limit');
            }
            
            const title = meta.title || 'YouTube Video';
            const thumbnail = meta.image || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
            setSource({ type: 'link', url: trimmed, preview: { title, thumbnail, videoId: id, duration } });
            // Only open modal after successful validation
            setImmersiveOpen(true);
            
          } catch (error) {
            console.error('Failed to validate YouTube video:', error);
            // Don't open the modal if validation fails
            setSource({ type: 'none' });
            setInputUrl(''); // Clear the input on error
            // Show specific error message to user
            const errorMessage = error instanceof Error ? error.message : 'Invalid YouTube video';
            toast({
              title: errorMessage.includes('Invalid YouTube URL') ? "Invalid YouTube URL" :
                     errorMessage.includes('duration exceeds') ? "Video Too Long" :
                     errorMessage.includes('validation failed') ? "Video Not Accessible" : "Invalid YouTube Link",
              description: errorMessage.includes('Invalid YouTube URL') ? "Please check the URL format and try again." :
                          errorMessage.includes('duration exceeds') ? "Video duration must be under 55 minutes." :
                          errorMessage.includes('validation failed') ? "The video may be private, deleted, or unavailable." :
                          errorMessage.includes('Could not fetch video title') ? "Could not retrieve video information." : "Please make sure the video is publicly accessible and try again.",
              variant: "destructive",
            });
          } finally {
            setIsPreviewLoading(false);
          }
        };
        fetchYouTubePreview();
      } else {
        // For non-YouTube URLs, show error as we only support YouTube
        setIsPreviewLoading(false);
        toast({
          title: "Unsupported URL",
          description: "Currently only YouTube URLs are supported for video analysis.",
          variant: "destructive",
        });
        setInputUrl(''); // Clear the input
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
                    <p className="text-xs text-zinc-500 mt-2">Max size 1GB • Max duration 55 minutes • YouTube URLs supported</p>

                    {/* Always-visible typed URL input in initial state */}
                    <div className="mt-4 w-full max-w-3xl">
                      <div className="flex items-center gap-2">
                        <Input
                          value={inputUrl}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputUrl(v);
                          }}
                          placeholder="Type or paste a YouTube URL (Enter to validate)"
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
                    <p className="text-xs text-zinc-500 mt-2">Max size 1GB • Max duration 55 minutes • YouTube URLs supported</p>

                    {/* Always-visible typed URL input in initial state */}
                    <div className="mt-4 w-full max-w-3xl">
                      <div className="flex items-center gap-2">
                        <Input
                          value={inputUrl}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputUrl(v);
                          }}
                          placeholder="Type or paste a YouTube URL (Enter to validate)"
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
                    <p className="text-xs text-zinc-500 mt-2">Max size 1GB • Max duration 55 minutes • YouTube URLs supported</p>

                    {/* Always-visible typed URL input in initial state */}
                    <div className="mt-4 w-full max-w-3xl">
                      <div className="flex items-center gap-2">
                        <Input
                          value={inputUrl}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputUrl(v);
                          }}
                          placeholder="Type or paste a YouTube URL (Enter to validate)"
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
            usageData={usageData || undefined}
          />

          {/* Progress overlay - moved to ImmersiveModal */}

          <CreditsErrorPopup
            isOpen={creditsError.isOpen}
            onClose={() => {
              const saved = creditsError.savedFormData;
              if (saved) {
                setSource(saved.source);
                setContext(saved.context);
              }
              setCreditsError(prev => ({ ...prev, isOpen: false, savedFormData: undefined }));
            }}
            onTopup={() => setShowTopup(true)}
            required={creditsError.required}
            available={creditsError.available}
            serviceName="video analysis"
          />
          <CreditsTopupModal 
            isOpen={showTopup} 
            onClose={() => setShowTopup(false)} 
          />
        </CardContent>
      </Card>
    </div>
  );
}
