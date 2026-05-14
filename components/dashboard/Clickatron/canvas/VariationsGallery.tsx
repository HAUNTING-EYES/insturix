"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Plus, Copy, Trash2, Loader2, X } from "lucide-react";
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
import { CreditsBadge } from "@/components/shared/CreditsCard";

interface VariationsGalleryProps {
  variations: Variation[];
  activeVariationId: string | null;
  onVariationSelect: (variationId: string) => void;
  onAddToCompare: (variationId: string) => void;
  onNewVariation: () => void;
  onDuplicateVariation: (variationId: string) => void;
  onDeleteVariation: (variationId: string) => void;
  mobile?: boolean;
  className?: string;
  onClose?: () => void;
}

export function VariationsGallery({
  variations,
  activeVariationId,
  onVariationSelect,
  onAddToCompare,
  onNewVariation,
  onDuplicateVariation,
  onDeleteVariation,
  mobile = false,
  className = "",
  onClose,
}: VariationsGalleryProps) {
  const [hoveredVariation, setHoveredVariation] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [variationToDelete, setVariationToDelete] = useState<string | null>(null);

  const outsideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mobile && onClose && outsideRef.current) {
      const handleOutsideClick = (e: MouseEvent) => {
        if (outsideRef.current && !outsideRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [mobile, onClose]);

  const handleDeleteClick = (variationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVariationToDelete(variationId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (variationToDelete) {
      onDeleteVariation(variationToDelete);
      setVariationToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const handleDuplicateClick = (variationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicateVariation(variationId);
  };

  return (
    <TooltipProvider>
      <motion.div
        initial={false}
        className={`bg-[#131312] border-r border-[#1C1B19]/80 flex flex-col h-full w-full ${className} ${mobile ? 'w-[90vw] fixed inset-y-0 left-0 z-50 md:relative md:w-80 pt-16' : ''}`}
        style={mobile ? {} : {}}
        ref={outsideRef}
      >
      {/* Header */}
      <div
        className={`p-4 border-b border-[#1C1B19]/80 flex items-center justify-between min-h-[72px]`}
      >
        <div className="text-sm font-medium text-[#ECE9E1]">
          <h3>Variations</h3>
          <p className="text-[11px] text-[#7A776E]">
            {variations.length} generated
          </p>
        </div>

        <div className="flex items-center gap-2">
          {mobile && onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-[#7A776E] hover:text-[#ECE9E1] p-1 h-6 w-6"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* New Variation Button */}
      <div className="p-2 border-b border-[#1C1B19]/50">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onNewVariation}
              variant="outline"
              size="sm"
              className="w-full bg-[#1B1A18]/50 border-[#282724] hover:bg-[#282724]/50 hover:border-[#282724] text-[#B5B2A8] hover:text-[#ECE9E1] transition-all duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Variation
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>New Variation</p>
          </TooltipContent>
        </Tooltip>
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
          className="space-y-2"
        >
          {/* Show first 3 variations in collapsed state, all in expanded */}
          <AnimatePresence mode="popLayout">
            {variations.map(
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
                    delay: index * 0.05,
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
                  onClick={() => {
                    onVariationSelect(variation.id);
                    if (mobile && onClose) onClose();
                  }}
                  className={`
                  relative overflow-hidden cursor-pointer border
                  transition-all duration-200
                  ${
                    "aspect-video rounded-lg"
                  }
                  ${
                    activeVariationId === variation.id
                      ? "border-[#7A776E]"
                      : "border-[#282724] hover:border-[#282724]"
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
                  {variation.status === 'blank' || !variation.imageRef || variation.imageRef.trim() === '' ? (
                    <div className="w-full h-full bg-[#1B1A18]/30 border-2 border-dashed border-[#282724]/50 flex items-center justify-center">
                      <Plus className="h-3 w-3 text-[#7A776E]" />
                    </div>
                  ) : variation.status === 'generating' ? (
                    <div className="w-full h-full bg-gradient-to-br from-[#1B1A18]/60 to-[#1B1A18]/40 flex items-center justify-center rounded-lg border border-[#282724]/50 relative overflow-hidden">
                      {/* Ambient background */}
                      <div className="absolute inset-0 bg-gradient-to-br from-[#D4A652]/5 to-[#D4A652]/5 opacity-60" />
                      
                      {/* Loading indicator */}
                      <div className="relative z-10">
                        <div className="w-6 h-6 relative">
                          <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24">
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              className="text-[#282724]/30"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              strokeLinecap="round"
                              className="text-[#D4A652]"
                              strokeDasharray="63"
                              strokeDashoffset="16"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ImageDisplay
                      imageRef={variation?.thumbnailRef || variation.imageRef}
                      status={variation.status}
                      variationId={variation.id}
                      className="w-full h-full object-cover"
                      interactive={false}
                      fallback={<div className="w-full h-full bg-gradient-to-br from-[#D4A652]/30 to-[#D4A652]/20" />}
                      fineTuning={variation.fineTuning}
                    />
                  )}

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

                {/* Variation Management Actions - Top-right corner on hover */}
                <AnimatePresence>
                  {hoveredVariation === variation.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-1.5 right-1.5 flex gap-1 z-10"
                    >
                      {/* Only show duplicate button for completed and blank variations */}
                      {variation.status !== 'generating' && variation.status !== 'failed' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => handleDuplicateClick(variation.id, e)}
                              className="bg-[#1B1A18]/90 hover:bg-[#282724] text-[#B5B2A8] hover:text-white p-1 h-auto w-auto border border-[#282724]/50"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Duplicate Variation</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
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
                          <p>Delete Variation</p>
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
          {false && variations.length > 3 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="text-[11px] text-[#7A776E] mt-1"
            >
              +{variations.length - 3}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#131312] border-[#1C1B19]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#ECE9E1]">Delete Variation</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A776E]">
              Are you sure you want to delete this variation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1B1A18] border-[#282724] text-[#B5B2A8] hover:bg-[#282724] hover:text-[#ECE9E1]">
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
      
      {/* Credits Display at the bottom */}
      <div className="p-4 border-t border-[#1C1B19]/80 w-full h-auto">
        <CreditsBadge />
      </div>
    </motion.div>
    </TooltipProvider>
  );
}
