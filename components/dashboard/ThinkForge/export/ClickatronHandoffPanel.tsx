"use client";

import type { CSSProperties } from "react";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ClickatronHandoffPanelProps {
  handoffState: UseExportPipelineReturn["clickatronHandoffState"];
  visualChoices: UseExportPipelineReturn["clickatronVisualChoices"];
  setVisualChoice: UseExportPipelineReturn["setClickatronVisualChoice"];
}

const PLATFORMS = ["linkedin", "instagram", "x", "facebook", "youtube", "tiktok", "pinterest", "generic"];
const ASPECT_RATIOS = ["4:5", "1:1", "9:16", "16:9", "3:2"];

export function ClickatronHandoffPanel({
  handoffState,
  visualChoices,
  setVisualChoice,
}: ClickatronHandoffPanelProps) {
  const statusColor = handoffState?.status === "ready"
    ? "#5EC97E"
    : handoffState?.status === "needs_user_input"
      ? "#D4A652"
      : "#E06C75";
  const debugPayload = handoffState
    ? JSON.stringify({
        debug: handoffState.debug,
        payloadPreview: handoffState.payloadPreview,
      }, null, 2)
    : "";

  return (
    <div style={{ padding: 12, borderRadius: 4, background: "rgba(92,184,204,0.05)", border: "1px solid rgba(92,184,204,0.16)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5CB8CC" }}>
          Clickatron Handoff
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>
          {handoffState?.display.statusLabel || "Unavailable"}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "#9A968B", lineHeight: 1.45, marginBottom: 10 }}>
        {handoffState?.display.readinessCopy || "ThinkForge session context is not available yet."}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6, marginBottom: 8 }}>
        <select value={visualChoices.kind || "single_post_visual"} onChange={(e) => setVisualChoice("kind", e.target.value)} style={fieldStyle}>
          <option value="single_post_visual">Single post</option>
          <option value="carousel">Carousel</option>
        </select>
        <select value={visualChoices.platform || "linkedin"} onChange={(e) => setVisualChoice("platform", e.target.value)} style={fieldStyle}>
          {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
        </select>
        <select value={visualChoices.aspectRatio || "4:5"} onChange={(e) => setVisualChoice("aspectRatio", e.target.value)} style={fieldStyle}>
          {ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 6 }}>
        <input value={visualChoices.vibe || ""} onChange={(e) => setVisualChoice("vibe", e.target.value)} placeholder="Vibe" style={fieldStyle} />
        <input value={visualChoices.imageStyle || ""} onChange={(e) => setVisualChoice("imageStyle", e.target.value)} placeholder="Image style" style={fieldStyle} />
      </div>
      {handoffState?.display.imagePrompt && (
        <p style={{ marginTop: 9, fontSize: 10, color: "#B5B2A8", lineHeight: 1.45 }}>
          {handoffState.display.imagePrompt}
        </p>
      )}
      {handoffState?.display.sourceSnippets[0]?.text && (
        <p style={{ marginTop: 6, fontSize: 10, color: "#6F6B61", lineHeight: 1.45 }}>
          {handoffState.display.sourceSnippets[0].label}: {handoffState.display.sourceSnippets[0].text}
        </p>
      )}
      {handoffState && !handoffState.canSendToClickatron && (
        <p style={{ marginTop: 7, fontSize: 10, color: statusColor }}>
          {handoffState.requiredUserInput[0] || handoffState.issues[0]?.message || "Regenerate the ThinkForge output before sending."}
        </p>
      )}
      {debugPayload && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 10, color: "#5CB8CC", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Debug details
          </summary>
          <pre style={{ marginTop: 8, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 9, lineHeight: 1.45, color: "#7A776E", background: "#0B0B0A", border: "1px solid #1C1B19", borderRadius: 3, padding: 8 }}>
            {debugPayload}
          </pre>
        </details>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  minWidth: 0,
  background: "#131312",
  border: "1px solid #282724",
  color: "#ECE9E1",
  borderRadius: 3,
  padding: "7px 8px",
  fontSize: 11,
};
