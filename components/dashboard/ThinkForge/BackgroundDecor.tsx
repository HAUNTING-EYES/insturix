"use client";
import React from "react";

export const BackgroundDecor = () => {
  return (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    {/* Subtle radial glow — warm gold */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,166,82,0.04),transparent_55%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(212,166,82,0.03),transparent_60%)]" />
    {/* Top / bottom vignette */}
    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#0B0B0A,transparent_30%,transparent_70%,#0B0B0A)]" />
    {/* Noise texture */}
    <div
      className="absolute inset-0 opacity-30 mix-blend-soft-light"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/></filter><rect width='400' height='400' filter='url(%23n)' opacity='0.4'/></svg>")`,
        backgroundSize: "300px 300px"
      }}
    />
  </div>
  );
};
