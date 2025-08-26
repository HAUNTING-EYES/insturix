"use client";

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Image as ImageIcon, 
  X, 
  Sparkles,
  Paperclip
} from 'lucide-react';

interface EnhancedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSubmit: () => void;
  onImageUpload: (file: File | null) => void;
  uploadedImage: File | null;
  isLoading: boolean;
  disabled: boolean;
}

const fadeIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: "easeOut" } as any
};

export function EnhancedInput({
  value,
  onChange,
  placeholder,
  onSubmit,
  onImageUpload,
  uploadedImage,
  isLoading,
  disabled
}: EnhancedInputProps) {
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (uploadedImage) {
      const url = URL.createObjectURL(uploadedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [uploadedImage]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onImageUpload(file);
      }
    }
  }, [onImageUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            onImageUpload(file);
            break;
          }
        }
      }
    }
  }, [onImageUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/')) {
        onImageUpload(file);
      }
    }
  };

  const handleRemoveImage = () => {
    onImageUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div 
        className={`relative transition-all duration-200 ${
          dragActive ? 'scale-[1.02]' : ''
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {/* Main Input Container */}
        <div className={`relative flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-2 rounded-xl border transition-all duration-200 ${
          dragActive 
            ? 'border-purple-500/50 bg-purple-500/5 shadow-lg shadow-purple-500/10' 
            : 'border-zinc-800 bg-zinc-900/50'
        }`}>
          
          {/* Image Preview (if uploaded) */}
          <AnimatePresence>
            {uploadedImage && previewUrl && (
              <motion.div {...fadeIn} className="flex-shrink-0">
                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-zinc-800/50">
                  <img
                    src={previewUrl}
                    alt="Reference"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Text Input - Textarea on mobile, Input on desktop */}
          <div className="flex-1">
            {/* Mobile Textarea */}
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder={dragActive ? "Drop image here or continue typing..." : placeholder}
              className="block sm:hidden w-full min-h-[80px] max-h-[120px] resize-none border-0 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-0 text-sm leading-relaxed p-2"
              disabled={disabled}
              rows={3}
            />
            
            {/* Desktop Input */}
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder={dragActive ? "Drop image here or continue typing..." : placeholder}
              className="hidden sm:block border-0 bg-transparent text-zinc-100 placeholder:text-zinc-500 h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={disabled}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
            {/* Image Upload Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            {/* Submit Button */}
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || !value.trim() || disabled}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 h-8 shrink-0"
              size="sm"
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
        </div>

        {/* Drag Overlay */}
        <AnimatePresence>
          {dragActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-purple-500/10 border-2 border-dashed border-purple-500/50 rounded-xl flex items-center justify-center pointer-events-none"
            >
              <div className="text-center">
                <ImageIcon className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-purple-300 font-medium">
                  Drop image to add reference
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Helper Text */}
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>
          💡 Paste images (Ctrl+V) or drag & drop for reference
        </span>
        <span>
          Press Enter to submit
        </span>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}