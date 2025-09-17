"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useClickatronStore from '@/stores/useCanvasStore';
import { CanvasPresetSelector } from './CanvasPresetSelector';
import { ImageUpload } from './ImageUpload';
import { ModelSelector } from './stages/ModelSelector';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MagicPromptEnhancerButton } from './MagicPromptEnhancerButton';

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

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };

  const enhancePrompt = async (currentPrompt: string): Promise<string> => {
    setIsEnhancing(true);
    try {
      const response = await fetch('/api/services/clickatron/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: currentPrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enhance prompt');
      }

      const data = await response.json();
      return data.enhancedPrompt;
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt is required",
        description: "Please describe what you want to create.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedModelId) {
        toast({
            title: "Model not selected",
            description: "Please select a model to generate the image.",
            variant: "destructive",
        });
        return;
    }

    setIsLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('prompt', prompt.trim());
        formData.append('aspectRatio', aspectRatio);
        formData.append('modelId', selectedModelId);
        referenceImages.forEach((image) => {
            formData.append('referenceImage', image);
        });

      const result = await createSession(formData);
      
      if (result && result.sessionId) {
        router.push(`/dashboard/clickatron/lab/${result.sessionId}`);
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
                Start a new creation
              </h2>
                
                <p className="text-zinc-400 text-sm mb-4 max-w-2xl mx-auto">
                  Describe what you want to create. You can also upload a reference image.
                </p>

                <form onSubmit={handleFormSubmit} className="w-full max-w-2xl mx-auto">
                  <div className="relative">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., A futuristic city skyline at sunset, cinematic and detailed..."
                      disabled={isLoading || isEnhancing}
                      className="min-h-[80px] bg-zinc-900/50 border-zinc-700/50 rounded-lg pr-12"
                    />
                    <div className="absolute right-2 top-2">
                      <MagicPromptEnhancerButton
                        onEnhance={enhancePrompt}
                        isEnhancing={isEnhancing}
                        disabled={isLoading}
                        prompt={prompt}
                        onPromptEnhanced={(enhancedPrompt) => setPrompt(enhancedPrompt)}
                      />
                    </div>
                  </div>
                  <div className="mt-6 w-full max-w-md mx-auto">
                    <CanvasPresetSelector value={aspectRatio} onChange={setAspectRatio} />
                  </div>
                  <ImageUpload onFileChange={setReferenceImages} isLoading={isLoading} multiple={true} />
                  <div className="flex justify-center mt-6">
                    <ModelSelector
                        context="newVariation"
                        userAttachedImages={referenceImages.length}
                        selectedModelId={selectedModelId || undefined}
                        onModelChange={setSelectedModelId}
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoading} 
                    className="mt-6 w-full max-w-xs mx-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Start Generating
                      </>
                    )}
                  </Button>
                </form>
            </div>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}