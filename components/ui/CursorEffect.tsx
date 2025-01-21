"use client";

import { useEffect, useState, CSSProperties } from "react";

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
    size = 400,
    color = "rgba(59, 130, 246, 0.2)", // blue-500 with opacity
    blur = 100,
    opacity = 0.5,
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
            zIndex: 100,
            transform: `translate(${position.x - size / 2}px, ${position.y - size / 2}px)`,
            transition: `transform ${delay}s ease`,
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
                };
        }
    };

    return <div style={getEffectStyles()} />;
}
