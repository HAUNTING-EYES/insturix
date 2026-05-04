"use client";

/**
 * Editron (Edit) Interface Mockup
 *
 * Shows the video editor workspace:
 * - Topbar with project name + status
 * - Left: layers panel
 * - Center: video preview with overlays
 * - Right: AI chat
 * - Bottom: timeline with colored tracks
 *
 * Based on the actual Editron editor layout.
 */

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const layers = [
  { name: "Video", color: "var(--status-danger)", active: true },
  { name: "Captions", color: "var(--status-success)", active: true },
  { name: "Music", color: "var(--category-pink)", active: false },
  { name: "Graphics", color: "var(--category-purple)", active: false },
];

const tracks = [
  { label: "V", color: "var(--status-danger)", width: "100%" },
  { label: "C", color: "var(--status-success)", width: "85%" },
  { label: "M", color: "var(--category-pink)", width: "70%" },
  { label: "G", color: "var(--category-purple)", width: "45%" },
];

const chatMsgs = [
  { role: "ai" as const, text: "Video ready. Score 91/100. Captions synced to voiceover." },
  { role: "ai" as const, text: "Cuts locked to beat drops at 0:08 and 0:22." },
];

export function EditMockup() {
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
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Edit</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Q1 Product Launch</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--status-success)" }}>● Saved</span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>0:30</span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Layers panel */}
        <div style={{
          width: "18%", borderRight: "1px solid var(--border-subtle)", padding: "8px 6px",
          display: "flex", flexDirection: "column", gap: 3, background: "var(--bg-canvas)",
        }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em", padding: "0 4px", marginBottom: 4 }}>
            LAYERS
          </span>
          {layers.map((l) => (
            <div key={l.name} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4,
              background: l.active ? "var(--bg-deeper)" : "transparent",
            }}>
              <div style={{ width: 3, height: 12, borderRadius: 1.5, background: l.color, opacity: l.active ? 1 : 0.3 }} />
              <span style={{ fontSize: 9, color: l.active ? "var(--text-primary)" : "var(--text-dim)" }}>{l.name}</span>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div style={{ flex: 1, background: "#060605", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {/* Video preview area */}
          <div style={{
            width: "82%", aspectRatio: "16/9", borderRadius: 6, position: "relative", overflow: "hidden",
            background: "linear-gradient(135deg, rgb(18,16,14), rgb(24,20,16))",
          }}>
            {/* Brand overlay */}
            <div style={{ position: "absolute", top: 8, left: 10, padding: "3px 8px", background: "rgba(0,0,0,0.6)", borderRadius: 4 }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: "#fff" }}>Insturix</span>
            </div>
            {/* Caption overlay */}
            <div style={{ position: "absolute", bottom: 24, left: 10, right: 10 }}>
              <div style={{ padding: "4px 8px", background: "rgba(0,0,0,0.6)", borderRadius: 4, display: "inline-block" }}>
                <span style={{ fontSize: 8, color: "#fff", fontWeight: 500 }}>
                  What if one product changed <span style={{ color: "var(--accent-gold)" }}>everything</span>?
                </span>
              </div>
            </div>
            {/* Play button */}
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="var(--text-primary)"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Chat panel */}
        <div style={{
          width: "24%", borderLeft: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column",
          background: "var(--bg-canvas)",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: "var(--status-success)" }} />
            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-primary)" }}>AI Director</span>
          </div>
          <div style={{ flex: 1, padding: 6, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
            {chatMsgs.map((m, i) => (
              <div key={i} style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 8, lineHeight: 1.5,
                background: "var(--bg-raised)", border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}>
                {m.text}
              </div>
            ))}
          </div>
          <div style={{ padding: 6, borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{
              display: "flex", background: "var(--bg-deeper)", border: "1px solid var(--border-emphasis)",
              borderRadius: 4, padding: "3px 3px 3px 8px", alignItems: "center",
            }}>
              <span style={{ flex: 1, fontSize: 8, color: "var(--text-faint)" }}>Ask anything...</span>
              <div style={{ width: 16, height: 16, borderRadius: 3, background: "var(--bg-well)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none"><path d="M12 19V5m0 0l-7 7m7-7l7 7" stroke="var(--text-dim)" strokeWidth="2.5" strokeLinecap="round" /></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div style={{
        height: 48, borderTop: "1px solid var(--border-subtle)", background: "var(--bg-deeper)",
        display: "flex", flexDirection: "column", padding: "4px 8px", gap: 2, flexShrink: 0,
      }}>
        {tracks.map((t) => (
          <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6, height: 8 }}>
            <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--text-dim)", width: 10, textAlign: "right" }}>{t.label}</span>
            <div style={{ flex: 1, height: "100%", background: "var(--bg-well)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 1, bottom: 1, width: t.width, background: `color-mix(in srgb, ${t.color} 25%, transparent)`, border: `1px solid color-mix(in srgb, ${t.color} 35%, transparent)`, borderRadius: 2 }} />
            </div>
          </div>
        ))}
        {/* Playhead */}
        <div style={{ position: "relative", height: 0 }}>
          <div style={{ position: "absolute", left: "62%", top: -34, width: 1.5, height: 34, background: "var(--accent-gold)", borderRadius: 1 }}>
            <div style={{ position: "absolute", top: -2, left: -2.5, width: 6, height: 6, borderRadius: 3, background: "var(--accent-gold)" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
