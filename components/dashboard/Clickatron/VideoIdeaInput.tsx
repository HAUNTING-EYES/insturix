"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EnhancedInput } from './EnhancedInput';
import useClickatronStore from '@/stores/useCanvasStore';
import { AspectRatioSelector } from './canvas/AspectRatioSelector';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function VideoIdeaInput() {
  const router = useRouter();
  const { toast } = useToast();
  const createSession = useClickatronStore((state) => state.createSession);

  const [videoIdea, setVideoIdea] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isLoading, setIsLoading] = useState(false);

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
      const sessionId = await createSession({
        videoIdea: videoIdea.trim(),
        aspectRatio: aspectRatio,
      });
      if (sessionId) {
        router.push(`/dashboard/clickatron/lab/${sessionId}`);
      } else {
        throw new Error('Session ID not returned');
      }
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
            <div className="flex flex-col items-center text-center p-3 mt-6">
              <div className="mb-4 relative">
                <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-2xl scale-90 opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100"></div>
                <Sparkles className="h-10 w-10 text-purple-400 relative z-10 transition-colors duration-300 group-hover:text-purple-300" />
              </div>
            
              <h2 className="text-lg sm:text-xl font-semibold text-zinc-100 mb-2">
                What's your video about?
              </h2>
                
                <p className="text-zinc-400 text-sm mb-4 max-w-2xl mx-auto">
                  Describe your video idea and we'll help you create the perfect thumbnail.
                </p>

                <form onSubmit={handleFormSubmit} className="w-full max-w-2xl mx-auto">
                  <EnhancedInput
                    value={videoIdea}
                    onChange={setVideoIdea}
                    placeholder="e.g., A review of the new MacBook Pro"
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    disabled={isLoading}
                  />
                  <div className="mt-4 w-full max-w-xs mx-auto">
                    <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />
                  </div>
                </form>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}