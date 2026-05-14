"use client";

import React from "react";

export interface ChannelStripProps {
  modelId: string;
  label: string;
  channelNumber: number;
  description: string;
  creditCost: number;
  isActive: boolean;
  onSelect: (modelId: string) => void;
  knobRotation?: number;
}

export function ChannelStrip({
  modelId,
  label,
  channelNumber,
  description,
  creditCost,
  isActive,
  onSelect,
  knobRotation = 0,
}: ChannelStripProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(modelId)}
      style={{
        background: "#131312",
        border: `1px solid ${isActive ? "#D4A652" : "#1C1B19"}`,
        borderRadius: 10,
        padding: "14px 10px 12px",
        flex: 1,
        textAlign: "center",
        cursor: "pointer",
        position: "relative",
        transition: "all .3s cubic-bezier(.16,1,.3,1)",
        boxShadow: isActive ? "0 0 24px rgba(212, 166, 82, 0.15)" : "none",
        outline: "none",
        color: "inherit",
        fontFamily: "inherit",
      }}
      aria-pressed={isActive}
    >
      {/* Channel Label */}
      <div
        style={{
          fontSize: 9,
          color: "#5F5E5A",
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          marginBottom: 6,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        CH {channelNumber}
      </div>

      {/* LED Indicator */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isActive ? "#D4A652" : "#5F5E5A",
          margin: "0 auto 8px",
          transition: "all .3s",
          boxShadow: isActive ? "0 0 8px #D4A652" : "none",
        }}
      />

      {/* Knob */}
      <div style={{ width: 44, height: 44, margin: "0 auto 6px" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, #3a3a38, #1a1a19)",
            border: "2px solid #282724",
            position: "relative",
            transition: "transform .4s cubic-bezier(.16,1,.3,1)",
          }}
        >
          {/* Knob indicator line */}
          <div
            style={{
              position: "absolute",
              top: 5,
              left: "50%",
              width: 2,
              height: 10,
              background: "#D4A652",
              borderRadius: 1,
              transformOrigin: "bottom center",
              transform: `translateX(-50%) rotate(${knobRotation}deg)`,
            }}
          />
        </div>
      </div>

      {/* Model Name */}
      <div
        style={{
          fontSize: 10,
          color: "#B5B2A8",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>

      {/* Cost Badge */}
      <div
        style={{
          fontSize: 9,
          color: "#D4A652",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {creditCost} credit{creditCost !== 1 ? "s" : ""}
      </div>
    </button>
  );
}
