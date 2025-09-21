"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image, Loader2, X, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelector } from '../stages/ModelSelector';
import { MagicPromptEnhancerButton } from '../MagicPromptEnhancerButton';

interface NewVariationConsoleProps {
onGenerate: (prompt: string, referenceImages?: File[], modelId?: string) => void;
isGenerating: boolean;
galleryCollapsed?: boolean;
className?: string;
clearTrigger?: number; // When this changes, clear the console
setPromptData?: { // When this changes, populate the console
  prompt: string;
  referenceImages?: string[]; // This will now be GCS URLs for display
  trigger: number;
};
referenceImageCount?: number; // Number of reference images for model filtering
onReferenceImageCountChange?: (count: number) => void; // Callback when reference image count changes
}

export function NewVariationConsole({
  onGenerate,
  isGenerating,
  galleryCollapsed = false,
  className = "",
  clearTrigger,
  setPromptData,
  referenceImageCount = 0,
  onReferenceImageCountChange,
}: NewVariationConsoleProps) {
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImagePreviews, setReferenceImagePreviews] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
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

  // Clear console when clearTrigger changes
  useEffect(() => {
    if (clearTrigger !== undefined) {
      setPrompt("");
      setReferenceImages([]);
      setReferenceImagePreviews([]);
    }
  }, [clearTrigger]);

  // Set prompt data when setPromptData changes
  useEffect(() => {
    if (setPromptData) {
      setPrompt(setPromptData.prompt);
      // For display purposes, we'll use the GCS URLs provided
      setReferenceImagePreviews(setPromptData.referenceImages || []);
    }
  }, [setPromptData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    onGenerate(prompt, referenceImages.length > 0 ? referenceImages : undefined, selectedModelId || undefined);
    setPrompt("");
    setReferenceImages([]);
    setReferenceImagePreviews([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Store File objects
    setReferenceImages(prev => [...prev, ...files]);
    
    // Generate preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setReferenceImagePreviews(prev => [...prev, ...newPreviews]);
    onReferenceImageCountChange?.(referenceImagePreviews.length + files.length);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          // Store File object
          setReferenceImages(prev => [...prev, file]);
          
          // Generate preview URL
          const previewUrl = URL.createObjectURL(file);
          setReferenceImagePreviews(prev => [...prev, previewUrl]);
          onReferenceImageCountChange?.(referenceImagePreviews.length + 1);
        }
        break;
      }
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferenceImagePreviews(prev => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]); // Clean up the object URL
      newPreviews.splice(index, 1);
      return newPreviews;
    });
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      referenceImagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [referenceImagePreviews]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`
        bg-gradient-to-t from-zinc-900/95 to-zinc-900/80 backdrop-blur-xl 
        border-t border-zinc-800/60
        ${className}
      `}
    >
      <div className="p-3 max-w-4xl mx-auto mr-80">
        {/* Model Selector */}
        <div className="mb-2">
          <ModelSelector
            context="newVariation"
            userAttachedImages={referenceImageCount}
            selectedModelId={selectedModelId || undefined}
            onModelChange={handleModelChange}
          />
        </div>
        
        {/* Main Input Container */}
        <div className="relative bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-2">
          {/* Reference Images */}
          <AnimatePresence>
            {referenceImagePreviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 pb-2 border-b border-zinc-700/30"
              >
                <div className="flex flex-wrap gap-1.5">
                  {referenceImagePreviews.map((previewUrl, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-700/50 border border-zinc-600/50">
                        <img
                          src={previewUrl}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        onClick={() => removeReferenceImage(index)}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-900 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600 hover:border-red-500"
                      >
                        <X className="h-1.5 w-1.5 text-zinc-300" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2">
              {/* Image Upload Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
                className="h-8 w-8 p-0 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
              >
                {referenceImagePreviews.length > 0 ? (
                  <Plus className="h-3.5 w-3.5" />
                ) : (
                  <Image className="h-3.5 w-3.5" />
                )}
              </Button>

              {/* Prompt Input */}
              <div className="flex-1 relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Create new thumbnail..."
                  disabled={isGenerating || isEnhancing}
                  className="min-h-[32px] max-h-[80px] resize-none border-0 bg-zinc-900/40 text-zinc-100 placeholder-zinc-500 px-2.5 py-1.5 pr-8 rounded-lg focus:ring-1 focus:ring-purple-400/50 focus:bg-zinc-900/60 transition-all duration-200 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <div className="absolute right-1.5 top-1.5">
                  <MagicPromptEnhancerButton
                    onEnhance={enhancePrompt}
                    isEnhancing={isEnhancing}
                    disabled={isGenerating}
                    prompt={prompt}
                    onPromptEnhanced={(enhancedPrompt) => setPrompt(enhancedPrompt)}
                  />
                </div>
              </div>

              {/* Send Button */}
              <Button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-zinc-700 disabled:to-zinc-700 transition-all duration-200"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}