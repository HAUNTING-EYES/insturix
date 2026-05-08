"use client";

/**
 * Socialize (Share) Interface Mockup
 *
 * Shows the link-in-bio editor:
 * - Left: editor panel (banner, bio, links list)
 * - Right: live mobile preview of the profile page
 *
 * Based on actual Socialize dashboard structure.
 */

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const links = [
  { platform: "YouTube", url: "youtube.com/@brand", color: "#FF0000" },
  { platform: "Instagram", url: "instagram.com/@brand", color: "#E1306C" },
  { platform: "TikTok", url: "tiktok.com/@brand", color: "#ECE9E1" },
  { platform: "Website", url: "brand.com", color: "var(--accent-gold)" },
  { platform: "Discord", url: "discord.gg/brand", color: "#5865F2" },
];

export function SocializeMockup() {
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
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Share</span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Profile editor</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, background: "var(--bg-well)", color: "var(--text-dim)" }}>Preview</span>
          <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 4, background: "var(--accent-gold)", color: "var(--bg-canvas)", fontWeight: 500 }}>Publish</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left — editor */}
        <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)", overflow: "hidden" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>PROFILE</span>

          {/* Banner preview */}
          <div style={{
            height: 32, borderRadius: 6, background: "linear-gradient(135deg, var(--category-purple), var(--category-cyan))",
            opacity: 0.6,
          }} />

          {/* Bio */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--bg-well)", border: "1px solid var(--border-emphasis)", flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-primary)", display: "block" }}>@yourbrand</span>
              <span style={{ fontSize: 7, color: "var(--text-dim)" }}>Creator · Designer · Filmmaker</span>
            </div>
          </div>

          {/* Links list */}
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em", marginTop: 4 }}>LINKS · {links.length}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {links.map((l) => (
              <div key={l.platform} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                background: "var(--bg-raised)", borderRadius: 4, border: "1px solid var(--border-subtle)",
              }}>
                <div style={{ width: 5, height: 5, borderRadius: 3, background: l.color, opacity: 0.7 }} />
                <span style={{ fontSize: 8, color: "var(--text-primary)", flex: 1 }}>{l.platform}</span>
                <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{l.url}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", display: "flex", gap: 4 }}>
            <div style={{ flex: 1, padding: "4px", background: "var(--bg-deeper)", borderRadius: 4, border: "1px solid var(--border-subtle)", textAlign: "center" }}>
              <span style={{ fontSize: 8, color: "var(--text-dim)" }}>+ Add link</span>
            </div>
          </div>
        </div>

        {/* Right — mobile preview */}
        <div style={{
          width: "38%", borderLeft: "1px solid var(--border-subtle)", padding: 12,
          display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deeper)",
        }}>
          {/* Phone frame */}
          <div style={{
            width: "85%", maxWidth: 140, aspectRatio: "9/16", background: "var(--bg-canvas)",
            borderRadius: 12, border: "2px solid var(--border-emphasis)", overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}>
            {/* Banner */}
            <div style={{ height: 36, background: "linear-gradient(135deg, var(--category-purple), var(--category-cyan))", opacity: 0.5 }} />
            {/* Avatar + name */}
            <div style={{ textAlign: "center", marginTop: -10, position: "relative", zIndex: 1 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", background: "var(--bg-well)",
                border: "2px solid var(--bg-canvas)", margin: "0 auto",
              }} />
              <span style={{ fontSize: 7, fontWeight: 500, color: "var(--text-primary)", display: "block", marginTop: 3 }}>@yourbrand</span>
              <span style={{ fontSize: 6, color: "var(--text-dim)" }}>Creator · Designer</span>
            </div>
            {/* Link cards */}
            <div style={{ padding: "6px 6px", display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
              {links.slice(0, 4).map((l) => (
                <div key={l.platform} style={{
                  padding: "4px 6px", borderRadius: 4, background: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 4,
                }}>
                  <div style={{ width: 4, height: 4, borderRadius: 2, background: l.color, opacity: 0.7 }} />
                  <span style={{ fontSize: 6, color: "var(--text-secondary)" }}>{l.platform}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
