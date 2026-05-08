"use client";

import React from "react";
import { ModeSwitcher, WorkspaceMode } from "./ModeSwitcher";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkspaceHeaderProps {
  currentMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  title?: string;
  onBack?: () => void;
  showBack?: boolean;
  rightActions?: React.ReactNode;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  currentMode,
  onModeChange,
  title = "Script",
  onBack,
  showBack = false,
  rightActions,
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-[#0B0B0A]/80 backdrop-blur-md border-b border-[#1C1B19]/50 z-40 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4 min-w-[200px]">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-neutral-400 hover:text-[#ECE9E1] hover:bg-[#1C1B19]/50 -ml-2"
          >
            <ChevronLeft size={20} />
          </Button>
        )}
        <h1 className="text-lg font-semibold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent truncate">
          {title}
        </h1>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <ModeSwitcher currentMode={currentMode} onModeChange={onModeChange} />
      </div>

      <div className="flex items-center gap-2 min-w-[200px] justify-end">
        {rightActions}
      </div>
    </header>
  );
};

