"use client";

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const thumbs = [
  { label: "A", ctr: "4.2%", best: false },
  { label: "B", ctr: "5.1%", best: true },
  { label: "C", ctr: "3.8%", best: false },
  { label: "D", ctr: "3.2%", best: false },
];

const palette = ["var(--accent-gold)", "var(--status-danger)", "var(--bg-well)", "var(--text-primary)"];

export function DesignMockup() {
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
        display: "flex", alignItems: "center", padding: "0 12px", gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Design</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Thumbnail variants</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Thumbnail grid */}
        <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>
            VARIANTS · 4 GENERATED
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>
            {thumbs.map((t) => (
              <div key={t.label} style={{
                borderRadius: 6, overflow: "hidden", position: "relative",
                border: t.best ? "1px solid var(--status-success)" : "1px solid var(--border-subtle)",
                background: "var(--bg-deeper)",
              }}>
                {t.best && (
                  <div style={{ position: "absolute", top: 4, right: 4, padding: "2px 6px", borderRadius: 3, background: "rgba(94,201,126,0.15)", zIndex: 1 }}>
                    <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--status-success)", fontWeight: 500 }}>Best</span>
                  </div>
                )}
                <div style={{ height: "65%", background: `linear-gradient(135deg, var(--bg-well), var(--bg-deeper))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-gold)", opacity: 0.08 }}>Insturix</span>
                </div>
                <div style={{ padding: "4px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 8, fontWeight: 500, color: "var(--text-primary)" }}>{t.label}</span>
                  <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: t.best ? "var(--status-success)" : "var(--text-dim)" }}>{t.ctr}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — brand palette + tools */}
        <div style={{ width: "28%", borderLeft: "1px solid var(--border-subtle)", padding: "8px", display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>BRAND PALETTE</span>
          <div style={{ display: "flex", gap: 4 }}>
            {palette.map((c, i) => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: c, border: "1px solid var(--border-subtle)" }} />
            ))}
          </div>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em", marginTop: 4 }}>PREDICTED CTR</span>
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <span style={{ fontSize: 24, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--status-success)", letterSpacing: "-0.04em" }}>5.1%</span>
            <span style={{ fontSize: 8, color: "var(--text-dim)", display: "block", marginTop: 2 }}>Variant B</span>
          </div>
          <div style={{ marginTop: "auto", padding: "6px", background: "var(--bg-deeper)", borderRadius: 4, border: "1px solid var(--border-subtle)", textAlign: "center" }}>
            <span style={{ fontSize: 8, color: "var(--accent-gold)", fontWeight: 500 }}>Download selected</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
