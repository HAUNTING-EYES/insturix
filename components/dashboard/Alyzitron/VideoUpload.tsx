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
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
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

  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const { toast } = useToast();

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

  const [inputUrl, setInputUrl] = useState<string>('');

  const pasteCatcherRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { uploadStates } = useVideoAnalysis();

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

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      toast({
        title: "Invalid File Type",
        description: "Please select a valid image or video file.",
        variant: "destructive",
      });
      return;
    }

    if (isImage) {
      // Images don't have duration, bypass video checks
      setSource({ type: 'file', file, duration: 0 });
      setImmersiveOpen(true);
      return;
    }

    const getVideoDuration = (file: File): Promise<number> => {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          if (video.duration > 0) resolve(video.duration);
          else reject(new Error('Video file is corrupted or has invalid duration'));
        };

        video.onerror = () => {
          window.URL.revokeObjectURL(video.src);
          reject(new Error('Failed to load video metadata'));
        };

        video.src = URL.createObjectURL(file);
      });
    };

    getVideoDuration(file)
      .then(duration => {
        if (duration > 55 * 60) {
          toast({ title: "Video Too Long", description: "Video duration exceeds 55 minutes limit", variant: "destructive" });
          return;
        }
        setSource({ type: 'file', file, duration });
        setImmersiveOpen(true);
      })
      .catch(error => {
        toast({ title: "Invalid Video File", description: error.message, variant: "destructive" });
      });
  };

  const openImmersive = (val?: string) => {
    const trimmed = (val ?? inputUrl).trim();
    if (!trimmed) {
      setIsPreviewLoading(false);
      return;
    }

    setIsPreviewLoading(true);

    if (isYouTubeUrl(trimmed)) {
      const fetchYouTubePreview = async () => {
        try {
          const id = extractYouTubeVideoId(trimmed);
          if (!id) throw new Error('Invalid YouTube URL format');

          const validationRes = await fetch(`/api/services/alyzitron/utils/youtube?url=${encodeURIComponent(trimmed)}`);
          const validationData = await validationRes.json();
          if (!validationRes.ok || !validationData.valid) throw new Error(validationData.error || 'YouTube video validation failed');

          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(trimmed)}`);
          const meta = await res.json();

          const duration = validationData.duration;
          if (!duration || duration <= 0) throw new Error('Invalid video duration');
          if (duration > 55 * 60) throw new Error('Video duration exceeds 55 minutes limit');

          const title = meta.title || 'YouTube Video';
          const thumbnail = meta.image || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
          setSource({ type: 'link', url: trimmed, preview: { title, thumbnail, videoId: id, duration } });
          setImmersiveOpen(true);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Invalid YouTube video';
          toast({
            title: "Validation Error",
            description: errorMessage,
            variant: "destructive",
          });
          setSource({ type: 'none' });
          setInputUrl('');
        } finally {
          setIsPreviewLoading(false);
        }
      };
      fetchYouTubePreview();
    } else {
      // NEW: Handle Non-YouTube Links (Instagram, X, Image URLs)
      const fetchGenericPreview = async () => {
        try {
          // Attempt to fetch standard link preview for external links
          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(trimmed)}`);
          const meta = await res.json();

          const title = meta.title || 'External Media';
          const thumbnail = meta.image || ''; // Fallback thumbnail

          // Duration is set to 0. Backend will assign fallback (e.g. 60s) or bypass for images
          setSource({ type: 'link', url: trimmed, preview: { title, thumbnail, videoId: 'external', duration: 0 } });
          setImmersiveOpen(true);
        } catch (error) {
          // Even if preview fails, proceed. Our backend yt-dlp will handle it.
          setSource({ type: 'link', url: trimmed, preview: { title: 'External Media', thumbnail: '', videoId: 'external', duration: 0 } });
          setImmersiveOpen(true);
        } finally {
          setIsPreviewLoading(false);
        }
      };
      fetchGenericPreview();
    }
  };

  // Helper render function for the identical states
  const renderUploadState = () => (
    <motion.div {...fadeIn} className="flex flex-col items-center text-center">
      <div className="mb-4 relative">
        <div className="absolute inset-0 rounded-full bg-blue-500/40 blur-2xl scale-90 opacity-0 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100 ring-2 ring-blue-400/30 group-hover:ring-4"></div>
        <Upload className="h-12 w-12 text-zinc-600 relative z-10 transition-colors duration-300 group-hover:text-white" />
      </div>
      <p className="text-zinc-300 text-sm sm:text-base">
        Drag your media file here, or paste a link
      </p>
      <p className="text-xs text-zinc-500 mt-2">Max size 1GB • YouTube, Instagram, X, and Images supported</p>

      <div className="mt-4 w-full max-w-3xl">
        <div className="flex items-center gap-2">
          <Input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste a URL (YouTube, Insta, X, or Image)"
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
            disabled={isPreviewLoading}
          >
            {isPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={onPickFile}
        disabled={isPreviewLoading}
      />
    </motion.div>
  );

  return (
    <div ref={pasteCatcherRef}>
      <Card className="relative bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80 backdrop-blur-xl shadow-elevated">
        <CardContent className="relative p-5 sm:p-7 min-h-[340px] sm:min-h-[380px] overflow-hidden">
          <div className="w-full">
            <motion.div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="group relative rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/40 p-6 sm:p-8 overflow-hidden cursor-pointer hover:border-zinc-700/50 transition-colors duration-200"
              style={{ minHeight: '300px' }}
            >
              <div className="flex min-h-[300px] items-center w-full">
                <div className="w-full">
                  <AnimatePresence initial={false} mode="wait">
                    {source.type === 'none' && renderUploadState()}
                    {source.type === 'file' && renderUploadState()}
                    {source.type === 'link' && renderUploadState()}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
            <ContextSelector show={false} value={context} onChange={setContext} />
          </div>

          <ImmersiveModal
            open={immersiveOpen}
            onOpenChange={setImmersiveOpen}
            source={source}
            onSubmit={onSubmit}
            onComplete={onComplete}
            uploadStates={uploadStates}
            usageData={usageData || undefined}
          />

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
          <BillingPaymentModal
            isOpen={showTopup}
            onClose={() => setShowTopup(false)}
          />
        </CardContent>
      </Card>
    </div>
  );
}