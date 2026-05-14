"use client";

import React from "react";
import { motion } from "framer-motion";
import { STAGE_MILESTONES, type ExportStep } from "./types";

interface ExportStageHeaderProps {
  currentStage: ExportStep;
}

function getMilestoneStatus(
  milestone: (typeof STAGE_MILESTONES)[number],
  currentStage: ExportStep,
): "completed" | "current" | "future" {
  const allStages = STAGE_MILESTONES.flatMap((m) => m.stages);
  const currentIdx = allStages.indexOf(currentStage);

  const milestoneFirstIdx = allStages.indexOf(milestone.stages[0]);
  const milestoneLastIdx = allStages.indexOf(
    milestone.stages[milestone.stages.length - 1],
  );

  if (currentIdx > milestoneLastIdx) return "completed";
  if (currentIdx >= milestoneFirstIdx && currentIdx <= milestoneLastIdx)
    return "current";
  return "future";
}

export function ExportStageHeader({ currentStage }: ExportStageHeaderProps) {
  return (
    <div className="w-full px-2 py-3">
      <div className="flex items-center justify-between">
        {STAGE_MILESTONES.map((milestone, idx) => {
          const status = getMilestoneStatus(milestone, currentStage);
          const isLast = idx === STAGE_MILESTONES.length - 1;

          return (
            <React.Fragment key={milestone.id}>
              {/* Milestone dot + label */}
              <div className="flex flex-col items-center gap-1.5 relative">
                <div className="relative flex items-center justify-center">
                  {status === "current" && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-[#D4A652]/20"
                      animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{ width: 12, height: 12, margin: "-2px" }}
                    />
                  )}
                  <motion.div
                    className={`w-2 h-2 rounded-full relative z-10 ${
                      status === "completed"
                        ? "bg-[#5EC97E]"
                        : status === "current"
                          ? "bg-[#D4A652]"
                          : "bg-[#454340]"
                    }`}
                    layoutId={
                      status === "current"
                        ? "active-milestone-dot"
                        : undefined
                    }
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                    }}
                  />
                </div>
                <span
                  className={`text-[9px] uppercase tracking-wider whitespace-nowrap ${
                    status === "completed"
                      ? "text-[#5EC97E]"
                      : status === "current"
                        ? "text-[#D4A652] font-semibold"
                        : "text-[#454340]"
                  }`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {milestone.label}
                </span>
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div className="flex-1 h-px mx-1 mb-5 relative">
                  <div className="absolute inset-0 bg-[#454340]" />
                  {status === "completed" && (
                    <motion.div
                      className="absolute inset-0 bg-[#5EC97E]"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      style={{ transformOrigin: "left" }}
                    />
                  )}
                  {status === "current" && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-[#D4A652] to-[#454340]"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      style={{ transformOrigin: "left" }}
                    />
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
