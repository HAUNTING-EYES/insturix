"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image, Loader2, X, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChatHistory } from './ChatHistory';
import { ChatMessage } from '@/types/clickatron';
import { ModelSelector } from '../stages/ModelSelector';
import { ReferenceImage } from './AICommandConsole';

interface NewVariationConsoleProps {
  onGenerate: (prompt: string, referenceImages?: ReferenceImage[], modelId?: string) => void;
  isGenerating: boolean;
  galleryCollapsed?: boolean;
  className?: string;
  clearTrigger?: number; // When this changes, clear the console
  setPromptData?: { // When this changes, populate the console
    prompt: string;
    referenceImages?: ReferenceImage[];
    trigger: number;
  };
  chatHistory?: ChatMessage[]; // Optional chat history
}

export function NewVariationConsole({
  onGenerate,
  isGenerating,
  galleryCollapsed = false,
  className = "",
  clearTrigger,
  setPromptData,
  chatHistory = [],
}: NewVariationConsoleProps) {
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  // Clear console when clearTrigger changes
  useEffect(() => {
    if (clearTrigger !== undefined) {
      setPrompt("");
      setReferenceImages([]);
    }
  }, [clearTrigger]);

  // Set prompt data when setPromptData changes
  useEffect(() => {
    if (setPromptData) {
      setPrompt(setPromptData.prompt);
      setReferenceImages(setPromptData.referenceImages || []);
    }
  }, [setPromptData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    onGenerate(prompt, referenceImages.length > 0 ? referenceImages : undefined, selectedModelId || undefined);
    setPrompt("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const newImage: ReferenceImage = {
          id: `${Date.now()}_${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          data: result,
        };
        setReferenceImages(prev => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            const newImage: ReferenceImage = {
              id: `${Date.now()}_${Math.random()}`,
              name: file.name || 'pasted-image.png',
              size: file.size,
              type: file.type,
              data: result,
            };
            setReferenceImages(prev => [...prev, newImage]);
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  const removeReferenceImage = (imageId: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== imageId));
  };

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
        {/* Chat History */}
        {chatHistory.length > 0 && (
          <ChatHistory
            messages={chatHistory}
            isVisible={showChatHistory}
            onToggle={() => setShowChatHistory(!showChatHistory)}
          />
        )}
        
        {/* Header for new variation creation */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-zinc-10">Create New Variation</h3>
          </div>
          <p className="text-zinc-400 text-sm">
            {referenceImages.length > 0 
              ? "Describe how you want to modify the reference images" 
              : "Describe what you want to create from scratch"}
          </p>
        </div>
        
        {/* Model Selector - dynamically filtered based on reference images */}
        <div className="flex justify-center mb-4">
          <ModelSelector
            context="newVariation"
            userAttachedImages={referenceImages.length}
            selectedModelId={selectedModelId || undefined}
            onModelChange={handleModelChange}
          />
        </div>
        
        {/* Main Input Container */}
        <div className="relative bg-zinc-800/50 rounded-2xl border border-zinc-700/50 p-4 max-w-4xl mx-auto">
          {/* Reference Images - Inline with input */}
          <AnimatePresence>
            {referenceImages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-zinc-700/50"
              >
                <div className="text-xs text-zinc-400 mb-1">Reference Images:</div>
                {referenceImages.map((image) => (
                  <motion.div
                    key={image.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-700 border border-zinc-600">
                      <img
                        src={image.data}
                        alt={image.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => removeReferenceImage(image.id)}
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
                {referenceImages.length > 0 ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Image className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Prompt Input */}
            <div className="flex-1">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPaste={handlePaste}
                placeholder={
                  referenceImages.length > 0
                    ? "Describe how you want to modify the reference images..."
                    : "Describe what you want to create from scratch..."
                }
                disabled={isGenerating}
                className="
                  min-h-[48px] max-h-[120px] resize-none border-0 bg-transparent
                  text-zinc-100 placeholder-zinc-500 p-0
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