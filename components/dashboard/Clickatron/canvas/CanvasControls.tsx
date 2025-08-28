"use client";

import React from "react";
import { motion } from "framer-motion";
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDownload: () => void;
  onSave: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  zoomLevel?: number;
  isDisabled?: boolean;
}

export function CanvasControls({
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onDownload,
  onSave,
  canUndo = false,
  canRedo = false,
  zoomLevel = 100,
  isDisabled = false,
}: CanvasControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="
        mb-6 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/50
        rounded-2xl p-3 shadow-xl
        flex items-center justify-between gap-4 max-w-2xl mx-auto
      "
    >
      {/* Left: History Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30 h-8 w-8 p-0"
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30 h-8 w-8 p-0"
          title="Redo"
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
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30 h-8 w-8 p-0"
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="text-xs text-zinc-400 min-w-[50px] text-center px-2 py-1 bg-zinc-800/50 rounded-lg">
          {zoomLevel}%
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          disabled={zoomLevel >= 200 || isDisabled}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-30 h-8 w-8 p-0"
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          disabled={isDisabled}
          className="text-zinc-400 hover:text-zinc-200 h-8 px-3"
          title="Download"
        >
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
        <Button
          onClick={onSave}
          disabled={isDisabled}
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white h-8 px-3"
          title="Save & Exit"
        >
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}