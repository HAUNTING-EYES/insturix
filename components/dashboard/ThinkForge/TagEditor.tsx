'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebouncedCallback } from 'use-debounce';

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  predefinedTags?: string[];
  placeholder?: string;
  maxTags?: number;
  allowCustom?: boolean;
}

const DEFAULT_PREDEFINED_TAGS = [
  'start production',
  'publish',
  'review',
  'draft',
  'scheduled',
  'in progress',
  'ready to publish',
  'needs revision'
];

export default function TagEditor({
  tags,
  onChange,
  predefinedTags = DEFAULT_PREDEFINED_TAGS,
  placeholder = 'Add tag...',
  maxTags = 10,
  allowCustom = true
}: TagEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    const value = inputValue.trim().toLowerCase();
    if (!value) return predefinedTags;
    
    const filtered = predefinedTags.filter(tag => 
      tag.toLowerCase().includes(value) && !tags.includes(tag)
    );
    
    // Add custom tag as first suggestion if it doesn't match predefined
    if (allowCustom && value && !predefinedTags.some(t => t.toLowerCase() === value)) {
      return [value, ...filtered];
    }
    
    return filtered;
  }, [inputValue, predefinedTags, tags, allowCustom]);

  // Handle tag removal
  const handleRemoveTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  // Handle tag addition
  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (!trimmedTag || tags.includes(trimmedTag) || tags.length >= maxTags) return;
    
    onChange([...tags, trimmedTag]);
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setIsOpen(value.length > 0);
    setHighlightedIndex(-1);
  };

  // Handle input keydown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      handleRemoveTag(tags[tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    }
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    handleAddTag(suggestion);
  };

  // Get tag color based on type
  const getTagColor = (tag: string) => {
    const lowerTag = tag.toLowerCase();
    if (lowerTag.includes('publish')) return 'bg-red-600/20 border-red-500/40 text-red-200';
    if (lowerTag.includes('production') || lowerTag.includes('progress')) return 'bg-yellow-600/20 border-yellow-500/40 text-yellow-200';
    if (lowerTag.includes('review') || lowerTag.includes('revision')) return 'bg-blue-600/20 border-blue-500/40 text-blue-200';
    if (lowerTag.includes('draft')) return 'bg-neutral-800/60 border-neutral-700/70 text-neutral-200';
    return 'bg-neutral-800/40 border-neutral-700/50 text-neutral-300';
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Tags Display */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px]">
        <AnimatePresence mode="popLayout">
          {tags.map((tag, index) => (
            <motion.div
              key={tag}
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -10 }}
              transition={{ duration: 0.15 }}
              className={`group relative inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${getTagColor(tag)} transition-all hover:scale-105`}
            >
              <Tag size={10} className="shrink-0 opacity-70" />
              <span className="truncate max-w-[120px]">{tag}</span>
              <button
                onClick={() => handleRemoveTag(tag)}
                className="ml-0.5 p-0.5 rounded hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
                aria-label={`Remove ${tag}`}
              >
                <X size={10} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input Field */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(inputValue.length > 0 || suggestions.length > 0)}
          placeholder={tags.length >= maxTags ? 'Max tags reached' : placeholder}
          disabled={tags.length >= maxTags}
          className="w-full px-3 py-2 bg-neutral-900/60 border border-neutral-800/70 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-700/40 focus:border-red-800/60 transition-all backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
        
        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {isOpen && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 w-full mt-1 bg-neutral-950/95 backdrop-blur-xl border border-neutral-800/70 rounded-xl shadow-2xl shadow-black/50 max-h-48 overflow-auto"
            >
              <div className="p-1.5">
                {suggestions.slice(0, 8).map((suggestion, index) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      highlightedIndex === index
                        ? 'bg-red-600/20 text-red-200'
                        : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {predefinedTags.includes(suggestion) ? (
                        <Tag size={12} className="opacity-50" />
                      ) : (
                        <Plus size={12} className="opacity-50" />
                      )}
                      <span>{suggestion}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Helper Text */}
      {tags.length >= maxTags && (
        <p className="mt-1.5 text-xs text-neutral-500">
          Maximum {maxTags} tags allowed
        </p>
      )}
    </div>
  );
}

