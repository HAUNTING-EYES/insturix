"use client";

import React from "react";
import { motion } from "framer-motion";
import { Project } from "@/data/creatives-portfolio";
import { Play } from "lucide-react";

interface PortfolioCardProps {
  project: Project;
  onOpen: (project: Project) => void;
}

export function PortfolioCard({ project, onOpen }: PortfolioCardProps) {
  return (
    <motion.div
      layoutId={`card-${project.id}`}
      className="relative group cursor-pointer w-full aspect-[4/3] md:aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-lg"
      onClick={() => onOpen(project)}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      {/* Thumbnail Image (Always visible as base) */}
      <img
        src={project.thumbnail}
        alt={project.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
      />

      {/* Glassy Blur Overlay (Colors + Blur) */}
      {/* Visible when NOT hovering. Blur disabled on mobile for performance. */}
      <div 
        className="absolute inset-0 w-full h-full transition-all duration-500 ease-in-out group-hover:opacity-0"
        style={{
          backgroundColor: `${project.brandColor}60`, // slightly more opaque to compensate for less blur
        }}
      >
        <div className="absolute inset-0 hidden md:block backdrop-blur-[12px]" />
      </div>

      {/* Dark gradient for text readability (Always present but subtle) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

      {/* Content Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        {/* Logo/Company - Fades out on hover to show video thumbnail clearly */}
        <div className="transform transition-all duration-300 group-hover:-translate-y-4 group-hover:opacity-0 flex flex-col items-center">
            {project.logo && (
                <div className="mb-6 h-16 md:h-24 w-auto max-w-[160px] md:max-w-[240px] flex items-center justify-center filter brightness-0 invert opacity-90 transition-transform duration-300 group-hover:scale-110">
                     <img src={project.logo} alt={project.company} className="h-full object-contain" />
                </div>
            )}
            <h3 className="text-xl md:text-3xl font-bold text-white tracking-tight drop-shadow-md">
            {project.company}
            </h3>
        </div>

        {/* Play Button - Scales in on hover */}
        <div className="absolute opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 delay-100 flex items-center justify-center w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-xl">
            <Play fill="white" className="ml-1" />
        </div>
      </div>
          
      {/* Title - Visible on Hover at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
        <p className="text-sm font-medium text-white/80 uppercase tracking-wider mb-1">Project</p>
        <h4 className="text-lg font-bold text-white leading-tight">{project.title}</h4>
      </div>
    </motion.div>
  );
}
