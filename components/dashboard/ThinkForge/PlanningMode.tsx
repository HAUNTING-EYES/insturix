"use client";

import React from "react";
import clsx from "clsx";
import PlanningPanel from "@/components/dashboard/ThinkForge/PlanningPanel";

interface PlanningModeProps {
  isVisible: boolean;
  onOpenScript: (sessionId: string) => void;
}

export default function PlanningMode({
  isVisible,
  onOpenScript
}: PlanningModeProps) {
  return (
    <div className={clsx("w-full h-full transition-opacity duration-300", isVisible ? "opacity-100 block" : "opacity-0 hidden absolute inset-0 pointer-events-none")}>
      <PlanningPanel
        isOpen={isVisible}
        onClose={() => {}}
        onOpenScript={onOpenScript}
      />
    </div>
  );
}

