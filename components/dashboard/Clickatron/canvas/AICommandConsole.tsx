"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image, Loader2, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelector } from '../stages/ModelSelector';
import { MagicPromptEnhancerButton } from '../MagicPromptEnhancerButton';

interface AICommandConsoleProps {
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

export function AICommandConsole({
  onGenerate,
  isGenerating,
  galleryCollapsed = false,
  className = "",
  clearTrigger,
  setPromptData,
  referenceImageCount = 0,
  onReferenceImageCountChange,
}: AICommandConsoleProps) {
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
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`
        bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800/80
        ${className}
      `}
    >
      <div className="p-6 max-w-5xl mx-auto">
        
        {/* Model Selector */}
        <div className="flex justify-center mb-4">
          <ModelSelector
            context="edit"
            userAttachedImages={referenceImageCount}
            selectedModelId={selectedModelId || undefined}
            onModelChange={handleModelChange}
          />
        </div>
        
        {/* Main Input Container */}
        <div className="relative bg-zinc-800/50 rounded-2xl border border-zinc-700/50 p-4 max-w-4xl mx-auto">
          {/* Reference Images - Inline with input */}
          <AnimatePresence>
            {referenceImagePreviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-zinc-700/50"
              >
                {referenceImagePreviews.map((previewUrl, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-700 border border-zinc-600">
                      <img
                        src={previewUrl}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => removeReferenceImage(index)}
                      className="
                        absolute -top-1 -right-1 w-5 h-5 bg-zinc-800 border border-zinc-600
                        rounded-full flex items-center justify-center
                        opacity-0 group-hover:opacity-100 transition-opacity
                        hover:bg-red-600 hover:border-red-500
                      "
                    >
                      <X className="h-3 w-3 text-zinc-300" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            {/* Image Upload Button */}
            <div className="flex-shrink-0">
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
                className="
                  h-10 w-10 p-0 rounded-xl
                  text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50
                  transition-colors
                "
              >
                {referenceImagePreviews.length > 0 ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Image className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Prompt Input */}
            <div className="flex-1 relative">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={handlePaste}
                placeholder={
                  referenceImagePreviews.length > 0
                    ? "Describe how you want to modify the reference images..."
                    : "Describe a change... (e.g., 'make background futuristic city', 'change chai to coffee', 'add steampunk style')"
                }
                disabled={isGenerating || isEnhancing}
                className="
                  min-h-[48px] max-h-[120px] resize-none border-0 bg-transparent
                  text-zinc-100 placeholder-zinc-500 p-0 pr-12
                  focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none
                  [&:focus]:ring-0 [&:focus]:outline-none [&:focus]:border-transparent
                "
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <div className="absolute right-2 top-2">
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
            <div className="flex-shrink-0">
              <Button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="
                  h-10 w-10 p-0 rounded-xl
                  bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700
                  transition-colors
                "
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}