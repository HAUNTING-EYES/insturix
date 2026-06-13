"use client";

/**
 * Script Interface Mockup
 *
 * A built HTML replica of the scripting workspace.
 * Shows the split-pane view: AI chat left, script editor right.
 *
 * This is NOT a functional tool — it's a visual representation
 * that animates on scroll to show the tool in action.
 *
 * Based on the script planning workspace structure:
 * - ChatPanel (left): message history + suggestion pills + input
 * - ScriptPanel (right): document tabs + toolbar + rich text editor
 * - Resize divider between panels
 *
 * RAMS: Every element represents a real UI component. Nothing decorative.
 * JOBS: Agency owner sees this and thinks "I can see myself working in this."
 * IVE: The mockup IS the feature explanation. No bullet points needed.
 */

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

// ─── Mock data that tells a story ────────────────────────────────
const chatMessages = [
  {
    role: "user" as const,
    text: "Write a 30-second product launch script for a premium coffee brand",
  },
  {
    role: "ai" as const,
    text: "I'll write a hook-first script with three acts. The hook grabs in the first 3 seconds, the body builds desire through sensory language, and the CTA drives to purchase.",
  },
  {
    role: "ai" as const,
    text: "Draft ready — 3 acts, 10 lines, 28 seconds. The hook opens on a close-up pour with \"Every morning deserves this.\" Want me to adjust the tone or pacing?",
  },
];

const scriptContent = {
  title: "Premium Coffee — Launch Script",
  acts: [
    {
      label: "HOOK · 0–3s",
      lines: [
        "OPEN on extreme close-up: espresso pouring into ceramic cup.",
        "VO: \"Every morning deserves this.\"",
      ],
    },
    {
      label: "BODY · 3–22s",
      lines: [
        "WIDE: Hands cupping the mug. Steam rising. Golden light.",
        "VO: \"Single-origin. Hand-roasted. Delivered to your door.\"",
        "CUT TO: Bean close-up. Roasting process. Packaging.",
        "SUPER: \"From Bogotá to your kitchen in 72 hours.\"",
      ],
    },
    {
      label: "CTA · 22–30s",
      lines: [
        "LOGO reveal with pour sound.",
        "VO: \"Start your ritual. First bag free.\"",
        "END CARD: URL + QR code + promo.",
      ],
    },
  ],
};

const suggestions = [
  "Make the hook punchier",
  "Add B-roll notes",
  "Shorten to 15s",
];

// ═══════════════════════════════════════════════════════════════
// MOCKUP
// ═══════════════════════════════════════════════════════════════

export function ScriptMockup() {
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
        // Realistic aspect ratio for a workspace
        aspectRatio: "16/10",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          background: "var(--bg-deeper)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["var(--status-danger)", "var(--accent-gold)", "var(--status-success)"].map((c, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.4 }} />
            ))}
          </div>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", marginLeft: 8 }}>
            Script
          </span>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Premium Coffee — Launch Script
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--status-success)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L19 7" stroke="var(--status-success)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Saved
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--text-faint)",
            }}
          >
            0:28
          </span>
        </div>
      </div>

      {/* Split pane */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT — Chat */}
        <div
          style={{
            width: "38%",
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-canvas)",
          }}
        >
          {/* Chat header */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 3, background: "var(--status-success)" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)" }}>AI Writer</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  padding: "6px 10px",
                  borderRadius: msg.role === "user" ? "8px 8px 2px 8px" : "2px 8px 8px 8px",
                  background: msg.role === "user" ? "var(--accent-gold)" : "var(--bg-raised)",
                  color: msg.role === "user" ? "var(--bg-canvas)" : "var(--text-secondary)",
                  fontSize: 10,
                  lineHeight: 1.5,
                  border: msg.role === "ai" ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                {msg.text}
              </div>
            ))}
          </div>

          {/* Suggestion pills */}
          <div style={{ padding: "4px 8px", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {suggestions.map((s, i) => (
              <span
                key={i}
                style={{
                  fontSize: 9,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--border-emphasis)",
                  color: "var(--text-dim)",
                  whiteSpace: "nowrap",
                }}
              >
                {s}
              </span>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: 8, borderTop: "1px solid var(--border-subtle)" }}>
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-deeper)",
                border: "1px solid var(--border-emphasis)",
                borderRadius: 7,
                padding: "4px 4px 4px 10px",
                alignItems: "center",
              }}
            >
              <span style={{ flex: 1, fontSize: 10, color: "var(--text-faint)" }}>
                Refine the script...
              </span>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: "var(--bg-well)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5m0 0l-7 7m7-7l7 7" stroke="var(--text-dim)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div style={{ width: 3, background: "var(--border-subtle)", cursor: "col-resize", flexShrink: 0 }} />

        {/* RIGHT — Script editor */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-canvas)",
          }}
        >
          {/* Document tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid var(--border-subtle)",
              padding: "0 8px",
              gap: 0,
            }}
          >
            <div
              style={{
                padding: "6px 12px",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-primary)",
                borderBottom: "2px solid var(--accent-gold)",
              }}
            >
              Launch Script v1
            </div>
            <div
              style={{
                padding: "6px 12px",
                fontSize: 10,
                color: "var(--text-dim)",
              }}
            >
              Outline
            </div>
            <div
              style={{
                marginLeft: "auto",
                fontSize: 10,
                color: "var(--text-faint)",
                padding: "6px 8px",
              }}
            >
              +
            </div>
          </div>

          {/* Script content */}
          <div style={{ flex: 1, padding: "12px 16px", overflow: "hidden" }}>
            {/* Title */}
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                {scriptContent.title}
              </span>
            </div>

            {/* Acts */}
            {scriptContent.acts.map((act, ai) => (
              <div key={ai} style={{ marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color: "var(--accent-gold)",
                    letterSpacing: "0.08em",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {act.label}
                </span>
                {act.lines.map((line, li) => (
                  <div
                    key={li}
                    style={{
                      fontSize: 10,
                      color: line.startsWith("VO:") || line.startsWith("SUPER:")
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      fontStyle: line.startsWith("VO:") ? "normal" : "normal",
                      fontWeight: line.startsWith("VO:") || line.startsWith("SUPER:") ? 500 : 400,
                      lineHeight: 1.6,
                      paddingLeft: 8,
                      borderLeft: line.startsWith("VO:") || line.startsWith("SUPER:")
                        ? "2px solid var(--accent-gold)"
                        : "2px solid var(--border-subtle)",
                      marginBottom: 3,
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            ))}

            {/* Cursor */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div
                style={{
                  width: 2,
                  height: 12,
                  background: "var(--accent-gold)",
                  borderRadius: 1,
                  animation: "blink 0.8s step-end infinite",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
