"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CanvasPresetSelector, type CanvasPreset, presets } from './CanvasPresetSelector';
import { EnhancedInput } from './EnhancedInput';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function VideoIdeaInput() {
  const [videoIdea, setVideoIdea] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<CanvasPreset>(presets[0]); // Default to Auto Detect
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const router = useRouter();
  const { toast } = useToast();

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
      // Generate a mock task ID for now
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the video idea and settings in sessionStorage for the lab to access
      const sessionData = {
        videoIdea: videoIdea.trim(),
        selectedPreset: selectedPreset,
        referenceImage: referenceImage ? {
          name: referenceImage.name,
          size: referenceImage.size,
          type: referenceImage.type,
          // Store as base64 for session persistence
          data: await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(referenceImage);
          })
        } : null,
        timestamp: Date.now(),
        stage: 'ideation'
      };
      
      sessionStorage.setItem(`clickatron2_${taskId}`, JSON.stringify(sessionData));
      
      // Navigate to the lab
      router.push(`/dashboard/clickatron2/lab/${taskId}`);
      
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: "Something went wrong",
        description: "Failed to start the creative process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative bg-gradient-to-b from-zinc-950/60 to-zinc-900/30 border-zinc-800/80 backdrop-blur-xl shadow-elevated">
      <CardContent className="relative p-5 sm:p-7 min-h-[280px] overflow-hidden">
        <motion.div
          className="group relative rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/40 p-6 sm:p-8 overflow-hidden"
          style={{ minHeight: '240px' }}
          {...fadeIn}
        >
          <div className="flex min-h-[240px] items-center w-full">
            <div className="w-full">
              <div className="w-full">
                {/* Canvas Preset Selector */}
                <CanvasPresetSelector 
                  selectedPreset={selectedPreset.id}
                  onPresetChange={setSelectedPreset}
                />

                <div className="flex flex-col items-center text-center">
                  <div className="mb-6 relative">
                    <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-2xl scale-90 opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100"></div>
                    <Sparkles className="h-12 w-12 text-purple-400 relative z-10 transition-colors duration-300 group-hover:text-purple-300" />
                  </div>
                
                <h2 className="text-xl sm:text-2xl font-semibold text-zinc-100 mb-2">
                  {selectedPreset.promptText}
                </h2>
                
                <p className="text-zinc-400 text-sm sm:text-base mb-6 max-w-md">
                  {selectedPreset.id === 'youtube-thumbnail' 
                    ? "Describe your video idea and we'll help you create the perfect thumbnail"
                    : selectedPreset.id === 'social-post'
                    ? "Describe your social media concept and we'll create engaging visuals"
                    : selectedPreset.id === 'poster-portrait'
                    ? "Describe your poster concept and we'll design something striking"
                    : "Describe what you want to create and we'll help bring it to life"
                  }
                </p>

                <form onSubmit={handleFormSubmit} className="w-full">
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

                  <p className="text-xs text-zinc-500 mt-4">
                    AI will suggest creative directions for your {selectedPreset.name.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}