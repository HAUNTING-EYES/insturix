"use client";

import { useState, useEffect, useRef } from "react";
import { useDAW } from "./DAWContext";
import {
  type EffectType,
  type TrackEffect,
  EFFECT_DEFAULTS,
  EFFECT_PARAM_RANGES,
  createEffect,
} from "@/lib/musitron/daw-types";

const EFFECT_LABELS: Record<EffectType, string> = {
  eq: "3-Band EQ",
  compressor: "Compressor",
  delay: "Delay",
  reverb: "Reverb",
};

const PARAM_LABELS: Record<string, string> = {
  lowGain: "Low",
  midGain: "Mid",
  highGain: "High",
  threshold: "Threshold",
  ratio: "Ratio",
  attack: "Attack",
  release: "Release",
  knee: "Knee",
  time: "Time",
  feedback: "Feedback",
  mix: "Mix",
  decay: "Decay",
};

const PARAM_UNITS: Record<string, string> = {
  lowGain: "dB",
  midGain: "dB",
  highGain: "dB",
  threshold: "dB",
  ratio: ":1",
  attack: "s",
  release: "s",
  knee: "dB",
  time: "s",
  feedback: "",
  mix: "",
  decay: "s",
};

function formatParamValue(param: string, value: number): string {
  const unit = PARAM_UNITS[param] ?? "";
  if (param === "mix" || param === "feedback") return `${Math.round(value * 100)}%`;
  if (param === "ratio") return `${value.toFixed(1)}${unit}`;
  if (param === "attack" || param === "release" || param === "time") return `${(value * 1000).toFixed(0)}ms`;
  if (param === "decay") return `${value.toFixed(1)}${unit}`;
  return `${value.toFixed(1)}${unit}`;
}

interface EffectsRackProps {
  trackId: string;
}

export default function EffectsRack({ trackId }: EffectsRackProps) {
  const { state, dispatch } = useDAW();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [addMenuOpen]);

  const track = state.project?.tracks.find((t) => t.id === trackId);
  if (!track) return null;

  const effects = [...track.effects].sort((a, b) => a.order - b.order);

  const handleAdd = (type: EffectType) => {
    dispatch({ type: "ADD_EFFECT", trackId, effect: createEffect(type, effects.length) });
    setAddMenuOpen(false);
  };

  const handleRemove = (effectId: string) => {
    dispatch({ type: "REMOVE_EFFECT", trackId, effectId });
  };

  const handleBypass = (effectId: string) => {
    dispatch({ type: "TOGGLE_EFFECT_BYPASS", trackId, effectId });
  };

  const handleParam = (effectId: string, param: string, value: number) => {
    dispatch({ type: "UPDATE_EFFECT_PARAM", trackId, effectId, param, value });
  };

  return (
    <div style={rackStyle}>
      <div style={headerStyle}>
        <span style={headerLabelStyle}>FX — {track.name}</span>
        <div ref={addMenuRef} style={{ position: "relative" }}>
          <button onClick={() => setAddMenuOpen(!addMenuOpen)} style={addBtnStyle}>
            + Add
          </button>
          {addMenuOpen && (
            <div style={menuStyle}>
              {(Object.keys(EFFECT_LABELS) as EffectType[]).map((type) => (
                <button key={type} onClick={() => handleAdd(type)} style={menuItemStyle}>
                  {EFFECT_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {effects.length === 0 && (
        <div style={emptyStyle}>No effects. Click + Add to insert one.</div>
      )}

      {effects.map((fx) => (
        <EffectCard
          key={fx.id}
          effect={fx}
          onRemove={() => handleRemove(fx.id)}
          onBypass={() => handleBypass(fx.id)}
          onParam={(param, value) => handleParam(fx.id, param, value)}
        />
      ))}
    </div>
  );
}

function EffectCard({
  effect,
  onRemove,
  onBypass,
  onParam,
}: {
  effect: TrackEffect;
  onRemove: () => void;
  onBypass: () => void;
  onParam: (param: string, value: number) => void;
}) {
  const label = EFFECT_LABELS[effect.type as EffectType] ?? effect.type;
  const defaults = EFFECT_DEFAULTS[effect.type as EffectType] ?? {};
  const paramKeys = Object.keys(defaults);

  return (
    <div style={{ ...cardStyle, opacity: effect.bypassed ? 0.5 : 1 }}>
      <div style={cardHeaderStyle}>
        <button onClick={onBypass} style={bypassBtnStyle(effect.bypassed)} title="Bypass">
          {effect.bypassed ? "OFF" : "ON"}
        </button>
        <span style={cardLabelStyle}>{label}</span>
        <button onClick={onRemove} style={removeBtnStyle} title="Remove effect">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div style={paramsGridStyle}>
        {paramKeys.map((param) => {
          const range = EFFECT_PARAM_RANGES[param] ?? [0, 1];
          const value = effect.params[param] ?? defaults[param] ?? 0;
          return (
            <div key={param} style={paramRowStyle}>
              <span style={paramLabelStyle}>{PARAM_LABELS[param] ?? param}</span>
              <input
                type="range"
                min={range[0]}
                max={range[1]}
                step={(range[1] - range[0]) / 200}
                value={value}
                onChange={(e) => onParam(param, parseFloat(e.target.value))}
                style={sliderStyle}
                className="daw-fx-slider"
              />
              <span style={paramValueStyle}>{formatParamValue(param, value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const rackStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: 8,
  background: "#0B0B0A",
  overflowY: "auto",
  minWidth: 200,
  maxWidth: 280,
  borderLeft: "1px solid #1C1B19",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 0",
  borderBottom: "1px solid #1C1B19",
  marginBottom: 4,
};

const headerLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 700,
  color: "#D4A652",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const addBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #282724",
  borderRadius: 3,
  color: "#B5B2A8",
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  padding: "3px 8px",
  cursor: "pointer",
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  background: "#1B1A18",
  border: "1px solid #282724",
  borderRadius: 4,
  zIndex: 100,
  minWidth: 140,
  overflow: "hidden",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 10px",
  background: "transparent",
  border: "none",
  color: "#ECE9E1",
  fontSize: 11,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  textAlign: "left",
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  padding: "16px 8px",
  color: "#5F5E5A",
  fontSize: 11,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  textAlign: "center",
};

const cardStyle: React.CSSProperties = {
  background: "#131312",
  border: "1px solid #1C1B19",
  borderRadius: 4,
  padding: 8,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
};

function bypassBtnStyle(bypassed: boolean): React.CSSProperties {
  return {
    background: bypassed ? "transparent" : "rgba(76,175,80,0.2)",
    border: `1px solid ${bypassed ? "#5F5E5A" : "#4CAF50"}`,
    borderRadius: 2,
    color: bypassed ? "#5F5E5A" : "#4CAF50",
    fontSize: 8,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    padding: "1px 4px",
    cursor: "pointer",
    lineHeight: "12px",
  };
}

const cardLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontWeight: 600,
  color: "#ECE9E1",
};

const removeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#5F5E5A",
  cursor: "pointer",
  padding: 2,
  display: "flex",
  alignItems: "center",
};

const paramsGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const paramRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "52px 1fr 48px",
  alignItems: "center",
  gap: 4,
};

const paramLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#7A776E",
  fontFamily: "'JetBrains Mono', monospace",
};

const sliderStyle: React.CSSProperties = {
  width: "100%",
  height: 4,
  appearance: "none" as const,
  background: "#1B1A18",
  borderRadius: 2,
  outline: "none",
  cursor: "pointer",
};

const paramValueStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#B5B2A8",
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: "right",
};
