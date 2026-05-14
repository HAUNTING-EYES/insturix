"use client";

import React from "react";
import { motion } from "framer-motion";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface PipelineProgressPanelProps {
  pipeline: UseExportPipelineReturn;
}

/** Step indicator matching the mockup's step list */
function StepRow({
  label,
  active,
  done,
  time,
}: {
  label: string;
  active: boolean;
  done: boolean;
  time?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        borderRadius: 4,
        fontSize: 12,
        ...(active
          ? { background: "rgba(212,166,82,0.04)", border: "1px solid rgba(212,166,82,0.08)", color: "#ECE9E1" }
          : done
            ? { color: "#7A776E" }
            : { color: "#5F5E5A" }),
      }}
    >
      {/* Icon */}
      <div style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {done ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5EC97E" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : active ? (
          <div className="export-vf-spinner" style={{ width: 12, height: 12, border: "2px solid #1B1A18", borderTopColor: "#D4A652", borderRadius: "50%" }} />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#454340" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /></svg>
        )}
      </div>
      <span style={{ flex: 1 }}>{label}</span>
      {time && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: active ? "#D4A652" : "#5F5E5A", opacity: active ? 0.7 : 1 }}>
          {time}
        </span>
      )}
    </div>
  );
}

export function PipelineProgressPanel({ pipeline }: PipelineProgressPanelProps) {
  const {
    step,
    scenes,
    generateStoryboard,
    generateVideos,
    videoProgress,
    detectedProfile,
    selectedProfileId,
    directorProgress,
    error,
  } = pipeline;

  // Compute overall progress percentage for viewfinder
  const progressPct = (() => {
    const stageOrder = [
      "exporting", "extracting-subjects", "generating-references",
      "storyboard", "generating-videos", "generating-voiceover",
      "finalizing", "directing",
    ];
    const idx = stageOrder.indexOf(step);
    if (idx < 0) return 0;
    let pct = Math.round(((idx + 0.5) / stageOrder.length) * 100);
    if (step === "generating-videos" && videoProgress.total > 0) {
      const videoFraction = videoProgress.done / videoProgress.total;
      pct = Math.round(((idx + videoFraction) / stageOrder.length) * 100);
    }
    return Math.min(pct, 99);
  })();

  // Current stage label for viewfinder
  const viewfinderLabel = (() => {
    switch (step) {
      case "exporting": return "Parsing";
      case "extracting-subjects": return "Scanning";
      case "generating-references": return "Rendering";
      case "storyboard": return "Drawing";
      case "generating-videos": return "Rendering";
      case "generating-voiceover": return "Narrating";
      case "finalizing": return "Assembling";
      case "directing": return "Polishing";
      default: return "Working";
    }
  })();

  // Processing header text
  const headerText = (() => {
    switch (step) {
      case "exporting": return "Reading your script";
      case "extracting-subjects": return "Identifying key subjects";
      case "generating-references": return "Creating reference images";
      case "storyboard": return "Building storyboard";
      case "generating-videos": return "Bringing scenes to life";
      case "generating-voiceover": return "Generating voiceover";
      case "finalizing": return "Assembling your video";
      case "directing": return "Applying edit profile";
      default: return "Processing";
    }
  })();

  // Video count string
  const countStr = step === "generating-videos" && videoProgress.total > 0
    ? `${videoProgress.done} / ${videoProgress.total}`
    : `${scenes.length || 0} scenes`;

  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-2 space-y-3"
    >
      {/* Keyframe animations via inline style tag */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes export-vfSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes export-recBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
        @keyframes export-spinSmall {
          to { transform: rotate(360deg); }
        }
        .export-vf-progress {
          animation: export-vfSpin 2s linear infinite;
        }
        .export-vf-rec-dot {
          animation: export-recBlink 1.5s ease-in-out infinite;
        }
        .export-vf-spinner {
          animation: export-spinSmall 1s linear infinite;
        }
      `}} />

      {/* ── Viewfinder inside film frame ── */}
      <div
        style={{
          border: "1px solid rgba(212,166,82,0.25)",
          borderRadius: 3,
          padding: 12,
          position: "relative",
          background: "rgba(212,166,82,0.015)",
        }}
      >
        {/* Frame number */}
        <span style={{ position: "absolute", top: 3, right: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "#454340", letterSpacing: "0.06em" }}>FRM 005</span>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0 14px", position: "relative" }}>
          {/* Viewfinder circle */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            border: "2px solid #D4A652", position: "relative",
            boxShadow: "0 0 0 4px #131312, 0 0 0 5px #282724, 0 0 20px rgba(212,166,82,0.1)",
            overflow: "hidden", background: "#1B1A18",
          }}>
            {/* Crosshairs */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 0.5, background: "rgba(212,166,82,0.3)", zIndex: 3 }} />
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 0.5, background: "rgba(212,166,82,0.3)", zIndex: 3 }} />

            {/* Corner brackets */}
            {[
              { top: 6, left: 6 },
              { top: 6, right: 6 },
              { bottom: 6, left: 6 },
              { bottom: 6, right: 6 },
            ].map((pos, i) => {
              const isTop = "top" in pos;
              const isLeft = "left" in pos;
              return (
                <div key={i} style={{ position: "absolute", width: 10, height: 10, zIndex: 4, ...pos } as React.CSSProperties}>
                  <div style={{
                    position: "absolute",
                    background: "rgba(212,166,82,0.5)",
                    width: 8, height: 1,
                    ...(isTop ? { top: 0 } : { bottom: 0 }),
                    ...(isLeft ? { left: 0 } : { right: 0 }),
                  }} />
                  <div style={{
                    position: "absolute",
                    background: "rgba(212,166,82,0.5)",
                    width: 1, height: 8,
                    ...(isTop ? { top: 0 } : { bottom: 0 }),
                    ...(isLeft ? { left: 0 } : { right: 0 }),
                  }} />
                </div>
              );
            })}

            {/* Progress ring */}
            <div
              className="export-vf-progress"
              style={{
                position: "absolute", inset: 4, borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "#D4A652", borderRightColor: "#D4A652",
                zIndex: 2,
              }}
            />

            {/* Center text */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", zIndex: 5,
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: "#D4A652" }}>
                {progressPct}%
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {viewfinderLabel}
              </span>
            </div>
          </div>

          {/* REC indicator */}
          <div style={{
            position: "absolute", top: 3, right: 0,
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 8,
            color: "#D46A5C", letterSpacing: "0.06em",
          }}>
            <div className="export-vf-rec-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#D46A5C" }} />
            REC
          </div>
        </div>
      </div>

      {/* Processing header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div className="export-vf-spinner" style={{ width: 14, height: 14, border: "2px solid #1B1A18", borderTopColor: "#D4A652", borderRadius: "50%" }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#ECE9E1" }}>{headerText}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#D4A652", marginLeft: "auto" }}>{countStr}</span>
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <StepRow
          label="Reading your script"
          active={step === "exporting"}
          done={step !== "exporting"}
        />
        {generateStoryboard && (
          <>
            <StepRow
              label="Identifying visuals"
              active={step === "extracting-subjects"}
              done={!["exporting", "extracting-subjects"].includes(step)}
            />
            <StepRow
              label="Creating references"
              active={step === "generating-references"}
              done={!["exporting", "extracting-subjects", "generating-references"].includes(step)}
            />
            <StepRow
              label="Building storyboard"
              active={step === "storyboard"}
              done={["reviewing-storyboard", "generating-videos", "generating-voiceover", "finalizing", "done"].includes(step)}
            />
          </>
        )}
        {generateStoryboard && generateVideos && (
          <StepRow
            label={
              step === "generating-videos" && videoProgress.total > 0
                ? `Bringing scenes to life (${videoProgress.done}/${videoProgress.total})`
                : "Bringing scenes to life"
            }
            active={step === "generating-videos"}
            done={["generating-voiceover", "finalizing", "done"].includes(step)}
          />
        )}
        <StepRow
          label="Adding voiceover"
          active={step === "generating-voiceover"}
          done={["finalizing", "directing", "done"].includes(step)}
        />
        <StepRow
          label="Assembling your video"
          active={step === "finalizing"}
          done={["directing", "done"].includes(step)}
        />
        {selectedProfileId && (
          <StepRow
            label="Polishing your edit"
            active={step === "directing"}
            done={step === "done"}
          />
        )}
      </div>

      {/* Director progress detail */}
      {step === "directing" && directorProgress.desc && (
        <p style={{ fontSize: 11, color: "#7A776E", textAlign: "center" }}>
          {directorProgress.desc}
        </p>
      )}

      {error && (
        <p style={{ fontSize: 11, color: "#D4A652", textAlign: "center", marginTop: 4 }}>{error}</p>
      )}
    </motion.div>
  );
}
