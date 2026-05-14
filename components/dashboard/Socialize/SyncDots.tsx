"use client";

import React from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SyncDotsProps {
  activeSection: string | null;
}

/* ------------------------------------------------------------------ */
/*  Section order (matches narrative timeline)                        */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  "opening",
  "introduction",
  "chapters",
  "breaking",
  "signature",
] as const;

/* ------------------------------------------------------------------ */
/*  SyncDots                                                          */
/* ------------------------------------------------------------------ */

export default function SyncDots({ activeSection }: SyncDotsProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: -24,
        top: 60,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "calc(100% - 80px)",
        justifyContent: "space-around",
      }}
    >
      {SECTIONS.map((id) => {
        const isActive = activeSection === id;

        return (
          <div
            key={id}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isActive ? "#D4A652" : "#282724",
              boxShadow: isActive
                ? "0 0 10px rgba(212,166,82,.15), 0 0 20px rgba(212,166,82,.15)"
                : "none",
              transform: isActive ? "scale(1.4)" : "scale(1)",
              transition: "all 0.4s cubic-bezier(.16,1,.3,1)",
            }}
          />
        );
      })}
    </div>
  );
}
