"use client";

import React from "react";
import type { MusitronTask } from "@/app/api/services/musitron/types/shared";

export interface VinylCarouselProps {
  tasks: MusitronTask[];
  activeTaskId: string | null;
  isPlaying: boolean;
  onSelect: (taskId: string) => void;
  onPlay: (taskId: string) => void;
}

/** Deterministic gradient from title string for vinyl art */
function titleToGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  const h3 = (h1 + 120) % 360;
  return `linear-gradient(135deg, hsl(${h1},30%,10%), hsl(${h2},40%,20%), hsl(${h3},50%,40%))`;
}

function statusBadge(status: MusitronTask["status"]) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: "rgba(74,222,128,0.1)", color: "#4ade80", label: "Complete" },
    processing: { bg: "rgba(212,166,82,0.1)", color: "#D4A652", label: "In Progress" },
    listed: { bg: "rgba(212,166,82,0.1)", color: "#D4A652", label: "Queued" },
    failed: { bg: "rgba(248,113,113,0.1)", color: "#f87171", label: "Failed" },
  };
  return map[status] ?? map.failed;
}

export function VinylCarousel({
  tasks,
  activeTaskId,
  isPlaying,
  onSelect,
  onPlay,
}: VinylCarouselProps) {
  if (tasks.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        overflowX: "auto",
        padding: "12px 4px 20px",
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
      className="vinyl-carousel-scroll"
    >
      <style>{`.vinyl-carousel-scroll::-webkit-scrollbar{display:none}`}</style>
      {tasks.map((task, i) => {
        const isActive = task._id === activeTaskId;
        const isCurrentPlaying = isActive && isPlaying;
        const badge = statusBadge(task.status);
        const gradient = titleToGradient(task.title || `Track ${i}`);

        return (
          <div
            key={task._id}
            onClick={() => {
              if (task.status === "completed") {
                onSelect(task._id);
                onPlay(task._id);
              }
            }}
            style={{
              flexShrink: 0,
              width: 180,
              scrollSnapAlign: "center",
              cursor: task.status === "completed" ? "pointer" : "default",
              transition: "transform .4s cubic-bezier(.16,1,.3,1)",
              animation: `vinylFlipIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.08}s both`,
            }}
            className="vinyl-card-hover"
          >
            {/* Vinyl Disc */}
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                position: "relative",
                marginBottom: 12,
                background: gradient,
                boxShadow: isActive
                  ? "0 0 40px rgba(212, 166, 82, 0.25)"
                  : "none",
                transition: "box-shadow .3s cubic-bezier(.16,1,.3,1)",
                animation: isCurrentPlaying
                  ? "vinylSpin 4s linear infinite"
                  : "none",
              }}
            >
              {/* Grooves overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background:
                    "repeating-radial-gradient(circle, transparent 0px, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)",
                  zIndex: 1,
                }}
              />
              {/* Center hole */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#0B0B0A",
                  transform: "translate(-50%,-50%)",
                  zIndex: 2,
                  border: "2px solid rgba(255,255,255,0.05)",
                }}
              />
              {/* Play overlay on hover */}
              <div
                className="vinyl-play-overlay"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity .2s",
                  zIndex: 3,
                  pointerEvents: "none",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="#D4A652">
                  <polygon points="8,5 19,12 8,19" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                textAlign: "center",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#ECE9E1",
              }}
            >
              {task.title || "Untitled"}
            </div>

            {/* Meta */}
            <div
              style={{
                fontSize: 10,
                color: "#5F5E5A",
                textAlign: "center",
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 2,
              }}
            >
              {task.style || "Unknown"}
            </div>

            {/* Status Badge */}
            <div
              style={{
                display: "block",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginTop: 6,
                textAlign: "center",
                background: badge.bg,
                color: badge.color,
                animation:
                  task.status === "processing" || task.status === "listed"
                    ? "vinylPulse 1.5s ease infinite"
                    : "none",
              }}
            >
              {badge.label}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes vinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes vinylPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes vinylFlipIn { from { transform: rotateY(90deg) scale(0.8); opacity: 0; } to { transform: rotateY(0) scale(1); opacity: 1; } }
        .vinyl-card-hover:hover { transform: translateY(-8px); }
        .vinyl-card-hover:hover .vinyl-play-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
