"use client";

import React from "react";
import { motion } from "framer-motion";
import { Lightbulb, FileText, Calendar } from "lucide-react";
import clsx from "clsx";

export type WorkspaceMode = "ideation" | "scripting" | "planning";

interface ModeSwitcherProps {
  currentMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  className?: string;
}

const modes: { id: WorkspaceMode; label: string; icon: React.ComponentType<any> }[] = [
  { id: "ideation", label: "Ideation", icon: Lightbulb },
  { id: "scripting", label: "Scripting", icon: FileText },
  { id: "planning", label: "Planning", icon: Calendar },
];

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  currentMode,
  onModeChange,
  className,
}) => {
  return (
    <div
      className={clsx(
        "relative flex items-center justify-center p-1 bg-[#0F0F0E]/50 backdrop-blur-md rounded-full border border-[#1C1B19]/60 shadow-lg",
        className
      )}
    >
      {modes.map((mode) => {
        const isActive = currentMode === mode.id;
        const Icon = mode.icon;

        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            className={clsx(
              "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10",
              isActive ? "text-[#ECE9E1]" : "text-[#5F5E5A] hover:text-[#B5B2A8]"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeMode"
                className="absolute inset-0 bg-[#D4A652]/20 border border-[#D4A652]/30 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={16} className={clsx(isActive ? "text-[#D4A652]" : "currentColor")} />
            <span className="hidden sm:inline-block">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};

