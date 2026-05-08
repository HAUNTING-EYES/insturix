"use client";

import React from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

export function MusicMockup() {
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
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>Music</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Generate soundtrack</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left — generator form */}
        <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>COMPOSE</span>

          {/* Mood/genre tags */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["Cinematic", "Upbeat", "Lo-fi", "Electronic"].map((g, i) => (
              <span key={g} style={{
                fontSize: 8, padding: "3px 8px", borderRadius: 4,
                background: i === 0 ? "var(--accent-gold)" : "var(--bg-deeper)",
                color: i === 0 ? "var(--bg-canvas)" : "var(--text-dim)",
                border: i === 0 ? "none" : "1px solid var(--border-subtle)",
                fontWeight: i === 0 ? 500 : 400,
              }}>{g}</span>
            ))}
          </div>

          {/* Prompt */}
          <div style={{
            padding: "6px 10px", background: "var(--bg-deeper)", borderRadius: 4,
            border: "1px solid var(--border-emphasis)", fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.5,
          }}>
            Cinematic orchestral build — starts quiet, swells at 0:08 for product reveal, drops to ambient for CTA
          </div>

          {/* Duration */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 8, color: "var(--text-dim)" }}>Duration</span>
            <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>0:30</span>
          </div>
          <div style={{ height: 3, background: "var(--bg-well)", borderRadius: 2, position: "relative" }}>
            <div style={{ width: "60%", height: "100%", background: "var(--category-pink)", borderRadius: 2 }} />
            <div style={{ position: "absolute", left: "60%", top: -3, width: 8, height: 8, borderRadius: 4, background: "var(--category-pink)", transform: "translateX(-50%)" }} />
          </div>

          {/* Generated track player */}
          <div style={{
            marginTop: "auto", padding: 8, background: "var(--bg-deeper)", borderRadius: 7,
            border: "1px solid var(--border-subtle)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: "var(--text-primary)" }}>Summer Launch — Cinematic</span>
              <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--status-success)" }}>● Ready</span>
            </div>
            {/* Waveform */}
            <div style={{ display: "flex", gap: 1, alignItems: "end", height: 20, marginBottom: 6 }}>
              {Array.from({ length: 40 }).map((_, i) => {
                const h = Math.sin(i * 0.3) * 0.5 + 0.5;
                const active = i < 24;
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h * 100}%`, borderRadius: 1,
                    background: active ? "var(--category-pink)" : "var(--bg-well)",
                    opacity: active ? 0.8 : 0.4,
                  }} />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--category-pink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="6" height="6" viewBox="0 0 24 24" fill="var(--bg-canvas)"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
                </div>
                <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>0:18 / 0:30</span>
              </div>
              <span style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--accent-gold)" }}>Royalty-free</span>
            </div>
          </div>
        </div>

        {/* Right — info panel */}
        <div style={{ width: "30%", borderLeft: "1px solid var(--border-subtle)", padding: 8, display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-canvas)" }}>
          <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", letterSpacing: "0.08em" }}>DETAILS</span>
          {[
            ["Model", "Sonauto V2"],
            ["Genre", "Cinematic"],
            ["BPM", "92"],
            ["Key", "D minor"],
            ["Vocals", "No"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 8, color: "var(--text-dim)" }}>{k}</span>
              <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: "auto", padding: "6px", background: "var(--bg-deeper)", borderRadius: 4, border: "1px solid var(--border-subtle)", textAlign: "center" }}>
            <span style={{ fontSize: 8, color: "var(--accent-gold)", fontWeight: 500 }}>Download MP3</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
