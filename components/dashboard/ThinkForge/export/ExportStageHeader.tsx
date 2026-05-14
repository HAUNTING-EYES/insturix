"use client";

import React from "react";
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

/* ── Inline SVG icons for each pipeline stage (tiny, mono-stroke) ── */
const STAGE_ICONS: Record<string, React.ReactNode> = {
  config: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" /><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" />
    </svg>
  ),
  profile: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="8" cy="6" r="2.5" /><path d="M3.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
    </svg>
  ),
  references: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="3" y="3" width="10" height="10" rx="1.5" /><path d="M3 11l3-3 2 2 2.5-2.5L14 11" />
    </svg>
  ),
  storyboard: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <rect x="2.5" y="3" width="5" height="4" rx="0.8" /><rect x="8.5" y="3" width="5" height="4" rx="0.8" /><rect x="2.5" y="9" width="5" height="4" rx="0.8" /><rect x="8.5" y="9" width="5" height="4" rx="0.8" />
    </svg>
  ),
  generate: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <polygon points="5.5,3 12.5,8 5.5,13" />
    </svg>
  ),
  done: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <polyline points="4,8.5 7,11.5 12,5" />
    </svg>
  ),
};

/* Completed-stage checkmark icon */
const CHECK_ICON = (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <polyline points="4,8.5 7,11.5 12,5" />
  </svg>
);

/* Mini sprocket row for the strip bar */
function MiniSprocketRow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0 8px",
        height: 6,
        alignItems: "center",
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 3,
            borderRadius: 1,
            background: "#454340",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export function ExportStageHeader({ currentStage }: ExportStageHeaderProps) {
  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: "1px solid #1C1B19" }}
    >
      <p
        style={{
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: "#5F5E5A",
          marginBottom: 10,
        }}
      >
        Production Pipeline
      </p>

      {/* Film strip bar */}
      <div
        style={{
          position: "relative",
          background: "#1B1A18",
          border: "1px solid #282724",
          borderRadius: 3,
        }}
      >
        <MiniSprocketRow />

        {/* Stage frames */}
        <div style={{ display: "flex", gap: 0, padding: "0 3px" }}>
          {STAGE_MILESTONES.map((milestone, idx) => {
            const status = getMilestoneStatus(milestone, currentStage);
            const isLast = idx === STAGE_MILESTONES.length - 1;
            const icon = status === "completed"
              ? CHECK_ICON
              : STAGE_ICONS[milestone.id] || STAGE_ICONS.config;

            return (
              <div
                key={milestone.id}
                style={{
                  flex: 1,
                  position: "relative",
                  padding: 3,
                }}
              >
                {/* Frame divider */}
                {!isLast && (
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 0,
                      bottom: 3,
                      width: 1,
                      background: "#1C1B19",
                    }}
                  />
                )}

                {/* Frame inner */}
                <div
                  style={{
                    aspectRatio: "1 / 0.6",
                    borderRadius: 2,
                    border: `1px solid ${
                      status === "completed"
                        ? "rgba(94,201,126,0.25)"
                        : status === "current"
                          ? "#D4A652"
                          : "#1C1B19"
                    }`,
                    display: "flex",
                    flexDirection: "column" as const,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    background:
                      status === "completed"
                        ? "linear-gradient(135deg, rgba(94,201,126,0.06), rgba(94,201,126,0.1))"
                        : status === "current"
                          ? "linear-gradient(135deg, rgba(212,166,82,0.03), #1B1A18, rgba(212,166,82,0.05))"
                          : "rgba(11,11,10,0.5)",
                    boxShadow:
                      status === "current"
                        ? "0 0 6px rgba(212,166,82,0.15), inset 0 0 12px rgba(212,166,82,0.04)"
                        : undefined,
                    transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      fontSize: 10,
                      lineHeight: 1,
                      position: "relative",
                      zIndex: 2,
                      color:
                        status === "completed"
                          ? "#5EC97E"
                          : status === "current"
                            ? "#D4A652"
                            : "#454340",
                      opacity: status === "future" ? 0.5 : 1,
                    }}
                  >
                    {icon}
                  </div>

                  {/* Label */}
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                      fontSize: 7,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase" as const,
                      textAlign: "center" as const,
                      position: "relative",
                      zIndex: 2,
                      color:
                        status === "completed"
                          ? "#7A776E"
                          : status === "current"
                            ? "#D4A652"
                            : "#454340",
                    }}
                  >
                    {milestone.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <MiniSprocketRow />
      </div>
    </div>
  );
}
