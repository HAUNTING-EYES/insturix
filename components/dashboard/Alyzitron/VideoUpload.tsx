"use client";
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Analysis } from '@/app/dashboard/alyzitron/types/analysis';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Link2 } from 'lucide-react';
import { useVideoAnalysis } from '@/app/dashboard/alyzitron/hooks/useVideoAnalysis';
import { CreditsErrorPopup } from '@/components/shared/CreditsErrorPopup';
import { BillingPaymentModal } from "@/components/shared/BillingPaymentModal";
import { ImmersiveModal } from './ImmersiveModal';
import { useToast } from '@/hooks/use-toast';
import { BorderBeam } from '@/components/ui/border-beam';
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
export default function VideoUpload({ onSubmit, onComplete }: VideoUploadProps) {
  const [source, setSource] = useState<Source>({ type: 'none' });
  const [showTopup, setShowTopup] = useState(false);
  const [creditsError, setCreditsError] = useState<{
    isOpen: boolean;
    required: number;
    available: number;
    savedFormData?: {
      source: Source;
    };
  }>({ isOpen: false, required: 0, available: 0 });
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const { toast } = useToast();
  const { balance } = useCredits();
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
        } catch {
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
    <motion.div {...fadeIn} className="w-full">

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isPreviewLoading) openImmersive();
        }}
        className="relative mx-auto flex w-full max-w-xl items-center gap-3 rounded-[10px] border border-[#282724] bg-[#0F0F0E] py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-[#D4A652]/50"
      >
        <BorderBeam size={400} duration={12} delay={4} colorFrom="#D4A652" colorTo="#D4A652" borderWidth={6.5} />
        <Link2 className="h-3.5 w-3.5 shrink-0 text-[#7A776E]" />
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="Paste a URL or drag a file"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] text-[#ECE9E1] outline-none placeholder:text-[#5F5E5A]"
          onClick={(e) => e.stopPropagation()}
          disabled={isPreviewLoading}
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-[7px] bg-[#D4A652] px-4 text-sm font-extrabold text-[#0B0B0A] hover:bg-[#e0b765] disabled:bg-[#131312] disabled:text-[#5F5E5A]"
          onClick={(e) => e.stopPropagation()}
          disabled={isPreviewLoading || !inputUrl.trim()}
        >
          {isPreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze"}
        </Button>
      </form>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        className="mx-auto mt-4 flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-[#454340] transition-colors hover:text-[#B5B2A8]"
        disabled={isPreviewLoading}
      >
        <Upload className="h-3 w-3" />
        YouTube · Instagram · TikTok · MP4 · MOV · 16:9 · 9:16 · 1:1
      </button>
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
      <section
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="flex flex-col items-center px-0 py-16 text-center sm:py-20"
      >
        <h1 className="m-0 text-balance text-[42px] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#ECE9E1] sm:text-[50px]">
          Let&apos;s analyze what you made.
        </h1>
        <p className="mb-10 mt-3 text-[14px] text-[#7A776E]">
          Drop a link, or paste a file.
        </p>
        <AnimatePresence initial={false} mode="wait">
          {source.type === 'none' && renderUploadState()}
          {source.type === 'file' && renderUploadState()}
          {source.type === 'link' && renderUploadState()}
        </AnimatePresence>
      </section>
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
    </div>
  );
}
