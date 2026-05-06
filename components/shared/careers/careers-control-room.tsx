"use client";

/**
 * CareersControlRoom — "The Control Room"
 *
 * Mission control dashboard. Each room is a monitoring station with status,
 * capacity gauges, and open roles as "missions." NASA meets production floor.
 */

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface OpenRole {
  title: string;
  experience: string;
}

interface Station {
  name: string;
  color: string;
  staffed: number;
  total: number;
  roles: OpenRole[];
}

const STATIONS: Station[] = [
  {
    name: "Script",
    color: "var(--accent-gold)",
    staffed: 3,
    total: 3,
    roles: [],
  },
  {
    name: "Edit",
    color: "var(--status-danger)",
    staffed: 5,
    total: 7,
    roles: [
      { title: "Full Stack Developer", experience: "2-5 yr" },
      { title: "MLOps Engineer", experience: "3-5 yr" },
    ],
  },
  {
    name: "Analyze",
    color: "var(--category-purple)",
    staffed: 2,
    total: 3,
    roles: [{ title: "AI Engineer", experience: "3-6 yr" }],
  },
  {
    name: "Design",
    color: "var(--category-cyan)",
    staffed: 1,
    total: 2,
    roles: [{ title: "Branding Manager", experience: "2-4 yr" }],
  },
  {
    name: "Distribute",
    color: "var(--status-success)",
    staffed: 1,
    total: 3,
    roles: [
      { title: "Marketing Lead", experience: "3-5 yr" },
      { title: "GTM Strategist", experience: "4-7 yr" },
    ],
  },
  {
    name: "Share",
    color: "var(--category-pink)",
    staffed: 2,
    total: 2,
    roles: [],
  },
];

const HIRING_COUNT = STATIONS.filter((s) => s.roles.length > 0).length;
const OPERATIONAL_COUNT = STATIONS.length - HIRING_COUNT;
const OPEN_MISSIONS = STATIONS.reduce((sum, s) => sum + s.roles.length, 0);

/* ------------------------------------------------------------------ */
/*  Keyframes (injected once via <style>)                              */
/* ------------------------------------------------------------------ */

const keyframes = `
@keyframes borderPulse {
  0%, 100% { border-color: color-mix(in srgb, var(--pulse-color) 30%, transparent); }
  50% { border-color: color-mix(in srgb, var(--pulse-color) 55%, transparent); }
}
@keyframes liveDot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const staggerGrid = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CapacityGauge({
  staffed,
  total,
  color,
}: {
  staffed: number;
  total: number;
  color: string;
}) {
  const pct = (staffed / total) * 100;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: "var(--bg-well)",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ margin: "-32px" }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
          style={{
            height: "100%",
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </div>
      <span
        style={{
          display: "block",
          marginTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 400,
          color: "var(--text-dim)",
        }}
      >
        {staffed}/{total} staffed
      </span>
    </div>
  );
}

function StatusBadge({ hiring }: { hiring: boolean }) {
  if (hiring) {
    return (
      <span
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--accent-gold)",
          backgroundColor: "color-mix(in srgb, var(--accent-gold) 10%, transparent)",
          borderRadius: 4,
          padding: "3px 8px",
        }}
      >
        HIRING
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--status-success)",
        backgroundColor: "color-mix(in srgb, var(--status-success) 10%, transparent)",
        borderRadius: 4,
        padding: "3px 8px",
      }}
    >
      OPERATIONAL
    </span>
  );
}

function StationCard({ station }: { station: Station }) {
  const isHiring = station.roles.length > 0;

  return (
    <motion.div
      variants={cardVariant}
      style={{
        backgroundColor: "var(--bg-raised)",
        border: `1px solid color-mix(in srgb, ${station.color} 30%, transparent)`,
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        // Hiring cards get the pulse animation via CSS custom property
        ...(isHiring
          ? {
              "--pulse-color": station.color,
              animation: "borderPulse 3s ease-in-out infinite",
            }
          : {}),
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
            color: "var(--text-primary)",
          }}
        >
          {station.name}
        </span>
        <StatusBadge hiring={isHiring} />
      </div>

      {/* Capacity gauge */}
      <CapacityGauge
        staffed={station.staffed}
        total={station.total}
        color={station.color}
      />

      {/* Open missions or fully staffed */}
      {isHiring ? (
        <div style={{ marginTop: 20 }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 10,
            }}
          >
            OPEN MISSIONS
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {station.roles.map((role) => (
              <div
                key={role.title}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "var(--font-sans)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {role.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 400,
                      color: "var(--text-dim)",
                      marginTop: 2,
                    }}
                  >
                    {role.experience}
                  </span>
                </div>
                <Link
                  href="/contactus"
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                    color: "var(--accent-gold)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  Assign <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              color: "var(--status-success)",
            }}
          >
            All positions filled
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export function CareersControlRoom() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-canvas)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />

      {/* ============================================================ */}
      {/*  1. Hero                                                      */}
      {/* ============================================================ */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "128px 24px 48px",
          textAlign: "center",
        }}
      >
        <motion.h1
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Mission control.
        </motion.h1>
        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "var(--text-secondary)",
            marginTop: 16,
            maxWidth: 440,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.6,
          }}
        >
          6 rooms. 6 stations. Some need operators.
        </motion.p>
      </section>

      {/* ============================================================ */}
      {/*  2. Dashboard header bar                                      */}
      {/* ============================================================ */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-32px" }}
          variants={fadeUp}
          style={{
            backgroundColor: "var(--bg-deeper)",
            borderRadius: 7,
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {/* Left label */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
          >
            PRODUCTION FLOOR STATUS
          </span>

          {/* Center stats */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--status-success)",
              }}
            >
              {OPERATIONAL_COUNT} rooms operational
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>&middot;</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--accent-gold)",
              }}
            >
              {HIRING_COUNT} rooms hiring
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>&middot;</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-secondary)",
              }}
            >
              {OPEN_MISSIONS} open missions
            </span>
          </div>

          {/* Right: live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "var(--status-success)",
                display: "inline-block",
                animation: "liveDot 2s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
              }}
            >
              LIVE
            </span>
          </div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  3. Station grid (3x2)                                        */}
      {/* ============================================================ */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "32px 24px 64px",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-64px" }}
          variants={staggerGrid}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {STATIONS.map((station) => (
            <StationCard key={station.name} station={station} />
          ))}
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  4. CTA                                                       */}
      {/* ============================================================ */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 24px 128px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ margin: "-48px" }}
          variants={fadeUp}
        >
          <h2
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Ready for your mission?
          </h2>
          <p
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: "var(--text-secondary)",
              marginTop: 12,
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Every open role is a station that needs an operator.
          </p>
          <Link
            href="/contactus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              color: "var(--bg-canvas)",
              backgroundColor: "var(--accent-gold)",
              border: "none",
              borderRadius: 7,
              padding: "12px 24px",
              textDecoration: "none",
              cursor: "pointer",
              transition: "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            Report for duty
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </section>
    </main>
  );
}
