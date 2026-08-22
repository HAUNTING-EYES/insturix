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
import { Select, type SelectOption } from "@/components/primitives";
import {
  CLICKATRON_LOGO_OVERLAY_PLACEMENTS,
  CLICKATRON_LOGO_OVERLAY_SCALES,
} from "@/lib/clickatron/brand-logo-overlay-contract";
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
const LOGO_PLACEMENT_LABELS: Record<(typeof CLICKATRON_LOGO_OVERLAY_PLACEMENTS)[number], string> = {
  top_left: "Top left",
  top_right: "Top right",
  bottom_left: "Bottom left",
  bottom_right: "Bottom right",
};
const LOGO_SCALE_LABELS: Record<(typeof CLICKATRON_LOGO_OVERLAY_SCALES)[number], string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};
const OUTPUT_OPTIONS: SelectOption[] = [
  { value: "single_post_visual", label: "Single post" },
  { value: "carousel", label: "Carousel" },
];
const PLATFORM_OPTIONS: SelectOption[] = PLATFORMS.map((platform) => ({ value: platform, label: platform }));
const ASPECT_RATIO_OPTIONS: SelectOption[] = ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }));
const VISUAL_MODE_OPTIONS: SelectOption[] = VISUAL_MODES.map(([value, label]) => ({ value, label }));
const TEXT_DENSITY_OPTIONS: SelectOption[] = TEXT_DENSITIES.map(([value, label]) => ({ value, label }));
const LOGO_TREATMENT_OPTIONS: SelectOption[] = [
  { value: "none", label: "No logo" },
  { value: "approved_logo", label: "Use accepted logo" },
];
const LOGO_PLACEMENT_OPTIONS: SelectOption[] = CLICKATRON_LOGO_OVERLAY_PLACEMENTS.map((placement) => ({ value: placement, label: LOGO_PLACEMENT_LABELS[placement] }));
const LOGO_SCALE_OPTIONS: SelectOption[] = CLICKATRON_LOGO_OVERLAY_SCALES.map((scale) => ({ value: scale, label: LOGO_SCALE_LABELS[scale] }));

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
  const logoTreatment = visualChoices.logoTreatment || resolvedVisualChoices?.logoTreatment || "none";
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
        <FieldLabel label="Output" as="div">
          <Select size="sm" aria-label="Output" value={selectedKind} onChange={(v) => setVisualChoice("kind", v)} options={OUTPUT_OPTIONS} placeholder="Choose output" />
        </FieldLabel>
        <FieldLabel label="Platform" as="div">
          <Select size="sm" aria-label="Platform" value={visualChoices.platform || resolvedVisualChoices?.platform || display?.platform || "generic"} onChange={(v) => setVisualChoice("platform", v)} options={PLATFORM_OPTIONS} />
        </FieldLabel>
        <FieldLabel label="Aspect" as="div">
          <Select size="sm" aria-label="Aspect" value={visualChoices.aspectRatio || resolvedVisualChoices?.aspectRatio || display?.aspectRatio || DEFAULT_CLICKATRON_HANDOFF_ASPECT_RATIO} onChange={(v) => setVisualChoice("aspectRatio", v)} options={ASPECT_RATIO_OPTIONS} />
        </FieldLabel>
        <FieldLabel label="Visual" as="div">
          <Select size="sm" aria-label="Visual" value={visualChoices.visualMode || resolvedVisualChoices?.visualMode || "text_forward_graphic"} onChange={(v) => setVisualChoice("visualMode", v)} options={VISUAL_MODE_OPTIONS} />
        </FieldLabel>
        <FieldLabel label="Copy" as="div">
          <Select size="sm" aria-label="Copy" value={visualChoices.textDensity || resolvedVisualChoices?.textDensity || "medium"} onChange={(v) => setVisualChoice("textDensity", v)} options={TEXT_DENSITY_OPTIONS} />
        </FieldLabel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 7, marginBottom: 8 }}>
        <FieldLabel label="Brand mark" as="div">
          <Select size="sm" aria-label="Brand mark" value={logoTreatment} onChange={(v) => setVisualChoice("logoTreatment", v)} options={LOGO_TREATMENT_OPTIONS} />
        </FieldLabel>
        {logoTreatment === "approved_logo" && (
          <>
            <FieldLabel label="Logo position" as="div">
              <Select size="sm" aria-label="Logo position" value={visualChoices.logoPlacement || resolvedVisualChoices?.logoPlacement || ""} onChange={(v) => setVisualChoice("logoPlacement", v)} options={LOGO_PLACEMENT_OPTIONS} placeholder="Choose position" />
            </FieldLabel>
            <FieldLabel label="Logo size" as="div">
              <Select size="sm" aria-label="Logo size" value={visualChoices.logoScale || resolvedVisualChoices?.logoScale || ""} onChange={(v) => setVisualChoice("logoScale", v)} options={LOGO_SCALE_OPTIONS} placeholder="Choose size" />
            </FieldLabel>
          </>
        )}
      </div>

      {logoTreatment === "approved_logo" && (
        <p style={{ marginBottom: 8, fontSize: 10, color: "#9A968B", lineHeight: 1.45 }}>
          Clickatron will apply the exact accepted Brand Vault asset after generation. It will not ask the image model to draw a logo.
        </p>
      )}

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

// `as="div"` hosts composite controls (the Select listbox): a wrapping <label> forwards clicks on
// non-interactive descendants — the options — to the trigger button and re-opens the list.
// Those controls carry aria-label instead.
function FieldLabel({ label, children, as: Tag = "label" }: { label: string; children: ReactNode; as?: "label" | "div" }) {
  return (
    <Tag style={{ display: "grid", gap: 4, minWidth: 0 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5F5E5A" }}>
        {label}
      </span>
      {children}
    </Tag>
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
