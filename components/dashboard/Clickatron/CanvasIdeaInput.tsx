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

export function CanvasIdeaInput() {
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
        body: JSON.stringify({ prompt: currentPrompt, taskType: 'imageGeneration' }),
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
    <Card className="relative bg-gradient-to-b from-zinc-950/80 to-zinc-900/40 border-zinc-800/80 backdrop-blur-xl overflow-hidden">
      <CardContent className="relative p-6 overflow-hidden">
        {/* Ambient background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 opacity-40" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-purple-500/10 blur-3xl rounded-full" />
        
        <motion.div
          className="relative z-10"
          {...fadeIn}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 ring-1 ring-purple-400/20 mb-4">
              <Sparkles className="h-6 w-6 text-purple-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-zinc-100 mb-2 tracking-tight">
              Create New Thumbnail
            </h2>
                
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Describe your vision and let AI bring it to life. Upload reference images for better results.
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="w-full max-w-2xl mx-auto space-y-4">
            {/* Prompt Input */}
            <div className="relative">
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A futuristic city skyline at sunset, cinematic lighting, 4K quality..."
                  disabled={isLoading || isEnhancing}
                  className="min-h-[80px] bg-zinc-900/60 border-zinc-700/60 rounded-xl pr-12 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400/50 transition-all resize-none"
                />
                <div className="absolute right-3 top-3">
                  <MagicPromptEnhancerButton
                    onEnhance={enhancePrompt}
                    isEnhancing={isEnhancing}
                    disabled={isLoading}
                    prompt={prompt}
                    onPromptEnhanced={(enhancedPrompt) => setPrompt(enhancedPrompt)}
                  />
                </div>
              </div>
            </div>
            
            {/* Aspect Ratio, Reference Images, and Model - Improved Responsive Grid */}
            <div className="space-y-4">
              {/* Aspect Ratio Selector - Full Width */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-3 block">Canvas Size</label>
                <CanvasPresetSelector value={aspectRatio} onChange={setAspectRatio} />
              </div>
              
              {/* Reference Images and Model - Side by Side on larger screens */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Reference Images */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-3 block">Reference Images (Optional)</label>
                  <div className="bg-zinc-900/40 border border-zinc-700/50 rounded-lg p-4 min-h-[100px] flex items-center justify-center">
                    <ImageUpload onFileChange={setReferenceImages} isLoading={isLoading} multiple={true} />
                  </div>
                </div>
                
                {/* Model Selector */}
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-3 block">AI Model</label>
                  <div className="bg-zinc-900/40 border border-zinc-700/50 rounded-lg p-4 min-h-[100px] flex items-center justify-center">
                    <ModelSelector
                      context="newVariation"
                      userAttachedImages={referenceImages.length}
                      selectedModelId={selectedModelId || undefined}
                      onModelChange={setSelectedModelId}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="pt-2">
              <Button 
                type="submit" 
                disabled={isLoading || !prompt.trim() || !selectedModelId} 
                className="w-full h-12 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Creating Canvas...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Create Canvas
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </CardContent>
    </Card>
  );
}