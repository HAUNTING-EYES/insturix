"use client";

import React from "react";

export interface SyncDotsProps {
  activeSection: string | null;
}

const DOTS = [
  { id: "opening",      top: "10%" },
  { id: "introduction", top: "30%" },
  { id: "chapters",     top: "62%" },
  { id: "breaking",     top: "82%" },
] as const;

export default function SyncDots({ activeSection }: SyncDotsProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: -20,
        top: 0,
        bottom: 0,
        width: 12,
        pointerEvents: "none",
      }}
    >
      {DOTS.map(({ id, top }) => {
        const isActive = activeSection === id;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              top,
              left: 3,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isActive ? "#D4A652" : "#282724",
              boxShadow: isActive
                ? "0 0 10px rgba(212,166,82,.3), 0 0 20px rgba(212,166,82,.15)"
                : "none",
              transform: isActive ? "scale(1.5)" : "scale(1)",
              transition: "all 0.4s cubic-bezier(.16,1,.3,1)",
            }}
          />
        );
      })}
    </div>
  );
}
