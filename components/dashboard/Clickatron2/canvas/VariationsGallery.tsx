"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Sparkles, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      style={{ marginLeft: "64px" }} // Account for website sidebar
    >
      {/* Header */}
      <div
        className={`p-4 border-b border-zinc-800/80 flex items-center ${isCollapsed ? "justify-center" : "justify-between"} min-h-[72px]`}
      >
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <h3 className="text-sm font-medium text-zinc-200">Variations</h3>
              <p className="text-xs text-zinc-500">
                {variations.length} generated
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="text-zinc-400 hover:text-zinc-200 p-1 relative z-10 flex-shrink-0"
        >
          <motion.div
            initial={false}
            animate={{ rotate: isCollapsed ? 0 : 180 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
        </Button>
      </div>

      {/* Variations Grid */}
      <div className="flex-1 overflow-y-auto p-2 relative">
        {/* Unified animation container */}
        <motion.div
          initial={false}
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={
            isCollapsed ? "flex flex-col items-center gap-2 pt-4" : "space-y-2"
          }
        >
          {/* Show first 3 variations in collapsed state, all in expanded */}
          {(isCollapsed ? variations.slice(0, 3) : variations).map(
            (variation, index) => (
              <motion.div
                key={variation.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                transition={{
                  duration: 0.3,
                  delay: isCollapsed ? index * 0.05 : 0,
                  layout: { duration: 0.3, ease: "easeOut" },
                }}
                className="relative group"
                onMouseEnter={() => setHoveredVariation(variation.id)}
                onMouseLeave={() => setHoveredVariation(null)}
                style={{
                  transformOrigin: "top left",
                }}
              >
                {/* Variation Thumbnail */}
                <motion.div
                  layout
                  onClick={() => onVariationSelect(variation.id)}
                  className={`
                  relative overflow-hidden cursor-pointer border
                  transition-all duration-200
                  ${
                    isCollapsed ? "w-10 h-6 rounded" : "aspect-video rounded-lg"
                  }
                  ${
                    activeVariationId === variation.id
                      ? "border-zinc-400"
                      : "border-zinc-700 hover:border-zinc-600"
                  }
                `}
                  style={{
                    transformOrigin: "top left",
                  }}
                  transition={{
                    layout: { duration: 0.3, ease: "easeOut" },
                  }}
                >
                  {/* Mock thumbnail - replace with actual image */}
                  <div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded" />

                  {/* Active indicator - subtle white dot */}
                  {activeVariationId === variation.id && (
                    <motion.div
                      layout
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-white rounded-full shadow-sm"
                      style={{
                        transformOrigin: "top right",
                      }}
                    />
                  )}
                </motion.div>

                {/* Hover Actions - Only show in expanded state */}
                <AnimatePresence>
                  {hoveredVariation === variation.id && !isCollapsed && (
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
            )
          )}

          {/* Show count indicator in collapsed state */}
          {isCollapsed && variations.length > 3 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="text-xs text-zinc-500 mt-1"
            >
              +{variations.length - 3}
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
