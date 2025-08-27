"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Variation {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  isActive?: boolean;
}

interface VariationsGalleryProps {
  variations: Variation[];
  activeVariationId: string;
  onVariationSelect: (variationId: string) => void;
  onGenerateMoreLike: (variationId: string) => void;
  onAddToCompare: (variationId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse: () => void;
}

export function VariationsGallery({
  variations,
  activeVariationId,
  onVariationSelect,
  onGenerateMoreLike,
  onAddToCompare,
  isCollapsed = false,
  onToggleCollapse,
}: VariationsGalleryProps) {
  const [hoveredVariation, setHoveredVariation] = useState<string | null>(null);

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 60 : 280 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="bg-zinc-900/50 border-r border-zinc-800/80 flex flex-col h-full pb-32"
      style={{ marginLeft: '64px' }} // Account for website sidebar
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
        {!isCollapsed && (
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Variations</h3>
            <p className="text-xs text-zinc-500">{variations.length} generated</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="text-zinc-400 hover:text-zinc-200 p-1"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Variations Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {variations.map((variation) => (
                <motion.div
                  key={variation.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative group"
                  onMouseEnter={() => setHoveredVariation(variation.id)}
                  onMouseLeave={() => setHoveredVariation(null)}
                >
                  {/* Variation Thumbnail */}
                  <div
                    onClick={() => onVariationSelect(variation.id)}
                    className={`
                      relative aspect-video rounded-lg overflow-hidden cursor-pointer
                      transition-all duration-200 border-2
                      ${
                        activeVariationId === variation.id
                          ? 'border-purple-500 ring-2 ring-purple-500/20'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }
                    `}
                  >
                    {/* Mock thumbnail - replace with actual image */}
                    <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-lg mb-1">🎬</div>
                        <div className="text-white text-xs font-medium px-2">
                          {variation.prompt.length > 20
                            ? variation.prompt.substring(0, 20) + "..."
                            : variation.prompt}
                        </div>
                      </div>
                    </div>

                    {/* Active indicator */}
                    {activeVariationId === variation.id && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full" />
                    )}
                  </div>

                  {/* Hover Actions */}
                  <AnimatePresence>
                    {hoveredVariation === variation.id && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center gap-2"
                      >
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onGenerateMoreLike(variation.id);
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1 h-auto"
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          More Like This
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCompare(variation.id);
                          }}
                          className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-2 py-1 h-auto"
                        >
                          <GitCompare className="h-3 w-3 mr-1" />
                          Compare
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed state */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-2">
            {variations.slice(0, 3).map((variation, index) => (
              <div
                key={variation.id}
                onClick={() => onVariationSelect(variation.id)}
                className={`
                  w-10 h-6 rounded cursor-pointer transition-all duration-200 border
                  ${
                    activeVariationId === variation.id
                      ? 'border-purple-500'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }
                `}
              >
                <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded" />
              </div>
            ))}
            {variations.length > 3 && (
              <div className="text-xs text-zinc-500 mt-1">
                +{variations.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}