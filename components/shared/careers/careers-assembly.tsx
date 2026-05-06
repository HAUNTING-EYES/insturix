"use client";

/**
 * Careers Page — "The Assembly Line" (Horizontal Scroll)
 *
 * Vertical scroll drives horizontal movement through 3 department "stations."
 * Each station = one department, showing what it produces, capacity, and open roles.
 *
 * Technique: sticky container + translateX driven by scroll position.
 * Same approach as the products page "Studio Tour."
 */

import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// ─── Room dot colors (from design system) ─────────────────────
const ROOM_COLORS: Record<string, string> = {
  Edit: "var(--status-danger)",
  Analyze: "var(--category-purple)",
  Design: "var(--category-cyan)",
  Distribute: "var(--status-success)",
};

// ─── Station data ──────────────────────────────────────────────
interface Role {
  title: string;
  href: string;
}

interface Station {
  label: string;
  department: string;
  tagline: string;
  description: string;
  filled: number;
  total: number;
  color: string;
  roles: Role[];
  rooms: { name: string; color: string }[];
}

const stations: Station[] = [
  {
    label: "01",
    department: "ENGINEERING",
    tagline: "The engine room.",
    description:
      "Builds the core platform — editor, pipeline, AI, infrastructure.",
    filled: 5,
    total: 7,
    color: "var(--status-danger)",
    roles: [
      { title: "Full Stack Dev", href: "/contactus" },
      { title: "AI Engineer", href: "/contactus" },
      { title: "MLOps Engineer", href: "/contactus" },
    ],
    rooms: [
      { name: "Edit", color: ROOM_COLORS.Edit },
      { name: "Analyze", color: ROOM_COLORS.Analyze },
    ],
  },
  {
    label: "02",
    department: "MARKETING",
    tagline: "The voice.",
    description: "Shapes how the world sees the production floor.",
    filled: 1,
    total: 3,
    color: "var(--category-cyan)",
    roles: [
      { title: "Marketing Lead", href: "/contactus" },
      { title: "Branding Manager", href: "/contactus" },
    ],
    rooms: [
      { name: "Design", color: ROOM_COLORS.Design },
      { name: "Distribute", color: ROOM_COLORS.Distribute },
    ],
  },
  {
    label: "03",
    department: "STRATEGY",
    tagline: "The compass.",
    description: "Connects innovation with market opportunity.",
    filled: 0,
    total: 1,
    color: "var(--accent-gold)",
    roles: [{ title: "GTM Strategist", href: "/contactus" }],
    rooms: [{ name: "Distribute", color: ROOM_COLORS.Distribute }],
  },
];

const STATION_COUNT = stations.length;

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function CareersAssembly() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [activeStation, setActiveStation] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableHeight =
        containerRef.current.offsetHeight - window.innerHeight;
      const rawPct = Math.max(0, Math.min(1, -rect.top / scrollableHeight));
      setScrollPct(rawPct);
      setActiveStation(
        Math.min(
          STATION_COUNT - 1,
          Math.round(rawPct * (STATION_COUNT - 1))
        )
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const translateX = scrollPct * (STATION_COUNT - 1) * -100;

  return (
    <div style={{ background: "var(--bg-canvas)" }}>
      {/* ─── Hero ─── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "96px 48px 48px",
          textAlign: "center",
        }}
      >
        <motion.span
          className="mono-label"
          style={{
            display: "block",
            marginBottom: 24,
            color: "var(--accent-gold)",
          }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ amount: 0.5 }}
        >
          THE ASSEMBLY LINE
        </motion.span>

        <motion.h1
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            marginBottom: 16,
            color: "var(--text-primary)",
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.05,
          }}
          viewport={{ amount: 0.5 }}
        >
          Walk the line. Find your station.
        </motion.h1>

        <motion.p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            maxWidth: 420,
            margin: "0 auto",
          }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.1,
          }}
          viewport={{ amount: 0.5 }}
        >
          Scroll to explore each department.
        </motion.p>
      </section>

      {/* ─── Horizontal scroll section ─── */}
      <div
        ref={containerRef}
        style={{
          height: `${STATION_COUNT * 120}vh`,
          position: "relative",
        }}
      >
        {/* Sticky viewport */}
        <div
          style={{
            position: "sticky",
            top: 48,
            height: "calc(100vh - 48px)",
            overflow: "hidden",
          }}
        >
          {/* Horizontal strip */}
          <div
            style={{
              display: "flex",
              width: `${STATION_COUNT * 100}%`,
              height: "100%",
              transform: `translateX(${translateX}vw)`,
              transition: "transform 0.1s linear",
              willChange: "transform",
            }}
          >
            {stations.map((station, i) => (
              <StationPanel
                key={station.department}
                station={station}
                index={i}
                isActive={activeStation === i}
                scrollPct={scrollPct}
              />
            ))}
          </div>

          {/* Progress bar — 3 colored segments */}
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
            {stations.map((station, i) => (
              <div
                key={station.department}
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  background:
                    i <= activeStation
                      ? station.color
                      : "var(--border-subtle)",
                  opacity: i === activeStation ? 1 : i < activeStation ? 0.4 : 0.15,
                  transition: `all 0.35s ${EASE}`,
                }}
              />
            ))}
          </div>

          {/* Station counter */}
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
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 500,
                color: stations[activeStation].color,
              }}
            >
              {stations[activeStation].label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-faint)",
              }}
            >
              / {String(STATION_COUNT).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* ─── CTA below scroll ─── */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "80px 48px 120px",
          textAlign: "center",
        }}
      >
        <motion.h2
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            marginBottom: 16,
            color: "var(--text-primary)",
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ amount: 0.5 }}
        >
          Ready to join the line?
        </motion.h2>

        <motion.p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            marginBottom: 32,
            maxWidth: 400,
            margin: "0 auto 32px",
          }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.05,
          }}
          viewport={{ amount: 0.5 }}
        >
          We build tools for the next generation of creators.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.1,
          }}
          viewport={{ amount: 0.5 }}
        >
          <Link
            href="/contactus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--accent-gold)",
              color: "var(--bg-canvas)",
              padding: "14px 32px",
              borderRadius: 7,
              fontSize: 14,
              fontWeight: 800,
              textDecoration: "none",
              fontFamily: "var(--font-sans)",
              transition: `opacity 0.25s ${EASE}`,
            }}
          >
            Apply now
            <ArrowRight size={16} strokeWidth={2.5} />
          </Link>
        </motion.div>
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STATION PANEL — one per department, 100vw wide
// ═══════════════════════════════════════════════════════════════

function StationPanel({
  station,
  index,
  isActive,
  scrollPct,
}: {
  station: Station;
  index: number;
  isActive: boolean;
  scrollPct: number;
}) {
  const stationPosition = scrollPct * (STATION_COUNT - 1);
  const distFromActive = Math.abs(stationPosition - index);
  const isNear = distFromActive < 1.2;

  const panelScale = isActive ? 1 : isNear ? 0.88 : 0.78;
  const textX = isActive ? 0 : distFromActive > 0.5 ? 80 : 30;
  const textY = isActive ? 0 : 24;

  const fillPct = (station.filled / station.total) * 100;

  return (
    <div
      style={{
        width: `${100 / STATION_COUNT}%`,
        height: "100%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 48px",
        position: "relative",
        transform: `scale(${panelScale})`,
        transition: `transform 0.5s ${EASE}`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          opacity: isActive ? 1 : isNear ? 0.15 : 0.04,
          transform: `translate(${textX}px, ${textY}px)`,
          transition: `all 0.45s ${EASE}`,
        }}
      >
        {/* Station number — large, faint */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 44,
            fontWeight: 500,
            color: station.color,
            opacity: 0.15,
            letterSpacing: "-0.06em",
            lineHeight: 1,
            display: "block",
            marginBottom: 16,
          }}
        >
          {station.label}
        </span>

        {/* Department mono label */}
        <span
          className="mono-label"
          style={{
            color: station.color,
            display: "block",
            marginBottom: 12,
          }}
        >
          {station.department}
        </span>

        {/* Tagline */}
        <h2
          style={{
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "-0.035em",
            lineHeight: 1.15,
            marginBottom: 16,
            color: "var(--text-primary)",
          }}
        >
          {station.tagline}
        </h2>

        {/* Description */}
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            lineHeight: 1.65,
            marginBottom: 32,
            maxWidth: 480,
          }}
        >
          {station.description}
        </p>

        {/* Capacity meter */}
        <div style={{ marginBottom: 32, maxWidth: 320 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Capacity
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {station.filled}{" "}
              <span style={{ color: "var(--text-dim)" }}>/ {station.total}</span>{" "}
              filled
            </span>
          </div>
          {/* Bar track */}
          <div
            style={{
              width: "100%",
              height: 4,
              borderRadius: 4,
              background: "var(--bg-deeper)",
              overflow: "hidden",
            }}
          >
            <motion.div
              style={{
                height: "100%",
                borderRadius: 4,
                background: station.color,
              }}
              initial={{ width: 0 }}
              whileInView={{ width: `${fillPct}%` }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.15,
              }}
              viewport={{ amount: 0.3 }}
            />
          </div>
        </div>

        {/* Open roles */}
        <div style={{ marginBottom: 32 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "block",
              marginBottom: 12,
            }}
          >
            Open roles
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {station.roles.map((role) => (
              <Link
                key={role.title}
                href={role.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 7,
                  textDecoration: "none",
                  transition: `border-color 0.25s ${EASE}`,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {role.title}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    color: station.color,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Apply
                  <ArrowRight size={12} strokeWidth={2.5} />
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Rooms they build */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Builds
          </span>
          {station.rooms.map((room) => (
            <div
              key={room.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "var(--bg-deeper)",
                borderRadius: 4,
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: room.color,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                }}
              >
                {room.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
