"use client";

import { cn } from "@/lib/utils";
import React, { useMemo } from "react";

type Props = {
  items: Array<string | React.ReactNode>;
  className?: string;
  speed?: number; // pixels per second
  pauseOnHover?: boolean;
  separator?: React.ReactNode | string;
};

export default function Marquee({ items, className, speed = 80, pauseOnHover = true, separator = "•" }: Props) {
  const content = useMemo(() => {
    const sep = (
      <span className="mx-6 text-white/40" aria-hidden>
        {separator}
      </span>
    );
    return (
      <div className="flex items-center whitespace-nowrap text-base md:text-lg font-medium tracking-wide">
        {items.map((it, i) => (
          <span key={`m-${i}`} className="inline-flex items-center">
            {typeof it === "string" ? <span>{it}</span> : it}
            {i !== items.length - 1 ? sep : null}
          </span>
        ))}
      </div>
    );
  }, [items, separator]);

  // Duration based on container width and speed
  const duration = useMemo(() => {
    // Fallback reasonable duration, actual CSS animation will be linear and seamless
    return Math.max(12, Math.min(40, Math.round(2200 / speed)));
  }, [speed]);

  return (
    <div
      className={cn(
        "relative overflow-hidden select-none",
        "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]",
        className
      )}
    >
      <div
        className={cn(
          "flex w-max gap-12 will-change-transform",
          "animate-[marquee_var(--dur)_linear_infinite]",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
        style={{ ["--dur" as unknown as string]: `${duration}s` } as React.CSSProperties}
      >
        {/* Duplicate content for seamless loop */}
        <div className="flex items-center pr-12">{content}</div>
        <div className="flex items-center pr-12" aria-hidden>
          {content}
        </div>
      </div>
      <style jsx>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
