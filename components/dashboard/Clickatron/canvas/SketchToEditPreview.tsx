"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  RefreshCcw,
  Save,
  X,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SketchToEditPreviewProps {
  editedImageB64: string;
  model: string;
  onDownload: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onClose: () => void;
  isLoading: boolean;
  isSaving?: boolean;
}

export function SketchToEditPreview({
  editedImageB64,
  model,
  onDownload,
  onRegenerate,
  onSave,
  onClose,
  isLoading,
  isSaving = false,
}: SketchToEditPreviewProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="fixed bottom-6 right-6 z-[100] w-[320px] bg-[#131312] border border-[#1C1B19] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[#1C1B19] bg-[#131312]/50">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2 rounded-md bg-[#D4A652]/10 border border-[#D4A652]/20 text-[10px] font-bold text-[#D4A652] flex items-center gap-1 uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              AI Preview
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full hover:bg-[#1B1A18] text-[#7A776E] hover:text-[#ECE9E1]"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="relative aspect-video bg-[#0B0B0A] flex items-center justify-center group">
          {editedImageB64 ? (
            <img
              src={editedImageB64}
              alt="AI Edit Result"
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[#7A776E]">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-[11px]">Generating preview...</span>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#0F0F0E]/60 flex flex-col items-center justify-center gap-3 z-10 animate-in fade-in duration-300">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-2 border-[#D4A652]/20" />
                <Loader2 className="absolute top-0 h-12 w-12 animate-spin text-[#D4A652]" />
              </div>
              <span className="text-sm font-medium text-[#ECE9E1]">
                Processing...
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="px-4 py-2 bg-[#131312]/30 border-t border-[#1C1B19]/50">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[#7A776E] font-medium uppercase tracking-tighter">
              Model Used
            </span>
            <span className="text-[11px] text-[#B5B2A8] font-semibold">{model}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex flex-col gap-3 bg-[#131312]/50">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={isLoading || isSaving}
              className="bg-[#1B1A18]/50 border-[#282724] hover:bg-[#282724] hover:text-white group transition-all"
            >
              <Download className="mr-2 h-3.5 w-3.5 group-hover:-translate-y-0.5 transition-transform" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isLoading || isSaving}
              className="bg-[#1B1A18]/50 border-[#282724] hover:bg-[#282724] hover:text-white group transition-all"
            >
              <RefreshCcw
                className={`mr-2 h-3.5 w-3.5 group-hover:rotate-180 transition-transform duration-500 ${isLoading ? "animate-spin" : ""}`}
              />
              Redo
            </Button>
          </div>

          <Button
            onClick={onSave}
            disabled={isLoading || isSaving || !editedImageB64}
            className="w-full bg-gradient-to-r from-[#D4A652] to-[#C49A48] hover:from-[#C49A48] hover:to-[#B8903E] text-[#0B0B0A] font-bold h-10 shadow-lg shadow-[#D4A652]/20 active:scale-[0.98] transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save as Variation
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
