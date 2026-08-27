"use client";

/**
 * Stage iframe bridge — embeds a real engine screen (Clickatron lab, CalOS
 * calendar, Alyzitron report) inside the vibe stage, same-origin, riding
 * the signed-in session. Transitional: like the edit bridge, it forwards to
 * the engine's own surface until the rewrite exposes stage-grade mounts.
 * The manual-control hatch chip stays; the frame IS the engine.
 */

import { useState } from "react";

export function StageIframe({ href, label }: { href: string; label: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">live {label}</span>
        <a className="stu-chip" href={href} style={{ textDecoration: "none" }} target="_blank" rel="noreferrer">
          open full screen ↗
        </a>
      </div>
      <div
        style={{
          position: "relative",
          height: "min(62vh, 640px)",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--raised)",
        }}
      >
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="stu-mlabel">loading {label}</span>
            <span className="stu-pm">
              <i className="stu-ms-run" style={{ background: "var(--muted)" }} />
            </span>
          </div>
        )}
        <iframe
          src={href}
          title={label}
          onLoad={() => setLoaded(true)}
          style={{ width: "100%", height: "100%", border: "none", opacity: loaded ? 1 : 0, transition: "opacity .25s var(--ease)" }}
          referrerPolicy="same-origin"
        />
      </div>
    </>
  );
}
