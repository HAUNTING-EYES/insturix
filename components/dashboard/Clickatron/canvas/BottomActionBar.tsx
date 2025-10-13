"use client";

import React from "react";
import { motion } from "framer-motion";
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BottomActionBarProps {
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDownload: () => void;
  onSaveAndExit: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  zoomLevel?: number;
  isDisabled?: boolean;
  galleryCollapsed?: boolean;
}

export function BottomActionBar({
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onDownload,
  onSaveAndExit,
  canUndo = false,
  canRedo = false,
  zoomLevel = 100,
  isDisabled = false,
  galleryCollapsed = false,
}: BottomActionBarProps) {
  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
      className={`
        fixed bottom-0 left-0 right-0 z-40
        bg-zinc-950/90 backdrop-blur-sm border-t border-zinc-800/50
        h-16 flex items-center justify-between px-6 pr-80 transition-all duration-300
        ${galleryCollapsed ? "pl-16" : "pl-72"}
      `}
    >
      {/* Left: History Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Center: Zoom Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomOut}
          disabled={zoomLevel <= 25 || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="text-xs text-zinc-500 min-w-[50px] text-center">
          {zoomLevel}%
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          disabled={zoomLevel >= 200 || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={isDisabled}
          className="border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
        >
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
        <Button
          onClick={onSaveAndExit}
          disabled={isDisabled}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Save className="h-4 w-4 mr-2" />
          Save & Exit
        </Button>
      </div>
    </motion.div>
  );
}
