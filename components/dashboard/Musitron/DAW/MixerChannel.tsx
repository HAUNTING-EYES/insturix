"use client";

import { useRef, useEffect } from "react";
import type { DAWTrack } from "@/lib/musitron/daw-types";
import type { AudioEngine } from "@/lib/musitron/audio-engine";
import { useDAW } from "./DAWContext";

function calculatePeak(data: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return Math.min(1, Math.sqrt(peak));
}

interface MixerChannelProps {
  track: DAWTrack;
  engineRef: React.RefObject<AudioEngine | null>;
}

export default function MixerChannel({ track, engineRef }: MixerChannelProps) {
  const { toggleMute, toggleSolo, dispatch } = useDAW();
  const meterRef = useRef<HTMLDivElement>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    const animate = () => {
      const engine = engineRef.current;
      if (engine && meterRef.current) {
        const data = engine.getTrackAnalyserData(track.id);
        const raw = data ? calculatePeak(data) : 0;
        smoothRef.current = smoothRef.current * 0.7 + raw * 0.3;
        meterRef.current.style.height = `${smoothRef.current * 100}%`;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [track.id, engineRef]);

  const handleGain = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "SET_TRACK_GAIN", trackId: track.id, gain: parseFloat(e.target.value) });
  };

  const handlePan = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "SET_TRACK_PAN", trackId: track.id, pan: parseFloat(e.target.value) });
  };

  return (
    <div style={stripStyle}>
      {/* Color top bar */}
      <div style={{ height: 3, background: track.color, borderRadius: "2px 2px 0 0" }} />

      {/* VU Meter */}
      <div style={meterContainerStyle}>
        <div style={meterBgStyle}>
          <div ref={meterRef} style={meterBarStyle(track.color)} />
        </div>
      </div>

      {/* Gain fader */}
      <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={valLabelStyle}>{track.mixer.gain.toFixed(1)}</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={track.mixer.gain}
          onChange={handleGain}
          className="daw-fader-v"
          style={{ width: 48, height: 6, appearance: "none", background: "#1B1A18", borderRadius: 3, outline: "none", cursor: "pointer" }}
        />
      </div>

      {/* Pan */}
      <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={valLabelStyle}>
          {track.mixer.pan === 0 ? "C" : track.mixer.pan < 0 ? `L${Math.round(Math.abs(track.mixer.pan) * 100)}` : `R${Math.round(track.mixer.pan * 100)}`}
        </span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={track.mixer.pan}
          onChange={handlePan}
          style={{ width: 48, height: 6, appearance: "none", background: "#1B1A18", borderRadius: 3, outline: "none", cursor: "pointer" }}
          className="daw-pan"
        />
      </div>

      {/* M / S buttons */}
      <div style={{ display: "flex", gap: 4, justifyContent: "center", padding: "4px 0" }}>
        <MSButton label="M" active={track.mixer.mute} color="#E85D75" onClick={() => toggleMute(track.id)} />
        <MSButton label="S" active={track.mixer.solo} color="#D4A652" onClick={() => toggleSolo(track.id)} />
      </div>

      {/* Track name */}
      <div
        style={{
          fontSize: 9,
          color: "#B5B2A8",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          textAlign: "center",
          padding: "4px 4px 6px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {track.name}
      </div>
    </div>
  );
}

export function MasterChannel({ engineRef, gain, onGainChange }: {
  engineRef: React.RefObject<AudioEngine | null>;
  gain: number;
  onGainChange: (gain: number) => void;
}) {
  const meterRef = useRef<HTMLDivElement>(null);
  const smoothRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    const animate = () => {
      const engine = engineRef.current;
      if (engine && meterRef.current) {
        const data = engine.getMasterAnalyserData();
        const raw = data ? calculatePeak(data) : 0;
        smoothRef.current = smoothRef.current * 0.7 + raw * 0.3;
        meterRef.current.style.height = `${smoothRef.current * 100}%`;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [engineRef]);

  return (
    <div style={{ ...stripStyle, borderLeft: "2px solid #1C1B19" }}>
      <div style={{ height: 3, background: "#D4A652", borderRadius: "2px 2px 0 0" }} />
      <div style={meterContainerStyle}>
        <div style={meterBgStyle}>
          <div ref={meterRef} style={meterBarStyle("#D4A652")} />
        </div>
      </div>
      <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={valLabelStyle}>{gain.toFixed(1)}</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
          className="daw-fader-v"
          style={{ width: 48, height: 6, appearance: "none", background: "#1B1A18", borderRadius: 3, outline: "none", cursor: "pointer" }}
        />
      </div>
      <div style={{ padding: "4px 0" }} />
      <div style={{ padding: "4px 0" }} />
      <div
        style={{
          fontSize: 9,
          color: "#D4A652",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          textAlign: "center",
          padding: "4px 4px 6px",
          letterSpacing: "0.5px",
        }}
      >
        MASTER
      </div>
    </div>
  );
}

function MSButton({ label, active, color, onClick }: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? `${color}25` : "transparent",
        border: `1px solid ${active ? color : "#1C1B19"}`,
        borderRadius: 3,
        color: active ? color : "#5F5E5A",
        cursor: "pointer",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

const stripStyle: React.CSSProperties = {
  width: 64,
  minWidth: 64,
  display: "flex",
  flexDirection: "column",
  background: "#0E0E0D",
  borderRight: "1px solid #1C1B19",
};

const meterContainerStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 80,
  padding: "6px 16px",
  display: "flex",
  alignItems: "stretch",
};

const meterBgStyle: React.CSSProperties = {
  flex: 1,
  background: "#131312",
  borderRadius: 2,
  position: "relative",
  overflow: "hidden",
  border: "1px solid #1C1B19",
};

function meterBarStyle(color: string): React.CSSProperties {
  return {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "0%",
    background: `linear-gradient(0deg, ${color}80 0%, ${color}CC 60%, #E85D75CC 90%)`,
    borderRadius: 1,
    transition: "none",
    willChange: "height",
  };
}

const valLabelStyle: React.CSSProperties = {
  fontSize: 8,
  color: "#7A776E",
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: "center",
};
