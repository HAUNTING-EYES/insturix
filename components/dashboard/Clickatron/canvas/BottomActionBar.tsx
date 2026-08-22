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
        bg-[#0B0B0A] border-t border-[#1C1B19]/50
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
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30"
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
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="text-[11px] text-[#7A776E] min-w-[50px] text-center">
          {zoomLevel}%
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          disabled={zoomLevel >= 200 || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30"
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
          className="border-[#282724] text-[#B5B2A8] hover:text-[#ECE9E1] hover:border-[#282724]"
        >
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
        <Button
          onClick={onSaveAndExit}
          disabled={isDisabled}
          className="bg-[#D4A652] hover:bg-[#C49A48] text-[#0B0B0A]"
        >
          <Save className="h-4 w-4 mr-2" />
          Save & Exit
        </Button>
      </div>
    </motion.div>
  );
}
