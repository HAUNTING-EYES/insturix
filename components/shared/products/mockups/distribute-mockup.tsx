"use client";

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const platforms = [
  { name: "YouTube", color: "#FF0000", status: "Live", views: "2.4K" },
  { name: "Instagram", color: "#E1306C", status: "Live", views: "1.8K" },
  { name: "TikTok", color: "#ECE9E1", status: "Live", views: "5.1K" },
  { name: "LinkedIn", color: "#0A66C2", status: "Live", views: "890" },
  { name: "X", color: "#ECE9E1", status: "Live", views: "1.2K" },
  { name: "Facebook", color: "#1877F2", status: "Scheduled", views: "—" },
];

export function DistributeMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        width: "100%", background: "var(--bg-raised)", borderRadius: 12,
        border: "1px solid var(--border-subtle)", overflow: "hidden",
        aspectRatio: "16/10", display: "flex", flexDirection: "column",
      }}
    >
      {/* Topbar */}
      <div style={{
        height: 32, background: "var(--bg-deeper)", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Distribute</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Q1 Product Launch</span>
        </div>
        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--status-success)" }}>5 / 6 live</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Platform grid */}
        <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>PLATFORMS</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, flex: 1 }}>
            {platforms.map((p) => {
              const isLive = p.status === "Live";
              return (
                <div key={p.name} style={{
                  padding: "8px", borderRadius: 7,
                  background: "var(--bg-raised)", border: `1px solid ${isLive ? "var(--status-success)" : "var(--border-subtle)"}`,
                  borderColor: isLive ? "rgba(94,201,126,0.2)" : "var(--border-subtle)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color, opacity: 0.7 }} />
                  <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</span>
                  <span style={{
                    fontSize: 7, fontFamily: "var(--font-mono)",
                    color: isLive ? "var(--status-success)" : "var(--accent-gold)",
                  }}>
                    {p.status}
                  </span>
                  {isLive && (
                    <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      {p.views} views
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — summary panel */}
        <div style={{ width: "32%", borderLeft: "1px solid var(--border-subtle)", padding: 8, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>SUMMARY</span>

          {/* Total views */}
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <span style={{ fontSize: 24, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.04em" }}>11.4K</span>
            <span style={{ fontSize: 8, color: "var(--text-dim)", display: "block", marginTop: 2 }}>Total views (24h)</span>
          </div>

          {/* Stats */}
          {[
            ["Platforms live", "5 / 6"],
            ["Best performer", "TikTok"],
            ["Avg. engagement", "4.2%"],
            ["Published", "2h ago"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{k}</span>
              <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{v}</span>
            </div>
          ))}

          {/* Auto-format badge */}
          <div style={{
            marginTop: "auto", padding: "6px 8px", background: "var(--bg-deeper)", borderRadius: 4,
            border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L19 7" stroke="var(--status-success)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 8, color: "var(--text-muted)" }}>Auto-formatted for each platform</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
