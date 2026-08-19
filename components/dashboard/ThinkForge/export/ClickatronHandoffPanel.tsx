"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  FileText,
  ImageIcon,
  Layers3,
} from "lucide-react";
import type { UseExportPipelineReturn } from "./hooks/useExportPipeline";

interface ClickatronHandoffPanelProps {
  handoffState: UseExportPipelineReturn["clickatronHandoffState"];
  visualChoices: UseExportPipelineReturn["clickatronVisualChoices"];
  setVisualChoice: UseExportPipelineReturn["setClickatronVisualChoice"];
}

const PLATFORMS = ["linkedin", "instagram", "x", "facebook", "youtube", "tiktok", "pinterest", "generic"] as const;
const DEFAULT_CLICKATRON_HANDOFF_ASPECT_RATIO = "1:1";
const ASPECT_RATIOS = [DEFAULT_CLICKATRON_HANDOFF_ASPECT_RATIO, "4:5", "1.91:1", "16:9", "9:16", "4:3", "3:4", "2:3"] as const;
const VISUAL_MODES = [
  ["text_forward_graphic", "Text-forward"],
  ["photo", "Photo"],
  ["illustration", "Illustration"],
  ["product_mockup", "Product mockup"],
  ["diagram", "Diagram"],
  ["mixed", "Mixed"],
  ["auto", "Auto"],
] as const;
const TEXT_DENSITIES = [
  ["none", "No text"],
  ["low", "Low text"],
  ["medium", "Medium text"],
  ["high", "High text"],
] as const;

// Chips are a READ-OUT of what the deriver decided from the content signals — not a menu
// the user picks from. The system reads the atoms and shows its answer; the user glances.
const vibeChipStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.03em",
  padding: "3px 8px", borderRadius: 3, color: "#ECE9E1",
  background: "rgba(92,184,204,0.12)", border: "1px solid rgba(92,184,204,0.28)",
};
const styleChipStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.03em",
  padding: "3px 8px", borderRadius: 3, color: "#9A968B",
  background: "rgba(255,255,255,0.03)", border: "1px solid #26251F",
};

const STATUS_META = {
  ready: {
    color: "#5EC97E",
    bg: "rgba(94,201,126,0.07)",
    border: "rgba(94,201,126,0.22)",
    icon: CheckCircle2,
  },
  needs_user_input: {
    color: "#D4A652",
    bg: "rgba(212,166,82,0.08)",
    border: "rgba(212,166,82,0.24)",
    icon: CircleHelp,
  },
  stale: {
    color: "#D4A652",
    bg: "rgba(212,166,82,0.08)",
    border: "rgba(212,166,82,0.24)",
    icon: AlertTriangle,
  },
  invalid: {
    color: "#E06C75",
    bg: "rgba(224,108,117,0.08)",
    border: "rgba(224,108,117,0.24)",
    icon: AlertTriangle,
  },
  missing_sidecar: {
    color: "#E06C75",
    bg: "rgba(224,108,117,0.08)",
    border: "rgba(224,108,117,0.24)",
    icon: AlertTriangle,
  },
  unavailable: {
    color: "#7A776E",
    bg: "rgba(122,119,110,0.08)",
    border: "rgba(122,119,110,0.18)",
    icon: CircleHelp,
  },
} as const;

export function ClickatronHandoffPanel({
  handoffState,
  visualChoices,
  setVisualChoice,
}: ClickatronHandoffPanelProps) {
  const statusKey = handoffState?.status || "unavailable";
  const statusMeta = STATUS_META[statusKey];
  const StatusIcon = statusMeta.icon;
  const display = handoffState?.display;
  const resolvedVisualChoices = display?.visualChoices;
  const selectedKind = visualChoices.kind || resolvedVisualChoices?.kind || display?.kind || "";
  const sourceSnippets = display?.sourceSnippets || [];
  const slides = display?.slides || [];
  const visibleIssues = [
    ...(handoffState?.requiredUserInput || []).map((message) => ({ message })),
    ...(handoffState?.issues || []),
  ].slice(0, 3);
  const visualPlanApproval = handoffState?.approval;
  const needsVisualPlanApproval = Boolean(visualPlanApproval?.visualPlanRequired && !visualPlanApproval.visualPlanApproved);
  const approvedVisualPlan = Boolean(visualPlanApproval?.visualPlanApproved);
  const debugPayload = handoffState
    ? JSON.stringify({
        status: handoffState.status,
        debug: handoffState.debug,
        creativeSpec: handoffState.debug.creativeSpec,
        payloadPreview: handoffState.payloadPreview
          ? {
              ...handoffState.payloadPreview,
              promptLength: handoffState.payloadPreview.prompt.length,
              prompt: handoffState.payloadPreview.prompt.slice(0, 1200),
            }
          : undefined,
      }, null, 2)
    : "";

  const visualLanguage = handoffState?.debug?.creativeSpec?.visualLanguage;

  return (
    <div style={{ padding: 14, borderRadius: 4, background: "#10100F", border: `1px solid ${statusMeta.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5CB8CC" }}>
            Clickatron Handoff
          </span>
          <p style={{ fontSize: 11, color: "#9A968B", lineHeight: 1.45, marginTop: 5 }}>
            {display?.readinessCopy || "ThinkForge session context is not available yet."}
          </p>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          padding: "5px 7px",
          borderRadius: 3,
          background: statusMeta.bg,
          border: `1px solid ${statusMeta.border}`,
          fontSize: 10,
          fontWeight: 700,
          color: statusMeta.color,
        }}>
          <StatusIcon className="h-3.5 w-3.5" />
          {display?.statusLabel || "Unavailable"}
        </span>
      </div>

      {display && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 8, padding: "9px 0", borderTop: "1px solid #1C1B19", borderBottom: "1px solid #1C1B19", marginBottom: 12 }}>
          <Metric label="Kind" value={selectedKind === "carousel" ? "Carousel" : selectedKind === "single_post_visual" ? "Single" : "Pending"} />
          <Metric label="Platform" value={display.platform || visualChoices.platform || "linkedin"} />
          <Metric label="Ratio" value={display.aspectRatio || visualChoices.aspectRatio || DEFAULT_CLICKATRON_HANDOFF_ASPECT_RATIO} />
          <Metric label="Text" value={display.textPolicy || "pending"} />
          <Metric label="Slides" value={String(display.slideCount)} />
          <Metric label="Sources" value={String(sourceSnippets.length)} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 7, marginBottom: 8 }}>
        <FieldLabel label="Output">
          <select value={selectedKind} onChange={(e) => setVisualChoice("kind", e.target.value)} style={fieldStyle}>
            <option value="" disabled>Choose output</option>
            <option value="single_post_visual">Single post</option>
            <option value="carousel">Carousel</option>
          </select>
        </FieldLabel>
        <FieldLabel label="Platform">
          <select value={visualChoices.platform || resolvedVisualChoices?.platform || display?.platform || "generic"} onChange={(e) => setVisualChoice("platform", e.target.value)} style={fieldStyle}>
            {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Aspect">
          <select value={visualChoices.aspectRatio || resolvedVisualChoices?.aspectRatio || display?.aspectRatio || DEFAULT_CLICKATRON_HANDOFF_ASPECT_RATIO} onChange={(e) => setVisualChoice("aspectRatio", e.target.value)} style={fieldStyle}>
            {ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Visual">
          <select value={visualChoices.visualMode || resolvedVisualChoices?.visualMode || "text_forward_graphic"} onChange={(e) => setVisualChoice("visualMode", e.target.value)} style={fieldStyle}>
            {VISUAL_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Copy">
          <select value={visualChoices.textDensity || resolvedVisualChoices?.textDensity || "medium"} onChange={(e) => setVisualChoice("textDensity", e.target.value)} style={fieldStyle}>
            {TEXT_DENSITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FieldLabel>
      </div>

      {visualLanguage ? (
        <div style={{ padding: "9px 10px", borderRadius: 4, background: "rgba(92,184,204,0.05)", border: "1px solid rgba(92,184,204,0.16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <p style={sectionLabelStyle}>Visual language — auto-derived</p>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#7A776E" }}>
              derived &middot; {Math.round(visualLanguage.confidence * 100)}%
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
            {visualLanguage.vibe.map((v) => <span key={`vibe-${v}`} style={vibeChipStyle}>{v}</span>)}
            {visualLanguage.imageStyle.map((s) => <span key={`style-${s}`} style={styleChipStyle}>{s}</span>)}
            <span style={styleChipStyle}>{visualLanguage.paletteTemperature} palette</span>
          </div>
          {visualLanguage.lowConfidenceFields.length > 0 && (
            <p style={{ marginTop: 6, fontSize: 10, color: "#D4A652", lineHeight: 1.45 }}>
              Worth a glance: {visualLanguage.lowConfidenceFields.join(", ")} {visualLanguage.lowConfidenceFields.length === 1 ? "was a low-confidence guess" : "were low-confidence guesses"}.
            </p>
          )}
          <div style={{ marginTop: 9 }}>
            <FieldLabel label="Notes">
              <input value={visualChoices.notes || ""} onChange={(e) => setVisualChoice("notes", e.target.value)} placeholder="avoid stock-photo look" style={fieldStyle} />
            </FieldLabel>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 7 }}>
          <FieldLabel label="Vibe">
            <input value={visualChoices.vibe || ""} onChange={(e) => setVisualChoice("vibe", e.target.value)} placeholder="urgent but sober" style={fieldStyle} />
          </FieldLabel>
          <FieldLabel label="Image Style">
            <input value={visualChoices.imageStyle || ""} onChange={(e) => setVisualChoice("imageStyle", e.target.value)} placeholder="editorial collage" style={fieldStyle} />
          </FieldLabel>
          <FieldLabel label="Notes">
            <input value={visualChoices.notes || ""} onChange={(e) => setVisualChoice("notes", e.target.value)} placeholder="avoid stock-photo look" style={fieldStyle} />
          </FieldLabel>
        </div>
      )}

      {display?.objective && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <ImageIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#5CB8CC]" />
          <div style={{ minWidth: 0 }}>
            <p style={sectionLabelStyle}>Creative Brief</p>
            <p style={{ fontSize: 11, color: "#ECE9E1", lineHeight: 1.45 }}>{display.objective}</p>
            {display.coreMessage && (
              <p style={{ marginTop: 3, fontSize: 10, color: "#8D887D", lineHeight: 1.45 }}>{display.coreMessage}</p>
            )}
          </div>
        </div>
      )}

      {display?.imagePrompt && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#D4A652]" />
          <div style={{ minWidth: 0 }}>
            <p style={sectionLabelStyle}>Image Prompt</p>
            <p style={{ fontSize: 10, color: "#B5B2A8", lineHeight: 1.5 }}>{display.imagePrompt}</p>
          </div>
        </div>
      )}

      {slides.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Layers3 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#5EC97E]" />
          <div style={{ minWidth: 0, width: "100%" }}>
            <p style={sectionLabelStyle}>Slides</p>
            <div style={{ display: "grid", gap: 5 }}>
              {slides.slice(0, 4).map((slide) => (
                <div key={`${slide.index}-${slide.label}`} style={{ borderLeft: "2px solid rgba(94,201,126,0.35)", paddingLeft: 7 }}>
                  <p style={{ fontSize: 10, color: "#ECE9E1", lineHeight: 1.35 }}>
                    {slide.label}{slide.title ? `: ${slide.title}` : ""}
                  </p>
                  <p style={{ fontSize: 9, color: "#7A776E", lineHeight: 1.35 }}>{slide.sourceLabels.join(", ") || "Source pending"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sourceSnippets.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={summaryStyle}>Source blocks</summary>
          <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
            {sourceSnippets.slice(0, 4).map((source) => (
              <p key={source.label} style={{ fontSize: 10, color: source.found ? "#8D887D" : "#E06C75", lineHeight: 1.45 }}>
                <strong style={{ color: "#B5B2A8", fontWeight: 600 }}>{source.label}</strong>
                {source.text ? `: ${source.text}` : source.found ? "" : ": missing"}
              </p>
            ))}
          </div>
        </details>
      )}

      {visibleIssues.length > 0 && (
        <div style={{ marginTop: 10, padding: "8px 9px", borderRadius: 3, background: statusMeta.bg, border: `1px solid ${statusMeta.border}` }}>
          {visibleIssues.map((issue, index) => (
            <p key={`${issue.message}-${index}`} style={{ fontSize: 10, color: statusMeta.color, lineHeight: 1.45 }}>
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {needsVisualPlanApproval && (
        <button
          type="button"
          onClick={() => setVisualChoice("approvedVisualPlan", "true")}
          style={{
            marginTop: 10,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 4,
            border: "1px solid rgba(94,201,126,0.28)",
            background: "rgba(94,201,126,0.1)",
            color: "#9FE3AE",
            padding: "8px 10px",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approve visual plan
        </button>
      )}

      {approvedVisualPlan && (
        <p style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#9FE3AE" }}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Visual plan approved for Clickatron.
        </p>
      )}

      {debugPayload && (
        <details style={{ marginTop: 10 }}>
          <summary style={summaryStyle}>Creative contract</summary>
          <pre style={{ marginTop: 8, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 9, lineHeight: 1.45, color: "#7A776E", background: "#0B0B0A", border: "1px solid #1C1B19", borderRadius: 3, padding: 8 }}>
            {debugPayload}
          </pre>
        </details>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5F5E5A" }}>
        {label}
      </p>
      <p style={{ marginTop: 2, fontSize: 11, color: "#ECE9E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </p>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5F5E5A" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  background: "#131312",
  border: "1px solid #282724",
  color: "#ECE9E1",
  borderRadius: 3,
  padding: "7px 8px",
  fontSize: 11,
};

const sectionLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 8,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#5F5E5A",
  marginBottom: 3,
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: 10,
  color: "#5CB8CC",
  fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
