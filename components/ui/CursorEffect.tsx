"use client";

import { useEffect, useState, CSSProperties } from "react";
import { PLAN_THEME } from "@/lib/themeConfig";

type CursorEffectProps = {
  variant?: "glow" | "invert" | "spotlight";
  size?: number;
  color?: string;
  blur?: number;
  opacity?: number;
  delay?: number;
};

export default function CursorEffect({
  variant = "glow",
  size = PLAN_THEME.glow.size,
  color = PLAN_THEME.glow.color, // Futuristic zinc glow color
  blur = PLAN_THEME.glow.blur,
  opacity = 0.6,
  delay = 0.1,
}: CursorEffectProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateCursorPosition = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", updateCursorPosition);
    return () => window.removeEventListener("mousemove", updateCursorPosition);
  }, []);

  const getEffectStyles = () => {
    const baseStyles: CSSProperties = {
      position: "fixed",
      pointerEvents: "none",
      zIndex: 30,
      transform: `translate(${position.x - size / 2}px, ${
        position.y - size / 2
      }px)`,
transition: `transform 0.05s ease, background-color 0.5s ease`,
      width: `${size}px`,
      height: `${size}px`,
    };

    switch (variant) {
      case "invert":
        return {
          ...baseStyles,
          mixBlendMode: "difference" as const,
          background: "#fff",
          borderRadius: "50%",
          opacity,
        };
      case "spotlight":
        return {
          ...baseStyles,
          background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)`,
          opacity,
        };
      case "glow":
      default:
        return {
          ...baseStyles,
          background: color,
          borderRadius: "50%",
          filter: `blur(${blur}px)`,
          opacity,
          transition: `transform ${delay}s ease, background-color 0.5s ease`,
        };
    }
  };

  return <div style={getEffectStyles()} />;
}
