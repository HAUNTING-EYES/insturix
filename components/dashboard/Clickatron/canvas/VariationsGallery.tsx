"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Variation } from "@/types/clickatron";
import { ImageDisplay } from "./ImageDisplay";

interface VariationsGalleryProps {
  variations: Variation[];
  activeVariationId: string | null;
  onVariationSelect: (variationId: string) => void;
  onAddToCompare: (variationId: string) => void;
  onNewCanvas: () => void;
  onDuplicateCanvas: (variationId: string) => void;
  onDeleteCanvas: (variationId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse: () => void;
}

export function VariationsGallery({
  variations,
  activeVariationId,
  onVariationSelect,
  onAddToCompare,
  onNewCanvas,
  onDuplicateCanvas,
  onDeleteCanvas,
  isCollapsed = false,
  onToggleCollapse,
}: VariationsGalleryProps) {
  const [hoveredVariation, setHoveredVariation] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [variationToDelete, setVariationToDelete] = useState<string | null>(null);

  const handleDeleteClick = (variationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVariationToDelete(variationId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (variationToDelete) {
      onDeleteCanvas(variationToDelete);
      setVariationToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const handleDuplicateClick = (variationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicateCanvas(variationId);
  };

  return (
    <TooltipProvider>
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

        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>
            <p>{isCollapsed ? "Expand Gallery" : "Collapse Gallery"}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* New Canvas Button */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="p-2 border-b border-zinc-800/50"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onNewCanvas}
                  variant="outline"
                  size="sm"
                  className="w-full bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 transition-all duration-200"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Canvas
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New Canvas</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

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
          <AnimatePresence mode="popLayout">
            {(isCollapsed ? variations.slice(0, 3) : variations).map(
              (variation, index) => (
                <motion.div
                  key={variation.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                  }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
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
                  {/* Thumbnail image */}
                  <ImageDisplay
                    imageRef={variation.imageRef}
                    className="w-full h-full object-cover"
                    fallback={<div className="w-full h-full bg-gradient-to-br from-purple-500/30 to-blue-500/30" />}
                  />

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

                {/* Canvas Management Actions - Top-right corner on hover */}
                <AnimatePresence>
                  {hoveredVariation === variation.id && !isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-1.5 right-1.5 flex gap-1 z-10"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => handleDuplicateClick(variation.id, e)}
                            className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white p-1 h-auto w-auto border border-zinc-600/50"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Duplicate Canvas</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(e) => handleDeleteClick(variation.id, e)}
                            className="bg-red-800/90 hover:bg-red-700 text-red-300 hover:text-white p-1 h-auto w-auto border border-red-600/50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete Canvas</p>
                        </TooltipContent>
                      </Tooltip>
                    </motion.div>
                  )}
                </AnimatePresence>


                </motion.div>
              )
            )}
          </AnimatePresence>

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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100">Delete Canvas</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete this canvas? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
    </TooltipProvider>
  );
}
