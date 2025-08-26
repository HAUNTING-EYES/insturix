"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function VideoIdeaInput() {
  const [videoIdea, setVideoIdea] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      
      // Store the video idea in sessionStorage for the lab to access
      sessionStorage.setItem(`clickatron2_${taskId}`, JSON.stringify({
        videoIdea: videoIdea.trim(),
        timestamp: Date.now(),
        stage: 'ideation'
      }));
      
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
              <div className="flex flex-col items-center text-center">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 rounded-full bg-purple-500/40 blur-2xl scale-90 opacity-60 transition-all duration-300 group-hover:opacity-80 group-hover:scale-100"></div>
                  <Sparkles className="h-12 w-12 text-purple-400 relative z-10 transition-colors duration-300 group-hover:text-purple-300" />
                </div>
                
                <h2 className="text-xl sm:text-2xl font-semibold text-zinc-100 mb-2">
                  What's your video about?
                </h2>
                
                <p className="text-zinc-400 text-sm sm:text-base mb-6 max-w-md">
                  Describe your video idea and we'll help you create the perfect thumbnail
                </p>

                <form onSubmit={handleSubmit} className="w-full max-w-2xl">
                  <div className="flex items-center gap-3">
                    <Input
                      value={videoIdea}
                      onChange={(e) => setVideoIdea(e.target.value)}
                      placeholder="e.g., A video about Indian chai and its craze"
                      className="bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 flex-1 h-12"
                      disabled={isLoading}
                    />
                    <Button
                      type="submit"
                      disabled={isLoading || !videoIdea.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-6 h-12 shrink-0"
                    >
                      {isLoading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Sparkles className="h-4 w-4" />
                        </motion.div>
                      ) : (
                        <>
                          <span className="hidden sm:inline mr-2">Get Ideas</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>

                <p className="text-xs text-zinc-500 mt-4">
                  AI will suggest creative directions for your thumbnail
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}