"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CanvasPresetSelector, type CanvasPreset, presets } from './CanvasPresetSelector';
import { EnhancedInput } from './EnhancedInput';
import { useCanvasStore } from '@/stores/useCanvasStore';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function VideoIdeaInput() {
  const router = useRouter();
  const { toast } = useToast();
  const createBackendSession = useCanvasStore((state) => state.createBackendSession);

  const [videoIdea, setVideoIdea] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<CanvasPreset>(presets[0]);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [customAspectRatio, setCustomAspectRatio] = useState<{ width: number; height: number }>({ width: 16, height: 9 });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };

  const handleSubmit = async () => {
    if (!videoIdea.trim()) {
      toast({
        title: "Video idea required",
        description: "Please describe your video idea to get started.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const sessionId = await createBackendSession({
        videoIdea: videoIdea.trim(),
        selectedPreset,
        stage: 'ideation',
      });
      router.push(`/dashboard/clickatron/lab/${sessionId}`);
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Failed to start session",
        description: "Could not create a new Clickatron session. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80 backdrop-blur-xl shadow-elevated">
      <CardContent className="relative p-4 sm:p-6 overflow-hidden">
        <motion.div
          className="group relative rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/40 p-4 sm:p-6 overflow-hidden"
          {...fadeIn}
        >
          <div className="w-full">
            <CanvasPresetSelector 
              selectedPreset={selectedPreset.id}
              onPresetChange={setSelectedPreset}
              customAspectRatio={customAspectRatio}
              onCustomAspectRatioChange={setCustomAspectRatio}
            />

            <div className="flex flex-col items-center text-center p-3 mt-6">
              <div className="mb-4 relative">
                <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-2xl scale-90 opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100"></div>
                <Sparkles className="h-10 w-10 text-purple-400 relative z-10 transition-colors duration-300 group-hover:text-purple-300" />
              </div>
            
              <h2 className="text-lg sm:text-xl font-semibold text-zinc-100 mb-2">
                {selectedPreset.promptText}
              </h2>
                
                <p className="text-zinc-400 text-sm mb-4 max-w-2xl mx-auto">
                  {selectedPreset.id === 'youtube-thumbnail' 
                    ? "Describe your video idea and we'll help you create the perfect thumbnail"
                    : selectedPreset.id === 'social-post'
                    ? "Describe your social media concept and we'll create engaging visuals"
                    : selectedPreset.id === 'poster-portrait'
                    ? "Describe your poster concept and we'll design something striking"
                    : "Describe what you want to create and we'll help bring it to life"
                  }
                </p>

                <form onSubmit={handleFormSubmit} className="w-full max-w-2xl mx-auto">
                  <EnhancedInput
                    value={videoIdea}
                    onChange={setVideoIdea}
                    placeholder={selectedPreset.placeholder}
                    onSubmit={handleSubmit}
                    onImageUpload={setReferenceImage}
                    uploadedImage={referenceImage}
                    isLoading={isLoading}
                    disabled={isLoading}
                  />
                </form>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}