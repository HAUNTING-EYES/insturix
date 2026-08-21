"use client";

import { useRef, useEffect, useState } from "react";

interface StoryArcProps {
  username: string;
  activeSection: string | null;
  onWaypointClick: (sectionId: string) => void;
  /** Live public profile URL. When absent (no username yet) the header CTA is hidden. */
  profileUrl?: string;
}

const WAYPOINTS = [
  { id: "opening", label: "ARRIVAL", cx: 0 },
  { id: "introduction", label: "DISCOVERY", cx: 250 },
  { id: "chapters", label: "CONNECTION", cx: 500 },
  { id: "breaking", label: "NEWS", cx: 750 },
  { id: "signature", label: "SIGNATURE", cx: 1000 },
] as const;

/** Map each waypoint cx to its y-coordinate on the arc path */
const CY_MAP: Record<number, number> = {
  0: 38,
  250: 24,
  500: 6,
  750: 24,
  1000: 22,
};

const ARC_PATH =
  "M0,38 C150,38 200,30 350,18 C450,10 500,6 550,10 C650,18 750,28 850,14 C900,8 950,20 1000,22";

const ARC_FILL_PATH =
  "M0,38 C150,38 200,30 350,18 C450,10 500,6 550,10 C650,18 750,28 850,14 C900,8 950,20 1000,22 L1000,40 L0,40Z";

export function StoryArc({ username, activeSection, onWaypointClick, profileUrl }: StoryArcProps) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const arcRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 2600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "rgba(11,11,10,.85)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        borderBottom: "1px solid #1C1B19",
      }}
    >
      {/* ── Top bar: back / title / publish ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
        }}
      >
        {/* Back link */}
        <a
          href="/dashboard"
          className="font-jakarta"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.82rem",
            color: "#7A776E",
            cursor: "pointer",
            transition: "color 0.25s cubic-bezier(.16,1,.3,1)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#B5B2A8")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#7A776E")}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: 16,
              height: 16,
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
            }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </a>

        {/* Center title */}
        <div
          className="font-jakarta"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "1.47rem",
            fontWeight: 800,
            color: "#ECE9E1",
            letterSpacing: "-0.02em",
          }}
        >
          {username ? `${username}’s profile` : "your profile"}
        </div>

        {/* Header CTA — was a "Publish" button with NO onClick (a dead primary
            action). Sections save individually, so the honest top-level action
            is opening the live public page. Hidden until a username exists. */}
        {profileUrl ? (
          <a
            className="font-jakarta"
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "9px 22px",
              borderRadius: 7,
              border: "none",
              background: "#D4A652",
              color: "#0B0B0A",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor: "pointer",
              letterSpacing: "0.02em",
              textDecoration: "none",
              transition: "all 0.3s cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#C49840";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#D4A652";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            View public page ↗
          </a>
        ) : null}
      </div>

      {/* ── Story arc SVG + labels ── */}
      <div
        style={{
          padding: "10px 16px 8px",
          borderBottom: "1px solid #1C1B19",
          position: "relative",
        }}
      >
        <svg
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          style={{ width: "100%", height: 32, display: "block" }}
        >
          <defs>
            <linearGradient id="storyArcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,166,82,.12)" />
              <stop offset="100%" stopColor="rgba(212,166,82,0)" />
            </linearGradient>
          </defs>

          {/* Gradient fill under the arc */}
          <path
            d={ARC_FILL_PATH}
            fill="url(#storyArcGrad)"
            style={{
              opacity: 0,
              animation: "storyArcFadeIn 0.8s ease 2s forwards",
            }}
          />

          {/* Main arc line with draw-on animation */}
          <path
            ref={arcRef}
            d={ARC_PATH}
            fill="none"
            stroke="#D4A652"
            strokeWidth={1.5}
            style={{
              strokeDasharray: 1200,
              strokeDashoffset: 1200,
              animation: "storyArcDraw 2s cubic-bezier(.16,1,.3,1) 0.5s forwards",
              filter: "drop-shadow(0 0 6px rgba(212,166,82,.25))",
            }}
          />

          {/* Waypoint dots */}
          {WAYPOINTS.map((wp, i) => {
            const isActive = activeSection === wp.id;
            return (
              <circle
                key={wp.id}
                cx={wp.cx}
                cy={CY_MAP[wp.cx]}
                r={isActive ? 5 : 3}
                fill="#D4A652"
                style={{
                  cursor: "pointer",
                  opacity: 0,
                  animation: `storyArcFadeIn 0.4s ease ${2.2 + i * 0.2}s forwards`,
                  transition: "r 0.2s, filter 0.2s",
                  filter: isActive
                    ? "drop-shadow(0 0 8px rgba(212,166,82,.5))"
                    : "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.setAttribute("r", "5");
                    e.currentTarget.style.filter =
                      "drop-shadow(0 0 8px rgba(212,166,82,.5))";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.setAttribute("r", "3");
                    e.currentTarget.style.filter = "none";
                  }
                }}
                onClick={() => onWaypointClick(wp.id)}
              />
            );
          })}
        </svg>

        {/* Waypoint labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0 0",
          }}
        >
          {WAYPOINTS.map((wp) => {
            const isActive = activeSection === wp.id;
            return (
              <span
                key={wp.id}
                className="font-jetbrains"
                role="button"
                tabIndex={0}
                onClick={() => onWaypointClick(wp.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onWaypointClick(wp.id);
                  }
                }}
                style={{
                  fontSize: 10,
                  fontWeight: 400,
                  color: isActive ? "#D4A652" : "#5F5E5A",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  transition: "color 0.25s cubic-bezier(.16,1,.3,1)",
                  padding: "2px 4px",
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#D4A652")}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "#5F5E5A";
                }}
              >
                {wp.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Keyframe animations injected once */}
      <style jsx>{`
        @keyframes storyArcDraw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes storyArcFadeIn {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </header>
  );
}
