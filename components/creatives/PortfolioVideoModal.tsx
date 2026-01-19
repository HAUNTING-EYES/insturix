"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Project } from "@/data/creatives-portfolio";
import { cn } from "@/lib/utils";

interface VideoModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PortfolioVideoModal({ project, isOpen, onClose }: VideoModalProps) {

  if (!project) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            layoutId={`card-${project.id}`}
            className={cn(
              "relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10",
              project.aspectRatio === "portrait" 
                ? "h-[85vh] aspect-[9/16]" 
                : "w-full max-w-5xl aspect-video"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Video Container */}
            <div className="absolute inset-0 w-full h-full bg-neutral-950">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${project.videoUrl}?autoplay=1&controls=1&rel=0&iv_load_policy=3&vq=hd1080`}
                title={project.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              />
            </div>

            {/* Overlay Info (Optional, fades out) */}
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
              <h3 className="text-2xl font-bold text-white mb-1">{project.company}</h3>
              <p className="text-neutral-300">{project.title}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
