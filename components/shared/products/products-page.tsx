"use client";

/**
 * Products Page — "The Studio Tour" (Horizontal Scroll)
 *
 * Vertical scroll drives horizontal movement through 6 "rooms."
 * Each room = one tool in the pipeline, with a built workspace mockup.
 *
 * Technique: sticky container + translateX driven by scroll position.
 * Same approach as Apple iPhone/AirPods Pro product pages.
 *
 * RAMS: One room per viewport. Nothing competes.
 * JOBS: Feels like touring a production facility.
 * MÜLLER-BROCKMANN: Each room has ONE focal point — the mockup.
 */

import React, { useRef, useState, useEffect } from "react";
import { ScriptMockup } from "./mockups/script-mockup";
import { EditMockup } from "./mockups/edit-mockup";
import { AnalyzeMockup } from "./mockups/analyze-mockup";
import { DesignMockup } from "./mockups/design-mockup";
import { SocializeMockup } from "./mockups/socialize-mockup";
import { DistributeMockup } from "./mockups/distribute-mockup";
import { LogoCondense } from "./logo-condense";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Room data ──────────────────────────────────────────────────
const rooms = [
  {
    label: "01",
    verb: "Script",
    heading: "Start with a prompt.\nGet a production-ready script.",
    description: "Describe what you want in plain language. The AI writes a complete script — structured into acts with hooks, pacing, and CTAs built in.",
    output: "Full script with narration, visual directions, and timing",
    color: "var(--accent-gold)",
    mockup: <ScriptMockup />,
  },
  {
    label: "02",
    verb: "Edit",
    heading: "From script or footage.\nA finished output.",
    description: "Generate from a prompt or upload your own footage. AI handles cuts, captions, music sync, transitions, and color grading so teams can move faster from raw material to finished media.",
    output: "Polished content from any starting point",
    color: "var(--status-danger)",
    mockup: <EditMockup />,
  },
  {
    label: "03",
    verb: "Analyze",
    heading: "Know what works\nbefore you publish.",
    description: "Every draft gets scored on hook strength, pacing, retention, CTA clarity, and brand fit. Three timestamped fixes you can apply in seconds.",
    output: "Quality score, verdict, and three actionable fixes",
    color: "var(--category-purple)",
    mockup: <AnalyzeMockup />,
  },
  {
    label: "04",
    verb: "Design",
    heading: "Thumbnails that\nget clicked.",
    description: "Multiple variants generated, CTR predicted for each. Edit inline — swap text, recolor, tweak faces without leaving the canvas.",
    output: "Thumbnail variants with predicted click-through rate",
    color: "var(--category-cyan)",
    mockup: <DesignMockup />,
  },
  {
    label: "05",
    verb: "Distribute",
    heading: "Published everywhere.\nOne click.",
    description: "YouTube, Instagram, TikTok, LinkedIn, X, Facebook — auto-formatted for each platform. Pushed live simultaneously.",
    output: "Live on 6 platforms with platform-specific formatting",
    color: "var(--status-success)",
    mockup: <DistributeMockup />,
  },
  {
    label: "06",
    verb: "Share",
    heading: "Your brand in\none link.",
    description: "A single page with all your links, socials, and content — themed to your brand. Share it everywhere. Track every click.",
    output: "Branded link-in-bio page with analytics",
    color: "var(--category-cyan)",
    mockup: <SocializeMockup />,
  },
];

const ROOM_COUNT = rooms.length;

// ═══════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════

export function ProductsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [activeRoom, setActiveRoom] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const lastScrollUpdate = useRef(0);

  // PERF: Throttle scroll state updates to ~20fps (50ms).
  // OLD: setScrollPct on every frame (~60fps) = 60 React re-renders/sec
  // NEW: 20fps state updates, existing CSS transition (transform 0.1s linear) smooths visuals
  useEffect(() => {
    const onScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableHeight = containerRef.current.offsetHeight - window.innerHeight;
      const rawPct = Math.max(0, Math.min(1, -rect.top / scrollableHeight));
      const now = performance.now();
      if (now - lastScrollUpdate.current > 50) {
        setScrollPct(rawPct);
        setActiveRoom(Math.min(ROOM_COUNT - 1, Math.round(rawPct * (ROOM_COUNT - 1))));
        lastScrollUpdate.current = now;
      }
    };
    // Sync final state on scroll end
    const onScrollEnd = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableHeight = containerRef.current.offsetHeight - window.innerHeight;
      const rawPct = Math.max(0, Math.min(1, -rect.top / scrollableHeight));
      setScrollPct(rawPct);
      setActiveRoom(Math.min(ROOM_COUNT - 1, Math.round(rawPct * (ROOM_COUNT - 1))));
    };
    if (!isMobile) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("scrollend", onScrollEnd, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("scrollend", onScrollEnd);
      };
    }
  }, [isMobile]);

  // The horizontal translate: 0% at start → -(ROOM_COUNT-1)*100% at end
  const translateX = scrollPct * (ROOM_COUNT - 1) * -100;

  return (
    <div style={{ background: "var(--bg-canvas)" }}>
      {/* Hero — above the horizontal scroll */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "64px var(--r-page-padding, 16px) 32px" : "96px 48px 48px", textAlign: "center" }}>
        <span className="mono-label" style={{ display: "block", marginBottom: 24, color: "var(--accent-gold)" }}>
          THE STUDIO
        </span>
        <h1 style={{ fontSize: "var(--r-hero-size, 44px)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, marginBottom: 16, color: "var(--text-primary)" }}>
          Six rooms. One production floor.
        </h1>
        <p style={{ fontSize: isMobile ? 16 : 18, color: "var(--text-muted)", lineHeight: 1.55, maxWidth: 520, margin: "0 auto 32px" }}>
          Scroll to walk through each workspace.
        </p>

        {/* Room nav pills */}
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 32, flexWrap: "wrap" }}>
          {rooms.map((room, i) => (
            <button
              key={room.verb}
              onClick={() => {
                if (isMobile) return; // no scroll-jacking on mobile
                if (!containerRef.current) return;
                const scrollableHeight = containerRef.current.offsetHeight - window.innerHeight;
                const targetScroll = containerRef.current.offsetTop + (i / ROOM_COUNT) * scrollableHeight;
                window.scrollTo({ top: targetScroll, behavior: "smooth" });
              }}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: activeRoom === i ? 500 : 400,
                color: activeRoom === i ? "var(--text-primary)" : "var(--text-dim)",
                background: activeRoom === i ? "var(--bg-deeper)" : "transparent",
                border: `1px solid ${activeRoom === i ? "var(--border-emphasis)" : "transparent"}`,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: `all 0.25s ${EASE}`,
              }}
            >
              {room.verb}
            </button>
          ))}
        </div>
      </section>

      {/* ─── Room cards section ─── */}
      {isMobile ? (
        /* Mobile: vertical stack of room cards, no horizontal scroll */
        <section style={{ padding: "0 var(--r-page-padding, 16px) 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {rooms.map((room) => (
              <MobileRoomCard key={room.verb} room={room} />
            ))}
          </div>
        </section>
      ) : (
        /* Desktop: horizontal scroll section */
        /* Container height = scroll distance. 120vh per room. */
        <div
          ref={containerRef}
          style={{
            height: `${ROOM_COUNT * 120}vh`,
            position: "relative",
          }}
        >
          {/* Sticky viewport — stays on screen while we scroll through the tall container */}
          <div
            style={{
              position: "sticky",
              top: 48, // below navbar
              height: `calc(100vh - 48px)`,
              overflow: "hidden",
            }}
          >
            {/* Horizontal strip — slides left as user scrolls */}
            <div
              style={{
                display: "flex",
                width: `${ROOM_COUNT * 100}%`,
                height: "100%",
                transform: `translateX(${translateX}vw)`,
                transition: "transform 0.1s linear",
                willChange: "transform",
              }}
            >
              {rooms.map((room, i) => (
                <RoomPanel key={room.verb} room={room} index={i} isActive={activeRoom === i} scrollPct={scrollPct} />
              ))}
            </div>

            {/* Progress bar at bottom */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: 48,
                right: 48,
                display: "flex",
                gap: 4,
                zIndex: 10,
              }}
            >
              {rooms.map((room, i) => (
                <div
                  key={room.verb}
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    background: i <= activeRoom ? room.color : "var(--border-subtle)",
                    opacity: i === activeRoom ? 1 : i < activeRoom ? 0.4 : 0.15,
                    transition: `all 0.35s ${EASE}`,
                  }}
                />
              ))}
            </div>

            {/* Room counter */}
            <div
              style={{
                position: "absolute",
                bottom: 24,
                right: 48,
                display: "flex",
                alignItems: "center",
                gap: 8,
                zIndex: 10,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: rooms[activeRoom].color }}>
                {rooms[activeRoom].label}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>
                / {String(ROOM_COUNT).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Condense animation: colored arcs → logo SVG path draw → filled logo ─── */}
      <LogoCondense rooms={rooms} isMobile={isMobile} />

      {/* CTA */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "32px var(--r-page-padding, 16px) 80px" : "48px 48px 120px", textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--r-heading-size, 32px)", fontWeight: 800, letterSpacing: "-0.035em", marginBottom: 16, color: "var(--text-primary)" }}>
          Try the full studio. Free.
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
          Three minutes from prompt to publish-ready content.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/signup" style={{ background: "var(--accent-gold)", color: "var(--bg-canvas)", padding: isMobile ? "14px 24px" : "14px 32px", borderRadius: 7, fontSize: 14, fontWeight: 800, textDecoration: "none" }}>
            Start free
          </a>
          <a href="/contactus" style={{ color: "var(--text-secondary)", border: "1px solid var(--border-emphasis)", padding: isMobile ? "13px 24px" : "13px 32px", borderRadius: 7, fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
            Talk to sales
          </a>
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOM PANEL — one per tool, 100vw wide
// ═══════════════════════════════════════════════════════════════

function RoomPanel({
  room,
  index,
  isActive,
  scrollPct,
}: {
  room: (typeof rooms)[number];
  index: number;
  isActive: boolean;
  scrollPct: number;
}) {
  // Per-room progress: aligned with translateX so each room gets equal scroll
  const roomPosition = scrollPct * (ROOM_COUNT - 1);
  const roomPct = Math.max(0, Math.min(1, roomPosition - index + 0.5));
  const distFromActive = Math.abs(roomPosition - index);
  const isNear = distFromActive < 1.2; // within 1 room of active
  // Depth effects — more dramatic for visible "walking into room" feel
  const roomScale = isActive ? 1 : isNear ? 0.88 : 0.78;
  const roomBlur = isActive ? 0 : isNear ? 4 : 10;
  const textX = isActive ? 0 : distFromActive > 0.5 ? 80 : 30;
  const mockupX = isActive ? 0 : distFromActive > 0.5 ? 120 : 50;
  const textY = isActive ? 0 : 24;

  return (
    <div
      style={{
        width: `${100 / ROOM_COUNT}%`,
        height: "100%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 48px",
        position: "relative",
        // Depth: inactive rooms scale down and blur — feels like walking past them
        transform: `scale(${roomScale})`,
        filter: `blur(${roomBlur}px)`,
        transition: `transform 0.5s ${EASE}, filter 0.5s ${EASE}`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1080,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 48,
          alignItems: "center",
        }}
      >
        {/* Left — text (enters slightly before mockup) */}
        <div
          style={{
            opacity: isActive ? 1 : isNear ? 0.2 : 0.05,
            transform: `translate(${textX}px, ${textY}px)`,
            transition: `all 0.45s ${EASE}`,
          }}
        >
          {/* Room number — large, faint */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 44,
              fontWeight: 500,
              color: room.color,
              opacity: 0.15,
              letterSpacing: "-0.06em",
              lineHeight: 1,
              display: "block",
              marginBottom: 16,
            }}
          >
            {room.label}
          </span>

          <span
            className="mono-label"
            style={{ color: room.color, display: "block", marginBottom: 12 }}
          >
            {room.verb.toUpperCase()}
          </span>

          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.15,
              marginBottom: 16,
              color: "var(--text-primary)",
              whiteSpace: "pre-line",
            }}
          >
            {room.heading}
          </h2>

          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.65,
              marginBottom: 24,
            }}
          >
            {room.description}
          </p>

          {/* Output badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "var(--bg-deeper)",
              borderRadius: 7,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 3, background: room.color }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {room.output}
            </span>
          </div>
        </div>

        {/* Right — mockup (enters 0.05s after text for stagger) */}
        <div
          style={{
            opacity: isActive ? 1 : isNear ? 0.1 : 0.02,
            transform: `translate(${mockupX}px, ${textY}px)`,
            transition: `all 0.55s ${EASE} ${isActive ? "0.05s" : "0s"}`,
          }}
        >
          {room.mockup || <MockupPlaceholder verb={room.verb} color={room.color} />}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Room Card — vertical stack, no mockup ──────────────
function MobileRoomCard({ room }: { room: (typeof rooms)[number] }) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 32,
          fontWeight: 500,
          color: room.color,
          opacity: 0.15,
          letterSpacing: "-0.06em",
          lineHeight: 1,
        }}
      >
        {room.label}
      </span>
      <span
        className="mono-label"
        style={{ color: room.color }}
      >
        {room.verb.toUpperCase()}
      </span>
      <h2
        style={{
          fontSize: "var(--r-heading-size, 24px)",
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 1.15,
          marginBottom: 4,
          color: "var(--text-primary)",
          whiteSpace: "pre-line",
        }}
      >
        {room.heading}
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.65,
          marginBottom: 8,
        }}
      >
        {room.description}
      </p>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--bg-deeper)",
          borderRadius: 7,
          border: "1px solid var(--border-subtle)",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: 3, background: room.color }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {room.output}
        </span>
      </div>
    </div>
  );
}

// ─── Placeholder ────────────────────────────────────────────────
function MockupPlaceholder({ verb, color }: { verb: string; color: string }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/10",
        background: "var(--bg-raised)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.4 }} />
      <span style={{ fontSize: 44, fontWeight: 800, color, opacity: 0.06, letterSpacing: "-0.04em" }}>
        {verb}
      </span>
      <span className="mono-label">{verb.toUpperCase()} · COMING SOON</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONDENSE TO LOGO — 6 colored arcs form a rainbow circle,
// then logo fades in at center. Clean, achievable, looks great.
// ═══════════════════════════════════════════════════════════════

function CondenseToLogo({ rooms: roomData }: { rooms: typeof rooms }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.15) / (vh * 0.6)));
      setProgress(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Phase 1 (0→0.5): 6 arcs spin from scattered to forming a circle
  // Phase 2 (0.5→0.8): Circle complete, starts glowing, logo scales in
  // Phase 3 (0.8→1): Logo fully visible, text appears
  const gather = Math.min(1, progress / 0.5);
  const reveal = Math.max(0, Math.min(1, (progress - 0.45) / 0.35));
  const textShow = Math.max(0, (progress - 0.75) / 0.25);

  const R = 110; // circle radius — bigger canvas
  const circumference = 2 * Math.PI * R;
  const arcLen = circumference / roomData.length;
  const gapLen = 6;
  // Spin: 3 full rotations for more dramatic spiral
  const spin = gather * 1080;
  // Scale: start very spread, contract to circle
  const arcScale = 2.5 - gather * 1.5; // 2.5 → 1.0
  // Opacity
  const arcOpacity = Math.min(1, gather * 1.5) * (1 - Math.max(0, (reveal - 0.6) / 0.4));
  // Glow intensifies as arcs converge
  const glowIntensity = gather * 8 + reveal * 16;

  return (
    <div
      ref={sectionRef}
      style={{
        padding: "120px 48px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 500,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 360,
          height: 360,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* SVG with colored arc segments */}
        <svg
          width="360"
          height="360"
          viewBox="0 0 360 360"
          style={{
            position: "absolute",
            inset: 0,
            transform: `rotate(${spin}deg) scale(${arcScale})`,
            transition: "transform 0.15s linear",
          }}
        >
          {roomData.map((room, i) => {
            const dashOffset = circumference - arcLen + gapLen;
            const rotateAngle = (i / roomData.length) * 360;
            return (
              <circle
                key={room.verb}
                cx="180"
                cy="180"
                r={R}
                fill="none"
                stroke={room.color}
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeDasharray={`${arcLen - gapLen} ${dashOffset}`}
                transform={`rotate(${rotateAngle} 180 180)`}
                opacity={arcOpacity}
                style={{
                  filter: glowIntensity > 0 ? `drop-shadow(0 0 ${glowIntensity}px ${room.color}60)` : "none",
                }}
              />
            );
          })}
        </svg>

        {/* Outer ring solidifies as arcs complete */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid var(--text-primary)`,
            opacity: reveal * 0.3,
            transform: `scale(${0.9 + reveal * 0.1})`,
            transition: "opacity 0.3s ease",
          }}
        />

        {/* Logo image — dramatic entrance: scale + rotate + blur clear */}
        <img
          src="/brand/insturix_white.png"
          alt="Insturix"
          width={160}
          height={160}
          style={{
            borderRadius: 12,
            position: "relative",
            zIndex: 2,
            opacity: reveal,
            transform: `scale(${0.3 + reveal * 0.7}) rotate(${(1 - reveal) * -60}deg)`,
            filter: `blur(${(1 - reveal) * 8}px)`,
            transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>

      {/* Brand name + tagline */}
      <div
        style={{
          marginTop: 32,
          opacity: textShow,
          transform: `translateY(${(1 - textShow) * 16}px)`,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: "var(--text-primary)",
            display: "block",
          }}
        >
          Insturix
        </span>
        <p
          style={{
            fontSize: 18,
            color: "var(--text-muted)",
            marginTop: 12,
            lineHeight: 1.55,
          }}
        >
          Six rooms. One production floor. All yours.
        </p>
      </div>
    </div>
  );
}
