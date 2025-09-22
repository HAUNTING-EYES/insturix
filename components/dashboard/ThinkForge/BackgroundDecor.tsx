"use client";
import React from "react";
import { Brain, BrainCircuit, Sparkles, Lightbulb, Atom } from "lucide-react";

interface FloatingIcon {
  id: string;
  Icon: React.ComponentType<any>;
  size: number;
  top: string;
  left: string;
  rotate: string;
  opacity: number;
  blur: number;
}

export const BackgroundDecor = () => {
  // Curated deterministic layout for subtle ambient icons (no randomness each render)
  const icons: FloatingIcon[] = [
    {
      id: "icon-brain",
      Icon: Brain,
      size: 84,
      top: "8%",
      left: "12%",
      rotate: "rotate(-8deg)",
      opacity: 0.05,
      blur: 1.5
    },
    {
      id: "icon-brain-circuit",
      Icon: BrainCircuit,
      size: 72,
      top: "18%",
      left: "75%",
      rotate: "rotate(10deg)",
      opacity: 0.055,
      blur: 1.5
    },
    {
      id: "icon-atom",
      Icon: Atom,
      size: 90,
      top: "42%",
      left: "7%",
      rotate: "rotate(18deg)",
      opacity: 0.035,
      blur: 2
    },
    {
      id: "icon-brain-small",
      Icon: Brain,
      size: 50,
      top: "44%",
      left: "88%",
      rotate: "rotate(-22deg)",
      opacity: 0.04,
      blur: 2
    },
    {
      id: "icon-lightbulb",
      Icon: Lightbulb,
      size: 64,
      top: "70%",
      left: "18%",
      rotate: "rotate(6deg)",
      opacity: 0.045,
      blur: 1
    },
    {
      id: "icon-sparkles",
      Icon: Sparkles,
      size: 56,
      top: "66%",
      left: "82%",
      rotate: "rotate(-15deg)",
      opacity: 0.05,
      blur: 1.5
    }
  ];

  return (
  <div aria-hidden className="pointer-events-none absolute inset-0">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.0001),transparent_60%)]" />
    <div
      className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
      style={{
        backgroundImage:
          "linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.05)_1px,transparent_1px)",
        backgroundSize: "60px 60px"
      }}
    />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(139,0,0,0.1),transparent_55%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(139,0,0,0.25),transparent_60%)]" />
    <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#000000,transparent_40%,#000000_90%)]" />
    <div
      className="absolute inset-0 opacity-40 mix-blend-soft-light"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/></filter><rect width='400' height='400' filter='url(%23n)' opacity='0.4'/></svg>")`,
        backgroundSize: "300px 300px"
      }}
    />
  {icons.map(({ id, Icon, size, top, left, rotate, opacity, blur }) => (
      <div
        key={id}
        style={{ top, left, transform: rotate, opacity, filter: `blur(${blur}px)` }}
        className="absolute text-white"
      >
        <Icon style={{ width: size, height: size }} strokeWidth={1} />
      </div>
    ))}
  </div>
  );
};
