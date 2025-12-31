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
        "relative flex items-center justify-center p-1 bg-neutral-900/50 backdrop-blur-md rounded-full border border-neutral-800/60 shadow-lg",
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
              isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeMode"
                className="absolute inset-0 bg-red-600/20 border border-red-500/30 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon size={16} className={clsx(isActive ? "text-red-400" : "currentColor")} />
            <span className="hidden sm:inline-block">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};

