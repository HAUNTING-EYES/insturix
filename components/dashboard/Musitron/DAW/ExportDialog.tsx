"use client";

import { useState, useCallback } from "react";
import { useDAW } from "./DAWContext";
import {
  exportProject,
  downloadBlob,
  type ExportFormat,
  type WavBitDepth,
} from "@/lib/musitron/export-engine";

interface ExportDialogProps {
  onClose: () => void;
}

export default function ExportDialog({ onClose }: ExportDialogProps) {
  const { state } = useDAW();
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [bitDepth, setBitDepth] = useState<WavBitDepth>(16);
  const [mp3Bitrate, setMp3Bitrate] = useState(320);
  const [exporting, setExporting] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasRegions = state.project?.tracks.some(
    (t) => t.regions.length > 0 || (t.midiRegions?.length ?? 0) > 0,
  );

  const handleExport = useCallback(async () => {
    if (!state.project || exporting) return;

    setExporting(true);
    setError(null);
    setPhase("Preparing...");
    setProgress(0);

    try {
      const blob = await exportProject(state.project, {
        format,
        bitDepth,
        mp3Bitrate,
        sampleRate: state.project.sampleRate,
        onProgress: (p, pct) => {
          setPhase(p);
          setProgress(pct);
        },
      });

      const ext = format;
      const name = (state.project.name || "Untitled").replace(/[^a-zA-Z0-9_\- ]/g, "");
      downloadBlob(blob, `${name}.${ext}`);
      setPhase("Exported!");
      setProgress(1);
    } catch (err) {
      console.error("[ExportDialog]", err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [state.project, format, bitDepth, mp3Bitrate, exporting]);

  return (
    <div style={overlayStyle} onClick={exporting ? undefined : onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span>Export Audio</span>
          <button onClick={onClose} disabled={exporting} style={closeBtnStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={bodyStyle}>
          {/* Format selector */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Format</label>
            <div style={optionGroupStyle}>
              {(["wav", "mp3", "flac"] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  disabled={exporting}
                  style={optionBtnStyle(format === f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* WAV bit depth */}
          {format === "wav" && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Bit Depth</label>
              <div style={optionGroupStyle}>
                {([16, 24, 32] as WavBitDepth[]).map((bd) => (
                  <button
                    key={bd}
                    onClick={() => setBitDepth(bd)}
                    disabled={exporting}
                    style={optionBtnStyle(bitDepth === bd)}
                  >
                    {bd}-bit{bd === 32 ? " float" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MP3 bitrate */}
          {format === "mp3" && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Bitrate</label>
              <div style={optionGroupStyle}>
                {[128, 192, 256, 320].map((br) => (
                  <button
                    key={br}
                    onClick={() => setMp3Bitrate(br)}
                    disabled={exporting}
                    style={optionBtnStyle(mp3Bitrate === br)}
                  >
                    {br} kbps
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FLAC info */}
          {format === "flac" && (
            <div style={fieldStyle}>
              <span style={{ ...labelStyle, color: "#7A776E" }}>
                Lossless compression, smaller than WAV
              </span>
            </div>
          )}

          {/* MP3/FLAC note about ffmpeg loading */}
          {format !== "wav" && !exporting && (
            <div style={{ ...labelStyle, color: "#5F5E5A", marginTop: 4, fontSize: 9 }}>
              First export loads encoder (~30 MB, cached after)
            </div>
          )}

          {/* Progress */}
          {exporting && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, color: "#B5B2A8", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                {phase}
              </div>
              <div style={progressTrackStyle}>
                <div style={{ ...progressBarStyle, width: `${progress * 100}%` }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>
              {error}
            </div>
          )}

          {/* Success */}
          {!exporting && progress === 1 && !error && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
              Download started
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button onClick={onClose} disabled={exporting} style={cancelBtnStyle}>
            {progress === 1 ? "Close" : "Cancel"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !hasRegions}
            style={exportBtnStyle(exporting || !hasRegions)}
            title={!hasRegions ? "Add audio regions to export" : undefined}
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const dialogStyle: React.CSSProperties = {
  width: 380,
  background: "#141413",
  border: "1px solid #282724",
  borderRadius: 12,
  overflow: "hidden",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 18px",
  borderBottom: "1px solid #1C1B19",
  fontSize: 14,
  fontWeight: 600,
  color: "#ECE9E1",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#5F5E5A",
  cursor: "pointer",
  padding: 4,
  display: "flex",
};

const bodyStyle: React.CSSProperties = {
  padding: "18px",
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.8px",
  textTransform: "uppercase",
  color: "#7A776E",
  marginBottom: 8,
  fontFamily: "'JetBrains Mono', monospace",
};

const optionGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
};

function optionBtnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "7px 0",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    background: active ? "rgba(212,166,82,0.12)" : "#1B1A18",
    border: `1px solid ${active ? "#D4A652" : "#282724"}`,
    borderRadius: 6,
    color: active ? "#D4A652" : "#B5B2A8",
    cursor: "pointer",
    transition: "all .15s",
  };
}

const progressTrackStyle: React.CSSProperties = {
  height: 4,
  background: "#1B1A18",
  borderRadius: 2,
  overflow: "hidden",
};

const progressBarStyle: React.CSSProperties = {
  height: "100%",
  background: "#D4A652",
  borderRadius: 2,
  transition: "width .3s",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  padding: "14px 18px",
  borderTop: "1px solid #1C1B19",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "7px 16px",
  fontSize: 11,
  fontWeight: 500,
  background: "transparent",
  border: "1px solid #282724",
  borderRadius: 6,
  color: "#B5B2A8",
  cursor: "pointer",
};

function exportBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 20px",
    fontSize: 11,
    fontWeight: 600,
    background: disabled ? "#1B1A18" : "#D4A652",
    border: "none",
    borderRadius: 6,
    color: disabled ? "#5F5E5A" : "#0B0B0A",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .15s",
  };
}
