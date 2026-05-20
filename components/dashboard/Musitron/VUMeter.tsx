"use client";

import React, { useEffect, useRef, useState } from "react";

export interface VUMeterProps {
  isPlaying: boolean;
  barCount?: number;
}

export function VUMeter({ isPlaying, barCount = 16 }: VUMeterProps) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 4)
  );
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setHeights(Array.from({ length: barCount }, () => 4));
      return;
    }

    let lastTime = 0;
    const animate = (time: number) => {
      if (!mountedRef.current) return;
      // Throttle to ~15fps for performance
      if (time - lastTime > 66) {
        lastTime = time;
        setHeights(
          Array.from({ length: barCount }, (_, i) => {
            const base = Math.random() * 45 + 8;
            // Hot bars (last 20%) get capped lower for realism
            return i > barCount * 0.8 ? Math.min(base, 35) : base;
          })
        );
      }
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, barCount]);

  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        alignItems: "flex-end",
        height: 60,
        justifyContent: "center",
        marginTop: 16,
      }}
    >
      {heights.map((h, i) => {
        const isHot = i > barCount * 0.8;
        return (
          <div
            key={i}
            style={{
              width: 5,
              borderRadius: 2,
              background: isHot ? "#e8832a" : "#D4A652",
              opacity: isPlaying ? 0.4 + Math.random() * 0.6 : 0.15,
              height: h,
              transition: "height .12s",
            }}
          />
        );
      })}
    </div>
  );
}
