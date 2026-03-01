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
        className="fixed bottom-6 right-6 z-[100] w-[320px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1 px-2 rounded-md bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-purple-400 flex items-center gap-1 uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              AI Preview
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="relative aspect-video bg-zinc-950 flex items-center justify-center group">
          {editedImageB64 ? (
            <img
              src={editedImageB64}
              alt="AI Edit Result"
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-xs">Generating preview...</span>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-10 animate-in fade-in duration-300">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-2 border-purple-500/20" />
                <Loader2 className="absolute top-0 h-12 w-12 animate-spin text-purple-500" />
              </div>
              <span className="text-sm font-medium text-zinc-200">
                Processing...
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="px-4 py-2 bg-zinc-900/30 border-t border-zinc-800/50">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-tighter">
              Model Used
            </span>
            <span className="text-xs text-zinc-300 font-semibold">{model}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex flex-col gap-3 bg-zinc-900/50">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={isLoading || isSaving}
              className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700 hover:text-white group transition-all"
            >
              <Download className="mr-2 h-3.5 w-3.5 group-hover:-translate-y-0.5 transition-transform" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isLoading || isSaving}
              className="bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700 hover:text-white group transition-all"
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
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold h-10 shadow-lg shadow-purple-600/20 active:scale-[0.98] transition-all"
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
