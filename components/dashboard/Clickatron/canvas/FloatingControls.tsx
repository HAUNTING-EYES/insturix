"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Undo2, Redo2, ZoomIn, ZoomOut, Download, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingControlsProps {
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

export function FloatingControls({
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
}: FloatingControlsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="
        absolute bottom-8 left-1/2 transform -translate-x-1/2
        bg-[#131312] border border-[#282724]/50
        rounded-2xl p-3 shadow-2xl
        flex items-center gap-2
      "
    >
      {/* History Controls */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#282724]/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30 h-8 w-8 p-0"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30 h-8 w-8 p-0"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 pr-2 border-r border-[#282724]/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomOut}
          disabled={zoomLevel <= 25 || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30 h-8 w-8 p-0"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="text-[11px] text-[#7A776E] min-w-[40px] text-center px-1">
          {zoomLevel}%
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          disabled={zoomLevel >= 200 || isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] disabled:opacity-30 h-8 w-8 p-0"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          disabled={isDisabled}
          className="text-[#7A776E] hover:text-[#ECE9E1] h-8 px-3"
        >
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
        <Button
          onClick={onSave}
          disabled={isDisabled}
          size="sm"
          className="bg-[#D4A652] hover:bg-[#C49A48] text-[#0B0B0A] h-8 px-3"
        >
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}