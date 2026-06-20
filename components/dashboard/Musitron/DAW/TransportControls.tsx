"use client";

import { useState } from "react";
import { useDAW } from "./DAWContext";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export default function TransportControls() {
  const { state, play, pause, stop, seek, setBPM, dispatch } = useDAW();
  const { transport, project } = state;
  const [bpmInput, setBpmInput] = useState("");
  const [editingBpm, setEditingBpm] = useState(false);

  const handlePlayPause = () => {
    if (transport.playing) pause();
    else play();
  };

  const handleRewind = () => seek(0);

  const handleBpmSubmit = () => {
    const val = parseInt(bpmInput, 10);
    if (val >= 20 && val <= 300) setBPM(val);
    setEditingBpm(false);
  };

  const bpm = project?.bpm ?? 120;
  const ts = project?.timeSignature ?? [4, 4];

  return (
    <div style={containerStyle}>
      {/* Transport buttons */}
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <TButton onClick={handleRewind} title="Rewind" aria-label="Rewind">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </TButton>
        <TButton onClick={handlePlayPause} active={transport.playing} title={transport.playing ? "Pause" : "Play"} aria-label={transport.playing ? "Pause" : "Play"}>
          {transport.playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6zm8-14v14h4V5z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </TButton>
        <TButton onClick={stop} title="Stop" aria-label="Stop">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
        </TButton>
        <TButton title="Record (coming soon)" aria-label="Record" disabled style={{ color: "#3A3935", cursor: "not-allowed", opacity: 0.5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="6" />
          </svg>
        </TButton>
      </div>

      <Divider />

      {/* Time display */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 16,
          fontWeight: 600,
          color: "#D4A652",
          minWidth: 110,
          textAlign: "center",
          letterSpacing: "0.5px",
        }}
      >
        {formatTime(transport.position)}
      </div>

      <Divider />

      {/* BPM */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>BPM</span>
        {editingBpm ? (
          <input
            type="number"
            autoFocus
            min={20}
            max={300}
            defaultValue={bpm}
            onChange={(e) => setBpmInput(e.target.value)}
            onBlur={handleBpmSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleBpmSubmit();
              if (e.key === "Escape") setEditingBpm(false);
            }}
            style={bpmInputStyle}
          />
        ) : (
          <button
            onClick={() => { setBpmInput(String(bpm)); setEditingBpm(true); }}
            style={bpmDisplayStyle}
          >
            {bpm}
          </button>
        )}
      </div>

      {/* Time signature */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={labelStyle}>TS</span>
        <span style={{ ...bpmDisplayStyle, cursor: "default" }}>
          {ts[0]}/{ts[1]}
        </span>
      </div>

      <Divider />

      {/* Snap toggle */}
      <TButton
        onClick={() => dispatch({ type: "TOGGLE_SNAP" })}
        active={state.snapEnabled}
        title="Snap to grid (G)"
        aria-label="Toggle snap"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M7 17V9" />
          <path d="M11 17V5" />
          <path d="M15 17V9" />
          <path d="M19 17V5" />
        </svg>
      </TButton>

      {/* Loop toggle */}
      <TButton
        onClick={() => dispatch({ type: "TOGGLE_LOOP" })}
        active={transport.loopEnabled}
        title="Loop (L)"
        aria-label="Toggle loop"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11v-1a4 4 0 014-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v1a4 4 0 01-4 4H3" />
        </svg>
      </TButton>

      <Divider />

      {/* Zoom controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <TButton
          onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom * 0.8 })}
          title="Zoom out (Ctrl+Scroll)"
          aria-label="Zoom out"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </TButton>
        <TButton
          onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom * 1.25 })}
          title="Zoom in (Ctrl+Scroll)"
          aria-label="Zoom in"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </TButton>
      </div>
    </div>
  );
}

function TButton({
  children,
  active,
  style: extraStyle,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "rgba(212,166,82,0.15)" : "transparent",
        border: "1px solid transparent",
        borderRadius: 4,
        color: active ? "#D4A652" : "#B5B2A8",
        cursor: "pointer",
        transition: "all .15s",
        ...extraStyle,
      }}
    />
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "#1C1B19", margin: "0 8px" }} />;
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  background: "#0E0E0D",
  borderBottom: "1px solid #1C1B19",
  userSelect: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#5F5E5A",
  fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const bpmInputStyle: React.CSSProperties = {
  width: 48,
  background: "#1B1A18",
  border: "1px solid #D4A652",
  borderRadius: 3,
  color: "#ECE9E1",
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  padding: "2px 4px",
  textAlign: "center",
  outline: "none",
};

const bpmDisplayStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 3,
  color: "#ECE9E1",
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  padding: "2px 6px",
  cursor: "pointer",
};
