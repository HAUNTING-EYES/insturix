"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ExportCompletePanelProps {
  pipeline: UseExportPipelineReturn;
}

export function ExportCompletePanel({ pipeline }: ExportCompletePanelProps) {
  const {
    title,
    scenes,
    aspectRatio,
    storyboardId,
    storyboardScenes,
    videosGenerated,
    audioGenerating,
    projectId,
    error,
    clickatronCreating,
    clickatronHandoffState,
    clickatronVisualChoices,
    setClickatronVisualChoice,
    handleCreateClickatronSession,
    handleClose,
  } = pipeline;
  const clickatronCanSend = Boolean(clickatronHandoffState?.canSendToClickatron);
  const clickatronStatusColor = clickatronHandoffState?.status === "ready"
    ? "#5EC97E"
    : clickatronHandoffState?.status === "needs_user_input"
      ? "#D4A652"
      : "#E06C75";
  const clickatronButtonText = clickatronCreating
    ? "Starting..."
    : clickatronVisualChoices.kind === "carousel"
      ? "Send Carousel"
      : "Send Post";

  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-3 py-2"
    >
      {/* Keyframe for audio spinner */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes export-audioSpin {
          to { transform: rotate(360deg); }
        }
        .export-audio-spin {
          animation: export-audioSpin 1.5s linear infinite;
        }
      `}} />

      {/* ── Clapperboard success card ── */}
      <div style={{ border: "1.5px solid rgba(212,166,82,0.25)", borderRadius: 3, overflow: "hidden" }}>
        {/* Clapper top — diagonal stripe pattern */}
        <div style={{
          background: "repeating-linear-gradient(-45deg, #131312 0px, #131312 8px, #1B1A18 8px, #1B1A18 16px)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "2px solid #D4A652",
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#D4A652", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            PRODUCTION WRAP
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#D4A652", letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5 }}>
            EDITRON
          </span>
        </div>

        {/* Clapper body */}
        <div style={{ padding: 14, background: "#131312" }}>
          {/* Row: Scene */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #1C1B19" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.06em" }}>Scene</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#5EC97E" }}>COMPLETE</span>
          </div>
          {/* Row: Take */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #1C1B19" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.06em" }}>Take</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#ECE9E1" }}>1</span>
          </div>
          {/* Row: Project */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #1C1B19" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.06em" }}>Project</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#D4A652" }}>{title || "Untitled"}</span>
          </div>
          {/* Row: Format */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.06em" }}>Format</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#ECE9E1" }}>
              {scenes.length} scenes · {aspectRatio}
              {videosGenerated ? " · AI Videos" : storyboardId ? " · Storyboard" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Audio generating in background indicator */}
      {audioGenerating && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: 10, borderRadius: 4,
          background: "rgba(92,184,204,0.06)", border: "1px solid rgba(92,184,204,0.12)",
        }}>
          <svg className="export-audio-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5CB8CC" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          <div>
            <p style={{ fontSize: 10, fontWeight: 500, color: "#5CB8CC" }}>Music & Sound Effects generating</p>
            <p style={{ fontSize: 9, color: "rgba(92,184,204,0.55)", marginTop: 1 }}>Audio will appear in your Editor automatically</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {error && (
        <div style={{ padding: 10, borderRadius: 4, background: "rgba(212,166,82,0.06)", border: "1px solid rgba(212,166,82,0.12)" }}>
          <p style={{ fontSize: 11, color: "#D4A652" }}>{error}</p>
        </div>
      )}

      <div style={{ padding: 12, borderRadius: 4, background: "rgba(92,184,204,0.05)", border: "1px solid rgba(92,184,204,0.16)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5CB8CC" }}>
            Clickatron Handoff
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: clickatronStatusColor }}>
            {clickatronHandoffState?.display.statusLabel || "Unavailable"}
          </span>
        </div>
        <p style={{ fontSize: 11, color: "#9A968B", lineHeight: 1.45, marginBottom: 10 }}>
          {clickatronHandoffState?.display.readinessCopy || "ThinkForge session context is not available yet."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6, marginBottom: 8 }}>
          <select value={clickatronVisualChoices.kind || "single_post_visual"} onChange={(e) => setClickatronVisualChoice("kind", e.target.value)} style={{ minWidth: 0, background: "#131312", border: "1px solid #282724", color: "#ECE9E1", borderRadius: 3, padding: "7px 8px", fontSize: 11 }}>
            <option value="single_post_visual">Single post</option>
            <option value="carousel">Carousel</option>
          </select>
          <select value={clickatronVisualChoices.platform || "linkedin"} onChange={(e) => setClickatronVisualChoice("platform", e.target.value)} style={{ minWidth: 0, background: "#131312", border: "1px solid #282724", color: "#ECE9E1", borderRadius: 3, padding: "7px 8px", fontSize: 11 }}>
            {["linkedin", "instagram", "x", "facebook", "youtube", "tiktok", "pinterest", "generic"].map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
          <select value={clickatronVisualChoices.aspectRatio || "4:5"} onChange={(e) => setClickatronVisualChoice("aspectRatio", e.target.value)} style={{ minWidth: 0, background: "#131312", border: "1px solid #282724", color: "#ECE9E1", borderRadius: 3, padding: "7px 8px", fontSize: 11 }}>
            {["4:5", "1:1", "9:16", "16:9", "3:2"].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 6 }}>
          <input value={clickatronVisualChoices.vibe || ""} onChange={(e) => setClickatronVisualChoice("vibe", e.target.value)} placeholder="Vibe" style={{ minWidth: 0, background: "#131312", border: "1px solid #282724", color: "#ECE9E1", borderRadius: 3, padding: "7px 8px", fontSize: 11 }} />
          <input value={clickatronVisualChoices.imageStyle || ""} onChange={(e) => setClickatronVisualChoice("imageStyle", e.target.value)} placeholder="Image style" style={{ minWidth: 0, background: "#131312", border: "1px solid #282724", color: "#ECE9E1", borderRadius: 3, padding: "7px 8px", fontSize: 11 }} />
        </div>
        {clickatronHandoffState?.display.imagePrompt && (
          <p style={{ marginTop: 9, fontSize: 10, color: "#B5B2A8", lineHeight: 1.45 }}>
            {clickatronHandoffState.display.imagePrompt}
          </p>
        )}
        {clickatronHandoffState?.display.sourceSnippets[0]?.text && (
          <p style={{ marginTop: 6, fontSize: 10, color: "#6F6B61", lineHeight: 1.45 }}>
            {clickatronHandoffState.display.sourceSnippets[0].label}: {clickatronHandoffState.display.sourceSnippets[0].text}
          </p>
        )}
        {clickatronHandoffState && !clickatronCanSend && (
          <p style={{ marginTop: 7, fontSize: 10, color: clickatronStatusColor }}>
            {clickatronHandoffState.requiredUserInput[0] || clickatronHandoffState.issues[0]?.message || "Regenerate the ThinkForge output before sending."}
          </p>
        )}
      </div>

      {/* Storyboard preview with film-frame borders */}
      {storyboardScenes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", marginBottom: 6 }}>
            Storyboard Preview
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {storyboardScenes.slice(0, 6).map((s: any) => (
              <div
                key={s.sceneIndex}
                style={{
                  aspectRatio: "16/9",
                  background: "#1B1A18",
                  borderRadius: 3,
                  overflow: "hidden",
                  position: "relative",
                  border: "1px solid rgba(212,166,82,0.25)",
                }}
              >
                {s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt={s.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#454340" }}>
                    <ImageIcon className="h-4 w-4" />
                  </div>
                )}
                <span style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "rgba(0,0,0,0.55)", fontSize: 9, color: "#B5B2A8",
                  padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
          {storyboardScenes.length > 6 && (
            <p style={{ fontSize: 10, color: "#5F5E5A", marginTop: 4 }}>
              +{storyboardScenes.length - 6} more scenes
            </p>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingTop: 12, borderTop: "1px solid #1C1B19", marginTop: 12 }}>
        <button
          onClick={handleClose}
          style={{
            padding: "7px 14px", borderRadius: 4,
            background: "transparent", border: "1px solid #282724",
            color: "#7A776E", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Close
        </button>
        {storyboardId && (
          <button
            onClick={() => { window.location.href = `/dashboard/storyboard/${storyboardId}`; }}
            style={{
              padding: "7px 14px", borderRadius: 4,
              background: "transparent", border: "1px solid rgba(212,166,82,0.3)",
              color: "#D4A652", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <ImageIcon className="h-4 w-4" />
            Edit Storyboard
          </button>
        )}
        <button
          onClick={() => { void handleCreateClickatronSession(); }}
          disabled={clickatronCreating || !clickatronCanSend}
          style={{
            padding: "7px 14px", borderRadius: 4,
            background: "transparent", border: "1px solid rgba(92,184,204,0.3)",
            color: "#5CB8CC", fontSize: 13, fontWeight: 600,
            cursor: clickatronCreating ? "wait" : clickatronCanSend ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 6,
            opacity: clickatronCreating || !clickatronCanSend ? 0.65 : 1,
          }}
        >
          {clickatronCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {clickatronButtonText}
        </button>
        <button
          onClick={() => { window.location.href = `/dashboard/editron/project/${projectId}`; }}
          style={{
            padding: "7px 14px", borderRadius: 4,
            background: "#D4A652", border: "none",
            color: "#0B0B0A", fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7" /><rect width="15" height="14" x="1" y="5" rx="2" ry="2" /></svg>
          Open in Editor
        </button>
      </div>
    </motion.div>
  );
}
