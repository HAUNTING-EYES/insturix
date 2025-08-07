// ImmersiveModal.tsx
"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sparkles, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ContextValues } from "./ContextSelector";

type Source =
  | { type: "none" }
  | { type: "file"; file: File; duration: number }
  | { type: "link"; url: string; preview?: { title: string; thumbnail: string; videoId: string } };

interface ImmersiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Source;
  context: ContextValues;
  setContext: (ctx: ContextValues) => void;
}

export const ImmersiveModal: React.FC<ImmersiveModalProps> = ({
  open,
  onOpenChange,
  source,
  context,
  setContext,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl w-[92vw] max-h-[88vh] p-0 rounded-2xl bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/70 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
      {/* Make only the interior body scrollable; keep header fixed */}
      <div className="relative flex min-h-[320px] max-h-[88vh] flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0 border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/80 to-zinc-900/50"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-400/20">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            </span>
            <h3 className="text-zinc-100 font-medium tracking-tight">
              Review & refine before analysis
            </h3>
          </div>
        </motion.div>

        {/* Scroll area */}
        <div className="px-5 pb-5 pt-4 overflow-y-auto">
          {/* Compact row: thumbnail left (capped height), meta right */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
            className="w-full"
          >
            <div className="w-full rounded-xl border border-zinc-800/70 bg-zinc-950/50 ring-1 ring-white/5 p-3">
              <div className="flex items-start gap-3">
                {/* Fixed-size thumbnail box */}
                <div className="relative shrink-0 w-[220px] max-w-[40%] aspect-[16/9] overflow-hidden rounded-lg border border-zinc-800/70 bg-zinc-900/60">
                  {source.type === "link" && source.preview?.thumbnail ? (
                    <Image
                      src={source.preview.thumbnail}
                      alt={source.preview.title || "Video thumbnail"}
                      fill
                      className="object-cover"
                    />
                  ) : source.type === "link" ? (
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800/50 to-zinc-700/30" />
                  ) : source.type === "file" ? (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs">
                      <Upload className="h-4 w-4 mr-2" /> {source.file.name}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">
                      Add a link or file to preview
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5 rounded-lg" />
                </div>

                {/* Meta */}
                <div className="min-w-0 pt-0.5">
                  <p className="text-[13px] text-zinc-200 leading-snug line-clamp-2">
                    {source.type === "link"
                      ? source.preview?.title || "Loading preview..."
                      : source.type === "file"
                      ? "Local video"
                      : "—"}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1 truncate">
                    {/* Add more meta info here if needed */}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);