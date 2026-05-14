"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Sparkles,
} from 'lucide-react';

interface EnhancedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSubmit: () => void;
  isLoading: boolean;
  disabled: boolean;
}

export function EnhancedInput({
  value,
  onChange,
  placeholder,
  onSubmit,
  isLoading,
  disabled
}: EnhancedInputProps) {

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-2 rounded-xl border border-[#1C1B19] bg-[#131312]/50 transition-all duration-200">
          
          {/* Text Input - Textarea on mobile, Input on desktop */}
          <div className="flex-1">
            {/* Mobile Textarea */}
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="block sm:hidden w-full min-h-[80px] max-h-[120px] resize-none border-0 bg-transparent text-[#ECE9E1] placeholder:text-[#7A776E] focus:outline-none focus:ring-0 text-sm leading-relaxed p-2"
              disabled={disabled}
              rows={3}
            />
            
            {/* Desktop Input */}
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="hidden sm:block border-0 bg-transparent text-[#ECE9E1] placeholder:text-[#7A776E] h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={disabled}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
            {/* Submit Button */}
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isLoading || !value.trim() || disabled}
              className="bg-[#D4A652] hover:bg-[#D4A652]/90 text-[#0B0B0A] px-4 h-8 shrink-0"
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

      {/* Helper Text */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#7A776E]">
        <span>
          Press Enter to submit
        </span>
      </div>
    </div>
  );
}