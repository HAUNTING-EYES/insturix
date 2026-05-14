"use client";

import React from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface TimelineSection {
  id: string;
  hasData: boolean;
  isLive: boolean;
}

export interface TimelineSpineProps {
  sections: TimelineSection[];
  activeSection: string | null;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Keyframes (injected once via <style>)                             */
/* ------------------------------------------------------------------ */

const KEYFRAMES = `
@keyframes pulseDown {
  0%   { top: -40px; opacity: 0 }
  10%  { opacity: 1 }
  85%  { opacity: 1 }
  95%  { opacity: 0.4 }
  100% { top: calc(100% - 10px); opacity: 0 }
}
@keyframes ringPulse {
  0%, 100% { box-shadow: 0 0 10px rgba(212,166,82,.15) }
  50%      { box-shadow: 0 0 20px rgba(212,166,82,.35) }
}
@keyframes ringExpand {
  0%   { opacity: 0.6; transform: scale(0.8) }
  100% { opacity: 0;   transform: scale(1.8) }
}
@keyframes endCatch {
  0%, 88%  { opacity: 0.3; box-shadow: none }
  94%      { opacity: 1;   box-shadow: 0 0 14px rgba(212,166,82,.35) }
  100%     { opacity: 0.3; box-shadow: none }
}
@keyframes textRadiate {
  0%, 85% { color: #7A776E }
  93%     { color: #D4A652 }
  100%    { color: #7A776E }
}
`;

/* ------------------------------------------------------------------ */
/*  NodeDot                                                           */
/* ------------------------------------------------------------------ */

export function NodeDot({
  hasData,
  isLive,
}: {
  hasData: boolean;
  isLive: boolean;
}) {
  /* Colour & glow logic ------------------------------------------- */
  const bg = isLive
    ? "#D4A652"
    : hasData
      ? "#5EC97E"
      : "#454340";

  const shadow = isLive
    ? "0 0 10px rgba(212,166,82,.15)"
    : hasData
      ? "0 0 10px rgba(94,201,126,.25)"
      : "none";

  return (
    <div
      style={{
        position: "absolute",
        left: "-52px",
        top: "6px",
        width: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          position: "relative",
          zIndex: 2,
          background: bg,
          boxShadow: shadow,
          animation: isLive ? "ringPulse 2s ease-in-out infinite" : undefined,
        }}
      >
        {/* Expanding ring for live dots */}
        {isLive && (
          <span
            style={{
              content: "''",
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              border: "1.5px solid #D4A652",
              opacity: 0,
              animation: "ringExpand 2s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Connector line (dot -> content) */}
      <div
        style={{
          position: "absolute",
          left: "calc(50% + 6px)",
          top: "50%",
          width: 20,
          height: 1,
          background: "#D4A652",
          opacity: 0.35,
          transform: "translateY(-50%)",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TimelineEnd                                                       */
/* ------------------------------------------------------------------ */

export function TimelineEnd({
  momentCount = 5,
  totalSeconds = 15,
}: {
  momentCount?: number;
  totalSeconds?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginLeft: -25,
        marginTop: -2,
      }}
    >
      {/* End dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#D4A652",
          flexShrink: 0,
          opacity: 0.5,
          animation: "endCatch 4s ease-in-out infinite",
        }}
      />

      {/* Summary label */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          letterSpacing: "0.04em",
          color: "#7A776E",
          animation: "textRadiate 4s ease-in-out infinite",
        }}
      >
        {momentCount} moments &middot; ~{totalSeconds}s
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TimelineSpine (wrapper)                                           */
/* ------------------------------------------------------------------ */

export default function TimelineSpine({
  children,
}: TimelineSpineProps) {
  return (
    <>
      {/* Inject keyframes once */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <div
        style={{
          position: "relative",
          paddingLeft: 52,
        }}
      >
        {/* Gold spine line (::before equivalent) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 31,
            top: 0,
            bottom: 28,
            width: 1.5,
            background:
              "linear-gradient(180deg, #D4A652 0%, rgba(212,166,82,.4) 70%, rgba(212,166,82,.15) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Pulse traveller (::after equivalent) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 29.5,
            top: 0,
            width: 5,
            height: 40,
            background:
              "linear-gradient(180deg, transparent, #D4A652, transparent)",
            borderRadius: 3,
            animation: "pulseDown 4s ease-in-out infinite",
            filter: "blur(1px)",
            pointerEvents: "none",
          }}
        />

        {/* Section content (moments, cards, etc.) */}
        {children}
      </div>
    </>
  );
}
