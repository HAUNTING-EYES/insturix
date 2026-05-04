"use client";

/**
 * Alyzitron (Analyze) Interface Mockup
 *
 * Shows the analysis report workspace:
 * - Video player left
 * - Score + verdict right
 * - Three timestamped fixes below
 * - Expandable metrics section
 *
 * Based on the Alyzitron spec (alyzitron_ui_spec_v1.md).
 */

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const fixes = [
  { at: "0:18", title: "Product pivot is too sudden", note: "Viewers drop 14% here" },
  { at: "0:28", title: "URL flashes for 1.2 seconds", note: "Hold for 2.5s minimum" },
  { at: "0:30", title: "No clear call to action", note: "Add one instruction" },
];

const metrics = [
  { label: "Hook strength", score: 92 },
  { label: "Pacing", score: 88 },
  { label: "CTA clarity", score: 95 },
  { label: "Brand match", score: 100 },
];

function scoreColor(s: number) {
  if (s >= 85) return "var(--status-success)";
  if (s >= 70) return "var(--accent-gold)";
  return "var(--status-danger)";
}

export function AnalyzeMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        width: "100%",
        background: "var(--bg-raised)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        aspectRatio: "16/10",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topbar */}
      <div style={{
        height: 32, background: "var(--bg-deeper)", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", padding: "0 12px", gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Analyze</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Q1 Product Launch</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: 12, overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Above the fold: video + score */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 12, alignItems: "center" }}>
          {/* Video thumbnail */}
          <div style={{
            aspectRatio: "16/9", borderRadius: 6, overflow: "hidden", position: "relative",
            background: "linear-gradient(135deg, rgb(18,16,14), rgb(28,22,16))",
          }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="#ECE9E1"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
            {/* Scrubber */}
            <div style={{ position: "absolute", bottom: 6, left: 6, right: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "#ECE9E1" }}>0:12</span>
              <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.15)", borderRadius: 1 }}>
                <div style={{ width: "38%", height: "100%", background: "var(--accent-gold)", borderRadius: 1 }} />
              </div>
              <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}>0:32</span>
            </div>
          </div>

          {/* Score + verdict */}
          <div>
            <span style={{ fontSize: 44, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-primary)", lineHeight: 0.9, letterSpacing: "-0.06em", display: "block" }}>
              91
            </span>
            <p style={{ fontSize: 10, color: "var(--text-primary)", lineHeight: 1.4, marginTop: 8 }}>
              A strong hook you land well.{" "}
              <span style={{ color: "var(--status-danger)" }}>The CTA is where you lose them.</span>
            </p>
          </div>
        </div>

        {/* Fixes */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
          {fixes.map((fix, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, padding: "6px 0",
              borderBottom: i < fixes.length - 1 ? "1px solid var(--border-subtle)" : "none",
            }}>
              <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--accent-gold)", minWidth: 20, paddingTop: 1 }}>
                {fix.at}
              </span>
              <div>
                <span style={{ fontSize: 9, color: "var(--text-primary)", display: "block" }}>{fix.title}</span>
                <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{fix.note}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics row */}
        <div style={{
          background: "var(--bg-deeper)", borderRadius: 7, border: "1px solid var(--border-subtle)",
          padding: "6px 0",
        }}>
          {metrics.map((m, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "4px 10px",
              borderBottom: i < metrics.length - 1 ? "1px solid var(--border-subtle)" : "none",
            }}>
              <span style={{ fontSize: 8, color: "var(--text-secondary)" }}>{m.label}</span>
              <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 500, color: scoreColor(m.score) }}>{m.score}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
