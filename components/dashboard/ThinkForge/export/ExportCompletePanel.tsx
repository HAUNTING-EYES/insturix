"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  ImageIcon,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ExportCompletePanelProps {
  pipeline: UseExportPipelineReturn;
}

export function ExportCompletePanel({ pipeline }: ExportCompletePanelProps) {
  const {
    scenes,
    aspectRatio,
    storyboardId,
    storyboardScenes,
    videosGenerated,
    audioGenerating,
    projectId,
    error,
    handleClose,
  } = pipeline;

  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-4 py-2"
    >
      {/* Success card */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-[#D4A652]/10 border border-[#D4A652]/20">
        <Check className="h-6 w-6 text-[#D4A652]" />
        <div>
          <p className="text-sm font-medium text-[#ECE9E1] font-sans">Project Created</p>
          <p className="text-[11px] text-[#7A776E]">
            {scenes.length} scenes · {aspectRatio}
            {storyboardId && " · Storyboard"}
            {videosGenerated && " · AI Videos"}
          </p>
        </div>
      </div>

      {/* Audio generating in background indicator */}
      {audioGenerating && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[#5CB8CC]/10 border border-[#5CB8CC]/20">
          <Loader2 className="h-4 w-4 text-[#5CB8CC] animate-spin" />
          <div>
            <p className="text-[11px] font-medium text-[#5CB8CC]">
              Music & Sound Effects generating
            </p>
            <p className="text-[10px] text-[#5CB8CC]/70">
              Audio will appear in your Editor project automatically. Refresh the
              editor after a few minutes.
            </p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {error && (
        <div className="p-3 rounded-lg bg-[#D4A652]/10 border border-[#D4A652]/20">
          <p className="text-[11px] text-[#D4A652]">{error}</p>
        </div>
      )}

      {/* Storyboard preview */}
      {storyboardScenes.length > 0 && (
        <div>
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-[#5F5E5A] mb-2">Storyboard Preview</p>
          <div className="grid grid-cols-3 gap-2">
            {storyboardScenes.slice(0, 6).map((s: any) => (
              <div
                key={s.sceneIndex}
                className="aspect-video bg-[#1B1A18] rounded overflow-hidden relative"
              >
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#454340]">
                    <ImageIcon className="h-4 w-4" />
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-[#B5B2A8] px-1 py-0.5 truncate">
                  {s.title}
                </span>
              </div>
            ))}
          </div>
          {storyboardScenes.length > 6 && (
            <p className="text-[10px] text-[#5F5E5A] mt-1">
              +{storyboardScenes.length - 6} more scenes
            </p>
          )}
          {storyboardId && (
            <button
              onClick={() =>
                window.open(`/dashboard/storyboard/${storyboardId}`, "_blank")
              }
              className="mt-2 w-full text-[11px] text-[#D4A652] hover:text-[#D4A652]/80 hover:bg-[#D4A652]/10 rounded py-1.5 transition-colors flex items-center justify-center gap-1.5"
            >
              <ImageIcon className="h-3 w-3" />
              View Full Storyboard (sub-shots, regenerate, review)
            </button>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1C1B19]">
        <Button variant="ghost" onClick={handleClose} className="bg-transparent border border-[#282724] text-[#7A776E] hover:border-[#D4A652] hover:text-[#D4A652] rounded-[7px]">
          Close
        </Button>
        {storyboardId && (
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/dashboard/storyboard/${storyboardId}`;
            }}
            className="border-[#D4A652]/30 text-[#D4A652] hover:bg-[#D4A652]/10 rounded-[7px]"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Edit Storyboard
          </Button>
        )}
        <Button
          onClick={() => {
            window.location.href = `/dashboard/editron/project/${projectId}`;
          }}
          className="bg-[#D4A652] hover:bg-[#C49840] text-[#0B0B0A] font-semibold rounded-[7px] border-none"
        >
          <Video className="h-4 w-4 mr-2" />
          Open in Editor
        </Button>
      </div>
    </motion.div>
  );
}
